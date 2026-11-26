// Minimal client for the Flagsmith Admin (management) API.
// Auth: Organisation API key. Docs: https://api.flagsmith.com/api/v1/swagger.json

const API_BASE = "https://api.flagsmith.com/api/v1";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is not set. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

export async function admin<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/${path.replace(/^\//, "")}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Api-Key ${requireEnv("FLAGSMITH_ADMIN_API_KEY")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

export type Paginated<T> = { results: T[]; next: string | null };
