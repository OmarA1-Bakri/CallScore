type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export interface Logger {
  readonly info: (event: string, fields?: LogFields) => void;
  readonly warn: (event: string, fields?: LogFields) => void;
  readonly error: (event: string, fields?: LogFields) => void;
}

const RESERVED_LOG_KEYS = new Set(["ts", "level", "event"]);

function stripReservedKeys(fields: LogFields): LogFields {
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (RESERVED_LOG_KEYS.has(key)) continue;
    safe[key] = value;
  }
  return safe;
}

function safeStringify(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timestamp = coerceLogTimestamp(record.ts);
    const level = coerceLogLevel(record.level);
    return JSON.stringify({
      ts: timestamp,
      level,
      event: "log_serialize_failed",
      error: message,
    });
  }
}

function coerceLogTimestamp(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function coerceLogLevel(value: unknown): LogLevel {
  return value === "info" || value === "warn" || value === "error" ? value : "error";
}

function writeLog(
  level: LogLevel,
  event: string,
  baseFields: LogFields,
  fields: LogFields = {},
): void {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...stripReservedKeys(baseFields),
    ...stripReservedKeys(fields),
  };
  const line = safeStringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(baseFields: LogFields = {}): Logger {
  return {
    info: (event, fields) => writeLog("info", event, baseFields, fields),
    warn: (event, fields) => writeLog("warn", event, baseFields, fields),
    error: (event, fields) => writeLog("error", event, baseFields, fields),
  };
}
