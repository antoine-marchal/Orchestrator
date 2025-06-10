import { Node, Edge } from 'reactflow';

export interface NodeData {
  label: string;
  type: 'constant' | 'javascript' | 'groovy' | 'flow';
  language?: string;
  code?: string;
  value?: string;
  input?: any;
  output?: any;
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