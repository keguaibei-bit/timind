(function (global) {
    'use strict';

    /**
     * TmindEffects —— 轻量级粒子喷洒特效
     * 场景：专注完成、金币跳跃、等级提升、徽章解锁
     * 实现：Canvas 2D，requestAnimationFrame，支持金币、星形、彩纸、爆炸四种预设
     */
    var TmindEffects = {};

    var canvas = null;
    var ctx = null;
    var particles = [];
    var rafId = null;
    var isRunning = false;

    // 粒子色彩调色板（科技感 + 暖色）
    var COLOR_PALETTE = [
        '#FFD700', '#FFA500', '#FF6B6B', '#FF69B4',
        '#4FACFE', '#667EEA', '#A78BFA', '#22D3EE',
        '#34D399', '#FBBF24', '#F472B6', '#FFFFFF'
    ];

    // 金币专用色
    var COIN_COLORS = ['#FFD700', '#FFC000', '#FFA500', '#FFB800'];

    function ensureCanvas() {
        if (canvas) return true;

        canvas = document.createElement('canvas');
        canvas.id = 'tmind-effects-canvas';
        canvas.style.cssText = ''
            + 'position:fixed;'
            + 'top:0;left:0;width:100%;height:100%;'
            + 'pointer-events:none;'
            + 'z-index:9999;';
        document.body.appendChild(canvas);

        ctx = canvas.getContext('2d');
        resizeCanvas();

        // 监听窗口缩放
        window.addEventListener('resize', resizeCanvas);

        return true;
    }

    function resizeCanvas() {
        if (!canvas) return;
        var dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    function pickColor(palette) {
        return palette[Math.floor(Math.random() * palette.length)];
    }

    // ===== 粒子类 =====

    function Particle(opts) {
        opts = opts || {};
        this.x = opts.x || window.innerWidth / 2;
        this.y = opts.y || window.innerHeight / 2;

        // 速度向量
        var angle = opts.angle !== undefined ? opts.angle : randomBetween(0, Math.PI * 2);
        var speed = opts.speed !== undefined ? opts.speed : randomBetween(4, 10);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - randomBetween(2, 5); // 初始上扬

        this.size = opts.size || randomBetween(3, 7);
        this.color = opts.color || pickColor(COLOR_PALETTE);
        this.shape = opts.shape || 'circle'; // circle / rect / star / coin
        this.gravity = opts.gravity !== undefined ? opts.gravity : 0.18;
        this.friction = opts.friction !== undefined ? opts.friction : 0.985;
        this.rotation = randomBetween(0, Math.PI * 2);
        this.rotationSpeed = randomBetween(-0.2, 0.2);
        this.life = 1.0;
        this.decay = opts.decay || randomBetween(0.008, 0.016);
        this.alpha = 1.0;
    }

    Particle.prototype.update = function () {
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;

        this.x += this.vx;
        this.y += this.vy;

        this.rotation += this.rotationSpeed;
        this.life -= this.decay;
        this.alpha = Math.max(0, this.life);
    };

    Particle.prototype.draw = function (ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        switch (this.shape) {
            case 'rect':
                drawRect(ctx, this.size, this.color);
                break;
            case 'star':
                drawStar(ctx, this.size, this.color);
                break;
            case 'coin':
                drawCoin(ctx, this.size, this.color);
                break;
            case 'circle':
            default:
                drawCircle(ctx, this.size, this.color);
                break;
        }

        ctx.restore();
    };

    function drawCircle(ctx, size, color) {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    function drawRect(ctx, size, color) {
        ctx.fillStyle = color;
        ctx.fillRect(-size / 2, -size / 2, size, size * 1.4);
    }

    function drawStar(ctx, size, color) {
        var spikes = 5;
        var outerRadius = size;
        var innerRadius = size * 0.45;
        ctx.beginPath();
        for (var i = 0; i < spikes * 2; i++) {
            var r = i % 2 === 0 ? outerRadius : innerRadius;
            var angle = (Math.PI / spikes) * i - Math.PI / 2;
            var x = Math.cos(angle) * r;
            var y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    function drawCoin(ctx, size, color) {
        // 金币：外圈 + 内圈 + 高光
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = '#FFF8DC';
        ctx.fill();

        // ¥ 符号
        ctx.fillStyle = color;
        ctx.font = 'bold ' + Math.round(size * 1.1) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('¥', 0, 1);
    }

    // ===== 动画循环 =====

    function startLoop() {
        if (rafId) return;
        isRunning = true;

        function frame() {
            if (!isRunning) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            var alive = [];
            for (var i = 0; i < particles.length; i++) {
                var p = particles[i];
                p.update();
                if (p.life > 0 && p.y < window.innerHeight + 60) {
                    p.draw(ctx);
                    alive.push(p);
                }
            }
            particles = alive;

            if (particles.length === 0) {
                stopLoop();
                return;
            }

            rafId = requestAnimationFrame(frame);
        }

        rafId = requestAnimationFrame(frame);
    }

    function stopLoop() {
        isRunning = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        particles = [];
    }

    // ===== 预设场景 =====

    /**
     * 五彩纸屑爆发（专注完成）
     * @param {Object} options { x, y, count }
     */
    TmindEffects.burstConfetti = function (options) {
        if (!ensureCanvas()) return;
        options = options || {};

        var x = options.x !== undefined ? options.x : window.innerWidth / 2;
        var y = options.y !== undefined ? options.y : window.innerHeight / 2;
        var count = options.count || 60;

        var shapes = ['rect', 'circle', 'star'];
        for (var i = 0; i < count; i++) {
            particles.push(new Particle({
                x: x,
                y: y,
                shape: shapes[Math.floor(Math.random() * shapes.length)],
                color: pickColor(COLOR_PALETTE),
                size: randomBetween(4, 9),
                speed: randomBetween(5, 12)
            }));
        }

        startLoop();
    };

    /**
     * 金币跳跃（结算奖励反馈）
     * @param {Object} options { x, y, count }
     */
    TmindEffects.coinJump = function (options) {
        if (!ensureCanvas()) return;
        options = options || {};

        var x = options.x !== undefined ? options.x : window.innerWidth / 2;
        var y = options.y !== undefined ? options.y : window.innerHeight - 80;
        var count = options.count || 24;

        for (var i = 0; i < count; i++) {
            // 让金币向上跳跃，左右散开
            var angle = -Math.PI / 2 + randomBetween(-0.7, 0.7);
            var speed = randomBetween(8, 14);
            particles.push(new Particle({
                x: x + randomBetween(-30, 30),
                y: y,
                shape: 'coin',
                color: pickColor(COIN_COLORS),
                size: randomBetween(6, 11),
                speed: speed,
                angle: angle,
                gravity: 0.32,
                friction: 0.992,
                decay: randomBetween(0.005, 0.01)
            }));
        }

        startLoop();
    };

    /**
     * 星形爆发（等级提升 / 徽章解锁）
     * @param {Object} options { x, y, count }
     */
    TmindEffects.starBurst = function (options) {
        if (!ensureCanvas()) return;
        options = options || {};

        var x = options.x !== undefined ? options.x : window.innerWidth / 2;
        var y = options.y !== undefined ? options.y : window.innerHeight / 2;
        var count = options.count || 40;

        for (var i = 0; i < count; i++) {
            particles.push(new Particle({
                x: x,
                y: y,
                shape: 'star',
                color: pickColor(COLOR_PALETTE),
                size: randomBetween(5, 12),
                speed: randomBetween(6, 14),
                gravity: 0.1,
                decay: randomBetween(0.006, 0.012)
            }));
        }

        startLoop();
    };

    /**
     * 终极爆发（升级 + 徽章解锁组合特效）
     */
    TmindEffects.ultimateBurst = function (options) {
        if (!ensureCanvas()) return;
        options = options || {};

        var x = options.x !== undefined ? options.x : window.innerWidth / 2;
        var y = options.y !== undefined ? options.y : window.innerHeight / 2;

        // 第一波：星形爆发
        TmindEffects.starBurst({ x: x, y: y, count: 36 });

        // 第二波：五彩纸屑（延迟 250ms）
        setTimeout(function () {
            TmindEffects.burstConfetti({ x: x, y: y, count: 50 });
        }, 250);

        // 第三波：金币跳跃（延迟 500ms）
        setTimeout(function () {
            TmindEffects.coinJump({ x: x, y: y + 80, count: 18 });
        }, 500);
    };

    /**
     * 立即停止所有特效
     */
    TmindEffects.stop = function () {
        stopLoop();
    };

    /**
     * 销毁释放资源
     */
    TmindEffects.destroy = function () {
        stopLoop();
        if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
        }
        canvas = null;
        ctx = null;
        window.removeEventListener('resize', resizeCanvas);
    };

    global.TmindEffects = TmindEffects;

})(window);
