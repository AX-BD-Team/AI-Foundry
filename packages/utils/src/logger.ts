export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  service: string;
  message: string;
  timestamp: string;
  traceId?: string;
  [key: string]: unknown;
};

export type Logger = {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
};

function log(
  level: LogLevel,
  service: string,
  message: string,
  bindings: Record<string, unknown>,
  meta?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    level,
    service,
    message,
    timestamp: new Date().toISOString(),
    ...bindings,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function createLogger(service: string, initialBindings: Record<string, unknown> = {}): Logger {
  const bindings = { ...initialBindings };

  return {
    debug(message, meta) {
      log("debug", service, message, bindings, meta);
    },
    info(message, meta) {
      log("info", service, message, bindings, meta);
    },
    warn(message, meta) {
      log("warn", service, message, bindings, meta);
    },
    error(message, meta) {
      log("error", service, message, bindings, meta);
    },
    child(childBindings) {
      return createLogger(service, { ...bindings, ...childBindings });
    },
  };
}
