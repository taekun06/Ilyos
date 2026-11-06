/*
 * Fonction Netlify /api/compte : création, connexion et sauvegarde du profil.
 * Les comptes sont rangés dans Netlify Blobs (magasin « comptes »).
 */
import { getStore } from "@netlify/blobs";
import { repondre } from "./logique.mjs";

/* Le site principal (taekun.fr, GitHub Pages) appelle cette fonction depuis
   un autre domaine : on l'autorise explicitement. */
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

export default async request => {
  const cors = entetesCors(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return new Response("", { status: 405, headers: cors });
  const blobs = getStore({ name: "comptes", consistency: "strong" });
  const store = {
    get: cle => blobs.get(cle, { type: "json" }),
    set: (cle, valeur) => blobs.setJSON(cle, valeur)
  };
  const { statut, corps } = await repondre(await request.text(), store);
  return Response.json(corps, { status: statut, headers: { ...cors, "Cache-Control": "no-store" } });
};

export const config = { path: "/api/compte" };
