(function (global) {
    'use strict';

    /**
     * DemoDataInjector —— 评委专享：一键注入备考体验数据
     * 依赖：TmindStorage、TmindState、BadgeSystem、LevelSystem
     *
     * 注入内容：
     *   1. 过去 7 天的模拟专注会话（覆盖高数/英语/专业课/自由工作分类）
     *   2. 全局状态：Lv.3、1500 XP、180 金币
     *   3. 自动点亮 first_focus / math_master / english_master / night_owl / half_day 等徽章
     */
    var DemoDataInjector = {};

    // 分类映射：tag 为中文显示名（CategoryChart 使用），subject 为英文 key（BadgeSystem 使用）
    var CATEGORY_MAP = {
        math: { tag: '高数', subject: 'math' },
        english: { tag: '英语', subject: 'english' },
        professional: { tag: '专业课', subject: 'professional' },
        free: { tag: '自由工作', subject: 'other' }
    };

    function pad(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    function genId() {
        return 'demo_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    }

    /**
     * 生成过去 7 天的模拟会话数据
     */
    function generateDemoSessions() {
        var now = new Date();
        var sessions = [];

        // 每天 2-3 次专注，覆盖不同分类
        // dayOffset: 0=今天, 1=昨天, ..., 6=6天前
        var plan = [
            // 6 天前
            { offset: 6, items: [
                { hour: 9,  minute: 30, cat: 'math',        durMin: 50 },
                { hour: 14, minute: 0,  cat: 'english',     durMin: 45 },
                { hour: 20, minute: 30, cat: 'professional', durMin: 60 }
            ]},
            // 5 天前
            { offset: 5, items: [
                { hour: 10, minute: 0,  cat: 'math',    durMin: 55 },
                { hour: 19, minute: 0,  cat: 'english', durMin: 40 }
            ]},
            // 4 天前
            { offset: 4, items: [
                { hour: 9,  minute: 0,  cat: 'professional', durMin: 70 },
                { hour: 15, minute: 30, cat: 'math',          durMin: 50 },
                { hour: 22, minute: 0,  cat: 'english',       durMin: 35 }  // 夜间
            ]},
            // 3 天前
            { offset: 3, items: [
                { hour: 8,  minute: 30, cat: 'english', durMin: 45 },
                { hour: 14, minute: 0,  cat: 'math',    durMin: 60 },
                { hour: 21, minute: 0,  cat: 'free',    durMin: 30 }
            ]},
            // 2 天前
            { offset: 2, items: [
                { hour: 9,  minute: 30, cat: 'math',        durMin: 65 },
                { hour: 16, minute: 0,  cat: 'professional', durMin: 55 },
                { hour: 22, minute: 30, cat: 'english',      durMin: 40 }  // 夜间
            ]},
            // 昨天
            { offset: 1, items: [
                { hour: 10, minute: 0,  cat: 'math',    durMin: 75 },
                { hour: 15, minute: 0,  cat: 'english', durMin: 50 },
                { hour: 20, minute: 0,  cat: 'free',     durMin: 25 }
            ]},
            // 今天
            { offset: 0, items: [
                { hour: 9,  minute: 0,  cat: 'math',        durMin: 45 },
                { hour: 14, minute: 30, cat: 'english',     durMin: 40 },
                { hour: 19, minute: 0,  cat: 'professional', durMin: 50 }
            ]}
        ];

        for (var i = 0; i < plan.length; i++) {
            var day = plan[i];
            for (var j = 0; j < day.items.length; j++) {
                var item = day.items[j];
                var sessionDate = new Date(now);
                sessionDate.setDate(now.getDate() - day.offset);
                sessionDate.setHours(item.hour, item.minute, 0, 0);

                var startTs = sessionDate.getTime();
                var durationMs = item.durMin * 60 * 1000;
                var endTs = startTs + durationMs;

                var cat = CATEGORY_MAP[item.cat] || CATEGORY_MAP.free;

                // 经验/金币按 RewardEngine 规则计算
                var xp = item.durMin * 10;
                var coins = item.durMin * 1;

                sessions.push({
                    id: genId(),
                    startTime: startTs,
                    endTime: endTs,
                    duration: durationMs,
                    mode: 'countdown',
                    completed: true,
                    interrupted: false,
                    tag: cat.tag,
                    subject: cat.subject,
                    note: '',
                    expEarned: xp,
                    coinsEarned: coins
                });
            }
        }

        return sessions;
    }

    /**
     * 计算注入后会话的统计概要（供调试与日志）
     */
    function summarizeSessions(sessions) {
        var totalMinutes = 0;
        var subjectMinutes = { math: 0, english: 0, professional: 0, other: 0 };
        for (var i = 0; i < sessions.length; i++) {
            var min = Math.round(sessions[i].duration / 60000);
            totalMinutes += min;
            var subj = sessions[i].subject || 'other';
            if (subjectMinutes[subj] === undefined) subj = 'other';
            subjectMinutes[subj] += min;
        }
        return {
            count: sessions.length,
            totalMinutes: totalMinutes,
            subjectMinutes: subjectMinutes
        };
    }

    /**
     * 一键注入演示数据
     * @param {Object} options { skipSessions: 跳过会话注入, skipUser: 跳过用户状态注入 }
     * @returns {Object} 注入结果概要
     */
    DemoDataInjector.inject = function (options) {
        options = options || {};
        var result = {
            sessionsInjected: 0,
            userStateSet: false,
            summary: null,
            badgesUnlocked: []
        };

        // 1. 注入过去 7 天的会话数据
        if (!options.skipSessions) {
            try {
                // 先清理旧演示数据（仅清理 demo_ 前缀的，避免误删真实数据）
                DemoDataInjector.clearDemoSessions();

                var sessions = generateDemoSessions();
                for (var i = 0; i < sessions.length; i++) {
                    TmindStorage.saveSession(sessions[i]);
                }
                result.sessionsInjected = sessions.length;
                result.summary = summarizeSessions(sessions);
            } catch (e) {
                console.error('[DemoDataInjector] 注入会话失败:', e);
            }
        }

        // 2. 设置全局用户状态：Lv.3、1500 XP、180 金币
        //    LevelSystem: level = floor(sqrt(xp/100))，1500 → sqrt(15)≈3.87 → Lv.3 ✓
        if (!options.skipUser) {
            try {
                var allSessions = TmindStorage.getAllSessions() || [];
                var stats = BadgeSystem.computeStats(allSessions);
                var totalMinutes = stats.totalMinutes || 0;
                var totalSessions = stats.totalSessions || 0;
                var streak = stats.currentStreak || 0;

                var targetExp = 1500;
                var targetLevel = LevelSystem.getLevelFromXP(targetExp);

                var newUser = {
                    exp: targetExp,
                    coins: 180,
                    level: targetLevel,
                    streak: Math.max(streak, 7),
                    totalSessions: totalSessions,
                    totalMinutes: totalMinutes
                };
                TmindState.set('user', newUser);
                result.userStateSet = true;
            } catch (e) {
                console.error('[DemoDataInjector] 设置用户状态失败:', e);
            }
        }

        // 3. 检查点亮的徽章
        try {
            var checkSessions = TmindStorage.getAllSessions() || [];
            var checkStats = BadgeSystem.computeStats(checkSessions);
            var badgeResult = BadgeSystem.checkBadges(checkStats);
            for (var k = 0; k < badgeResult.unlocked.length; k++) {
                result.badgesUnlocked.push(badgeResult.unlocked[k].name);
            }
        } catch (e) {
            console.warn('[DemoDataInjector] 徽章检测失败:', e);
        }

        console.log('[DemoDataInjector] 注入完成:', result);
        return result;
    };

    /**
     * 清理所有 demo_ 前缀的会话数据
     */
    DemoDataInjector.clearDemoSessions = function () {
        try {
            var months = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf('timind_sessions_') === 0) {
                    months.push(key);
                }
            }

            for (var j = 0; j < months.length; j++) {
                var raw = localStorage.getItem(months[j]);
                if (!raw) continue;
                var sessions = JSON.parse(raw);
                if (!Array.isArray(sessions)) continue;

                var filtered = sessions.filter(function (s) {
                    return !(s.id && typeof s.id === 'string' && s.id.indexOf('demo_') === 0);
                });

                if (filtered.length !== sessions.length) {
                    localStorage.setItem(months[j], JSON.stringify(filtered));
                }
            }
        } catch (e) {
            console.warn('[DemoDataInjector] 清理旧演示数据失败:', e);
        }
    };

    /**
     * 重置：清理所有演示数据并重置用户状态
     */
    DemoDataInjector.reset = function () {
        DemoDataInjector.clearDemoSessions();
        try {
            TmindState.reset();
        } catch (e) {}
    };

    global.DemoDataInjector = DemoDataInjector;

})(window);
