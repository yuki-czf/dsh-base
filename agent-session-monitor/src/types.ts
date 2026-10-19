// 跨模块契约（tasks.md Interfaces 固化）
export type ToolName = 'openchamber' | 'pi-desktop' | 'zcode' | 'dsh';

export type SessionStatus =
  | 'running' | 'idle' | 'completed' | 'error' | 'cancelled'
  | 'stuck' | 'crashed' | 'blocked' | 'offline';

export type TurnStatus = 'running' | 'completed' | 'error' | 'cancelled';

export interface TurnRecord {
  turnId: string;
  status: TurnStatus;
  startedAt: number;      // epoch ms
  endedAt?: number;       // epoch ms
  tokens?: number;        // computed total
  model?: string;
  errorCode?: string;
}

export interface SessionRecord {
  tool: ToolName;
  projectId: string;
  projectName: string;
  sessionId: string;
  title: string;
  status: SessionStatus;
  startedAt: number;
  lastTurnAt: number;
  turns: TurnRecord[];
  totalTokens?: number;
  model?: string;
  lastAssistantExcerpt?: string;
  delegationDepth?: number;
}

export interface SessionDelta {
  tool: ToolName;
  sessionId: string;
  kind: 'turn-completed' | 'session-status' | 'blocked' | 'unblocked';
  from: string;
  to: string;
  record: SessionRecord;
  turn?: TurnRecord;
}

export interface AdapterHealth {
  online: boolean;
  lastPollAt: number;
  lastError?: string;
}

export interface Adapter {
  name: ToolName;
  start(): Promise<void>;
  stop(): Promise<void>;
  poll(): Promise<SessionDelta[]>;
  health(): AdapterHealth;
}

export type NotifyKind = 'turn' | 'stuck' | 'crashed' | 'digest';

export interface NotifyEvent {
  kind: NotifyKind;
  tool: ToolName;
  sessionId: string;
  projectName: string;
  title: string;
  status: string;          // completed | error | cancelled | stuck | crashed
  durationMs?: number;
  tokens?: number;
  model?: string;
  errorCode?: string;
  excerpt?: string;
  detailUrl: string;
  items?: NotifyEvent[];   // digest 合并条目
}
