#!/usr/bin/env node
/*
 * Serveur statique de développement pour ILYOS.
 *
 * ILYOS ne peut pas être testé en ouvrant index.html directement : en
 * `file://`, les chargements GLTF/textures KayKit sont bloqués et le jeu
 * affiche l'avertissement de js/file-protocol-warning.js au lieu de tourner.
 *
 * Ce serveur envoie systématiquement `Cache-Control: no-store` : game.js pèse
 * plusieurs mégaoctets et le cache navigateur masquait les modifications en
 * cours pendant le développement (on rechargeait une version périmée sans s'en
 * apercevoir).
 *
 * Usage : node scripts/dev-server.js [port]
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8123;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".bin": "application/octet-stream"
};

/* Comptes (fonction Netlify /api/compte) : même logique qu'en ligne, mais les
   comptes vivent en mémoire et disparaissent à l'arrêt du serveur. */
const comptesMemoire = new Map();
const storeMemoire = {
  get: async cle => (comptesMemoire.has(cle) ? JSON.parse(comptesMemoire.get(cle)) : null),
  set: async (cle, valeur) => { comptesMemoire.set(cle, JSON.stringify(valeur)); }
};

function servirCompte(req, res) {
  if (req.method !== "POST") { res.writeHead(405).end(); return; }
  let texte = "";
  req.setEncoding("utf8");
  req.on("data", morceau => { texte += morceau; if (texte.length > 200000) req.destroy(); });
  req.on("end", async () => {
    try {
      const { repondre } = await import("../netlify/functions/compte/logique.mjs");
      const { statut, corps } = await repondre(texte, storeMemoire);
      res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(corps));
    } catch (error) {
      res.writeHead(500).end(String(error && error.message));
    }
  });
}

/* Retours des joueurs (fonction Netlify /api/retours) : en mémoire aussi.
   Code de la page privée en local : ILYOS_RETOURS_CODE, sinon « dev ». Les
   notifications sont écrites dans la console au lieu de Discord. */
const retoursMemoire = new Map();
const storeRetours = {
  get: async cle => (retoursMemoire.has(cle) ? JSON.parse(retoursMemoire.get(cle)) : null),
  set: async (cle, valeur) => { retoursMemoire.set(cle, JSON.stringify(valeur)); },
  delete: async cle => { retoursMemoire.delete(cle); },
  list: async prefixe => [...retoursMemoire.keys()].filter(cle => cle.startsWith(prefixe))
};

function servirRetours(req, res) {
  if (req.method !== "POST") { res.writeHead(405).end(); return; }
  let texte = "";
  req.setEncoding("utf8");
  req.on("data", morceau => { texte += morceau; if (texte.length > 4 * 1024 * 1024) req.destroy(); });
  req.on("end", async () => {
    try {
      const { repondre } = await import("../netlify/functions/retours/logique.mjs");
      const { statut, corps } = await repondre(texte, storeRetours, {
        ip: req.socket.remoteAddress || "local",
        code: process.env.ILYOS_RETOURS_CODE || "dev",
        prevenir: async m => console.log(`[retours] ${m.titre} — ${String(m.texte).slice(0, 120)}${m.fichier ? " (+ " + m.fichier.nom + ")" : ""}`)
      });
      res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(corps));
    } catch (error) {
      res.writeHead(500).end(String(error && error.message));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/api/compte") { servirCompte(req, res); return; }
  if (req.url.split("?")[0] === "/api/retours") { servirRetours(req, res); return; }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  } catch (_) {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (pathname === "/") pathname = "/index.html";

  const target = path.join(ROOT, pathname);
  // Empêche toute sortie de l'arborescence du projet via ".." dans l'URL.
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(target, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 " + pathname);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`ILYOS dev server : http://localhost:${PORT}`);
});
