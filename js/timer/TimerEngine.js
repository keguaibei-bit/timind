(function (global) {
    'use strict';

    var STATUS = {
        IDLE: 'idle',
        RUNNING: 'running',
        PAUSED: 'paused',
        COMPLETED: 'completed'
    };

    var TICK_INTERVAL = 100;

    function TimerEngine(options) {
        options = options || {};

        this._status = STATUS.IDLE;
        this._mode = options.mode || 'countdown';
        this._duration = options.duration || 25 * 60 * 1000;
        this._maxDuration = options.maxDuration || 3 * 60 * 60 * 1000;

        this._startTimestamp = 0;
        this._elapsedBeforePause = 0;
        this._pauseTimestamp = 0;
        this._currentElapsed = 0;

        this._tickIntervalId = null;
        this._listeners = {};

        this._visibilityHandler = this._onVisibilityChange.bind(this);
        this._initVisibilityListener();

        this._lastTickElapsed = 0;
    }

    TimerEngine.STATUS = STATUS;

    TimerEngine.prototype._initVisibilityListener = function () {
        var self = this;
        if (typeof document !== 'undefined' && 'hidden' in document) {
            document.addEventListener('visibilitychange', function () {
                self._onVisibilityChange();
            });
        } else if (typeof document !== 'undefined' && 'webkitHidden' in document) {
            document.addEventListener('webkitvisibilitychange', function () {
                self._onVisibilityChange();
            });
        }
    };

    TimerEngine.prototype._onVisibilityChange = function () {
        var isHidden = document.hidden || document.webkitHidden;
        if (!isHidden && this._status === STATUS.RUNNING) {
            this._updateElapsed();
            this._emit('tick', this.getRemaining(), this.getElapsed());
        }
    };

    TimerEngine.prototype._updateElapsed = function () {
        if (this._status !== STATUS.RUNNING) {
            return this._elapsedBeforePause;
        }
        var now = Date.now();
        var sessionElapsed = now - this._startTimestamp;
        this._currentElapsed = this._elapsedBeforePause + sessionElapsed;
        return this._currentElapsed;
    };

    TimerEngine.prototype._startTick = function () {
        var self = this;
        this._stopTick();
        this._lastTickElapsed = this._currentElapsed;
        this._tickIntervalId = setInterval(function () {
            self._onTick();
        }, TICK_INTERVAL);
    };

    TimerEngine.prototype._stopTick = function () {
        if (this._tickIntervalId !== null) {
            clearInterval(this._tickIntervalId);
            this._tickIntervalId = null;
        }
    };

    TimerEngine.prototype._onTick = function () {
        var elapsed = this._updateElapsed();

        var secondChanged = Math.floor(elapsed / 1000) !== Math.floor(this._lastTickElapsed / 1000);
        this._lastTickElapsed = elapsed;

        if (secondChanged) {
            this._emit('tick', this.getRemaining(), elapsed);
        }

        if (this._mode === 'countdown' || this._mode === 'pomodoro') {
            if (elapsed >= this._duration) {
                this.complete();
            }
        } else if (this._mode === 'countup') {
            if (elapsed >= this._maxDuration) {
                this.complete();
            }
        }
    };

    TimerEngine.prototype.start = function () {
        if (this._status === STATUS.RUNNING) {
            return false;
        }

        this._status = STATUS.RUNNING;
        this._startTimestamp = Date.now();
        this._currentElapsed = this._elapsedBeforePause;
        this._lastTickElapsed = this._elapsedBeforePause;

        this._startTick();
        this._emit('start', this.getRemaining(), this.getElapsed());
        this._emit('statusChange', this._status);

        return true;
    };

    TimerEngine.prototype.pause = function () {
        if (this._status !== STATUS.RUNNING) {
            return false;
        }

        this._updateElapsed();
        this._elapsedBeforePause = this._currentElapsed;
        this._pauseTimestamp = Date.now();
        this._status = STATUS.PAUSED;

        this._stopTick();
        this._emit('pause', this.getRemaining(), this.getElapsed());
        this._emit('statusChange', this._status);

        return true;
    };

    TimerEngine.prototype.resume = function () {
        if (this._status !== STATUS.PAUSED) {
            return false;
        }

        this._status = STATUS.RUNNING;
        this._startTimestamp = Date.now();
        this._lastTickElapsed = this._elapsedBeforePause;

        this._startTick();
        this._emit('resume', this.getRemaining(), this.getElapsed());
        this._emit('statusChange', this._status);

        return true;
    };

    TimerEngine.prototype.toggle = function () {
        if (this._status === STATUS.IDLE || this._status === STATUS.COMPLETED) {
            return this.start();
        } else if (this._status === STATUS.RUNNING) {
            return this.pause();
        } else if (this._status === STATUS.PAUSED) {
            return this.resume();
        }
        return false;
    };

    TimerEngine.prototype.reset = function (newDuration) {
        this._stopTick();

        if (newDuration !== undefined && newDuration !== null) {
            this._duration = newDuration;
        }

        this._status = STATUS.IDLE;
        this._startTimestamp = 0;
        this._elapsedBeforePause = 0;
        this._pauseTimestamp = 0;
        this._currentElapsed = 0;
        this._lastTickElapsed = 0;

        this._emit('reset', this.getRemaining(), 0);
        this._emit('statusChange', this._status);

        return true;
    };

    TimerEngine.prototype.complete = function () {
        this._stopTick();
        this._updateElapsed();
        this._status = STATUS.COMPLETED;

        this._emit('complete', this.getElapsed());
        this._emit('statusChange', this._status);

        return true;
    };

    TimerEngine.prototype.getStatus = function () {
        return this._status;
    };

    TimerEngine.prototype.getMode = function () {
        return this._mode;
    };

    TimerEngine.prototype.setMode = function (mode) {
        if (this._status === STATUS.RUNNING) {
            return false;
        }
        if (['countdown', 'countup', 'pomodoro'].indexOf(mode) === -1) {
            return false;
        }
        this._mode = mode;
        this._emit('modeChange', mode);
        return true;
    };

    TimerEngine.prototype.getDuration = function () {
        return this._duration;
    };

    TimerEngine.prototype.setDuration = function (duration) {
        if (this._status === STATUS.RUNNING) {
            return false;
        }
        this._duration = duration;
        this._emit('durationChange', duration);
        return true;
    };

    TimerEngine.prototype.getElapsed = function () {
        this._updateElapsed();
        return this._currentElapsed;
    };

    TimerEngine.prototype.getRemaining = function () {
        if (this._mode === 'countup') {
            return this._maxDuration - this.getElapsed();
        }
        var remaining = this._duration - this.getElapsed();
        return remaining < 0 ? 0 : remaining;
    };

    TimerEngine.prototype.getProgress = function () {
        var total = this._mode === 'countup' ? this._maxDuration : this._duration;
        if (total <= 0) return 0;
        var progress = this.getElapsed() / total;
        return Math.min(1, Math.max(0, progress));
    };

    TimerEngine.prototype.formatTime = function (ms) {
        if (ms === undefined || ms === null) {
            ms = this.getRemaining();
        }
        var totalSeconds = Math.floor(ms / 1000);
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

        if (hours > 0) {
            return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
        }
        return pad(minutes) + ':' + pad(seconds);
    };

    TimerEngine.prototype.on = function (event, callback) {
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

    TimerEngine.prototype.off = function (event, callback) {
        var listeners = this._listeners[event];
        if (!listeners) return;
        var idx = listeners.indexOf(callback);
        if (idx > -1) {
            listeners.splice(idx, 1);
        }
    };

    TimerEngine.prototype._emit = function (event) {
        var listeners = this._listeners[event];
        if (!listeners || listeners.length === 0) return;

        var args = Array.prototype.slice.call(arguments, 1);
        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i].apply(this, args);
            } catch (e) {
                console.error('[TimerEngine] Listener error for "' + event + '":', e);
            }
        }
    };

    TimerEngine.prototype.destroy = function () {
        this._stopTick();
        this._listeners = {};
    };

    global.TimerEngine = TimerEngine;

})(window);
