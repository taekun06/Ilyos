/* Utilitaire de test, pas une spec : partagé par progression.spec.js et
   reseau-securite.spec.js. */

/* Faux PeerJS : même interface que le SDK pour ce qu'utilise core.js, deux
   onglets du même contexte reliés par BroadcastChannel. Le profil est rangé
   par onglet (sessionStorage), sinon les deux joueurs partageraient le leur. */
function fauxPeer() {
  const lire = Storage.prototype.getItem, ecrire = Storage.prototype.setItem;
  Storage.prototype.getItem = function (k) { return lire.call(k === 'ilyos-profil-v1' && this === localStorage ? sessionStorage : this, k); };
  Storage.prototype.setItem = function (k, v) { return ecrire.call(k === 'ilyos-profil-v1' && this === localStorage ? sessionStorage : this, k, v); };
  class Emetteur {
    constructor() { this.h = {}; }
    on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
    emit(e, ...a) { (this.h[e] || []).forEach(f => f(...a)); }
  }
  const canal = new BroadcastChannel('ilyos-faux-peer');
  class Connexion extends Emetteur {
    constructor(moi, autre) {
      super(); this.moi = moi; this.autre = autre; this.open = false;
      canal.addEventListener('message', ({ data: m }) => {
        if (m.to !== this.moi) return;
        if (m.k === 'open' && !this.open) { this.open = true; setTimeout(() => this.emit('open'), 20); }
        if (m.k === 'data') this.emit('data', JSON.parse(m.d));
      });
    }
    send(d) { canal.postMessage({ to: this.autre, k: 'data', d: JSON.stringify(d) }); }
    // Les fermetures sont notées : le test de sécurité réseau vérifie
    // laquelle des connexions l'hôte a coupée.
    close() { (window.__fauxPeerFermetures = window.__fauxPeerFermetures || []).push(this.autre); }
  }
  class Peer extends Emetteur {
    constructor(id) {
      super(); this.id = id || 'invite';
      setTimeout(() => this.emit('open', this.id), 50);
      canal.addEventListener('message', ({ data: m }) => {
        if (m.k !== 'connect' || m.to !== this.id) return;
        const c = new Connexion(`${this.id}:h`, m.from);
        this.emit('connection', c);
        setTimeout(() => { canal.postMessage({ to: m.from, k: 'open' }); c.open = true; c.emit('open'); }, 30);
      });
    }
    connect(hote) { const c = new Connexion('invite:c', `${hote}:h`); canal.postMessage({ k: 'connect', to: hote, from: 'invite:c' }); return c; }
    reconnect() { }
    destroy() { }
  }
  Object.defineProperty(window, 'Peer', { value: Peer, writable: false, configurable: false });
}

module.exports = { fauxPeer };
