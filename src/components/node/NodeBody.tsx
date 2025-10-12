import React, { useRef, useEffect, useCallback, memo } from "react";
import { NodeData } from '../../types/node';
import { useFlowStore } from '../../store/flowStore';


// Function to format execution time in seconds or minutes
const formatExecutionTime = (timeMs: number): string => {
  if (timeMs < 60000) {
    // Less than a minute, show in seconds
    return `${(timeMs / 1000).toFixed(1)} sec`;
  } else {
    // More than a minute, show in minutes
    return `${(timeMs / 60000).toFixed(1)} min`;
  }
};

interface NodeBodyProps {
  data: NodeData;
  nodeId: string;
  isEditing: boolean;
  onCodeChange: (value: string | undefined) => void;
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export const NodeBody: React.FC<NodeBodyProps> = memo(({
  data,
  nodeId,
  expanded,
  setExpanded
}) => {
  const { updateZoomOnScroll, updatePanOnDrag, updateNodeDraggable, setOutputZoneActive } = useFlowStore();
  const outputRef = useRef<HTMLDivElement>(null);

  // Memoize event handlers to prevent recreating them on each render
  const handleMouseEnter = useCallback(() => {
    updateNodeDraggable(nodeId, false);
    updatePanOnDrag(false);
    updateZoomOnScroll(false);
    setOutputZoneActive(true);
  }, [nodeId, updateNodeDraggable, updatePanOnDrag, updateZoomOnScroll, setOutputZoneActive]);

  const handleMouseLeave = useCallback(() => {
    updateNodeDraggable(nodeId, true);
    updatePanOnDrag(true);
    updateZoomOnScroll(true);
    setOutputZoneActive(false);
  }, [nodeId, updateNodeDraggable, updatePanOnDrag, updateZoomOnScroll, setOutputZoneActive]);

  // Handle wheel events with proper passive: false option
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Stop propagation to prevent parent components from scrolling
      e.stopPropagation();

      // Manually scroll the div based on the wheel delta
      const target = e.currentTarget as HTMLDivElement;
      target.scrollTop += e.deltaY;
    };

    // Add wheel event listeners to the output elements when they exist
    const currentOutputRef = outputRef.current;
    if (currentOutputRef) {
      currentOutputRef.addEventListener('wheel', handleWheel, { passive: false });
    }

    // Clean up the event listener when component unmounts
    return () => {
      if (currentOutputRef) {
        currentOutputRef.removeEventListener('wheel', handleWheel);
      }
    };
  }, []); // Only run once on mount
  if (data.type === 'constant') {
    return null;
  }

  // Special handling for flow nodes
  if (data.type === 'flow') {
    const flowPath = data.code || '';


    return (
      <div
        className="flex-1 overflow-hidden p-4 border-b border-gray-400"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="text-sm text-gray-400 space-y-2 relative">
          <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded p-2 border border-emerald-700/30">
            <div className="text-emerald-800 dark:text-emerald-400 text-xs font-mono mb-1">Flow File:</div>
            <div className="text-emerald-600 dark:text-emerald-300 text-xs font-mono truncate">{flowPath}</div>
          </div>

          {data.output !== undefined && (
            <>
              <div
                ref={outputRef}
                className={
                  "bg-emerald-100 text-emerald-600 dark:bg-gray-900 dark:text-green-400 text-xs p-2 font-mono whitespace-pre-wrap w-full break-words " +
                  (expanded ? "max-h-[80vh]" : "max-h-64") +
                  " overflow-y-auto select-text"
                }
                key={`flow-output-${nodeId}`} // Stable key to prevent unnecessary re-renders
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onMouseUp={(e) => {
                  // This is crucial for preserving text selection
                  e.stopPropagation();

                  // Prevent the default behavior which might clear selection
                  if (window.getSelection()?.toString()) {
                    e.preventDefault();
                  }
                }}
                onWheel={(e) => {
                  // Just stop propagation without preventDefault to avoid the passive listener warning
                  e.stopPropagation();

                  // Manually scroll - this works as a fallback if the useEffect approach fails
                  const div = e.currentTarget;
                  div.scrollTop += e.deltaY;
                }}
              >
                {data.executionTime !== undefined ? (
                  <>
                    Output ({formatExecutionTime(data.executionTime)}): <br />
                  </>
                ) : (
                  <>
                    Output: <br />
                  </>
                )}
                {/* For flow nodes, only display the output property if it exists */}
                {typeof data.output === 'object' && data.output !== null && 'output' in data.output
                  ? typeof data.output.output === 'string'
                    ? data.output.output
                    : JSON.stringify(data.output.output, null, 2)
                  : typeof data.output === 'string'
                    ? data.output
                    : JSON.stringify(data.output, null, 2)
                }
              </div>
              <button
                className="absolute right-5 top-0 dark:bg-gray-900 rounded hover:bg-gray-300 dark:hover:bg-gray-800"
                onClick={() => {
                  setExpanded((e) => !e);
                  // Force parent component to recalculate height after expansion toggle
                  setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                  }, 10);
                }}
                aria-label={expanded ? "Collapse output" : "Expand output"}
              >
                {expanded ? "🔼" : "🔽"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
  // Flow store functions are already destructured at the top of the component

  // Goto node UI
  if (data.type === 'goto') {
    const { nodes, updateNodeData } = useFlowStore();

    // 1) Local working copy (prevents store writes on each keystroke)
    const [localConds, setLocalConds] = React.useState<Array<{ expr: string; goto: string }>>(
      Array.isArray(data.conditions) ? data.conditions : []
    );

    // 2) If the incoming data.conditions changes externally, refresh local state
    React.useEffect(() => {
      setLocalConds(Array.isArray(data.conditions) ? data.conditions : []);
    }, [nodeId, data.conditions]);

    const selectableTargets = nodes
      .filter(n => n.data?.type !== 'comment' && n.data?.type !== 'goto')
      .map(n => ({ id: n.id, label: n.data?.label || n.id }));

    const updateLocal = (idx: number, patch: Partial<{ expr: string; goto: string }>) => {
      setLocalConds(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    };

    // 3) Commit a single row on blur (or commit all—your choice)
    const commitRow = (idx: number) => {
      const next = localConds;
      updateNodeData(nodeId, { conditions: next });
    };

    const addCondition = () => {
      setLocalConds(prev => [...prev, { expr: '', goto: '' }]);
      // optionally also commit here, or wait until blur
    };

    const removeCondition = (idx: number) => {
      setLocalConds(prev => prev.filter((_, i) => i !== idx));
      // commit removal immediately (or wait until blur)
      const next = localConds.filter((_, i) => i !== idx);
      updateNodeData(nodeId, { conditions: next });
    };

    return (
      <div className="px-3 py-2 text-xs text-gray-800 dark:text-gray-200 space-y-2 flex-1 overflow-hidden p-4 border-b border-gray-400">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
          Goto Conditions (JS)
        </div>

        <div className="space-y-3">
          {localConds.map((cond, i) => (
            <div key={i} className="rounded bg-gray-200 dark:bg-gray-800 p-2 space-y-2 border border-gray-400 dark:border-gray-700">
              <label className="block text-[10px] text-gray-800 dark:text-gray-400">Condition</label>
              <input
                value={cond.expr}
                onChange={(e) => updateLocal(i, { expr: e.target.value })}
                onBlur={() => commitRow(i)}
                placeholder="e.g. input.value &lt; 50"
                className="w-full text-xs bg-gray-100 dark:bg-gray-900 border border-gray-400 dark:border-gray-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              />

              <label className="block text-[10px] text-gray-800 dark:text-gray-400">Goto Node</label>
              <select
                value={cond.goto}
                onChange={(e) => updateLocal(i, { goto: e.target.value })}
                onBlur={() => commitRow(i)}
                className="w-full text-xs bg-gray-100 dark:bg-gray-900 border border-gray-400 dark:border-gray-700  rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{'(none selected)'}</option>
                {selectableTargets.map(n => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>

              <div className="flex justify-end">
                <button
                  onClick={() => removeCondition(i)}
                  className="text-[10px] px-2 py-1 bg-gray-300 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 rounded"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addCondition}
          className="text-[10px] px-2 py-1 bg-gray-200 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 rounded"
        >
          + Add Condition
        </button>
      </div>
    );
  }


  return (
    <div
      className="flex-1 overflow-hidden p-4 border-b border-gray-400"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >

      <div className="text-sm text-gray-400 space-y-2 relative">

        {data.output !== undefined && (
          <>
            <div
              ref={outputRef}
              className={
                "bg-gray-200 dark:bg-gray-900 text-green-700 dark:text-green-400 text-xs p-2 font-mono whitespace-pre-wrap w-full break-words " +
                (expanded ? "max-h-[80vh]" : "max-h-64") +
                " overflow-y-auto select-text"
              }
              key={`output-${nodeId}`} // Stable key to prevent unnecessary re-renders
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                // This is crucial for preserving text selection
                e.stopPropagation();

                // Prevent the default behavior which might clear selection
                if (window.getSelection()?.toString()) {
                  e.preventDefault();
                }
              }}
              onWheel={(e) => {
                // Just stop propagation without preventDefault to avoid the passive listener warning
                e.stopPropagation();

                // Manually scroll - this works as a fallback if the useEffect approach fails
                const div = e.currentTarget;
                div.scrollTop += e.deltaY;
              }}
            >
              {data.executionTime !== undefined ? (
                <>
                  Output ({formatExecutionTime(data.executionTime)}): <br />
                </>
              ) : (
                <>
                  Output: <br />
                </>
              )}
              {/* For regular nodes, display output in the same way as flow nodes */}
              {typeof data.output === 'object' && data.output !== null && 'output' in data.output
                ? typeof data.output.output === 'string'
                  ? data.output.output
                  : JSON.stringify(data.output.output, null, 2)
                : typeof data.output === 'string'
                  ? data.output
                  : JSON.stringify(data.output, null, 2)
              }
            </div>
            <button
              className="absolute right-5 top-0 dark:bg-gray-900 rounded hover:bg-gray-300 dark:hover:bg-gray-800"
              onClick={() => {
                setExpanded((e) => !e);
                // Force parent component to recalculate height after expansion toggle
                setTimeout(() => {
                  window.dispatchEvent(new Event('resize'));
                }, 10);
              }}
              aria-label={expanded ? "Collapse output" : "Expand output"}
            >
              {expanded ? "🔼" : "🔽"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  const prevConds = JSON.stringify(prev.data?.conditions ?? []);
  const nextConds = JSON.stringify(next.data?.conditions ?? []);

  return (
    prev.nodeId === next.nodeId &&
    prev.expanded === next.expanded &&
    prev.data?.output === next.data?.output &&
    prevConds === nextConds
  );
});
