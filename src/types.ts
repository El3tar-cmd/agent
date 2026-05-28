export interface WorkspaceFile {
  name: string;
  ext: string;
  role: 'pkg' | 'tsconfig' | 'readme' | 'env' | 'entry' | 'code' | 'config' | 'doc' | 'style' | 'test' | 'file';
  size: number;
  path: string;
}

export interface WorkspaceNode {
  name: string;
  type: 'dir' | 'file';
  skipped?: boolean;
  children?: WorkspaceNode[];
  files?: WorkspaceFile[];
  depth: number;
}

export type AgentEventType =
  | 'user_msg'
  | 'start'
  | 'iter'
  | 'thinking'
  | 'thought'
  | 'action'
  | 'result'
  | 'bad_json'
  | 'done'
  | 'error'
  | 'timeout'
  | 'permission'
  | 'warn';

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  ts: number;
  task?: string;
  model?: string;
  root?: string;
  n?: number;
  max?: number;
  content?: string;
  tool?: string;
  params?: any;
  output?: string;
  truncated?: boolean;
  error?: boolean;
  message?: string;
  raw?: string;
  attempt?: number;
}

export interface AgentSession {
  id: string;
  label: string;
  events: AgentEvent[];
  ts: number;
}

export interface SlashCommand {
  c: string;
  i: string;
  d: string;
  actionType: 'map' | 'scan' | 'prompt';
  promptText?: string;
}

export interface WorkspaceStats {
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  roles: Record<string, number>;
}

export interface WorkspaceIndex {
  rootPath: string;
  generatedAt: string;
  summary: string;
  stats: WorkspaceStats;
  entryPoints: string[];
  importantFiles: string[];
  importGraph: Array<{
    file: string;
    imports: string[];
  }>;
  frameworkHints: string[];
  tree: WorkspaceNode | null;
}
