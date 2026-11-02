/*
 * Comptes ILYOS : pseudo + mot de passe, profil de progression sauvegardé.
 *
 * Logique pure, sans dépendance Netlify : `store` fournit get(cle) et
 * set(cle, valeur) (Netlify Blobs en ligne, une Map en développement).
 *
 * Le mot de passe n'est jamais stocké : seulement son empreinte scrypt salée.
 * Après création ou connexion, l'appareil reçoit un jeton aléatoire ; le
 * serveur n'en garde que l'empreinte SHA-256. Les sauvegardes suivantes se
 * font avec ce jeton, le mot de passe ne reste pas sur l'appareil.
 */
import { randomBytes, scrypt as scryptCb, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const PROFIL_MAX = 64 * 1024;      // octets de JSON
const JETONS_MAX = 8;              // appareils connectés par compte
const ECHECS_MAX = 8;              // essais de mot de passe avant pause
const PAUSE_MS = 15 * 60 * 1000;

export function pseudoValide(nom) {
  if (typeof nom !== "string") return null;
  const propre = nom.normalize("NFC").replace(/\s+/g, " ").trim();
  return /^[\p{L}\p{N} ._-]{2,16}$/u.test(propre) ? propre : null;
}

/* Deux pseudos qui ne diffèrent que par la casse désignent le même compte. */
export function cleCompte(pseudo) {
  return "c/" + encodeURIComponent(pseudo.toLocaleLowerCase("fr"));
}

function motDePasseValide(mdp) {
  return typeof mdp === "string" && mdp.length >= 6 && mdp.length <= 128;
}

async function empreinte(mdp, sel) {
  return (await scrypt(mdp, sel, 32, { N: 16384, r: 8, p: 1 })).toString("hex");
}

function sha(texte) {
  return createHash("sha256").update(texte).digest("hex");
}

function egal(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function profilAccepte(profil) {
  if (!profil || typeof profil !== "object" || Array.isArray(profil)) return false;
  return JSON.stringify(profil).length <= PROFIL_MAX;
}

function nouveauJeton(compte) {
  const jeton = randomBytes(24).toString("base64url");
  compte.jetons = [sha(jeton), ...(compte.jetons || [])].slice(0, JETONS_MAX);
  return jeton;
}

const erreur = (statut, code) => ({ statut, corps: { ok: false, erreur: code } });
const reussite = corps => ({ statut: 200, corps: { ok: true, ...corps } });

export async function traiter(demande, store, maintenant = Date.now()) {
  if (!demande || typeof demande !== "object") return erreur(400, "demande");
  const pseudo = pseudoValide(demande.pseudo);
  if (!pseudo) return erreur(400, "pseudo");
  const cle = cleCompte(pseudo);
  const compte = await store.get(cle);

  switch (demande.action) {
    case "creer": {
      if (!motDePasseValide(demande.motDePasse)) return erreur(400, "mot-de-passe");
      if (compte) return erreur(409, "pseudo-pris");
      if (demande.profil !== undefined && !profilAccepte(demande.profil)) return erreur(413, "profil");
      const sel = randomBytes(16).toString("hex");
      const neuf = {
        pseudo, sel, empreinte: await empreinte(demande.motDePasse, sel),
        jetons: [], echecs: 0, pauseJusqua: 0,
        profil: demande.profil || null, cree: maintenant, maj: maintenant
      };
      const jeton = nouveauJeton(neuf);
      await store.set(cle, neuf);
      return reussite({ pseudo, jeton });
    }
    case "connexion": {
      if (!compte) return erreur(401, "identifiants");
      if (compte.pauseJusqua > maintenant) return erreur(429, "pause");
      if (!motDePasseValide(demande.motDePasse) || !egal(await empreinte(demande.motDePasse, compte.sel), compte.empreinte)) {
        compte.echecs = (compte.echecs || 0) + 1;
        if (compte.echecs >= ECHECS_MAX) { compte.echecs = 0; compte.pauseJusqua = maintenant + PAUSE_MS; }
        await store.set(cle, compte);
        return erreur(401, "identifiants");
      }
      compte.echecs = 0;
      const jeton = nouveauJeton(compte);
      await store.set(cle, compte);
      return reussite({ pseudo: compte.pseudo, jeton, profil: compte.profil, maj: compte.maj });
    }
    case "lire":
    case "sauver": {
      if (!compte || typeof demande.jeton !== "string" || !(compte.jetons || []).some(j => egal(j, sha(demande.jeton)))) {
        return erreur(401, "jeton");
      }
      if (demande.action === "lire") return reussite({ pseudo: compte.pseudo, profil: compte.profil, maj: compte.maj });
      if (!profilAccepte(demande.profil)) return erreur(413, "profil");
      compte.profil = demande.profil;
      compte.maj = maintenant;
      await store.set(cle, compte);
      return reussite({ maj: compte.maj });
    }
    default:
      return erreur(400, "action");
  }
}

/* Point d'entrée HTTP commun (Netlify et serveur de développement). */
export async function repondre(texte, store) {
  let demande = null;
  try { demande = JSON.parse(texte); } catch (_) { }
  if (typeof texte !== "string" || texte.length > PROFIL_MAX + 4096) return erreur(413, "taille");
  return traiter(demande, store);
}
