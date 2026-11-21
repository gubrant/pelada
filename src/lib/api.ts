let inMemoryToken: string | null = null;
let firebaseTokenResolver: (() => Promise<string | null>) | null = null;

export function setInMemoryAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getInMemoryAuthToken(): string | null {
  return inMemoryToken;
}

export function registerFirebaseTokenResolver(fn: (() => Promise<string | null>) | null) {
  firebaseTokenResolver = fn;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  let token = inMemoryToken;
  if (!token && firebaseTokenResolver) {
    token = await firebaseTokenResolver();
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' && data.error
        ? data.error
        : `Erro na requisição (${res.status})`
    );
  }

  return data as T;
}

export async function compressImageToDataUrl(file: File, maxSize = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Falha ao processar imagem.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}
