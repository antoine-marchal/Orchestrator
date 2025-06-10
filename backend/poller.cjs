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

    if (type === "flow") {
        // For flow nodes, we need to:
        // 1. Read the flow file specified in the node's 'code' property
        // 2. Parse the flow file to extract all nodes
        // 3. Execute each node in the flow sequentially
        // 4. Return the result of the last node's execution
        
        const flowFilePath = code;
        
        // Check if the flow file exists
        if (!fs.existsSync(flowFilePath)) {
            finish({
                output: null,
                log: null,
                error: `Flow file not found: ${flowFilePath}`
            });
            return;
        }
        
        try {
            // Read and parse the flow file
            const flowContent = fs.readFileSync(flowFilePath, 'utf8');
            const flow = JSON.parse(flowContent);
            
            if (!flow.nodes || !Array.isArray(flow.nodes) || !flow.edges || !Array.isArray(flow.edges)) {
                throw new Error('Invalid flow file format: missing nodes or edges array');
            }
            
            // Create a map of node IDs to nodes for easy lookup
            const nodeMap = {};
            flow.nodes.forEach(node => {
                nodeMap[node.id] = node;
            });
            
            // Create a map of dependencies (which nodes depend on which)
            const dependencies = {};
            flow.edges.forEach(edge => {
                if (!dependencies[edge.target]) {
                    dependencies[edge.target] = [];
                }
                dependencies[edge.target].push(edge.source);
            });
            
            // Find nodes with no outgoing edges (end nodes)
            const endNodes = flow.nodes.filter(node => 
                !flow.edges.some(edge => edge.source === node.id)
            );
            
            if (endNodes.length === 0) {
                throw new Error('Invalid flow: no end nodes found');
            }
            
            // Track executed nodes and their results
            const nodeResults = {};
            const visited = new Set();
            
            // Function to execute a node and its dependencies recursively
            const executeNodeInFlow = async (nodeId) => {
                if (visited.has(nodeId)) {
                    return nodeResults[nodeId];
                }
                visited.add(nodeId);
                
                // Execute all dependencies first
                const deps = dependencies[nodeId] || [];
                for (const depId of deps) {
                    await executeNodeInFlow(depId);
                }
                
                const node = nodeMap[nodeId];
                if (!node) {
                    throw new Error(`Node not found in flow: ${nodeId}`);
                }
                
                // Get inputs from dependencies
                let nodeInput = input; // Default to the flow node's input
                if (deps.length > 0) {
                    const depResults = deps.map(depId => nodeResults[depId]);
                    nodeInput = depResults.length === 1 ? depResults[0] : depResults;
                }
                
                // Create a temporary job file for this node
                const nodeJobId = `flow-${id}-${nodeId}-${Date.now()}`;
                const nodeJob = {
                    id: nodeJobId,
                    code: node.data.code || '',
                    type: node.data.type,
                    input: nodeInput
                };
                
                // For constant nodes, just use the value directly
                if (node.data.type === 'constant') {
                    nodeResults[nodeId] = node.data.value;
                    return node.data.value;
                }
                
                // Execute the node job
                const nodeJobPath = path.join(INBOX, `${nodeJobId}.json`);
                fs.writeFileSync(nodeJobPath, JSON.stringify(nodeJob), 'utf8');
                
                // Wait for the job to complete
                return new Promise((resolve, reject) => {
                    const checkResult = () => {
                        const resultPath = path.join(OUTBOX, `${nodeJobId}.result.json`);
                        if (fs.existsSync(resultPath)) {
                            try {
                                const resultContent = fs.readFileSync(resultPath, 'utf8');
                                const result = JSON.parse(resultContent);
                                fs.unlinkSync(resultPath); // Clean up
                                
                                nodeResults[nodeId] = result.output;
                                resolve(result.output);
                            } catch (err) {
                                reject(err);
                            }
                        } else {
                            setTimeout(checkResult, 100); // Check again after 100ms
                        }
                    };
                    
                    // Start checking for results
                    setTimeout(checkResult, 100);
                });
            };
            
            // Execute the flow asynchronously
            const results = [];
            (async () => {
                try {
                    for (const endNode of endNodes) {
                        const result = await executeNodeInFlow(endNode.id);
                        results.push(result);
                    }
                    
                    // Return the result of the last end node
                    finish({
                        output: results.length > 0 ? results[results.length - 1] : null,
                        log: `Successfully executed flow with ${flow.nodes.length} nodes`,
                        error: null
                    });
                } catch (err) {
                    finish({
                        output: null,
                        log: null,
                        error: `Error executing flow: ${err.message}`
                    });
                }
            })();
            
            // Don't call finish() here as it will be called by the async function
            return;
        } catch (err) {
            finish({
                output: null,
                log: null,
                error: `Error processing flow: ${err.message}`
            });
        }
    }
    else if (type === "groovy") {
        const tempGroovyPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.groovy`);
        const tempInputPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.input`);
        const tempOutputPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.output`);
        fs.writeFileSync(tempInputPath, JSON.stringify(input), "utf8");

        // --- Convert for Groovy ---
        const inputPathGroovy = tempInputPath.replace(/\\/g, '/');
        const outputPathGroovy = tempOutputPath.replace(/\\/g, '/');

        const groovyCode = `
        def smartParse = { s -> 
            try { (s?.trim()?.startsWith('{') || s?.trim()?.startsWith('[')) && s?.contains('"') ? new groovy.json.JsonSlurper().parseText(s) : Eval.me(s) } 
            catch(e) { s } 
        }
      input = smartParse(new File('${inputPathGroovy}').text)
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
        exec(`java -jar groovyExec.jar "${tempGroovyPath}"`, (error, stdout, stderr) => {
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
    else if (type === "jsbackend" || type === "playwright") {
        // Use temp files for the JS script and output
        const tempId = `node_jsbackend_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const tempScriptPath = path.join(INBOX, `${tempId}.js`); // <-- always cjs for best compat
        const tempOutputPath = path.join(INBOX, `${tempId}.output`);
    
        const codeWithInput = `
    let output="";
    const input = ${JSON.stringify(input)};
    import fs from 'fs';
    ${code}
    fs.writeFileSync(${JSON.stringify(tempOutputPath)}, JSON.stringify(output), 'utf8');
    `;
    
        fs.writeFileSync(tempScriptPath, codeWithInput, "utf8");
    
        exec(`node "${tempScriptPath}"`, { timeout: 60000 }, (error, stdout, stderr) => {
          fs.unlink(tempScriptPath, () => {});
          let outputValue = null;
          try {
            if (fs.existsSync(tempOutputPath)) {
              outputValue = fs.readFileSync(tempOutputPath, "utf8");
              fs.unlinkSync(tempOutputPath);
              try { outputValue = JSON.parse(outputValue); } catch {} // decode if possible
            }
          } catch (err) {
            outputValue = null;
          }
          let errorInStdout = '';
          if (/error|not found|failed|exception/i.test(stdout)) {
            errorInStdout = stdout;
          }
          finish({
            log: errorInStdout === '' ? stdout : null,
            error: (stderr || '') + (error ? error.message : '') + errorInStdout,
            output: outputValue,
          });
        });
    }
    
    
    
    else if (type === "powershell") {
        const tempPs1Path = path.join(INBOX, `node_ps_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
        const tempOutputPath = path.join(INBOX, `node_ps_${Date.now()}_${Math.random().toString(36).slice(2)}.output`);
        const inputVar = input !== undefined ? String(input).replace(/"/g, '""') : "";
        // PowerShell uses $env:INPUT and $env:OUTPUT for variables
        const psCode =
          `$env:INPUT="${inputVar}"\n$env:OUTPUT="${tempOutputPath}"\n${code}\n`;
    
        try {
          fs.writeFileSync(tempPs1Path, psCode, "utf8");
        } catch (err) {
          finish({ output: null, log: "Failed to write PowerShell file: " + err.message, error: err.message });
          return;
        }
    
        // Run with powershell.exe
        exec(`powershell -ExecutionPolicy Bypass -File "${tempPs1Path}"`, (error, stdout, stderr) => {
          fs.unlink(tempPs1Path, () => {});
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
    
          // Detect error patterns
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
