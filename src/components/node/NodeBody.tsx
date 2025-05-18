import React from 'react';
import MonacoEditor from '@monaco-editor/react';
import { NodeData } from '../../types/node';

interface NodeBodyProps {
  data: NodeData;
  isEditing: boolean;
  onCodeChange: (value: string | undefined) => void;
}

export const NodeBody: React.FC<NodeBodyProps> = ({
  data
}) => {
  if (data.type === 'constant') {
    return null;
  }

  return (
    <div className="flex-1 overflow-hidden p-4 border-b border-gray-700">
      
        <div className="text-sm text-gray-400 space-y-2">
       {data.output !== undefined && (
          <div className="bg-gray-900 text-green-400 text-xs p-2 font-mono whitespace-pre-wrap w-full break-words">
            Output: <br/>{typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2)}
          </div>
        )}
        </div>
      </div>
  );
};