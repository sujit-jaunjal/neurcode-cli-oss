/**
 * Enhanced Messaging Utility
 *
 * Provides enterprise-grade, personalized CLI messaging with consistent formatting,
 * helpful error messages, and actionable next steps.
 */
import { getUserInfo, getUserFirstName } from './user-context';
export { getUserInfo, getUserFirstName };
/**
 * Print a personalized greeting
 */
export declare function printGreeting(message: string): Promise<void>;
/**
 * Print a success message with premium formatting
 */
export declare function printSuccess(message: string, details?: string): void;
/**
 * Print a warning message with helpful context
 */
export declare function printWarning(message: string, suggestion?: string): void;
/**
 * Print an error message with actionable next steps
 */
export declare function printError(message: string, error?: Error | string, nextSteps?: string[]): void;
/**
 * Print an info message
 */
export declare function printInfo(message: string, details?: string): void;
/**
 * Print a section header with premium styling
 */
export declare function printSection(title: string, marker?: string): void;
/**
 * Print a step indicator
 */
export declare function printStep(step: number, total: number, description: string): void;
/**
 * Print a progress indicator
 */
export declare function printProgress(message: string): void;
/**
 * Print completion of progress
 */
export declare function printProgressComplete(success?: boolean): void;
/**
 * Print authentication-related errors with helpful suggestions
 */
export declare function printAuthError(error: Error | string): Promise<void>;
/**
 * Print project-related errors with helpful suggestions
 */
export declare function printProjectError(error: Error | string, projectId?: string): void;
/**
 * Print a beautiful success banner
 */
export declare function printSuccessBanner(title: string, subtitle?: string): Promise<void>;
/**
 * Print command-specific help in errors
 */
export declare function printCommandHelp(command: string, options?: string[]): void;
/**
 * Print waiting/progress message with spinner (simple version)
 */
export declare function printWaiting(message: string, showDots?: boolean): void;
/**
 * Clear waiting message
 */
export declare function clearWaiting(): void;
/**
 * Print verification result with detailed breakdown
 */
export declare function printVerificationResult(passed: boolean, score?: number, warnings?: number, violations?: number): void;
/**
 * Print a table-like output for structured data
 */
export declare function printTable(rows: string[][]): void;
/**
 * Print a big welcome banner (like other enterprise CLIs)
 */
export declare function printWelcomeBanner(): Promise<void>;
//# sourceMappingURL=messages.d.ts.map