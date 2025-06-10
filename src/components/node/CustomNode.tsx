import React, { memo, useState, useLayoutEffect, useRef } from 'react';
import { NodeResizer, NodeProps } from 'reactflow';
import { useFlowStore } from '../../store/flowStore';
import { NodeHeader } from './NodeHeader';
import { NodeBody } from './NodeBody';
import { NodeFooter } from './NodeFooter';
import { Loader2 } from 'lucide-react';

const CustomNode = ({ data, id, selected }: NodeProps) => {
  // Access flow store actions and state
  const { updateNodeData, executeNode, edges, removeNode, nodes, nodeLoading } = useFlowStore();
  const isLoading = nodeLoading?.[id];
  const [isEditing] = React.useState(false);
  const [expanded, setExpanded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const getNodeLabel = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data?.label || nodeId;
  };

  const inputEdges = edges.filter(edge => edge.target === id);
  const outputEdges = edges.filter(edge => edge.source === id);
  const [minHeight, setMinHeight] = useState(148);
  const [maxHeight, setMaxHeight] = useState(10000);
  const [nodeHeight, setNodeHeight] = useState(148);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (contentRef.current) {
      setMinHeight(contentRef.current.offsetHeight);
      setMaxHeight(contentRef.current.offsetHeight);
      setNodeHeight(contentRef.current.offsetHeight);
    }
  }, [data, isEditing, expanded, connecting, inputEdges.length, outputEdges.length]);

  return (
    <div className={`relative ${data.type === 'flow' ? 'bg-emerald-900/80' : 'bg-gray-800'} rounded-lg ${
      selected
        ? data.type === 'flow'
          ? 'ring-2 ring-emerald-500'
          : 'ring-2 ring-blue-500'
        : ''
    }`} style={{ height: nodeHeight }}>
      <div
        ref={contentRef}
        className={`flex flex-col transition-all duration-200 ${isLoading ? 'blur-sm pointer-events-none select-none' : ''}`}
      >
        <NodeResizer
          color="#00000000"
          isVisible={selected}
          minWidth={200}
          minHeight={minHeight}
          maxHeight={maxHeight}
        />
        <NodeHeader
          data={data}
          nodeId={id}
          onLabelChange={(label) => updateNodeData(id, { label })}
          onValueChange={(value) => updateNodeData(id, { value })}
          onExecute={() => executeNode(id)}
          onDelete={() => removeNode(id)}
        />
        <NodeBody
          data={data}
          nodeId={id}
          isEditing={isEditing}
          onCodeChange={(value) => value && updateNodeData(id, { code: value })}
          setExpanded={setExpanded}
          expanded={expanded}
        />
        <NodeFooter
          nodeId={id}
          type={data.type}
          inputEdges={inputEdges}
          outputEdges={outputEdges}
          getNodeLabel={getNodeLabel}
          isEditing={isEditing}
          setConnecting={setConnecting}
        />
      </div>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20 rounded-lg">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
        </div>
      )}
    </div>
  );
};

export default memo(CustomNode);
