/**
 * TmindAmbientSound —— 本地白噪音 / 环境音播放引擎
 * 100% 离线可用，零外部依赖，使用 Web Audio API 现场合成。
 *
 * 内置音效：
 *   0. 静音（关闭）
 *   1. 深空静谧 —— 粉红噪音 + 低频轰鸣（40~80Hz）
 *   2. 林间细雨 —— 白噪音高频 + 随机滴答颗粒
 *   3. 冥想潮汐 —— 棕色噪音 + 缓慢周期性低通滤波调制（潮起潮落）
 *
 * 状态联动：
 *   - 计时器 start/resume → 自动播放上次选择
 *   - 计时器 pause/abandon/end → 淡出停止，恢复绝对安静
 */
(function (global) {
    'use strict';

    var AmbientSound = {};

    var audioCtx = null;
    var masterGain = null;
    var activeNodes = [];
    var currentMode = 0; // 0 = 静音
    var isPlaying = false;
    var fadeRafId = null;

    // 音效档位定义
    var PRESETS = [
        { id: 0, name: '静音', icon: 'mute' },
        { id: 1, name: '深空静谧', icon: 'speaker' },
        { id: 2, name: '林间细雨', icon: 'speaker' },
        { id: 3, name: '冥想潮汐', icon: 'speaker' }
    ];

    var STORAGE_KEY = 'timind_ambient_mode';

    function ensureContext() {
        if (audioCtx) return audioCtx;
        try {
            var Ctx = global.AudioContext || global.webkitAudioContext;
            if (!Ctx) return null;
            audioCtx = new Ctx();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0;
            masterGain.connect(audioCtx.destination);
        } catch (e) {
            console.warn('[AmbientSound] AudioContext init error:', e);
            return null;
        }
        return audioCtx;
    }

    function loadSavedMode() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved !== null) {
                var n = parseInt(saved, 10);
                if (!isNaN(n) && n >= 0 && n < PRESETS.length) {
                    currentMode = n;
                }
            }
        } catch (e) {}
        return currentMode;
    }

    function saveMode(mode) {
        try {
            localStorage.setItem(STORAGE_KEY, String(mode));
        } catch (e) {}
    }

    // === 噪音源生成器 ===

    // 生成指定长度的噪音 Buffer（type: 'white' | 'pink' | 'brown'）
    function createNoiseBuffer(type, seconds) {
        var ctx = audioCtx;
        var length = ctx.sampleRate * seconds;
        var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        var data = buffer.getChannelData(0);

        if (type === 'white') {
            for (var i = 0; i < length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        } else if (type === 'pink') {
            // Paul Kellet 算法
            var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (var j = 0; j < length; j++) {
                var white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[j] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            }
        } else if (type === 'brown') {
            var last = 0;
            for (var k = 0; k < length; k++) {
                var w = Math.random() * 2 - 1;
                last = (last + 0.02 * w) / 1.02;
                data[k] = last * 3.5;
            }
        }
        return buffer;
    }

    function createNoiseSource(buffer) {
        var src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        return src;
    }

    // === 各音效合成方案 ===

    // 深空静谧：粉红噪音 + 低频轰鸣振荡器
    function buildDeepSpace() {
        var nodes = [];

        // 主体：粉红噪音
        var pinkBuf = createNoiseBuffer('pink', 4);
        var pinkSrc = createNoiseSource(pinkBuf);
        var pinkGain = audioCtx.createGain();
        pinkGain.gain.value = 0.45;
        pinkSrc.connect(pinkGain).connect(masterGain);
        pinkSrc.start();
        nodes.push(pinkSrc, pinkGain);

        // 低频轰鸣：40~80Hz 振荡器
        var osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 55;
        var oscGain = audioCtx.createGain();
        oscGain.gain.value = 0.12;
        // 缓慢频率漂移，营造深空呼吸感
        var lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08;
        var lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 8;
        lfo.connect(lfoGain).connect(osc.frequency);
        osc.connect(oscGain).connect(masterGain);
        osc.start();
        lfo.start();
        nodes.push(osc, oscGain, lfo, lfoGain);

        return nodes;
    }

    // 林间细雨：白噪音高频 + 随机滴答颗粒
    function buildRain() {
        var nodes = [];

        // 主体：白噪音经高通滤波，模拟雨声背景
        var whiteBuf = createNoiseBuffer('white', 4);
        var whiteSrc = createNoiseSource(whiteBuf);
        var hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1200;
        var rainGain = audioCtx.createGain();
        rainGain.gain.value = 0.35;
        whiteSrc.connect(hp).connect(rainGain).connect(masterGain);
        whiteSrc.start();
        nodes.push(whiteSrc, hp, rainGain);

        // 随机滴答颗粒调度器
        var tickInterval = setInterval(function () {
            if (!isPlaying || !audioCtx) return;
            try {
                var tick = audioCtx.createOscillator();
                tick.type = 'sine';
                tick.frequency.value = 2000 + Math.random() * 3000;
                var tickGain = audioCtx.createGain();
                tickGain.gain.value = 0;
                tick.connect(tickGain).connect(masterGain);
                tick.start();
                var now = audioCtx.currentTime;
                tickGain.gain.setValueAtTime(0, now);
                tickGain.gain.linearRampToValueAtTime(0.08, now + 0.005);
                tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                tick.stop(now + 0.1);
            } catch (e) {}
        }, 180);
        nodes.push({ _interval: tickInterval });

        return nodes;
    }

    // 冥想潮汐：棕色噪音 + 缓慢周期性低通滤波调制
    function buildTide() {
        var nodes = [];

        // 主体：棕色噪音
        var brownBuf = createNoiseBuffer('brown', 4);
        var brownSrc = createNoiseSource(brownBuf);
        var brownGain = audioCtx.createGain();
        brownGain.gain.value = 0.55;
        brownSrc.connect(brownGain);
        brownSrc.start();
        nodes.push(brownSrc, brownGain);

        // 低通滤波器，截止频率周期性变化，模拟潮起潮落
        var lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 400;
        lp.Q.value = 1.2;
        brownGain.connect(lp).connect(masterGain);
        nodes.push(lp);

        // LFO 调制低通截止频率：300~900Hz 缓慢循环
        var lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.06; // 约 16 秒一个潮汐周期
        var lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 300;
        lfo.connect(lfoGain).connect(lp.frequency);
        lfo.start();
        nodes.push(lfo, lfoGain);

        return nodes;
    }

    function clearActiveNodes() {
        for (var i = 0; i < activeNodes.length; i++) {
            var node = activeNodes[i];
            try {
                if (node._interval) {
                    clearInterval(node._interval);
                } else if (node.stop) {
                    node.stop();
                } else if (node.disconnect) {
                    node.disconnect();
                }
            } catch (e) {}
        }
        activeNodes = [];
    }

    function buildPreset(mode) {
        clearActiveNodes();
        if (mode === 1) {
            activeNodes = buildDeepSpace();
        } else if (mode === 2) {
            activeNodes = buildRain();
        } else if (mode === 3) {
            activeNodes = buildTide();
        }
    }

    // === 淡入 / 淡出控制 ===

    function cancelFade() {
        if (fadeRafId) {
            cancelAnimationFrame(fadeRafId);
            fadeRafId = null;
        }
    }

    function fadeTo(target, durationMs, done) {
        if (!audioCtx || !masterGain) {
            if (done) done();
            return;
        }
        cancelFade();
        var startVal = masterGain.gain.value;
        var startTime = performance.now();

        function step() {
            if (!audioCtx || !masterGain) {
                fadeRafId = null;
                if (done) done();
                return;
            }
            var now = performance.now();
            var t = Math.min(1, (now - startTime) / durationMs);
            var val = startVal + (target - startVal) * t;
            masterGain.gain.value = val;
            if (t < 1) {
                fadeRafId = requestAnimationFrame(step);
            } else {
                fadeRafId = null;
                if (done) done();
            }
        }
        fadeRafId = requestAnimationFrame(step);
    }

    // === 对外 API ===

    /**
     * 初始化（在用户首次交互后调用以解锁 AudioContext）
     */
    AmbientSound.init = function () {
        ensureContext();
        loadSavedMode();
    };

    /**
     * 解锁 AudioContext（解决浏览器 Autoplay Policy）
     */
    AmbientSound.unlock = function () {
        var ctx = ensureContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(function () {});
        }
    };

    /**
     * 开始播放（淡入）
     */
    AmbientSound.start = function () {
        var ctx = ensureContext();
        if (!ctx) return;
        AmbientSound.unlock();
        loadSavedMode();
        if (currentMode === 0) {
            // 上次选了静音，则不播放
            masterGain.gain.value = 0;
            isPlaying = false;
            AmbientSound.notifyUI();
            return;
        }
        buildPreset(currentMode);
        isPlaying = true;
        fadeTo(0.18, 1200);
        AmbientSound.notifyUI();
    };

    /**
     * 停止播放（淡出后释放资源）
     */
    AmbientSound.stop = function () {
        if (!audioCtx) return;
        isPlaying = false;
        fadeTo(0, 600, function () {
            clearActiveNodes();
        });
        AmbientSound.notifyUI();
    };

    /**
     * 循环切换到下一个音效档位（供点击胶囊组件使用）
     * 0→1→2→3→0
     */
    AmbientSound.cycle = function () {
        var next = (currentMode + 1) % PRESETS.length;
        AmbientSound.setMode(next);
    };

    /**
     * 直接设置某个档位
     */
    AmbientSound.setMode = function (mode) {
        if (mode < 0 || mode >= PRESETS.length) return;
        currentMode = mode;
        saveMode(mode);

        if (!audioCtx) {
            ensureContext();
        }
        if (!audioCtx) return;

        AmbientSound.unlock();

        if (mode === 0) {
            // 切到静音：淡出停止
            isPlaying = false;
            fadeTo(0, 400, function () {
                clearActiveNodes();
            });
            AmbientSound.notifyUI();
            return;
        }

        // 切到具体音效：先淡出旧，再淡入新
        var wasPlaying = isPlaying;
        isPlaying = true;
        if (wasPlaying) {
            fadeTo(0, 250, function () {
                buildPreset(mode);
                fadeTo(0.18, 600);
            });
        } else {
            buildPreset(mode);
            fadeTo(0.18, 800);
        }
        AmbientSound.notifyUI();
    };

    /**
     * 获取当前档位信息
     */
    AmbientSound.getCurrent = function () {
        var p = PRESETS[currentMode] || PRESETS[0];
        return {
            mode: currentMode,
            name: p.name,
            icon: p.icon,
            isPlaying: isPlaying
        };
    };

    /**
     * 通知 UI 更新（标签、图标、激活态）
     */
    AmbientSound.notifyUI = function () {
        var info = AmbientSound.getCurrent();
        var labelEl = document.getElementById('ambientLabel');
        var barEl = document.getElementById('ambientSoundBar');
        var iconEl = document.getElementById('ambientIcon');
        if (labelEl) labelEl.textContent = info.name;
        if (barEl) {
            if (info.mode === 0) {
                barEl.classList.remove('active');
            } else {
                barEl.classList.add('active');
            }
        }
        // 切换图标：静音显示带叉喇叭，否则显示声波喇叭
        if (iconEl) {
            if (info.mode === 0) {
                iconEl.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
            } else {
                iconEl.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
            }
        }
    };

    /**
     * 绑定胶囊组件点击事件
     */
    AmbientSound.bind = function () {
        var bar = document.getElementById('ambientSoundBar');
        if (!bar) return;
        bar.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            AmbientSound.unlock();
            AmbientSound.cycle();
        });
        bar.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                AmbientSound.unlock();
                AmbientSound.cycle();
            }
        });
    };

    global.TmindAmbientSound = AmbientSound;

})(window);
