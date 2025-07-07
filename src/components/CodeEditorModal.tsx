import React, { useState, useEffect } from 'react';
import AceEditor from 'react-ace';
import { X, FileCode, Save, ExternalLink } from 'lucide-react';
import { useFlowStore } from '../store/flowStore';
import { pathUtils } from '../utils/pathUtils';

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
  const { updateNodeData, flowPath } = useFlowStore();
  const [value, setValue] = React.useState(code);
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExternalFile, setIsExternalFile] = useState(false);
  const [externalFilePath, setExternalFilePath] = useState<string | null>(null);

  // Get the node data to check if it has a codeFilePath
  const node = useFlowStore(state => state.nodes.find(n => n.id === nodeId));
  
  useEffect(() => {
    if (node?.data.codeFilePath) {
      setIsExternalFile(true);
      setExternalFilePath(node.data.codeFilePath);
    } else {
      setIsExternalFile(false);
      setExternalFilePath(null);
    }
  }, [node]);

  const handleSave = async () => {
  try {
    // If this is an external file, update both the node data and the file
    if (isExternalFile && externalFilePath) {
      let absoluteFilePath = externalFilePath;

      if (!pathUtils.isAbsolute(externalFilePath) && flowPath) {
        const baseDir = pathUtils.dirname(flowPath);
        absoluteFilePath = pathUtils.join(baseDir, externalFilePath);
      }

      if (window.electronAPI?.writeTextFile) {
        try {
          await window.electronAPI.writeTextFile(absoluteFilePath, value);
          console.log(`Updated external code file: ${absoluteFilePath}`);
        } catch (err) {
          console.error(`Error writing to external file: ${err}`);
          setIsValid(false);
          setError(`Failed to update external file: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      }
    }

    // Always update the node data with the new code
    updateNodeData(nodeId, { code: value });
    onClose();
  } catch (err) {
    setIsValid(false);
    setError(err instanceof Error ? err.message : 'Invalid code');
  }
};


  const createExternalFile = async () => {
    if (!flowPath) {
      setError('Cannot create external file: the flow has not been saved yet');
      return;
    }

    try {
      // Create a folder with the same name as the .or file (without extension)
      const flowFileName = flowPath.split(/[\\/]/).pop() || 'flow';
      const flowFolderName = flowFileName.replace(/\.or$/, '');
      
      // Determine file extension based on node type
      let extension;
      switch (language) {
        case 'javascript':
        case 'jsbackend':
          extension = 'js';
          break;
        case 'groovy':
          extension = 'groovy';
          break;
        case 'batch':
          extension = 'bat';
          break;
        case 'powershell':
          extension = 'ps1';
          break;
        default:
          extension = 'txt';
      }

      // Create filename: {nodeId}.{extension}
      const nodeName = node?.data?.label || nodeId;
      const safeNodeName = nodeName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_'); // Sanitize filename
      const codeFileName = `${safeNodeName}.${extension}`;
      const baseDir = pathUtils.dirname(flowPath); 
      const folderPath = pathUtils.join(baseDir, flowFolderName); 
      const codeFilePath = pathUtils.join(folderPath, codeFileName); 
      // Get the absolute path using the Electron API if available
      let absoluteCodeFilePath;
      if (window.electronAPI?.getAbsolutePath) {
        absoluteCodeFilePath = window.electronAPI.getAbsolutePath(codeFilePath, flowPath);
      } else {
        // Fallback to path.join if the API is not available
        absoluteCodeFilePath = pathUtils.join(pathUtils.dirname(flowPath), codeFilePath);
      }

      // Ensure the directory exists
      if (window.electronAPI?.ensureDirectoryExists) {
        await window.electronAPI.ensureDirectoryExists(pathUtils.dirname(absoluteCodeFilePath));
      }

      // Save the code to the file
      if (window.electronAPI?.writeTextFile) {
        await window.electronAPI.writeTextFile(absoluteCodeFilePath, value);
        console.log(`Created external code file: ${absoluteCodeFilePath}`);
        
        // Update the node data to include the codeFilePath
        updateNodeData(nodeId, {
          code: value,
           codeFilePath: pathUtils.join(flowFolderName, codeFileName).replace(/\\/g, '/')
        });
        
        setIsExternalFile(true);
        setExternalFilePath(codeFilePath);
      }
    } catch (err) {
      console.error('Error creating external file:', err);
      setError(`Failed to create external file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Ace does not provide markers like Monaco, so skip handleEditorValidation

  // Choose mode for Ace (js/java)
  const aceMode = language === 'batch' ? 'batchfile' : language === 'groovy'? 'groovy' : 'javascript';
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const isSave = (isMac && e.metaKey && e.key.toLowerCase() === 's')
        || (!isMac && e.ctrlKey && e.key.toLowerCase() === 's');
      if (isSave) {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
    // Make sure to include handleSave and onClose in deps
  }, [handleSave, onClose, value, isValid]);
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-gray-900 rounded-lg w-[90vw] h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center">
            <h2 className="text-xl font-semibold text-white">Edit Code</h2>
            {isExternalFile && (
              <div className="ml-3 flex items-center bg-blue-900/50 text-blue-300 px-2 py-1 rounded text-xs">
                <ExternalLink className="w-3 h-3 mr-1" />
                External File: {externalFilePath}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {!isValid && (
              <span className="text-red-500 text-sm">{error}</span>
            )}
            {!isExternalFile && flowPath && (
              <button
                onClick={createExternalFile}
                className="flex items-center px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm"
              >
                <FileCode className="w-4 h-4 mr-1" />
                Create External File
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!isValid}
              className={`flex items-center px-4 py-2 rounded-lg ${
                isValid
                  ? 'bg-blue-500 hover:bg-blue-600'
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4 mr-1" />
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
