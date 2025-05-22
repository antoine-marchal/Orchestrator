import React, { useState } from 'react';
import AceEditor from 'react-ace';
import { X } from 'lucide-react';
import { useFlowStore } from '../store/flowStore';

// Import Ace Editor modes & themes
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/theme-monokai'; // or another you like
import 'ace-builds/src-noconflict/ext-language_tools';
import 'ace-builds/src-noconflict/mode-groovy';
import 'ace-builds/src-noconflict/mode-batchfile';
import 'ace-builds/src-noconflict/theme-dracula';

interface CodeEditorModalProps {
  nodeId: string;
  code: string;
  language: string;
  onClose: () => void;
}

const CodeEditorModal: React.FC<CodeEditorModalProps> = ({
  nodeId,
  code,
  language,
  onClose,
}) => {
  const { updateNodeData } = useFlowStore();
  const [value, setValue] = React.useState(code);
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      // Basic syntax validation
      if (language === 'javascript') {
        new Function(value);
      }
      updateNodeData(nodeId, { code: value });
      onClose();
    } catch (err) {
      setIsValid(false);
      setError(err instanceof Error ? err.message : 'Invalid code');
    }
  };

  // Ace does not provide markers like Monaco, so skip handleEditorValidation

  // Choose mode for Ace (js/java)
  const aceMode = language === 'batch' ? 'batchfile' : language === 'groovy'? 'groovy' : language;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-gray-900 rounded-lg w-[90vw] h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Edit Code</h2>
          <div className="flex items-center gap-4">
            {!isValid && (
              <span className="text-red-500 text-sm">{error}</span>
            )}
            <button
              onClick={handleSave}
              disabled={!isValid}
              className={`px-4 py-2 rounded-lg ${
                isValid
                  ? 'bg-blue-500 hover:bg-blue-600'
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <AceEditor
            mode={aceMode}
            theme="dracula"
            name="code-editor"
            width="100%"
            height="100%"
            fontSize={14}
            value={value}
            onChange={(val) => setValue(val ?? '')}
            setOptions={{
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              showLineNumbers: true,
              tabSize: 2,
              useWorker: false, // Ace's built-in worker is often not needed for Electron, but can be enabled for syntax checking
              wrap: true,
            }}
            editorProps={{ $blockScrolling: true }}
          />
        </div>
      </div>
    </div>
  );
};

export default CodeEditorModal;
