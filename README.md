# Orchestrator

Orchestrator is a cross-platform desktop application based on Electron, React, and Node.js, allowing you to orchestrate and execute custom scripts or nodes (JavaScript, Batch, Groovy) via a modern graphical interface.

## 🚀 Main Features
- 🖥️ Intuitive GUI for managing nodes and flows
- ⚡ Execute JavaScript, Batch, and Groovy scripts
- 📝 Visualize and edit nodes
- 🔄 Development and production modes supported

## 📦 Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) (usually included with Node.js)

## 🛠️ Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/antoine-marchal/Orchestrator.git
   cd Orchestrator
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## 👨‍💻 Development Usage
1. Start the backend (Node.js):
   ```bash
   npm run backend
   ```
2. Start the frontend (React):
   ```bash
   npm run dev
   ```
3. Launch the Electron app:
   ```bash
   npm run electron
   ```

> **Tip:** In development mode, the interface opens at `http://localhost:5173`.

Or use all-in-one (backend + frontend) with:
```bash
npm run start
```

## 🏗️ Production Usage
1. Build the frontend:
   ```bash
   npm run build
   ```
2. Launch the packaged application:
   ```bash
   npm run dist
   ```

## 📂 Project Structure
- `electron-main.js`: Main Electron entry point, manages the window and backend
- `src/`: React source code (frontend)
- `backend/`: Node.js server and node execution API
- `public/`: Static files

## 📜 NPM Scripts
- `npm run dev` — Launches the React frontend in development mode
- `npm run backend` — Starts the Node.js backend server
- `npm run start` — Runs both backend and frontend concurrently (development)
- `npm run electron` — Starts Electron with the main process
- `npm run build` — Builds the frontend for production
- `npm run dist` — Builds the frontend and packages the Electron app for distribution

## 📦 Packaging & Distribution
To generate an executable for Windows, Mac, or Linux:
```bash
npm run dist
```
(Configure the script according to your packaging tool, e.g., Electron Builder)

## 🤝 Contributing
Contributions are welcome!
- Fork the project
- Create a branch
- Open a Pull Request

## 🔗 Useful Links
- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Node.js](https://nodejs.org/)

---
© 2024 Orchestrator. All rights reserved.