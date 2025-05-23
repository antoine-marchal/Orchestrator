import React from "react";
import { NodeData } from '../../types/node';
import { useFlowStore } from '../../store/flowStore';

interface NodeBodyProps {
  data: NodeData;
  nodeId: string;
  isEditing: boolean;
  onCodeChange: (value: string | undefined) => void;
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export const NodeBody: React.FC<NodeBodyProps> = ({
  data,
  nodeId,
  expanded,
  setExpanded
}) => {
  if (data.type === 'constant') {
    return null;
  }
  const { updateZoomOnScroll, updatePanOnDrag, updateNodeDraggable } = useFlowStore();
  return (
    <div className="flex-1 overflow-hidden p-4 border-b border-gray-700" onMouseEnter={() => {
      updateNodeDraggable(nodeId, false),
        updatePanOnDrag(false),
        updateZoomOnScroll(false)
    }}
      onMouseLeave={() => {
        updateNodeDraggable(nodeId, true),
          updatePanOnDrag(true),
          updateZoomOnScroll(true)
      }}>

<div className="text-sm text-gray-400 space-y-2 relative">
  {data.output !== undefined && (
    <>
      <div
        className={
          "bg-gray-900 text-green-400 text-xs p-2 font-mono whitespace-pre-wrap w-full break-words " +
          (expanded ? "max-h-[80vh]" : "max-h-64") +
          " overflow-y-auto select-text"
        }
      >
        Output: <br />
        {typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2)}
      </div>
      <button
        className="absolute right-5 top-0 bg-gray-900  rounded hover:bg-gray-800"
        onClick={() => { setExpanded((e) => !e); }}
        aria-label={expanded ? "Collapse output" : "Expand output"}
      >
        {expanded ? "🔼" : "🔽"}
      </button>
    </>
  )}
</div>
    </div>
  );
};