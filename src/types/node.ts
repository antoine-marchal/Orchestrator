import { Node, Edge } from 'reactflow';

export interface NodeData {
  label: string;
  type: 'constant' | 'javascript' | 'jsbackend' | 'groovy' | 'batch' | 'powershell' | 'flow' | 'comment';
  language?: string;
  code?: string;
  codeFilePath?: string; // Path to the external code file
  value?: string;
  input?: any;
  output?: any;
  executionTime?: number; // Execution time in milliseconds
  isRelativePath?: boolean; // Indicates if the path stored in code is relative
  isStarterNode?: boolean; // Indicates if this node is the starter node for flow execution
  dontWaitForOutput?: boolean; // Indicates if execution should continue without waiting for this node's output
  jobId?: string; // The ID of the job when the node is executing
}

export interface ConnectionItemProps {
  id: string;
  label: string;
  onRemove: () => void;
}

export interface NodeDimensions {
  width: number;
  height: number;
}

export interface EdgeConnection {
  id: string;
  source: string;
  target: string;
}

export type NodeType = Node<NodeData>;
export type EdgeType = Edge;