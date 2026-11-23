let memoryAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryAuthToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Erro na requisição (${response.status})`;
    const text = await response.text().catch(() => '');
    try {
      const payload = JSON.parse(text) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      if (response.status === 404) {
        message = 'Rota da API não encontrada no servidor (404).';
      } else if (text && text.length < 200 && !text.trim().startsWith('<')) {
        message = text;
      }
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}
