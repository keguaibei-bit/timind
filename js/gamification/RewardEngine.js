(function (global) {
    'use strict';

    var XP_PER_MINUTE = 10;
    var COINS_PER_MINUTE = 1;

    function calculateReward(durationMs, completed) {
        var minutes = Math.max(1, Math.round(durationMs / 60000));

        var xp = 0;
        var coins = 0;

        if (completed) {
            xp = minutes * XP_PER_MINUTE;
            coins = minutes * COINS_PER_MINUTE;
        } else {
            xp = Math.floor(minutes * XP_PER_MINUTE * 0.3);
            coins = 0;
        }

        return {
            minutes: minutes,
            xp: xp,
            coins: coins,
            completed: completed
        };
    }

    function distributeRewards(sessionData) {
        var durationMs = sessionData.duration || 0;
        var completed = sessionData.completed !== false;

        var reward = calculateReward(durationMs, completed);

        var prevState = TmindState.get('user');
        var prevLevel = LevelSystem.getLevelFromXP(prevState.exp || 0);
        var prevStats = null;
        var prevSessions = [];

        try {
            prevSessions = TmindStorage.getAllSessions() || [];
            prevStats = BadgeSystem.computeStats(prevSessions);
        } catch (e) {
            prevStats = BadgeSystem.computeStats([]);
        }

        var updatedUser = {
            exp: (prevState.exp || 0) + reward.xp,
            coins: (prevState.coins || 0) + reward.coins,
            level: 0,
            streak: prevState.streak || 0,
            totalSessions: (prevState.totalSessions || 0) + 1,
            totalMinutes: (prevState.totalMinutes || 0) + reward.minutes
        };

        updatedUser.level = LevelSystem.getLevelFromXP(updatedUser.exp);

        TmindState.set('user', updatedUser);

        try {
            var sessionToSave = {
                startTime: sessionData.startTime || Date.now(),
                endTime: sessionData.endTime || Date.now(),
                duration: durationMs,
                mode: sessionData.mode || 'countdown',
                completed: completed,
                interrupted: !completed,
                expEarned: reward.xp,
                coinsEarned: reward.coins,
                subject: sessionData.subject || null
            };
            TmindStorage.saveSession(sessionToSave);
        } catch (e) {
            console.error('[RewardEngine] Failed to save session:', e);
        }

        var newLevel = updatedUser.level;
        var leveledUp = newLevel > prevLevel;
        var newLevelTitle = null;
        if (leveledUp) {
            newLevelTitle = LevelSystem.getLevelTitle(newLevel);
        }

        var newSessions = [];
        var newStats = null;
        try {
            newSessions = TmindStorage.getAllSessions() || [];
            newStats = BadgeSystem.computeStats(newSessions);
        } catch (e) {
            newStats = BadgeSystem.computeStats([]);
        }

        var newBadges = BadgeSystem.getNewlyUnlocked(prevStats, newStats);

        var result = {
            reward: reward,
            leveledUp: leveledUp,
            newLevel: newLevel,
            prevLevel: prevLevel,
            newLevelTitle: newLevelTitle,
            newBadges: newBadges,
            totalBadges: BadgeSystem.checkBadges(newStats).unlocked.length
        };

        return result;
    }

    global.RewardEngine = {
        XP_PER_MINUTE: XP_PER_MINUTE,
        COINS_PER_MINUTE: COINS_PER_MINUTE,
        calculateReward: calculateReward,
        distributeRewards: distributeRewards
    };

})(window);
