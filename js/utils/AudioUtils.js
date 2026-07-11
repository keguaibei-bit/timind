(function (global) {
    'use strict';

    /**
     * TmindAudio —— 音效控制器
     * 处理浏览器 Autoplay Policy：在用户首次交互时激活 AudioContext
     * 使用 Web Audio API 合成提示音，无需依赖本地音频文件
     */
    var TmindAudio = {};

    var audioCtx = null;
    var unlocked = false;

    // 音效开关（受设置控制）
    var enabled = true;

    // 预定义音色（用 oscillator 合成，避免外部音频文件依赖）
    var SOUND_PRESETS = {
        complete: {
            // 完成音：上行三音 C5-E5-G5
            notes: [523.25, 659.25, 783.99],
            duration: 0.18,
            gap: 0.08,
            type: 'sine',
            volume: 0.18
        },
        breakStart: {
            // 休息开始：柔和下行 G4-E4-C4
            notes: [392.00, 329.63, 261.63],
            duration: 0.22,
            gap: 0.10,
            type: 'sine',
            volume: 0.16
        },
        breakEnd: {
            // 休息结束：短促双音
            notes: [659.25, 880.00],
            duration: 0.14,
            gap: 0.10,
            type: 'triangle',
            volume: 0.16
        },
        levelup: {
            // 升级音：明亮上行琶音
            notes: [523.25, 659.25, 783.99, 1046.50],
            duration: 0.16,
            gap: 0.07,
            type: 'sine',
            volume: 0.20
        },
        click: {
            // 点击音：单短音
            notes: [880.00],
            duration: 0.06,
            gap: 0,
            type: 'square',
            volume: 0.08
        },
        tick: {
            // 倒计时滴答音
            notes: [1000.00],
            duration: 0.03,
            gap: 0,
            type: 'square',
            volume: 0.04
        }
    };

    /**
     * 检测 AudioContext 是否支持
     */
    TmindAudio.isSupported = function () {
        return typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined';
    };

    /**
     * 初始化 AudioContext（必须在用户交互内调用，解决 Autoplay Policy）
     * 应在「开始专注」按钮的点击事件中调用
     */
    TmindAudio.unlock = function () {
        if (unlocked && audioCtx) {
            // 已解锁，但确保状态恢复（部分浏览器在标签切换后可能 suspend）
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(function () {});
            }
            return true;
        }

        if (!TmindAudio.isSupported()) {
            console.warn('[TmindAudio] AudioContext 不支持');
            return false;
        }

        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AC();
            unlocked = true;

            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(function (err) {
                    console.warn('[TmindAudio] resume error:', err);
                });
            }

            // 播放一个无声的占位音以彻底解锁
            try {
                var buffer = audioCtx.createBuffer(1, 1, 22050);
                var source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);
                source.start(0);
            } catch (e) {}

            return true;
        } catch (e) {
            console.error('[TmindAudio] unlock error:', e);
            return false;
        }
    };

    /**
     * 检测是否已解锁音频
     */
    TmindAudio.isUnlocked = function () {
        return unlocked && audioCtx && audioCtx.state === 'running';
    };

    /**
     * 启用/禁用音效（受设置控制）
     */
    TmindAudio.setEnabled = function (on) {
        enabled = !!on;
    };

    TmindAudio.isEnabled = function () {
        return enabled;
    };

    /**
     * 播放单音
     * @param {Number} freq 频率 Hz
     * @param {Number} duration 持续时间 秒
     * @param {String} type oscillator 类型：sine/square/triangle/sawtooth
     * @param {Number} volume 0-1
     * @param {Number} startOffset 开始偏移 秒
     */
    function playNote(freq, duration, type, volume, startOffset) {
        if (!audioCtx) return;
        type = type || 'sine';
        volume = typeof volume === 'number' ? volume : 0.15;
        startOffset = startOffset || 0;

        var now = audioCtx.currentTime + startOffset;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.value = freq;

        // ADSR 包络：避免爆音
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(volume * 0.6, now + duration * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + duration + 0.05);
    }

    /**
     * 播放预设音效
     * @param {String} presetName SOUND_PRESETS 的 key
     * @returns {Boolean} 是否成功播放
     */
    TmindAudio.play = function (presetName) {
        if (!enabled) return false;
        if (!audioCtx || !unlocked) {
            // 尝试自动解锁（部分场景下可能已具备用户交互上下文）
            TmindAudio.unlock();
            if (!audioCtx) return false;
        }

        var preset = SOUND_PRESETS[presetName];
        if (!preset) {
            console.warn('[TmindAudio] 未知音效预设:', presetName);
            return false;
        }

        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(function () {});
        }

        var offset = 0;
        for (var i = 0; i < preset.notes.length; i++) {
            playNote(
                preset.notes[i],
                preset.duration,
                preset.type,
                preset.volume,
                offset
            );
            offset += preset.duration + preset.gap;
        }

        return true;
    };

    /**
     * 播放自定义频率序列
     * @param {Number[]} freqs 频率数组
     * @param {Object} options { duration, gap, type, volume }
     */
    TmindAudio.playSequence = function (freqs, options) {
        if (!enabled) return false;
        if (!audioCtx || !unlocked) {
            TmindAudio.unlock();
            if (!audioCtx) return false;
        }
        options = options || {};
        var duration = options.duration || 0.15;
        var gap = options.gap || 0.08;
        var type = options.type || 'sine';
        var volume = options.volume || 0.15;

        var offset = 0;
        for (var i = 0; i < freqs.length; i++) {
            playNote(freqs[i], duration, type, volume, offset);
            offset += duration + gap;
        }
        return true;
    };

    // 预设场景快捷方法

    TmindAudio.playComplete = function () {
        return TmindAudio.play('complete');
    };

    TmindAudio.playBreakStart = function () {
        return TmindAudio.play('breakStart');
    };

    TmindAudio.playBreakEnd = function () {
        return TmindAudio.play('breakEnd');
    };

    TmindAudio.playLevelUp = function () {
        return TmindAudio.play('levelup');
    };

    TmindAudio.playClick = function () {
        return TmindAudio.play('click');
    };

    TmindAudio.playTick = function () {
        return TmindAudio.play('tick');
    };

    /**
     * 释放资源
     */
    TmindAudio.destroy = function () {
        if (audioCtx) {
            try {
                audioCtx.close();
            } catch (e) {}
            audioCtx = null;
            unlocked = false;
        }
    };

    global.TmindAudio = TmindAudio;

})(window);
