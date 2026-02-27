export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok) {
    return {
      success: false,
      data: null,
      error: payload.error ?? "Request failed",
    };
  }

  return payload;
}
