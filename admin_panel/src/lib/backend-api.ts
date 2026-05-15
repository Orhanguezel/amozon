const backendApiUrl = process.env.BACKEND_API_URL || 'http://localhost:8186';
// BACKEND_API_SECRET: server-only, not inlined at build time (unlike NEXT_PUBLIC_*)
const backendApiSecret = process.env.BACKEND_API_SECRET || '';

export async function backendJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${backendApiUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(backendApiSecret ? { authorization: `Bearer ${backendApiSecret}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return Response.json(data, { status: response.status, headers: noStoreHeaders() });
  }
  return Response.json(data, { headers: noStoreHeaders() });
}

export async function backendRaw(path: string, init: RequestInit = {}) {
  const response = await fetch(`${backendApiUrl}${path}`, {
    ...init,
    headers: {
      ...(backendApiSecret ? { authorization: `Bearer ${backendApiSecret}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return Response.json(data, { status: response.status });
  }
  return response;
}

function noStoreHeaders() {
  return {
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    pragma: 'no-cache',
    expires: '0',
  };
}
