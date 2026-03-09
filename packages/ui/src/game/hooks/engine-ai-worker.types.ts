import type { AIPlayerConfig, AITurnContext, AIDiagnostics } from '@hh/ai';
import type { GameCommand, GameState } from '@hh/types';

export interface EngineAIWorkerRequest {
  requestId: number;
  stateKey: string;
  state: GameState;
  config: AIPlayerConfig;
  context: AITurnContext;
}

export interface EngineAIWorkerResponse {
  requestId: number;
  stateKey: string;
  command: GameCommand | null;
  context: AITurnContext;
  diagnostics: AIDiagnostics | null;
  error: string | null;
}
