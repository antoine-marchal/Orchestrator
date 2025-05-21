const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const executeNodeRouter = require("./api/execute-node");

console.log("========== server.js starting ==========");

const app = express();
app.use(cors());
app.use(express.json({ limit: '1000mb' }));
app.use("/api", executeNodeRouter);

const PORT = 3939;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
