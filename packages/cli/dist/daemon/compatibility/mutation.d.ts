import * as http from 'node:http';
import { type ExecutionSource } from '../runtime/execution-bus';
type FailureOptions = {
    code?: string;
    retriable?: boolean;
    details?: Record<string, unknown> | null;
};
export interface CompatibilityMutationHandlerContext {
    readBody(req: http.IncomingMessage): Promise<string>;
    success(res: http.ServerResponse, data: unknown): void;
    failure(res: http.ServerResponse, error: string, status?: number, options?: FailureOptions): void;
    toSource(req: http.IncomingMessage): ExecutionSource;
    toActor(req: http.IncomingMessage): string;
    recordPatchOutcome(status: string): void;
}
export declare function createCompatibilityMutationHandlers(context: CompatibilityMutationHandlerContext): {
    handleFix(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
    handleFixApplySafe(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
    handlePatch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
    handlePatchRollback(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
    handlePatchPreview(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
};
export {};
//# sourceMappingURL=mutation.d.ts.map