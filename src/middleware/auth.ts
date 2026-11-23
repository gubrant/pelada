import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { verifySessionToken } from '../lib/auth-crypto.ts';
import type { AuthUser, UserRole } from '../types/pelada.ts';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export async function attachAuthIfPresent(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      next();
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      next();
      return;
    }
    const [userRow] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, payload.uid))
      .limit(1);

    if (userRow && userRow.active) {
      req.authUser = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role: userRow.role as UserRole,
        active: userRow.active,
      };
    }
    next();
  } catch {
    next();
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await attachAuthIfPresent(req, res, () => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Autenticação necessária. Faça login para continuar.' });
      return;
    }
    next();
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito a administradores da pelada.' });
    return;
  }
  next();
}
