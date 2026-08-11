(function () {
    function bootV12UI() {
        const main = document.querySelector('.game-main');
        const left = document.querySelector('.left-panel');
        const right = document.querySelector('.right-panel');
        if (!main || !left || !right || main.querySelector('.v12-panel-toggle')) return;

        const makeToggle = (side, panel, label) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'v12-panel-toggle ' + side;
            btn.setAttribute('aria-label', label);
            btn.setAttribute('aria-expanded', 'true');
            btn.textContent = side === 'left' ? '‹' : '›';
            btn.addEventListener('click', () => {
                const collapsed = panel.classList.toggle('panel-collapsed');
                btn.setAttribute('aria-expanded', String(!collapsed));
                btn.textContent = side === 'left' ? (collapsed ? '›' : '‹') : (collapsed ? '‹' : '›');
                try { localStorage.setItem('ilyos-v12-' + side, collapsed ? '1' : '0') } catch (_) { }
            });
            main.appendChild(btn);
            try {
                const saved = localStorage.getItem('ilyos-v12-' + side) === '1';
                if (saved) { panel.classList.add('panel-collapsed'); btn.setAttribute('aria-expanded', 'false'); btn.textContent = side === 'left' ? '›' : '‹' }
            } catch (_) { }
            return btn;
        };
        makeToggle('left', left, 'Afficher ou masquer le panneau des îles');
        makeToggle('right', right, 'Afficher ou masquer le panneau des actions');

        const adapt = () => {
            if (window.innerWidth < 980) {
                left.classList.add('panel-collapsed');
                right.classList.add('panel-collapsed');
                document.querySelectorAll('.v12-panel-toggle').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
            }
        };
        adapt();

        document.addEventListener('keydown', event => {
            if (event.key === 'Tab' && event.shiftKey) return;
            if (event.key.toLowerCase() === 'i') document.querySelector('.v12-panel-toggle.left')?.click();
            if (event.key.toLowerCase() === 'a') document.querySelector('.v12-panel-toggle.right')?.click();
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootV12UI);
    else bootV12UI();
})();