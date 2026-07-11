(function (global) {
    'use strict';

    var BADGES = [
        {
            id: 'first_focus',
            name: '初试锋芒',
            description: '完成你的第一次专注',
            icon: '🎯',
            category: 'milestone',
            check: function (stats) {
                return stats.totalSessions >= 1;
            }
        },
        {
            id: 'math_master',
            name: '高数推演者',
            description: '高数分类专注累计满 120 分钟',
            icon: '📐',
            category: 'subject',
            check: function (stats) {
                return stats.subjectMinutes && stats.subjectMinutes.math >= 120;
            }
        },
        {
            id: 'english_master',
            name: '词霸觉醒',
            description: '英语分类专注累计满 120 分钟',
            icon: '📖',
            category: 'subject',
            check: function (stats) {
                return stats.subjectMinutes && stats.subjectMinutes.english >= 120;
            }
        },
        {
            id: 'night_owl',
            name: '夜猫子',
            description: '在晚上 10 点后完成专注',
            icon: '🦉',
            category: 'time',
            check: function (stats) {
                return stats.hasNightSession === true;
            }
        },
        {
            id: 'half_day',
            name: '半日乾坤',
            description: '单次专注达到 60 分钟',
            icon: '⏳',
            category: 'duration',
            check: function (stats) {
                return stats.longestSession >= 60;
            }
        },
        {
            id: 'streak_7',
            name: '坚持七日',
            description: '连续 7 天完成专注',
            icon: '🔥',
            category: 'streak',
            check: function (stats) {
                return stats.maxStreak >= 7;
            }
        },
        {
            id: 'streak_30',
            name: '月度坚持',
            description: '连续 30 天完成专注',
            icon: '💎',
            category: 'streak',
            check: function (stats) {
                return stats.maxStreak >= 30;
            }
        },
        {
            id: 'sessions_50',
            name: '专注五十',
            description: '累计完成 50 次专注',
            icon: '🎖️',
            category: 'milestone',
            check: function (stats) {
                return stats.totalSessions >= 50;
            }
        },
        {
            id: 'total_1000',
            name: '千分钟成就',
            description: '累计专注满 1000 分钟',
            icon: '🏅',
            category: 'milestone',
            check: function (stats) {
                return stats.totalMinutes >= 1000;
            }
        }
    ];

    function getBadgeById(id) {
        for (var i = 0; i < BADGES.length; i++) {
            if (BADGES[i].id === id) {
                return BADGES[i];
            }
        }
        return null;
    }

    function getAllBadges() {
        return BADGES.slice();
    }

    function computeStats(sessions) {
        var stats = {
            totalSessions: 0,
            totalMinutes: 0,
            longestSession: 0,
            maxStreak: 0,
            currentStreak: 0,
            hasNightSession: false,
            subjectMinutes: {
                math: 0,
                english: 0,
                politics: 0,
                professional: 0,
                other: 0
            }
        };

        if (!sessions || sessions.length === 0) {
            return stats;
        }

        stats.totalSessions = sessions.length;

        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            var minutes = Math.round((s.duration || 0) / 60000);

            stats.totalMinutes += minutes;

            if (minutes > stats.longestSession) {
                stats.longestSession = minutes;
            }

            var endTime = s.endTime ? new Date(s.endTime) : null;
            if (endTime && endTime.getHours() >= 22) {
                stats.hasNightSession = true;
            }

            if (s.subject && stats.subjectMinutes[s.subject] !== undefined) {
                stats.subjectMinutes[s.subject] += minutes;
            } else if (minutes > 0) {
                stats.subjectMinutes.other += minutes;
            }
        }

        var dates = [];
        for (var j = 0; j < sessions.length; j++) {
            var t = sessions[j].endTime;
            if (t) {
                var d = new Date(t);
                dates.push(d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate());
            }
        }
        dates.sort();
        var uniqueDates = [];
        for (var k = 0; k < dates.length; k++) {
            if (uniqueDates.length === 0 || uniqueDates[uniqueDates.length - 1] !== dates[k]) {
                uniqueDates.push(dates[k]);
            }
        }

        var maxStreak = 0;
        var currentRun = 0;

        for (var m = 0; m < uniqueDates.length; m++) {
            if (m === 0) {
                currentRun = 1;
            } else {
                var prev = new Date(uniqueDates[m - 1]);
                var curr = new Date(uniqueDates[m]);
                var diff = Math.round((curr - prev) / (24 * 60 * 60 * 1000));
                if (diff === 1) {
                    currentRun++;
                } else {
                    currentRun = 1;
                }
            }
            if (currentRun > maxStreak) {
                maxStreak = currentRun;
            }
        }

        stats.maxStreak = maxStreak;

        var today = new Date();
        var todayStr = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
        var yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        var yesterdayStr = yesterday.getFullYear() + '-' + (yesterday.getMonth() + 1) + '-' + yesterday.getDate();

        if (uniqueDates.length > 0) {
            var lastDate = uniqueDates[uniqueDates.length - 1];
            if (lastDate === todayStr) {
                var run = 1;
                for (var n = uniqueDates.length - 2; n >= 0; n--) {
                    var prevDate = new Date(uniqueDates[n]);
                    var nextDate = new Date(uniqueDates[n + 1]);
                    var dayDiff = Math.round((nextDate - prevDate) / (24 * 60 * 60 * 1000));
                    if (dayDiff === 1) {
                        run++;
                    } else {
                        break;
                    }
                }
                stats.currentStreak = run;
            } else if (lastDate === yesterdayStr) {
                var run2 = 1;
                for (var p = uniqueDates.length - 2; p >= 0; p--) {
                    var prevDate2 = new Date(uniqueDates[p]);
                    var nextDate2 = new Date(uniqueDates[p + 1]);
                    var dayDiff2 = Math.round((nextDate2 - prevDate2) / (24 * 60 * 60 * 1000));
                    if (dayDiff2 === 1) {
                        run2++;
                    } else {
                        break;
                    }
                }
                stats.currentStreak = run2;
            } else {
                stats.currentStreak = 0;
            }
        }

        return stats;
    }

    function checkBadges(stats) {
        var unlocked = [];
        var locked = [];

        for (var i = 0; i < BADGES.length; i++) {
            var badge = BADGES[i];
            var isUnlocked = false;
            try {
                isUnlocked = badge.check(stats);
            } catch (e) {
                isUnlocked = false;
            }

            var badgeInfo = {
                id: badge.id,
                name: badge.name,
                description: badge.description,
                icon: badge.icon,
                category: badge.category,
                unlocked: isUnlocked
            };

            if (isUnlocked) {
                unlocked.push(badgeInfo);
            } else {
                locked.push(badgeInfo);
            }
        }

        return {
            unlocked: unlocked,
            locked: locked,
            all: unlocked.concat(locked)
        };
    }

    function getUnlockedBadgeIds(stats) {
        var result = [];
        for (var i = 0; i < BADGES.length; i++) {
            try {
                if (BADGES[i].check(stats)) {
                    result.push(BADGES[i].id);
                }
            } catch (e) {}
        }
        return result;
    }

    function getNewlyUnlocked(prevStats, newStats) {
        var prevIds = getUnlockedBadgeIds(prevStats);
        var newIds = getUnlockedBadgeIds(newStats);
        var result = [];

        for (var i = 0; i < newIds.length; i++) {
            if (prevIds.indexOf(newIds[i]) === -1) {
                var badge = getBadgeById(newIds[i]);
                if (badge) {
                    result.push({
                        id: badge.id,
                        name: badge.name,
                        description: badge.description,
                        icon: badge.icon,
                        category: badge.category,
                        unlocked: true
                    });
                }
            }
        }

        return result;
    }

    global.BadgeSystem = {
        BADGES: BADGES,
        getBadgeById: getBadgeById,
        getAllBadges: getAllBadges,
        computeStats: computeStats,
        checkBadges: checkBadges,
        getUnlockedBadgeIds: getUnlockedBadgeIds,
        getNewlyUnlocked: getNewlyUnlocked
    };

})(window);
