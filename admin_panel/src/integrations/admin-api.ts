const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const apiSecret = process.env.NEXT_PUBLIC_API_SECRET || '';

function apiPath(path: string): string {
  const normalizedPath = !basePath || !path.startsWith('/') ? path : `${basePath}${path}`;
  if (typeof window === 'undefined') return normalizedPath;
  const separator = normalizedPath.includes('?') ? '&' : '?';
  return `${normalizedPath}${separator}_=${Date.now()}`;
}

function authHeaders(): Record<string, string> {
  return apiSecret ? { authorization: `Bearer ${apiSecret}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(apiPath(path), {
    cache: 'no-store',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`API_ERROR_${response.status}`);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiPath(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`API_ERROR_${response.status}`);
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiPath(path), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`API_ERROR_${response.status}`);
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(apiPath(path), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`API_ERROR_${response.status}`);
  return response.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(apiPath(path), {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) throw new Error(`UPLOAD_ERROR_${response.status}`);
  return response.json() as Promise<T>;
}
