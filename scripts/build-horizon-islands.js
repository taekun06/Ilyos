"use strict";

// Découpe les planches d'îles flottantes de `assets/sky/source/` en sprites
// individuels, puis les empaquette dans un atlas + un manifeste JSON.
//
// Pourquoi ce détour plutôt qu'une bande panoramique : sur la bande d'horizon
// mesurée avant ce chantier, 7,1 % seulement des pixels portaient de l'image ;
// les 93 % restants étaient du vide transparent payé au prix fort. Pour tenir
// les ~34 px/degré qu'exige un écran 1920 avec le FOV 33° du jeu, une bande
// 360° aurait demandé ~12 300 px de large, soit une quarantaine de mégaoctets
// de mémoire vidéo essentiellement vides. Une île découpée est affichée à sa
// résolution native : le budget texture suit les îles, pas le ciel.
//
// Le découpage repose uniquement sur le canal alpha. Les planches sont donc
// générées avec des îles nettement séparées (voir README du dossier source) :
// deux îles qui se touchent deviennent un seul sprite.
//
//   node scripts/build-horizon-islands.js            # vérifie sans écrire
//   node scripts/build-horizon-islands.js --write    # produit atlas + manifeste

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const RACINE = path.resolve(__dirname, "..");
const DOSSIER_SOURCE = path.join(RACINE, "assets", "sky", "source");
const ATLAS_SORTIE = path.join(RACINE, "assets", "sky", "horizon-islands-atlas.png");
const MANIFESTE_SORTIE = path.join(RACINE, "assets", "sky", "horizon-islands.json");

const REGLAGES = {
  // Un pixel compte comme matière au-delà de ce seuil. Bas volontairement : les
  // cascades et les halos des planches se terminent en alpha très faible, et
  // les couper net produirait un bord dur là où l'image veut se dissoudre.
  seuilAlpha: 12,
  // Rayon de dilatation appliqué AVANT l'étiquetage. Les îles générées traînent
  // des éclats rocheux détachés qui appartiennent visuellement à l'île mère ;
  // sans dilatation chacun deviendrait un sprite orphelin, et le placement les
  // disperserait aux quatre coins du monde.
  // 7 px : mesuré sur les sept planches livrées, c'est la valeur qui recolle les
  // éclats détachés sans jamais fusionner deux îles voisines. En dessous, les
  // rochers satellites se détachent ; au-dessus, les grandes cités se soudent.
  rayonDilatation: 7,
  // Sous ce nombre de pixels de matière, c'est une poussière de compression.
  airemin: 350,
  // Marge transparente conservée autour de chaque sprite : évite que le
  // filtrage bilinéaire de l'atlas aille mordre sur le voisin.
  margeSprite: 2,
  // Largeur maximale d'un sprite après réduction. La plus grande île couvre 4,6°
  // à l'écran, soit ~160 px en 1920 avec le FOV 33° du jeu ; 340 px laisse plus du
  // double de marge pour le zoom et les écrans 4K. Les planches arrivent à 900 px :
  // les garder telles quelles pesait 13 Mo d'atlas pour une netteté que personne ne
  // peut voir. La réduction est appliquée au même facteur pour toutes les planches,
  // sinon la hiérarchie d'échelle entre grandes cités et fragments disparaîtrait.
  largeurSpriteMax: 340,
  largeurAtlas: 4096
};

// ---------------------------------------------------------------- PNG (lecture)

function lirePNG(fichier) {
  const octets = fs.readFileSync(fichier);
  if (octets.readUInt32BE(0) !== 0x89504e47) throw new Error(`${fichier} n'est pas un PNG`);

  let position = 8;
  let largeur = 0, hauteur = 0, profondeur = 0, typeCouleur = 0, entrelacement = 0;
  const morceaux = [];

  while (position < octets.length) {
    const taille = octets.readUInt32BE(position);
    const type = octets.toString("ascii", position + 4, position + 8);
    if (type === "IHDR") {
      largeur = octets.readUInt32BE(position + 8);
      hauteur = octets.readUInt32BE(position + 12);
      profondeur = octets[position + 16];
      typeCouleur = octets[position + 17];
      entrelacement = octets[position + 20];
    } else if (type === "IDAT") {
      morceaux.push(octets.slice(position + 8, position + 8 + taille));
    } else if (type === "IEND") break;
    position += 12 + taille;
  }

  if (profondeur !== 8) throw new Error(`${fichier} : profondeur ${profondeur} bits non gérée (8 attendus)`);
  if (entrelacement !== 0) throw new Error(`${fichier} : PNG entrelacé non géré`);
  const canaux = { 0: 1, 2: 3, 4: 2, 6: 4 }[typeCouleur];
  if (!canaux) throw new Error(`${fichier} : type de couleur ${typeCouleur} non géré`);

  const brut = zlib.inflateSync(Buffer.concat(morceaux));
  const pas = largeur * canaux;
  const plan = Buffer.alloc(hauteur * pas);

  let lecture = 0;
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[lecture++];
    const ligne = brut.slice(lecture, lecture + pas);
    lecture += pas;
    for (let x = 0; x < pas; x++) {
      const gauche = x >= canaux ? plan[y * pas + x - canaux] : 0;
      const haut = y > 0 ? plan[(y - 1) * pas + x] : 0;
      const diagonale = (x >= canaux && y > 0) ? plan[(y - 1) * pas + x - canaux] : 0;
      let valeur = ligne[x];
      switch (filtre) {
        case 0: break;
        case 1: valeur += gauche; break;
        case 2: valeur += haut; break;
        case 3: valeur += (gauche + haut) >> 1; break;
        case 4: {
          const p = gauche + haut - diagonale;
          const dg = Math.abs(p - gauche), dh = Math.abs(p - haut), dd = Math.abs(p - diagonale);
          valeur += (dg <= dh && dg <= dd) ? gauche : (dh <= dd ? haut : diagonale);
          break;
        }
        default: throw new Error(`${fichier} : filtre PNG ${filtre} inconnu`);
      }
      plan[y * pas + x] = valeur & 255;
    }
  }

  // Tout est ramené en RGBA pour la suite.
  const rgba = Buffer.alloc(largeur * hauteur * 4);
  for (let i = 0, n = largeur * hauteur; i < n; i++) {
    const s = i * canaux, d = i * 4;
    if (canaux === 4) { rgba[d] = plan[s]; rgba[d + 1] = plan[s + 1]; rgba[d + 2] = plan[s + 2]; rgba[d + 3] = plan[s + 3]; }
    else if (canaux === 3) { rgba[d] = plan[s]; rgba[d + 1] = plan[s + 1]; rgba[d + 2] = plan[s + 2]; rgba[d + 3] = 255; }
    else if (canaux === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = plan[s]; rgba[d + 3] = plan[s + 1]; }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = plan[s]; rgba[d + 3] = 255; }
  }

  return { largeur, hauteur, rgba, avaitAlpha: canaux === 4 || canaux === 2 };
}

// ---------------------------------------------------------------- PNG (écriture)

function ecrirePNG(fichier, largeur, hauteur, rgba) {
  const pas = largeur * 4;
  const brut = Buffer.alloc(hauteur * (pas + 1));

  // Filtrage adaptatif : on essaie les cinq filtres PNG sur chaque ligne et on
  // retient celui dont la somme des écarts est la plus faible. Le filtre « None »
  // seul laissait l'atlas à 4,3 Mo ; les îles sont des dégradés continus, exactement
  // ce que Paeth et Up compressent bien.
  const candidat = Buffer.alloc(pas);
  const retenu = Buffer.alloc(pas);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  };

  for (let y = 0; y < hauteur; y++) {
    let meilleurFiltre = 0, meilleurCout = Infinity;
    for (let filtre = 0; filtre <= 4; filtre++) {
      let cout = 0;
      for (let x = 0; x < pas; x++) {
        const brute = rgba[y * pas + x];
        const gauche = x >= 4 ? rgba[y * pas + x - 4] : 0;
        const haut = y > 0 ? rgba[(y - 1) * pas + x] : 0;
        const diagonale = (x >= 4 && y > 0) ? rgba[(y - 1) * pas + x - 4] : 0;
        let valeur;
        switch (filtre) {
          case 0: valeur = brute; break;
          case 1: valeur = brute - gauche; break;
          case 2: valeur = brute - haut; break;
          case 3: valeur = brute - ((gauche + haut) >> 1); break;
          default: valeur = brute - paeth(gauche, haut, diagonale); break;
        }
        valeur &= 255;
        candidat[x] = valeur;
        cout += valeur < 128 ? valeur : 256 - valeur;
      }
      if (cout < meilleurCout) {
        meilleurCout = cout;
        meilleurFiltre = filtre;
        candidat.copy(retenu);
      }
    }
    brut[y * (pas + 1)] = meilleurFiltre;
    retenu.copy(brut, y * (pas + 1) + 1);
  }

  const morceau = (type, donnees) => {
    const bloc = Buffer.alloc(donnees.length + 12);
    bloc.writeUInt32BE(donnees.length, 0);
    bloc.write(type, 4, "ascii");
    donnees.copy(bloc, 8);
    bloc.writeUInt32BE(crc32(bloc.slice(4, 8 + donnees.length)) >>> 0, 8 + donnees.length);
    return bloc;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  fs.writeFileSync(fichier, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau("IHDR", ihdr),
    morceau("IDAT", zlib.deflateSync(brut, { level: 9 })),
    morceau("IEND", Buffer.alloc(0))
  ]));
}

let TABLE_CRC = null;
function crc32(donnees) {
  if (!TABLE_CRC) {
    TABLE_CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE_CRC[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < donnees.length; i++) c = TABLE_CRC[(c ^ donnees[i]) & 255] ^ (c >>> 8);
  return c ^ -1;
}

// ---------------------------------------------------------------- segmentation

// Détourage de secours : une planche livrée sans canal alpha arrive sur fond
// blanc. On ne binarise pas — les cascades et les halos doivent garder leur
// dégradé — donc l'alpha reconstruit suit la distance au blanc.
function reconstruireAlphaDepuisBlanc(image) {
  const { rgba } = image;
  for (let i = 0, n = image.largeur * image.hauteur; i < n; i++) {
    const d = i * 4;
    const clarte = Math.min(rgba[d], rgba[d + 1], rgba[d + 2]);
    const alpha = Math.max(0, Math.min(255, Math.round((246 - clarte) * (255 / 60))));
    rgba[d + 3] = alpha;
  }
}

// Dilatation par transformée de distance en deux passes (chanfrein 3×4). Bien
// plus rapide qu'un noyau circulaire, et l'approximation est sans conséquence
// ici : on ne cherche qu'à raccrocher les éclats détachés à leur île mère.
function masqueDilate(image, seuil, rayon) {
  const { largeur: L, hauteur: H, rgba } = image;
  const LOIN = 1 << 28;
  const distance = new Int32Array(L * H);
  for (let i = 0, n = L * H; i < n; i++) distance[i] = rgba[i * 4 + 3] >= seuil ? 0 : LOIN;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      let d = distance[i];
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, distance[i - 1] + 3);
      if (y > 0) {
        d = Math.min(d, distance[i - L] + 3);
        if (x > 0) d = Math.min(d, distance[i - L - 1] + 4);
        if (x < L - 1) d = Math.min(d, distance[i - L + 1] + 4);
      }
      distance[i] = d;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = L - 1; x >= 0; x--) {
      const i = y * L + x;
      let d = distance[i];
      if (d === 0) continue;
      if (x < L - 1) d = Math.min(d, distance[i + 1] + 3);
      if (y < H - 1) {
        d = Math.min(d, distance[i + L] + 3);
        if (x < L - 1) d = Math.min(d, distance[i + L + 1] + 4);
        if (x > 0) d = Math.min(d, distance[i + L - 1] + 4);
      }
      distance[i] = d;
    }
  }

  const seuilChanfrein = rayon * 3;
  const masque = new Uint8Array(L * H);
  for (let i = 0, n = L * H; i < n; i++) masque[i] = distance[i] <= seuilChanfrein ? 1 : 0;
  return masque;
}

function etiqueter(masque, L, H) {
  const etiquettes = new Int32Array(L * H).fill(-1);
  const pile = new Int32Array(L * H);
  const regions = [];

  for (let depart = 0, n = L * H; depart < n; depart++) {
    if (!masque[depart] || etiquettes[depart] !== -1) continue;
    const id = regions.length;
    let sommet = 0;
    pile[sommet++] = depart;
    etiquettes[depart] = id;
    let minX = L, maxX = 0, minY = H, maxY = 0, aire = 0;

    while (sommet > 0) {
      const i = pile[--sommet];
      const x = i % L, y = (i / L) | 0;
      aire++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= L) continue;
          const j = ny * L + nx;
          if (masque[j] && etiquettes[j] === -1) {
            etiquettes[j] = id;
            pile[sommet++] = j;
          }
        }
      }
    }
    regions.push({ id, minX, maxX, minY, maxY, aire });
  }
  return { etiquettes, regions };
}

// Propagation de couleur sur les bords (« edge bleed »). Les planches livrent des
// pixels totalement transparents qui conservent une couleur résiduelle : le
// générateur ne nettoie pas le RGB sous l'alpha nul. Invisible tel quel, mais le
// filtrage bilinéaire et les mipmaps mélangent RGB et alpha séparément, et cette
// couleur parasite ressort en liseré sombre autour de chaque île.
//
// On remplace donc le RGB des pixels transparents par celui de la matière la plus
// proche, sans jamais toucher à l'alpha. C'est le traitement standard d'un atlas.
function propagerCouleurBords(pixels, largeur, hauteur, passes) {
  const valide = new Uint8Array(largeur * hauteur);
  for (let i = 0; i < largeur * hauteur; i++) valide[i] = pixels[i * 4 + 3] > 0 ? 1 : 0;

  for (let passe = 0; passe < passes; passe++) {
    const ajoutes = [];
    for (let y = 0; y < hauteur; y++) {
      for (let x = 0; x < largeur; x++) {
        const i = y * largeur + x;
        if (valide[i]) continue;
        let r = 0, v = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= hauteur) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= largeur) continue;
            const j = ny * largeur + nx;
            if (!valide[j]) continue;
            r += pixels[j * 4]; v += pixels[j * 4 + 1]; b += pixels[j * 4 + 2]; n++;
          }
        }
        if (!n) continue;
        pixels[i * 4] = Math.round(r / n);
        pixels[i * 4 + 1] = Math.round(v / n);
        pixels[i * 4 + 2] = Math.round(b / n);
        ajoutes.push(i);
      }
    }
    if (!ajoutes.length) break;
    for (const i of ajoutes) valide[i] = 1;
  }
}

function decouperPlanche(fichier) {
  const nom = path.basename(fichier, path.extname(fichier));
  const image = lirePNG(fichier);
  if (!image.avaitAlpha) {
    console.log(`  ${nom} : pas de canal alpha, détourage du fond blanc`);
    reconstruireAlphaDepuisBlanc(image);
  }

  const { largeur: L, hauteur: H, rgba } = image;
  const masque = masqueDilate(image, REGLAGES.seuilAlpha, REGLAGES.rayonDilatation);
  const { etiquettes, regions } = etiqueter(masque, L, H);

  const sprites = [];
  for (const region of regions) {
    // L'aire dilatée surestime : on recompte la matière réelle, et on resserre
    // la boîte sur elle plutôt que sur le halo de dilatation.
    let aireReelle = 0, minX = L, maxX = -1, minY = H, maxY = -1;
    for (let y = region.minY; y <= region.maxY; y++) {
      for (let x = region.minX; x <= region.maxX; x++) {
        const i = y * L + x;
        if (etiquettes[i] !== region.id) continue;
        if (rgba[i * 4 + 3] < REGLAGES.seuilAlpha) continue;
        aireReelle++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (aireReelle < REGLAGES.airemin || maxX < minX) continue;

    const marge = REGLAGES.margeSprite;
    const largeurSprite = maxX - minX + 1 + marge * 2;
    const hauteurSprite = maxY - minY + 1 + marge * 2;
    const pixels = Buffer.alloc(largeurSprite * hauteurSprite * 4);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const i = y * L + x;
        // Un pixel appartenant à une autre région est écarté : c'est ce qui
        // empêche le bord d'une île voisine de s'inviter dans la découpe.
        if (etiquettes[i] !== region.id) continue;
        const d = ((y - minY + marge) * largeurSprite + (x - minX + marge)) * 4;
        pixels[d] = rgba[i * 4];
        pixels[d + 1] = rgba[i * 4 + 1];
        pixels[d + 2] = rgba[i * 4 + 2];
        pixels[d + 3] = rgba[i * 4 + 3];
      }
    }

    propagerCouleurBords(pixels, largeurSprite, hauteurSprite, 4);

    sprites.push({
      id: `${nom}-${String(sprites.length + 1).padStart(2, "0")}`,
      planche: nom,
      largeur: largeurSprite,
      hauteur: hauteurSprite,
      aire: aireReelle,
      pixels
    });
  }

  // Les grandes silhouettes d'abord : le placement s'en sert pour distinguer
  // les masses latérales des simples éclats.
  sprites.sort((a, b) => b.aire - a.aire);
  return sprites;
}

// Réduction par moyenne de blocs. L'alpha pondère le RGB : sans cela, les pixels
// transparents des bords tireraient la couleur vers le noir et chaque île
// gagnerait un contour sombre.
function reduire(sprite, facteur) {
  if (facteur >= 1) return sprite;
  const largeur = Math.max(1, Math.round(sprite.largeur * facteur));
  const hauteur = Math.max(1, Math.round(sprite.hauteur * facteur));
  const pixels = Buffer.alloc(largeur * hauteur * 4);
  const ratioX = sprite.largeur / largeur;
  const ratioY = sprite.hauteur / hauteur;

  for (let y = 0; y < hauteur; y++) {
    const y0 = Math.floor(y * ratioY), y1 = Math.min(sprite.hauteur, Math.ceil((y + 1) * ratioY));
    for (let x = 0; x < largeur; x++) {
      const x0 = Math.floor(x * ratioX), x1 = Math.min(sprite.largeur, Math.ceil((x + 1) * ratioX));
      let r = 0, v = 0, b = 0, a = 0, poids = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sprite.largeur + sx) * 4;
          const alpha = sprite.pixels[i + 3];
          r += sprite.pixels[i] * alpha;
          v += sprite.pixels[i + 1] * alpha;
          b += sprite.pixels[i + 2] * alpha;
          a += alpha;
          poids += alpha;
          n++;
        }
      }
      const d = (y * largeur + x) * 4;
      if (poids > 0) {
        pixels[d] = Math.round(r / poids);
        pixels[d + 1] = Math.round(v / poids);
        pixels[d + 2] = Math.round(b / poids);
      }
      pixels[d + 3] = n ? Math.round(a / n) : 0;
    }
  }

  sprite.largeur = largeur;
  sprite.hauteur = hauteur;
  sprite.pixels = pixels;
  sprite.aire = Math.round(sprite.aire * facteur * facteur);
  return sprite;
}

// ---------------------------------------------------------------- atlas

function empaqueter(sprites, largeurAtlas) {
  const ordonnes = sprites.slice().sort((a, b) => b.hauteur - a.hauteur);
  let x = 0, y = 0, hauteurEtagere = 0;

  for (const sprite of ordonnes) {
    if (sprite.largeur > largeurAtlas) {
      throw new Error(`${sprite.id} (${sprite.largeur} px) dépasse la largeur d'atlas ${largeurAtlas}`);
    }
    if (x + sprite.largeur > largeurAtlas) {
      x = 0;
      y += hauteurEtagere;
      hauteurEtagere = 0;
    }
    sprite.x = x;
    sprite.y = y;
    x += sprite.largeur;
    if (sprite.hauteur > hauteurEtagere) hauteurEtagere = sprite.hauteur;
  }

  const hauteurAtlas = y + hauteurEtagere;
  const rgba = Buffer.alloc(largeurAtlas * hauteurAtlas * 4);
  for (const sprite of ordonnes) {
    for (let ligne = 0; ligne < sprite.hauteur; ligne++) {
      sprite.pixels.copy(
        rgba,
        ((sprite.y + ligne) * largeurAtlas + sprite.x) * 4,
        ligne * sprite.largeur * 4,
        (ligne + 1) * sprite.largeur * 4
      );
    }
  }
  return { largeur: largeurAtlas, hauteur: hauteurAtlas, rgba };
}

// ---------------------------------------------------------------- entrée

function main() {
  const ecrire = process.argv.includes("--write");

  // Le rayon de dilatation est le seul réglage qu'une planche peut vouloir
  // ajuster : des îles très rapprochées fusionnent, des îles très espacées
  // laissent leurs éclats derrière. On le sort donc en ligne de commande.
  const surcharge = process.argv.find(a => a.startsWith("--dilatation="));
  if (surcharge) {
    const valeur = Number(surcharge.split("=")[1]);
    if (!Number.isFinite(valeur) || valeur < 0) {
      console.error(`--dilatation attend un nombre positif, reçu « ${surcharge.split("=")[1]} »`);
      process.exit(1);
    }
    REGLAGES.rayonDilatation = valeur;
    console.log(`Rayon de dilatation forcé à ${valeur} px`);
  }

  if (!fs.existsSync(DOSSIER_SOURCE)) {
    console.error(`Dossier introuvable : ${DOSSIER_SOURCE}`);
    process.exit(1);
  }
  const planches = fs.readdirSync(DOSSIER_SOURCE)
    .filter(f => /\.png$/i.test(f))
    .sort()
    .map(f => path.join(DOSSIER_SOURCE, f));

  if (!planches.length) {
    console.error(`Aucune planche PNG dans ${DOSSIER_SOURCE}`);
    process.exit(1);
  }

  console.log(`${planches.length} planche(s) à découper :`);
  let sprites = [];
  for (const planche of planches) {
    const trouves = decouperPlanche(planche);
    console.log(`  ${path.basename(planche)} → ${trouves.length} île(s)`);
    for (const sprite of trouves) {
      console.log(`      ${sprite.id.padEnd(18)} ${String(sprite.largeur).padStart(4)}×${String(sprite.hauteur).padStart(4)} px`);
    }
    sprites = sprites.concat(trouves);
  }

  if (!sprites.length) {
    console.error("Aucune île détectée : vérifie le seuil alpha et la séparation des îles.");
    process.exit(1);
  }

  // Facteur unique, calculé sur la plus grande île de tout le lot.
  const largeurMax = sprites.reduce((max, s) => Math.max(max, s.largeur), 1);
  const facteur = Math.min(1, REGLAGES.largeurSpriteMax / largeurMax);
  if (facteur < 1) {
    console.log(`
Réduction ×${facteur.toFixed(3)} (plus grande île : ${largeurMax} px → ${Math.round(largeurMax * facteur)} px)`);
    sprites.forEach(sprite => reduire(sprite, facteur));
  }

  const atlas = empaqueter(sprites, REGLAGES.largeurAtlas);
  const manifeste = {
    genere: "scripts/build-horizon-islands.js",
    atlas: { largeur: atlas.largeur, hauteur: atlas.hauteur },
    iles: sprites
      .slice()
      .sort((a, b) => b.aire - a.aire)
      .map(s => ({
        id: s.id,
        planche: s.planche,
        x: s.x, y: s.y,
        largeur: s.largeur, hauteur: s.hauteur,
        aire: s.aire
      }))
  };

  console.log(`\n${sprites.length} île(s), atlas ${atlas.largeur}×${atlas.hauteur}`);
  if (!ecrire) {
    console.log("Vérification seule — relance avec --write pour produire les fichiers.");
    return;
  }

  ecrirePNG(ATLAS_SORTIE, atlas.largeur, atlas.hauteur, atlas.rgba);
  fs.writeFileSync(MANIFESTE_SORTIE, JSON.stringify(manifeste, null, 2) + "\n");
  const poids = (fs.statSync(ATLAS_SORTIE).size / 1048576).toFixed(2);
  console.log(`Écrit ${path.relative(RACINE, ATLAS_SORTIE)} (${poids} Mo)`);
  console.log(`Écrit ${path.relative(RACINE, MANIFESTE_SORTIE)}`);
}

main();
