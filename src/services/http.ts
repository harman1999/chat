/**
 * Transport shim.
 *
 * Today every service resolves against the in-memory mock dataset. When the
 * backend lands, only this file changes: `request()` gains a real `fetch` call
 * against `NEXT_PUBLIC_API_URL` and the mock branch is deleted. Services and
 * components keep their current signatures.
 */
import type { ApiError } from "@/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export const USE_MOCK_TRANSPORT = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

/** Simulated latency so loading states are exercised during development. */
const MOCK_LATENCY_MS = 220;

export function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "code" in value && "status" in value;
}

export async function mockResolve<T>(value: T, latency = MOCK_LATENCY_MS): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, latency));
  return value;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });

  if (!response.ok) {
    // The API answers failures as { code, message, status }. Preferring that
    // body over the bare status is what lets a form say which field to fix
    // rather than "Request failed"; the status is still the fallback, since an
    // upstream proxy can fail the request before a handler ever runs.
    const body = (await response.json().catch(() => null)) as Partial<ApiError> | null;
    const error: ApiError = {
      code: body?.code ?? `http_${response.status}`,
      message: body?.message ?? response.statusText ?? "Request failed",
      status: response.status,
    };
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
