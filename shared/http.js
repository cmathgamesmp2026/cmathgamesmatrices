/**
 * Shared HTTP response & request parsing helpers for Cloudflare Pages Functions.
 * Pure Web Standards (Response, Request).
 */

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

export async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
