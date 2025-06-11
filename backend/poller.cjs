const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// Constants
const INBOX = path.join(__dirname, "inbox");
const OUTBOX = path.join(__dirname, "outbox");

// Create directories if they don't exist
if (!fs.existsSync(INBOX)) fs.mkdirSync(INBOX, { recursive: true });
if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });

// Command line arguments
const isSilent = process.argv.includes('--silent') || process.argv.includes('-s');
const shouldShutdownAfterExecution = process.argv.includes('-s');

// Track if we're executing a master flow (top-level flow)
let isMasterFlowRunning = false;

/**
 * Utility to create a console logger that captures logs
 * @returns {Object} Object containing the log collector and restore function
 */
function createLogCollector() {
  const logs = [];
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  // Override console methods to capture logs
  console.log = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    logs.push({ type: 'log', message });
    originalConsoleLog.apply(console, args);
  };

  console.warn = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    logs.push({ type: 'log', message: `[WARN] ${message}` });
    originalConsoleWarn.apply(console, args);
  };

  console.error = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    logs.push({ type: 'error', message });
    originalConsoleError.apply(console, args);
  };

  // Function to restore original console methods
  const restore = () => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    return logs;
  };

  return { logs, restore };
}

/**
 * Parse a flow file and prepare it for execution
 * @param {string} flowFilePath - Path to the flow file
 * @returns {Object} Parsed flow with node maps and dependency information
 */
function parseFlowFile(flowFilePath) {
  // Check if the flow file exists
  if (!fs.existsSync(flowFilePath)) {
    throw new Error(`Flow file not found: ${flowFilePath}`);
  }

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

  return {
    flow,
    nodeMap,
    dependencies,
    endNodes
  };
}

/**
 * Execute a flow file directly
 * @param {string} flowFilePath - Path to the flow file to execute
 * @param {any} [input=null] - Optional input data for the flow
 * @param {Array} [flowPath=[]] - Path of parent flows to detect circular references
 * @param {boolean} [isTopLevel=true] - Whether this is a top-level flow execution
 * @returns {Promise<any>} - The result of the flow execution
 */
async function executeFlowFile(flowFilePath, input = null, flowPath = [], isTopLevel = true) {
  return new Promise((resolve, reject) => {
    try {
      // Check for circular references
      if (flowPath.includes(flowFilePath)) {
        console.warn(`Circular reference detected in flow execution: ${flowFilePath}`);
        resolve(null); // Return null for circular references instead of rejecting
        return;
      }
      
      // Add current flow to the path
      const currentFlowPath = [...flowPath, flowFilePath];
      
      // If this is a top-level flow execution, mark it as the master flow
      if (isTopLevel) {
        isMasterFlowRunning = true;
      }

      // Parse the flow file
      const { flow, nodeMap, dependencies, endNodes } = parseFlowFile(flowFilePath);
      
      // Track executed nodes and their results
      const nodeResults = {};
      const visited = new Set();
      
      // Store the flow path in the visited object for reference in nested flows
      visited.flowPath = currentFlowPath;
      
      // Set up log collection for the flow execution
      const { restore: restoreConsole } = createLogCollector();
      
      // Log the flow execution start
      console.log(`Executing flow: ${flowFilePath}`);
      
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
        let nodeInput = input; // Default to the flow's input
        if (deps.length > 0) {
          const depResults = deps.map(depId => nodeResults[depId]);
          nodeInput = depResults.length === 1 ? depResults[0] : depResults;
        }
        
        // For constant nodes, just use the value directly
        if (node.data.type === 'constant') {
          nodeResults[nodeId] = node.data.value;
          console.log(`Node ${node.data.label || nodeId} (${node.data.type}): ${JSON.stringify(node.data.value)}`);
          console.log('---');
          return node.data.value;
        }
        
        // Special handling for flow nodes to ensure nested flow execution
        if (node.data.type === 'flow') {
          const flowResult = await executeFlowNode(node, nodeId, nodeInput, visited.flowPath, nodeResults);
          // If the result is an object with output and executionTime, extract the output
          return flowResult.output !== undefined ? flowResult.output : flowResult;
        }
        
        // For other node types, create a temporary job file
        return await executeRegularNode(node, nodeId, nodeInput, nodeResults);
      };
      
      // Execute the flow asynchronously
      (async () => {
        try {
          const results = [];
          for (const endNode of endNodes) {
            if (endNode.type !== 'comment') {
              const result = await executeNodeInFlow(endNode.id);
              results.push(result);
            }
          }
          
          // Restore original console methods and get logs
          const flowLogs = restoreConsole();
          
          // Return the result of the last end node
          const finalResult = results.length > 0 ? results[results.length - 1] : null;
          console.log('\nFlow execution completed successfully.');
          console.log(`Final result: ${JSON.stringify(finalResult.output, null, 2)}`);
          
          // If this is the master flow and we should shutdown after execution
          if (isTopLevel && shouldShutdownAfterExecution) {
            console.log('Shutting down backend as requested by -s argument...');
            // Allow time for logs to be processed before exit
            setTimeout(() => {
              process.exit(0);
            }, 500);
          }
          
          // Mark master flow as no longer running if this is the top level
          if (isTopLevel) {
            isMasterFlowRunning = false;
          }
          
          resolve(finalResult);
        } catch (err) {
          // Restore original console methods in case of error
          restoreConsole();
          console.error(`\nFlow execution failed: ${err.message}`);
          
          // Mark master flow as no longer running if this is the top level
          if (isTopLevel) {
            isMasterFlowRunning = false;
          }
          
          reject(err);
        }
      })();
    } catch (err) {
      console.error(`Error processing flow: ${err.message}`);
      reject(err);
    }
  });
}

/**
 * Execute a flow node (nested flow)
 * @param {Object} node - The flow node to execute
 * @param {string} nodeId - The ID of the node
 * @param {any} nodeInput - Input data for the node
 * @param {Array} flowPath - Path of parent flows
 * @param {Object} nodeResults - Map to store node results
 * @returns {Promise<any>} - The result of the node execution
 */
async function executeFlowNode(node, nodeId, nodeInput, flowPath, nodeResults) {
  // Get the path to the nested flow file
  const nestedFlowPath = node.data.code || '';
  
  // Check if we have a valid flow path
  if (!nestedFlowPath) {
    throw new Error(`Flow node ${nodeId} has no flow file path specified`);
  }
  
  // Start execution time tracking
  const startTime = Date.now();
  
  try {
    // Set up log collection for the nested flow
    const { restore: restoreNestedConsole } = createLogCollector();
    
    try {
      // Execute the nested flow with the current flow path to track circular references
      // Pass false for isTopLevel to indicate this is not a master flow
      const nestedFlowResult = await executeFlowFile(nestedFlowPath, nodeInput, flowPath, false);
      
      // Calculate execution time
      const executionTime = Date.now() - startTime;
      
      // Restore original console methods and get logs
      const nestedLogs = restoreNestedConsole();
      
      // Log node execution results to console
      console.log(`Node ${node.data.label || nodeId} (${node.data.type}):`);
      
      // Forward all captured logs from nested flow with proper prefixing
      if (nestedLogs.length > 0) {
        nestedLogs.forEach(log => {
          if (log.type === 'error') {
            //console.error(`[Nested] ${log.message}`);
          } else {
            //console.log(`[Nested] ${log.message}`);
          }
        });
      }
      
      console.log(`Output: ${JSON.stringify(nestedFlowResult, null, 2)}`);
      console.log('---');
      
      // Store result and execution time
      nodeResults[nodeId] = nestedFlowResult;
      nodeResults[`${nodeId}_executionTime`] = executionTime;
      
      // Return result with execution time
      return { output: nestedFlowResult, executionTime };
    } catch (err) {
      // Restore original console methods in case of error
      restoreNestedConsole();
      throw err;
    }
  } catch (err) {
    console.error(`Error executing nested flow: ${err.message}`);
    throw err;
  }
}

/**
 * Execute a regular (non-flow) node
 * @param {Object} node - The node to execute
 * @param {string} nodeId - The ID of the node
 * @param {any} nodeInput - Input data for the node
 * @param {Object} nodeResults - Map to store node results
 * @returns {Promise<any>} - The result of the node execution
 */
async function executeRegularNode(node, nodeId, nodeInput, nodeResults) {
  // Create a temporary job file
  const nodeJobId = `flow-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const nodeJob = {
    id: nodeJobId,
    code: node.data.code || '',
    type: node.data.type,
    input: nodeInput
  };
  
  // Start execution time tracking
  const startTime = Date.now();
  
  // Execute the node job
  const nodeJobPath = path.join(INBOX, `${nodeJobId}.json`);
  fs.writeFileSync(nodeJobPath, JSON.stringify(nodeJob), 'utf8');
  
  // Wait for the job to complete
  return new Promise((resolveNode, rejectNode) => {
    const checkResult = () => {
      const resultPath = path.join(OUTBOX, `${nodeJobId}.result.json`);
      if (fs.existsSync(resultPath)) {
        try {
          const resultContent = fs.readFileSync(resultPath, 'utf8');
          const result = JSON.parse(resultContent);
          fs.unlinkSync(resultPath); // Clean up
          
          // Calculate execution time
          const executionTime = Date.now() - startTime;
          
          // Log node execution results to console
          console.log(`Node ${node.data.label || nodeId} (${node.data.type}):`);
          if (result.log) console.log(`Log: ${result.log}`);
          if (result.error) console.error(`Error: ${result.error}`);
          console.log(`Output: ${JSON.stringify(result.output, null, 2)}`);
          console.log('---');
          
          // Store result and execution time
          nodeResults[nodeId] = result.output;
          nodeResults[`${nodeId}_executionTime`] = executionTime;
          
          // Add execution time to the result
          result.executionTime = executionTime;
          resolveNode(result);
        } catch (err) {
          rejectNode(err);
        }
      } else {
        setTimeout(checkResult, 100); // Check again after 100ms
      }
    };
    
    // Start checking for results
    setTimeout(checkResult, 100);
  });
}

/**
 * Process a job file from the inbox
 * @param {string} filePath - Path to the job file
 */
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
    
    // Initialize flow path if not present
    const flowPath = job.flowPath || [];
    
    // Check for circular references in flow execution
    if (flowPath.includes(flowFilePath)) {
      finish({
        output: null,
        log: `Circular reference detected in flow execution: ${flowFilePath}`,
        error: `Circular reference detected: ${flowFilePath} is already in the execution path`
      });
      return;
    }
    
    try {
      // Execute the flow asynchronously
      (async () => {
        try {
          // Set up log collection for the flow execution
          const { logs, restore: restoreConsole } = createLogCollector();
          
          try {
            // Execute the flow file
            // Pass false for isTopLevel since this is being executed from a job
            const flowResult = await executeFlowFile(flowFilePath, input, flowPath, false);
            
            // Restore original console methods and get logs
            restoreConsole();
            
            // Combine all logs into a single string
            const logMessages = logs.map(log =>
              log.type === 'error' ? `ERROR: ${log.message}` : log.message
            ).join('\n');
            
            finish({
              output: flowResult,
              log: logMessages || `Successfully executed flow`,
              error: null
            });
          } catch (err) {
            // Restore original console methods in case of error
            restoreConsole();
            throw err;
          }
        } catch (err) {
          finish({
            output: null,
            log: null,
            error: `Error executing flow: ${err.message}`
          });
        }
      })();
    } catch (err) {
      finish({
        output: null,
        log: null,
        error: `Error processing flow: ${err.message}`
      });
    }
  }
  else if (type === "groovy") {
    processGroovyNode(id, code, input, finish);
  }
  else if (type === "batch") {
    processBatchNode(id, code, input, finish);
  }
  else if (type === "jsbackend" || type === "playwright") {
    processJsBackendNode(id, code, input, finish);
  }
  else if (type === "powershell") {
    processPowershellNode(id, code, input, finish);
  }
  else {
    // JavaScript/Node.js
    processJsNode(id, code, input, finish);
  }
}

/**
 * Process a Groovy node
 * @param {string} id - The job ID
 * @param {string} code - The Groovy code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 */
function processGroovyNode(id, code, input, finish) {
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
  
  exec(`java -jar ${isSilent ? `resources/backend/` : ``}groovyExec.jar "${tempGroovyPath}"`, (error, stdout, stderr) => {
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
    let errorInStdout = '';
    if (/Exception|Error|Caused by|groovy.lang|java\.lang/i.test(stdout)) {
      errorInStdout = stdout;
    }
  
    finish({
      log: errorInStdout === '' ? stdout : null,
      error: (stderr) + (error ? error.message : null) + errorInStdout,
      output: outputValue,
    });
  });
}

/**
 * Process a Batch node
 * @param {string} id - The job ID
 * @param {string} code - The Batch code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 */
function processBatchNode(id, code, input, finish) {
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

/**
 * Process a JS Backend node
 * @param {string} id - The job ID
 * @param {string} code - The JS code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 */
function processJsBackendNode(id, code, input, finish) {
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

/**
 * Process a PowerShell node
 * @param {string} id - The job ID
 * @param {string} code - The PowerShell code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 */
function processPowershellNode(id, code, input, finish) {
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

/**
 * Process a JavaScript node
 * @param {string} id - The job ID
 * @param {string} code - The JS code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 */
function processJsNode(id, code, input, finish) {
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

/**
 * Poll the inbox directory for new job files
 */
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

// Export the executeFlowFile function for use in the main process
module.exports = {
  executeFlowFile
};
