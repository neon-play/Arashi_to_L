import { createClient } from "@tursodatabase/serverless/compat";
import { getArashiConfig } from "./arashi.js";

type EnvBindings = Record<string, string | undefined>;

type ApiRow = {
  episode: number;
  Ara: string;
};

type CacheEntry = {
  expiresAt: number;
  rows: ApiRow[];
};

type RequestBody = {
  id?: unknown;
  SHA?: unknown;
  SN?: unknown;
  Ep?: unknown;
};

const cache = new Map<string, CacheEntry>();

let dbClient: ReturnType<typeof createClient> | null = null;
let dbSignature = "";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const CORS_HEADERS = {
  ...JSON_HEADERS,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function nullResponse(): Response {
  return jsonResponse(null, { status: 200 });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }

  return null;
}

function safeIdentifier(name: string): string {
  // Prevent SQL identifier injection from config.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return name;
}

function cacheKey(id: string, sha: string, sn: string): string {
  return `${id}\u001f${sha}\u001f${sn}`;
}

function getClient(env: EnvBindings) {
  const cfg = getArashiConfig(env);

  if (!isNonEmptyString(cfg.url) || !isNonEmptyString(cfg.authToken)) {
    throw new Error("Missing Turso bindings");
  }

  const signature = `${cfg.url}::${cfg.authToken}`;
  if (!dbClient || dbSignature !== signature) {
    dbClient = createClient({
      url: cfg.url,
      authToken: cfg.authToken,
    });
    dbSignature = signature;
  }

  return { client: dbClient, cfg };
}

function readCachedRows(key: string, now = Date.now()): ApiRow[] | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }

  return entry.rows;
}

function writeCachedRows(key: string, rows: ApiRow[], ttlMs: number): void {
  cache.set(key, {
    rows,
    expiresAt: Date.now() + ttlMs,
  });
}

function compactRows(rows: unknown[]): ApiRow[] {
  const output: ApiRow[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const r = row as Record<string, unknown>;
    const epRaw = r.episode_num ?? r.episode ?? r.ep_num;
    const streamRaw = r.stream;

    const episode = parsePositiveInteger(epRaw);
    const stream = isNonEmptyString(streamRaw) ? streamRaw.trim() : "";

    if (episode === null) continue;
    if (!stream) continue;

    output.push({ episode, Ara: stream });
  }

  output.sort((a, b) => a.episode - b.episode);
  return output;
}

async function loadRowsFromDatabase(
  env: EnvBindings,
  id: string,
  sha: string,
  sn: string,
): Promise<ApiRow[]> {
  const { client, cfg } = getClient(env);
  const table = safeIdentifier(cfg.tableName);

  // Query is fully parameterized; only the validated table name is interpolated.
  const result = await client.execute({
    sql: `
      SELECT
        CAST(episode AS INTEGER) AS episode_num,
        stream
      FROM ${table}
      WHERE id = ?
        AND sha = ?
        AND season = ?
        AND episode IS NOT NULL
        AND stream IS NOT NULL
      ORDER BY episode_num ASC
    `,
    args: [id, sha, sn],
  });

  return compactRows(result.rows as unknown[]);
}

async function handlePost(request: Request, env: EnvBindings): Promise<Response> {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return nullResponse();
  }

  const id = isNonEmptyString(body.id) ? body.id.trim() : "";
  const SHA = isNonEmptyString(body.SHA) ? body.SHA.trim() : "";
  const SN = isNonEmptyString(body.SN) ? body.SN.trim() : "";
  const Ep = parsePositiveInteger(body.Ep);

  if (!id || !SHA || !SN || Ep === null) {
    return nullResponse();
  }

  const { cfg } = getClient(env);
  const key = cacheKey(id, SHA, SN);

  let rows = readCachedRows(key);

  if (!rows) {
    rows = await loadRowsFromDatabase(env, id, SHA, SN);
    writeCachedRows(key, rows, cfg.cacheTtlMs);
  }

  const limit = Math.min(Ep, rows.length);
  const payload = rows.slice(0, limit);

  return jsonResponse(payload, { status: 200 });
}

function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export default {
  async fetch(request: Request, env: EnvBindings): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return optionsResponse();
      }
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method Not Allowed" }, { status: 405, headers: CORS_HEADERS });
      }
      const response = await handlePost(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...CORS_HEADERS,
          ...Object.fromEntries(response.headers.entries()),
        },
      });
    } catch {
      return nullResponse();
    }
  },
};