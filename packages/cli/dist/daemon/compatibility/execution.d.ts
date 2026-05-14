import * as http from 'node:http';
import { type ExecutionSource } from '../runtime/execution-bus';
type FailureOptions = {
    code?: string;
    retriable?: boolean;
    details?: Record<string, unknown> | null;
};
type CompatibilityDispatchMode = 'explicit-compatibility-route' | 'legacy-generic-route';
export interface CompatibilityExecutionHandlerContext {
    readBody(req: http.IncomingMessage): Promise<string>;
    success(res: http.ServerResponse, data: unknown): void;
    failure(res: http.ServerResponse, error: string, status?: number, options?: FailureOptions): void;
    toSource(req: http.IncomingMessage): ExecutionSource;
    toActor(req: http.IncomingMessage): string;
}
type ExecuteBody = {
    type?: unknown;
    target?: unknown;
    intentText?: unknown;
    reverify?: unknown;
    ciMode?: unknown;
    evidenceDir?: unknown;
    dedupeWindowMs?: unknown;
    workspaceId?: unknown;
    repositoryIds?: unknown;
};
export declare function createCompatibilityExecutionHandlers(context: CompatibilityExecutionHandlerContext): {
    handleExecute(req: http.IncomingMessage, res: http.ServerResponse, options?: {
        dispatchMode?: CompatibilityDispatchMode;
    }): Promise<void>;
    handleExecuteBody(req: http.IncomingMessage, res: http.ServerResponse, body: ExecuteBody, options?: {
        dispatchMode?: CompatibilityDispatchMode;
    }): Promise<void>;
    handleWorkspaceExecute(req: http.IncomingMessage, res: http.ServerResponse, options?: {
        dispatchMode?: CompatibilityDispatchMode;
    }): Promise<void>;
    handleWorkspaceExecuteBody(req: http.IncomingMessage, res: http.ServerResponse, body: ExecuteBody, options?: {
        dispatchMode?: CompatibilityDispatchMode;
    }): Promise<void>;
};
export {};
//# sourceMappingURL=execution.d.ts.map