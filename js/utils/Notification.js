(function (global) {
    'use strict';

    /**
     * TmindNotification —— 系统级通知与振动封装
     * 依赖：Web Notifications API、Vibration API
     * 在番茄钟/倒计时结束、休息时间结束时，即使浏览器最小化或手机锁屏也能弹出横幅
     */
    var TmindNotification = {};

    var permissionRequested = false;

    /**
     * 检测浏览器是否支持通知
     */
    TmindNotification.isSupported = function () {
        return typeof Notification !== 'undefined';
    };

    /**
     * 获取当前通知权限状态
     * @returns {String} 'granted' | 'denied' | 'default'
     */
    TmindNotification.getPermission = function () {
        if (!TmindNotification.isSupported()) {
            return 'unsupported';
        }
        return Notification.permission;
    };

    /**
     * 请求通知权限（应在用户交互内调用，如点击「开始专注」）
     * @param {Function} callback 回调参数为是否获得授权
     */
    TmindNotification.requestPermission = function (callback) {
        if (!TmindNotification.isSupported()) {
            if (callback) callback(false, 'unsupported');
            return;
        }

        if (Notification.permission === 'granted') {
            permissionRequested = true;
            if (callback) callback(true, 'granted');
            return;
        }

        if (Notification.permission === 'denied') {
            if (callback) callback(false, 'denied');
            return;
        }

        permissionRequested = true;
        try {
            Notification.requestPermission().then(function (permission) {
                if (callback) {
                    callback(permission === 'granted', permission);
                }
            }).catch(function (err) {
                // 兼容旧版 Promise 不支持的情况
                if (callback) callback(false, err);
            });
        } catch (e) {
            // 极旧浏览器走回调形式
            try {
                Notification.requestPermission(function (permission) {
                    if (callback) callback(permission === 'granted', permission);
                });
            } catch (err) {
                if (callback) callback(false, err);
            }
        }
    };

    /**
     * 发送系统通知
     * @param {Object} options { title, body, icon, tag, requireInteraction, data }
     * @returns {Notification|null} 通知实例，失败返回 null
     */
    TmindNotification.show = function (options) {
        if (!TmindNotification.isSupported()) {
            return null;
        }
        if (Notification.permission !== 'granted') {
            return null;
        }

        options = options || {};
        var title = options.title || 'Timind 提醒';

        var notifOptions = {
            body: options.body || '',
            icon: options.icon || './icons/icon-192.png',
            badge: options.badge || './icons/icon-192.png',
            tag: options.tag || 'tmind-notification',
            requireInteraction: options.requireInteraction !== false,
            silent: false,
            data: options.data || {}
        };

        try {
            var notif = new Notification(title, notifOptions);

            // 自动关闭（除非 requireInteraction 为 true）
            if (!options.requireInteraction && options.autoCloseMs !== 0) {
                var closeMs = options.autoCloseMs || 6000;
                setTimeout(function () {
                    try { notif.close(); } catch (e) {}
                }, closeMs);
            }

            // 点击通知：聚焦窗口
            notif.onclick = function () {
                try {
                    window.focus();
                } catch (e) {}
                try {
                    notif.close();
                } catch (e) {}
                if (options.onClick) {
                    options.onClick(notif);
                }
            };

            return notif;
        } catch (e) {
            console.warn('[TmindNotification] show error:', e);
            return null;
        }
    };

    /**
     * 振动反馈（移动端）
     * @param {Number|Number[]} pattern 振动模式：数字或数字数组
     */
    TmindNotification.vibrate = function (pattern) {
        if (!('vibrate' in navigator)) {
            return false;
        }
        try {
            return navigator.vibrate(pattern || 200);
        } catch (e) {
            console.warn('[TmindNotification] vibrate error:', e);
            return false;
        }
    };

    /**
     * 同时发送通知 + 振动，用于重要提醒
     * @param {Object} options 同 show() 参数，可附加 vibration 字段
     */
    TmindNotification.notify = function (options) {
        options = options || {};

        // 振动（移动端）
        var vibrationPattern = options.vibration;
        if (vibrationPattern !== 0 && !vibrationPattern) {
            vibrationPattern = [200, 100, 200];
        }
        if (vibrationPattern) {
            TmindNotification.vibrate(vibrationPattern);
        }

        // 系统通知
        return TmindNotification.show(options);
    };

    // 预设场景，方便直接调用

    /**
     * 专注完成提醒
     * @param {Object} extra { minutes, mode }
     */
    TmindNotification.notifyFocusComplete = function (extra) {
        extra = extra || {};
        var minutes = extra.minutes || 0;
        var mode = extra.mode || 'countdown';

        var body;
        if (mode === 'pomodoro') {
            body = '完成一轮番茄专注，共 ' + minutes + ' 分钟，该休息一下啦！';
        } else {
            body = '专注完成，共 ' + minutes + ' 分钟，给自己一个小奖励吧 ✨';
        }

        return TmindNotification.notify({
            title: '🎉 专注完成',
            body: body,
            tag: 'focus-complete',
            icon: './icons/icon-192.png',
            vibration: [200, 100, 200, 100, 400],
            data: { type: 'focusComplete', minutes: minutes, mode: mode }
        });
    };

    /**
     * 休息开始提醒
     */
    TmindNotification.notifyBreakStart = function (extra) {
        extra = extra || {};
        var minutes = extra.minutes || 5;
        var isLong = extra.longBreak;

        var title = isLong ? '☕ 长休息时间' : '🌿 休息一下';
        var body = isLong
            ? '完成四轮专注，享受 ' + minutes + ' 分钟的长休息吧！'
            : '专注结束，休息 ' + minutes + ' 分钟，放松下眼睛～';

        return TmindNotification.notify({
            title: title,
            body: body,
            tag: 'break-start',
            icon: './icons/icon-192.png',
            vibration: [300, 80, 300],
            data: { type: 'breakStart', minutes: minutes }
        });
    };

    /**
     * 休息结束提醒
     */
    TmindNotification.notifyBreakEnd = function () {
        return TmindNotification.notify({
            title: '⚡ 休息结束',
            body: '精力已恢复，继续专注吧！',
            tag: 'break-end',
            icon: './icons/icon-192.png',
            vibration: [150, 60, 150, 60, 300],
            data: { type: 'breakEnd' }
        });
    };

    /**
     * 升级提醒
     */
    TmindNotification.notifyLevelUp = function (extra) {
        extra = extra || {};
        return TmindNotification.notify({
            title: '⭐ 等级提升',
            body: '恭喜升级到 Lv.' + (extra.level || '?') + ' ' + (extra.title || ''),
            tag: 'level-up',
            icon: './icons/icon-192.png',
            vibration: [100, 50, 100, 50, 100, 50, 500],
            data: { type: 'levelUp', level: extra.level }
        });
    };

    global.TmindNotification = TmindNotification;

})(window);
