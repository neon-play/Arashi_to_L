// arashi.js
export const ARASHI = Object.freeze({
  TURSO_DATABASE_URL_KEY: "https://neon-anime-db-lupinarashi.turso.io",
  TURSO_AUTH_TOKEN_KEY: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzIzNTg3NTEsImlkIjoiZGY1MzQ0OWEtZmNlNi00YzIwLTlhNWMtODdlY2JkZjZkNjA0IiwicmlkIjoiODcwYzBmZDUtNWM4Ny00MGYwLWFhZTYtYTE0YTUyZmEwZDk1In0.hHOmuljVz91S7bveKE02E_6-lsGAt0dU1VNTgfw9cyJhBvJGu6oa8O8nz8Af5-qqqWy_PAL-3lsJopEopPhEAw",

  // Change this to your real table name.
  TABLE_NAME: "connector",

  // 24 hours
  CACHE_TTL_MS: 24 * 60 * 60 * 1000,
});

export function getArashiConfig(env) {
  return {
    url: env?.[ARASHI.TURSO_DATABASE_URL_KEY],
    authToken: env?.[ARASHI.TURSO_AUTH_TOKEN_KEY],
    tableName: ARASHI.TABLE_NAME,
    cacheTtlMs: ARASHI.CACHE_TTL_MS,
  };
}