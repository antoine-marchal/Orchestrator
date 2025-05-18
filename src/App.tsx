import React from 'react';
import FlowEditor from './components/FlowEditor';
import CodeEditorModal from './components/CodeEditorModal.tsx';
import { useFlowStore } from './store/flowStore';

function App() {
  const { editorModal, nodes, closeEditorModal } = useFlowStore();
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