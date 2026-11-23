import crypto from 'node:crypto';
import type { AuthUser, UserRole } from '../types/pelada.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function getSigningSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  return EPHEMERAL_SECRET;
}

export function hasConfiguredSessionSecret(): boolean {
  const envSecret = process.env.SESSION_SECRET?.trim();
  return Boolean(envSecret && envSecret.length >= 16);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derived = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuf, derived);
  } catch {
    return false;
  }
}

interface TokenPayload {
  uid: number;
  email: string;
  role: UserRole;
  exp: number;
}

export function signSessionToken(user: Pick<AuthUser, 'id' | 'email' | 'role'>): string {
  const payload: TokenPayload = {
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(encodedPayload)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (!decoded || typeof decoded.uid !== 'number' || typeof decoded.exp !== 'number') {
      return null;
    }
    if (decoded.exp < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function sanitizeImageUrl(raw: unknown, maxBytes = 1_500_000): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed.length <= maxBytes ? trimmed : null;
  }

  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/src/assets/')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}
