import { create } from 'zustand';
import { Node, Edge } from 'reactflow';

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
  
  saveFlow: () => {
    const state = get();
    const flow = {
      nodes: state.nodes,
      edges: state.edges
    };
    const flowJson = JSON.stringify(flow, null, 2);
  
    if (state.flowPath && window.electronAPI?.saveFlowToPath) {
      // Ask Electron main to save the file directly (safer than fs in renderer)
      window.electronAPI.saveFlowToPath(state.flowPath, flowJson);
    } else {
      // fallback: download as .or file
      const blob = new Blob([flowJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flow.or';
      a.click();
      URL.revokeObjectURL(url);
    }
  },
  
  loadFlow: async () => {
    if (window.electronAPI?.openFlowFile) {
      const result = await window.electronAPI.openFlowFile();
      if (result && result.data) {
        try {
          const flow = JSON.parse(result.data);
          set({ nodes: flow.nodes, edges: flow.edges });
          get().setFlowPath(result.filePath);
          const fileName = result.filePath.split(/[\\/]/).pop();
          if(fileName)window.electronAPI?.setTitle?.(fileName);
        } catch (error) {
          console.error('Error loading flow:', error);
        }
      }
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