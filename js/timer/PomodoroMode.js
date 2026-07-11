(function (global) {
    'use strict';

    var STATUS = TimerEngine.STATUS;

    var PHASE = {
        WORK: 'work',
        SHORT_BREAK: 'shortBreak',
        LONG_BREAK: 'longBreak',
        IDLE: 'idle'
    };

    var PHASE_LABELS = {
        work: '专注中',
        shortBreak: '短休息',
        longBreak: '长休息',
        idle: '准备开始'
    };

    var DEFAULT_OPTIONS = {
        workDuration: 25 * 60 * 1000,
        shortBreakDuration: 5 * 60 * 1000,
        longBreakDuration: 15 * 60 * 1000,
        sessionsBeforeLongBreak: 4,
        autoStartBreak: false,
        autoStartWork: false
    };

    function PomodoroMode(options) {
        options = Object.assign({}, DEFAULT_OPTIONS, options || {});

        this._phase = PHASE.IDLE;
        this._workDuration = options.workDuration;
        this._shortBreakDuration = options.shortBreakDuration;
        this._longBreakDuration = options.longBreakDuration;
        this._sessionsBeforeLongBreak = options.sessionsBeforeLongBreak;
        this._autoStartBreak = options.autoStartBreak;
        this._autoStartWork = options.autoStartWork;

        this._completedWorkSessions = 0;
        this._totalWorkSessions = 0;
        this._totalWorkMinutes = 0;
        this._currentSessionStartTime = 0;

        this._internalTimer = null;
        this._lastTickTime = 0;
        this._rafId = null;

        this._isRunning = false;
        this._isPaused = false;

        this._onPhaseCompleteBind = this._onInternalTimerComplete.bind(this);
    }

    PomodoroMode.PHASE = PHASE;

    PomodoroMode.prototype._createInternalTimer = function (duration) {
        var self = this;
        var timer = new TimerEngine({
            duration: duration,
            mode: 'countdown'
        });
        return timer;
    };

    PomodoroMode.prototype._onInternalTimerComplete = function () {
        var previousPhase = this._phase;

        if (this._phase === PHASE.WORK) {
            this._completedWorkSessions += 1;
            this._totalWorkSessions += 1;

            var elapsed = this._internalTimer ? this._internalTimer.getElapsed() : 0;
            this._totalWorkMinutes += Math.round(elapsed / 60000);

            this._emit('workComplete', {
                sessionNumber: this._completedWorkSessions,
                totalSessions: this._totalWorkSessions,
                elapsedMinutes: Math.round(elapsed / 60000)
            });

            if (this._autoStartBreak) {
                this._transitionToBreak();
            } else {
                this._transitionToBreak();
                this._phase = PHASE.IDLE;
                this._emit('phaseChange', {
                    phase: this._phase,
                    label: PHASE_LABELS[this._phase],
                    message: '工作完成！休息一下吧'
                });
            }

        } else if (this._phase === PHASE.SHORT_BREAK) {
            this._completedWorkSessions = 0;

            if (this._autoStartWork) {
                this._transitionToWork();
            } else {
                this._phase = PHASE.IDLE;
                this._emit('phaseChange', {
                    phase: this._phase,
                    label: PHASE_LABELS[this._phase],
                    message: '休息结束！准备开始下一轮专注'
                });
            }

        } else if (this._phase === PHASE.LONG_BREAK) {
            this._completedWorkSessions = 0;

            if (this._autoStartWork) {
                this._transitionToWork();
            } else {
                this._phase = PHASE.IDLE;
                this._emit('phaseChange', {
                    phase: this._phase,
                    label: PHASE_LABELS[this._phase],
                    message: '长休息结束！准备好开始新的一轮了吗'
                });
            }
        }

        this._emit('phaseComplete', {
            previousPhase: previousPhase,
            currentPhase: this._phase,
            completedWorkSessions: this._completedWorkSessions
        });

        this._emit('statusChange', this._phase === PHASE.WORK ? STATUS.RUNNING : STATUS.IDLE);
    };

    PomodoroMode.prototype._transitionToWork = function () {
        this._phase = PHASE.WORK;

        this._emit('phaseChange', {
            phase: this._phase,
            label: PHASE_LABELS[this._phase],
            message: '开始专注！保持专注哦'
        });

        this._emit('statusChange', STATUS.RUNNING);
    };

    PomodoroMode.prototype._transitionToBreak = function () {
        if (this._completedWorkSessions > 0 && this._completedWorkSessions % this._sessionsBeforeLongBreak === 0) {
            this._phase = PHASE.LONG_BREAK;
        } else {
            this._phase = PHASE.SHORT_BREAK;
        }

        this._emit('phaseChange', {
            phase: this._phase,
            label: PHASE_LABELS[this._phase],
            message: this._phase === PHASE.LONG_BREAK ? '完成四轮！开始长休息' : '休息一下吧'
        });
    };

    PomodoroMode.prototype.start = function () {
        if (this._isRunning && !this._isPaused) {
            return false;
        }

        if (this._phase === PHASE.IDLE || this._phase === PHASE.WORK) {
            if (this._phase === PHASE.IDLE) {
                this._transitionToWork();
            }

            this._currentSessionStartTime = Date.now();

            this._internalTimer = this._createInternalTimer(this._workDuration);
            this._internalTimer.on('complete', this._onPhaseCompleteBind);
            this._internalTimer.on('tick', this._onTick.bind(this));

            var self = this;
            this._internalTimer.start();
            this._startRafLoop();

            this._isRunning = true;
            this._isPaused = false;

            this._emit('start', {
                phase: this._phase,
                label: PHASE_LABELS[this._phase]
            });
            this._emit('statusChange', STATUS.RUNNING);
        }

        return true;
    };

    PomodoroMode.prototype.pause = function () {
        if (!this._isRunning || this._isPaused) {
            return false;
        }

        if (this._internalTimer) {
            this._internalTimer.pause();
        }

        this._stopRafLoop();
        this._isPaused = true;

        this._emit('pause', {
            phase: this._phase,
            remaining: this.getRemaining()
        });
        this._emit('statusChange', STATUS.PAUSED);

        return true;
    };

    PomodoroMode.prototype.resume = function () {
        if (!this._isPaused) {
            return false;
        }

        if (this._internalTimer) {
            this._internalTimer.resume();
        }

        this._startRafLoop();
        this._isPaused = false;

        this._emit('resume', {
            phase: this._phase,
            remaining: this.getRemaining()
        });
        this._emit('statusChange', STATUS.RUNNING);

        return true;
    };

    PomodoroMode.prototype.reset = function () {
        this._stopRafLoop();

        if (this._internalTimer) {
            this._internalTimer.destroy();
            this._internalTimer = null;
        }

        this._phase = PHASE.IDLE;
        this._isRunning = false;
        this._isPaused = false;
        this._completedWorkSessions = 0;

        this._emit('reset', {
            phase: this._phase,
            label: PHASE_LABELS[this._phase]
        });
        this._emit('statusChange', STATUS.IDLE);

        return true;
    };

    PomodoroMode.prototype.skipBreak = function () {
        if (this._phase !== PHASE.SHORT_BREAK && this._phase !== PHASE.LONG_BREAK) {
            return false;
        }

        if (this._phase === PHASE.SHORT_BREAK) {
            this._completedWorkSessions = 0;
        }

        this._stopRafLoop();

        if (this._internalTimer) {
            this._internalTimer.destroy();
            this._internalTimer = null;
        }

        this._phase = PHASE.IDLE;

        this._emit('phaseChange', {
            phase: this._phase,
            label: PHASE_LABELS[this._phase],
            message: '跳过休息，准备开始专注'
        });
        this._emit('statusChange', STATUS.IDLE);

        return true;
    };

    PomodoroMode.prototype.skipToWork = function () {
        if (this._phase === PHASE.WORK) {
            return false;
        }

        this._stopRafLoop();

        if (this._internalTimer) {
            this._internalTimer.destroy();
            this._internalTimer = null;
        }

        this._phase = PHASE.IDLE;

        this._emit('phaseChange', {
            phase: this._phase,
            label: PHASE_LABELS[this._phase],
            message: '准备开始专注'
        });
        this._emit('statusChange', STATUS.IDLE);

        return true;
    };

    PomodoroMode.prototype.abandon = function () {
        this._emit('abandon', {
            phase: this._phase,
            completedSessions: this._totalWorkSessions,
            totalMinutes: this._totalWorkMinutes
        });

        return this.reset();
    };

    PomodoroMode.prototype.getPhase = function () {
        return this._phase;
    };

    PomodoroMode.prototype.getPhaseLabel = function () {
        return PHASE_LABELS[this._phase] || PHASE_LABELS.idle;
    };

    PomodoroMode.prototype.getStatus = function () {
        if (!this._isRunning) {
            return STATUS.IDLE;
        }
        if (this._isPaused) {
            return STATUS.PAUSED;
        }
        return STATUS.RUNNING;
    };

    PomodoroMode.prototype.getMode = function () {
        return 'pomodoro';
    };

    PomodoroMode.prototype.getRemaining = function () {
        if (!this._internalTimer) {
            if (this._phase === PHASE.WORK) {
                return this._workDuration;
            } else if (this._phase === PHASE.SHORT_BREAK) {
                return this._shortBreakDuration;
            } else if (this._phase === PHASE.LONG_BREAK) {
                return this._longBreakDuration;
            }
            return this._workDuration;
        }
        return this._internalTimer.getRemaining();
    };

    PomodoroMode.prototype.getElapsed = function () {
        if (!this._internalTimer) {
            return 0;
        }
        return this._internalTimer.getElapsed();
    };

    PomodoroMode.prototype.getProgress = function () {
        var remaining = this.getRemaining();
        var total = 0;

        if (this._phase === PHASE.WORK) {
            total = this._workDuration;
        } else if (this._phase === PHASE.SHORT_BREAK) {
            total = this._shortBreakDuration;
        } else if (this._phase === PHASE.LONG_BREAK) {
            total = this._longBreakDuration;
        } else {
            total = this._workDuration;
        }

        if (total <= 0) return 0;
        var progress = (total - remaining) / total;
        return Math.min(1, Math.max(0, progress));
    };

    PomodoroMode.prototype.getOverallProgress = function () {
        if (this._sessionsBeforeLongBreak <= 0) return 0;
        var progress = this._completedWorkSessions / this._sessionsBeforeLongBreak;
        return Math.min(1, Math.max(0, progress));
    };

    PomodoroMode.prototype.getCompletedSessions = function () {
        return this._completedWorkSessions;
    };

    PomodoroMode.prototype.getTotalSessions = function () {
        return this._totalWorkSessions;
    };

    PomodoroMode.prototype.getTotalWorkMinutes = function () {
        return this._totalWorkMinutes;
    };

    PomodoroMode.prototype.getSessionsBeforeLongBreak = function () {
        return this._sessionsBeforeLongBreak;
    };

    PomodoroMode.prototype.getNextBreakDuration = function () {
        if (this._completedWorkSessions > 0 &&
            this._completedWorkSessions % this._sessionsBeforeLongBreak === 0) {
            return this._longBreakDuration;
        }
        return this._shortBreakDuration;
    };

    PomodoroMode.prototype.formatTime = function (ms) {
        if (ms === undefined || ms === null) {
            ms = this.getRemaining();
        }
        var totalSeconds = Math.floor(Math.abs(ms) / 1000);
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;

        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

        return pad(minutes) + ':' + pad(seconds);
    };

    PomodoroMode.prototype.setDurations = function (options) {
        if (this._isRunning && !this._isPaused) {
            return false;
        }

        if (options.workDuration !== undefined && options.workDuration > 0) {
            this._workDuration = options.workDuration;
        }
        if (options.shortBreakDuration !== undefined && options.shortBreakDuration > 0) {
            this._shortBreakDuration = options.shortBreakDuration;
        }
        if (options.longBreakDuration !== undefined && options.longBreakDuration > 0) {
            this._longBreakDuration = options.longBreakDuration;
        }
        if (options.sessionsBeforeLongBreak !== undefined && options.sessionsBeforeLongBreak > 0) {
            this._sessionsBeforeLongBreak = options.sessionsBeforeLongBreak;
        }

        this._emit('durationsChange', {
            workDuration: this._workDuration,
            shortBreakDuration: this._shortBreakDuration,
            longBreakDuration: this._longBreakDuration,
            sessionsBeforeLongBreak: this._sessionsBeforeLongBreak
        });

        return true;
    };

    PomodoroMode.prototype.setAutoStart = function (options) {
        if (options.autoStartBreak !== undefined) {
            this._autoStartBreak = !!options.autoStartBreak;
        }
        if (options.autoStartWork !== undefined) {
            this._autoStartWork = !!options.autoStartWork;
        }
    };

    PomodoroMode.prototype._onTick = function (remaining, elapsed) {
        this._emit('tick', remaining, elapsed, {
            phase: this._phase,
            label: PHASE_LABELS[this._phase]
        });
    };

    PomodoroMode.prototype._startRafLoop = function () {
        if (this._rafId) return;
        var self = this;
        function loop() {
            if (self._isRunning && !self._isPaused && self._internalTimer) {
                var remaining = self._internalTimer.getRemaining();
                var elapsed = self._internalTimer.getElapsed();
                self._onTick(remaining, elapsed);
                self._rafId = requestAnimationFrame(loop);
            } else {
                self._rafId = null;
            }
        }
        this._rafId = requestAnimationFrame(loop);
    };

    PomodoroMode.prototype._stopRafLoop = function () {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    };

    PomodoroMode.prototype.on = function (event, callback) {
        if (!this._listeners) {
            this._listeners = {};
        }
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);

        var self = this;
        return function () {
            var listeners = self._listeners[event];
            if (listeners) {
                var idx = listeners.indexOf(callback);
                if (idx > -1) {
                    listeners.splice(idx, 1);
                }
            }
        };
    };

    PomodoroMode.prototype.off = function (event, callback) {
        var listeners = this._listeners && this._listeners[event];
        if (!listeners) return;
        var idx = listeners.indexOf(callback);
        if (idx > -1) {
            listeners.splice(idx, 1);
        }
    };

    PomodoroMode.prototype._emit = function (event) {
        var listeners = this._listeners && this._listeners[event];
        if (!listeners || listeners.length === 0) return;

        var args = Array.prototype.slice.call(arguments, 1);
        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i].apply(this, args);
            } catch (e) {
                console.error('[PomodoroMode] Listener error for "' + event + '":', e);
            }
        }
    };

    PomodoroMode.prototype.toggle = function () {
        if (!this._isRunning) {
            return this.start();
        }
        if (this._isPaused) {
            return this.resume();
        }
        return this.pause();
    };

    PomodoroMode.prototype.destroy = function () {
        this._stopRafLoop();
        if (this._internalTimer) {
            this._internalTimer.destroy();
            this._internalTimer = null;
        }
        this._listeners = {};
        this._phase = PHASE.IDLE;
        this._isRunning = false;
        this._isPaused = false;
        this._completedWorkSessions = 0;
        this._totalWorkSessions = 0;
        this._totalWorkMinutes = 0;
    };

    global.PomodoroMode = PomodoroMode;

})(window);
