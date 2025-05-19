import React, { useCallback} from 'react';
import ReactFlow, {
  Background,
  MiniMap,
  Panel,
  NodeTypes,
  OnNodesChange,
  OnEdgesChange,
  Connection,
  getOutgoers,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  IsValidConnection,
  Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useFlowStore } from '../store/flowStore';
import CustomNode from './node/CustomNode';
import Console from './Console';
import { Plus, Save, Upload, PlayCircle, Layout } from 'lucide-react';
import dagre from 'dagre';

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const NODE_TYPES = [
  { id: 'javascript', label: 'JavaScript', code: 'function process(input) {\n  return input;\n}' },
  { id: 'groovy', label: 'Groovy', code: 'println "beginning processing with $input"\noutput= input' },
  { id: 'batch', label: 'Batch', code: 'echo Hello %INPUT% > %OUTPUT%' },
  { id: 'constant', label: 'Constant', value: '0' },
];

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const NODE_WIDTH = 320;
const NODE_HEIGHT = 150;
const NODE_MARGIN = 150;

const getLayoutedElements = (nodes: Node[], edges: any[], direction = 'LR') => {
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: NODE_MARGIN,
    ranksep: NODE_MARGIN * 1.5,
    marginx: NODE_MARGIN,
    marginy: NODE_MARGIN,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  });
 
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: node.width,
      height: node.height,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - ((node.width || NODE_WIDTH) / 2),
        y: nodeWithPosition.y - ((node.height || NODE_HEIGHT) / 2),
        
      },
    };
  });

  return layoutedNodes;
};

function Flow() {
  const { nodes, edges, setNodes, setEdges, saveFlow, loadFlow, executeFlow,panOnDrag,zoomOnScroll } = useFlowStore();
  const [showNodeMenu, setShowNodeMenu] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState({ x: 0, y: 0 });
  const { fitView, getNodes, getEdges } = useReactFlow();
 
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      // we are using getNodes and getEdges helpers here
      // to make sure we create isValidConnection function only once
      const nodes = getNodes();
      const edges = getEdges();
      const target = nodes.find((node) => node.id === connection.target);
      const hasCycle = (node:Node, visited = new Set()) => {
        if (visited.has(node.id)) return false;
 
        visited.add(node.id);
 
        for (const outgoer of getOutgoers(node, nodes, edges)) {
          if (outgoer.id === connection.source) return true;
          if (hasCycle(outgoer, visited)) return true;
        }
      };
      if (!target) return false; 
      if (target.id === connection.source) return false;
      return !hasCycle(target);
    },
    [getNodes, getEdges],
  );
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, id: `e${Date.now()}` }, eds)),
    [setEdges]
  );

  const getUniqueNodeLabel = (baseLabel: string) => {
    const existingLabels = nodes.map(node => node.data.label);
    let counter = 1;
    let newLabel = baseLabel;
    
    while (existingLabels.includes(newLabel)) {
      newLabel = `${baseLabel} ${counter}`;
      counter++;
    }
    
    return newLabel;
  };

  const addNewNode = (type: string) => {
    const nodeType = NODE_TYPES.find(t => t.id === type);
    if (!nodeType) return;

    const uniqueLabel = getUniqueNodeLabel(nodeType.label);
    const newNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      position: { x: menuPosition.x, y: menuPosition.y },
      data: { 
        label: uniqueLabel,
        type: type,
        language: type === 'constant' ? undefined : type,
        code: type === 'constant' ? undefined : nodeType.code,
        value: type === 'constant' ? nodeType.value : undefined,
      },
      draggable: true,
    };
    setNodes((nds) => [...nds, newNode]);
    setShowNodeMenu(false);
  };

  const handlePaneClick = () => {
    setShowNodeMenu(false);
  };

  const handleAddNodeClick = () => {
    setMenuPosition({ x: 100, y: 100 });
    setShowNodeMenu(true);
  };

  const handlePrettifyFlow = () => {
    const layoutedNodes = getLayoutedElements(nodes, edges);
    setNodes([...layoutedNodes]);
    setTimeout(() => {
      fitView({ 
        padding: 0.2,
        duration: 800,
        minZoom: 0.5,
        maxZoom: 1.5,
      });
    }, 50);
  };
  
  return (
    <div className="w-full" style={{ height: 'calc(100vh)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        deleteKeyCode="Delete"
        onPaneClick={handlePaneClick}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        panOnDrag={panOnDrag}
        panOnScroll={false}
        zoomOnScroll={zoomOnScroll}
        zoomOnPinch={true}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#64748b', strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        
        <MiniMap 
          nodeColor={(node) => {
            return node.data.type === 'constant' ? '#9333ea' : '#3b82f6';
          }}
        />
        <Panel position="top-right" className="flex gap-2">
          <button
            onClick={saveFlow}
            className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Save className="w-5 h-5" />
            Save Flow
          </button>
          <button
            onClick={loadFlow}
            className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
          >
            <Upload className="w-5 h-5" />
            Load Flow
          </button>
          <button
            onClick={executeFlow}
            className="flex items-center gap-2 bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 transition-colors"
          >
            <PlayCircle className="w-5 h-5" />
            Run Flow
          </button>
          <button
            onClick={handlePrettifyFlow}
            className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors"
          >
            <Layout className="w-5 h-5" />
            Prettify
          </button>
          <div className="relative">
            <button
              onClick={handleAddNodeClick}
              className="flex items-center gap-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Node
            </button>
            {showNodeMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-2 z-50">
                {NODE_TYPES.map(type => (
                  <button
                    key={type.id}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => addNewNode(type.id)}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>
      <Console />
    </div>
  );
}

export default function FlowEditor() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}