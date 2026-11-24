/**
 * Minimal Cloudflare D1 HTTP API client for local Node.js CLI scripts.
 * Implements the same .prepare(sql).bind(...params).all() / .first() / .run()
 * interface as the Cloudflare Workers D1 binding so /shared/d1Pool.js can be reused directly.
 * Uses parameterized queries only.
 */

export function createD1HttpClient({ accountId, databaseId, apiToken, fetchImpl = fetch }) {
  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      'Missing Cloudflare D1 credentials. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN.'
    );
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;

  async function execute(sql, params = []) {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`
      },
      body: JSON.stringify({ sql, params })
    });

    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Cloudflare D1 API returned non-JSON (${res.status}): ${raw.slice(0, 200)}`);
    }

    if (!res.ok || !json.success) {
      const msg = json?.errors?.map((e) => e.message).join('; ') || raw.slice(0, 200);
      throw new Error(`Cloudflare D1 API error (${res.status}): ${msg}`);
    }

    const firstResult = Array.isArray(json.result) ? json.result[0] : json.result;
    return {
      success: Boolean(firstResult?.success ?? true),
      results: firstResult?.results || [],
      meta: firstResult?.meta || {}
    };
  }

  return {
    prepare(sql) {
      let boundParams = [];
      const stmt = {
        bind(...params) {
          boundParams = params;
          return stmt;
        },
        async all() {
          return execute(sql, boundParams);
        },
        async first() {
          const res = await execute(sql, boundParams);
          return res.results[0] || null;
        },
        async run() {
          return execute(sql, boundParams);
        }
      };
      return stmt;
    }
  };
}
