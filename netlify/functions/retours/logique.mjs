/*
 * Retours des joueurs ILYOS : signalements de bug, avis, erreurs JavaScript
 * remontées automatiquement, et parties gagnées contre le CPU Expert (pour
 * améliorer l'IA).
 *
 * Logique pure, sans dépendance Netlify : `store` fournit get(cle),
 * set(cle, valeur), list(prefixe) → [cles] et delete(cle) (Netlify Blobs en
 * ligne, une Map dans scripts/verif-retours.mjs). `prevenir(message)` envoie
 * une notification (Discord si configuré) ; ses échecs n'empêchent jamais
 * d'enregistrer.
 *
 * Rangement :
 *   r/<id>  un retour (signalement, avis ou victoire), sans la partie
 *   p/<id>  la partie jointe (journal des défaites, gzip ≈ 30 Ko)
 *   e/<empreinte>  une erreur JavaScript, comptée (mêmes erreurs regroupées)
 *   l/<ip>/<heure> compteur anti-abus
 * Lecture (« lister », « lire », « partie », « supprimer ») : réservée au code
 * secret RETOURS_CODE.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

/* Une partie (≈ 0,6 Mo de JSON) se compresse ~20 fois (≈ 30 Ko) : elle est
   rangée compressée, et rendue telle quelle à la lecture. */
const ranger = json => ({ gz: gzipSync(Buffer.from(json, "utf8"), { level: 9 }).toString("base64") });
const deballer = brut => (brut && typeof brut.gz === "string" ? JSON.parse(gunzipSync(Buffer.from(brut.gz, "base64")).toString("utf8")) : brut);

const TEXTE_MAX = 3000;
const CONTACT_MAX = 120;
const PARTIE_MAX = 3 * 1024 * 1024;   // octets de JSON
const PILE_MAX = 4000;
const LIMITES = { signaler: 12, victoire: 12, erreur: 40 }; // par appareil et par heure
const TYPES = new Set(["bug", "avis"]);

const erreur = (statut, code) => ({ statut, corps: { ok: false, erreur: code } });
const reussite = corps => ({ statut: 200, corps: { ok: true, ...corps } });

const sha = texte => createHash("sha256").update(String(texte)).digest("hex");

function egal(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function texte(valeur, max) {
  if (typeof valeur !== "string") return "";
  return valeur.normalize("NFC").replace(/\u0000/g, "").trim().slice(0, max);
}

/* Le contexte de l'appareil : seulement des champs courts et connus. */
function contexte(brut) {
  const c = brut && typeof brut === "object" ? brut : {};
  const champ = (cle, max = 200) => texte(c[cle], max);
  return {
    version: champ("version", 80),
    page: champ("page", 300),
    navigateur: champ("navigateur", 300),
    ecran: champ("ecran", 40),
    langue: champ("langue", 20),
    mode: champ("mode", 80),
    tour: Number.isFinite(c.tour) ? c.tour : null,
    pseudo: champ("pseudo", 20),
    erreurs: Array.isArray(c.erreurs) ? c.erreurs.slice(-8).map(e => texte(e, 400)).filter(Boolean) : []
  };
}

function nouvelId(maintenant) {
  return new Date(maintenant).toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(3).toString("hex");
}

async function limiter(store, ip, action, maintenant) {
  if (!ip) return null;
  const heure = new Date(maintenant).toISOString().slice(0, 13);
  const cle = `l/${sha(ip).slice(0, 16)}/${action}/${heure}`;
  const n = ((await store.get(cle)) || 0) + 1;
  if (n > LIMITES[action]) return erreur(429, "trop");
  await store.set(cle, n);
  return null;
}

function partieAcceptee(partie) {
  if (!partie || typeof partie !== "object" || Array.isArray(partie)) return null;
  const json = JSON.stringify(partie);
  return json.length <= PARTIE_MAX ? json : false;
}

function resumeVictoire(partie) {
  const fin = partie && partie.fin || {};
  const joueurs = Array.isArray(partie && partie.joueurs) ? partie.joueurs : [];
  const scores = Array.isArray(fin.scores) ? fin.scores.join("-") : "?";
  const noms = joueurs.map(j => j && j.nom).filter(Boolean).join(" contre ");
  return `${noms || "Partie"} · ${scores} en ${Number.isFinite(fin.tours) ? fin.tours : "?"} tours`;
}

function ligneContexte(c) {
  return [c.version && `version ${c.version}`, c.mode, c.ecran, c.navigateur].filter(Boolean).join(" · ");
}

export async function traiter(demande, store, { ip = "", code = "", prevenir = null, maintenant = Date.now() } = {}) {
  if (!demande || typeof demande !== "object") return erreur(400, "demande");
  const avertir = async message => {
    if (!prevenir) return;
    try { await prevenir(message); } catch (_) { /* la notification est un bonus */ }
  };

  switch (demande.action) {
    case "signaler": {
      const type = TYPES.has(demande.type) ? demande.type : null;
      const message = texte(demande.texte, TEXTE_MAX);
      if (!type) return erreur(400, "type");
      if (message.length < 3) return erreur(400, "texte");
      const partie = partieAcceptee(demande.partie);
      if (partie === false) return erreur(413, "partie");
      const refus = await limiter(store, ip, "signaler", maintenant);
      if (refus) return refus;
      const id = nouvelId(maintenant);
      const retour = {
        id, type, texte: message, contact: texte(demande.contact, CONTACT_MAX),
        contexte: contexte(demande.contexte), partie: !!partie, recu: maintenant, lu: false
      };
      await store.set(`r/${id}`, retour);
      if (partie) await store.set(`p/${id}`, ranger(partie));
      await avertir({
        titre: type === "bug" ? "🐞 Bug signalé" : "💬 Avis d'un joueur",
        texte: message, contact: retour.contact, details: ligneContexte(retour.contexte),
        erreurs: retour.contexte.erreurs, fichier: partie ? { nom: `ilyos-partie-${id}.json`, contenu: partie } : null
      });
      return reussite({ id });
    }

    case "victoire": {
      const partie = partieAcceptee(demande.partie);
      if (!partie) return erreur(partie === false ? 413 : 400, "partie");
      const dossier = JSON.parse(partie);
      if (dossier.jeu !== "ILYOS" || dossier.type !== "defaite-expert") return erreur(400, "partie");
      const refus = await limiter(store, ip, "victoire", maintenant);
      if (refus) return refus;
      const id = nouvelId(maintenant);
      const resume = resumeVictoire(dossier);
      const retour = { id, type: "victoire", texte: resume, contact: "", contexte: contexte(demande.contexte), partie: true, recu: maintenant, lu: false };
      await store.set(`r/${id}`, retour);
      await store.set(`p/${id}`, ranger(partie));
      await avertir({
        titre: "🏆 Victoire contre le CPU Expert", texte: resume, details: ligneContexte(retour.contexte),
        fichier: { nom: `ilyos-defaite-${id}.json`, contenu: partie }
      });
      return reussite({ id });
    }

    case "erreur": {
      const message = texte(demande.message, 500);
      if (!message) return erreur(400, "message");
      const refus = await limiter(store, ip, "erreur", maintenant);
      if (refus) return refus;
      const pile = texte(demande.pile, PILE_MAX);
      const source = texte(demande.source, 300);
      const c = contexte(demande.contexte);
      /* Même message au même endroit = même erreur, quel que soit l'appareil. */
      const lieu = (pile.split("\n").find(l => /\.js/.test(l)) || source).replace(/\?v=[^:)\s]*/g, "");
      const cle = `e/${sha(message + "|" + lieu).slice(0, 24)}`;
      const connue = await store.get(cle);
      const fiche = connue || { message, pile, source, nombre: 0, premier: maintenant, versions: [], exemples: [] };
      fiche.nombre += 1;
      fiche.dernier = maintenant;
      if (c.version && !fiche.versions.includes(c.version)) fiche.versions = [...fiche.versions, c.version].slice(-6);
      if (fiche.exemples.length < 5) fiche.exemples.push({ quand: maintenant, ...c, erreurs: undefined });
      await store.set(cle, fiche);
      /* Une notification à la première apparition, puis à 10 et 100. */
      if (fiche.nombre === 1 || fiche.nombre === 10 || fiche.nombre === 100) {
        await avertir({
          titre: fiche.nombre === 1 ? "⚠️ Nouvelle erreur dans le jeu" : `⚠️ Erreur vue ${fiche.nombre} fois`,
          texte: message, details: ligneContexte(c), erreurs: pile ? [pile.slice(0, 900)] : []
        });
      }
      return reussite({});
    }

    case "lister":
    case "lire":
    case "partie":
    case "marquer":
    case "supprimer": {
      if (!code || typeof demande.code !== "string" || !egal(sha(demande.code), sha(code))) return erreur(401, "code");
      const id = typeof demande.id === "string" && /^[\w-]{6,80}$/.test(demande.id) ? demande.id : null;
      if (demande.action === "lister") {
        const retours = [];
        for (const cle of await store.list("r/")) {
          const r = await store.get(cle);
          if (r) retours.push(r);
        }
        const erreurs = [];
        for (const cle of await store.list("e/")) {
          const e = await store.get(cle);
          if (e) erreurs.push({ id: cle.slice(2), ...e });
        }
        retours.sort((a, b) => b.recu - a.recu);
        erreurs.sort((a, b) => b.dernier - a.dernier);
        return reussite({ retours, erreurs });
      }
      if (!id) return erreur(400, "id");
      if (demande.action === "partie") {
        const partie = deballer(await store.get(`p/${id}`));
        return partie ? reussite({ partie }) : erreur(404, "absent");
      }
      if (demande.action === "marquer") {
        const r = await store.get(`r/${id}`);
        if (!r) return erreur(404, "absent");
        if (typeof demande.lu === "boolean") r.lu = demande.lu;
        /* « analysée » : posé par scripts/recuperer-victoires.mjs, pour que la
           prochaine session d'analyse ne reprenne que les nouvelles parties. */
        if (typeof demande.analysee === "boolean") r.analysee = demande.analysee;
        await store.set(`r/${id}`, r);
        return reussite({});
      }
      if (demande.action === "supprimer") {
        await store.delete(`r/${id}`);
        await store.delete(`p/${id}`);
        await store.delete(`e/${id}`);
        return reussite({});
      }
      const r = await store.get(`r/${id}`);
      return r ? reussite({ retour: r }) : erreur(404, "absent");
    }

    default:
      return erreur(400, "action");
  }
}

export async function repondre(texteBrut, store, options) {
  if (typeof texteBrut !== "string" || texteBrut.length > PARTIE_MAX + 64 * 1024) return erreur(413, "trop-gros");
  let demande = null;
  try { demande = JSON.parse(texteBrut); } catch (_) { return erreur(400, "json"); }
  return traiter(demande, store, options);
}
