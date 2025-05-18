# Orchestrator

Orchestrator est une application de bureau multiplateforme basée sur Electron, React et Node.js, permettant d'orchestrer et d'exécuter des scripts ou des nœuds personnalisés (JavaScript, Batch, Groovy) via une interface graphique moderne.

## Fonctionnalités principales
- Interface graphique intuitive pour la gestion de nœuds et de flux
- Exécution de scripts JavaScript, Batch et Groovy
- Visualisation et édition des nœuds
- Support du mode développement et production

## Prérequis
- [Node.js](https://nodejs.org/) (v16 ou supérieur recommandé)
- [npm](https://www.npmjs.com/) (généralement inclus avec Node.js)

## Installation
1. Clonez ce dépôt :
   ```bash
   git clone <url-du-repo>
   cd Orchestrator
   ```
2. Installez les dépendances :
   ```bash
   npm install
   ```

## Lancement en mode développement
1. Démarrez le backend (Node.js) :
   ```bash
   npm run backend
   ```
2. Démarrez le frontend (React) :
   ```bash
   npm run dev
   ```
3. Lancez l'application Electron :
   ```bash
   npm run electron
   ```

> **Astuce :** En mode développement, l'interface s'ouvre sur `http://localhost:5173`.

## Lancement en mode production
1. Construisez le frontend :
   ```bash
   npm run build
   ```
2. Lancez l'application packagée :
   ```bash
   npm run start
   ```

## Structure du projet
- `electron-main.js` : Point d'entrée principal Electron, gère la fenêtre et le backend
- `src/` : Code source React (frontend)
- `backend/` : Serveur Node.js et API d'exécution des nœuds
- `public/` : Fichiers statiques

## Packaging et distribution
Pour générer un exécutable pour Windows, Mac ou Linux :
```bash
npm run dist
```
(Configurez le script selon l'outil de packaging choisi, ex : Electron Forge, Electron Builder...)

## Contribution
Les contributions sont les bienvenues !
- Forkez le projet
- Créez une branche
- Proposez une Pull Request

## Liens utiles
- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Node.js](https://nodejs.org/)

---
© 2024 Orchestrator. Tous droits réservés.