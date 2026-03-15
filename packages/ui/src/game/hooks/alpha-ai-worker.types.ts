import type { AIPlayerConfig, AITurnContext, AIDiagnostics } from '@hh/ai';
import type { GameCommand, GameState } from '@hh/types';

export interface AlphaAIWorkerRequest {
  requestId: number;
  stateKey: string;
  state: GameState;
  config: AIPlayerConfig;
  context: AITurnContext;
}

export interface AlphaAIWorkerResponse {
  requestId: number;
  stateKey: string;
  command: GameCommand | null;
  context: AITurnContext;
  diagnostics: AIDiagnostics | null;
  error: string | null;
}
