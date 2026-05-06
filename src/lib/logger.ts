type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export interface Logger {
  readonly info: (event: string, fields?: LogFields) => void;
  readonly warn: (event: string, fields?: LogFields) => void;
  readonly error: (event: string, fields?: LogFields) => void;
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
    ...baseFields,
    ...fields,
  };
  const line = JSON.stringify(record);
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
