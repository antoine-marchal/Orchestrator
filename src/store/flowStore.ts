import { create } from 'zustand';
import { Node, Edge } from 'reactflow';
import path from 'path';

interface ConsoleMessage {
  nodeId: string;
  type: 'input' | 'output' | 'error' | 'log';
  message: string;
  timestamp: number;
}

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  nodeLoading: { [key: string]: boolean };
  panOnDrag : boolean;
  zoomOnScroll : boolean;
  consoleMessages: ConsoleMessage[];
  showConsole: boolean;
  fullscreen: boolean;
  nodeExecutionTimeout: number;
  isOutputZoneActive: boolean;
  isTitleEditing: boolean;
  isMouseOverConsole: boolean;
  editorModal: {
    isOpen: boolean;
    nodeId: string | null;
  };
  flowPath?: string | null; // add this!
  // Flow history tracking
  history: Array<{ nodes: Node[]; edges: Edge[] }>;
  historyIndex: number;
  maxHistorySize: number;
  starterNodeId: string | null;
  setFlowPath: (path: string | null) => void;
  setNodeExecutionTimeout: (timeout: number) => void;
  convertToRelativePath: (absolutePath: string, basePath: string) => string;
  convertToAbsolutePath: (relativePath: string, basePath: string) => string;
  setOutputZoneActive: (active: boolean) => void;
  setTitleEditing: (editing: boolean) => void;
  setMouseOverConsole: (isOver: boolean) => void;
  setStarterNode: (nodeId: string) => void;
  updateNodeDraggable: (nodeId: string, isDraggable: boolean) => void;
  updatePanOnDrag: (isDraggable: boolean) => void;
  updateZoomOnScroll: (isDraggable: boolean) => void;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: any, addHistory?: boolean) => void;
  toggleConsole: () => void;
  setFullscreen: () => void;
  addConsoleMessage: (message: ConsoleMessage) => void;
  clearConsole: () => void;
  clearFlow: () => void;
  executeNode: (nodeId: string) => void;
  executeFlow: () => void;
  executeFlowFile: (flowFilePath: string, input?: any) => Promise<any>;
  saveFlow: () => void;
  loadFlow: () => void;
  removeConnection: (edgeId: string) => void;
  moveConnection: (nodeId: string, type: 'input' | 'output', edgeId: string, direction: 'up' | 'down') => void;
  openEditorModal: (nodeId: string) => void;
  closeEditorModal: () => void;
  setNodeLoading: (nodeId: string, loading: boolean) => void;
  clearAllOutputs: () => void;
  // History navigation
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
  addToHistory: () => void;
  // Copy/Paste functionality
  copySelectedNodes: (nodeIds: string[]) => void;
  pasteNodes: () => void;
  getClipboardNodes: () => Node[] | null;
  clearNodeSelection: (nodes : Node[]) => void;
}
function prettyFormat(val: any): string {
  if (val == null) return '';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  if (typeof val === 'string') {
    // Try to pretty-print if string looks like JSON
    try {
      const parsed = JSON.parse(val);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return val;
    }
  }
  return String(val);
}

export const useFlowStore = create<FlowState>((set, get) => ({

  nodes: [],
  edges: [],
  consoleMessages: [],
  showConsole: false,
  fullscreen: false,
  nodeExecutionTimeout: 30000, // Default timeout: 30 seconds
  editorModal: {
    isOpen: false,
    nodeId: null,
  },
  nodeLoading: {},
  panOnDrag: true,
  flowPath: null,
  isOutputZoneActive: false,
  isTitleEditing: false,
  isMouseOverConsole: false,
  // History state
  history: [],
  historyIndex: -1,
  maxHistorySize: 100,
  starterNodeId: null,
  setFlowPath: (path: string | null) => set({ flowPath: path }),
  setNodeExecutionTimeout: (timeout: number) => set({ nodeExecutionTimeout: timeout }),
  setOutputZoneActive: (active: boolean) => set({ isOutputZoneActive: active }),
  setTitleEditing: (editing: boolean) => set({ isTitleEditing: editing }),
  setMouseOverConsole: (isOver: boolean) => set({ isMouseOverConsole: isOver }),
  
  // Set a node as the starter node for flow execution
  setStarterNode: (nodeId: string) => {
    const { nodes, starterNodeId } = get();
    
    // Add current state to history before making changes
    get().addToHistory();
    
    // If the clicked node is already the starter, unset it
    if (starterNodeId === nodeId) {
      set({ starterNodeId: null });
      
      // Update all nodes to remove the starter flag
      set((state) => ({
        nodes: state.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            isStarterNode: false
          }
        }))
      }));
    } else {
      // Set the new starter node
      set({ starterNodeId: nodeId });
      
      // Update all nodes to set the starter flag only on the selected node
      set((state) => ({
        nodes: state.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            isStarterNode: node.id === nodeId
          }
        }))
      }));
    }
  },

  // History management functions
  canUndo: () => {
    const { historyIndex } = get();
    return historyIndex > 0;
  },
  
  canRedo: () => {
    const { historyIndex, history } = get();
    return historyIndex < history.length - 1;
  },
  
  addToHistory: () => {
    const { nodes, edges, history, historyIndex, maxHistorySize } = get();
    
    // Create a deep copy of the current state
    const currentState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges))
    };
    
    // If we're not at the end of the history, truncate the future states
    const newHistory = historyIndex < history.length - 1
      ? history.slice(0, historyIndex + 1)
      : [...history];
    
    // Add the current state to history
    newHistory.push(currentState);
    
    // If history exceeds max size, remove oldest entries
    if (newHistory.length > maxHistorySize) {
      newHistory.shift();
    }
    
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  },
  
  undo: () => {
    const { history, historyIndex } = get();
    
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      set({
        nodes: prevState.nodes,
        edges: prevState.edges,
        historyIndex: historyIndex - 1
      });
    }
  },
  
  redo: () => {
    const { history, historyIndex } = get();
    
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      set({
        nodes: nextState.nodes,
        edges: nextState.edges,
        historyIndex: historyIndex + 1
      });
    }
  },
  
  // Clipboard functionality
  copySelectedNodes: (nodeIds: string[]) => {
    const { nodes, edges } = get();
    
    // Get the selected nodes
    const selectedNodes = nodes.filter(node => nodeIds.includes(node.id));
    
    // Get edges between selected nodes
    const selectedEdges = edges.filter(
      edge => nodeIds.includes(edge.source) && nodeIds.includes(edge.target)
    );
    
    // Store in localStorage (as a simple clipboard)
    if (selectedNodes.length > 0) {
      const clipboardData = {
        nodes: selectedNodes,
        edges: selectedEdges,
        timestamp: Date.now()
      };
      localStorage.setItem('orchestrator-clipboard', JSON.stringify(clipboardData));
    }
  },
  
  getClipboardNodes: () => {
    try {
      const clipboardData = localStorage.getItem('orchestrator-clipboard');
      if (!clipboardData) return null;
      
      return JSON.parse(clipboardData).nodes;
    } catch (error) {
      console.error('Error reading clipboard:', error);
      return null;
    }
  },
  
  pasteNodes: () => {
    try {
      const clipboardJson = localStorage.getItem('orchestrator-clipboard');
      if (!clipboardJson) return;
      
      const clipboard = JSON.parse(clipboardJson);
      const { nodes, edges } = get();
      
      // Create a mapping of old node IDs to new node IDs
      const idMapping: Record<string, string> = {};
      
      // Create new nodes with new IDs
      const newNodes = clipboard.nodes.map((node: Node) => {
        const newId = `node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        idMapping[node.id] = newId;
        
        // Offset position slightly to make it clear these are new nodes
        const position = {
          x: node.position.x + 150,
          y: node.position.y + 150
        };
        
        return {
          ...node,
          id: newId,
          position,
          data: {
            ...node.data,
            label: `${node.data.label} (copy)`
          },
          selected: true // Ensure new nodes are not selected
        };
      });
      
      // Create new edges with updated source/target IDs
      const newEdges = clipboard.edges.map((edge: Edge) => {
        return {
          ...edge,
          id: `e${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          source: idMapping[edge.source],
          target: idMapping[edge.target]
        };
      });
      
      // Add the new nodes and edges to the flow
      set({
        nodes: [...nodes, ...newNodes],
        edges: [...edges, ...newEdges]
      });
      
      // Add this change to history
      get().addToHistory();
      
      // Clear selection after paste
      
      get().clearNodeSelection(clipboard.nodes);
      
    } catch (error) {
      console.error('Error pasting nodes:', error);
    }
  },
  
  // Helper function to clear node selection
  clearNodeSelection: (targetedNodes: Node[]) => {
  const targetedIds = new Set(targetedNodes.map(n => n.id));
  set((state) => ({
    nodes: state.nodes.map(node => ({
      ...node,
      selected: targetedIds.has(node.id) ? false : node.selected
    }))
  }));
},


  clearFlow: () => {
    set({
      nodes: [],
      edges: [],
      flowPath: null,
      // Reset history when clearing the flow
      history: [],
      historyIndex: -1
    });
    window.electronAPI?.setTitle?.('default'); // Triggers reset to versioned title
  },
  
  updatePanOnDrag: (isDraggable) => set((state) => ({
    panOnDrag: isDraggable
  })),
  zoomOnScroll: true,
  updateZoomOnScroll: (isDraggable) => set((state) => ({
    zoomOnScroll: isDraggable
  })),
  setNodeLoading: (nodeId, loading) =>
    set((state) => ({
      nodeLoading: {
        ...state.nodeLoading,
        [nodeId]: loading,
      },
    })),
  updateNodeDraggable: (nodeId, isDraggable) => set((state) => ({
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? { ...node, draggable: isDraggable } : node
    ),
  })),
  setNodes: (nodes, addHistory = true) => {
    // Add current state to history before making changes (if addHistory is true)
    if (addHistory) {
      get().addToHistory();
    }
    
    set((state) => ({
      nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes
    }));
  },
  
  setEdges: (edges) => {
    // Add current state to history before making changes
    get().addToHistory();
    
    set((state) => ({
      edges: typeof edges === 'function' ? edges(state.edges) : edges
    }));
  },
  
  addNode: (node) => {
    // Add current state to history before making changes
    get().addToHistory();
    
    set((state) => ({ nodes: [...state.nodes, node] }));
  },
  removeNode: (nodeId) => {
    // Add current state to history before making changes
    get().addToHistory();
    
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
    }));
  },
  updateNodeData: (nodeId, data, addHistory = true) => {
    // Add current state to history before making changes (if addHistory is true)
    if (addHistory) {
      get().addToHistory();
    }
    
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      ),
    }));
  },
  toggleConsole: () => {set((state) => ({ 
    showConsole: !state.showConsole,
    fullscreen : false }))},
    setFullscreen: () => {set((state) => ({
      fullscreen: !state.fullscreen
    }))},
  addConsoleMessage: (message) => 
    set((state) => ({ 
      consoleMessages: [...state.consoleMessages, message],
      showConsole: true
    })),
  clearConsole: () => set({ consoleMessages: [] }),
  clearAllOutputs: () => set((state) => ({
    nodes: state.nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        output: undefined
      }
    }))
  })),
  removeConnection: (edgeId) => {
    // Add current state to history before making changes
    get().addToHistory();
    
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId)
    }));
  },
  
  openEditorModal: (nodeId) =>
    set({ editorModal: { isOpen: true, nodeId } }),
  closeEditorModal: () =>
    set({ editorModal: { isOpen: false, nodeId: null } }),
  
  // Utility function to convert absolute path to relative path
  convertToRelativePath: (absolutePath: string, basePath: string) => {
    if (!absolutePath || !basePath) return absolutePath;
    
    try {
      // Get directory of the base path
      const baseDir = path.dirname(basePath);
      
      // Convert absolute path to relative path
      const relativePath = path.relative(baseDir, absolutePath);
      
      // Return the relative path with forward slashes for consistency
      return relativePath.replace(/\\/g, '/');
    } catch (error) {
      console.error('Error converting to relative path:', error);
      return absolutePath;
    }
  },
  
  // Utility function to convert relative path to absolute path
  convertToAbsolutePath: (relativePath: string, basePath: string) => {
    if (!relativePath || !basePath) return relativePath;
    
    try {
      // Check if the path is already absolute
      if (path.isAbsolute(relativePath)) {
        return relativePath;
      }
      
      // Get directory of the base path
      const baseDir = path.dirname(basePath);
      
      // Convert relative path to absolute path
      return path.resolve(baseDir, relativePath);
    } catch (error) {
      console.error('Error converting to absolute path:', error);
      return relativePath;
    }
  },
  
  saveFlow: async () => {
    const state = get();
    
    // Create a deep copy of nodes to avoid modifying the original nodes
    let nodesToSave = JSON.parse(JSON.stringify(state.nodes));
    
    // If we have a flow path, convert all flow node paths to relative paths
    if (state.flowPath) {
      nodesToSave = nodesToSave.map((node: Node) => {
        if (node.data.type === 'flow' && node.data.code) {
          // Skip if already a relative path
          if (node.data.isRelativePath) {
            return node;
          }
          
          // Convert absolute path to relative path
          const relativePath = get().convertToRelativePath(node.data.code, state.flowPath || '');
          
          return {
            ...node,
            data: {
              ...node.data,
              code: relativePath,
              isRelativePath: true
            }
          };
        }
        return node;
      });
    }
    
    const flow = { nodes: nodesToSave, edges: state.edges };
    const flowJson = JSON.stringify(flow, null, 2);
  
    try {
      if (state.flowPath && window.electronAPI?.saveFlowToPath) {
        await window.electronAPI.saveFlowToPath(state.flowPath, flowJson);
        // After saving, update the nodes in the store with relative paths
        if (JSON.stringify(nodesToSave) !== JSON.stringify(state.nodes)) {
          set({ nodes: nodesToSave });
        }
      } else if (window.electronAPI?.saveFlowAs) {
        // Use Electron Save As
        const filePath = await window.electronAPI.saveFlowAs(flowJson);
        if (filePath) {
          get().setFlowPath(filePath);
          const fileName = filePath.split(/[\\/]/).pop();
          if (fileName) window.electronAPI?.setTitle?.(fileName);
          
          // After saving for the first time, convert any absolute paths to relative
          // and update the nodes in the store
          const updatedNodes = state.nodes.map((node: Node) => {
            if (node.data.type === 'flow' && node.data.code && !node.data.isRelativePath) {
              const relativePath = get().convertToRelativePath(node.data.code, filePath);
              
              return {
                ...node,
                data: {
                  ...node.data,
                  code: relativePath,
                  isRelativePath: true
                }
              };
            }
            return node;
          });
          
          set({ nodes: updatedNodes });
        }
      } else {
        // fallback: browser download (cannot get path!)
        const blob = new Blob([flowJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'flow.or';
        a.click();
        URL.revokeObjectURL(url);
        if (window.electronAPI?.setTitle) window.electronAPI.setTitle('flow.or');
      }
    } catch (error) {
      console.error('Error saving flow:', error);
      alert(`Error saving flow: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  loadFlow: async () => {
    if (window.electronAPI?.openFlowFile) {
      const result = await window.electronAPI.openFlowFile();
      if (result && result.data) {
        try {
          const flow = JSON.parse(result.data);
          
          // Convert relative paths to absolute paths for flow nodes
          const nodes = flow.nodes.map((node: Node) => {
            if (node.data.type === 'flow' && node.data.code && node.data.isRelativePath) {
              // Convert relative path to absolute path
              const absolutePath = get().convertToAbsolutePath(node.data.code, result.filePath);
              
              return {
                ...node,
                data: {
                  ...node.data,
                  code: absolutePath,
                  // Keep isRelativePath flag so we know to convert back when saving
                  isRelativePath: true
                }
              };
            }
            return node;
          });
          
          set({ nodes, edges: flow.edges });
          get().setFlowPath(result.filePath);
          const fileName = result.filePath.split(/[\\/]/).pop();
          if(fileName)window.electronAPI?.setTitle?.(fileName);
        } catch (error) {
          console.error('Error loading flow:', error);
        }
      }
    }
  },
  
  executeFlowFile: async (flowFilePath: string, input?: any) => {
    try {
      if (window.backendAPI?.executeFlowFile) {
        return await window.backendAPI.executeFlowFile(flowFilePath, input);
      } else {
        throw new Error('Backend API not available');
      }
    } catch (error) {
      console.error('Error executing flow file:', error);
      throw error;
    }
  },
  
  executeFlow: async () => {
    const state = get();
    const visited = new Set<string>();
    const executed = new Set<string>();
    
    
    const executeNodeInFlow = async (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
 

      // Execute all input nodes first, but only if they're valid to execute
      const inputEdges = state.edges.filter(e => e.target === nodeId);
      for (const edge of inputEdges) {
        await executeNodeInFlow(edge.source);
      }

      if (!executed.has(nodeId)) {
        await state.executeNode(nodeId);
        executed.add(nodeId);
      }
    };
    
    // Find all end nodes (nodes with no outgoing edges)
    const endNodes = state.nodes.filter(node =>
      !state.edges.some(edge => edge.source === node.id)
    );
    

      // No starter node, execute the flow normally starting from each end node
      for (const node of endNodes) {
        await executeNodeInFlow(node.id);
      }
    
  },
  moveConnection: (nodeId, type, edgeId, direction) =>
    set((state) => {
      const relevantEdges = state.edges.filter(edge => 
        type === 'input' ? edge.target === nodeId : edge.source === nodeId
      );
      const currentIndex = relevantEdges.findIndex(e => e.id === edgeId);
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (newIndex < 0 || newIndex >= relevantEdges.length) {
        return state;
      }

      const reorderedEdges = [...relevantEdges];
      [reorderedEdges[currentIndex], reorderedEdges[newIndex]] = 
      [reorderedEdges[newIndex], reorderedEdges[currentIndex]];

      const otherEdges = state.edges.filter(edge => 
        type === 'input' ? edge.target !== nodeId : edge.source !== nodeId
      );

      return {
        edges: [...otherEdges, ...reorderedEdges]
      };
    }),


    executeNode: async (nodeId: string) => {
      const state = get();
      state.setNodeLoading(nodeId, true);
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return;
    
      // We don't clear previous output anymore to preserve it during execution
      // The output will be updated with new results when execution completes
      
      const addLog = (type: ConsoleMessage['type'], message: string) => {
        state.addConsoleMessage({
          nodeId,
          type,
          message,
          timestamp: Date.now(),
        });
      };
      
      
      try {
        let result: any, log: any, error: any;
    
        if (node.data.type === 'constant') {
          result = node.data.value;
        } else if (node.data.type === 'flow') {
          // For flow nodes, we execute the referenced flow file using the backend poller
          try {
            // Start execution time tracking
            const startTime = Date.now();
            
            // The code property contains the path to the flow file
            let flowPath = node.data.code;
            if (!flowPath) {
              throw new Error('No flow file specified');
            }
            
            // If the path is relative, convert it to absolute for execution
            if (node.data.isRelativePath && state.flowPath) {
              flowPath = get().convertToAbsolutePath(flowPath, state.flowPath);
            } else if (node.data.isRelativePath) {
              // If we have a relative path but no flowPath, we can't resolve it
              throw new Error('Cannot resolve relative path: flow file has not been saved');
            }
            
            addLog('log', `Loading flow from: ${flowPath}`);
            
            // Find input nodes and sort them by connection order
            const inputEdges = state.edges.filter(e => e.target === nodeId);
            const inputNodes = inputEdges
              .map(e => state.nodes.find(n => n.id === e.source))
              .filter((n): n is Node => n !== undefined);
      
            // Get input values from connected nodes
            const inputs = await Promise.all(inputNodes.map(async (inputNode) => {
              if (inputNode.data.type === 'constant') {
                return inputNode.data.value;
              }
              return inputNode.data.output;
            }));
            const processedInputs = inputs.length === 1 ? inputs[0] : inputs;
            if (inputs.length > 0) {
              addLog('input', prettyFormat(processedInputs));
            }
            
            // Create a payload for the backend poller
            const payload = {
              id: 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2),
              code: flowPath,
              type: 'flow',
              input: processedInputs,
              timeout: get().nodeExecutionTimeout
            };
            
            addLog('log', `Executing flow: ${flowPath.split(/[\\/]/).pop()}`);
            
            // Call the backend API to execute the flow
            const resultData = await (window as any).backendAPI.executeNodeJob(payload);
            
            // Process the result from the flow execution
            // The output could be any valid value, so we shouldn't filter based on string comparison
            result = resultData.output;
            
            // Get execution time if available (will be used later)
            
            // Process logs from nested flow execution
            // These logs will include the [Nested] prefix added by the backend
            log = resultData.log;
            
            // If we have logs from nested flow execution, process them to display properly
            if (log && typeof log === 'string' && log.includes('[Nested]')) {
              // Split the log by lines to process each nested log entry
              const logLines = log.split('\n');
              
              // Process each line of the log
              logLines.forEach(line => {
                if (line.includes('[Nested]')) {
                  // Extract the nested log message
                  const nestedLogMessage = line.substring(line.indexOf('[Nested]') + 9).trim();
                  
                  // Determine if it's an error or regular log
                  if (nestedLogMessage.startsWith('ERROR:')) {
                    // It's an error log from a nested node
                    const errorMessage = nestedLogMessage.substring(7).trim();
                    addLog('error', `Nested: ${errorMessage}`);
                  } else {
                    // It's a regular log from a nested node
                    addLog('log', `Nested: ${nestedLogMessage}`);
                  }
                }
              });
            }
            
            error = resultData.error !== null && resultData.error !== 'null' ? resultData.error : null;
            
            // Calculate execution time - use the one from backend if available, otherwise calculate locally
            const executionTime = resultData.executionTime || (Date.now() - startTime);
            
            // Store execution time in node data
            node.data.executionTime = executionTime;
            
            // Ensure the node data is updated with the nested flow execution result
            state.updateNodeData(nodeId, { output: result, executionTime });
          } catch (err) {
            error = (err as Error).message;
          }
        } else {
          // Find input nodes and sort them by connection order
          const inputEdges = state.edges.filter(e => e.target === nodeId);
          const inputNodes = inputEdges
            .map(e => state.nodes.find(n => n.id === e.source))
            .filter((n): n is Node => n !== undefined);
    
          // Get input values from connected nodes
          const inputs = await Promise.all(inputNodes.map(async (inputNode) => {
            if (inputNode.data.type === 'constant') {
              return inputNode.data.value;
            }
            return inputNode.data.output;
          }));
          const processedInputs = inputs.length === 1 ? inputs[0] : inputs;
          if (inputs.length > 0) {
            addLog('input', prettyFormat(processedInputs));
          }
          const originalConsoleLog = console.log;
          // --- NEW: Run JS directly if language is javascript ---
          if (node.data.language === 'javascript') {
            try {
              // Start execution time tracking
              const startTime = Date.now();
              
              let code = node.data.code?.trim() || '';
              let fn;
              if (/^function\s*\w*\s*\(/.test(code)) {
                fn = new Function(`${code}; return process(arguments[0]);`);
              } else {
                fn = new Function('input', code.includes('return') ? code : `return (${code})`);
              }
              const logBuffer: any[] = [];
              console.log = (...args) => {
                args.forEach(arg => addLog('log', prettyFormat(arg)));
                logBuffer.push(args);
              };
              result = fn(processedInputs);
              console.log = originalConsoleLog;
              
              // Calculate execution time
              const executionTime = Date.now() - startTime;
              
              // Store execution time in node data
              // We'll update the execution time when we update the output
              node.data.executionTime = executionTime;
            } catch (err) {
              console.log = originalConsoleLog;
              error = (err as Error).message;
            }
          }
           else {
            // --- FALLBACK: Use backend for Groovy/Batch etc ---
            if (node.data.code) {
              // Start execution time tracking
              const startTime = Date.now();
              
              const payload = {
                id: 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                code: node.data.code,
                type: node.data.type,
                input: processedInputs,
                timeout: get().nodeExecutionTimeout
              };
              // CALL THE EXPOSED API FROM PRELOAD
              const resultData = await (window as any).backendAPI.executeNodeJob(payload);
              result = resultData.output !== '[]' ? resultData.output : null;
              log = resultData.log;
              error = resultData.error !== null && resultData.error !== 'null' ? resultData.error : null;
              
              // Calculate execution time
              const executionTime = resultData.executionTime || (Date.now() - startTime);
              
              // Store execution time in node data
              node.data.executionTime = executionTime;
            }
          }
        }
        state.setNodeLoading(nodeId, false);
        if (log) addLog('log', prettyFormat(log));
        if (result !== undefined && result !== null && typeof result === 'object' && 'output' in result) addLog('output', prettyFormat(result.output));
        else if (result !== undefined && result !== null) addLog('output', prettyFormat(result));
        if (error) addLog('error', prettyFormat(error));
        
        // Update node data with result
        state.updateNodeData(nodeId, { output: result });
      } catch (error: any) {
        addLog('error', `Error: ${error instanceof Error ? error.message : String(error)}`);
        state.setNodeLoading(nodeId, false);
      }
    },
    
    
    

}));