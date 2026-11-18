/* Récupère les parties envoyées par les joueurs (/api/retours) pour les
   analyser avec scripts/analyser-defaite.js et améliorer le CPU Expert.

     ILYOS_RETOURS_CODE=… node scripts/recuperer-victoires.mjs [dossier] [options]

   Par défaut : les victoires contre l'Expert pas encore analysées, rangées
   dans ./retours-victoires/ (ignoré par git), une par fichier
   ilyos-defaite-<id>.json, plus un index.json (date, score, joueur, version).
   Options :
     --toutes      aussi celles déjà marquées analysées
     --marquer     marque « analysée » sur le serveur ce qui a été téléchargé
     --bugs        aussi les parties jointes aux signalements de bug
     --url=<adr>   adresse de la fonction (défaut : production puis préversion)
   Le code est celui de la variable Netlify RETOURS_CODE. */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = nom => args.includes(`--${nom}`);
const url = (args.find(a => a.startsWith("--url=")) || "").slice(6);
const dossier = path.resolve(args.find(a => !a.startsWith("--")) || "retours-victoires");
const code = process.env.ILYOS_RETOURS_CODE;
if (!code) { console.error("Il manque ILYOS_RETOURS_CODE (le code de la page privée)."); process.exit(1); }

const URLS = url ? [url] : [
  "https://batbat.netlify.app/api/retours",
  "https://deploy-preview-214--batbat.netlify.app/api/retours"
];

async function appeler(corps) {
  for (const adresse of URLS) {
    try {
      const r = await fetch(adresse, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ ...corps, code })
      });
      if (r.status === 404 && corps.action === "lister") continue;
      const donnees = await r.json().catch(() => null);
      if (donnees) return donnees;
    } catch (_) { /* adresse suivante */ }
  }
  return { ok: false, erreur: "indisponible" };
}

const liste = await appeler({ action: "lister" });
if (!liste.ok) { console.error(`Lecture impossible : ${liste.erreur}`); process.exit(1); }
const voulus = liste.retours.filter(r => r.partie
  && (r.type === "victoire" || (option("bugs") && r.type === "bug"))
  && (option("toutes") || !r.analysee));
fs.mkdirSync(dossier, { recursive: true });
const indexFichier = path.join(dossier, "index.json");
const index = fs.existsSync(indexFichier) ? JSON.parse(fs.readFileSync(indexFichier, "utf8")) : {};

let nouveaux = 0;
for (const r of voulus) {
  const nom = `ilyos-${r.type === "victoire" ? "defaite" : "bug"}-${r.id}.json`;
  const fichier = path.join(dossier, nom);
  if (!fs.existsSync(fichier)) {
    const p = await appeler({ action: "partie", id: r.id });
    if (!p.ok) { console.warn(`  ${r.id} : partie absente (${p.erreur})`); continue; }
    fs.writeFileSync(fichier, JSON.stringify(p.partie));
    nouveaux++;
  }
  index[r.id] = { fichier: nom, type: r.type, recu: new Date(r.recu).toISOString(), resume: r.texte,
    version: (r.contexte || {}).version || "", pseudo: (r.contexte || {}).pseudo || "" };
  if (option("marquer") && !r.analysee) await appeler({ action: "marquer", id: r.id, analysee: true });
}
fs.writeFileSync(indexFichier, JSON.stringify(index, null, 2));
const victoires = liste.retours.filter(r => r.type === "victoire");
console.log(`${victoires.length} victoire(s) contre l'Expert sur le serveur, dont ${victoires.filter(r => !r.analysee).length} pas encore analysée(s).`);
console.log(`${voulus.length} retenue(s), ${nouveaux} téléchargée(s) dans ${dossier}.`);
console.log("Ensuite : npm start, puis node scripts/analyser-defaite.js <fichier> pour chacune.");
