/**
 * Session Management Command
 *
 * Manages AI coding sessions - list, end, and view session status.
 *
 * Commands:
 * - neurcode session list    - List all sessions
 * - neurcode session end     - End the current or specified session
 * - neurcode session status  - Show status of current session
 */
interface SessionCommandOptions {
    sessionId?: string;
    projectId?: string;
    all?: boolean;
    left?: string;
    right?: string;
    json?: boolean;
}
/**
 * List all sessions
 */
export declare function listSessionsCommand(options: SessionCommandOptions): Promise<void>;
/**
 * End a session
 */
export declare function endSessionCommand(options: SessionCommandOptions): Promise<void>;
/**
 * Show session status
 */
export declare function sessionStatusCommand(options: SessionCommandOptions): Promise<void>;
export declare function listLocalSessionsCommand(options?: SessionCommandOptions): void;
export declare function currentLocalSessionCommand(options?: SessionCommandOptions): void;
export declare function resumeLocalSessionCommand(options?: SessionCommandOptions): void;
export declare function compareLocalSessionsCommand(options?: SessionCommandOptions): void;
export {};
//# sourceMappingURL=session.d.ts.map