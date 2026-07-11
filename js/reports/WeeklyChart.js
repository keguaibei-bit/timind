(function (global) {
    'use strict';

    /**
     * WeeklyChart —— 本周专注时长柱状图渲染器
     * 依赖：Chart.js、TmindStorage
     * 通过当前主题动态切换配色
     */
    var WeeklyChart = {};

    var chartInstance = null;

    // 三套主题配色（柱体渐变 / 网格 / 文本）
    var THEME_COLORS = {
        day: {
            barTop: '#667eea',
            barBottom: '#764ba2',
            grid: 'rgba(107, 114, 128, 0.10)',
            text: '#1a1d2e',
            textSecondary: '#6b7280'
        },
        night: {
            barTop: '#667eea',
            barBottom: '#4facfe',
            grid: 'rgba(139, 146, 176, 0.15)',
            text: '#f0f2ff',
            textSecondary: '#8b92b0'
        },
        eye: {
            barTop: '#2d8659',
            barBottom: '#38a169',
            grid: 'rgba(61, 107, 79, 0.10)',
            text: '#1a3c2a',
            textSecondary: '#3d6b4f'
        }
    };

    function getCurrentTheme() {
        var theme = 'night';
        try {
            theme = document.documentElement.getAttribute('data-theme') || 'night';
        } catch (e) {}
        return THEME_COLORS[theme] || THEME_COLORS.night;
    }

    function buildGradient(ctx, colors) {
        var gradient = ctx.createLinearGradient(0, 0, 0, 320);
        gradient.addColorStop(0, colors.barTop);
        gradient.addColorStop(1, colors.barBottom);
        return gradient;
    }

    /**
     * 渲染本周柱状图
     * @param {String} canvasId canvas 元素 id
     * @returns {Object} 本周统计数据（含 days / totalMinutes / totalSessions）
     */
    WeeklyChart.render = function (canvasId) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn('[WeeklyChart] canvas not found:', canvasId);
            return null;
        }
        if (typeof Chart === 'undefined') {
            console.warn('[WeeklyChart] Chart.js 未加载，跳过渲染');
            return null;
        }

        // 清除旧实例，避免重复渲染导致画布错乱
        WeeklyChart.destroy();

        var weeklyData = null;
        try {
            weeklyData = TmindStorage.getWeeklyStats(new Date());
        } catch (e) {
            console.error('[WeeklyChart] getWeeklyStats error:', e);
            weeklyData = { days: [], totalMinutes: 0, totalSessions: 0 };
        }

        var days = weeklyData.days || [];
        var labels = [];
        var data = [];
        var fallbackDayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

        for (var i = 0; i < 7; i++) {
            if (days[i]) {
                labels.push(days[i].dayName || fallbackDayNames[i]);
                data.push(days[i].minutes || 0);
            } else {
                labels.push(fallbackDayNames[i]);
                data.push(0);
            }
        }

        var colors = getCurrentTheme();
        var ctx = canvas.getContext('2d');
        var fillGradient = buildGradient(ctx, colors);

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '专注时长(分钟)',
                    data: data,
                    backgroundColor: fillGradient,
                    borderColor: colors.barTop,
                    borderWidth: 0,
                    borderRadius: 8,
                    barThickness: 'flex',
                    maxBarThickness: 44
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 700,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10, 12, 26, 0.88)',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 13 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: function (tooltipCtx) {
                                var v = tooltipCtx.parsed.y;
                                if (v <= 0) {
                                    return '今日未专注';
                                }
                                var h = Math.floor(v / 60);
                                var m = v % 60;
                                if (h > 0) {
                                    return '专注 ' + h + ' 小时 ' + m + ' 分钟';
                                }
                                return '专注 ' + v + ' 分钟';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: colors.textSecondary,
                            font: { size: 12 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: colors.grid, drawBorder: false },
                        ticks: {
                            color: colors.textSecondary,
                            font: { size: 12 },
                            // 重构刻度生成逻辑：以整数分钟为标准步长，
                            // 杜绝 0.9m / 0.8m 这种反直觉小数刻度。
                            // 步长按数据最大值动态选取：30/60/120/180... 分钟
                            stepSize: WeeklyChart.niceStepSize(data),
                            maxTicksLimit: 6,
                            precision: 0,
                            callback: function (value) {
                                if (value % 60 === 0 && value > 0) {
                                    return (value / 60) + 'h';
                                }
                                return value + 'm';
                            }
                        }
                    }
                }
            }
        });

        return weeklyData;
    };

    /**
     * 销毁当前柱状图实例
     */
    WeeklyChart.destroy = function () {
        if (chartInstance) {
            try {
                chartInstance.destroy();
            } catch (e) {
                console.warn('[WeeklyChart] destroy error:', e);
            }
            chartInstance = null;
        }
    };

    /**
     * 计算"友好"的 Y 轴步长，让刻度始终落在整数分钟（10/15/20/30/60/120...）。
     * 杜绝 Chart.js 默认自动算出的 0.9m / 0.8m 等反直觉小数刻度。
     * @param {Number[]} data 柱状图数据数组
     * @returns {Number} 步长（分钟）
     */
    WeeklyChart.niceStepSize = function (data) {
        var max = 0;
        if (data && data.length) {
            for (var i = 0; i < data.length; i++) {
                if (data[i] > max) max = data[i];
            }
        }
        if (max <= 0) return 10; // 无数据时默认 10 分钟步长

        // 候选步长档位（分钟）：10 / 15 / 20 / 30 / 60 / 120 / 180 / 240 / 300
        var candidates = [10, 15, 20, 30, 60, 120, 180, 240, 300, 480, 600];
        // 选取让最大刻度约为 max 的 1~1.5 倍（约 4~6 个刻度）的最小档位
        for (var j = 0; j < candidates.length; j++) {
            var step = candidates[j];
            // 上取整到该步长的整数倍
            var topTick = Math.ceil(max / step) * step;
            if (topTick / step <= 6) {
                return step;
            }
        }
        return 600;
    };

    /**
     * 获取当前主题配色（供外部主题切换时使用）
     */
    WeeklyChart.getThemeColors = getCurrentTheme;

    global.WeeklyChart = WeeklyChart;

})(window);
