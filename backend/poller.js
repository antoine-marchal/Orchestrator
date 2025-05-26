const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const INBOX = path.join(__dirname, "inbox");
const OUTBOX = path.join(__dirname, "outbox");

if (!fs.existsSync(INBOX)) fs.mkdirSync(INBOX, { recursive: true });
if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });

function processJobFile(filePath) {
    const jobStr = fs.readFileSync(filePath, "utf8");
    const job = JSON.parse(jobStr);
    const { id, code, type, input } = job;

    function finish(result) {
        const outFile = path.join(OUTBOX, `${id}.result.json`);
        fs.writeFileSync(outFile, JSON.stringify({ id, ...result }, null, 2));
        fs.unlinkSync(filePath); // Clean up input file
    }

    if (type === "groovy") {
        const tempGroovyPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.groovy`);
        const tempInputPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.input`);
        const tempOutputPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.output`);
        fs.writeFileSync(tempInputPath, JSON.stringify(input), "utf8");

        // --- Convert for Groovy ---
        const inputPathGroovy = tempInputPath.replace(/\\/g, '/');
        const outputPathGroovy = tempOutputPath.replace(/\\/g, '/');

        const groovyCode = `
      def input = new File('${inputPathGroovy}').text
      def output = ""
      ${code}
      new File('${outputPathGroovy}') << output.toString()
      `.trim();
        try {
            fs.writeFileSync(tempGroovyPath, groovyCode, "utf8");
        } catch (err) {
            finish({ output: null, log: "Failed to write Groovy script: " + err.message });
            return;
        }
        exec(`java -jar simplews.jar "${tempGroovyPath}"`, (error, stdout, stderr) => {
            fs.unlink(tempGroovyPath, () => { });
        
            let outputValue = null;
            try {
                if (fs.existsSync(tempOutputPath)) {
                    outputValue = fs.readFileSync(tempOutputPath, "utf8");
                }
            } catch (err) {
                outputValue = null;
            } finally {
                if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
            }
        
            // Pattern: does stdout look like an error?
            // (customize this as needed for your Groovy/jar output)
            let errorInStdout = '';
            if (/Exception|Error|Caused by|groovy.lang|java\.lang/i.test(stdout)) {
                errorInStdout = stdout;
            }
        
            finish({
                log: errorInStdout===''?stdout:null,
                error: (stderr) + (error ? error.message : null) + errorInStdout,
                output: outputValue,
            });
        });

    }
    else if (type === "batch") {
        const tempBatchPath = path.join(INBOX, `node_batch_${Date.now()}_${Math.random().toString(36).slice(2)}.bat`);
        const tempOutputPath = path.join(INBOX, `node_batch_${Date.now()}_${Math.random().toString(36).slice(2)}.output`);
        const inputVar = input !== undefined ? String(input).replace(/"/g, '\\"') : "";
        const batchCode =
            `@echo off
    set INPUT="${inputVar}"
    set OUTPUT="${tempOutputPath}"
    ${code}
    ` + `\r\n`;
    
        try {
            fs.writeFileSync(tempBatchPath, batchCode, "utf8");
        } catch (err) {
            finish({ output: null, log: "Failed to write batch file: " + err.message, error: err.message });
            return;
        }
        exec(`cmd /C "${tempBatchPath}"`, (error, stdout, stderr) => {
            fs.unlink(tempBatchPath, () => { });
            let outputValue = null;
            try {
                if (fs.existsSync(tempOutputPath)) {
                    outputValue = fs.readFileSync(tempOutputPath, "utf8");
                    fs.unlinkSync(tempOutputPath);
                }
            } catch (err) {
                outputValue = null;
            }
            if (!outputValue && stdout) outputValue = stdout;
    
            // Detect common error patterns in stdout
            let errorInStdout = '';
            if (/error|not recognized|failed|exception|not found/i.test(stdout)) {
                errorInStdout = stdout;
            }
    
            finish({
                log: errorInStdout === '' ? stdout : null,
                error: (stderr || '') + (error ? error.message : '') + errorInStdout,
                output: outputValue,
            });
        });
    }
    else if (type === "playwright") {
        // Use a temp file for the JS script
        const tempScriptPath = path.join(INBOX, `node_playwright_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
        const codeWithInput = `
    const input = ${JSON.stringify(input)};
    ${code}
    `;
    
        fs.writeFileSync(tempScriptPath, codeWithInput, "utf8");
    
        exec(`node "${tempScriptPath}"`, { timeout: 60000 }, (error, stdout, stderr) => {
            fs.unlink(tempScriptPath, () => {});
            // Detect errors in stdout too
            let errorInStdout = '';
            if (/error|not found|failed|exception/i.test(stdout)) {
                errorInStdout = stdout;
            }
            finish({
                log: errorInStdout === '' ? stdout : null,
                error: (stderr || '') + (error ? error.message : '') + errorInStdout,
                output: stdout && !errorInStdout ? stdout.trim() : null, // Can also parse JSON etc if you expect it!
            });
        });
    }    
    else {
        // JavaScript/Node.js
        let logs = [];
        const customConsole = {
            log: (...args) => {
                logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
            }
        };
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        let finished = false;
        try {
            const fn = new AsyncFunction(
                "input", "console",
                code + '\nreturn typeof process === "function" ? await process(input) : undefined;'
            );
            fn(input, customConsole)
                .then(output => {
                    if (!finished) {
                        finished = true;
                        finish({
                            output,
                            log: logs.length > 0 ? logs.join('\n') : "",
                            error: null,
                        });
                    }
                })
                .catch(err => {
                    if (!finished) {
                        finished = true;
                        // Look for error-like patterns in logs just in case
                        let errorInLogs = '';
                        if (logs.some(log => /error|exception|fail|not found/i.test(log))) {
                            errorInLogs = logs.join('\n');
                        }
                        finish({
                            output: null,
                            log: logs.length > 0 ? logs.join('\n') : "",
                            error: (err && err.message ? err.message : '') + (errorInLogs ? '\n' + errorInLogs : ''),
                        });
                    }
                });
        } catch (err) {
            if (!finished) {
                finished = true;
                finish({
                    output: null,
                    log: logs.length > 0 ? logs.join('\n') : "",
                    error: err && err.message ? err.message : String(err),
                });
            }
        }
    }
    
}

function pollInbox() {
    const files = fs.readdirSync(INBOX)
        .filter(fn => fn.endsWith('.json') && !fn.endsWith('.result.json'));

    files.forEach(file => {
        const filePath = path.join(INBOX, file);
        const processingPath = filePath + '.processing';

        // Try to atomically rename the file. If it fails, skip.
        try {
            fs.renameSync(filePath, processingPath); // Moves file only if no one else has it!
        } catch (err) {
            // Another process/thread probably grabbed it first, or it's in use. Skip.
            return;
        }

        // Only process if we could rename it!
        processJobFile(processingPath);
    });
}


console.log("Backend file-based executor started.");
setInterval(pollInbox, 200);
