import React, { useRef, useEffect } from "react";
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

export const NodeBody: React.FC<NodeBodyProps> = ({
  data,
  nodeId,
  expanded,
  setExpanded
}) => {
  const { updateZoomOnScroll, updatePanOnDrag, updateNodeDraggable } = useFlowStore();
  const outputRef = useRef<HTMLDivElement>(null);
  
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
  }, [outputRef.current]); // Re-run when the ref changes
  if (data.type === 'constant') {
    return null;
  }
  
  // Special handling for flow nodes
  if (data.type === 'flow') {
    const flowPath = data.code || '';
    const fileName = flowPath.split(/[\\/]/).pop() || 'Unknown flow';
    
    return (
      <div className="flex-1 overflow-hidden p-4 border-b border-gray-700" onMouseEnter={() => {
        updateNodeDraggable(nodeId, false);
        updatePanOnDrag(false);
        updateZoomOnScroll(false);
        useFlowStore.getState().setOutputZoneActive(true);
      }}
        onMouseLeave={() => {
          updateNodeDraggable(nodeId, true);
          updatePanOnDrag(true);
          updateZoomOnScroll(true);
          useFlowStore.getState().setOutputZoneActive(false);
        }}>
        <div className="text-sm text-gray-400 space-y-2 relative">
          <div className="bg-emerald-900/30 rounded p-2 border border-emerald-700/30">
            <div className="text-emerald-400 text-xs font-mono mb-1">Flow File:</div>
            <div className="text-emerald-300 text-xs font-mono truncate">{flowPath}</div>
          </div>
          
          {data.output !== undefined && (
            <>
              <div
                ref={outputRef}
                className={
                  "bg-gray-900 text-green-400 text-xs p-2 font-mono whitespace-pre-wrap w-full break-words " +
                  (expanded ? "max-h-[80vh]" : "max-h-64") +
                  " overflow-y-auto select-text"
                }
                key={`flow-output-${nodeId}-${Date.now()}`} // Force re-render when output changes
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
                className="absolute right-5 top-0 bg-gray-900 rounded hover:bg-gray-800"
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
  return (
    <div className="flex-1 overflow-hidden p-4 border-b border-gray-700" onMouseEnter={() => {
      updateNodeDraggable(nodeId, false);
      updatePanOnDrag(false);
      updateZoomOnScroll(false);
      useFlowStore.getState().setOutputZoneActive(true);
    }}
      onMouseLeave={() => {
        updateNodeDraggable(nodeId, true);
        updatePanOnDrag(true);
        updateZoomOnScroll(true);
        useFlowStore.getState().setOutputZoneActive(false);
      }}>

<div className="text-sm text-gray-400 space-y-2 relative">
  {data.output !== undefined && (
    <>
      <div
        ref={outputRef}
        className={
          "bg-gray-900 text-green-400 text-xs p-2 font-mono whitespace-pre-wrap w-full break-words " +
          (expanded ? "max-h-[80vh]" : "max-h-64") +
          " overflow-y-auto select-text"
        }
        key={`output-${nodeId}-${Date.now()}`} // Force re-render when output changes
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
        className="absolute right-5 top-0 bg-gray-900 rounded hover:bg-gray-800"
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
};