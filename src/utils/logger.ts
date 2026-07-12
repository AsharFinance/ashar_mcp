/**
 * Structured JSON logger for ashar_mcp.
 *
 * - Structured JSON output (timestamp, level, service, traceId, message, error)
 * - Error serialization with stack traces
 * - Batched Loki push via LOKI_PUSH_URL (if configured)
 * - registerUnhandledErrorHandlers() for global crash safety
 */

import { randomUUID } from 'node:crypto';

const LOKI_PUSH_URL = process.env.LOKI_PUSH_URL || '';
const SERVICE_NAME = process.env.RAILWAY_SERVICE_NAME || 'ashar-mcp';
const ENVIRONMENT = process.env.RAILWAY_ENVIRONMENT || 'production';

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
  cause?: SerializedError | null;
}

function serializeError(err: unknown): SerializedError | null {
  if (!err) return null;
  if (err instanceof Error) {
    const se: SerializedError = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    if ('code' in err && typeof (err as any).code === 'string') se.code = (err as any).code;
    if ('statusCode' in err && typeof (err as any).statusCode === 'number') se.statusCode = (err as any).statusCode;
    if (err.cause) se.cause = serializeError(err.cause);
    return se;
  }
  return { name: 'UnknownError', message: String(err) };
}

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

class LokiBatcher {
  private buffer: LokiStream[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  push(entry: Record<string, unknown>): void {
    const tsNs = String(Date.now() * 1_000_000);
    const line = JSON.stringify(entry);
    this.buffer.push({
      stream: { service: SERVICE_NAME, level: String(entry.level ?? 'info'), environment: ENVIRONMENT },
      values: [[tsNs, line]],
    });
    if (this.buffer.length >= 100) { void this.flush(); return; }
    if (!this.timer) this.timer = setTimeout(() => { void this.flush(); }, 2000);
  }

  private async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.buffer.length === 0) return;
    const streams = this.buffer.splice(0);
    try {
      await fetch(LOKI_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streams }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* silent */ }
  }
}

const lokiBatcher = LOKI_PUSH_URL ? new LokiBatcher() : null;

function emit(level: string, message: string, error?: unknown, context?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    traceId: `mcp_${randomUUID()}`,
    ...(context ?? {}),
  };
  if (error) entry.error = error instanceof Error ? serializeError(error) : error;

  const json = JSON.stringify(entry);
  if (level === 'error' || level === 'fatal') console.error(json);
  else if (level === 'warn') console.warn(json);
  else console.log(json);

  lokiBatcher?.push(entry);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) =>
    emit('info', message, undefined, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    emit('warn', message, undefined, context),
  error: (message: string, error?: unknown, context?: Record<string, unknown>) =>
    emit('error', message, error, context),
  fatal: (message: string, error?: unknown) =>
    emit('fatal', message, error),
};

export function registerUnhandledErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    emit('fatal', 'Uncaught exception — process will exit', error);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    emit('error', 'Unhandled rejection', reason);
  });
}
