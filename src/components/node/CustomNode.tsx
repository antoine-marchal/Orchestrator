import React, { memo, useState, useRef, useEffect } from 'react';
import { NodeResizer, NodeProps } from 'reactflow';
import { useFlowStore } from '../../store/flowStore';
import { NodeHeader } from './NodeHeader';
import { NodeBody } from './NodeBody';
import { NodeFooter } from './NodeFooter';
import { Loader2 } from 'lucide-react';

const CustomNode = ({ data, id, selected }: NodeProps) => {
  const { updateNodeData, executeNode, edges, removeNode, nodes, nodeLoading } = useFlowStore();
  const isLoading = nodeLoading?.[id];

  const [expanded, setExpanded] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const getNodeLabel = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data?.label || nodeId;
  };

  const inputEdges = edges.filter(edge => edge.target === id);
  const outputEdges = edges.filter(edge => edge.source === id);

  const contentRef = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState(148);
  const [maxHeight, setMaxHeight] = useState(10000);

  // 🔁 Use ResizeObserver for accurate and performant height tracking
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const height = entry.contentRect.height;
      setMinHeight(height);
      setMaxHeight(height);
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      className={`relative ${data.type === 'flow' ? 'bg-emerald-900' : 'bg-gray-800'} rounded-lg ${
        selected
          ? data.type === 'flow'
            ? 'ring-2 ring-emerald-500'
            : 'ring-2 ring-blue-500'
          : ''
      }`}
    >
      <div
        ref={contentRef}
        className={`flex flex-col transition-[height] duration-200 ${
          isLoading ? 'opacity-50 pointer-events-none select-none' : ''
        }`}
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
          isEditing={false}
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
          isEditing={false}
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
