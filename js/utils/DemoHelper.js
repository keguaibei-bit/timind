(function (global) {
    'use strict';

    /**
     * DemoHelper —— 评委演示视觉联动控制器
     * 负责：头像从灰转亮、专注星球多级形态进化、计时器环形态切换
     * 依赖：LevelSystem、TmindState
     */
    var DemoHelper = {};

    var TIER_CLASSES = ['tier-1', 'tier-2', 'tier-3'];

    /**
     * 根据等级返回视觉档位
     *   Lv.0-2  → tier-1（暗淡星尘）
     *   Lv.3-5  → tier-2（能量脉冲星）
     *   Lv.6+   → tier-3（智慧极光星）
     */
    function levelToTier(level) {
        if (level >= 6) return 'tier-3';
        if (level >= 3) return 'tier-2';
        return 'tier-1';
    }

    /**
     * 高保真 SVG 头像（备考学霸 / 深度专注大师）
     * 带渐变彩色填充，注入灵魂后替换灰色占位符
     */
    function getActiveAvatarSVG() {
        return ''
            + '<svg viewBox="0 0 120 120" class="avatar-svg" xmlns="http://www.w3.org/2000/svg">'
                // 外圈光晕底色
            +   '<defs>'
            +     '<radialGradient id="avBg" cx="50%" cy="40%" r="60%">'
            +       '<stop offset="0%" stop-color="#ffd9a0" />'
            +       '<stop offset="60%" stop-color="#ff9a76" />'
            +       '<stop offset="100%" stop-color="#667eea" />'
            +     '</radialGradient>'
            +     '<linearGradient id="avHair" x1="0%" y1="0%" x2="100%" y2="100%">'
            +       '<stop offset="0%" stop-color="#3a2a1a" />'
            +       '<stop offset="100%" stop-color="#1a0f08" />'
            +     '</linearGradient>'
            +     '<linearGradient id="avSkin" x1="0%" y1="0%" x2="0%" y2="100%">'
            +       '<stop offset="0%" stop-color="#ffe0c4" />'
            +       '<stop offset="100%" stop-color="#f5c79a" />'
            +     '</linearGradient>'
            +     '<linearGradient id="avRobe" x1="0%" y1="0%" x2="100%" y2="100%">'
            +       '<stop offset="0%" stop-color="#4facfe" />'
            +       '<stop offset="100%" stop-color="#667eea" />'
            +     '</linearGradient>'
            +   '</defs>'

                // 背景圆
            +   '<circle cx="60" cy="60" r="58" fill="url(#avBg)" />'

                // 学士帽（学霸象征）
            +   '<polygon points="60,18 96,32 60,46 24,32" fill="#1a1d2e" />'
            +   '<path d="M90,34 L90,44 Q90,48 86,48 L82,46 L82,38 Z" fill="#0f1119" />'
            +   '<line x1="82" y1="46" x2="74" y2="58" stroke="#fbbf24" stroke-width="1.5" />'
            +   '<circle cx="73" cy="59" r="2.5" fill="#fbbf24" />'

                // 头发
            +   '<path d="M40,52 Q42,40 60,38 Q78,40 80,52 L80,58 Q72,50 60,50 Q48,50 40,58 Z" fill="url(#avHair)" />'

                // 脸部
            +   '<ellipse cx="60" cy="62" rx="14" ry="16" fill="url(#avSkin)" />'

                // 眼睛（专注凝视）
            +   '<circle cx="54" cy="60" r="1.8" fill="#1a1d2e" />'
            +   '<circle cx="66" cy="60" r="1.8" fill="#1a1d2e" />'
            +   '<circle cx="54.5" cy="59.3" r="0.6" fill="#fff" />'
            +   '<circle cx="66.5" cy="59.3" r="0.6" fill="#fff" />'

                // 嘴角自信微笑
            +   '<path d="M55,68 Q60,72 65,68" fill="none" stroke="#9a4a3a" stroke-width="1.4" stroke-linecap="round" />'

                // 脖子
            +   '<rect x="55" y="76" width="10" height="6" fill="url(#avSkin)" />'

                // 学袍
            +   '<path d="M30,120 Q30,88 60,84 Q90,88 90,120 Z" fill="url(#avRobe)" />'

                // 学袍高光线条
            +   '<path d="M60,84 L60,120" stroke="rgba(255,255,255,0.15)" stroke-width="1" />'

                // 领口
            +   '<path d="M48,86 L60,96 L72,86" fill="none" stroke="#1a1d2e" stroke-width="1.5" />'

                // 胸前徽章（专注勋章）
            +   '<circle cx="60" cy="104" r="4" fill="#fbbf24" />'
            +   '<circle cx="60" cy="104" r="2" fill="#fff8e0" />'
            + '</svg>';
    }

    function getInactiveAvatarSVG() {
        return ''
            + '<svg viewBox="0 0 120 120" class="avatar-svg avatar-svg-inactive" xmlns="http://www.w3.org/2000/svg">'
            +   '<circle cx="60" cy="60" r="58" fill="#2a2d3e" />'
            +   '<circle cx="60" cy="48" r="16" fill="#4a4d5e" />'
            +   '<path d="M28,100 Q28,72 60,72 Q92,72 92,100 Z" fill="#4a4d5e" />'
            + '</svg>';
    }

    /**
     * 更新右上角头像
     * @param {Boolean} active 是否激活
     * @param {Number} level 当前等级（用于呼吸光晕强度）
     */
    function updateAvatar(active, level) {
        var avatarEl = document.getElementById('userAvatar');
        if (!avatarEl) return;

        // 清空旧内容
        avatarEl.innerHTML = '';

        if (active) {
            avatarEl.innerHTML = getActiveAvatarSVG();
            avatarEl.classList.add('avatar-active');
            avatarEl.classList.remove('avatar-inactive');

            // 根据等级调整光晕强度
            var glowStrength = 12;
            if (level >= 6) glowStrength = 28;
            else if (level >= 3) glowStrength = 20;

            avatarEl.style.setProperty('--avatar-glow-strength', glowStrength + 'px');
        } else {
            avatarEl.innerHTML = getInactiveAvatarSVG();
            avatarEl.classList.add('avatar-inactive');
            avatarEl.classList.remove('avatar-active');
        }
    }

    /**
     * 更新计时器环形态
     */
    function updateTimerRing(level) {
        var ring = document.getElementById('timerRing');
        if (!ring) return;

        // 移除所有 tier class
        for (var i = 0; i < TIER_CLASSES.length; i++) {
            ring.classList.remove(TIER_CLASSES[i]);
        }

        var tier = levelToTier(level);
        ring.classList.add(tier);
    }

    /**
     * 更新专注星球视图
     */
    function updatePlanet(level) {
        var planetVisual = document.querySelector('.planet-visual');
        if (!planetVisual) return;

        // 移除所有 tier class
        for (var i = 0; i < TIER_CLASSES.length; i++) {
            planetVisual.classList.remove(TIER_CLASSES[i]);
        }

        var tier = levelToTier(level);
        planetVisual.classList.add(tier);

        // 根据档位注入不同的星球 SVG
        planetVisual.innerHTML = getPlanetSVG(tier, level);

        // 更新星球名称与等级文本
        var info = getPlanetInfo(level);
        var nameEl = document.querySelector('.planet-name');
        var levelEl = document.querySelector('.planet-level');
        if (nameEl) nameEl.textContent = info.name;
        if (levelEl) levelEl.textContent = 'Lv.' + level;

        // 更新进度条
        try {
            var levelInfo = LevelSystem.getLevelInfo(TmindState.get('user.exp') || 0);
            var progressFill = document.querySelector('.planet-progress .progress-fill');
            var progressLabel = document.querySelector('.planet-progress .progress-label');
            if (progressFill) {
                progressFill.style.width = levelInfo.progressPercent + '%';
            }
            if (progressLabel) {
                progressLabel.textContent = '星球成长进度 · ' + Math.round(levelInfo.progressPercent) + '%';
            }
        } catch (e) {}
    }

    function getPlanetInfo(level) {
        if (level >= 6) return { name: '上岸能量星', icon: '🌟' };
        if (level >= 3) return { name: '能量脉冲星', icon: '⚡' };
        return { name: '初心星', icon: '🪐' };
    }

    /**
     * 不同档位的星球 SVG
     */
    function getPlanetSVG(tier, level) {
        if (tier === 'tier-3') {
            // 智慧极光星：璀璨星环 + 极光色彩
            return ''
                + '<svg viewBox="0 0 200 200" class="planet-svg planet-svg-tier3" xmlns="http://www.w3.org/2000/svg">'
                +   '<defs>'
                +     '<radialGradient id="p3core" cx="40%" cy="40%" r="60%">'
                +       '<stop offset="0%" stop-color="#ffe5a0" />'
                +       '<stop offset="40%" stop-color="#ff9a76" />'
                +       '<stop offset="80%" stop-color="#a78bfa" />'
                +       '<stop offset="100%" stop-color="#4facfe" />'
                +     '</radialGradient>'
                +     '<linearGradient id="p3ring" x1="0%" y1="0%" x2="100%" y2="100%">'
                +       '<stop offset="0%" stop-color="#667eea" />'
                +       '<stop offset="50%" stop-color="#fbbf24" />'
                +       '<stop offset="100%" stop-color="#4facfe" />'
                +     '</linearGradient>'
                +     '<filter id="p3glow"><feGaussianBlur stdDeviation="3" /></filter>'
                +   '</defs>'
                // 极光外圈
                +   '<circle cx="100" cy="100" r="85" fill="none" stroke="url(#p3ring)" stroke-width="2" opacity="0.4" class="aurora-ring" />'
                // 星环（旋转）
                +   '<ellipse cx="100" cy="100" rx="85" ry="22" fill="none" stroke="url(#p3ring)" stroke-width="3" opacity="0.85" class="planet-saturn-ring" transform="rotate(-20 100 100)" />'
                +   '<ellipse cx="100" cy="100" rx="75" ry="18" fill="none" stroke="url(#p3ring)" stroke-width="1.5" opacity="0.5" class="planet-saturn-ring-2" transform="rotate(-20 100 100)" />'
                // 星球本体
                +   '<circle cx="100" cy="100" r="55" fill="url(#p3core)" filter="url(#p3glow)" class="planet-core-tier3" />'
                +   '<circle cx="100" cy="100" r="55" fill="url(#p3core)" />'
                // 表面极光斑纹
                +   '<path d="M70,90 Q100,80 130,95 Q125,110 100,108 Q80,105 70,90 Z" fill="rgba(255,255,255,0.25)" class="aurora-stripe" />'
                +   '<path d="M75,115 Q100,108 125,118 Q120,128 100,125 Q85,123 75,115 Z" fill="rgba(167,139,250,0.3)" class="aurora-stripe-2" />'
                // 环绕微粒
                +   '<circle cx="45" cy="100" r="2" fill="#fbbf24" class="orbit-particle p1" />'
                +   '<circle cx="155" cy="100" r="2" fill="#4facfe" class="orbit-particle p2" />'
                +   '<circle cx="100" cy="40" r="1.5" fill="#fff" class="orbit-particle p3" />'
                +   '<circle cx="100" cy="160" r="1.5" fill="#a78bfa" class="orbit-particle p4" />'
                + '</svg>';
        }

        if (tier === 'tier-2') {
            // 能量脉冲星：科技感线条 + 微粒光点
            return ''
                + '<svg viewBox="0 0 200 200" class="planet-svg planet-svg-tier2" xmlns="http://www.w3.org/2000/svg">'
                +   '<defs>'
                +     '<radialGradient id="p2core" cx="40%" cy="40%" r="60%">'
                +       '<stop offset="0%" stop-color="#a5d8ff" />'
                +       '<stop offset="60%" stop-color="#4facfe" />'
                +       '<stop offset="100%" stop-color="#235789" />'
                +     '</radialGradient>'
                +     '<filter id="p2glow"><feGaussianBlur stdDeviation="2" /></filter>'
                +   '</defs>'
                // 微弱光环
                +   '<circle cx="100" cy="100" r="75" fill="none" stroke="rgba(79,172,254,0.2)" stroke-width="1" class="pulse-ring" />'
                +   '<circle cx="100" cy="100" r="65" fill="none" stroke="rgba(79,172,254,0.15)" stroke-width="1" class="pulse-ring-2" />'
                // 星球本体
                +   '<circle cx="100" cy="100" r="50" fill="url(#p2core)" filter="url(#p2glow)" class="planet-core-tier2" />'
                // 科技感线条
                +   '<path d="M55,100 Q100,85 145,100" fill="none" stroke="rgba(165,216,255,0.6)" stroke-width="1.5" class="tech-line" />'
                +   '<path d="M55,110 Q100,125 145,110" fill="none" stroke="rgba(165,216,255,0.4)" stroke-width="1" class="tech-line-2" />'
                +   '<ellipse cx="100" cy="100" rx="50" ry="12" fill="none" stroke="rgba(165,216,255,0.3)" stroke-width="1" />'
                // 微粒光点
                +   '<circle cx="55" cy="95" r="1.8" fill="#a5d8ff" class="orbit-particle p1" />'
                +   '<circle cx="145" cy="105" r="1.8" fill="#a5d8ff" class="orbit-particle p2" />'
                +   '<circle cx="100" cy="55" r="1.5" fill="#fff" class="orbit-particle p3" />'
                + '</svg>';
        }

        // tier-1：暗淡星尘（朴素陨石）
        return ''
            + '<svg viewBox="0 0 200 200" class="planet-svg planet-svg-tier1" xmlns="http://www.w3.org/2000/svg">'
            +   '<defs>'
            +     '<radialGradient id="p1core" cx="40%" cy="40%" r="60%">'
            +       '<stop offset="0%" stop-color="#6b6f80" />'
            +       '<stop offset="60%" stop-color="#4a4d5e" />'
            +       '<stop offset="100%" stop-color="#2a2d3e" />'
            +     '</radialGradient>'
            +   '</defs>'
            +   '<circle cx="100" cy="100" r="48" fill="url(#p1core)" class="planet-core-tier1" />'
            // 陨石坑
            +   '<circle cx="88" cy="92" r="6" fill="rgba(0,0,0,0.25)" />'
            +   '<circle cx="110" cy="105" r="4" fill="rgba(0,0,0,0.2)" />'
            +   '<circle cx="100" cy="115" r="3" fill="rgba(0,0,0,0.15)" />'
            + '</svg>';
    }

    /**
     * 主入口：根据当前用户等级一键更新所有视觉元素
     * @param {Object} options { active: 头像是否激活, level: 强制指定等级 }
     */
    DemoHelper.refresh = function (options) {
        options = options || {};

        var level = options.level;
        if (typeof level !== 'number') {
            try {
                var user = TmindState.get('user') || {};
                var exp = user.exp || 0;
                level = LevelSystem.getLevelFromXP(exp);
            } catch (e) {
                level = 0;
            }
        }

        // 头像激活判断：有经验值或显式指定 active
        var active = options.active;
        if (active === undefined) {
            try {
                var user2 = TmindState.get('user') || {};
                active = (user2.exp || 0) > 0 || (user2.totalSessions || 0) > 0;
            } catch (e) {
                active = false;
            }
        }

        updateAvatar(active, level);
        updateTimerRing(level);
        updatePlanet(level);
    };

    /**
     * 仅更新头像（用于轻量场景）
     */
    DemoHelper.refreshAvatar = function (active, level) {
        if (typeof level !== 'number') {
            try {
                level = LevelSystem.getLevelFromXP(TmindState.get('user.exp') || 0);
            } catch (e) { level = 0; }
        }
        updateAvatar(active, level);
    };

    /**
     * 仅更新星球
     */
    DemoHelper.refreshPlanet = function (level) {
        if (typeof level !== 'number') {
            try {
                level = LevelSystem.getLevelFromXP(TmindState.get('user.exp') || 0);
            } catch (e) { level = 0; }
        }
        updatePlanet(level);
    };

    /**
     * 仅更新计时器环形态
     */
    DemoHelper.refreshTimerRing = function (level) {
        if (typeof level !== 'number') {
            try {
                level = LevelSystem.getLevelFromXP(TmindState.get('user.exp') || 0);
            } catch (e) { level = 0; }
        }
        updateTimerRing(level);
    };

    /**
     * 初始化：应用启动时调用一次
     */
    DemoHelper.init = function () {
        DemoHelper.refresh();
    };

    global.DemoHelper = DemoHelper;

})(window);
