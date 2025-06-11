import { Node, Edge } from 'reactflow';

export interface NodeData {
  label: string;
  type: 'constant' | 'javascript' | 'jsbackend' | 'groovy' | 'batch' | 'powershell' | 'flow' | 'comment';
  language?: string;
  code?: string;
  value?: string;
  input?: any;
  output?: any;
  executionTime?: number; // Execution time in milliseconds
  isRelativePath?: boolean; // Indicates if the path stored in code is relative
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