# Comparaison temporaire KayKit Knight / Meshy Knight Sentinel

1. Lancer `npm start`, puis ouvrir http://localhost:8123/?knightAB=1.
2. Démarrer une partie locale ou solo avec le Knight du joueur 1 sur le plateau.
3. Cadrer sa case avec la caméra habituelle, puis cliquer **Comparer Knight A/B**.
4. Utiliser **A** et **B**. **Fermer** ou Échap retourne au jeu.

**Centrer sur le Knight** recentre la vue sans changer son angle ; le zoom commun
permet ensuite d'examiner le personnage de près.

L'écran de comparaison copie le plateau, la caméra, la brume, les lumières et les
réglages du renderer au moment de l'ouverture. Le décor est figé. Les autres
gardiens sont masqués dans cette copie pour isoler le sujet. Le Knight reprend
son asset actuel et sa finition métallique via les fonctions du jeu.
Aucun état de partie, asset existant ou règle n'est modifié. La partie derrière
la fenêtre peut continuer (par exemple un tour CPU) : privilégier un tour humain.

Les modèles sont en pose de repos, sans animation. Ils partagent une même case,
un même pivot aux pieds, une même rotation de groupe et une même hauteur mesurée
sur leur boîte englobante. L'échelle Meshy est uniforme : largeur et silhouette
restent différentes. Le zoom est commun et le format de la caméra est conservé
avec des bandes si nécessaire. Le post-traitement bloom et l'éditeur visuel ne
sont pas appliqués à cette copie ; les deux modèles reçoivent le même rendu.

## Installer le modèle Meshy

Depuis la fiche Knight Sentinel indiquée dans
`assets/prototypes/knight-sentinel/README.md`, télécharger/exporter le modèle en
**GLB avec textures intégrées**, puis le nommer exactement :

`assets/prototypes/knight-sentinel/Knight_Sentinel.glb`

Pas besoin de reconstruire le jeu après ce dépôt : fermer et rouvrir le comparateur.
Sans GLB, A fonctionne et B reste désactivé avec une indication du chemin.
Les erreurs HTTP, GLB invalide et formats compressés non pris en charge sont
affichés. Préférer un export sans compression Draco/KTX2.

Le sens « avant » ne peut pas être déduit automatiquement d'un GLB arbitraire.
Vérifier l'orientation du Sentinel avec le réglage 0/90/180/270°. L'axe vertical
attendu est Y, conformément à glTF. Un export couché doit être corrigé à la source.
La comparaison finale de l'orientation et du rendu Meshy nécessite le vrai fichier.

Le panneau mesure les octets du GLB en Mio et additionne approximativement les
triangles des primitives (index/3 ou sommets/3) ; textures externes et coût GPU ne
sont pas inclus. Aucun poids ou nombre de triangles Meshy n'est inventé.

Mesure du Knight actuel : **3 659 532 octets (3,49 Mio), environ 6 952 triangles**.
Le test `tests/knight-ab.spec.js` utilise le Knight comme réponse réseau témoin
pour le chemin Meshy : il vérifie l'intégration, pas l'apparence du vrai Sentinel.

## Retrait

Ouvrir le jeu sans `?knightAB=1` désactive entièrement l'interface et les requêtes
du prototype. Pour retirer le code, supprimer `js/game/knight-ab.js` et son entrée
dans `scripts/build-game.js`, puis exécuter `npm run build`.
