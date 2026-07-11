(function (global) {
    'use strict';

    /**
     * CategoryChart —— 专注分类分布环形图渲染器
     * 依赖：Chart.js、TmindStorage
     * 统计本周（或指定会话集）中各分类投入时间占比
     */
    var CategoryChart = {};

    var chartInstance = null;

    // 预定义分类与配色（覆盖备考常见科目）
    var DEFAULT_CATEGORIES = [
        { name: '高数', color: '#667eea' },
        { name: '英语', color: '#f6ad55' },
        { name: '专业课', color: '#4facfe' },
        { name: '自由工作', color: '#38b2ac' },
        { name: '阅读', color: '#a78bfa' }
    ];

    // 兜底调色板，用于未在预定义列表中的分类
    var PALETTE = [
        '#667eea', '#4facfe', '#38b2ac', '#f6ad55', '#a78bfa',
        '#fc8181', '#f687b3', '#68d391', '#fbb6ce', '#90cdf4'
    ];

    function getCategoryColor(name, index) {
        for (var i = 0; i < DEFAULT_CATEGORIES.length; i++) {
            if (DEFAULT_CATEGORIES[i].name === name) {
                return DEFAULT_CATEGORIES[i].color;
            }
        }
        return PALETTE[index % PALETTE.length];
    }

    function getCenterTextColor() {
        var theme = 'night';
        try {
            theme = document.documentElement.getAttribute('data-theme') || 'night';
        } catch (e) {}
        if (theme === 'day') return '#1a1d2e';
        if (theme === 'eye') return '#1a3c2a';
        return '#f0f2ff';
    }

    function getLegendTextColor() {
        var theme = 'night';
        try {
            theme = document.documentElement.getAttribute('data-theme') || 'night';
        } catch (e) {}
        if (theme === 'day') return '#6b7280';
        if (theme === 'eye') return '#3d6b4f';
        return '#8b92b0';
    }

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

    function filterSessionsByWeek(sessions) {
        var range = getThisWeekRange();
        var sTime = range.start.getTime();
        var eTime = range.end.getTime();
        var result = [];
        for (var i = 0; i < sessions.length; i++) {
            var st = sessions[i].startTime;
            if (st >= sTime && st <= eTime) {
                result.push(sessions[i]);
            }
        }
        return result;
    }

    function aggregateByCategory(sessions) {
        var map = {};
        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            var tag = (s.tag && s.tag.length > 0) ? s.tag : '未分类';
            var minutes = Math.round((s.duration || 0) / 60000);
            if (minutes <= 0) continue;
            if (!map[tag]) {
                map[tag] = 0;
            }
            map[tag] += minutes;
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

    /**
     * 渲染分类环形图
     * @param {String} canvasId canvas 元素 id
     * @param {Object} options 可选参数 { sessions: 自定义会话集 }
     * @returns {Array} 聚合后的分类数组 [{name, minutes}, ...]
     */
    CategoryChart.render = function (canvasId, options) {
        options = options || {};

        var canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn('[CategoryChart] canvas not found:', canvasId);
            return null;
        }
        if (typeof Chart === 'undefined') {
            console.warn('[CategoryChart] Chart.js 未加载，跳过渲染');
            return null;
        }

        CategoryChart.destroy();

        var sessions = [];
        if (options.sessions && options.sessions.length) {
            sessions = options.sessions;
        } else {
            try {
                var all = TmindStorage.getAllSessions();
                sessions = filterSessionsByWeek(all);
            } catch (e) {
                console.error('[CategoryChart] 获取会话失败:', e);
                sessions = [];
            }
        }

        var aggregated = aggregateByCategory(sessions);

        // 无数据时渲染空状态占位
        if (aggregated.length === 0) {
            aggregated = [{ name: '暂无数据', minutes: 1, isEmpty: true }];
        }

        var labels = [];
        var data = [];
        var colors = [];
        for (var j = 0; j < aggregated.length; j++) {
            labels.push(aggregated[j].name);
            data.push(aggregated[j].minutes);
            if (aggregated[j].isEmpty) {
                colors.push('rgba(139, 146, 176, 0.25)');
            } else {
                colors.push(getCategoryColor(aggregated[j].name, j));
            }
        }

        var ctx = canvas.getContext('2d');
        var legendColor = getLegendTextColor();

        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 2,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '64%',
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: legendColor,
                            padding: 16,
                            boxWidth: 12,
                            boxHeight: 12,
                            font: { size: 12 },
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10, 12, 26, 0.88)',
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (tooltipCtx) {
                                var item = aggregated[tooltipCtx.dataIndex];
                                if (item && item.isEmpty) {
                                    return '本周暂无专注记录';
                                }
                                var total = 0;
                                for (var i = 0; i < tooltipCtx.dataset.data.length; i++) {
                                    var v = tooltipCtx.dataset.data[i];
                                    if (aggregated[i] && aggregated[i].isEmpty) continue;
                                    total += v;
                                }
                                var pct = total > 0 ? Math.round(tooltipCtx.parsed / total * 100) : 0;
                                return tooltipCtx.label + ': ' + tooltipCtx.parsed + ' 分钟 (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });

        return aggregated;
    };

    /**
     * 销毁当前环形图实例
     */
    CategoryChart.destroy = function () {
        if (chartInstance) {
            try {
                chartInstance.destroy();
            } catch (e) {
                console.warn('[CategoryChart] destroy error:', e);
            }
            chartInstance = null;
        }
    };

    /**
     * 获取本周范围内的会话（供外部复用）
     */
    CategoryChart.getThisWeekSessions = function () {
        try {
            var all = TmindStorage.getAllSessions();
            return filterSessionsByWeek(all);
        } catch (e) {
            return [];
        }
    };

    global.CategoryChart = CategoryChart;

})(window);
