import type { Request, Response, NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
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

const INITIAL_ADMIN_EMAILS = new Set(['gubrant@gmail.com']);

async function syncFirebaseUser(uid: string, email: string, displayName: string): Promise<AuthenticatedUser> {
  const normalizedEmail = email.trim().toLowerCase();

  const existingByEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingByEmail.length > 0) {
    const existing = existingByEmail[0];
    const shouldPromoteInitialAdmin =
      INITIAL_ADMIN_EMAILS.has(normalizedEmail) && existing.role !== 'admin';

    const updated = await db
      .update(users)
      .set({
        uid,
        name: existing.name || displayName,
        role: shouldPromoteInitialAdmin ? 'admin' : existing.role,
        active: true,
        inviteToken: null,
      })
      .where(eq(users.id, existing.id))
      .returning();

    const u = updated[0];
    const linkedPlayer = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.userId, u.id))
      .limit(1);

    return {
      id: u.id,
      uid: u.uid,
      email: u.email,
      name: u.name,
      role: u.role === 'admin' ? 'admin' : 'player',
      playerId: linkedPlayer[0]?.id ?? null,
    };
  }

  const adminCountRes = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, 'admin'));
  const hasAnyAdmin = (adminCountRes[0]?.count ?? 0) > 0;
  const role: 'admin' | 'player' =
    INITIAL_ADMIN_EMAILS.has(normalizedEmail) || !hasAnyAdmin ? 'admin' : 'player';

  const inserted = await db
    .insert(users)
    .values({
      uid,
      email: normalizedEmail,
      name: displayName || normalizedEmail.split('@')[0],
      role,
      active: true,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: { email: normalizedEmail },
    })
    .returning();

  const u = inserted[0];
  const linkedPlayer = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.userId, u.id))
    .limit(1);

  return {
    id: u.id,
    uid: u.uid,
    email: u.email,
    name: u.name,
    role: u.role === 'admin' ? 'admin' : 'player',
    playerId: linkedPlayer[0]?.id ?? null,
  };
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
    if (token.startsWith('qm.')) {
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
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const email = decodedToken.email || `${decodedToken.uid}@firebase.local`;
    const displayName = decodedToken.name || email.split('@')[0];
    req.authUser = await syncFirebaseUser(decodedToken.uid, email, displayName);
    return next();
  } catch (error) {
    console.error('Erro na verificação do token de autenticação:', error);
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.authUser || req.authUser.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  return next();
};
