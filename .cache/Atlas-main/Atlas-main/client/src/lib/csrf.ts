let refreshPromise: Promise<string | null> | null = null;

function readTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function ensureCsrfToken(): Promise<string | null> {
  const existing = readTokenFromCookie();
  if (existing) {
    return existing;
  }

  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/csrf-token', {
      credentials: 'include',
      headers: { 'Cache-Control': 'no-store' },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Unable to refresh CSRF token: ${res.statusText}`);
        }
        const body = await res.json().catch(() => ({}));
        return body?.csrfToken ?? readTokenFromCookie();
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  try {
    return await refreshPromise;
  } catch (error) {
    console.error('Failed to refresh CSRF token:', error);
    return null;
  }
}

export function getCsrfToken(): string | null {
  return readTokenFromCookie();
}
