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

  const getNodeLabel = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data?.label || nodeId;
  };

  const inputEdges = edges.filter(edge => edge.target === id);
  const outputEdges = edges.filter(edge => edge.source === id);
  const [minHeight, setMinHeight] = useState(148);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (contentRef.current) {
      setMinHeight(contentRef.current.offsetHeight);
    }
  }, [data, isEditing]);

  return (
    <div className={`relative bg-gray-800 h-full rounded-lg ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <div
        ref={contentRef}
        className={`flex flex-col transition-all duration-200 ${isLoading ? 'blur-sm pointer-events-none select-none' : ''}`}
      >
        <NodeResizer
          color="#00000000"
          isVisible={selected}
          minWidth={200}
          minHeight={minHeight}
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
          isEditing={isEditing}
          onCodeChange={(value) => value && updateNodeData(id, { code: value })}
        />
        <NodeFooter
          nodeId={id}
          type={data.type}
          inputEdges={inputEdges}
          outputEdges={outputEdges}
          getNodeLabel={getNodeLabel}
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
