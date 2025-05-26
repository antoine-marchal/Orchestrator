import React, { useCallback } from 'react';
import ToolbarButton from './ToolbarButton';
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
import { Save, Upload, Trash2, PlayCircle, Layout, Plus } from 'lucide-react';
import dagre from 'dagre';

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const NODE_TYPES = [
  { id: 'javascript', label: 'JavaScript', code: 'function process(input) {\n  return input;\n}' },
  { id: 'playwright', label: 'Backend JS (PlayWright)', code:
    `const { firefox } = require('playwright');

(async () => {
  const browser = await firefox.launch({ headless: true });

  const page = await browser.newPage();
  
  const result = await page.evaluate(async () => {
    const response = await fetch('https://httpbin.org/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'pikachu', type: 'electric' })
    });
    const json = await response.json();
    return json;
  });

  console.log(result);

  await browser.close();
})();
`
      },
  { id: 'groovy', label: 'Groovy', code: 'println "beginning processing with $input"\noutput= input' },
  { id: 'batch', label: 'Batch', code: 'echo Hello %INPUT% > %OUTPUT%' },
  
    { id: 'constant', label: 'Constant', value: '0' },
];

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const NODE_WIDTH = 320;
const NODE_HEIGHT = 150;
const NODE_MARGIN = 100;

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
  const { nodes, edges, setNodes, setEdges, saveFlow, loadFlow, executeFlow, panOnDrag, zoomOnScroll, clearFlow } = useFlowStore();
  const { fitView, getNodes, getEdges, project } = useReactFlow();
  const [contextMenu, setContextMenu] = React.useState<null | {
    x: number; y: number; flowX: number; flowY: number
  }>(null);
  
  const [dropdownMenu, setDropdownMenu] = React.useState(false);
  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      // we are using getNodes and getEdges helpers here
      // to make sure we create isValidConnection function only once
      const nodes = getNodes();
      const edges = getEdges();
      const target = nodes.find((node) => node.id === connection.target);
      const hasCycle = (node: Node, visited = new Set()) => {
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
  // For context menu (right-click in pane)
  const handlePaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const flowPoint = project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    });
    setContextMenu({
      x: event.clientX, // <- screen X for menu position
      y: event.clientY, // <- screen Y for menu position
      flowX: flowPoint.x, // <- if you want to use for node creation
      flowY: flowPoint.y
    });
    setDropdownMenu(false);
  }, [project]);
  

  // For Add Node button (dropdown)
  const handleAddNodeClick = () => {
    setDropdownMenu(true);
    setContextMenu(null); // close context menu if open
  };

  const closeMenus = () => {
    setContextMenu(null);
    setDropdownMenu(false);
  };

  // When clicking anywhere else, close all menus
  const handlePaneClick = () => {
    closeMenus();
  };
 
  const addNewNode = (type: string, pos?: { x: number, y: number }) => {
    const nodeType = NODE_TYPES.find(t => t.id === type);
    if (!nodeType) return;
    const uniqueLabel = getUniqueNodeLabel(nodeType.label);
    let position = pos;
  
    // If no position given, add in center of viewport
    if (!position) {
      // Get the center of the ReactFlow viewport
      const container = document.querySelector('.react-flow') as HTMLElement;
      let center;
      if (container) {
        const rect = container.getBoundingClientRect();
        center = {
          x: rect.width / 2,
          y: rect.height / 2,
        };
        position = project(center);
      } else {
        // fallback to (100,100)
        position = { x: 100, y: 100 };
      }
    }
  
    const newNode = {
      id: `node-${Date.now()}`,
      type: 'custom',
      position,
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
    closeMenus();
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
        className='react-flow__dark'
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
        onPaneContextMenu={handlePaneContextMenu}
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
  <ToolbarButton
    onClick={saveFlow}
    icon={Save}
    label="Save Flow"
    color="bg-blue-500 hover:bg-blue-600"
    title="Save Flow"
  />
  <ToolbarButton
    onClick={loadFlow}
    icon={Upload}
    label="Load Flow"
    color="bg-green-500 hover:bg-green-600"
    title="Load Flow"
  />
  <ToolbarButton
    onClick={clearFlow}
    icon={Trash2}
    label="Erase Flow"
    color="bg-red-500 hover:bg-red-600"
    title="Erase Flow"
  />
  <ToolbarButton
    onClick={executeFlow}
    icon={PlayCircle}
    label="Run Flow"
    color="bg-yellow-500 hover:bg-yellow-600"
    title="Run Flow"
  />
  <ToolbarButton
    onClick={handlePrettifyFlow}
    icon={Layout}
    label="Prettify"
    color="bg-indigo-500 hover:bg-indigo-600"
    title="Prettify"
  />

  {/* Add Node Button with Dropdown */}
  <div className="relative">
    <ToolbarButton
      onClick={handleAddNodeClick}
      icon={Plus}
      label="Add Node"
      color="bg-purple-500 hover:bg-purple-600"
      title="Add Node"
    />
    {dropdownMenu && (
      <div className="absolute right-0 mt-2 w-48 
        bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 
        rounded-lg shadow-2xl py-2 z-50"
      >
        {NODE_TYPES.map(type => (
          <button
            key={type.id}
            className="w-full text-left px-4 py-2 
              text-gray-800 dark:text-gray-100
              hover:bg-gray-100 dark:hover:bg-gray-700
              focus:bg-gray-200 dark:focus:bg-gray-600
              transition-colors"
            onClick={() => addNewNode(type.id)}
          >
            {type.label}
          </button>
        ))}
      </div>
    )}
  </div>
</Panel>
        {contextMenu && (
  <div
  className="absolute right-0 mt-2 w-48 
  bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 
  rounded-lg shadow-2xl py-2 z-50"
    style={{
      left: contextMenu.x,
      top: contextMenu.y,
      pointerEvents: 'auto'
    }}
    onClick={e => e.stopPropagation()}
  >
    {NODE_TYPES.map(type => (
      <button
        key={type.id}
        className="w-full text-left px-4 py-2 
                      text-gray-800 dark:text-gray-100
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      focus:bg-gray-200 dark:focus:bg-gray-600
                      transition-colors"
        onClick={() => addNewNode(type.id, { x: contextMenu.flowX, y: contextMenu.flowY })}
      >
        {type.label}
      </button>
    ))}
  </div>
)}

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