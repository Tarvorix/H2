/// <reference lib="webworker" />

import {
  generateNextCommand,
  getTurnContextDiagnostics,
  getTurnContextError,
} from '@hh/ai';
import type { EngineAIWorkerRequest, EngineAIWorkerResponse } from './engine-ai-worker.types';

const workerContext = self as DedicatedWorkerGlobalScope;

workerContext.onmessage = (event: MessageEvent<EngineAIWorkerRequest>) => {
  const { requestId, stateKey, state, config, context } = event.data;

  try {
    const command = generateNextCommand(state, config, context);
    const response: EngineAIWorkerResponse = {
      requestId,
      stateKey,
      command,
      context,
      diagnostics: getTurnContextDiagnostics(context),
      error: getTurnContextError(context),
    };
    workerContext.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: EngineAIWorkerResponse = {
      requestId,
      stateKey,
      command: null,
      context,
      diagnostics: getTurnContextDiagnostics(context),
      error: message,
    };
    workerContext.postMessage(response);
  }
};

export {};
