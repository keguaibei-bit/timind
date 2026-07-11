(function (global) {
    'use strict';

    var STATUS = TimerEngine.STATUS;

    function CountUpMode(options) {
        options = options || {};

        var maxDuration = options.maxDuration || 4 * 60 * 60 * 1000;

        TimerEngine.call(this, {
            duration: maxDuration,
            mode: 'countup',
            maxDuration: maxDuration
        });

        this._totalElapsed = 0;
        this._sessionStartTimestamp = 0;
        this._isEnded = false;
        this._endReason = null;
        this._targetMinutes = options.targetMinutes || 0;
    }

    CountUpMode.prototype = Object.create(TimerEngine.prototype);
    CountUpMode.prototype.constructor = CountUpMode;
    CountUpMode._super = TimerEngine;

    CountUpMode.prototype.start = function () {
        this._isEnded = false;
        this._endReason = null;

        if (this._status === STATUS.PAUSED) {
            this._pauseGap = Date.now() - this._pauseTimestamp;
        } else {
            this._totalElapsed = 0;
            this._sessionStartTimestamp = Date.now();
        }

        var result = TimerEngine.prototype.start.call(this);
        return result;
    };

    CountUpMode.prototype.pause = function () {
        return TimerEngine.prototype.pause.call(this);
    };

    CountUpMode.prototype.resume = function () {
        return TimerEngine.prototype.resume.call(this);
    };

    CountUpMode.prototype.reset = function () {
        this._totalElapsed = 0;
        this._sessionStartTimestamp = 0;
        this._isEnded = false;
        this._endReason = null;

        TimerEngine.prototype.reset.call(this, this._maxDuration);
        return true;
    };

    CountUpMode.prototype.complete = function () {
        return this.end('auto_complete');
    };

    CountUpMode.prototype.end = function (reason) {
        if (this._isEnded && this._endReason !== 'interrupted') {
            return false;
        }

        this._updateElapsed();
        this._totalElapsed = this._currentElapsed;
        this._isEnded = true;
        this._endReason = reason || 'manual';

        this._stopTick();

        this._emit('sessionEnd', {
            totalElapsed: this._totalElapsed,
            totalMinutes: this.getTotalMinutes(),
            reason: this._endReason,
            targetReached: this.hasReachedTarget()
        });

        this._status = STATUS.COMPLETED;
        this._emit('complete', this._totalElapsed);
        this._emit('statusChange', this._status);

        return true;
    };

    CountUpMode.prototype.abandon = function () {
        this._endReason = 'abandoned';
        this._isEnded = true;
        this._updateElapsed();
        this._totalElapsed = this._currentElapsed;

        this._stopTick();

        this._emit('sessionAbandon', {
            totalElapsed: this._totalElapsed,
            totalMinutes: this.getTotalMinutes()
        });

        this._status = STATUS.COMPLETED;
        this._emit('complete', this._totalElapsed);
        this._emit('statusChange', this._status);

        return true;
    };

    CountUpMode.prototype.getElapsed = function () {
        if (this._status === STATUS.PAUSED) {
            return this._currentElapsed;
        }
        if (this._status === STATUS.RUNNING) {
            return this._elapsedBeforePause + (Date.now() - this._startTimestamp);
        }
        return this._currentElapsed;
    };

    CountUpMode.prototype.getRemaining = function () {
        return this._maxDuration - this.getElapsed();
    };

    CountUpMode.prototype.getProgress = function () {
        if (this._targetMinutes > 0) {
            var targetMs = this._targetMinutes * 60 * 1000;
            var progress = this.getElapsed() / targetMs;
            return Math.min(1, Math.max(0, progress));
        }
        var maxMs = this._maxDuration;
        if (maxMs <= 0) return 0;
        return Math.min(1, this.getElapsed() / maxMs);
    };

    CountUpMode.prototype.getTotalElapsed = function () {
        return this._totalElapsed > 0 ? this._totalElapsed : this.getElapsed();
    };

    CountUpMode.prototype.getTotalMinutes = function () {
        return Math.floor(this.getTotalElapsed() / 60000);
    };

    CountUpMode.prototype.getTotalSeconds = function () {
        return Math.floor(this.getTotalElapsed() / 1000);
    };

    CountUpMode.prototype.formatTime = function (ms) {
        if (ms === undefined || ms === null) {
            ms = this.getElapsed();
        }
        var totalSeconds = Math.floor(ms / 1000);
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

        return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
    };

    CountUpMode.prototype.setTargetMinutes = function (minutes) {
        if (minutes > 0) {
            this._targetMinutes = minutes;
            this._emit('targetChange', minutes);
            return true;
        }
        return false;
    };

    CountUpMode.prototype.getTargetMinutes = function () {
        return this._targetMinutes;
    };

    CountUpMode.prototype.hasReachedTarget = function () {
        if (this._targetMinutes <= 0) {
            return false;
        }
        return this.getTotalMinutes() >= this._targetMinutes;
    };

    CountUpMode.prototype.isEnded = function () {
        return this._isEnded;
    };

    CountUpMode.prototype.getEndReason = function () {
        return this._endReason;
    };

    CountUpMode.prototype.toggle = function () {
        if (this._status === STATUS.IDLE || this._status === STATUS.COMPLETED) {
            return this.start();
        } else if (this._status === STATUS.RUNNING) {
            return this.pause();
        } else if (this._status === STATUS.PAUSED) {
            return this.resume();
        }
        return false;
    };

    CountUpMode.prototype.destroy = function () {
        TimerEngine.prototype.destroy.call(this);
        this._totalElapsed = 0;
        this._sessionStartTimestamp = 0;
        this._isEnded = false;
        this._endReason = null;
        this._targetMinutes = 0;
    };

    global.CountUpMode = CountUpMode;

})(window);
