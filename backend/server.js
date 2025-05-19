import express from "express";
import cors from "cors";

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("========== server.js starting ==========");
console.log("Current directory:", __dirname);
console.log("Node version:", process.version);

try {
  const apiDir = path.join(__dirname, "api");
  console.log("API dir contents:", fs.readdirSync(apiDir));
} catch (e) {
  console.error("Failed to read api dir:", e);
}

let executeNodeRouter;
try {
  // Robust dynamic ESM import
  const executeNodePath = pathToFileURL(path.join(__dirname, "api/execute-node.js")).href;
  executeNodeRouter = (await import(executeNodePath)).default;
  console.log("SUCCESS: executeNodeRouter imported");
} catch (err) {
  console.error("FAILED TO IMPORT executeNodeRouter:", err);
  process.exit(1); // Stop server if critical
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1000mb' })); // default: 100kb!
app.use("/api", executeNodeRouter);

const PORT = 3939;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  console.log("========================================");
});
