# Orchestrator

Orchestrator is a cross-platform desktop application built with Electron, React, and Node.js. It enables you to visually orchestrate, edit, and execute custom scripts or nodes (JavaScript, Batch, Groovy, PowerShell, Playwright) through a modern, interactive graphical interface.

## 🚀 Main Features
- 🖥️ Intuitive drag-and-drop GUI for building and managing node-based flows
- ⚡ Execute scripts in JavaScript (frontend & backend), Groovy, Batch, PowerShell, and Playwright
- 📝 Visualize, edit, and connect nodes with custom code or constants
- 🔄 Save, load, and version flows as `.or` or `.json` files
- 🧩 Add comments and documentation nodes to your flows
- 🖊️ Built-in code editor with syntax highlighting for multiple languages
- 🪝 Advanced console for real-time logs, outputs, and error tracking per node
- 🗂️ File-based backend orchestration with inbox/outbox job processing
- 🖱️ Keyboard shortcuts for quick save/load (Ctrl/Cmd+S, Ctrl/Cmd+O)
- 🖼️ Resizable, customizable nodes and flow layout auto-arrangement
- 🛠️ Full Electron integration for native desktop experience

## 📦 Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
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
  - `components/`: UI components (FlowEditor, CodeEditorModal, Console, Toolbar, Node types)
  - `store/`: State management for flows and nodes
  - `types/`: TypeScript types for nodes and edges
- `backend/`: Node.js backend for script execution and orchestration
  - `poller.cjs`: File-based job processor for executing scripts
  - `groovyExec.jar`: Groovy script runner
  - `lib/`: Additional backend libraries (e.g., jsoup)
- `preload/`: Electron preload scripts for secure IPC
- `build/`: App icons and build resources
- `captures/`: Screenshots and media

## 📜 NPM Scripts
- `npm run dev` — Launches the React frontend in development mode
- `npm run backend` — Starts the Node.js backend server
- `npm run start` — Runs both backend and frontend concurrently (development)
- `npm run electron` — Starts Electron with the main process
- `npm run build` — Builds the frontend for production
- `npm run dist` — Builds the frontend and packages the Electron app for distribution

## 🧩 Supported Node Types
- **JavaScript**: Run code in the frontend or backend context
- **Groovy**: Execute Groovy scripts via the backend
- **Batch**: Run Windows batch scripts
- **PowerShell**: Execute PowerShell scripts
- **Playwright**: Automate browser tasks using Playwright
- **Constant**: Provide static values as node input
- **Comment**: Add documentation/comments to your flow

## 🖊️ Code Editing
- Edit node code with syntax highlighting (Ace Editor)
- Supports JavaScript, Groovy, Batch, PowerShell
- Keyboard shortcuts: Save (Ctrl/Cmd+S), Close (Esc)

## 🪝 Console & Logging
- Real-time per-node logs, input/output, and error tracking
- Filter log types (input, output, log, error)
- Expand/collapse and fullscreen console view

## 🗂️ Backend Orchestration
- File-based inbox/outbox job processing for secure script execution
- Supports running scripts in isolated processes
- Groovy, Batch, PowerShell, Playwright, and Node.js backend execution

## 🖱️ Keyboard Shortcuts
- **Ctrl/Cmd+S**: Save flow
- **Ctrl/Cmd+O**: Open flow
- **Esc**: Close modals/editor

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
- [Playwright](https://playwright.dev/)
- [Ace Editor](https://ace.c9.io/)

---
© 2024 Orchestrator. All rights reserved.