import React, { memo } from 'react';
import { NodeProps } from 'reactflow';
import { StickyNote } from 'lucide-react'; // or any nice icon

const CommentNode = memo(({ data, id, selected }: NodeProps) => {
  // Only allow editing the comment (not connections)
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(data.value);

  React.useEffect(() => {
    setValue(data.value);
  }, [data.value]);

  // Optionally: Add update logic if you want the comment to be saved in state
  // But here, we just make it editable inline:
  return (
    <div
      className={`
        relative
        bg-yellow-100 dark:bg-yellow-300/20 border-2 border-yellow-400/70
        shadow-lg rounded-xl
        min-w-[160px] max-w-[320px] px-4 py-3
        flex flex-col items-start
        ${selected ? 'ring-2 ring-yellow-500/80' : ''}
      `}
      style={{
        pointerEvents: 'auto',
        userSelect: 'auto',
        minHeight: '80px',
        fontFamily: 'monospace',
        fontSize: '1rem',
      }}
      onDoubleClick={() => setEditing(true)}
    >
      <div className="flex items-center gap-2 mb-1 text-yellow-700 dark:text-yellow-100">
        <StickyNote className="w-5 h-5 opacity-70" />
        <span className="font-bold">{data.label}</span>
      </div>
      {editing ? (
        <textarea
          className="w-full bg-transparent border border-yellow-300 rounded p-1 mt-1 text-sm text-yellow-800 dark:text-yellow-100 focus:outline-yellow-400"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            // Save to state
            if (value !== data.value && typeof window !== 'undefined') {
              // Find the zustand store and update node data
              const store = require('../../store/flowStore');
              store.useFlowStore.getState().updateNodeData(id, { value });
            }
          }}
          autoFocus
          rows={3}
        />
      ) : (
        <div
          className="whitespace-pre-line break-words text-sm text-yellow-900 dark:text-yellow-50 opacity-95"
          onClick={() => setEditing(true)}
        >
          {value || <span className="italic text-yellow-400/70">Double-click to add comment</span>}
        </div>
      )}
    </div>
  );
});

export default CommentNode;
