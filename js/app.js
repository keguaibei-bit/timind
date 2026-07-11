(function (global) {
    'use strict';

    var App = {};

    var currentTimer = null;
    var currentMode = 'countdown';
    var currentDuration = 25 * 60 * 1000;
    var sessionStartTime = 0;
    var rafId = null;
    var lastSecond = -1;
    var initialized = false;

    var CIRCUMFERENCE = 2 * Math.PI * 90;

    var MODE_LABELS = {
        countdown: '倒计时',
        countup: '正计时',
        pomodoro: '番茄钟'
    };

    var PHASE_LABELS = {
        idle: '准备开始',
        work: '专注中',
        shortBreak: '短休息',
        longBreak: '长休息',
        running: '专注中',
        paused: '已暂停'
    };

    function $(id) {
        return document.getElementById(id);
    }

    function $all(selector) {
        return Array.prototype.slice.call(document.querySelectorAll(selector));
    }

    function destroyCurrentTimer() {
        stopRafLoop();
        if (currentTimer) {
            try {
                currentTimer.destroy();
            } catch (e) {
                console.warn('[App] Timer destroy error:', e);
            }
            currentTimer = null;
        }
    }

    function createCountdownTimer() {
        destroyCurrentTimer();
        currentTimer = new CountdownMode({
            duration: currentDuration,
            mode: 'countdown'
        });
        bindTimerEvents();
        updateUIForMode('countdown');
        return currentTimer;
    }

    function createCountUpTimer() {
        destroyCurrentTimer();
        currentTimer = new CountUpMode({
            maxDuration: 4 * 60 * 60 * 1000,
            mode: 'countup'
        });
        bindTimerEvents();
        updateUIForMode('countup');
        return currentTimer;
    }

    function createPomodoroTimer() {
        destroyCurrentTimer();
        currentTimer = new PomodoroMode({
            workDuration: currentDuration,
            shortBreakDuration: 5 * 60 * 1000,
            longBreakDuration: 15 * 60 * 1000,
            sessionsBeforeLongBreak: 4,
            autoStartBreak: false,
            autoStartWork: false
        });
        bindTimerEvents();
        updateUIForMode('pomodoro');
        return currentTimer;
    }

    function switchMode(newMode) {
        if (currentMode === newMode && currentTimer) {
            return;
        }

        if (currentTimer) {
            var status = null;
            try {
                status = currentTimer.getStatus ? currentTimer.getStatus() : currentTimer.getPhase();
            } catch (e) {
                status = 'idle';
            }
            if (status === 'running' || status === 'paused') {
                showToast('请先结束当前专注');
                return;
            }
        }

        currentMode = newMode;

        $all('.mode-tab').forEach(function (tab) {
            if (tab.getAttribute('data-mode') === newMode) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        TmindState.set('timer.mode', newMode);

        if (newMode === 'countdown') {
            createCountdownTimer();
        } else if (newMode === 'countup') {
            createCountUpTimer();
        } else if (newMode === 'pomodoro') {
            createPomodoroTimer();
        }

        resetTimerDisplay();
        showActionButtons('idle');
        updatePhaseIndicator('idle', '准备开始');
    }

    function bindTimerEvents() {
        if (!currentTimer) return;

        currentTimer.on('tick', function (remaining, elapsed, extra) {
            if (currentMode === 'countup') {
                updateTimerDisplay(elapsed, extra);
            } else {
                updateTimerDisplay(remaining, extra);
            }
            updateProgressRing(elapsed);
        });

        currentTimer.on('start', function () {
            TmindState.set('timer.status', 'running');
            sessionStartTime = Date.now();
        });

        currentTimer.on('pause', function () {
            TmindState.set('timer.status', 'paused');
        });

        currentTimer.on('resume', function () {
            TmindState.set('timer.status', 'running');
        });

        currentTimer.on('complete', function (elapsed) {
            TmindState.set('timer.status', 'completed');
            if (currentMode === 'countdown') {
                handleCountdownComplete(elapsed);
            }
        });

        currentTimer.on('reset', function () {
            TmindState.set('timer.status', 'idle');
            resetTimerDisplay();
        });

        if (currentMode === 'countup') {
            currentTimer.on('sessionEnd', function (data) {
                handleCountUpEnd(data);
            });
            currentTimer.on('sessionAbandon', function (data) {
                handleCountUpEnd(data);
            });
        }

        if (currentMode === 'pomodoro') {
            currentTimer.on('phaseChange', function (data) {
                handlePomodoroPhaseChange(data);
            });
            currentTimer.on('workComplete', function (data) {
                handlePomodoroWorkComplete(data);
            });
            currentTimer.on('phaseComplete', function (data) {
                handlePomodoroPhaseComplete(data);
            });
            currentTimer.on('abandon', function (data) {
                handlePomodoroAbandon(data);
            });
        }
    }

    function updateTimerDisplay(remaining, extra) {
        if (remaining === undefined || remaining === null) return;

        var totalSeconds = Math.floor(Math.abs(remaining) / 1000);
        var currentSecond = totalSeconds;

        if (currentSecond === lastSecond) {
            return;
        }
        lastSecond = currentSecond;

        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

        var displayText;
        if (currentMode === 'countup' || hours > 0) {
            displayText = pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
        } else {
            displayText = pad(minutes) + ':' + pad(seconds);
        }

        var timerDisplay = $('timerDisplay');
        if (timerDisplay) {
            timerDisplay.textContent = displayText;
        }

        if (extra && extra.label) {
            document.title = displayText + ' · ' + extra.label;
        } else if (currentMode === 'countdown') {
            document.title = displayText + ' · Tmind';
        } else {
            document.title = displayText + ' · ' + (MODE_LABELS[currentMode] || 'Tmind');
        }
    }

    function updateProgressRing(elapsed) {
        var fill = $('timerProgressFill');
        if (!fill || !currentTimer) return;

        var progress = 0;
        try {
            progress = currentTimer.getProgress ? currentTimer.getProgress() : 0;
        } catch (e) {
            progress = 0;
        }

        var offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));
        fill.style.strokeDashoffset = offset;
    }

    function resetTimerDisplay() {
        lastSecond = -1;

        var displayValue;
        if (currentMode === 'countup') {
            displayValue = 0;
        } else if (currentMode === 'pomodoro') {
            if (currentTimer && currentTimer.getPhase) {
                var phase = currentTimer.getPhase();
                if (phase === 'shortBreak') {
                    displayValue = 5 * 60 * 1000;
                } else if (phase === 'longBreak') {
                    displayValue = 15 * 60 * 1000;
                } else {
                    displayValue = currentDuration;
                }
            } else {
                displayValue = currentDuration;
            }
        } else {
            displayValue = currentDuration;
        }

        updateTimerDisplay(displayValue);
        updateProgressRing(0);
        document.title = 'Tmind · 专注心流';
    }

    function updatePhaseIndicator(phase, label) {
        var indicator = $('focusPhaseIndicator');
        var labelEl = $('phaseLabel');
        if (!indicator || !labelEl) return;

        indicator.className = 'focus-phase-indicator';
        if (phase && phase !== 'idle') {
            indicator.classList.add(phase);
        }

        labelEl.textContent = label || PHASE_LABELS[phase] || PHASE_LABELS.idle;
    }

    function updatePomodoroDots(completed, total) {
        var dotsContainer = $('pomodoroDots');
        if (!dotsContainer) return;

        var dots = dotsContainer.querySelectorAll('.pomodoro-dot');
        for (var i = 0; i < dots.length; i++) {
            dots[i].classList.remove('completed', 'current');
            if (i < completed) {
                dots[i].classList.add('completed');
            } else if (i === completed) {
                dots[i].classList.add('current');
            }
        }

        var sessionInfo = $('pomodoroSessionInfo');
        if (sessionInfo) {
            sessionInfo.textContent = '第 ' + (completed + 1) + ' 轮 · 共 ' + total + ' 轮';
        }
    }

    function updateUIForMode(mode) {
        var presets = $('focusPresets');
        var pomodoroProgress = $('pomodoroProgress');
        var phaseIndicator = $('focusPhaseIndicator');

        if (mode === 'countdown') {
            if (presets) presets.classList.remove('hidden');
            if (pomodoroProgress) pomodoroProgress.classList.add('hidden');
            if (phaseIndicator) phaseIndicator.classList.add('hidden');
        } else if (mode === 'countup') {
            if (presets) presets.classList.add('hidden');
            if (pomodoroProgress) pomodoroProgress.classList.add('hidden');
            if (phaseIndicator) phaseIndicator.classList.add('hidden');
        } else if (mode === 'pomodoro') {
            if (presets) presets.classList.add('hidden');
            if (pomodoroProgress) pomodoroProgress.classList.remove('hidden');
            if (phaseIndicator) phaseIndicator.classList.remove('hidden');
            updatePomodoroDots(0, 4);
        }
    }

    function showActionButtons(state) {
        var ids = ['focusActions', 'focusRunningActions', 'focusPausedActions', 'focusBreakActions', 'focusFastForward', 'focusImmersionHint', 'ambientSoundBar'];
        for (var i = 0; i < ids.length; i++) {
            var el = $(ids[i]);
            if (el) el.classList.add('hidden');
        }

        // 时间选择按钮容器显隐：
        // 运行 / 暂停 / 休息 状态下彻底隐藏，腾出空间给控制按钮；
        // 仅在 idle / completed 且为倒计时模式时显示。
        var presets = $('focusPresets');
        if (presets) {
            if ((state === 'idle' || state === 'completed') && currentMode === 'countdown') {
                presets.classList.remove('hidden');
            } else {
                presets.classList.add('hidden');
            }
        }

        // 上方黄金区域状态对调：
        // Idle/Completed：显示模式切换栏 + 准备开始指示，隐藏语录横幅；
        // Running/Paused：隐藏模式切换栏 + 准备开始指示，显示励志语录横幅占位。
        var modeTabs = $('focusModeTabs');
        var phaseIndicator = $('focusPhaseIndicator');
        var quoteBanner = $('focusQuoteBanner');
        var isRunningOrPaused = (state === 'running' || state === 'paused');

        if (modeTabs) {
            if (state === 'idle' || state === 'completed') {
                modeTabs.classList.remove('hidden');
            } else {
                modeTabs.classList.add('hidden');
            }
        }
        if (phaseIndicator) {
            if (state === 'idle' || state === 'completed' || currentMode === 'pomodoro') {
                phaseIndicator.classList.remove('hidden');
            } else {
                phaseIndicator.classList.add('hidden');
            }
        }
        if (quoteBanner) {
            if (isRunningOrPaused) {
                quoteBanner.classList.remove('hidden');
            } else {
                quoteBanner.classList.add('hidden');
            }
        }

        // 沉浸退出提示 + 白噪音组件：仅在 running 时显示
        if (state === 'running') {
            var hint = $('focusImmersionHint');
            if (hint) hint.classList.remove('hidden');
            var ambientBar = $('ambientSoundBar');
            if (ambientBar) ambientBar.classList.remove('hidden');
        }

        if (currentMode === 'pomodoro') {
            var phase = 'idle';
            try {
                phase = currentTimer && currentTimer.getPhase ? currentTimer.getPhase() : 'idle';
            } catch (e) {}

            if (phase === 'shortBreak' || phase === 'longBreak') {
                var breakActions = $('focusBreakActions');
                if (breakActions) breakActions.classList.remove('hidden');
            } else if (state === 'running') {
                var runningActions = $('focusRunningActions');
                if (runningActions) runningActions.classList.remove('hidden');
                var ff = $('focusFastForward');
                if (ff) ff.classList.remove('hidden');
            } else if (state === 'paused') {
                var pausedActions = $('focusPausedActions');
                if (pausedActions) pausedActions.classList.remove('hidden');
            } else {
                var actions = $('focusActions');
                if (actions) actions.classList.remove('hidden');
            }
            return;
        }

        if (state === 'idle' || state === 'completed') {
            var a = $('focusActions');
            if (a) a.classList.remove('hidden');
        } else if (state === 'running') {
            var r = $('focusRunningActions');
            if (r) r.classList.remove('hidden');
            var ff2 = $('focusFastForward');
            if (ff2) ff2.classList.remove('hidden');
        } else if (state === 'paused') {
            var p = $('focusPausedActions');
            if (p) p.classList.remove('hidden');
        }
    }

    function handleCountdownComplete(elapsed) {
        try { TmindAudio.playComplete(); } catch (e) {}
        try {
            TmindNotification.notifyFocusComplete({
                minutes: Math.round(elapsed / 60000),
                mode: 'countdown'
            });
        } catch (e) {}
        // 完成庆祝：五彩纸屑 + 金币跳跃
        try { TmindEffects.burstConfetti({ count: 60 }); } catch (e) {}
        try { setTimeout(function () { TmindEffects.coinJump({ count: 20 }); }, 400); } catch (e) {}
        handleSessionComplete(elapsed, true);
    }

    function handleCountUpEnd(data) {
        var elapsedMs = data.totalElapsed || 0;
        var completed = data.reason !== 'abandoned';

        if (completed) {
            try { TmindAudio.playComplete(); } catch (e) {}
            try {
                TmindNotification.notifyFocusComplete({
                    minutes: Math.round(elapsedMs / 60000),
                    mode: 'countup'
                });
            } catch (e) {}
            // 完成庆祝
            try { TmindEffects.burstConfetti({ count: 50 }); } catch (e) {}
            try { setTimeout(function () { TmindEffects.coinJump({ count: 18 }); }, 400); } catch (e) {}
        }

        try {
            var result = RewardEngine.distributeRewards({
                duration: elapsedMs,
                completed: completed,
                startTime: sessionStartTime,
                endTime: Date.now(),
                mode: 'countup'
            });

            showCompleteModal(result.reward.minutes, result.reward.xp, result.reward.coins);

            if (result.leveledUp || result.newBadges.length > 0) {
                setTimeout(function () {
                    showLevelupModal(result);
                }, 500);
            }

            updateProfileStats();
            updateHomeStats();
            renderBadgeWall();
        } catch (e) {
            console.error('[App] RewardEngine error:', e);
        }
    }

    function handlePomodoroPhaseChange(data) {
        updatePhaseIndicator(data.phase, data.label);

        if (data.phase === 'work') {
            updateTimerDisplay(currentDuration);
            showActionButtons('idle');
            try { TmindAudio.playBreakEnd(); } catch (e) {}
            try { TmindNotification.notifyBreakEnd(); } catch (e) {}
        } else if (data.phase === 'shortBreak') {
            updateTimerDisplay(5 * 60 * 1000);
            showToast('休息一下吧！');
            showActionButtons('break');
            try { TmindAudio.playBreakStart(); } catch (e) {}
            try { TmindNotification.notifyBreakStart({ minutes: 5, longBreak: false }); } catch (e) {}
        } else if (data.phase === 'longBreak') {
            updateTimerDisplay(15 * 60 * 1000);
            showToast('完成四轮！休息一下吧');
            showActionButtons('break');
            try { TmindAudio.playBreakStart(); } catch (e) {}
            try { TmindNotification.notifyBreakStart({ minutes: 15, longBreak: true }); } catch (e) {}
        } else if (data.phase === 'idle') {
            resetTimerDisplay();
            showActionButtons('idle');
        }
    }

    function handlePomodoroWorkComplete(data) {
        var elapsedMinutes = data.elapsedMinutes || Math.round(currentDuration / 60000);
        var elapsedMs = elapsedMinutes * 60 * 1000;

        try { TmindAudio.playComplete(); } catch (e) {}
        try {
            TmindNotification.notifyFocusComplete({
                minutes: elapsedMinutes,
                mode: 'pomodoro'
            });
        } catch (e) {}
        // 番茄完成庆祝
        try { TmindEffects.burstConfetti({ count: 45 }); } catch (e) {}
        try { setTimeout(function () { TmindEffects.coinJump({ count: 15 }); }, 400); } catch (e) {}

        try {
            var result = RewardEngine.distributeRewards({
                duration: elapsedMs,
                completed: true,
                startTime: sessionStartTime,
                endTime: Date.now(),
                mode: 'pomodoro'
            });

            if (result.leveledUp || result.newBadges.length > 0) {
                setTimeout(function () {
                    showLevelupModal(result);
                }, 300);
            }

            updateProfileStats();
            updateHomeStats();
            renderBadgeWall();
        } catch (e) {
            console.error('[App] RewardEngine pomodoro error:', e);
        }

        var completed = 0;
        try {
            completed = currentTimer.getCompletedSessions ? currentTimer.getCompletedSessions() : data.sessionNumber;
        } catch (e) {
            completed = data.sessionNumber || 0;
        }
        var total = 4;
        try {
            total = currentTimer.getSessionsBeforeLongBreak ? currentTimer.getSessionsBeforeLongBreak() : 4;
        } catch (e) {}
        updatePomodoroDots(completed % total, total);
    }

    function handlePomodoroPhaseComplete(data) {
        var completed = data.completedWorkSessions || 0;
        var total = 4;
        try {
            total = currentTimer.getSessionsBeforeLongBreak ? currentTimer.getSessionsBeforeLongBreak() : 4;
        } catch (e) {}
        updatePomodoroDots(completed % total, total);
    }

    function handlePomodoroAbandon(data) {
        updateProfileStats();
        updateHomeStats();
        updatePomodoroDots(0, 4);
        renderBadgeWall();
    }

    function handleSessionComplete(elapsedMs, completed) {
        try {
            var result = RewardEngine.distributeRewards({
                duration: elapsedMs,
                completed: completed,
                startTime: sessionStartTime,
                endTime: Date.now(),
                mode: currentMode
            });

            if (completed) {
                showCompleteModal(result.reward.minutes, result.reward.xp, result.reward.coins);
            }

            if (result.leveledUp || result.newBadges.length > 0) {
                setTimeout(function () {
                    showLevelupModal(result);
                }, 500);
            }

            updateProfileStats();
            updateHomeStats();
            renderBadgeWall();
        } catch (e) {
            console.error('[App] RewardEngine error:', e);
        }
    }

    function showLevelupModal(result) {
        var modal = $('levelupModal');
        if (!modal) return;

        try { TmindAudio.playLevelUp(); } catch (e) {}
        try {
            var info = LevelSystem.getLevelInfo(TmindState.get('user.exp') || 0);
            TmindNotification.notifyLevelUp({
                level: info.level,
                title: LevelSystem.getLevelTitle(info.level)
            });
        } catch (e) {}

        // 升级终极爆发：星形爆发 + 纸屑 + 金币 三连击
        try { TmindEffects.ultimateBurst(); } catch (e) {}

        var iconBig = $('levelupIconBig');
        var levelText = $('levelupLevelText');
        var titleText = $('levelupTitleText');
        var badgeArea = $('levelupBadgeArea');
        var badgeList = $('levelupBadgeList');

        if (result.leveledUp) {
            if (iconBig) iconBig.textContent = result.newLevelTitle ? result.newLevelTitle.icon : '⭐';
            if (levelText) levelText.textContent = 'Lv.' + result.newLevel;
            if (titleText) titleText.textContent = result.newLevelTitle ? result.newLevelTitle.title : '专注达人';

            if (result.newBadges.length > 0) {
                if (badgeArea) badgeArea.classList.remove('hidden');
                if (badgeList) {
                    badgeList.innerHTML = '';
                    for (var i = 0; i < result.newBadges.length; i++) {
                        var badge = result.newBadges[i];
                        var card = document.createElement('div');
                        card.className = 'levelup-badge-card';
                        card.innerHTML = '<span class="lb-icon">' + badge.icon + '</span><span class="lb-name">' + badge.name + '</span>';
                        badgeList.appendChild(card);
                    }
                }
            } else {
                if (badgeArea) badgeArea.classList.add('hidden');
            }

            modal.classList.remove('hidden');

            try {
                Confetti.start({ count: 150, fromBottom: true });
            } catch (e) {
                console.warn('[App] Confetti error:', e);
            }
        } else if (result.newBadges.length > 0) {
            if (iconBig) iconBig.textContent = '🏅';
            if (levelText) levelText.textContent = '新成就';
            if (titleText) titleText.textContent = result.newBadges[0].name;

            if (badgeArea) badgeArea.classList.remove('hidden');
            if (badgeList) {
                badgeList.innerHTML = '';
                for (var j = 0; j < result.newBadges.length; j++) {
                    var b = result.newBadges[j];
                    var c = document.createElement('div');
                    c.className = 'levelup-badge-card';
                    c.innerHTML = '<span class="lb-icon">' + b.icon + '</span><span class="lb-name">' + b.name + '</span>';
                    badgeList.appendChild(c);
                }
            }

            modal.classList.remove('hidden');

            try {
                Confetti.start({ count: 100, fromBottom: true });
            } catch (e) {
                console.warn('[App] Confetti error:', e);
            }
        }
    }

    function hideLevelupModal() {
        var modal = $('levelupModal');
        if (modal) modal.classList.add('hidden');
        try {
            Confetti.stop();
        } catch (e) {}
    }

    function renderBadgeWall() {
        var grid = $('badgeWallGrid');
        var countEl = $('badgeWallCount');
        if (!grid) return;

        var sessions = [];
        var stats = null;

        try {
            sessions = TmindStorage.getAllSessions() || [];
            stats = BadgeSystem.computeStats(sessions);
        } catch (e) {
            stats = BadgeSystem.computeStats([]);
        }

        var badgeResult = BadgeSystem.checkBadges(stats);
        var allBadges = badgeResult.all;
        var unlockedCount = badgeResult.unlocked.length;
        var totalCount = allBadges.length;

        if (countEl) {
            countEl.textContent = unlockedCount + ' / ' + totalCount;
        }

        grid.innerHTML = '';

        for (var i = 0; i < allBadges.length; i++) {
            var badge = allBadges[i];
            var item = document.createElement('div');
            item.className = 'badge-item ' + (badge.unlocked ? 'unlocked' : 'locked');
            item.innerHTML =
                '<div class="badge-item-icon">' + badge.icon + '</div>' +
                '<div class="badge-item-name">' + badge.name + '</div>' +
                '<div class="badge-item-desc">' + badge.description + '</div>';
            grid.appendChild(item);
        }
    }

    function showCompleteModal(minutes, exp, coins) {
        var modal = $('completeModal');
        if (!modal) return;

        var m = $('completeMinutes');
        var e = $('completeExp');
        var c = $('completeCoins');

        if (m) m.textContent = minutes;
        if (e) e.textContent = '+' + exp;
        if (c) c.textContent = '+' + coins;

        modal.classList.remove('hidden');
    }

    function hideCompleteModal() {
        var modal = $('completeModal');
        if (modal) modal.classList.add('hidden');
    }

    function getTimerStatus() {
        if (!currentTimer) return 'idle';
        try {
            if (currentTimer.getStatus) return currentTimer.getStatus();
            if (currentTimer.getPhase) return currentTimer.getPhase();
        } catch (e) {}
        return 'idle';
    }

    var IMMERSION_QUOTES = [
        '深度专注中，世界与你同在 ✨',
        '心流状态已激活，时间属于你 ⚡',
        '一寸光阴一寸金，继续加油 💎',
        '此刻的你，正在塑造未来的自己 🌟',
        '放下杂念，专注当下 🌿',
        '每一次专注都是一次自我升级 🚀'
    ];

    function enterImmersionMode() {
        try {
            document.body.classList.add('immersion-active');
            // 为底部导航栏、顶部状态栏、侧边栏统一加上沉浸淡出类，
            // 实现真正的全屏沉浸：opacity:0 + pointer-events:none + 0.5s 过渡
            var immTargets = ['tabBar', 'sidebar'];
            for (var i = 0; i < immTargets.length; i++) {
                var el = $(immTargets[i]);
                if (el) el.classList.add('immersion-mode');
            }
            var topBar = document.querySelector('.top-bar');
            if (topBar) topBar.classList.add('immersion-mode');
            // 随机一句励志语录填入上方横幅（替代已移除的底部悬浮气泡）
            var quoteBanner = $('focusQuoteBanner');
            if (quoteBanner) {
                quoteBanner.textContent = IMMERSION_QUOTES[Math.floor(Math.random() * IMMERSION_QUOTES.length)];
            }
            // 联动白噪音：开始播放上次选择的环境音
            try {
                if (global.TmindAmbientSound) {
                    TmindAmbientSound.unlock();
                    TmindAmbientSound.start();
                }
            } catch (e) {
                console.warn('[App] AmbientSound start error:', e);
            }
        } catch (e) {
            console.warn('[App] enterImmersionMode error:', e);
        }
    }

    function exitImmersionMode() {
        try {
            document.body.classList.remove('immersion-active');
            // 移除沉浸淡出类，让导航和状态栏流畅恢复显示
            var immTargets = ['tabBar', 'sidebar'];
            for (var i = 0; i < immTargets.length; i++) {
                var el = $(immTargets[i]);
                if (el) el.classList.remove('immersion-mode');
            }
            var topBar = document.querySelector('.top-bar');
            if (topBar) topBar.classList.remove('immersion-mode');
            // 联动白噪音：淡出并停止播放，恢复绝对安静
            try {
                if (global.TmindAmbientSound) {
                    TmindAmbientSound.stop();
                }
            } catch (e) {
                console.warn('[App] AmbientSound stop error:', e);
            }
        } catch (e) {
            console.warn('[App] exitImmersionMode error:', e);
        }
    }

    function handleStart() {
        if (!currentTimer) return;

        // 用户首次交互：解锁音频 + 请求通知权限（解决 Autoplay Policy）
        try { TmindAudio.unlock(); } catch (e) {}
        try {
            if (TmindNotification.getPermission() === 'default') {
                TmindNotification.requestPermission();
            }
        } catch (e) {}

        var status = getTimerStatus();

        if (status === 'idle' || status === 'completed') {
            if (currentMode === 'pomodoro') {
                currentTimer.start();
            } else {
                if (currentMode === 'countdown') {
                    currentTimer.reset(currentDuration);
                }
                currentTimer.start();
            }
            startRafLoop();
            enterImmersionMode();
        } else if (status === 'work') {
            startRafLoop();
            enterImmersionMode();
        }
    }

    function handlePause() {
        if (!currentTimer) return;
        try {
            if (currentTimer.pause) currentTimer.pause();
        } catch (e) {
            console.error('[App] Pause error:', e);
        }
        stopRafLoop();
        exitImmersionMode();
    }

    function handleResume() {
        if (!currentTimer) return;
        try {
            if (currentTimer.resume) currentTimer.resume();
        } catch (e) {
            console.error('[App] Resume error:', e);
        }
        startRafLoop();
        enterImmersionMode();
    }

    function handleAbandon() {
        if (!currentTimer) return;
        stopRafLoop();
        exitImmersionMode();

        try {
            if (currentMode === 'countup' && currentTimer.abandon) {
                currentTimer.abandon();
            } else if (currentMode === 'pomodoro') {
                currentTimer.abandon();
                resetTimerDisplay();
                showActionButtons('idle');
                updatePhaseIndicator('idle', '准备开始');
            } else {
                var elapsed = currentTimer.getElapsed ? currentTimer.getElapsed() : 0;
                currentTimer.reset(currentDuration);
                resetTimerDisplay();
                showActionButtons('idle');
                if (elapsed > 60000) {
                    handleSessionComplete(elapsed, false);
                }
            }
        } catch (e) {
            console.error('[App] Abandon error:', e);
        }
    }

    function handleEnd() {
        if (!currentTimer) return;
        stopRafLoop();
        exitImmersionMode();

        try {
            if (currentMode === 'countdown') {
                var elapsed = currentTimer.getElapsed ? currentTimer.getElapsed() : 0;
                currentTimer.reset(currentDuration);
                resetTimerDisplay();
                showActionButtons('idle');
                if (elapsed > 0) {
                    handleSessionComplete(elapsed, false);
                }
            } else if (currentMode === 'countup' && currentTimer.end) {
                currentTimer.end('manual');
            }
        } catch (e) {
            console.error('[App] End error:', e);
        }
    }

    function handleSkipBreak() {
        if (!currentTimer || currentMode !== 'pomodoro') return;
        try {
            if (currentTimer.skipBreak) currentTimer.skipBreak();
        } catch (e) {
            console.error('[App] Skip break error:', e);
        }
        resetTimerDisplay();
    }

    function handleStartBreak() {
        if (!currentTimer || currentMode !== 'pomodoro') return;
        try {
            if (currentTimer.start) currentTimer.start();
        } catch (e) {
            console.error('[App] Start break error:', e);
        }
        startRafLoop();
    }

    function handlePresetClick(btn) {
        var duration = parseInt(btn.getAttribute('data-duration'), 10);
        if (!duration || duration <= 0) return;

        var status = getTimerStatus();
        if (status === 'running' || status === 'paused') {
            showToast('运行中无法切换时长');
            return;
        }

        currentDuration = duration;
        TmindState.set('timer.duration', duration);

        $all('.preset-btn').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');

        if (currentMode === 'countdown' && currentTimer && currentTimer.setDuration) {
            currentTimer.setDuration(duration);
        } else if (currentMode === 'pomodoro' && currentTimer && currentTimer.setDurations) {
            currentTimer.setDurations({ workDuration: duration });
        }

        resetTimerDisplay();
    }

    function handleModeTabClick(tab) {
        var mode = tab.getAttribute('data-mode');
        if (mode && ['countdown', 'countup', 'pomodoro'].indexOf(mode) > -1) {
            switchMode(mode);
        }
    }

    function handleAvatarClick() {
        window.location.hash = '#/profile';
    }

    function handleQuickStart() {
        window.location.hash = '#/focus';
        setTimeout(function () {
            handleStart();
        }, 400);
    }

    function handleProfileMenuItem(item) {
        var labelEl = item.querySelector('.menu-label');
        if (!labelEl) return;
        var text = labelEl.textContent.trim();

        if (text.indexOf('导出数据') > -1) {
            handleExportData();
        } else if (text.indexOf('导入数据') > -1) {
            handleImportData();
        } else if (text.indexOf('数据统计') > -1 || text.indexOf('数据复盘') > -1) {
            window.location.hash = '#/reports';
        }
    }

    function handleSettingToggle(toggleEl) {
        var row = toggleEl.closest('.setting-row');
        if (!row) return;
        var labelEl = row.querySelector('.setting-label');
        var label = labelEl ? labelEl.textContent.trim() : '';

        var isOn = toggleEl.classList.contains('on');
        var newState = !isOn;

        if (newState) {
            toggleEl.classList.add('on');
            toggleEl.textContent = 'ON';
        } else {
            toggleEl.classList.remove('on');
            toggleEl.textContent = 'OFF';
        }

        if (label.indexOf('音效') > -1) {
            try {
                TmindState.set('settings.sound', newState);
                TmindAudio.setEnabled(newState);
                if (newState) {
                    try { TmindAudio.playClick(); } catch (e) {}
                }
            } catch (e) {}
        } else if (label.indexOf('震动') > -1) {
            try {
                TmindState.set('settings.vibration', newState);
                if (newState) {
                    try { TmindNotification.vibrate(200); } catch (e) {}
                }
            } catch (e) {}
        }
    }

    function handleInjectDemoData() {
        try {
            var result = DemoDataInjector.inject();
            var msg = '已注入 ' + result.sessionsInjected + ' 条专注数据\n';
            msg += '等级 Lv.' + (LevelSystem.getLevelFromXP(1500)) + ' · 1500 XP · 180 金币\n';
            if (result.badgesUnlocked.length > 0) {
                msg += '点亮徽章：' + result.badgesUnlocked.join('、');
            }
            showToast('✨ 演示数据注入成功，已点亮 ' + result.badgesUnlocked.length + ' 枚徽章');
            console.log('[App] 演示数据注入结果:', msg);

            // 局部重绘当前可见视图
            updateProfileStats();
            updateHomeStats();
            renderBadgeWall();

            // 若当前在报告页，立即重渲染图表
            if (window.location.hash.indexOf('reports') > -1) {
                setTimeout(function () {
                    try { refreshReportsView(); } catch (e) {}
                }, 200);
            }
        } catch (e) {
            console.error('[App] 注入演示数据失败:', e);
            showToast('注入失败：' + (e.message || '未知错误'));
        }
    }

    function handleClearDemoData() {
        try {
            DemoDataInjector.reset();
            showToast('已清空演示数据');
            updateProfileStats();
            updateHomeStats();
            renderBadgeWall();
            if (window.location.hash.indexOf('reports') > -1) {
                setTimeout(function () {
                    try { refreshReportsView(); } catch (e) {}
                }, 200);
            }
        } catch (e) {
            console.error('[App] 清空演示数据失败:', e);
            showToast('清空失败');
        }
    }

    function handleFastForward() {
        if (!currentTimer) {
            showToast('请先点击「开始专注」');
            return;
        }

        var status = getTimerStatus();
        if (status !== 'running' && status !== 'work') {
            showToast('请先开始专注后再快进');
            return;
        }

        try {
            // 倒计时 / 番茄钟工作阶段：把剩余时间快进到 3 秒
            if (currentMode === 'countdown' || currentMode === 'pomodoro') {
                var remaining = 0;
                try {
                    remaining = currentTimer.getRemaining ? currentTimer.getRemaining() : 0;
                } catch (e) { remaining = 0; }

                if (remaining > 3000) {
                    // 通过修改内部起始时间戳，让计时器「看起来已经跑了很久」
                    // CountdownMode/TimerEngine: getRemaining = duration - elapsed
                    // 要让 remaining = 3000，需要 elapsed = duration - 3000
                    // elapsed = _elapsedBeforePause + (now - _startTimestamp)
                    // 调整 _startTimestamp 让 elapsed 达到目标
                    var targetRemainingMs = 3000;
                    var targetElapsed = 0;

                    if (currentMode === 'countdown') {
                        // duration = currentDuration
                        targetElapsed = currentDuration - targetRemainingMs;
                    } else if (currentMode === 'pomodoro') {
                        // 番茄钟内部 TimerEngine 的 duration = currentDuration（工作阶段）
                        targetElapsed = currentDuration - targetRemainingMs;
                    }

                    if (targetElapsed > 0) {
                        // 直接调整 _startTimestamp，让 elapsed = targetElapsed
                        // elapsed = _elapsedBeforePause + (now - _startTimestamp)
                        // 假设 _elapsedBeforePause = 0（运行中）：targetElapsed = now - _startTimestamp
                        // 所以 _startTimestamp = now - targetElapsed
                        if (currentTimer._startTimestamp !== undefined) {
                            currentTimer._startTimestamp = Date.now() - targetElapsed - (currentTimer._elapsedBeforePause || 0);
                        }
                        // 番茄钟模式需要调整内部计时器
                        if (currentMode === 'pomodoro' && currentTimer._internalTimer) {
                            if (currentTimer._internalTimer._startTimestamp !== undefined) {
                                currentTimer._internalTimer._startTimestamp = Date.now() - targetElapsed - (currentTimer._internalTimer._elapsedBeforePause || 0);
                            }
                        }
                    }
                    showToast('⏩ 已快进至最后 3 秒');
                } else {
                    showToast('剩余时间已不足 3 秒');
                }
            } else if (currentMode === 'countup') {
                // 正计时：直接快进到接近 4 小时上限的最后 3 秒
                var maxDur = 4 * 60 * 60 * 1000;
                try {
                    maxDur = currentTimer._maxDuration || maxDur;
                } catch (e) {}
                var targetElapsedUp = maxDur - 3000;
                if (targetElapsedUp > 0 && currentTimer._startTimestamp !== undefined) {
                    currentTimer._startTimestamp = Date.now() - targetElapsedUp - (currentTimer._elapsedBeforePause || 0);
                }
                showToast('⏩ 已快进至最后 3 秒');
            }
        } catch (e) {
            console.error('[App] 快进失败:', e);
            showToast('快进失败：' + (e.message || '未知错误'));
        }
    }

    function toggleAIConfigPanel() {
        var body = $('aiConfigBody');
        var arrow = $('aiConfigArrow');
        var toggle = $('aiConfigToggle');
        if (!body) return;

        var isHidden = body.classList.contains('hidden');
        if (isHidden) {
            body.classList.remove('hidden');
            if (arrow) arrow.textContent = '▴';
            if (toggle) toggle.setAttribute('aria-expanded', 'true');
            // 展开时回填已保存的配置
            loadAIConfigToForm();
        } else {
            body.classList.add('hidden');
            if (arrow) arrow.textContent = '▾';
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        }
    }

    function loadAIConfigToForm() {
        try {
            var config = TmindStorage.getAIConfig();
            var providerSelect = $('aiProviderSelect');
            var keyInput = $('aiKeyInput');
            var tip = $('aiConfigTip');

            if (config) {
                if (providerSelect) providerSelect.value = config.provider || 'deepseek';
                if (keyInput) keyInput.value = config.apiKey || '';
                if (tip) {
                    tip.textContent = '已配置 · 供应商：' + (config.provider === 'zhipu' ? '智谱清言' : 'DeepSeek');
                    tip.className = 'ai-config-tip tip-ok';
                }
            } else {
                if (providerSelect) providerSelect.value = 'deepseek';
                if (keyInput) keyInput.value = '';
                if (tip) {
                    tip.textContent = '尚未配置，将使用本地兜底模式生成复盘';
                    tip.className = 'ai-config-tip tip-empty';
                }
            }
        } catch (e) {
            console.warn('[App] loadAIConfigToForm error:', e);
        }
    }

    function handleSaveAIConfig() {
        try {
            var providerSelect = $('aiProviderSelect');
            var keyInput = $('aiKeyInput');
            var tip = $('aiConfigTip');

            var provider = providerSelect ? providerSelect.value : 'deepseek';
            var apiKey = keyInput ? keyInput.value.trim() : '';

            if (!apiKey) {
                if (tip) {
                    tip.textContent = '请填写 API Key';
                    tip.className = 'ai-config-tip tip-error';
                }
                return;
            }

            var model = '';
            if (provider === 'deepseek') {
                model = 'deepseek-chat';
            } else if (provider === 'zhipu') {
                model = 'glm-4';
            }

            var ok = TmindStorage.saveAIConfig({
                provider: provider,
                apiKey: apiKey,
                model: model
            });

            if (ok) {
                if (tip) {
                    var label = provider === 'zhipu' ? '智谱清言 GLM-4' : 'DeepSeek-Chat';
                    tip.textContent = '✅ 配置已保存，下次生成复盘将使用 ' + label;
                    tip.className = 'ai-config-tip tip-ok';
                }
                showToast('AI 配置已保存 ✨');
            } else {
                if (tip) {
                    tip.textContent = '保存失败，请重试';
                    tip.className = 'ai-config-tip tip-error';
                }
            }
        } catch (e) {
            console.error('[App] handleSaveAIConfig error:', e);
            showToast('保存失败：' + (e.message || '未知错误'));
        }
    }

    function handleClearAIConfig() {
        try {
            TmindStorage.clearAIConfig();
            var keyInput = $('aiKeyInput');
            var providerSelect = $('aiProviderSelect');
            var tip = $('aiConfigTip');

            if (keyInput) keyInput.value = '';
            if (providerSelect) providerSelect.value = 'deepseek';
            if (tip) {
                tip.textContent = '已清除配置，将使用本地兜底模式生成复盘';
                tip.className = 'ai-config-tip tip-empty';
            }
            showToast('已清除 AI 配置');
        } catch (e) {
            console.error('[App] handleClearAIConfig error:', e);
        }
    }

    function startRafLoop() {
        if (rafId) return;

        function loop() {
            if (!currentTimer) {
                rafId = null;
                return;
            }

            var status = getTimerStatus();

            if (status === 'running' || status === 'work') {
                try {
                    var elapsed = currentTimer.getElapsed ? currentTimer.getElapsed() : 0;
                    var displayValue;
                    var extra = null;

                    if (currentMode === 'countup') {
                        displayValue = elapsed;
                    } else {
                        displayValue = currentTimer.getRemaining ? currentTimer.getRemaining() : 0;
                    }

                    if (currentMode === 'pomodoro') {
                        extra = {
                            phase: currentTimer.getPhase ? currentTimer.getPhase() : 'work',
                            label: currentTimer.getPhaseLabel ? currentTimer.getPhaseLabel() : '专注中'
                        };
                    }

                    updateTimerDisplay(displayValue, extra);
                    updateProgressRing(elapsed);
                } catch (e) {
                    console.error('[App] RAF loop error:', e);
                }
                rafId = requestAnimationFrame(loop);
            } else {
                rafId = null;
                showActionButtons(status === 'paused' ? 'paused' : 'idle');
            }
        }

        rafId = requestAnimationFrame(loop);
    }

    function stopRafLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    function subscribeState() {
        TmindState.subscribe('timer.status', function (newStatus) {
            showActionButtons(newStatus);
            if (newStatus === 'idle' || newStatus === 'completed') {
                stopRafLoop();
            }
        });

        TmindState.subscribe('user', function () {
            updateProfileStats();
            updateHomeStats();
        });

        TmindState.subscribe('settings.theme', function (theme) {
            document.documentElement.setAttribute('data-theme', theme);
            if (window.location.hash.indexOf('reports') > -1 && reportsInitialized) {
                setTimeout(function () {
                    try {
                        WeeklyChart.render('weeklyChartCanvas');
                        CategoryChart.render('categoryChartCanvas');
                    } catch (e) {
                        console.warn('[App] 主题切换重渲染图表失败:', e);
                    }
                }, 200);
            }
        });

        window.addEventListener('hashchange', function () {
            var hash = window.location.hash;
            if (hash.indexOf('profile') > -1) {
                setTimeout(function () {
                    updateProfileStats();
                    renderBadgeWall();
                }, 100);
            }
            if (hash.indexOf('reports') > -1) {
                setTimeout(function () {
                    initReportsView();
                }, 150);
            }
        });
    }

    function getExpForLevel(level) {
        return LevelSystem.getTotalXPForLevel(level);
    }

    function updateProfileStats() {
        var user = TmindState.get('user');
        var stats = null;
        try {
            stats = TmindStorage.getStats();
        } catch (e) {
            stats = {};
        }

        var el;

        el = $('profileTotalMinutes');
        if (el) el.textContent = (stats.totalMinutes || user.totalMinutes || 0);

        el = $('profileTotalSessions');
        if (el) el.textContent = (stats.totalSessions || user.totalSessions || 0);

        el = $('profileStreak');
        if (el) el.textContent = (stats.currentStreak || user.streak || 0);

        el = $('profileCoins');
        if (el) el.textContent = (user.coins || 0);

        var levelInfo = LevelSystem.getLevelInfo(user.exp || 0);
        var levelTitle = LevelSystem.getLevelTitle(levelInfo.level);

        el = $('profileCurrentLevel');
        if (el) el.textContent = levelInfo.level;

        el = $('profileNextLevel');
        if (el) el.textContent = levelInfo.level + 1;

        var expBar = $('profileExpBar');
        var expText = $('profileExpText');
        if (expBar && expText) {
            expBar.style.width = levelInfo.progressPercent + '%';
            expText.textContent = levelInfo.xpIntoLevel + ' / ' + levelInfo.levelXPRange + ' EXP';
        }

        var profileLevel = document.querySelector('.profile-level');
        if (profileLevel) {
            profileLevel.textContent = 'Lv.' + levelInfo.level + ' · ' + levelTitle.title;
        }

        // 联动 DemoHelper：更新头像、专注星球、计时器环形态
        try {
            DemoHelper.refresh();
        } catch (e) {
            console.warn('[App] DemoHelper.refresh error:', e);
        }
    }

    function updateHomeStats() {
        var stats = null;
        var todayStats = null;
        try {
            stats = TmindStorage.getStats();
            todayStats = TmindStorage.getDailyStats(new Date());
        } catch (e) {
            stats = {};
            todayStats = {};
        }

        var user = TmindState.get('user');
        var cards = document.querySelectorAll('.card-grid .card');

        if (cards.length >= 4) {
            if (cards[0].querySelector('.card-value')) {
                cards[0].querySelector('.card-value').textContent = (todayStats.totalMinutes || 0) + ' 分钟';
            }
            if (cards[1].querySelector('.card-value')) {
                cards[1].querySelector('.card-value').textContent = (stats.currentStreak || 0) + ' 天';
            }
            if (cards[2].querySelector('.card-value')) {
                cards[2].querySelector('.card-value').textContent = (stats.totalSessions || 0) + ' 次';
            }
            if (cards[3].querySelector('.card-value')) {
                cards[3].querySelector('.card-value').textContent = (user.coins || 0);
            }
        }
    }

    function handleExportData() {
        try {
            TmindStorage.exportToFile();
            showToast('数据导出成功');
        } catch (e) {
            showToast('导出失败：' + e.message);
        }
    }

    function handleImportData() {
        var input = $('importFileInput');
        if (input) input.click();
    }

    function handleFileImport(e) {
        var file = e.target.files[0];
        if (!file) return;

        TmindStorage.importFromFile(file, function (err, result) {
            if (err) {
                showToast('导入失败：' + err.message);
            } else {
                showToast('导入成功，新增 ' + result.importedSessions + ' 条记录');
                updateProfileStats();
                updateHomeStats();
            }
        });

        e.target.value = '';
    }

    function showToast(message) {
        var toast = document.createElement('div');
        toast.style.cssText = [
            'position: fixed',
            'top: 50%',
            'left: 50%',
            'transform: translate(-50%, -50%)',
            'background: rgba(0,0,0,0.85)',
            'color: #fff',
            'padding: 12px 24px',
            'border-radius: 8px',
            'font-size: 14px',
            'z-index: 9999',
            'opacity: 0',
            'transition: opacity 0.3s ease',
            'pointer-events: none'
        ].join(';');
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(function () {
            toast.style.opacity = '1';
        });

        setTimeout(function () {
            toast.style.opacity = '0';
            setTimeout(function () {
                if (toast.parentNode) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 2000);
    }

    var reportsInitialized = false;

    function initReportsView() {
        if (typeof Chart === 'undefined') {
            console.warn('[App] Chart.js 未加载，报告视图无法初始化');
            return;
        }

        var reviewEl = $('reportReviewContent');
        if (reviewEl) {
            reviewEl.textContent = '正在生成你的专属复盘...';
        }

        try {
            var weeklyResult = WeeklyChart.render('weeklyChartCanvas');
            if (weeklyResult) {
                var elMin = $('reportWeekMinutes');
                var elSes = $('reportWeekSessions');
                var elAvg = $('reportAvgMinutes');
                var elEff = $('reportEfficiency');
                var totalMin = weeklyResult.totalMinutes || 0;
                var totalSes = weeklyResult.totalSessions || 0;
                if (elMin) elMin.textContent = totalMin;
                if (elSes) elSes.textContent = totalSes;
                if (elAvg) elAvg.textContent = Math.round(totalMin / 7);

                // 专注效率：本周实际专注分钟数 / 本周目标专注分钟数（按每日目标 120 分钟计）
                // 上限 100%。无数据时显示 Mock 92% 作为演示占位。
                var efficiency;
                if (totalMin <= 0) {
                    efficiency = 92; // Mock 演示值
                } else {
                    var weeklyTarget = 7 * 120; // 每日目标 120 分钟
                    efficiency = Math.min(100, Math.round((totalMin / weeklyTarget) * 100));
                }
                if (elEff) elEff.textContent = efficiency + '%';
            }
        } catch (e) {
            console.error('[App] WeeklyChart render error:', e);
        }

        try {
            CategoryChart.render('categoryChartCanvas');
        } catch (e) {
            console.error('[App] CategoryChart render error:', e);
        }

        try {
            // 异步双模生成：本地兜底立即返回，云端 AI 异步请求
            if (reviewEl) {
                var modeLabel = ReportGenerator.isCloudEnabled() ? '🤖 云端 AI 生成中…' : '正在生成本地复盘…';
                reviewEl.innerHTML = '<p class="review-paragraph review-loading">' + modeLabel + '</p>';
            }

            ReportGenerator.generate()
                .then(function (report) {
                    if (reviewEl) {
                        reviewEl.innerHTML = ReportGenerator.toHtml(report.text);
                    }
                    // 在控制台记录生成模式，便于调试
                    console.log('[App] 复盘生成模式:', report.mode, report.provider || '');
                })
                .catch(function (err) {
                    console.error('[App] ReportGenerator error:', err);
                    if (reviewEl) {
                        reviewEl.textContent = '复盘生成失败，请稍后重试。';
                    }
                });
        } catch (e) {
            console.error('[App] ReportGenerator sync error:', e);
            if (reviewEl) {
                reviewEl.textContent = '复盘生成失败，请稍后重试。';
            }
        }

        reportsInitialized = true;
    }

    function refreshReportsView() {
        try {
            WeeklyChart.destroy();
            CategoryChart.destroy();
        } catch (e) {}

        initReportsView();
        showToast('复盘已更新 ✨');
    }

    function setupDelegatedClicks() {
        document.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || target.nodeType !== 1) return;

            var el;

            el = target.closest('#userAvatar');
            if (el) { handleAvatarClick(); return; }

            el = target.closest('#btnStartFocus');
            if (el) { handleStart(); return; }

            el = target.closest('#btnPauseFocus');
            if (el) { handlePause(); return; }

            el = target.closest('#btnResumeFocus');
            if (el) { handleResume(); return; }

            el = target.closest('#btnAbandonFocus');
            if (el) { handleAbandon(); return; }

            el = target.closest('#btnEndFocus');
            if (el) { handleEnd(); return; }

            el = target.closest('#btnSkipBreak');
            if (el) { handleSkipBreak(); return; }

            el = target.closest('#btnStartBreak');
            if (el) { handleStartBreak(); return; }

            el = target.closest('#btnCompleteClose');
            if (el) { hideCompleteModal(); return; }

            el = target.closest('.complete-modal-overlay');
            if (el) { hideCompleteModal(); return; }

            el = target.closest('#btnLevelupClose');
            if (el) { hideLevelupModal(); return; }

            el = target.closest('.levelup-overlay');
            if (el) { hideLevelupModal(); return; }

            el = target.closest('#btnRefreshReports');
            if (el) { refreshReportsView(); return; }

            el = target.closest('.mode-tab');
            if (el) { handleModeTabClick(el); return; }

            el = target.closest('.preset-btn');
            if (el) { handlePresetClick(el); return; }

            el = target.closest('.quick-action .primary-btn');
            if (el) { handleQuickStart(); return; }

            el = target.closest('.profile-menu-item');
            if (el) { handleProfileMenuItem(el); return; }

            el = target.closest('.theme-btn, .option-btn[data-theme]');
            if (el) {
                var theme = el.getAttribute('data-theme');
                if (theme && (theme === 'day' || theme === 'night' || theme === 'eye')) {
                    TmindState.setTheme(theme);
                    document.documentElement.setAttribute('data-theme', theme);
                }
                return;
            }

            el = target.closest('.setting-toggle');
            if (el) { handleSettingToggle(el); return; }

            el = target.closest('#btnInjectDemoData');
            if (el) { handleInjectDemoData(); return; }

            el = target.closest('#btnClearDemoData');
            if (el) { handleClearDemoData(); return; }

            el = target.closest('#btnFastForward');
            if (el) { handleFastForward(); return; }

            el = target.closest('#aiConfigToggle');
            if (el) { toggleAIConfigPanel(); return; }

            el = target.closest('#btnSaveAIConfig');
            if (el) { handleSaveAIConfig(); return; }

            el = target.closest('#btnClearAIConfig');
            if (el) { handleClearAIConfig(); return; }

            el = target.closest('#immersionExitHint');
            if (el) { handlePause(); return; }
        });

        var importInput = $('importFileInput');
        if (importInput) {
            importInput.addEventListener('change', handleFileImport);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                hideCompleteModal();
                hideLevelupModal();
            }

            if (e.code === 'Space') {
                var hash = window.location.hash;
                if (hash.indexOf('focus') > -1) {
                    e.preventDefault();
                    var status = getTimerStatus();
                    if (status === 'idle' || status === 'completed') {
                        handleStart();
                    } else if (status === 'running' || status === 'work') {
                        handlePause();
                    } else if (status === 'paused') {
                        handleResume();
                    }
                }
            }
        });
    }

    function initTimer() {
        var savedMode = TmindState.get('timer.mode');
        if (savedMode && ['countdown', 'countup', 'pomodoro'].indexOf(savedMode) > -1) {
            currentMode = savedMode;
        }

        var savedDuration = TmindState.get('timer.duration');
        if (savedDuration && savedDuration > 0) {
            currentDuration = savedDuration;
        }

        if (currentMode === 'countdown') {
            createCountdownTimer();
        } else if (currentMode === 'countup') {
            createCountUpTimer();
        } else if (currentMode === 'pomodoro') {
            createPomodoroTimer();
        }

        $all('.mode-tab').forEach(function (tab) {
            if (tab.getAttribute('data-mode') === currentMode) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        $all('.preset-btn').forEach(function (btn) {
            if (parseInt(btn.getAttribute('data-duration'), 10) === currentDuration) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    App.init = function () {
        if (initialized) return;
        initialized = true;

        try {
            TmindState.init();
        } catch (e) {
            console.error('[App] State init error:', e);
        }

        var theme = null;
        try {
            theme = TmindState.get('settings.theme');
        } catch (e) {}
        if (theme) {
            document.documentElement.setAttribute('data-theme', theme);
        }

        try {
            initTimer();
        } catch (e) {
            console.error('[App] Timer init error:', e);
        }

        setupDelegatedClicks();

        try {
            subscribeState();
        } catch (e) {
            console.error('[App] Subscribe error:', e);
        }

        try {
            updateProfileStats();
            updateHomeStats();
            renderBadgeWall();
        } catch (e) {
            console.error('[App] Stats update error:', e);
        }

        try {
            resetTimerDisplay();
            showActionButtons('idle');
            updatePhaseIndicator('idle', '准备开始');
        } catch (e) {
            console.error('[App] UI init error:', e);
        }

        // 注册 Service Worker（PWA 离线支持）
        registerServiceWorker();

        // 从本地存储同步音效开关
        try {
            var soundOn = TmindState.get('settings.sound');
            if (soundOn === false) {
                TmindAudio.setEnabled(false);
            }
        } catch (e) {}

        // 初始化评委演示视觉（头像、专注星球、计时器环形态）
        try {
            DemoHelper.init();
        } catch (e) {
            console.warn('[App] DemoHelper.init error:', e);
        }

        // 初始化白噪音 / 环境音播放引擎
        try {
            if (global.TmindAmbientSound) {
                TmindAmbientSound.init();
                TmindAmbientSound.bind();
                TmindAmbientSound.notifyUI();
            }
        } catch (e) {
            console.warn('[App] AmbientSound init error:', e);
        }
    };

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return;
        }
        if (window.location.protocol === 'file:') {
            // file:// 协议下 SW 不可用，跳过
            return;
        }

        window.addEventListener('load', function () {
            navigator.serviceWorker.register('./sw.js', { scope: './' })
                .then(function (registration) {
                    console.log('[App] Service Worker 注册成功，scope:', registration.scope);

                    // 监听更新
                    registration.addEventListener('updatefound', function () {
                        var newWorker = registration.installing;
                        if (!newWorker) return;
                        newWorker.addEventListener('statechange', function () {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // 新版本已就绪，提示用户刷新
                                showToast('新版本已就绪，刷新页面以更新 ✨');
                            }
                        });
                    });
                })
                .catch(function (err) {
                    console.warn('[App] Service Worker 注册失败:', err);
                });
        });
    }

    global.TmindApp = App;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            App.init();
        });
    } else {
        App.init();
    }

})(window);
