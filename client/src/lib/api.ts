/**
 * Thin fetch wrapper for the JSON API.
 *
 * The server answers /api/* with 401 JSON rather than the old 302-to-login-HTML,
 * which is what makes an expired session detectable from here at all.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Full-page navigation to the OAuth entry point, preserving where we were. */
export function redirectToLogin(): void {
  const returnTo = window.location.pathname + window.location.search;
  window.location.assign(`/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
}

type Options = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const isFormData = body instanceof FormData;
  const res = await fetch(path, {
    ...rest,
    headers: {
      Accept: "application/json",
      // Enforcing a JSON content-type on mutations is also what blocks
      // cross-site form posts, since a simple form can't set this header.
      ...(body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (res.status === 401) {
    redirectToLogin();
    throw new ApiError(401, "Not authenticated");
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const parsed = (await res.json()) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // Non-JSON error body; the status text is the best we have.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
