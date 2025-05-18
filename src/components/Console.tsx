import React from 'react';
import { useFlowStore } from '../store/flowStore';
import { Terminal, X, Trash2, Maximize2, Minimize2 } from 'lucide-react';

const Console: React.FC = () => {
  const { consoleMessages, showConsole, toggleConsole, clearConsole, nodes } = useFlowStore();
  const [fullscreen, setFullscreen] = React.useState(false);
  const consoleRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleMessages]);

  const getNodeLabel = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data?.label || nodeId;
  };

  if (!showConsole) {
    return (
      <button
        onClick={toggleConsole}
        className="fixed bottom-4 left-[5px] bg-gray-800 text-white p-2 rounded-full shadow-lg hover:bg-gray-700 transition-colors"
      >
        <Terminal className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div
      className={`
        fixed bottom-0 left-[5px] bg-gray-900 text-white shadow-lg rounded-t-lg
        transition-all duration-300 z-50
        ${fullscreen
          ? 'top-0 left-0 w-screen h-screen rounded-none'
          : 'w-full md:w-1/2 lg:w-1/3 h-auto'
        }
      `}
      style={fullscreen ? { minHeight: '100vh' } : {}}
    >
      <div className="flex items-center justify-between p-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          <span className="font-medium">Console</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="p-1 hover:bg-gray-700 rounded"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={clearConsole}
            className="p-1 hover:bg-gray-700 rounded"
            title="Clear console"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={toggleConsole}
            className="p-1 hover:bg-gray-700 rounded"
            title="Close console"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        ref={consoleRef}
        className={`overflow-y-auto p-4 font-mono text-sm transition-all duration-200 ${fullscreen ? 'h-[calc(100vh-48px)]' : 'h-64'}`}
      >
        {consoleMessages.map((msg, i) => (
          <div
            key={i}
            className={`mb-2 ${
              msg.type === 'error'
                ? 'text-red-400'
                : msg.type === 'input'
                ? 'text-blue-400'
                : msg.type === 'log'
                ? 'text-gray-400'
                : 'text-green-400'
            }`}
          >
            <span className="text-gray-500">
              [{new Date(msg.timestamp).toLocaleTimeString()}] {getNodeLabel(msg.nodeId)}:{' '}
            </span>
            <span
              dangerouslySetInnerHTML={{
                __html: msg.message.replace(/\\r\\n|\\n|\\r/g, '<br />')
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Console;
