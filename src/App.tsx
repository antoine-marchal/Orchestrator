import React, { useEffect } from 'react';
import FlowEditor from './components/FlowEditor';
import CodeEditorModal from './components/CodeEditorModal.tsx';
import { useFlowStore } from './store/flowStore';

// Make TS happy with the global
declare global {
  interface Window {
    electronAPI?: {
      onLoadFlowJson: (cb: (data: string | null) => void) => void;
    }
  }
}

function App() {
  const { editorModal, nodes, closeEditorModal, setNodes, setEdges } = useFlowStore();
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onLoadFlowJson) {
      window.electronAPI.onLoadFlowJson((data) => {
        if (data) {
          try {
            const flow = JSON.parse(data);
            setNodes(flow.nodes || []);
            setEdges(flow.edges || []);
          } catch (err) {
            alert('Error loading flow from file: ' + err);
          }
        }
      });
    }
  }, [setNodes, setEdges]);

  const node = nodes.find(n => n.id === editorModal.nodeId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <FlowEditor />
      {editorModal.isOpen && node && (
        <CodeEditorModal
          nodeId={node.id}
          code={node.data.code || ''}
          language={node.data.language || 'javascript'}
          onClose={closeEditorModal}
        />
      )}
    </div>
  );
}

export default App;
