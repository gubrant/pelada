import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { verifySessionToken } from '../lib/auth-crypto.ts';
import { db } from '../db/index.ts';
import { players, users } from '../db/schema.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'player';
  playerId: number | null;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticação necessária. Faça login para continuar.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação inválido.' });
  }

  try {
    const session = verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Sessão expirada ou inválida. Entre novamente.' });
    }

    const found = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (found.length === 0 || !found[0].active) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
    }

    const u = found[0];
    const linkedPlayer = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.userId, u.id))
      .limit(1);

    req.authUser = {
      id: u.id,
      uid: u.uid,
      email: u.email,
      name: u.name,
      role: u.role === 'admin' ? 'admin' : 'player',
      playerId: linkedPlayer[0]?.id ?? null,
    };
    return next();
  } catch (error) {
    console.error('Erro na verificação da sessão:', error);
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.authUser || req.authUser.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  return next();
};
