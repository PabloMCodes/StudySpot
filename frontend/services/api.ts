export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 20_000;

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
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
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      success: false,
      data: null,
      error: isAbort
        ? "Request timed out. Check EXPO_PUBLIC_API_URL and backend status."
        : "Network request failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
