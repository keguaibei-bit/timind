(function (global) {
    'use strict';

    var KEY_PREFIX = 'timind_';
    var SESSIONS_PREFIX = KEY_PREFIX + 'sessions_';
    var SETTINGS_KEY = KEY_PREFIX + 'settings';
    var STATS_KEY = KEY_PREFIX + 'stats';
    var MAX_KEY_SIZE = 4.5 * 1024 * 1024;

    function getMonthKey(date) {
        var d = date || new Date();
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, '0');
        return SESSIONS_PREFIX + year + '_' + month;
    }

    function getAvailableMonths() {
        var months = [];
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf(SESSIONS_PREFIX) === 0) {
                    var monthStr = key.replace(SESSIONS_PREFIX, '');
                    months.push(monthStr);
                }
            }
        } catch (e) {
            console.warn('[Storage] Failed to list months:', e);
        }
        months.sort().reverse();
        return months;
    }

    function safeGetItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('[Storage] Failed to get "' + key + '":', e);
            return null;
        }
    }

    function safeSetItem(key, value) {
        try {
            var jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
            if (jsonStr.length > MAX_KEY_SIZE) {
                console.warn('[Storage] Value for "' + key + '" exceeds 4.5MB, may fail');
            }
            localStorage.setItem(key, jsonStr);
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.error('[Storage] Quota exceeded for key "' + key + '"');
            } else {
                console.error('[Storage] Failed to set "' + key + '":', e);
            }
            return false;
        }
    }

    function safeRemoveItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn('[Storage] Failed to remove "' + key + '":', e);
            return false;
        }
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    var Storage = {};

    Storage.saveSession = function (session) {
        if (!session || typeof session !== 'object') {
            return null;
        }

        var sessionRecord = {
            id: session.id || generateId(),
            startTime: session.startTime || Date.now(),
            endTime: session.endTime || Date.now(),
            duration: session.duration || 0,
            mode: session.mode || 'countdown',
            completed: session.completed || false,
            interrupted: session.interrupted || false,
            tag: session.tag || '',
            subject: session.subject || '',
            note: session.note || '',
            expEarned: session.expEarned || 0,
            coinsEarned: session.coinsEarned || 0
        };

        var monthKey = getMonthKey(new Date(sessionRecord.startTime));
        var sessions = this.getMonthSessions(monthKey);

        sessions.push(sessionRecord);

        var success = safeSetItem(monthKey, sessions);
        if (success) {
            this._updateStats(sessionRecord);
            return sessionRecord;
        }
        return null;
    };

    Storage.getMonthSessions = function (monthKeyOrDate) {
        var key;
        if (monthKeyOrDate && monthKeyOrDate.indexOf(SESSIONS_PREFIX) === 0) {
            key = monthKeyOrDate;
        } else if (monthKeyOrDate instanceof Date) {
            key = getMonthKey(monthKeyOrDate);
        } else {
            key = getMonthKey(new Date());
        }

        var raw = safeGetItem(key);
        if (!raw) {
            return [];
        }

        try {
            var sessions = JSON.parse(raw);
            if (!Array.isArray(sessions)) {
                return [];
            }
            return sessions;
        } catch (e) {
            console.warn('[Storage] Failed to parse sessions for ' + key, e);
            return [];
        }
    };

    Storage.getRecentSessions = function (limit) {
        limit = limit || 20;
        var months = getAvailableMonths();
        var result = [];

        for (var i = 0; i < months.length; i++) {
            var sessions = this.getMonthSessions(SESSIONS_PREFIX + months[i]);
            for (var j = sessions.length - 1; j >= 0 && result.length < limit; j--) {
                result.push(sessions[j]);
            }
            if (result.length >= limit) {
                break;
            }
        }

        return result;
    };

    Storage.getAllSessions = function () {
        var months = getAvailableMonths();
        var allSessions = [];

        for (var i = 0; i < months.length; i++) {
            var sessions = this.getMonthSessions(SESSIONS_PREFIX + months[i]);
            allSessions = allSessions.concat(sessions);
        }

        allSessions.sort(function (a, b) {
            return b.startTime - a.startTime;
        });

        return allSessions;
    };

    Storage.getSessionById = function (id) {
        if (!id) return null;

        var months = getAvailableMonths();
        for (var i = 0; i < months.length; i++) {
            var sessions = this.getMonthSessions(SESSIONS_PREFIX + months[i]);
            for (var j = 0; j < sessions.length; j++) {
                if (sessions[j].id === id) {
                    return sessions[j];
                }
            }
        }
        return null;
    };

    Storage.deleteSession = function (id) {
        if (!id) return false;

        var months = getAvailableMonths();
        for (var i = 0; i < months.length; i++) {
            var key = SESSIONS_PREFIX + months[i];
            var sessions = this.getMonthSessions(key);
            var idx = -1;
            for (var j = 0; j < sessions.length; j++) {
                if (sessions[j].id === id) {
                    idx = j;
                    break;
                }
            }
            if (idx > -1) {
                sessions.splice(idx, 1);
                return safeSetItem(key, sessions);
            }
        }
        return false;
    };

    Storage.getStats = function () {
        var raw = safeGetItem(STATS_KEY);
        if (!raw) {
            return {
                totalSessions: 0,
                totalMinutes: 0,
                totalExp: 0,
                totalCoins: 0,
                longestStreak: 0,
                currentStreak: 0,
                lastSessionDate: null
            };
        }
        try {
            return JSON.parse(raw);
        } catch (e) {
            return {
                totalSessions: 0,
                totalMinutes: 0,
                totalExp: 0,
                totalCoins: 0,
                longestStreak: 0,
                currentStreak: 0,
                lastSessionDate: null
            };
        }
    };

    Storage._updateStats = function (session) {
        var stats = this.getStats();
        var minutes = Math.round(session.duration / 60000);

        stats.totalSessions += 1;
        stats.totalMinutes += minutes;
        stats.totalExp += session.expEarned || 0;
        stats.totalCoins += session.coinsEarned || 0;

        var today = new Date().toDateString();
        var lastDate = session.lastSessionDate ? new Date(session.lastSessionDate).toDateString() : null;

        if (session.completed) {
            var sessionDate = new Date(session.startTime).toDateString();
            var yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            var yesterdayStr = yesterday.toDateString();

            if (stats.lastSessionDate === sessionDate) {
            } else if (stats.lastSessionDate === yesterdayStr) {
                stats.currentStreak += 1;
            } else {
                stats.currentStreak = 1;
            }

            if (stats.currentStreak > stats.longestStreak) {
                stats.longestStreak = stats.currentStreak;
            }

            stats.lastSessionDate = sessionDate;
        }

        safeSetItem(STATS_KEY, stats);
        return stats;
    };

    Storage.getDailyStats = function (date) {
        var targetDate = date || new Date();
        var targetStr = targetDate.toDateString();
        var sessions = this.getMonthSessions(targetDate);
        var daySessions = [];
        var totalMinutes = 0;

        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            var sessionDate = new Date(s.startTime).toDateString();
            if (sessionDate === targetStr) {
                daySessions.push(s);
                totalMinutes += Math.round(s.duration / 60000);
            }
        }

        return {
            date: targetDate.toISOString().split('T')[0],
            sessions: daySessions,
            count: daySessions.length,
            totalMinutes: totalMinutes
        };
    };

    Storage.getWeeklyStats = function (date) {
        var target = date ? new Date(date) : new Date();
        var dayOfWeek = target.getDay() || 7;
        var monday = new Date(target);
        monday.setDate(target.getDate() - dayOfWeek + 1);
        monday.setHours(0, 0, 0, 0);

        var days = [];
        var totalMinutes = 0;
        var totalSessions = 0;

        for (var i = 0; i < 7; i++) {
            var day = new Date(monday);
            day.setDate(monday.getDate() + i);
            var dayStats = this.getDailyStats(day);
            days.push({
                date: day.toISOString().split('T')[0],
                dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day.getDay()],
                minutes: dayStats.totalMinutes,
                sessions: dayStats.count
            });
            totalMinutes += dayStats.totalMinutes;
            totalSessions += dayStats.count;
        }

        return {
            days: days,
            totalMinutes: totalMinutes,
            totalSessions: totalSessions,
            weekStart: days[0].date,
            weekEnd: days[6].date
        };
    };

    Storage.getMonthlyStats = function (date) {
        var monthSessions = this.getMonthSessions(date);
        var totalMinutes = 0;
        var completedCount = 0;

        for (var i = 0; i < monthSessions.length; i++) {
            var s = monthSessions[i];
            totalMinutes += Math.round(s.duration / 60000);
            if (s.completed) {
                completedCount += 1;
            }
        }

        return {
            totalSessions: monthSessions.length,
            completedSessions: completedCount,
            totalMinutes: totalMinutes,
            averagePerSession: monthSessions.length > 0
                ? Math.round(totalMinutes / monthSessions.length)
                : 0
        };
    };

    Storage.exportAll = function () {
        var exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            sessions: {},
            stats: this.getStats(),
            settings: this.getSettings()
        };

        var months = getAvailableMonths();
        for (var i = 0; i < months.length; i++) {
            var key = SESSIONS_PREFIX + months[i];
            exportData.sessions[months[i]] = this.getMonthSessions(key);
        }

        return exportData;
    };

    Storage.exportToFile = function () {
        var exportData = this.exportAll();
        var jsonStr = JSON.stringify(exportData, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var a = document.createElement('a');
        a.href = url;
        a.download = 'timind_export_' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    Storage.importFromFile = function (file, callback) {
        var self = this;
        var reader = new FileReader();

        reader.onload = function (e) {
            try {
                var data = JSON.parse(e.target.result);
                if (!data || !data.sessions) {
                    callback(new Error('无效的数据格式'), null);
                    return;
                }

                var importedSessions = 0;

                for (var month in data.sessions) {
                    if (data.sessions.hasOwnProperty(month)) {
                        var key = SESSIONS_PREFIX + month;
                        var existing = self.getMonthSessions(key);
                        var imported = data.sessions[month];

                        var existingIds = {};
                        for (var i = 0; i < existing.length; i++) {
                            existingIds[existing[i].id] = true;
                        }

                        for (var j = 0; j < imported.length; j++) {
                            if (!existingIds[imported[j].id]) {
                                existing.push(imported[j]);
                                importedSessions += 1;
                            }
                        }

                        safeSetItem(key, existing);
                    }
                }

                if (data.stats) {
                    var currentStats = self.getStats();
                    var mergedStats = {
                        totalSessions: Math.max(currentStats.totalSessions, data.stats.totalSessions || 0),
                        totalMinutes: Math.max(currentStats.totalMinutes, data.stats.totalMinutes || 0),
                        totalExp: Math.max(currentStats.totalExp, data.stats.totalExp || 0),
                        totalCoins: Math.max(currentStats.totalCoins, data.stats.totalCoins || 0),
                        longestStreak: Math.max(currentStats.longestStreak, data.stats.longestStreak || 0),
                        currentStreak: currentStats.currentStreak || data.stats.currentStreak || 0,
                        lastSessionDate: currentStats.lastSessionDate || data.stats.lastSessionDate || null
                    };
                    safeSetItem(STATS_KEY, mergedStats);
                }

                callback(null, {
                    importedSessions: importedSessions,
                    success: true
                });
            } catch (err) {
                callback(err, null);
            }
        };

        reader.onerror = function () {
            callback(new Error('文件读取失败'), null);
        };

        reader.readAsText(file);
    };

    Storage.getSettings = function () {
        var raw = safeGetItem(SETTINGS_KEY);
        if (!raw) {
            return {};
        }
        try {
            return JSON.parse(raw);
        } catch (e) {
            return {};
        }
    };

    Storage.saveSettings = function (settings) {
        return safeSetItem(SETTINGS_KEY, settings);
    };

    Storage.clearAll = function () {
        var months = getAvailableMonths();
        for (var i = 0; i < months.length; i++) {
            safeRemoveItem(SESSIONS_PREFIX + months[i]);
        }
        safeRemoveItem(STATS_KEY);
        safeRemoveItem(SETTINGS_KEY);
        return true;
    };

    Storage.getStorageInfo = function () {
        var totalSize = 0;
        var keyCount = 0;
        var largestKey = { name: '', size: 0 };

        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf(KEY_PREFIX) === 0) {
                    var value = localStorage.getItem(key) || '';
                    var size = value.length * 2;
                    totalSize += size;
                    keyCount += 1;
                    if (size > largestKey.size) {
                        largestKey.name = key;
                        largestKey.size = size;
                    }
                }
            }
        } catch (e) {}

        return {
            totalKeys: keyCount,
            totalSizeBytes: totalSize,
            totalSizeKB: Math.round(totalSize / 1024),
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            largestKey: largestKey.name,
            largestKeySizeKB: Math.round(largestKey.size / 1024)
        };
    };

    // ===== AI 配置存取 =====
    var AI_CONFIG_KEY = 'timind_ai_config';

    Storage.saveAIConfig = function (config) {
        try {
            var data = {
                provider: config.provider || 'deepseek',
                apiKey: config.apiKey || '',
                model: config.model || '',
                savedAt: Date.now()
            };
            localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('[Storage] saveAIConfig error:', e);
            return false;
        }
    };

    Storage.getAIConfig = function () {
        try {
            var raw = localStorage.getItem(AI_CONFIG_KEY);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || !data.apiKey) return null;
            return data;
        } catch (e) {
            return null;
        }
    };

    Storage.clearAIConfig = function () {
        try {
            localStorage.removeItem(AI_CONFIG_KEY);
            return true;
        } catch (e) {
            return false;
        }
    };

    global.TmindStorage = Storage;

})(window);
