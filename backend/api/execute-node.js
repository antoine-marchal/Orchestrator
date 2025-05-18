import { Router } from "express";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const router = Router();

router.post("/execute-node", async (req, res) => {
  const { code, type, input } = req.body;

  if (type === "groovy") {
    // --- Groovy logic (unchanged) ---
    const tempGroovyPath = path.join(`node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.groovy`);
    const tempOutputPath = path.join(`node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.output`);
    const groovyCode = `
def main(input) {
${code}
}
new File('${tempOutputPath}') << main(${JSON.stringify(input)}).toString()
`.trim();
    try {
      fs.writeFileSync(tempGroovyPath, groovyCode, "utf8");
    } catch (err) {
      return res.status(500).json({ output: null, log: "Failed to write Groovy script: " + err.message });
    }
    exec(`java -jar simplews.jar "${tempGroovyPath}"`, (error, stdout, stderr) => {
      fs.unlink(tempGroovyPath, () => {});
      if (error) {
        return res.json({ output: null, log: stdout + stderr });
      }
      let outputValue = null;
      try {
        outputValue = fs.readFileSync(tempOutputPath, "utf8");
      } catch (err) {
        outputValue = null;
      }
      fs.unlinkSync(tempOutputPath);
      return res.json({
        log: stderr || stdout,
        output: outputValue,
      });
    });

  } else if (type === "batch") {
    // --- Batch file execution ---
    const tempBatchPath = path.join(`node_batch_${Date.now()}_${Math.random().toString(36).slice(2)}.bat`);
    const tempOutputPath = path.join(`node_batch_${Date.now()}_${Math.random().toString(36).slice(2)}.output`);

    // If you want to pass input as a variable, you can write:
    // set INPUT=...
    // echo %INPUT% > %OUTPUT%
    const inputVar = input !== undefined ? String(input).replace(/"/g, '\\"') : "";
    const batchCode =
      `@echo off
set INPUT="${inputVar}"
set OUTPUT="${tempOutputPath}"
${code}
` + `\r\n`; // Add newline for batch files

    try {
      fs.writeFileSync(tempBatchPath, batchCode, "utf8");
    } catch (err) {
      return res.status(500).json({ output: null, log: "Failed to write batch file: " + err.message });
    }

    // Execute the batch file
    exec(`cmd /C "${tempBatchPath}"`, (error, stdout, stderr) => {
      // Clean up temp batch file
      fs.unlink(tempBatchPath, () => {});

      let outputValue = null;
      try {
        // Output is whatever the script wrote to the temp output file, if present
        if (fs.existsSync(tempOutputPath)) {
          outputValue = fs.readFileSync(tempOutputPath, "utf8");
          fs.unlinkSync(tempOutputPath);
        }
      } catch (err) {
        outputValue = null;
      }

      // For some batch files, stdout may be the desired output if not written to a file.
      if (!outputValue && stdout) outputValue = stdout;

      if (error) {
        return res.json({ output: outputValue, log: stdout + stderr + error.message });
      }
      return res.json({
        log: stderr || stdout,
        output: outputValue,
      });
    });

  } else {
    // --- JavaScript/Node.js eval ---
    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction(
        "input",
        code + '\nreturn typeof process === "function" ? await process(input) : undefined;'
      );
      const output = await fn(input);
      res.json({ output });
    } catch (err) {
      res.status(500).json({ log: err.message, output: null });
    }
  }
});

export default router;
