import express from "express";
import cors from "cors";
import executeNodeRouter from "./api/execute-node.js";

const app = express();
app.use(cors()); 
app.use(express.json());
app.use("/api", executeNodeRouter);

const PORT = 3939;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});