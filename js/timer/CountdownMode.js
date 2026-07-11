(function (global) {
    'use strict';

    var STATUS = TimerEngine.STATUS;

    function CountdownMode(options) {
        options = options || {};

        var duration = options.duration || 25 * 60 * 1000;

        TimerEngine.call(this, {
            duration: duration,
            mode: 'countdown',
            maxDuration: duration
        });

        this._targetDuration = duration;
        this._workCompleted = false;
        this._autoRestartEnabled = options.autoRestart || false;
        this._originalDuration = duration;
    }

    CountdownMode.prototype = Object.create(TimerEngine.prototype);
    CountdownMode.prototype.constructor = CountdownMode;
    CountdownMode._super = TimerEngine;

    CountdownMode.prototype.start = function () {
        if (this._status === STATUS.COMPLETED) {
            this.reset(this._targetDuration);
        }
        TimerEngine.prototype.start.call(this);
        return true;
    };

    CountdownMode.prototype.pause = function () {
        return TimerEngine.prototype.pause.call(this);
    };

    CountdownMode.prototype.resume = function () {
        return TimerEngine.prototype.resume.call(this);
    };

    CountdownMode.prototype.reset = function (newDuration) {
        if (newDuration !== undefined && newDuration !== null && newDuration > 0) {
            this._targetDuration = newDuration;
            this._originalDuration = newDuration;
            this._maxDuration = newDuration;
        }

        this._workCompleted = false;

        var result = TimerEngine.prototype.reset.call(this, this._targetDuration);

        this._emit('durationChange', this._targetDuration);

        return result;
    };

    CountdownMode.prototype.setDuration = function (duration) {
        if (this._status === STATUS.RUNNING) {
            return false;
        }

        if (duration <= 0) {
            return false;
        }

        this._targetDuration = duration;
        this._originalDuration = duration;

        return TimerEngine.prototype.setDuration.call(this, duration);
    };

    CountdownMode.prototype.getRemaining = function () {
        if (this._mode !== 'countdown') {
            return this._duration - this.getElapsed();
        }

        var remaining = this._duration - this.getElapsed();
        return remaining < 0 ? 0 : remaining;
    };

    CountdownMode.prototype.getProgress = function () {
        if (this._targetDuration <= 0) {
            return 0;
        }
        var progress = this.getElapsed() / this._targetDuration;
        return Math.min(1, Math.max(0, progress));
    };

    CountdownMode.prototype.formatTime = function (ms) {
        if (ms === undefined || ms === null) {
            ms = this.getRemaining();
        }
        var totalSeconds = Math.floor(Math.abs(ms) / 1000);
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

        if (hours > 0) {
            return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
        }
        return pad(minutes) + ':' + pad(seconds);
    };

    CountdownMode.prototype.getTargetDuration = function () {
        return this._targetDuration;
    };

    CountdownMode.prototype.getElapsedMinutes = function () {
        return Math.round(this.getElapsed() / 60000);
    };

    CountdownMode.prototype.isWorkCompleted = function () {
        return this._workCompleted;
    };

    CountdownMode.prototype.enableAutoRestart = function (enabled) {
        this._autoRestartEnabled = !!enabled;
    };

    CountdownMode.prototype.isAutoRestartEnabled = function () {
        return this._autoRestartEnabled;
    };

    CountdownMode.prototype.toggle = function () {
        if (this._status === STATUS.IDLE || this._status === STATUS.COMPLETED) {
            return this.start();
        } else if (this._status === STATUS.RUNNING) {
            return this.pause();
        } else if (this._status === STATUS.PAUSED) {
            return this.resume();
        }
        return false;
    };

    CountdownMode.prototype.destroy = function () {
        TimerEngine.prototype.destroy.call(this);
        this._targetDuration = 0;
        this._workCompleted = false;
        this._autoRestartEnabled = false;
        this._originalDuration = 0;
    };

    global.CountdownMode = CountdownMode;

})(window);
