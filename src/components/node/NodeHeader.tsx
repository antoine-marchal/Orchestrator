import React from 'react';
import { Code2, Hash, Edit2, Play, Trash2 } from 'lucide-react';
import { NodeData } from '../../types/node';
import { useFlowStore } from '../../store/flowStore';

interface NodeHeaderProps {
  data: NodeData;
  nodeId: string;
  onLabelChange: (label: string) => void;
  onValueChange?: (value: string) => void;
  onExecute: () => void;
  onDelete: () => void;
}

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  data,
  nodeId,
  onLabelChange,
  onValueChange,
  onExecute,
  onDelete,
}) => {
  const { openEditorModal,updateNodeDraggable } = useFlowStore();

  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-700">
      <div className="flex items-center gap-2">
        {data.type === 'constant' ? (
          <Hash className="w-5 h-5 text-purple-500 flex-shrink-0" />
        ) : (
          <Code2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
        )}
        <input
          type="text"
          value={data.label}
          onChange={(e) => onLabelChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          onMouseEnter={() => updateNodeDraggable(nodeId, false)}
          onMouseLeave={() => updateNodeDraggable(nodeId, true)}
          className="font-semibold text-white bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 w-full"
        />
      </div>
      <div className="flex items-center gap-2">
        {data.type === 'constant' && onValueChange && (
          <input
            type="text"
            value={data.value || ''}
            onChange={(e) => onValueChange(e.target.value)}
            className="text-sm bg-gray-700 border-none rounded px-2 py-1 text-white w-24"
            placeholder="Value..."
            onMouseEnter={() => updateNodeDraggable(nodeId, false)}
          onMouseLeave={() => updateNodeDraggable(nodeId, true)}
          onFocus={(e) => e.target.select()}
          />
        )}
        {data.type !== 'constant' && (
          <button 
            className="p-1 hover:bg-gray-700 rounded"
            onClick={() => openEditorModal(nodeId)}
            
          >
            <Edit2 className="w-4 h-4 text-blue-500" />
          </button>
        )}
        <button 
          className="p-1 hover:bg-gray-700 rounded"
          onClick={onExecute}
        >
          <Play className="w-4 h-4 text-green-500" />
        </button>
        <button 
          className="p-1 hover:bg-gray-700 rounded"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>
    </div>
  );
};