import React, { memo, useRef, useLayoutEffect, useState } from 'react';
import { NodeResizer, NodeProps } from 'reactflow';
import { Trash2 } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';

const MIN_HEIGHT = 64;

const CommentNode = ({ data, id, selected }: NodeProps) => {
  const { removeNode, updateNodeData, updateNodeDraggable, updatePanOnDrag } = useFlowStore();
  const [editing, setEditing] = useState(false);

  useLayoutEffect(() => {
    updateNodeDraggable(id, !editing);
    updatePanOnDrag(!editing);
    return () => {
      updateNodeDraggable(id, true);
      updatePanOnDrag(true);
    };
  }, [editing, id, updateNodeDraggable, updatePanOnDrag]);

  return (
    <div
      className="relative border border-yellow-400 bg-yellow-100/80 dark:bg-yellow-800/70 rounded-2xl shadow-md"
      style={{
        minWidth: 180,
        minHeight: MIN_HEIGHT,
        width: 'auto',
        boxShadow: '0 0 0 2px #fde68a30',
        display: 'flex',
        flexDirection: 'column',
        height: '100%', // allow resizer to set height
      }}
    >
      <NodeResizer
        color="#eab308"
        isVisible={selected}
        minWidth={180}
        minHeight={MIN_HEIGHT}
        handleStyle={{
          zIndex: 20,
        }}
      />
      <div className="flex justify-end pt-2 pr-2">
        <button
          onClick={() => removeNode(id)}
          className="p-1 rounded-full hover:bg-yellow-200/60 dark:hover:bg-yellow-900"
          tabIndex={-1}
          title="Delete comment"
        >
          <Trash2 className="w-3 h-3 text-yellow-700 dark:text-yellow-200" />
        </button>
      </div>
      {/* FLEX-1 makes this fill the remaining space */}
      <div className="flex-1 flex flex-col px-4 pb-3">
        <textarea
          className="w-full h-full flex-1 bg-transparent text-yellow-900 dark:text-yellow-100 font-medium resize-none border-none focus:ring-0 focus:outline-none"
          placeholder="Add your comment…"
          value={data.value || ''}
          onChange={e => updateNodeData(id, { value: e.target.value })}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onMouseEnter={() => { updateNodeDraggable(id, false); updatePanOnDrag(false); }}
          onMouseLeave={() => { if (!editing) { updateNodeDraggable(id, true); updatePanOnDrag(true); } }}
          rows={2}
          style={{
            minHeight: '30px',
            height: '100%',
            maxHeight: '100%',
          }}
        />
      </div>
    </div>
  );
};

export default memo(CommentNode);
