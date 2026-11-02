/*
 * Fonction Netlify /api/compte : création, connexion et sauvegarde du profil.
 * Les comptes sont rangés dans Netlify Blobs (magasin « comptes »).
 */
import { getStore } from "@netlify/blobs";
import { repondre } from "./logique.mjs";

export default async request => {
  if (request.method !== "POST") return new Response("", { status: 405 });
  const blobs = getStore({ name: "comptes", consistency: "strong" });
  const store = {
    get: cle => blobs.get(cle, { type: "json" }),
    set: (cle, valeur) => blobs.setJSON(cle, valeur)
  };
  const { statut, corps } = await repondre(await request.text(), store);
  return Response.json(corps, { status: statut, headers: { "Cache-Control": "no-store" } });
};

export const config = { path: "/api/compte" };
