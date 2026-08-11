    if (location.protocol === 'file:') {
      window.addEventListener('DOMContentLoaded', () => {
        const n = document.createElement('div');
        n.style.cssText = 'position:fixed;inset:12px 12px auto 12px;z-index:999999;padding:12px 16px;border-radius:12px;background:#7b1b32;color:white;font:700 14px Arial;box-shadow:0 8px 30px #0008';
        n.textContent = 'Ouverture directe bloquée : lancez DEMARRER_ILYOS.bat puis ouvrez http://localhost:8000';
        document.body.appendChild(n);
      });
    }
