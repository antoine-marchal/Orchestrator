const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const kill = require("tree-kill");

// Get the Node.js executable path from environment variable or use 'node' as default
const nodeExecutablePath = process.env.NODE_EXECUTABLE_PATH || 'node';

// Constants
const INBOX = path.join(__dirname, "inbox");
const OUTBOX = path.join(__dirname, "outbox");

// Create directories if they don't exist
if (!fs.existsSync(INBOX)) fs.mkdirSync(INBOX, { recursive: true });
if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });

// Command line arguments
const isSilent = process.argv.includes('--silent') || process.argv.includes('-s');
const shouldShutdownAfterExecution = process.argv.includes('-s');
const isPackaged = (() => {
  // Heuristic: in prod, process.resourcesPath existe (fourni par Electron main)
  return process.resourcesPath !== undefined;
})();


const getResourcePath = () => {
  if (isPackaged && process.resourcesPath) {
    // Ex : C:\Users\xxx\AppData\Local\Programs\Orchestrator\resources
    return path.join(process.resourcesPath, 'backend');
  } else {
    return path.join(__dirname);
  }
};

// Fabrique le chemin absolu vers groovyExec.jar
const groovyJarPath = path.join(getResourcePath(), 'groovyExec.jar');

// Track if we're executing a master flow (top-level flow)
let isMasterFlowRunning = false;

// Track running processes by job ID
const runningProcesses = new Map();

// Function to register a process with its job ID
function registerProcess(jobId, process) {
  runningProcesses.set(jobId, process);
}

// Function to terminate a process by job ID
function terminateProcess(jobId) {
  const process = runningProcesses.get(jobId);
  if (process) {
    console.log(`Terminating process for job ${jobId}`);
    try {
      // Use tree-kill to ensure all child processes are terminated
      kill(process.pid, 'SIGTERM', (err) => {
        if (err) {
          console.error(`Error killing process for job ${jobId}:`, err);
        } else {
          console.log(`Process for job ${jobId} terminated successfully`);
        }
        // Always remove from running processes map, even if there was an error
        runningProcesses.delete(jobId);
      });
    } catch (err) {
      console.error(`Error in terminateProcess for job ${jobId}:`, err);
      // Ensure we still remove the process from the map even if tree-kill fails
      runningProcesses.delete(jobId);
    }
  }
}

// Function to check if a job should be stopped
function shouldStopJob(jobId) {
  const stopFilePath = path.join(INBOX, `${jobId}.stop`);
  return fs.existsSync(stopFilePath);
}

// Function to clean up stop signal file
function cleanupStopSignal(jobId) {
  try {
    const stopFilePath = path.join(INBOX, `${jobId}.stop`);
    if (fs.existsSync(stopFilePath)) {
      try {
        fs.unlinkSync(stopFilePath);
        console.log(`Successfully cleaned up stop signal for job ${jobId}`);
      } catch (err) {
        console.error(`Error cleaning up stop signal for job ${jobId}:`, err);
      }
    } else {
      console.log(`No stop signal file found for job ${jobId}`);
    }
  } catch (err) {
    // Catch any unexpected errors in the function itself
    console.error(`Unexpected error in cleanupStopSignal for job ${jobId}:`, err);
  }
}

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
  if (!fs.existsSync(flowFilePath)) {
    throw new Error(`Flow file not found: ${flowFilePath}`);
  }

  const flowContent = fs.readFileSync(flowFilePath, 'utf8');
  const flow = JSON.parse(flowContent);

  if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    throw new Error('Invalid flow file format: missing nodes or edges array');
  }

  const nodeMap = {};
  flow.nodes.forEach((n) => (nodeMap[n.id] = n));

  const incomingMap = {};
  const outgoingMap = {};
  flow.edges.forEach((e) => {
    (incomingMap[e.target] ||= []).push(e);
    (outgoingMap[e.source] ||= []).push(e);
  });

  // roots = nodes with no incoming
  const roots = flow.nodes
    .map((n) => n.id)
    .filter((id) => !(incomingMap[id] && incomingMap[id].length));

  return {
    flow,
    nodeMap,
    incomingMap,
    outgoingMap,
    roots,
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
async function executeFlowFile(
  flowFilePath,
  flowInput = null,
  flowPath = [],
  isTopLevel = true,
  _respectStarterNode = true,
  basePath = null,
  timeout = 60000 * 60 * 8
) {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (flowPath.includes(flowFilePath)) {
          console.warn(`Circular reference detected in flow execution: ${flowFilePath}`);
          return resolve(null);
        }
        const currentFlowPath = [...flowPath, flowFilePath];
        if (isTopLevel) isMasterFlowRunning = true;

        const {
          flow, nodeMap, incomingMap, outgoingMap, roots
        } = parseFlowFile(flowFilePath);

        const starter = flow.nodes.find((n) => n?.data?.isStarterNode);
        const starterId = starter ? starter.id : null;

        // ---- helpers that are *fresh* each read ----
        const byId = (id) => nodeMap[id] || null;
        const incoming = (id) => incomingMap[id] || [];
        const outgoing = (id) => outgoingMap[id] || [];
        const creationIndex = (id) => flow.nodes.findIndex((n) => n.id === id);

        const rootOf = (id) => {
          const seen = new Set();
          const acc = [];
          const stack = [id];
          while (stack.length) {
            const cur = stack.pop();
            if (seen.has(cur)) continue;
            seen.add(cur);
            const inc = incoming(cur);
            if (!inc.length) acc.push(cur);
            else inc.forEach((e) => stack.push(e.source));
          }
          if (!acc.length) return id;
          acc.sort((a, b) => creationIndex(a) - creationIndex(b));
          return acc[0];
        };
        const firstCreatedRoot = () => {
          if (!roots.length) return null;
          const r = [...roots];
          r.sort((a, b) => creationIndex(a) - creationIndex(b));
          return r[0];
        };
        const firstCreatedGoto = () => {
          const gotos = flow.nodes.filter((n) => n?.data?.type === 'goto');
          if (!gotos.length) return null;
          gotos.sort((a, b) => creationIndex(a.id) - creationIndex(b.id));
          return gotos[0].id;
        };

        // small expression helper: same as frontend
        const stripSemis = (s) => (s ?? '').trim().replace(/;+\s*$/, '');
        const toNumberIfNumeric = (v) =>
          typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : v;
        const evalGotoExpr = (expr, input) => {
          try {
            const cleaned = stripSemis(expr);
            const ninput = toNumberIfNumeric(input);
            const fn = new Function('input', 'ninput', `return !!(${cleaned});`);
            return !!fn(input, ninput);
          } catch {
            return false;
          }
        };

        // ---- choose entry (starter > root-of-first-goto > first-root) ----
        let entryId = starterId;
        if (!entryId) {
          const g = firstCreatedGoto();
          entryId = g ? rootOf(g) : firstCreatedRoot();
        }
        if (!entryId) throw new Error('No valid entry point found.');

        // reset goto decisions in-memory (backend version)
        const gotoDecision = {}; // nodeId -> targetId or null

        // ---- scheduler state ----
        const nodeResults = {};             // nodeId -> output
        const executed = new Set();         // executed this run
        const executing = new Set();
        const executedAt = {};              // nodeId -> monotonic tick
        let tick = 0;
        let lastExecutedId = null;
        const visitCount = {};
        const MAX_VISITS_PER_NODE = 1000;
        const MAX_STEPS = 1000;

        // ---- execution primitives ----
        const ensureExecuted = async (nodeId, force = false) => {
          if (executing.has(nodeId)) return;
          if (executed.has(nodeId) && !force) return;

          const node = byId(nodeId);
          if (!node) return;

          executing.add(nodeId);

          // execute predecessors (no force; their cache is fine)
          const preds = incoming(nodeId).map((e) => e.source);
          for (const p of preds) await ensureExecuted(p, false);

          // Build inputs for this node
          let processedInputs;
          if (starterId && nodeId === starterId) {
            // starter sees the flow input
            processedInputs = flowInput;
          } else if (preds.length) {
            const vals = preds.map((p) => nodeResults[p]);
            processedInputs = vals.length === 1 ? vals[0] : vals;
          } else {
            // true root without inputs
            processedInputs = flowInput;
          }

          if (node?.data?.type === 'goto') {
            // decide based on latest inputs
            const rules = Array.isArray(node?.data?.conditions) ? node.data.conditions : [];
            let decision = null;
            for (const r of rules) {
              if (r?.expr && r?.goto) {
                if (evalGotoExpr(r.expr, processedInputs)) {
                  decision = r.goto;
                  break;
                }
              }
            }
            gotoDecision[nodeId] = decision;
            nodeResults[nodeId] = processedInputs; // pass-through for downstream readers
          } else if (node?.data?.type === 'flow') {
            // nested flow
            const currentDir = path.dirname(flowFilePath);
            const nested = await executeFlowNode(
              node,
              nodeId,
              processedInputs,
              currentFlowPath,
              nodeResults,
              currentDir,
              timeout
            );
            nodeResults[nodeId] = nested?.output !== undefined ? nested.output : nested;
          } else if (node?.data?.type === 'constant') {
            nodeResults[nodeId] = node.data.value;
          } else {
            // regular node (groovy/batch/jsbackend/javascript/powershell)
            const res = await executeRegularNode(
              node,
              nodeId,
              processedInputs,
              nodeResults,
              true,
              timeout,
              basePath || path.dirname(flowFilePath)
            );
            nodeResults[nodeId] = res?.output !== undefined ? res.output : res;
          }
          if (node?.data?.type !== 'goto') {
            lastExecutedId = nodeId;
          }
          executed.add(nodeId);
          executedAt[nodeId] = ++tick;
          executing.delete(nodeId);
        };

        const stepTo = async (nextId, budget) => {
          if (budget.left-- <= 0) return;

          visitCount[nextId] = (visitCount[nextId] ?? 0) + 1;
          if (visitCount[nextId] > MAX_VISITS_PER_NODE) return;

          const node = byId(nextId);
          const preds = incoming(nextId).map((e) => e.source);
          const needsRefresh =
            preds.some((p) => (executedAt[p] || 0) > (executedAt[nextId] || 0));


          await ensureExecuted(nextId, needsRefresh);

          const n = byId(nextId);
          if (!n) return;

          if (n?.data?.type === 'goto') {
            const jump = gotoDecision[nextId];
            if (jump) {
              // force jump target so loops/branch hops re-exec
              await ensureExecuted(jump, true);
              await stepTo(jump, budget);
              return;
            }
            // no decision: traverse normal outs
            for (const e of outgoing(nextId)) await stepTo(e.target, budget);
            return;
          }

          // normal node: follow graphical outs
          for (const e of outgoing(nextId)) await stepTo(e.target, budget);
        };

        // ---- run traversal ----
        await stepTo(entryId, { left: MAX_STEPS });


        const finalResult = lastExecutedId ? nodeResults[lastExecutedId] : null;

        if (isTopLevel && shouldShutdownAfterExecution) {
          setTimeout(() => process.exit(0), 500);
        }
        if (isTopLevel) isMasterFlowRunning = false;

        resolve(finalResult);
      } catch (err) {
        if (isTopLevel) isMasterFlowRunning = false;
        reject(err);
      }
    })();
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
async function executeFlowNode(node, nodeId, nodeInput, flowPath, nodeResults, currentFlowDir, timeout = 60000 * 60 * 8) {
  // Get the path to the nested flow file
  let nestedFlowPath = '';

  // Check if we have a codeFilePath (external file) or use embedded code
  if (node.data.codeFilePath) {
    nestedFlowPath = node.data.codeFilePath;
    console.log(`Using external flow file path: ${nestedFlowPath}`);
  } else {
    nestedFlowPath = node.data.code || '';
    console.log(`Using embedded flow path: ${nestedFlowPath}`);
  }

  // Check if we have a valid flow path
  if (!nestedFlowPath) {
    throw new Error(`Flow node ${nodeId} has no flow file path specified`);
  }

  // If the path is relative and we have a parent flow path, resolve it relative to the parent flow's directory
  if (!path.isAbsolute(nestedFlowPath) && flowPath.length > 0) {
    const parentFlowPath = flowPath[flowPath.length - 1];
    const parentDir = path.dirname(parentFlowPath);
    console.log(`Resolving nested flow path: ${nestedFlowPath} relative to parent flow directory: ${parentDir}`);
    nestedFlowPath = path.resolve(parentDir, nestedFlowPath);
    console.log(`Resolved nested flow path: ${nestedFlowPath}`);
  }

  // Start execution time tracking
  const startTime = Date.now();

  try {
    // Set up log collection for the nested flow
    const { restore: restoreNestedConsole } = createLogCollector();

    try {
      // First, check if the referenced flow has a starter node
      // We need to parse the flow file to check for a starter node
      const { flow } = parseFlowFile(nestedFlowPath);
      const starterNode = flow.nodes.find(node => node.data && node.data.isStarterNode);

      // Execute the nested flow with the current flow path to track circular references
      // Pass false for isTopLevel to indicate this is not a master flow
      // If there's a starter node, we'll pass the input directly to it
      // Pass the timeout value to the nested flow execution
      const nestedFlowResult = await executeFlowFile(nestedFlowPath, nodeInput, flowPath, false, true, currentFlowDir, timeout);

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
 * @param {boolean} [waitForResult=true] - Whether to wait for the result before resolving
 * @returns {Promise<any>} - The result of the node execution
 */
async function executeRegularNode(node, nodeId, nodeInput, nodeResults, waitForResult = true, timeout = 60000 * 60 * 8, jobBasePath) {

  // Create a temporary job file
  const nodeJobId = `flow-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const nodeJob = {
    id: nodeJobId,
    code: node.data.code || '',
    codeFilePath: node.data.codeFilePath || null,
    type: node.data.type,
    input: nodeInput,
    dontWaitForOutput: node.data.dontWaitForOutput,
    basePath: jobBasePath,
    timeout: timeout
  };
  console.log('Job base path is :', jobBasePath);
  console.log(`Executing node ${node.data.label || nodeId} (${node.data.type}) with input: ${JSON.stringify(nodeInput)}`);
  // Start execution time tracking
  const startTime = Date.now();

  // Execute the node job
  const nodeJobPath = path.join(INBOX, `${nodeJobId}.json`);
  fs.writeFileSync(nodeJobPath, JSON.stringify(nodeJob), 'utf8');

  // If this is a non-blocking node and we don't need to wait for the result
  if (node.data.dontWaitForOutput && !waitForResult) {
    console.log(`Started non-blocking execution for node ${node.data.label || nodeId} (${node.data.type})`);


    // Calculate execution time
    const executionTime = Date.now() - startTime;

    // Log node execution results to console
    console.log(`Non-blocking node ${node.data.label || nodeId} (${node.data.type}) completed:`);
    console.log(`Output: ${JSON.stringify(nodeInput, null, 2)}`);
    console.log('---');

    // Store result and execution time
    nodeResults[nodeId] = nodeInput;



    // Return a placeholder result immediately
    return {
      output: nodeInput,
      executionTime: executionTime,
      nonBlocking: true
    };
  }

  // For regular nodes or when we need to wait for the result
  return new Promise((resolveNode, rejectNode) => {
    // Set up timeout for regular nodes (not for dontWaitForOutput nodes)
    let timeoutId;
    if (!node.data.dontWaitForOutput && timeout > 0) {
      timeoutId = setTimeout(() => {
        console.error(`Node ${node.data.label || nodeId} execution timed out after ${timeout / 1000} seconds`);

        // Terminate the process like the stop button does
        if (runningProcesses.has(nodeJobId)) {
          console.log(`Terminating process for job ${nodeJobId} due to timeout`);
          terminateProcess(nodeJobId);

          // Create a result file indicating the process was terminated due to timeout
          const outFile = path.join(OUTBOX, `${nodeJobId}.result.json`);
          try {
            fs.writeFileSync(outFile, JSON.stringify({
              id: nodeJobId,
              output: null,
              log: "Process terminated due to timeout",
              error: `Process terminated after ${timeout / 1000} seconds timeout`,
              dontWaitForOutput: node.data.dontWaitForOutput
            }, null, 2));
          } catch (err) {
            console.error(`Error writing timeout result file: ${err.message}`);
          }
        }

        rejectNode(new Error(`Execution timed out after ${timeout / 1000} seconds`));
      }, timeout);
    }

    const checkResult = () => {
      const resultPath = path.join(OUTBOX, `${nodeJobId}.result.json`);
      if (fs.existsSync(resultPath)) {
        try {
          // Clear the timeout if it exists
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

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
          // Clear the timeout if it exists
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
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
  let { id, code, codeFilePath, type, input, dontWaitForOutput, timeout } = job;
  if (codeFilePath) {
    try {
      // Résolution absolue si codeFilePath est relatif
      let resolvedCodePath = codeFilePath;
      if (!path.isAbsolute(codeFilePath)) {
        const basePath = job.basePath;
        console.log('BasePath is :', basePath);
        resolvedCodePath = path.resolve(basePath, codeFilePath);
        codeFilePath = resolvedCodePath;
      }

      console.log(`Loading code from external file: ${resolvedCodePath}`);

      if (fs.existsSync(resolvedCodePath)) {
        code = fs.readFileSync(resolvedCodePath, 'utf8');
        console.log(`Successfully loaded code from ${resolvedCodePath}`);
      } else {
        console.warn(`Code file not found: ${resolvedCodePath}, falling back to embedded code`);
      }
    } catch (err) {
      console.error(`Error loading code from file ${codeFilePath}: ${err.message}`);
    }
  }

  // Update the job object with the loaded code
  job.code = code || '';

  console.log(`Processing job file: ${filePath} with the timeout ${job.timeout / 1000} seconds`);
  // Check if there's already a result file for this job ID
  // This could happen if the frontend tries to execute the same node multiple times
  const existingResultPath = path.join(OUTBOX, `${id}.result.json`);
  if (fs.existsSync(existingResultPath)) {
    console.log(`Job ${id} already has a result file. Skipping execution.`);
    // Clean up the duplicate job file
    fs.unlinkSync(filePath);
    return;
  }

  // Check if this is a stop signal
  const stopFilePath = path.join(INBOX, `${id}.stop`);
  if (fs.existsSync(stopFilePath)) {
    console.log(`Found stop signal for job ${id}. Terminating process.`);
    try {
      // Terminate the process
      terminateProcess(id);

      try {
        // Clean up stop signal
        cleanupStopSignal(id);

        // Create a result file indicating the process was stopped
        const outFile = path.join(OUTBOX, `${id}.result.json`);
        fs.writeFileSync(outFile, JSON.stringify({
          id,
          output: null,
          log: "Process terminated by user",
          error: "Process terminated by user",
          dontWaitForOutput
        }, null, 2));

        // Clean up input file if it exists
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (cleanupErr) {
        console.error(`Error during cleanup after termination for job ${id}: ${cleanupErr.message}`);
      }
    } catch (terminateErr) {
      console.error(`Error terminating process for job ${id}: ${terminateErr.message}`);
    }
    return;
  }

  function finish(result) {
    try {
      // Remove from running processes map if it exists
      runningProcesses.delete(id);

      // Write the result file
      const outFile = path.join(OUTBOX, `${id}.result.json`);
      fs.writeFileSync(outFile, JSON.stringify({ id, ...result, dontWaitForOutput }, null, 2));

      // Clean up input file if it exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      } else {
        console.log(`Warning: Could not find processing file to clean up: ${filePath}`);
      }
    } catch (err) {
      // Log the error but don't throw - ensure process termination continues
      console.error(`Error during job cleanup for ${id}: ${err.message}`);
    } finally {
      // Always attempt to clean up any stop signal that might exist
      // This is in a finally block to ensure it runs even if there are errors above
      try {
        cleanupStopSignal(id);
      } catch (cleanupErr) {
        console.error(`Error cleaning up stop signal for ${id}: ${cleanupErr.message}`);
      }
    }
  }

  if (type === "flow") {
    // Check if we have a codeFilePath (external file) or use embedded code
    let flowFilePath = '';
    if (codeFilePath) {
      flowFilePath = codeFilePath;
      console.log(`Using external flow file path: ${flowFilePath}`);
    } else {
      flowFilePath = code;
      console.log(`Using embedded flow path: ${flowFilePath}`);
    }

    // If the path is relative and we have a basePath, resolve it
    if (!path.isAbsolute(flowFilePath) && job.basePath) {
      console.log(`Resolving relative path: ${flowFilePath} relative to ${job.basePath}`);

      flowFilePath = path.resolve(job.basePath, flowFilePath);
      console.log(`Resolved to: ${flowFilePath}`);
    }

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
            // Pass the basePath from the job if available
            const flowResult = await executeFlowFile(
              flowFilePath,
              input,
              flowPath,
              false,
              true,
              job.basePath || path.dirname(flowFilePath),
              job.timeout || 60000 * 60 * 8
            );

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
    processGroovyNode(id, code, input, finish, codeFilePath);
  }
  else if (type === "batch") {
    processBatchNode(id, code, input, finish, codeFilePath);
  }
  else if (type === "jsbackend" || type === "playwright") {
    processJsBackendNode(id, code, input, finish, codeFilePath);
  }
  else if (type === "powershell") {
    processPowershellNode(id, code, input, finish, codeFilePath);
  }
  else {
    processJsNode(id, code, input, finish, codeFilePath);
  }
}

/**
 * Process a Groovy node
 * @param {string} id - The job ID
 * @param {string} code - The Groovy code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 * @param {string} [codeFilePath] - Optional path to external code file
 */
function processGroovyNode(id, code, input, finish, codeFilePath) {

  const tempGroovyPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.groovy`);
  const tempInputPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.input`);
  const tempOutputPath = path.join(INBOX, `node_groovy_${Date.now()}_${Math.random().toString(36).slice(2)}.output`);

  fs.writeFileSync(tempInputPath, JSON.stringify(input === undefined ? null : input), "utf8");

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
  def asJson = { obj ->
    try {
        groovy.json.JsonOutput.toJson(obj)
    } catch (e) {
        return groovy.json.JsonOutput.toJson([value: obj?.toString(), error: e.toString()])
    }
}
new File('${outputPathGroovy}').text = asJson(output)

  `.trim();

  try {
    fs.writeFileSync(tempGroovyPath, groovyCode, "utf8");
  } catch (err) {
    finish({ output: null, log: "Failed to write Groovy script: " + err.message });
    return;
  }

  const javaCmd = `java -jar "${groovyJarPath}" "${tempGroovyPath}"`;
  const process = exec(javaCmd, (error, stdout, stderr) => {
    // Unregister the process when it completes
    runningProcesses.delete(id);

    fs.unlink(tempGroovyPath, () => { });

    let outputValue = null;
    try {
      if (fs.existsSync(tempOutputPath)) {
        const rawOutput = fs.readFileSync(tempOutputPath, "utf8");
        try {
          outputValue = JSON.parse(rawOutput);
        } catch (parseErr) {
          outputValue = rawOutput; // fallback if not a valid JSON string
        }
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

  // Register the process for potential termination
  registerProcess(id, process);

  // Set up periodic check for stop signal
  const checkStopInterval = setInterval(() => {
    if (shouldStopJob(id)) {
      clearInterval(checkStopInterval);
      terminateProcess(id);
      cleanupStopSignal(id);

      finish({
        output: null,
        log: "Process terminated by user",
        error: "Process terminated by user"
      });
    }
  }, 500); // Check every 500ms

  // Clear the interval when the process exits
  process.on('exit', () => {
    clearInterval(checkStopInterval);
  });
}

/**
 * Process a Batch node
 * @param {string} id - The job ID
 * @param {string} code - The Batch code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 * @param {string} [codeFilePath] - Optional path to external code file
 */
function processBatchNode(id, code, input, finish, codeFilePath) {

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

  const process = exec(`cmd /C "${tempBatchPath}"`, (error, stdout, stderr) => {
    // Unregister the process when it completes
    runningProcesses.delete(id);

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

  // Register the process for potential termination
  registerProcess(id, process);

  // Set up periodic check for stop signal
  const checkStopInterval = setInterval(() => {
    if (shouldStopJob(id)) {
      clearInterval(checkStopInterval);
      terminateProcess(id);
      cleanupStopSignal(id);

      finish({
        output: null,
        log: "Process terminated by user",
        error: "Process terminated by user"
      });
    }
  }, 500); // Check every 500ms

  // Clear the interval when the process exits
  process.on('exit', () => {
    clearInterval(checkStopInterval);
  });
}

/**
 * Process a JS Backend node
 * @param {string} id - The job ID
 * @param {string} code - The JS code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 * @param {string} [codeFilePath] - Optional path to external code file
 */
function processJsBackendNode(id, code, input, finish, codeFilePath) {

  // Use temp files for the JS script and output
  const tempId = `node_jsbackend_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tempScriptPath = path.join(INBOX, `${tempId}.js`); // <-- always cjs for best compat
  const tempOutputPath = path.join(INBOX, `${tempId}.output`);

  if (codeFilePath) {
    let baseFolder = path.dirname(codeFilePath);
    const importRegex = /import\s+[\s\S]*?\s+from\s+['"](.+?\.(js|cjs))['"]/g;
    const rewriteImports = (code, codeFilePath) => {
      return code.replace(importRegex, (match, importPath) => {
        // Only modify relative imports (starts with ./ or ../)
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          const rewrittenPath = path.join(codeFilePath, importPath).replace(/\\/g, '/');
          return match.replace(importPath, 'file://' + rewrittenPath);
        }
        return match; // leave bare module imports untouched
      });
    };
    code = rewriteImports(code, baseFolder);
  }
  const codeWithInput = `
let output="";
const input = ${JSON.stringify(input)};
import fs from 'fs';
${code}
fs.writeFileSync(${JSON.stringify(tempOutputPath)}, JSON.stringify(output), 'utf8');
`;

  fs.writeFileSync(tempScriptPath, codeWithInput, "utf8");

  const process = exec(`${nodeExecutablePath} "${tempScriptPath}"`, { timeout: 60000 }, (error, stdout, stderr) => {
    // Unregister the process when it completes
    runningProcesses.delete(id);

    fs.unlink(tempScriptPath, () => { });
    let outputValue = null;
    try {
      if (fs.existsSync(tempOutputPath)) {
        outputValue = fs.readFileSync(tempOutputPath, "utf8");
        fs.unlinkSync(tempOutputPath);
        try { outputValue = JSON.parse(outputValue); } catch { } // decode if possible
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

  // Register the process for potential termination
  registerProcess(id, process);

  // Set up periodic check for stop signal
  const checkStopInterval = setInterval(() => {
    if (shouldStopJob(id)) {
      clearInterval(checkStopInterval);
      terminateProcess(id);
      cleanupStopSignal(id);

      finish({
        output: null,
        log: "Process terminated by user",
        error: "Process terminated by user"
      });
    }
  }, 500); // Check every 500ms

  // Clear the interval when the process exits
  process.on('exit', () => {
    clearInterval(checkStopInterval);
  });
}

/**
 * Process a PowerShell node
 * @param {string} id - The job ID
 * @param {string} code - The PowerShell code to execute
 * @param {any} input - Input data for the node
 * @param {Function} finish - Callback to finish the job
 * @param {string} [codeFilePath] - Optional path to external code file
 */
function processPowershellNode(id, code, input, finish, codeFilePath) {

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
  const process = exec(`powershell -ExecutionPolicy Bypass -File "${tempPs1Path}"`, (error, stdout, stderr) => {
    // Unregister the process when it completes
    runningProcesses.delete(id);

    fs.unlink(tempPs1Path, () => { });
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

  // Register the process for potential termination
  registerProcess(id, process);

  // Set up periodic check for stop signal
  const checkStopInterval = setInterval(() => {
    if (shouldStopJob(id)) {
      clearInterval(checkStopInterval);
      terminateProcess(id);
      cleanupStopSignal(id);

      finish({
        output: null,
        log: "Process terminated by user",
        error: "Process terminated by user"
      });
    }
  }, 500); // Check every 500ms

  // Clear the interval when the process exits
  process.on('exit', () => {
    clearInterval(checkStopInterval);
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
  let stopCheckInterval = null;

  // Set up periodic check for stop signal
  stopCheckInterval = setInterval(() => {
    if (shouldStopJob(id)) {
      clearInterval(stopCheckInterval);
      cleanupStopSignal(id);

      if (!finished) {
        finished = true;
        finish({
          output: null,
          log: "Process terminated by user",
          error: "Process terminated by user"
        });
      }
    }
  }, 500); // Check every 500ms

  try {
    const fn = new AsyncFunction(
      "input", "console",
      code + '\nreturn typeof process === "function" ? await process(input) : undefined;'
    );
    fn(input, customConsole)
      .then(output => {
        clearInterval(stopCheckInterval);
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
        clearInterval(stopCheckInterval);
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
    clearInterval(stopCheckInterval);
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
  try {
    // Get all JSON files that aren't result files
    const files = fs.readdirSync(INBOX)
      .filter(fn => fn.endsWith('.json') && !fn.endsWith('.result.json'));

    files.forEach(file => {
      try {
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
        try {
          processJobFile(processingPath);
        } catch (processErr) {
          console.error(`Error processing job file ${processingPath}: ${processErr.message}`);

          // Attempt to clean up the processing file if there was an error
          try {
            if (fs.existsSync(processingPath)) {
              fs.unlinkSync(processingPath);
              console.log(`Cleaned up processing file after error: ${processingPath}`);
            }
          } catch (cleanupErr) {
            console.error(`Failed to clean up processing file after error: ${cleanupErr.message}`);
          }
        }
      } catch (fileErr) {
        console.error(`Error handling file ${file}: ${fileErr.message}`);
      }
    });
  } catch (err) {
    console.error(`Error polling inbox directory: ${err.message}`);
  }
}

console.log("Backend file-based executor started.");
setInterval(pollInbox, 200);

// Export the executeFlowFile function for use in the main process
module.exports = {
  executeFlowFile
};
