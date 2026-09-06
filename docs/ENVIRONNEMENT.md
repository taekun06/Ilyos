# Environnement ILYOS — 7 septembre 2026

Objectif choisi : améliorer vite le jeu web et ses graphismes, avec **0 € de
dépense supplémentaire**. Les recommandations ci-dessous sont des choix pour
ce dépôt, pas un classement universel des outils.

## Ce qui est prêt

- Node 24.18.0, Git, GitHub CLI, VS Code et Playwright 1.62.1 détectés.
- Chromium Playwright présent. Node 24 indiqué dans `.nvmrc` et les workflows.
- Extensions Claude Code, Codex et Copilot détectées ; Playwright et glTF Tools
  installées pendant cette préparation. Les connexions aux comptes restent
  personnelles et ne sont pas validées par la présence d'une extension.
- `AGENTS.md` décrit le projet ; `CLAUDE.md` l'importe et Copilot dispose aussi
  de `.github/copilot-instructions.md`. Cela limite les redécouvertes du dépôt.
  Ces formats sont documentés par [OpenAI](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
  [Anthropic](https://code.claude.com/docs/en/memory) et
  [GitHub](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions).
- F5 dans VS Code : démarrage du serveur et débogage Edge. Les points d'arrêt du
  cœur du jeu se placent dans le bundle servi : les fragments n'ont pas de source
  maps. Modifier toujours les fragments, même si l'on débogue le bundle.
- Les recherches VS Code excluent le bundle généré et les dépendances ; ils restent
  accessibles directement. Ce réglage n'est pas un filtre de contexte garanti pour
  tous les assistants : leurs instructions demandent aussi de cibler les sources.

## Répartir les abonnements existants

| Besoin | Choix de départ pour ILYOS |
|---|---|
| Retouche courte, texte, petite fonction | Copilot dans VS Code, modèle à faible consommation proposé par ton forfait |
| Fonctionnalité circonscrite, quelques fichiers | Claude Code avec Sonnet, si inclus dans ton abonnement |
| Bug difficile, règles, interaction de plusieurs systèmes | Codex ; modèle plus puissant seulement si la difficulté le justifie |
| Direction artistique, règles à discuter, brief visuel | ChatGPT ou Claude, puis un seul assistant chargé de l'intégration |
| Contrôle répétitif | Scripts et Playwright : aucune requête IA nécessaire pour leur exécution |

Dans Codex, essayer GPT-5.6 Luna pour les tâches simples, Terra pour les changements
courants et réserver Astra aux problèmes difficiles, **si ces modèles figurent
dans ton sélecteur**. C'est une stratégie de budget à valider sur tes propres
tâches. Le mode Fast consomme davantage ; garder la vitesse standard au quotidien.
Les limites varient avec le modèle, le contexte et le travail effectué ; les
images générées dans Codex utilisent aussi le budget. Ne pas confondre abonnement
et accès API facturé séparément. [Documentation de tarification OpenAI](https://learn.chatgpt.com/docs/pricing).

Pour Claude, Sonnet constitue un point de départ moins coûteux qu'Opus ; consulter
`/usage` et `/context` quand la consommation augmente. Repartir sur une conversation
ciblée pour un sujet indépendant. [Conseils Anthropic](https://code.claude.com/docs/en/costs).

Le type exact des abonnements Claude et Copilot n'a pas été vérifié. Contrôler les
modèles inclus et les dépassements dans chaque compte ; ne pas activer d'achat
de crédits ni de consommation supplémentaire pour ce projet.
[Offres Copilot](https://docs.github.com/en/copilot/get-started/plans).

## Boucle quotidienne

1. Choisir une amélioration visible et son critère de réussite.
2. Démarrer `npm run dev`, faire une capture de référence pour une retouche visuelle.
3. Donner à un assistant l'objectif, les fichiers pertinents et les contraintes.
4. Modifier les sources ; recharger la page, puis vérifier l'interaction réelle.
5. Exécuter `npm run check` et les tests concernés. Pour UI/caméra/tutoriel :
   `npm run test:smoke`. Pour une règle : choisir son banc dans `scripts/`.
6. Examiner le diff et enregistrer une petite étape cohérente dans Git.

Exemple de demande :

> Améliore la lisibilité du gardien sélectionné. Commence par AGENTS.md et le
> système existant dans kaykit3d.js. Conserve les règles et le cadrage. Réutilise
> les assets locaux. Termine par une vérification en jeu, le build et les tests
> concernés ; signale ce qui reste non vérifié.

Pour changer d'assistant : transmettre objectif, fichiers modifiés, résultat des
tests et prochaine étape. Éviter trois assistants modifiant simultanément le même
dossier ; pour deux travaux indépendants, utiliser des branches/checkouts distincts.

## Outils visuels et plugins

| Outil | Utilité concrète | État |
|---|---|---|
| [glTF Tools](https://marketplace.visualstudio.com/items?itemName=cesium.gltf-vscode) | Prévisualiser et inspecter un modèle ; commande `glTF: Preview 3D Model` | Installé |
| [Playwright](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright) | Lancer/debugger les tests et voir les traces | Installé |
| Outils développeur Edge/Chrome | Mesurer réseau, images/seconde et styles réellement appliqués | Intégrés au navigateur |
| [glTF Transform](https://gltf-transform.dev/) | Futur travail ciblé de réduction de poids des modèles | Repéré, pas installé ni exécuté |
| GitHub | Historique et contrôles automatiques existants ; pas besoin d'ajouter un gestionnaire de projet | Dépôt et intégration présents |

Garder les plugins Codex centrés sur GitHub et le navigateur pour ce travail.
La génération d'images est déjà disponible, mais ne pas en lancer en boucle pour
chercher une direction artistique. Choisir d'abord composition, palette et exemple.
Un outil 3D externe devient utile lorsqu'une modification de maillage ou d'animation
est décidée ; il n'est pas nécessaire pour réutiliser les modèles actuels.

## Prochains travaux prioritaires

1. Mesurer le chargement d'une vraie partie et lister les modèles/animations utilisés.
2. Optimiser une copie d'un personnage lourd, comparer taille, animations, matériaux
   et rendu ; généraliser uniquement si le gain est mesuré.
3. Harmoniser sélection, prévisualisations et retours d'action en réutilisant les
   systèmes visuels existants ; éviter une nouvelle couche de correctifs CSS.
4. Ajouter quelques sons cohérents de sélection, action et validation depuis la
   bibliothèque gratuite référencée dans `ASSETS.md`.

Les trois workflows existants restent la base. La partie IA complète est longue
et son historique documente des expirations : son statut ne doit pas être assimilé
à celui des contrôles courts. Les changements préparés localement doivent encore
être publiés sur GitHub pour que les nouveaux réglages y soient exécutés.
