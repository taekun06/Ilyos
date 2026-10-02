# État des lieux — ce qui échoue, ne marche pas, doit être amélioré

Relevé du 01/10/2026 sur `main` (11b8f4c : PR #129, #125, #128 fusionnées) et
la branche de la PR #130. Chaque ligne dit **comment elle a été constatée** ;
rien n'est noté de mémoire. À tenir à jour : cocher, dater, citer la PR.

Légende : 🔴 bloque / casse · 🟠 défaut visible · 🟡 amélioration · ✅ réglé

## 1. Tests et CI

| # | État | Constat | Preuve | Piste |
|---|---|---|---|---|
| 1.1 | ✅ | CI `smoke` (tutoriel Découverte) rouge sur la PR #130 : délai dépassé, à une étape différente à chaque passage. | Trace CI conservée : le test cliquait la couronne 12 ms après l'arrivée du porteur, pendant le verrou d'animation (`inputLocked`) — clic ignoré sur un runner lent. | Test corrigé : attendre la fin du verrou, et la poussée engagée avant de viser. **Vert en CI** (4092b8f). |
| 1.2 | ✅ | Workflow « Partie de bout en bout » **annulé à chaque push sur `main`** depuis au moins le 24/09 : il lançait `playwright test` sans fichier, donc toute la suite (~45 tests), qui ne tient pas en 25 min. | Jobs de `main` : « cancelled » à chaque fusion ; 8,7 min d'installation + 16 min de tests. | Corrigé ici : ne joue plus que `tests/partie-ia-contre-ia.spec.js`. Durée réelle de la partie à vérifier sur le prochain push. |
| 1.3 | 🟡 | Manette : « dans une énigme, une poussée se vise et s'exécute ». | Passe 3/3 sur `main` et sur la branche du 02/10 : instable, pas une régression. | Rendre l'attente robuste (attendre l'état, pas un délai). |
| 1.4 | ✅ | Manette : « Y n'ouvre un choix que si plusieurs couronnes sont jouables ». | Échap ouvrait le menu par-dessus le choix de couronne de la manette. | Échap n'ouvre plus le menu (02/10) et quitte d'abord un geste de manette en cours ; 3/3. |
| 1.5 | 🟠 | Manette : « l'annulation remonte jusqu'au début du tour » échoue (« un appui court ne doit pas défaire la pose »). | Échoue déjà à 67c7e84 : plus ancien que #125/#128. | Dater par bissection. |
| 1.6 | 🟡 | Manette : « le tiroir d'îles… RT tourne l'île » a échoué une fois sur la branche #130. | Passe sur `main`, à 67c7e84, et 2 fois sur 2 sur la branche #130 : **test instable**, pas une régression. | Rendre l'attente de rotation robuste (attendre l'état, pas un délai). |
| 1.7 | ✅ | Énigmes : le sous-titre du prologue (« Ton village s'est éteint. ») restait vide dans le test. | Le prologue suit la cinématique d'ouverture, plus longue que les 15 s d'attente du test. | Test : attente portée à 45 s. Voix de synthèse coupée (02/10), sous-titres seuls. |
| 1.8 | 🟡 | L'Éveil dépasse son délai de 5 min (étape « limite » ≈ 71 s). | Échoue aussi sur `main`. | Durée du test, pas du tutoriel : à confirmer, puis ajuster l'attente de l'étape lente (sans masquer un vrai blocage). |
| 1.9 | — | En local (bac à sable), « Découverte jusqu'à la validation » échoue sur deux ressources externes bloquées (certificat). | Environnement de développement, pas le jeu. | Rien à faire côté jeu. |

Également instable des deux côtés (02/10) : « sous Magie, le pivot se choisit à la manette » (2/4 sur la branche, 1/3 sur `main`).

## 2. Bugs de jeu

| # | État | Constat | Preuve | Piste |
|---|---|---|---|---|
| 2.1 | ✅ | Mode Personnalisé : un gardien ne pouvait **jamais** se poser sur son propre village (humain comme IA) — `villageAt` renvoie le joueur, comparé à un identifiant. | `scripts/verif-draft-village.js` : échoue avant, passe après. | Corrigé (`core.js`, `draftGuardianCellAllowed`). |
| 2.2 | ✅ | Gardien sélectionné puis clic sur la couronne voisine : rien (ou une poussée) au lieu du ramassage. | `tests/clic-couronne.spec.js`. | PR #130. |
| 2.3 | ✅ | Ouvrir le menu en partie ne mettait en pause ni le minuteur ni l'IA. | Limite déclarée de #128. | Menu = pause hors partie en ligne (02/10) ; `tests/menu-pause.spec.js`. |
| 2.4 | 🟡 | Jeu en portrait (#125) jamais essayé sur un vrai téléphone. | Déclaré dans #125. | Essai réel. |

## 3. 2 contre 2

| # | État | Constat | Piste |
|---|---|---|---|
| 3.1 | 🟡 | L'IA Expert ne raisonne que contre UN adversaire (celui qui joue juste après). | Étendre la menace aux deux adversaires, ou réserver l'Expert au duel. |
| 3.2 | 🟡 | Le bandeau ne montre que deux joueurs à la fois (le joueur courant de chaque équipe). | Mini-bandeau des 4 scores. |

## 4. IA Expert (partie du 30/09 et bancs)

| # | État | Constat | Preuve | Piste |
|---|---|---|---|---|
| 4.1 | 🔴 | **Riposte trop courte** : 3 décisions, faisceau 5, 90 ms. Les ripostes humaines réelles en demandent 6 (tour 6 : −1 617 prévu, −7 647 réel). | `analyser-defaite.js` sur la revue du 30/09. | La rallonger seule ne changeait pas le choix : il faut aussi que la recherche principale garde plus de candidats robustes (4.3). |
| 4.2 | 🟠 | La recherche s'arrête en 0,5–1,3 s sur 7 s disponibles : la largeur du faisceau limite, pas le temps. | `etatsExplores`/`dureeMs` des décisions du 30/09 ; faisceau 80 trouvait seul le bon coup au tour 10. | Faisceau adaptatif tant que le temps le permet. Mesurer en self-play avant d'adopter. |
| 4.3 | 🟠 | Tour 6 : le code actuel choisit un plan moins robuste (−1 826) que celui qu'il avait joué (−1 617). | `analyser-defaite.js`. | Le plan joué n'entre plus dans les finalistes : examiner `plannerFinalistesDiversifies`. |
| 4.4 | 🟠 | Couronnes laissées au sol près de l'adversaire (tours 6 et 8), et aucune couronne amenée vers ses propres villages de la partie. | Revue du 30/09. | Tâche « terme de course » : chaque case gagnée vers son village compte. |
| 4.5 | ✅ | Éjection du porteur adossé au vide élaguée ; poussées longues invisibles ; magie adverse jamais anticipée. | Bancs `verif-ejection-porteur`, analyse du 30/09. | PR #129 et #130. |

## 5. Décisions en attente

- PR #130 : fusionner malgré 1.1, ou après diagnostic.
- PR #86 (brouillon depuis le 06/09) : vocabulaire de six couleurs pour les prévisualisations — à juger en jouant sur son aperçu Netlify, puis fusionner ou fermer.

## Ordre proposé

1. **Débloquer la CI** : 1.1 (lire la trace), 1.3–1.4 (régressions récentes, départager #125/#128), 1.2 (vérifier la durée au prochain push).
2. **Bugs visibles** : 1.5, 1.7, 2.3.
3. **IA** : 4.3 puis 4.2 et 4.1 ensemble (mesurés en self-play et sur les défaites), puis 4.4.
4. **2 contre 2** : 3.1, 3.2.
5. **Confort et décisions** : 1.8, 2.4, PR #86.
