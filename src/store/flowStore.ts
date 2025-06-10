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
  editorModal: {
    isOpen: boolean;
    nodeId: string | null;
  };
  flowPath?: string | null; // add this!
  setFlowPath: (path: string | null) => void;
  convertToRelativePath: (absolutePath: string, basePath: string) => string;
  convertToAbsolutePath: (relativePath: string, basePath: string) => string;
  updateNodeDraggable: (nodeId: string, isDraggable: boolean) => void;
  updatePanOnDrag: (isDraggable: boolean) => void;
  updateZoomOnScroll: (isDraggable: boolean) => void;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: any) => void;
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
  editorModal: {
    isOpen: false,
    nodeId: null,
  },
  nodeLoading: {},
  panOnDrag: true,
  flowPath: null,
  setFlowPath: (path: string | null) => set({ flowPath: path }),

  clearFlow: () => {
    set({ nodes: [], edges: [], flowPath: null });
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
  setNodes: (nodes) => set((state) => ({ 
    nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes 
  })),
  setEdges: (edges) => set((state) => ({ 
    edges: typeof edges === 'function' ? edges(state.edges) : edges 
  })),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
    })),
  updateNodeData: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      ),
    })),
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
  removeConnection: (edgeId) =>
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId)
    })),
  
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

      // Execute all input nodes first
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

    // Execute the flow starting from each end node
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
    
      // Clear previous output when executing a node
      state.updateNodeData(nodeId, { output: undefined });
      
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
              input: processedInputs
            };
            
            addLog('log', `Executing flow: ${flowPath.split(/[\\/]/).pop()}`);
            
            // Call the backend API to execute the flow
            const resultData = await (window as any).backendAPI.executeNodeJob(payload);
            
            // Process the result from the flow execution
            // The output could be any valid value, so we shouldn't filter based on string comparison
            result = resultData.output;
            log = resultData.log;
            error = resultData.error !== null && resultData.error !== 'null' ? resultData.error : null;
            
            // Ensure the node data is updated with the nested flow execution result
            state.updateNodeData(nodeId, { output: result });
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
            } catch (err) {
              console.log = originalConsoleLog;
              error = (err as Error).message;
            }
          }
           else {
            // --- FALLBACK: Use backend for Groovy/Batch etc ---
            if (node.data.code) {
              const payload = {
                id: 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                code: node.data.code,
                type: node.data.type,
                input: processedInputs
              };
              // CALL THE EXPOSED API FROM PRELOAD
              const resultData = await (window as any).backendAPI.executeNodeJob(payload);
              result = resultData.output !== '[]' ? resultData.output : null;
              log = resultData.log;
              error = resultData.error !== null && resultData.error !== 'null' ? resultData.error : null;
            }
          }
        }
        state.setNodeLoading(nodeId, false);
        if (log) addLog('log', prettyFormat(log));
        if (result !== undefined && result !== null) addLog('output', prettyFormat(result));
        if (error) addLog('error', prettyFormat(error));
        state.updateNodeData(nodeId, { output: result });
      } catch (error: any) {
        addLog('error', `Error: ${error instanceof Error ? error.message : String(error)}`);
        state.setNodeLoading(nodeId, false);
      }
    },
    
    
    

}));