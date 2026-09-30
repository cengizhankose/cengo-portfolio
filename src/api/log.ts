// Structured logging (BE-08): one JSON object per line on stdout, which is
// what `outplane logs` collects. Callers pass explicit fields; never pass IPs,
// query strings, cookies, API keys or connection URLs.
//
//   LOG_LEVEL = debug | info (default) | warn | error

export type LogLevel = "debug" | "info" | "warn" | "error";

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function threshold(): number {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  return configured && configured in SEVERITY
    ? SEVERITY[configured as LogLevel]
    : SEVERITY.info;
}

export function log(
  level: LogLevel,
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  if (SEVERITY[level] < threshold()) return;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (!(key in entry) && value !== undefined) entry[key] = value;
  }
  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    // Unserialisable field (cycle, BigInt): keep the event, drop the fields.
    line = JSON.stringify({ ts: entry.ts, level, msg, logError: "unserialisable fields" });
  }
  console.log(line);
}

/** Message and name of a thrown value, safe to log (no stack unless asked for). */
export function errorFields(
  error: unknown,
  { stack = false }: { stack?: boolean } = {},
): Record<string, unknown> {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      err: error.message,
      errName: error.name,
      ...(typeof code === "string" ? { errCode: code } : {}),
      ...(stack ? { stack: error.stack } : {}),
    };
  }
  return { err: String(error) };
}
