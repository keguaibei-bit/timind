(function () {
    'use strict';

    var routes = {
        home: { title: '首页', view: 'view-home' },
        focus: { title: '专注', view: 'view-focus' },
        reports: { title: '数据复盘', view: 'view-reports' },
        planet: { title: '星球', view: 'view-planet' },
        settings: { title: '设置', view: 'view-settings' },
        profile: { title: '个人中心', view: 'view-profile' }
    };

    var currentRoute = 'home';
    var isAnimating = false;

    function getRouteFromHash() {
        var hash = window.location.hash.replace('#/', '').replace('#', '');
        if (!hash || !routes[hash]) {
            return 'home';
        }
        return hash;
    }

    function getRouteIndex(routeName) {
        var keys = Object.keys(routes);
        return keys.indexOf(routeName);
    }

    function navigate(routeName, direction) {
        if (isAnimating || routeName === currentRoute) {
            return;
        }

        if (!routes[routeName]) {
            routeName = 'home';
        }

        isAnimating = true;

        var currentIndex = getRouteIndex(currentRoute);
        var targetIndex = getRouteIndex(routeName);

        if (direction === undefined) {
            direction = targetIndex > currentIndex ? 'forward' : 'back';
        }

        var currentView = document.getElementById(routes[currentRoute].view);
        var targetView = document.getElementById(routes[routeName].view);

        if (!currentView || !targetView) {
            isAnimating = false;
            return;
        }

        updateActiveNav(routeName);
        updateTopBarTitle(routeName);

        if (direction === 'forward') {
            targetView.style.transform = 'translateX(30px)';
            currentView.classList.add('slide-left');
        } else {
            targetView.style.transform = 'translateX(-30px)';
        }

        targetView.style.opacity = '0';
        targetView.style.visibility = 'visible';

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                targetView.style.transform = 'translateX(0)';
                targetView.style.opacity = '1';

                currentView.style.opacity = '0';
                if (direction === 'forward') {
                    currentView.style.transform = 'translateX(-30px)';
                } else {
                    currentView.style.transform = 'translateX(30px)';
                }
            });
        });

        setTimeout(function () {
            currentView.classList.remove('active', 'slide-left');
            currentView.style.transform = '';
            currentView.style.opacity = '';
            currentView.style.visibility = '';

            targetView.classList.add('active');
            targetView.style.transform = '';
            targetView.style.opacity = '';
            targetView.style.visibility = '';

            currentRoute = routeName;
            isAnimating = false;
        }, 300);
    }

    function updateActiveNav(routeName) {
        var navItems = document.querySelectorAll('.nav-item, .tab-item');
        navItems.forEach(function (item) {
            if (item.getAttribute('data-route') === routeName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function updateTopBarTitle(routeName) {
        var titleEl = document.getElementById('topBarTitle');
        if (titleEl && routes[routeName]) {
            titleEl.textContent = routes[routeName].title;
        }
    }

    function setTheme(themeName) {
        var html = document.documentElement;
        html.setAttribute('data-theme', themeName);

        var themeBtns = document.querySelectorAll('.theme-btn, .option-btn[data-theme]');
        themeBtns.forEach(function (btn) {
            if (btn.getAttribute('data-theme') === themeName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        try {
            localStorage.setItem('tmind-theme', themeName);
        } catch (e) {}

        updateThemeColor(themeName);
    }

    function updateThemeColor(themeName) {
        var metaTheme = document.querySelector('meta[name="theme-color"]');
        if (!metaTheme) return;

        var colors = {
            day: '#ffffff',
            night: '#0a0c1a',
            eye: '#c7edcc'
        };

        metaTheme.setAttribute('content', colors[themeName] || colors.night);
    }

    function initTheme() {
        var savedTheme = null;
        try {
            savedTheme = localStorage.getItem('tmind-theme');
        } catch (e) {}

        if (savedTheme && (savedTheme === 'day' || savedTheme === 'night' || savedTheme === 'eye')) {
            setTheme(savedTheme);
        } else {
            setTheme('night');
        }
    }

    function toggleSidebar() {
        var sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
    }

    function closeSidebarOnRouteChange() {
        var sidebar = document.getElementById('sidebar');
        if (sidebar && window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }
    }

    function handleHashChange() {
        var route = getRouteFromHash();
        navigate(route);
        closeSidebarOnRouteChange();
    }

    function initNavigation() {
        var navLinks = document.querySelectorAll('a[href^="#/"]');
        navLinks.forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                var route = link.getAttribute('data-route');
                if (route) {
                    window.location.hash = '#/' + route;
                }
            });
        });
    }

    function initThemeButtons() {
        var themeBtns = document.querySelectorAll('[data-theme]');
        themeBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var theme = btn.getAttribute('data-theme');
                if (theme && (theme === 'day' || theme === 'night' || theme === 'eye')) {
                    setTheme(theme);
                }
            });
        });
    }

    function initMenuToggle() {
        var menuBtn = document.getElementById('menuToggle');
        if (menuBtn) {
            menuBtn.addEventListener('click', toggleSidebar);
        }
    }

    function initSwipeGesture() {
        var touchStartX = 0;
        var touchStartY = 0;
        var touchEndX = 0;
        var touchEndY = 0;
        var minSwipeDistance = 50;

        var viewContainer = document.getElementById('viewContainer');
        if (!viewContainer) return;

        viewContainer.addEventListener('touchstart', function (e) {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        viewContainer.addEventListener('touchend', function (e) {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }, { passive: true });

        function handleSwipe() {
            var deltaX = touchEndX - touchStartX;
            var deltaY = touchEndY - touchStartY;

            if (Math.abs(deltaX) < minSwipeDistance || Math.abs(deltaY) > Math.abs(deltaX)) {
                return;
            }

            var keys = Object.keys(routes);
            var currentIndex = keys.indexOf(currentRoute);

            if (deltaX < 0 && currentIndex < keys.length - 1) {
                window.location.hash = '#/' + keys[currentIndex + 1];
            } else if (deltaX > 0 && currentIndex > 0) {
                window.location.hash = '#/' + keys[currentIndex - 1];
            }
        }
    }

    function initKeyboardNavigation() {
        document.addEventListener('keydown', function (e) {
            var keys = Object.keys(routes);
            var currentIndex = keys.indexOf(currentRoute);

            if (e.key === 'ArrowRight' && currentIndex < keys.length - 1) {
                window.location.hash = '#/' + keys[currentIndex + 1];
            } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
                window.location.hash = '#/' + keys[currentIndex - 1];
            } else if (e.key === 'Escape') {
                var sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                }
            }
        });
    }

    function init() {
        initTheme();
        initNavigation();
        initThemeButtons();
        initMenuToggle();
        initSwipeGesture();
        initKeyboardNavigation();

        var initialRoute = getRouteFromHash();
        currentRoute = initialRoute;

        var initialView = document.getElementById(routes[initialRoute].view);
        if (initialView) {
            initialView.classList.add('active');
        }

        updateActiveNav(initialRoute);
        updateTopBarTitle(initialRoute);

        if (!window.location.hash) {
            window.location.hash = '#/home';
        }

        window.addEventListener('hashchange', handleHashChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
