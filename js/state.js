(function (global) {
    'use strict';

    var STATE_KEY = 'tmind_app_state';

    var TIMER_STATUS = {
        IDLE: 'idle',
        RUNNING: 'running',
        PAUSED: 'paused',
        COMPLETED: 'completed'
    };

    var TIMER_MODE = {
        COUNTDOWN: 'countdown',
        COUNTUP: 'countup',
        POMODORO: 'pomodoro'
    };

    var defaultState = {
        view: 'home',
        timer: {
            status: TIMER_STATUS.IDLE,
            mode: TIMER_MODE.COUNTDOWN,
            duration: 25 * 60 * 1000,
            elapsed: 0,
            remaining: 25 * 60 * 1000
        },
        user: {
            exp: 0,
            coins: 0,
            level: 1,
            streak: 0,
            totalSessions: 0,
            totalMinutes: 0
        },
        settings: {
            theme: 'night',
            soundEnabled: true,
            vibrationEnabled: true,
            autoStartBreak: false,
            defaultDuration: 25 * 60 * 1000,
            breakDuration: 5 * 60 * 1000
        }
    };

    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(deepClone);
        }
        var result = {};
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = deepClone(obj[key]);
            }
        }
        return result;
    }

    function deepMerge(target, source) {
        var result = deepClone(target);
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                if (
                    source[key] !== null &&
                    typeof source[key] === 'object' &&
                    !Array.isArray(source[key]) &&
                    result[key] !== null &&
                    typeof result[key] === 'object' &&
                    !Array.isArray(result[key])
                ) {
                    result[key] = deepMerge(result[key], source[key]);
                } else {
                    result[key] = deepClone(source[key]);
                }
            }
        }
        return result;
    }

    function getExpForLevel(level) {
        if (level <= 1) return 0;
        return Math.floor(100 * Math.pow(1.5, level - 2));
    }

    function calculateLevel(exp) {
        var level = 1;
        var cumulative = 0;
        while (true) {
            var nextExp = getExpForLevel(level + 1);
            cumulative += nextExp;
            if (exp < cumulative) {
                break;
            }
            level++;
        }
        return level;
    }

    function StateManager() {
        this._state = deepClone(defaultState);
        this._listeners = {};
        this._globalListeners = [];
        this._persistKeys = ['user', 'settings'];
    }

    StateManager.prototype.init = function () {
        try {
            var saved = localStorage.getItem(STATE_KEY);
            if (saved) {
                var parsed = JSON.parse(saved);
                this._state = deepMerge(defaultState, parsed);
            }
        } catch (e) {
            console.warn('[State] Failed to load saved state:', e);
        }
    };

    StateManager.prototype.get = function (path) {
        if (!path) {
            return deepClone(this._state);
        }

        var keys = path.split('.');
        var value = this._state;

        for (var i = 0; i < keys.length; i++) {
            if (value === undefined || value === null) {
                return undefined;
            }
            value = value[keys[i]];
        }

        return deepClone(value);
    };

    StateManager.prototype.set = function (path, value) {
        var keys = path.split('.');
        var oldState = deepClone(this._state);

        if (keys.length === 1) {
            this._state[path] = deepClone(value);
        } else {
            var target = this._state;
            for (var i = 0; i < keys.length - 1; i++) {
                if (target[keys[i]] === undefined) {
                    target[keys[i]] = {};
                }
                target = target[keys[i]];
            }
            target[keys[keys.length - 1]] = deepClone(value);
        }

        var newState = this._state;

        this._notifyGlobal(path, oldState, newState);

        for (var i = 0; i < keys.length; i++) {
            var currentPath = keys.slice(0, i + 1).join('.');
            this._notify(currentPath, oldState, newState);
        }

        this._persistIfNeeded(path);
    };

    StateManager.prototype.update = function (path, updater) {
        var current = this.get(path);
        var updated = updater(current);
        this.set(path, updated);
        return updated;
    };

    StateManager.prototype.subscribe = function (key, callback) {
        var self = this;

        if (typeof key === 'function') {
            callback = key;
            this._globalListeners.push(callback);
            return function () {
                var idx = self._globalListeners.indexOf(callback);
                if (idx > -1) {
                    self._globalListeners.splice(idx, 1);
                }
            };
        }

        if (!this._listeners[key]) {
            this._listeners[key] = [];
        }
        this._listeners[key].push(callback);

        return function () {
            var listeners = self._listeners[key];
            if (listeners) {
                var idx = listeners.indexOf(callback);
                if (idx > -1) {
                    listeners.splice(idx, 1);
                }
            }
        };
    };

    StateManager.prototype._notify = function (key, oldState, newState) {
        var listeners = this._listeners[key];
        if (!listeners || listeners.length === 0) {
            return;
        }

        var oldVal = this._getByPath(oldState, key);
        var newVal = this._getByPath(newState, key);

        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i](newVal, oldVal, key);
            } catch (e) {
                console.error('[State] Listener error for "' + key + '":', e);
            }
        }
    };

    StateManager.prototype._notifyGlobal = function (changedPath, oldState, newState) {
        for (var i = 0; i < this._globalListeners.length; i++) {
            try {
                this._globalListeners[i](changedPath, oldState, newState);
            } catch (e) {
                console.error('[State] Global listener error:', e);
            }
        }
    };

    StateManager.prototype._getByPath = function (obj, path) {
        var keys = path.split('.');
        var value = obj;
        for (var i = 0; i < keys.length; i++) {
            if (value === undefined || value === null) {
                return undefined;
            }
            value = value[keys[i]];
        }
        return value;
    };

    StateManager.prototype._persistIfNeeded = function (changedPath) {
        var shouldPersist = false;
        for (var i = 0; i < this._persistKeys.length; i++) {
            if (changedPath === this._persistKeys[i] ||
                changedPath.indexOf(this._persistKeys[i] + '.') === 0) {
                shouldPersist = true;
                break;
            }
        }

        if (shouldPersist) {
            this._saveToStorage();
        }
    };

    StateManager.prototype._saveToStorage = function () {
        try {
            var toSave = {};
            for (var i = 0; i < this._persistKeys.length; i++) {
                var key = this._persistKeys[i];
                toSave[key] = this._state[key];
            }
            localStorage.setItem(STATE_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('[State] Failed to persist state:', e);
        }
    };

    StateManager.prototype.addExp = function (amount) {
        var self = this;
        this.update('user', function (user) {
            user.exp += amount;
            var newLevel = calculateLevel(user.exp);
            if (newLevel > user.level) {
                user.level = newLevel;
            }
            return user;
        });
    };

    StateManager.prototype.addCoins = function (amount) {
        this.update('user', function (user) {
            user.coins += amount;
            if (user.coins < 0) {
                user.coins = 0;
            }
            return user;
        });
    };

    StateManager.prototype.recordSession = function (minutes) {
        this.update('user', function (user) {
            user.totalSessions += 1;
            user.totalMinutes += minutes;
            return user;
        });
    };

    StateManager.prototype.setTheme = function (theme) {
        if (['day', 'night', 'eye'].indexOf(theme) === -1) {
            return;
        }
        this.set('settings.theme', theme);
    };

    StateManager.prototype.reset = function () {
        this._state = deepClone(defaultState);
        try {
            localStorage.removeItem(STATE_KEY);
        } catch (e) {}
        this._notifyGlobal('*', {}, this._state);
    };

    var appState = new StateManager();

    global.TmindState = appState;
    global.TmindStateConst = {
        TIMER_STATUS: TIMER_STATUS,
        TIMER_MODE: TIMER_MODE
    };

})(window);
