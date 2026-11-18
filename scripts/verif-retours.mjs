/* Banc de la fonction /api/retours (netlify/functions/retours/logique.mjs),
   sans Netlify : magasin en mémoire, notifications comptées.
     node scripts/verif-retours.mjs */
import assert from "node:assert/strict";
import { traiter, repondre } from "../netlify/functions/retours/logique.mjs";

const memoire = new Map();
const store = {
  get: async k => (memoire.has(k) ? JSON.parse(memoire.get(k)) : null),
  set: async (k, v) => { memoire.set(k, JSON.stringify(v)); },
  delete: async k => { memoire.delete(k); },
  list: async p => [...memoire.keys()].filter(k => k.startsWith(p))
};
const notes = [];
const opts = (extra = {}) => ({ ip: "1.2.3.4", code: "secret", prevenir: async m => notes.push(m), ...extra });
let t = Date.UTC(2026, 10, 14, 10);

// Signalement simple
let r = await traiter({ action: "signaler", type: "bug", texte: "La caméra tourne seule", contact: "moi#1", contexte: { version: "V76", navigateur: "x".repeat(900) } }, store, opts({ maintenant: t }));
assert.equal(r.statut, 200);
assert.equal(notes.length, 1);
assert.match(notes[0].titre, /Bug/);
assert.equal(notes[0].fichier, null);

// Refus : type ou texte manquant
assert.equal((await traiter({ action: "signaler", type: "x", texte: "abc" }, store, opts())).statut, 400);
assert.equal((await traiter({ action: "signaler", type: "avis", texte: " " }, store, opts())).statut, 400);

// Avis avec partie jointe : fichier joint à la notification
r = await traiter({ action: "signaler", type: "avis", texte: "Super jeu", partie: { jeu: "ILYOS", type: "signalement", tours: [] } }, store, opts({ maintenant: t + 1 }));
assert.equal(r.statut, 200);
assert.ok(notes.at(-1).fichier && /ilyos-partie-/.test(notes.at(-1).fichier.nom));

// Victoire : seulement un dossier « defaite-expert »
assert.equal((await traiter({ action: "victoire", partie: { jeu: "ILYOS", type: "partie" } }, store, opts())).statut, 400);
r = await traiter({ action: "victoire", partie: { jeu: "ILYOS", type: "defaite-expert", joueurs: [{ nom: "Taekun" }, { nom: "CPU" }], fin: { scores: [2, 0], tours: 21 } } }, store, opts({ maintenant: t + 2 }));
assert.equal(r.statut, 200);
assert.match(notes.at(-1).texte, /Taekun contre CPU · 2-0 en 21 tours/);

// Erreurs regroupées : une seule fiche, une notification à la 1re occurrence
const avant = notes.length;
for (let i = 0; i < 3; i++) {
  r = await traiter({ action: "erreur", message: "x is undefined", source: "/js/game.js:10:2", pile: "at f (https://taekun.fr/js/game.js?v=abc:10:2)", contexte: { version: "V76 · " + i } }, store, opts({ ip: "9.9.9." + i }));
  assert.equal(r.statut, 200);
}
assert.equal([...memoire.keys()].filter(k => k.startsWith("e/")).length, 1);
assert.equal(notes.length, avant + 1);

// Limite par appareil et par heure
let dernier = null;
for (let i = 0; i < 14; i++) dernier = await traiter({ action: "signaler", type: "avis", texte: "spam " + i }, store, opts({ ip: "5.5.5.5", maintenant: t }));
assert.equal(dernier.statut, 429);

// Lecture : code obligatoire
assert.equal((await traiter({ action: "lister", code: "faux" }, store, opts())).statut, 401);
assert.equal((await traiter({ action: "lister", code: "secret" }, store, opts({ code: "" }))).statut, 401);
r = await traiter({ action: "lister", code: "secret" }, store, opts());
assert.equal(r.statut, 200);
assert.equal(r.corps.erreurs.length, 1);
const victoire = r.corps.retours.find(x => x.type === "victoire");
assert.ok(victoire && victoire.partie);
r = await traiter({ action: "partie", id: victoire.id, code: "secret" }, store, opts());
assert.equal(r.corps.partie.type, "defaite-expert");
await traiter({ action: "marquer", id: victoire.id, lu: true, code: "secret" }, store, opts());
assert.equal((await store.get(`r/${victoire.id}`)).lu, true);
// Partie rangée compressée, rendue intacte
assert.ok(typeof (await store.get(`p/${victoire.id}`)).gz === "string");
await traiter({ action: "marquer", id: victoire.id, analysee: true, code: "secret" }, store, opts());
assert.equal((await store.get(`r/${victoire.id}`)).analysee, true);
assert.equal((await store.get(`r/${victoire.id}`)).lu, true);
await traiter({ action: "supprimer", id: victoire.id, code: "secret" }, store, opts());
assert.equal(await store.get(`p/${victoire.id}`), null);

// Une notification qui échoue n'empêche pas d'enregistrer
r = await traiter({ action: "signaler", type: "bug", texte: "Discord en panne" }, store, opts({ ip: "7.7.7.7", prevenir: async () => { throw new Error("Discord 500"); } }));
assert.equal(r.statut, 200);

// JSON invalide
assert.equal((await repondre("{", store, opts())).statut, 400);

console.log("verif-retours : OK");
