(function (global) {
    'use strict';

    var BASE_XP = 100;

    function getLevelFromXP(xp) {
        if (xp < 0) xp = 0;
        return Math.floor(Math.sqrt(xp / BASE_XP));
    }

    function getTotalXPForLevel(level) {
        return level * level * BASE_XP;
    }

    function getLevelInfo(xp) {
        if (xp < 0) xp = 0;

        var currentLevel = getLevelFromXP(xp);
        var currentLevelTotalXP = getTotalXPForLevel(currentLevel);
        var nextLevelTotalXP = getTotalXPForLevel(currentLevel + 1);
        var levelXPRange = nextLevelTotalXP - currentLevelTotalXP;
        var xpIntoLevel = xp - currentLevelTotalXP;
        var xpToNext = nextLevelTotalXP - xp;
        var progressPercent = levelXPRange > 0 ? (xpIntoLevel / levelXPRange) * 100 : 0;

        if (progressPercent < 0) progressPercent = 0;
        if (progressPercent > 100) progressPercent = 100;

        return {
            level: currentLevel,
            currentLevelXP: currentLevelTotalXP,
            nextLevelXP: nextLevelTotalXP,
            xpIntoLevel: xpIntoLevel,
            xpToNext: xpToNext,
            levelXPRange: levelXPRange,
            progressPercent: progressPercent,
            totalXP: xp
        };
    }

    function getLevelTitle(level) {
        var titles = [
            { min: 0, title: '初心星', icon: '🌱' },
            { min: 3, title: '专注学徒', icon: '⭐' },
            { min: 6, title: '专注达人', icon: '🌟' },
            { min: 10, title: '专注大师', icon: '💫' },
            { min: 15, title: '心流宗师', icon: '🏆' },
            { min: 20, title: '传奇传说', icon: '👑' }
        ];

        var result = titles[0];
        for (var i = 0; i < titles.length; i++) {
            if (level >= titles[i].min) {
                result = titles[i];
            }
        }
        return result;
    }

    function getAllTitles() {
        return [
            { min: 0, title: '初心星', icon: '🌱' },
            { min: 3, title: '专注学徒', icon: '⭐' },
            { min: 6, title: '专注达人', icon: '🌟' },
            { min: 10, title: '专注大师', icon: '💫' },
            { min: 15, title: '心流宗师', icon: '🏆' },
            { min: 20, title: '传奇传说', icon: '👑' }
        ];
    }

    global.LevelSystem = {
        getLevelFromXP: getLevelFromXP,
        getTotalXPForLevel: getTotalXPForLevel,
        getLevelInfo: getLevelInfo,
        getLevelTitle: getLevelTitle,
        getAllTitles: getAllTitles,
        BASE_XP: BASE_XP
    };

})(window);
