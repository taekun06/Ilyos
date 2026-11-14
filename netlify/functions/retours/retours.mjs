/*
 * Fonction Netlify /api/retours : signalements, avis, erreurs du jeu et
 * victoires contre le CPU Expert (logique dans logique.mjs).
 *
 * Réglages Netlify (Site configuration › Environment variables) :
 *   RETOURS_CODE     code secret de la page privée /retours.html
 *   RETOURS_DISCORD  adresse d'un « webhook » Discord (facultatif) : une
 *                    notification par retour, partie jointe en fichier.
 * L'adresse Discord reste ici, côté serveur : elle n'apparaît jamais dans le
 * jeu, donc personne ne peut s'en servir pour écrire dans ton salon.
 */
import { getStore } from "@netlify/blobs";
import { repondre } from "./logique.mjs";

const ORIGINES = new Set([
  "https://taekun.fr",
  "https://www.taekun.fr",
  "https://taekun06.github.io"
]);

function entetesCors(request) {
  const origine = request.headers.get("origin");
  if (!origine || !ORIGINES.has(origine)) return {};
  return {
    "Access-Control-Allow-Origin": origine,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

const coupe = (t, n) => (t && t.length > n ? t.slice(0, n - 1) + "…" : t || "");

async function prevenirDiscord(adresse, m) {
  const lignes = [`**${m.titre}**`, coupe(m.texte, 1500)];
  if (m.contact) lignes.push(`Contact : ${coupe(m.contact, 120)}`);
  if (m.details) lignes.push(`-# ${coupe(m.details, 300)}`);
  if (m.erreurs && m.erreurs.length) lignes.push("```\n" + coupe(m.erreurs.join("\n"), 1200).replace(/```/g, "ʼʼʼ") + "\n```");
  const payload = { content: coupe(lignes.join("\n"), 1990), allowed_mentions: { parse: [] } };
  let corps;
  if (m.fichier) {
    corps = new FormData();
    corps.append("payload_json", JSON.stringify(payload));
    corps.append("files[0]", new Blob([m.fichier.contenu], { type: "application/json" }), m.fichier.nom);
  } else {
    corps = JSON.stringify(payload);
  }
  const r = await fetch(adresse, {
    method: "POST",
    headers: m.fichier ? undefined : { "Content-Type": "application/json" },
    body: corps
  });
  if (!r.ok) throw new Error(`Discord ${r.status}`);
}

export default async (request, context) => {
  const cors = entetesCors(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return new Response("", { status: 405, headers: cors });
  const blobs = getStore({ name: "retours", consistency: "strong" });
  const store = {
    get: cle => blobs.get(cle, { type: "json" }),
    set: (cle, valeur) => blobs.setJSON(cle, valeur),
    delete: cle => blobs.delete(cle),
    list: async prefixe => (await blobs.list({ prefix: prefixe })).blobs.map(b => b.key)
  };
  const discord = Netlify.env.get("RETOURS_DISCORD");
  const { statut, corps } = await repondre(await request.text(), store, {
    ip: context && context.ip || request.headers.get("x-nf-client-connection-ip") || "",
    code: Netlify.env.get("RETOURS_CODE") || "",
    prevenir: discord ? m => prevenirDiscord(discord, m) : null
  });
  return Response.json(corps, { status: statut, headers: { ...cors, "Cache-Control": "no-store" } });
};

export const config = { path: "/api/retours" };
