(function (global) {
    'use strict';

    var canvas = null;
    var ctx = null;
    var particles = [];
    var animationId = null;
    var isActive = false;

    var COLORS = [
        '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
        '#ff9f43', '#ee5a6f', '#a55eea', '#26de81',
        '#fd79a8', '#fdcb6e'
    ];

    function Particle(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = (Math.random() - 0.8) * 14 - 4;
        this.gravity = 0.35;
        this.size = Math.random() * 6 + 4;
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.3;
        this.life = 1.0;
        this.decay = Math.random() * 0.012 + 0.008;
        this.shape = Math.floor(Math.random() * 3);
    }

    Particle.prototype.update = function () {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx *= 0.99;
        this.rotation += this.rotationSpeed;
        this.life -= this.decay;
    };

    Particle.prototype.draw = function (context) {
        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.rotation);
        context.globalAlpha = Math.max(0, this.life);
        context.fillStyle = this.color;

        if (this.shape === 0) {
            context.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 1.6);
        } else if (this.shape === 1) {
            context.beginPath();
            context.arc(0, 0, this.size / 2, 0, Math.PI * 2);
            context.fill();
        } else {
            context.beginPath();
            context.moveTo(0, -this.size / 2);
            context.lineTo(this.size / 2, this.size / 2);
            context.lineTo(-this.size / 2, this.size / 2);
            context.closePath();
            context.fill();
        }

        context.restore();
    };

    function ensureCanvas() {
        if (canvas) return;

        canvas = document.createElement('canvas');
        canvas.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100%',
            'height: 100%',
            'pointer-events: none',
            'z-index: 99999'
        ].join(';');
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
        resize();
    }

    function resize() {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function burst(originX, originY, count) {
        if (!originX) originX = window.innerWidth / 2;
        if (!originY) originY = window.innerHeight / 2;
        if (!count) count = 80;

        for (var i = 0; i < count; i++) {
            particles.push(new Particle(originX, originY));
        }
    }

    function burstFromBottoms(count) {
        if (!count) count = 60;
        var w = window.innerWidth;
        for (var i = 0; i < count; i++) {
            var x = Math.random() * w;
            var y = window.innerHeight + 10;
            var p = new Particle(x, y);
            p.vy = -(Math.random() * 12 + 8);
            p.vx = (Math.random() - 0.5) * 8;
            particles.push(p);
        }
    }

    function animate() {
        if (!isActive) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.update();
            p.draw(ctx);

            if (p.life <= 0 || p.y > canvas.height + 50) {
                particles.splice(i, 1);
            }
        }

        if (particles.length === 0) {
            stop();
            return;
        }

        animationId = requestAnimationFrame(animate);
    }

    function start(options) {
        options = options || {};

        ensureCanvas();
        resize();

        isActive = true;
        particles = [];

        var w = window.innerWidth;
        var h = window.innerHeight;
        var count = options.count || 120;

        if (options.fromBottom) {
            burstFromBottoms(count);
        } else if (options.x !== undefined && options.y !== undefined) {
            burst(options.x, options.y, count);
        } else {
            var burstCount = Math.floor(count / 2);
            burst(w * 0.25, h * 0.5, burstCount);
            burst(w * 0.75, h * 0.5, burstCount);
            burst(w * 0.5, h * 0.35, count - burstCount * 2);
        }

        if (!animationId) {
            animate();
        }
    }

    function stop() {
        isActive = false;
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        particles = [];
    }

    window.addEventListener('resize', function () {
        resize();
    });

    global.Confetti = {
        start: start,
        stop: stop,
        burst: burst,
        isRunning: function () { return isActive; }
    };

})(window);
