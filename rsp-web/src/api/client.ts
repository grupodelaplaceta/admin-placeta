/* ═══════════════════════════════════════════════════════════════════════
   RSP Web · Cliente HTTP
   Sin secretos en el cliente: solo cabeceras de sesión (cookie httpOnly).
   Manejo de errores centralizado y tipado.
   ═══════════════════════════════════════════════════════════════════════ */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include', // la sesión viaja en cookie httpOnly
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const body = await res.json();
      msg = (body as { error?: string }).error ?? msg;
    } catch {
      /* respuesta no JSON */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
};
