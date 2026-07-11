(function (global) {
    'use strict';

    /**
     * ReportGenerator —— 真·AI 双模复盘引擎
     * 模式 1（本地兜底）：基于规则引擎生成带温度的本地复盘
     * 模式 2（云端 AI）：通过 fetch 调用 DeepSeek / 智谱清言 API 生成自然语言复盘
     * 依赖：TmindStorage、TmindStorage.getAIConfig()
     */
    var ReportGenerator = {};

    // 深夜专注判定区间（23:00 - 次日 05:00）
    var LATE_NIGHT_START = 23;
    var LATE_NIGHT_END = 5;

    // ===== 通用工具函数 =====

    function getThisWeekRange() {
        var now = new Date();
        var dayOfWeek = now.getDay() || 7;
        var monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeek + 1);
        monday.setHours(0, 0, 0, 0);
        var sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return { start: monday, end: sunday };
    }

    function getLastWeekRange() {
        var thisWeek = getThisWeekRange();
        var lastMonday = new Date(thisWeek.start);
        lastMonday.setDate(thisWeek.start.getDate() - 7);
        var lastSunday = new Date(thisWeek.start);
        lastSunday.setDate(thisWeek.start.getDate() - 1);
        lastSunday.setHours(23, 59, 59, 999);
        return { start: lastMonday, end: lastSunday };
    }

    function filterSessionsByRange(sessions, start, end) {
        var sTime = start.getTime();
        var eTime = end.getTime();
        var result = [];
        for (var i = 0; i < sessions.length; i++) {
            var st = sessions[i].startTime;
            if (st >= sTime && st <= eTime) {
                result.push(sessions[i]);
            }
        }
        return result;
    }

    function countTotalMinutes(sessions) {
        var total = 0;
        for (var i = 0; i < sessions.length; i++) {
            total += Math.round((sessions[i].duration || 0) / 60000);
        }
        return total;
    }

    // 分类统一归并到通用工作/学习场景下的 4 大类，不绑定任何特定考试
    var CATEGORY_ALIASES = {
        // 数理逻辑类
        '高数': '数理逻辑', '数学': '数理逻辑', '高数推演': '数理逻辑', '理科': '数理逻辑',
        // 语言学习类
        '英语': '语言学习', '英语词汇': '语言学习', '词汇': '语言学习', '语言': '语言学习', '单词': '语言学习',
        // 专业技能类
        '专业课': '专业技能', '专业': '专业技能', '专业课程': '专业技能', '技术': '专业技能',
        // 自由工作类
        '自由工作': '自由工作', '工作': '自由工作', '自由': '自由工作', '项目': '自由工作'
    };

    function normalizeCategory(tag) {
        if (!tag) return '自由工作';
        if (CATEGORY_ALIASES[tag]) return CATEGORY_ALIASES[tag];
        // 未命中别名表的，归为"自由工作"或保留原名
        return tag;
    }

    function aggregateByCategory(sessions) {
        var map = {};
        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            var rawTag = (s.tag && s.tag.length > 0) ? s.tag : '未分类';
            var cat = normalizeCategory(rawTag);
            var minutes = Math.round((s.duration || 0) / 60000);
            if (minutes <= 0) continue;
            if (!map[cat]) {
                map[cat] = 0;
            }
            map[cat] += minutes;
        }
        var result = [];
        for (var k in map) {
            if (map.hasOwnProperty(k)) {
                result.push({ name: k, minutes: map[k] });
            }
        }
        result.sort(function (a, b) { return b.minutes - a.minutes; });
        return result;
    }

    function countLateNightSessions(sessions) {
        var count = 0;
        var minutes = 0;
        for (var i = 0; i < sessions.length; i++) {
            var d = new Date(sessions[i].startTime);
            var h = d.getHours();
            if (h >= LATE_NIGHT_START || h < LATE_NIGHT_END) {
                count += 1;
                minutes += Math.round((sessions[i].duration || 0) / 60000);
            }
        }
        return { count: count, minutes: minutes };
    }

    function countActiveDays(sessions) {
        var daySet = {};
        for (var i = 0; i < sessions.length; i++) {
            var d = new Date(sessions[i].startTime);
            var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
            daySet[key] = true;
        }
        return Object.keys(daySet).length;
    }

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function formatMinutes(m) {
        if (m < 60) return m + ' 分钟';
        var h = Math.floor(m / 60);
        var r = m % 60;
        if (r === 0) return h + ' 小时';
        return h + ' 小时 ' + r + ' 分钟';
    }

    // ===== 数据准备：抽取复盘所需的关键统计 =====

    function prepareSummary(options) {
        options = options || {};

        var allSessions = [];
        if (options.sessions) {
            allSessions = options.sessions;
        } else {
            try {
                allSessions = TmindStorage.getAllSessions();
            } catch (e) {
                console.error('[ReportGenerator] getAllSessions error:', e);
                allSessions = [];
            }
        }

        var thisWeek = getThisWeekRange();
        var lastWeek = getLastWeekRange();

        var thisWeekSessions = filterSessionsByRange(allSessions, thisWeek.start, thisWeek.end);
        var lastWeekSessions = filterSessionsByRange(allSessions, lastWeek.start, lastWeek.end);

        var thisWeekMinutes = countTotalMinutes(thisWeekSessions);
        var lastWeekMinutes = countTotalMinutes(lastWeekSessions);
        var thisWeekCount = thisWeekSessions.length;
        var activeDays = countActiveDays(thisWeekSessions);

        var categories = aggregateByCategory(thisWeekSessions);
        var lateNight = countLateNightSessions(thisWeekSessions);

        var stats = null;
        try {
            stats = TmindStorage.getStats();
        } catch (e) {
            stats = {};
        }
        var streak = (stats && stats.currentStreak) || 0;
        var dailyAvg = Math.round(thisWeekMinutes / 7);

        return {
            thisWeekMinutes: thisWeekMinutes,
            lastWeekMinutes: lastWeekMinutes,
            thisWeekSessions: thisWeekCount,
            activeDays: activeDays,
            categories: categories,
            lateNight: lateNight,
            streak: streak,
            dailyAverage: dailyAvg,
            weekStart: thisWeek.start.toISOString().split('T')[0],
            weekEnd: thisWeek.end.toISOString().split('T')[0],
            _thisWeekSessions: thisWeekSessions
        };
    }

    // =========================================================
    // 模式 1：本地兜底规则引擎
    // =========================================================

    function generateLocalReport(summary) {
        var lines = [];

        lines.push('👋 嗨，这是 Timind 为你准备的本周本地复盘。');

        // 1. 本周 vs 上周 对比
        if (summary.thisWeekMinutes === 0 && summary.lastWeekMinutes === 0) {
            lines.push('🌱 本周还没有深度工作记录哦，先去开启你的第一次专注吧，哪怕 10 分钟也是好的开始。');
        } else if (summary.lastWeekMinutes === 0 && summary.thisWeekMinutes > 0) {
            lines.push('✨ 这是你本周的首次专注，共 ' + formatMinutes(summary.thisWeekMinutes) + '，已经是很好的开始，继续保持！');
        } else if (summary.thisWeekMinutes > summary.lastWeekMinutes) {
            var diff = summary.thisWeekMinutes - summary.lastWeekMinutes;
            var pct = summary.lastWeekMinutes > 0 ? Math.round(diff / summary.lastWeekMinutes * 100) : 100;
            lines.push(pickRandom([
                '🔥 本周战斗力爆表！比上周多了 ' + formatMinutes(diff) + '（+' + pct + '%），离目标更近了一步！',
                '💪 本周专注 ' + formatMinutes(summary.thisWeekMinutes) + '，较上周提升 ' + pct + '%，进步肉眼可见。',
                '✨ 你这周真的很拼，比上周多专注了 ' + formatMinutes(diff) + '，给自己一个小奖励吧。'
            ]));
        } else if (summary.thisWeekMinutes === summary.lastWeekMinutes) {
            lines.push('⚖️ 本周专注时长与上周持平，均为 ' + formatMinutes(summary.thisWeekMinutes) + '。保持稳定本身就是一种力量，下周试着突破一下？');
        } else {
            var drop = summary.lastWeekMinutes - summary.thisWeekMinutes;
            lines.push(pickRandom([
                '☁️ 本周比上周少了 ' + formatMinutes(drop) + '，可能是这周比较忙。没关系，状态起伏很正常，下周慢慢找回来就好。',
                '🌿 这周专注时长有所回落（-' + formatMinutes(drop) + '），Timind 陪着你，一步步来就好，不必勉强。'
            ]));
        }

        // 2. 分类投入分析（通用：数理逻辑 / 语言学习 / 专业技能 / 自由工作）
        if (summary.categories.length > 0) {
            var top = summary.categories[0];
            var totalCat = 0;
            for (var i = 0; i < summary.categories.length; i++) {
                totalCat += summary.categories[i].minutes;
            }
            var topPct = totalCat > 0 ? Math.round(top.minutes / totalCat * 100) : 0;

            var catLine = '📊 本周投入最多的是「' + top.name + '」，共 ' + formatMinutes(top.minutes) + '，占本周专注的 ' + topPct + '%。';
            if (top.name === '数理逻辑') {
                catLine += '你是名副其实的逻辑推演者，但也要注意语言学习的平衡哦 ⚖️';
            } else if (top.name === '语言学习') {
                catLine += '语言学习贵在坚持，看来你正在为它打牢地基 📖';
            } else if (top.name === '专业技能') {
                catLine += '专业技能才是硬实力，这份投入未来一定会回报你 💼';
            } else if (top.name === '自由工作') {
                catLine += '把时间花在自己掌控的事情上，这份主动很珍贵 ✨';
            } else {
                catLine += '坚持把最多的时间花在最重要的事情上，方向很对 👍';
            }
            lines.push(catLine);

            // 平衡提醒
            if (summary.categories.length === 1) {
                lines.push('💡 本周只专注了「' + top.name + '」一个分类，深度工作路上建议适当平衡其他领域，多元发展更稳健。');
            } else if (summary.categories.length >= 3) {
                lines.push('🌈 你本周兼顾了 ' + summary.categories.length + ' 个分类，多元推进，节奏不错。');
            }
        }

        // 3. 深夜专注提醒
        if (summary.lateNight.count > 0) {
            lines.push(pickRandom([
                '🌙 本周有 ' + summary.lateNight.count + ' 次深夜专注（共 ' + formatMinutes(summary.lateNight.minutes) + '）。深度工作虽重要，但也一定要注意休息，Timind 关心你的黑眼圈。',
                '🌜 检测到 ' + summary.lateNight.count + ' 次夜间专注，记得早点睡哦，好睡眠才是高效产出的底座。'
            ]));
        }

        // 4. 连续天数
        if (summary.streak >= 7) {
            lines.push('🔥 你已经连续专注 ' + summary.streak + ' 天了！这种坚持本身就是一种了不起的能力。');
        } else if (summary.streak >= 3) {
            lines.push('🌟 连续 ' + summary.streak + ' 天专注，继续保持这个小习惯，它会带你走得更远。');
        } else if (summary.streak >= 1) {
            lines.push('🌱 连续 ' + summary.streak + ' 天专注中，每多一天都在为自己加分。');
        }

        // 5. 日均强度
        if (summary.thisWeekMinutes > 0) {
            if (summary.dailyAverage >= 120) {
                lines.push('📈 本周日均专注 ' + formatMinutes(summary.dailyAverage) + '，强度很可观，注意劳逸结合。');
            } else if (summary.dailyAverage >= 60) {
                lines.push('📈 本周日均专注 ' + formatMinutes(summary.dailyAverage) + '，节奏稳定，正好是高效区间的黄金线。');
            } else {
                lines.push('📈 本周日均专注 ' + formatMinutes(summary.dailyAverage) + '，可以试着每天多挤 10 分钟，小步快跑。');
            }
        }

        // 6. 活跃天数
        if (summary.thisWeekMinutes > 0 && summary.activeDays < 7) {
            lines.push('📅 本周专注了 ' + summary.activeDays + ' 天，还差 ' + (7 - summary.activeDays) + ' 天就能满勤，要不要挑战一下？');
        } else if (summary.activeDays === 7) {
            lines.push('🏆 本周满勤！每一天都有你的专注记录，这份自律令人敬佩。');
        }

        // 7. 结尾鼓励
        lines.push(pickRandom([
            '✨ Timind 一直陪着你，下一周我们一起继续加油！',
            '🌈 时间会看见你的努力，下周见，专注人。',
            '💫 每一分钟的专注都在塑造未来的你，下周继续闪耀！'
        ]));

        return lines.join('\n\n');
    }

    // =========================================================
    // 模式 2：真云端 AI 模式
    // =========================================================

    /**
     * 构建 AI 系统提示词
     * 角色设定：专业、严谨又自带幽默感的深度工作看板与学业导师
     */
    function buildSystemPrompt(summary) {
        var categoryText = '';
        if (summary.categories.length > 0) {
            var parts = [];
            for (var i = 0; i < summary.categories.length; i++) {
                var c = summary.categories[i];
                parts.push(c.name + '：' + c.minutes + ' 分钟');
            }
            categoryText = parts.join('；');
        } else {
            categoryText = '暂无分类数据';
        }

        var prompt = ''
            + '你是一位专业、严谨又自带幽默感的深度工作看板与学业导师。'
            + '你的任务是根据用户本周的专注数据，生成一段富有情绪价值、针对性极强的自然语言复盘周报。'
            + '\n\n【硬性要求】'
            + '\n1. 字数严格控制在 150 字以内。'
            + '\n2. 必须基于下方真实数据进行分析，绝不编造数据。'
            + '\n3. 语气既专业又温暖，可以适度幽默，但不要油腔滑调。'
            + '\n4. 通用分类场景：数理逻辑、语言学习、专业技能、自由工作，请按用户实际投入给出针对性建议。'
            + '\n5. 若检测到深夜专注偏多，要真诚地提醒用户注意休息。'
            + '\n6. 结尾给一句可执行的下周行动建议。'
            + '\n\n【用户本周数据】'
            + '\n- 本周总专注：' + summary.thisWeekMinutes + ' 分钟'
            + '\n- 上周总专注：' + summary.lastWeekMinutes + ' 分钟'
            + '\n- 本周会话数：' + summary.thisWeekSessions + ' 次'
            + '\n- 活跃天数：' + summary.activeDays + ' / 7 天'
            + '\n- 日均专注：' + summary.dailyAverage + ' 分钟'
            + '\n- 连续专注：' + summary.streak + ' 天'
            + '\n- 深夜专注：' + summary.lateNight.count + ' 次（共 ' + summary.lateNight.minutes + ' 分钟）'
            + '\n- 分类投入：' + categoryText
            + '\n- 周期：' + summary.weekStart + ' 至 ' + summary.weekEnd;

        return prompt;
    }

    /**
     * 根据供应商构造 API 请求参数
     */
    function buildRequestOptions(config, systemPrompt) {
        if (config.provider === 'deepseek') {
            return {
                url: 'https://api.deepseek.com/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + config.apiKey
                },
                body: {
                    model: config.model || 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: '请基于我本周的数据生成复盘周报。' }
                    ],
                    temperature: 0.8,
                    max_tokens: 320,
                    stream: false
                }
            };
        }

        if (config.provider === 'zhipu') {
            return {
                url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + config.apiKey
                },
                body: {
                    model: config.model || 'glm-4',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: '请基于我本周的数据生成复盘周报。' }
                    ],
                    temperature: 0.8,
                    max_tokens: 320,
                    stream: false
                }
            };
        }

        // 未知供应商，抛错
        throw new Error('未知的 AI 供应商：' + config.provider);
    }

    /**
     * 从 API 响应中提取文本（兼容 DeepSeek / 智谱清言的 OpenAI 兼容格式）
     */
    function extractContent(data) {
        if (!data) return '';
        // OpenAI 兼容格式：choices[0].message.content
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            return data.choices[0].message.content || '';
        }
        // 兜底
        if (typeof data.content === 'string') return data.content;
        if (data.output) return data.output;
        return '';
    }

    /**
     * 调用云端 AI 生成复盘
     * @param {Object} summary 数据统计概要
     * @param {Object} config AI 配置
     * @returns {Promise<String>} 复盘文本
     */
    function generateCloudReport(summary, config) {
        return new Promise(function (resolve, reject) {
            var systemPrompt;
            var reqOptions;

            try {
                systemPrompt = buildSystemPrompt(summary);
                reqOptions = buildRequestOptions(config, systemPrompt);
            } catch (e) {
                reject(e);
                return;
            }

            fetch(reqOptions.url, {
                method: 'POST',
                headers: reqOptions.headers,
                body: JSON.stringify(reqOptions.body)
            })
                .then(function (response) {
                    if (!response.ok) {
                        return response.text().then(function (text) {
                            throw new Error('AI 接口返回 ' + response.status + '：' + text.substring(0, 200));
                        });
                    }
                    return response.json();
                })
                .then(function (data) {
                    var content = extractContent(data);
                    if (!content || content.trim().length === 0) {
                        throw new Error('AI 返回了空内容');
                    }
                    // 补一行云端的来源标识
                    var providerLabel = config.provider === 'zhipu' ? '智谱清言' : 'DeepSeek';
                    resolve('🤖 本报告由 ' + providerLabel + ' 云端 AI 生成\n\n' + content.trim());
                })
                .catch(function (err) {
                    reject(err);
                });
        });
    }

    // =========================================================
    // 主入口：双模分发
    // =========================================================

    /**
     * 生成 AI 复盘报告（双模自动切换）
     * @param {Object} options { sessions, forceLocal }
     * @returns {Promise<Object>} { text, summary, mode }
     *   mode: 'local' 本地兜底 | 'cloud' 云端 AI
     */
    ReportGenerator.generate = function (options) {
        options = options || {};

        var summary = prepareSummary(options);

        // 检查是否可走云端模式
        var aiConfig = null;
        if (!options.forceLocal) {
            try {
                aiConfig = TmindStorage.getAIConfig();
            } catch (e) {
                aiConfig = null;
            }
        }

        // 无配置 → 本地兜底
        if (!aiConfig) {
            var localText = generateLocalReport(summary);
            return Promise.resolve({
                text: localText,
                summary: summary,
                mode: 'local'
            });
        }

        // 有配置 → 云端模式，异常时自动回退本地
        return generateCloudReport(summary, aiConfig)
            .then(function (cloudText) {
                return {
                    text: cloudText,
                    summary: summary,
                    mode: 'cloud',
                    provider: aiConfig.provider
                };
            })
            .catch(function (err) {
                console.warn('[ReportGenerator] 云端 AI 调用失败，回退本地模式：', err);
                var fallbackText = generateLocalReport(summary);
                return {
                    text: '⚠️ 云端 AI 调用失败，已为你生成本地复盘：\n\n' + fallbackText,
                    summary: summary,
                    mode: 'local-fallback',
                    error: err && err.message ? err.message : String(err)
                };
            });
    };

    /**
     * 同步版本的本地报告生成（兼容旧调用方式）
     */
    ReportGenerator.generateLocal = function (options) {
        var summary = prepareSummary(options || {});
        var text = generateLocalReport(summary);
        return {
            text: text,
            summary: summary,
            mode: 'local'
        };
    };

    /**
     * 检测当前是否配置了云端 AI
     */
    ReportGenerator.isCloudEnabled = function () {
        try {
            var config = TmindStorage.getAIConfig();
            return !!config;
        } catch (e) {
            return false;
        }
    };

    /**
     * 将复盘文本按段落渲染为 HTML（保留换行）
     */
    ReportGenerator.toHtml = function (text) {
        if (!text) return '';
        var paragraphs = text.split('\n\n');
        var html = '';
        for (var i = 0; i < paragraphs.length; i++) {
            var p = paragraphs[i].replace(/\n/g, '<br>');
            html += '<p class="review-paragraph">' + p + '</p>';
        }
        return html;
    };

    global.ReportGenerator = ReportGenerator;

})(window);
