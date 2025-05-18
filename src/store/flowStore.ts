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
  consoleMessages: ConsoleMessage[];
  showConsole: boolean;
  editorModal: {
    isOpen: boolean;
    nodeId: string | null;
  };
  updateNodeDraggable: (nodeId: string, isDraggable: boolean) => void;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  toggleConsole: () => void;
  addConsoleMessage: (message: ConsoleMessage) => void;
  clearConsole: () => void;
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

export const useFlowStore = create<FlowState>((set, get) => ({

  nodes: [],
  edges: [],
  consoleMessages: [],
  showConsole: false,
  editorModal: {
    isOpen: false,
    nodeId: null,
  },
  nodeLoading: {},
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
  toggleConsole: () => set((state) => ({ showConsole: !state.showConsole })),
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
    const blob = new Blob([flowJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flow.or';
    a.click();
    URL.revokeObjectURL(url);
  },
  loadFlow: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.or,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          try {
            const flow = JSON.parse(content);
            set({ nodes: flow.nodes, edges: flow.edges });
          } catch (error) {
            console.error('Error loading flow:', error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
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
  executeNode: async (nodeId) => {
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
    
    
    const customConsole = {
      log: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        addLog('log', message);
      },
      error: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        addLog('error', message);
      }
    };

    try {
      let result,log;
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

        // If there's only one input, pass it directly instead of as an array
        const processedInputs = inputs.length === 1 ? inputs[0] : inputs;
        addLog('input', `Inputs: ${JSON.stringify(processedInputs)}`);

        if (node.data.code) {
          // Prepare the payload for the backend
          const payload = {
            code: node.data.code,
            type: node.data.type,
            input: processedInputs
          };

          // Call the backend API to execute the code or command
          const response = await fetch('http://localhost:3939/api/execute-node', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(`Backend error: ${response.statusText}`);
          }

          const resultData = await response.json();
          result = resultData.output;
          log = resultData.log;
        }
      }
      state.setNodeLoading(nodeId, false);
      addLog('log', `Log: ${JSON.stringify(log)}`);	
      addLog('output', `Output: ${JSON.stringify(result)}`);
      state.updateNodeData(nodeId, { output: result });
    } catch (error) {
      addLog('error', `Error: ${error instanceof Error ? error.message : String(error)}`);
      state.setNodeLoading(nodeId, false);
    }
  },
}));