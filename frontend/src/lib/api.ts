const API = process.env.NEXT_PUBLIC_API_URL;

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiUrl(path: string): string {
  if (!API) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }
  return `${API.replace(/\/$/, "")}${path}`;
}

function isTokenResponse(value: unknown): value is { accessToken: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "accessToken" in value &&
    typeof value.accessToken === "string"
  );
}

function getErrorMessage(body: unknown): string {
  if (
    typeof body !== "object" ||
    body === null ||
    !("message" in body)
  ) {
    return "Une erreur est survenue";
  }

  const message = body.message;
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === "string").join(", ");
  }
  return typeof message === "string" ? message : "Une erreur est survenue";
}

export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          accessToken = null;
          return false;
        }

        const data: unknown = await response.json();
        if (!isTokenResponse(data)) {
          throw new Error("Invalid refresh response");
        }
        accessToken = data.accessToken;
        return true;
      })
      .catch(() => {
        accessToken = null;
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return api<T>(path, init, false);
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new ApiError(response.status, getErrorMessage(body));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
