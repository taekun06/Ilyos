    window.addEventListener('error', event => {
      console.error('[ILYOS V74]', event.error || event.message);
      if (document.body && !document.querySelector('.ilyos-boot-error') && document.body.innerText.trim().length < 30) {
        const panel = document.createElement('div'); panel.className = 'ilyos-boot-error';
        panel.innerHTML = '<h2>ILYOS V74 — erreur de démarrage</h2><p>' + String(event.message || event.error || 'Erreur inconnue') + '</p><p>Rechargez la page après avoir laissé la fenêtre serveur ouverte.</p>';
        document.body.appendChild(panel);
      }
    });
