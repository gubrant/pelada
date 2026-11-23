import { Router } from 'express';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  encounterAttendances,
  encounterTeamDraws,
  financeTransactions,
  memberProfiles,
  peladaEncounters,
  peladaMemberships,
  users,
  weeklyPeladas,
} from '../db/schema.ts';
import {
  hashPassword,
  sanitizeImageUrl,
  signSessionToken,
  verifyPassword,
} from '../lib/auth-crypto.ts';
import { attachAuthIfPresent, requireAdmin, requireAuth } from '../middleware/auth.ts';
import { computeOverall, drawBalancedTeams } from './team-draw.ts';
import {
  BLOOD_TYPES,
  DOMINANT_FEET,
  PLAYER_POSITIONS,
  WEEKDAYS,
  type AttendanceStatus,
  type BloodType,
  type DominantFoot,
  type DrawnTeam,
  type EncounterAttendanceItem,
  type MemberCategory,
  type PlayerPosition,
  type SkillScores,
  type UserRole,
} from '../types/pelada.ts';

export const apiRouter = Router();

function clampScore(value: unknown, fallback = 6): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.min(10, Math.max(1, num)) * 10) / 10;
}

function parsePositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function parseNonNegativeMoney(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.round(num * 100) / 100;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================================
// AUTHENTICATION & FIRST-RUN ADMIN BOOTSTRAP
// ============================================================================

apiRouter.get('/auth/bootstrap-status', async (_req, res) => {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    res.json({ needsAdminSetup: count === 0 });
  } catch (err) {
    console.error('Erro em bootstrap-status:', err);
    res.status(500).json({ error: 'Erro ao verificar estado inicial.' });
  }
});

const PRIMARY_ADMIN_EMAIL = 'gubrant@gmail.com';

apiRouter.post('/auth/bootstrap-admin', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if (email !== PRIMARY_ADMIN_EMAIL) {
      res.status(403).json({
        error: `Somente a conta ${PRIMARY_ADMIN_EMAIL} pode ser configurada como administradora inicial.`,
      });
      return;
    }
    if (name.length < 2) {
      res.status(400).json({ error: 'Informe o nome completo do administrador.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    const createdUser = await db.transaction(async (tx) => {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users);
      if (count > 0) {
        return null;
      }

      const [userRow] = await tx
        .insert(users)
        .values({
          email,
          name,
          passwordHash: hashPassword(password),
          role: 'admin',
          active: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          active: users.active,
        });

      await tx.insert(memberProfiles).values({
        userId: userRow.id,
        fullName: name,
        dominantFoot: 'Destro',
        preferredPosition: 'Coringa',
        bloodType: 'Não sei',
        initDribbling: 6,
        initPhysical: 6,
        initPassing: 6,
        initAttack: 6,
        initDefense: 6,
        initShooting: 6,
        initOverall: 6,
        profileCompleted: false,
      });

      return userRow;
    });

    if (!createdUser) {
      res.status(409).json({
        error: 'O administrador inicial já foi configurado. Use a tela de login.',
      });
      return;
    }

    const token = signSessionToken({
      id: createdUser.id,
      email: createdUser.email,
      role: 'admin',
    });

    res.status(201).json({
      token,
      user: {
        ...createdUser,
        role: createdUser.role as UserRole,
      },
    });
  } catch (err) {
    console.error('Erro em bootstrap-admin:', err);
    res.status(500).json({ error: 'Falha ao criar administrador inicial.' });
  }
});

apiRouter.post('/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if (name.length < 2) {
      res.status(400).json({ error: 'Informe seu nome completo.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
      return;
    }

    const createdUser = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({
          email,
          name,
          passwordHash: hashPassword(password),
          role: 'member',
          active: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          active: users.active,
        });

      await tx.insert(memberProfiles).values({
        userId: userRow.id,
        fullName: name,
        dominantFoot: 'Destro',
        preferredPosition: 'Coringa',
        bloodType: 'Não sei',
        initDribbling: 6,
        initPhysical: 6,
        initPassing: 6,
        initAttack: 6,
        initDefense: 6,
        initShooting: 6,
        initOverall: 6,
        profileCompleted: false,
      });

      return userRow;
    });

    const token = signSessionToken({
      id: createdUser.id,
      email: createdUser.email,
      role: 'member',
    });

    res.status(201).json({
      token,
      user: {
        ...createdUser,
        role: createdUser.role as UserRole,
      },
    });
  } catch (err) {
    console.error('Erro em /auth/register:', err);
    res.status(500).json({ error: 'Erro ao cadastrar peladeiro.' });
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha.' });
      return;
    }

    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!userRow || !verifyPassword(password, userRow.passwordHash)) {
      res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      return;
    }

    if (!userRow.active) {
      res.status(403).json({ error: 'Este acesso está desativado pelo administrador.' });
      return;
    }

    const role = (userRow.role === 'admin' ? 'admin' : 'member') as UserRole;
    const token = signSessionToken({
      id: userRow.id,
      email: userRow.email,
      role,
    });

    res.json({
      token,
      user: {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role,
        active: userRow.active,
      },
    });
  } catch (err) {
    console.error('Erro em /auth/login:', err);
    res.status(500).json({ error: 'Erro ao realizar login.' });
  }
});

apiRouter.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const user = req.authUser!;
    const [profile] = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, user.id))
      .limit(1);

    res.json({ user, profile: profile || null });
  } catch (err) {
    console.error('Erro em /auth/me:', err);
    res.status(500).json({ error: 'Erro ao carregar sessão.' });
  }
});

// ============================================================================
// ADMIN USER ACCOUNTS MANAGEMENT
// ============================================================================

apiRouter.get('/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
        nickname: memberProfiles.nickname,
        preferredPosition: memberProfiles.preferredPosition,
        profileCompleted: memberProfiles.profileCompleted,
        initOverall: memberProfiles.initOverall,
      })
      .from(users)
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .orderBy(asc(users.name));

    res.json({ users: rows });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ error: 'Erro ao listar contas cadastradas.' });
  }
});

apiRouter.post('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    if (req.body?.role === 'admin') {
      res.status(400).json({
        error: 'Nenhuma conta pode ser criada como administradora. Cadastre como peladeiro.',
      });
      return;
    }
    const role: UserRole = 'member';

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if (name.length < 2) {
      res.status(400).json({ error: 'Informe o nome do usuário.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'E-mail já cadastrado.' });
      return;
    }

    const created = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({
          email,
          name,
          passwordHash: hashPassword(password),
          role,
          active: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          active: users.active,
        });

      await tx.insert(memberProfiles).values({
        userId: userRow.id,
        fullName: name,
        dominantFoot: 'Destro',
        preferredPosition: 'Coringa',
        bloodType: 'Não sei',
        initDribbling: 6,
        initPhysical: 6,
        initPassing: 6,
        initAttack: 6,
        initDefense: 6,
        initShooting: 6,
        initOverall: 6,
        profileCompleted: false,
      });

      return userRow;
    });

    res.status(201).json({ user: created });
  } catch (err) {
    console.error('Erro ao criar usuário via admin:', err);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

apiRouter.patch('/admin/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = parsePositiveInt(req.params.userId);
    if (!targetId) {
      res.status(400).json({ error: 'ID de usuário inválido.' });
      return;
    }

    const [targetUser] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    if (!targetUser) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const isPrimaryAdmin = req.authUser!.email.toLowerCase() === PRIMARY_ADMIN_EMAIL;
    const targetIsPrimaryAdmin = targetUser.email.toLowerCase() === PRIMARY_ADMIN_EMAIL;

    const updates: Partial<typeof users.$inferInsert> = {};
    if (req.body?.role === 'admin' || req.body?.role === 'member') {
      if (!isPrimaryAdmin) {
        res.status(403).json({
          error: `Apenas a conta ${PRIMARY_ADMIN_EMAIL} pode alterar contas entre membro e administrador.`,
        });
        return;
      }
      if (targetIsPrimaryAdmin && req.body.role !== 'admin') {
        res.status(400).json({
          error: 'A conta administradora principal não pode ser rebaixada para membro.',
        });
        return;
      }
      updates.role = req.body.role;
    }
    if (typeof req.body?.active === 'boolean') {
      if ((targetId === req.authUser!.id || targetIsPrimaryAdmin) && !req.body.active) {
        res.status(400).json({ error: 'Esta conta não pode ser desativada.' });
        return;
      }
      updates.active = req.body.active;
    }
    if (typeof req.body?.password === 'string' && req.body.password.length > 0) {
      if (targetIsPrimaryAdmin && !isPrimaryAdmin) {
        res.status(403).json({ error: 'Você não pode alterar a senha do administrador principal.' });
        return;
      }
      if (req.body.password.length < 6) {
        res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
        return;
      }
      updates.passwordHash = hashPassword(req.body.password);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Nenhuma alteração informada.' });
      return;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, targetId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
      });

    if (!updated) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    res.json({ user: updated });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ error: 'Erro ao atualizar conta.' });
  }
});

// ============================================================================
// MEMBER INTAKE FORM (FICHA DE INGRESSO)
// ============================================================================

apiRouter.get('/profile/me', requireAuth, async (req, res) => {
  try {
    const [profile] = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, req.authUser!.id))
      .limit(1);

    res.json({ profile: profile || null });
  } catch (err) {
    console.error('Erro em GET /profile/me:', err);
    res.status(500).json({ error: 'Erro ao buscar ficha de ingresso.' });
  }
});

apiRouter.put('/profile/me', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const fullName = String(req.body?.fullName || req.authUser!.name).trim();
    if (fullName.length < 2) {
      res.status(400).json({ error: 'Informe o nome completo.' });
      return;
    }

    const nickname = req.body?.nickname ? String(req.body.nickname).trim() : null;
    const rawAge = req.body?.age !== undefined && req.body?.age !== null && req.body?.age !== ''
      ? Number(req.body.age)
      : null;
    const age = rawAge !== null && Number.isInteger(rawAge) && rawAge >= 8 && rawAge <= 99 ? rawAge : null;

    const dominantFoot: DominantFoot = DOMINANT_FEET.includes(req.body?.dominantFoot)
      ? req.body.dominantFoot
      : 'Destro';
    const preferredPosition: PlayerPosition = PLAYER_POSITIONS.includes(req.body?.preferredPosition)
      ? req.body.preferredPosition
      : 'Coringa';
    const bloodType: BloodType = BLOOD_TYPES.includes(req.body?.bloodType)
      ? req.body.bloodType
      : 'Não sei';

    const phone = req.body?.phone ? String(req.body.phone).trim() : null;
    const photoUrl = sanitizeImageUrl(req.body?.photoUrl);
    const emergencyContactName = req.body?.emergencyContactName
      ? String(req.body.emergencyContactName).trim()
      : null;
    const emergencyContactPhone = req.body?.emergencyContactPhone
      ? String(req.body.emergencyContactPhone).trim()
      : null;
    const medicalNotes = req.body?.medicalNotes ? String(req.body.medicalNotes).trim() : null;
    const preExistingConditions = req.body?.preExistingConditions
      ? String(req.body.preExistingConditions).trim()
      : null;
    const routineMedications = req.body?.routineMedications
      ? String(req.body.routineMedications).trim()
      : null;
    const allergies = req.body?.allergies ? String(req.body.allergies).trim() : null;

    const initScores: SkillScores = {
      dribbling: clampScore(req.body?.initDribbling, 6),
      physical: clampScore(req.body?.initPhysical, 6),
      passing: clampScore(req.body?.initPassing, 6),
      attack: clampScore(req.body?.initAttack, 6),
      defense: clampScore(req.body?.initDefense, 6),
      shooting: clampScore(req.body?.initShooting, 6),
    };
    const initOverall = computeOverall(initScores);

    const profileCompleted = Boolean(
      fullName &&
        emergencyContactName &&
        emergencyContactPhone &&
        bloodType
    );

    const [existing] = await db
      .select({ id: memberProfiles.id })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    let savedProfile;
    if (existing) {
      [savedProfile] = await db
        .update(memberProfiles)
        .set({
          fullName,
          nickname,
          age,
          dominantFoot,
          preferredPosition,
          phone,
          photoUrl,
          emergencyContactName,
          emergencyContactPhone,
          bloodType,
          medicalNotes,
          preExistingConditions,
          routineMedications,
          allergies,
          initDribbling: initScores.dribbling,
          initPhysical: initScores.physical,
          initPassing: initScores.passing,
          initAttack: initScores.attack,
          initDefense: initScores.defense,
          initShooting: initScores.shooting,
          initOverall,
          profileCompleted,
          updatedAt: new Date(),
        })
        .where(eq(memberProfiles.userId, userId))
        .returning();
    } else {
      [savedProfile] = await db
        .insert(memberProfiles)
        .values({
          userId,
          fullName,
          nickname,
          age,
          dominantFoot,
          preferredPosition,
          phone,
          photoUrl,
          emergencyContactName,
          emergencyContactPhone,
          bloodType,
          medicalNotes,
          preExistingConditions,
          routineMedications,
          allergies,
          initDribbling: initScores.dribbling,
          initPhysical: initScores.physical,
          initPassing: initScores.passing,
          initAttack: initScores.attack,
          initDefense: initScores.defense,
          initShooting: initScores.shooting,
          initOverall,
          profileCompleted,
        })
        .returning();
    }

    await db.update(users).set({ name: fullName }).where(eq(users.id, userId));

    res.json({ profile: savedProfile });
  } catch (err) {
    console.error('Erro em PUT /profile/me:', err);
    res.status(500).json({ error: 'Erro ao salvar ficha de ingresso.' });
  }
});

// Admin-only (or self) view of sensitive medical intake profile
apiRouter.get('/users/:userId/profile', requireAuth, async (req, res) => {
  try {
    const targetUserId = parsePositiveInt(req.params.userId);
    if (!targetUserId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const isSelf = req.authUser!.id === targetUserId;
    const isAdmin = req.authUser!.role === 'admin';
    if (!isSelf && !isAdmin) {
      res.status(403).json({
        error: 'Informações médicas e de emergência são restritas ao próprio membro e aos administradores.',
      });
      return;
    }

    const [profile] = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, targetUserId))
      .limit(1);

    if (!profile) {
      res.status(404).json({ error: 'Ficha de ingresso não encontrada.' });
      return;
    }

    res.json({ profile });
  } catch (err) {
    console.error('Erro ao buscar ficha do usuário:', err);
    res.status(500).json({ error: 'Erro ao carregar ficha de ingresso.' });
  }
});

// ============================================================================
// WEEKLY PELADAS (PELADAS FIXAS DA SEMANA)
// ============================================================================

apiRouter.get('/peladas', attachAuthIfPresent, async (req, res) => {
  try {
    const peladas = await db
      .select()
      .from(weeklyPeladas)
      .orderBy(asc(weeklyPeladas.id));

    const memberships = await db.select().from(peladaMemberships);
    const finances = await db
      .select({
        peladaId: financeTransactions.peladaId,
        type: financeTransactions.type,
        amount: financeTransactions.amount,
      })
      .from(financeTransactions);

    const enriched = peladas.map((p) => {
      const pMembers = memberships.filter((m) => m.peladaId === p.id && m.active);
      const mensalistas = pMembers.filter((m) => m.category === 'mensalista').length;
      const myM = req.authUser
        ? memberships.find((m) => m.peladaId === p.id && m.userId === req.authUser!.id) || null
        : null;
      const pFin = finances.filter((f) => f.peladaId === p.id);
      const income = pFin.filter((f) => f.type === 'income').reduce((s, f) => s + f.amount, 0);
      const expense = pFin.filter((f) => f.type === 'expense').reduce((s, f) => s + f.amount, 0);

      return {
        ...p,
        memberCount: pMembers.length,
        mensalistaCount: mensalistas,
        myMembership: myM,
        balance: Math.round((income - expense) * 100) / 100,
      };
    });

    res.json({ peladas: enriched });
  } catch (err) {
    console.error('Erro em GET /peladas:', err);
    res.status(500).json({ error: 'Erro ao carregar peladas fixas.' });
  }
});

apiRouter.post('/peladas', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const weekday = WEEKDAYS.includes(req.body?.weekday)
      ? req.body.weekday
      : 'Quarta-feira';
    const startTime = String(req.body?.startTime || '20:00').trim();
    const endTime = String(req.body?.endTime || '22:00').trim();
    const location = String(req.body?.location || '').trim();
    const address = req.body?.address ? String(req.body.address).trim() : null;
    const playersPerTeam = Math.max(3, Math.min(11, Number(req.body?.playersPerTeam) || 5));
    const defaultTeamsCount = Math.max(2, Math.min(6, Number(req.body?.defaultTeamsCount) || 2));
    const rawMax = req.body?.maxPlayers;
    const maxPlayers =
      rawMax !== null && rawMax !== undefined && rawMax !== '' && Number(rawMax) > 0
        ? Math.min(100, Math.floor(Number(rawMax)))
        : null;

    const pixKey = String(req.body?.pixKey || '').trim();
    const avulsoFee = parseNonNegativeMoney(req.body?.avulsoFee, 0);
    const mensalistaFee = parseNonNegativeMoney(req.body?.mensalistaFee, 0);
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    if (name.length < 2) {
      res.status(400).json({ error: 'Informe o nome da pelada fixa.' });
      return;
    }
    if (location.length < 2) {
      res.status(400).json({ error: 'Informe o local/quadra da pelada.' });
      return;
    }

    const [created] = await db
      .insert(weeklyPeladas)
      .values({
        name,
        weekday,
        startTime,
        endTime,
        location,
        address,
        playersPerTeam,
        defaultTeamsCount,
        maxPlayers,
        pixKey,
        avulsoFee,
        mensalistaFee,
        notes,
        createdByUserId: req.authUser!.id,
      })
      .returning();

    res.status(201).json({ pelada: created });
  } catch (err) {
    console.error('Erro em POST /peladas:', err);
    res.status(500).json({ error: 'Erro ao cadastrar pelada fixa.' });
  }
});

apiRouter.put('/peladas/:peladaId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    if (!peladaId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const weekday = WEEKDAYS.includes(req.body?.weekday)
      ? req.body.weekday
      : 'Quarta-feira';
    const startTime = String(req.body?.startTime || '20:00').trim();
    const endTime = String(req.body?.endTime || '22:00').trim();
    const location = String(req.body?.location || '').trim();
    const address = req.body?.address ? String(req.body.address).trim() : null;
    const playersPerTeam = Math.max(3, Math.min(11, Number(req.body?.playersPerTeam) || 5));
    const defaultTeamsCount = Math.max(2, Math.min(6, Number(req.body?.defaultTeamsCount) || 2));
    const rawMax = req.body?.maxPlayers;
    const maxPlayers =
      rawMax !== null && rawMax !== undefined && rawMax !== '' && Number(rawMax) > 0
        ? Math.min(100, Math.floor(Number(rawMax)))
        : null;

    const pixKey = String(req.body?.pixKey || '').trim();
    const avulsoFee = parseNonNegativeMoney(req.body?.avulsoFee, 0);
    const mensalistaFee = parseNonNegativeMoney(req.body?.mensalistaFee, 0);
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    if (name.length < 2 || location.length < 2) {
      res.status(400).json({ error: 'Nome e local da pelada são obrigatórios.' });
      return;
    }

    const [updated] = await db
      .update(weeklyPeladas)
      .set({
        name,
        weekday,
        startTime,
        endTime,
        location,
        address,
        playersPerTeam,
        defaultTeamsCount,
        maxPlayers,
        pixKey,
        avulsoFee,
        mensalistaFee,
        notes,
      })
      .where(eq(weeklyPeladas.id, peladaId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    res.json({ pelada: updated });
  } catch (err) {
    console.error('Erro em PUT /peladas/:id:', err);
    res.status(500).json({ error: 'Erro ao atualizar pelada fixa.' });
  }
});

apiRouter.delete('/peladas/:peladaId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    if (!peladaId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const [deleted] = await db
      .delete(weeklyPeladas)
      .where(eq(weeklyPeladas.id, peladaId))
      .returning({ id: weeklyPeladas.id });

    if (!deleted) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('Erro em DELETE /peladas/:id:', err);
    res.status(500).json({ error: 'Erro ao excluir pelada.' });
  }
});

// ============================================================================
// MEMBERSHIPS & DISTINCT PER-PELADA 6-CRITERIA RATINGS
// ============================================================================

apiRouter.get('/peladas/:peladaId/members', requireAuth, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    if (!peladaId) {
      res.status(400).json({ error: 'ID da pelada inválido.' });
      return;
    }

    const rows = await db
      .select({
        id: peladaMemberships.id,
        peladaId: peladaMemberships.peladaId,
        userId: peladaMemberships.userId,
        category: peladaMemberships.category,
        active: peladaMemberships.active,
        dribbling: peladaMemberships.dribbling,
        physical: peladaMemberships.physical,
        passing: peladaMemberships.passing,
        attack: peladaMemberships.attack,
        defense: peladaMemberships.defense,
        shooting: peladaMemberships.shooting,
        overall: peladaMemberships.overall,
        joinedAt: peladaMemberships.joinedAt,
        updatedAt: peladaMemberships.updatedAt,
        userName: users.name,
        userEmail: users.email,
        userRole: users.role,
        nickname: memberProfiles.nickname,
        preferredPosition: memberProfiles.preferredPosition,
        dominantFoot: memberProfiles.dominantFoot,
        age: memberProfiles.age,
        photoUrl: memberProfiles.photoUrl,
        profileCompleted: memberProfiles.profileCompleted,
      })
      .from(peladaMemberships)
      .innerJoin(users, eq(users.id, peladaMemberships.userId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, peladaMemberships.userId))
      .where(eq(peladaMemberships.peladaId, peladaId))
      .orderBy(asc(peladaMemberships.category), desc(peladaMemberships.overall), asc(users.name));

    const allCounts = await db
      .select({
        userId: peladaMemberships.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(peladaMemberships)
      .where(ne(peladaMemberships.peladaId, peladaId))
      .groupBy(peladaMemberships.userId);

    const countMap = new Map(allCounts.map((c) => [c.userId, c.count]));
    const members = rows.map((r) => ({
      ...r,
      otherPeladasCount: countMap.get(r.userId) || 0,
    }));

    res.json({ members });
  } catch (err) {
    console.error('Erro em GET /peladas/:id/members:', err);
    res.status(500).json({ error: 'Erro ao listar membros da pelada.' });
  }
});

// Self-join a pelada (peladeiro) — initializes scores from their ficha de ingresso
apiRouter.post('/peladas/:peladaId/join', requireAuth, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    if (!peladaId) {
      res.status(400).json({ error: 'ID da pelada inválido.' });
      return;
    }

    const userId = req.authUser!.id;
    const [existing] = await db
      .select()
      .from(peladaMemberships)
      .where(and(eq(peladaMemberships.peladaId, peladaId), eq(peladaMemberships.userId, userId)))
      .limit(1);

    if (existing) {
      res.json({ membership: existing });
      return;
    }

    const [profile] = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    const scores: SkillScores = {
      dribbling: profile?.initDribbling ?? 6,
      physical: profile?.initPhysical ?? 6,
      passing: profile?.initPassing ?? 6,
      attack: profile?.initAttack ?? 6,
      defense: profile?.initDefense ?? 6,
      shooting: profile?.initShooting ?? 6,
    };
    const overall = computeOverall(scores);

    const [membership] = await db
      .insert(peladaMemberships)
      .values({
        peladaId,
        userId,
        category: 'avulso',
        active: true,
        dribbling: scores.dribbling,
        physical: scores.physical,
        passing: scores.passing,
        attack: scores.attack,
        defense: scores.defense,
        shooting: scores.shooting,
        overall,
      })
      .returning();

    res.status(201).json({ membership });
  } catch (err) {
    console.error('Erro em POST /peladas/:id/join:', err);
    res.status(500).json({ error: 'Erro ao ingressar na pelada.' });
  }
});

// Admin adds a registered user to a pelada (optionally setting category & distinct ratings)
apiRouter.post('/peladas/:peladaId/members', requireAuth, requireAdmin, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    const userId = parsePositiveInt(req.body?.userId);
    if (!peladaId || !userId) {
      res.status(400).json({ error: 'Pelada ou usuário inválido.' });
      return;
    }

    const category: MemberCategory =
      req.body?.category === 'mensalista' ? 'mensalista' : 'avulso';

    const [existing] = await db
      .select({ id: peladaMemberships.id })
      .from(peladaMemberships)
      .where(and(eq(peladaMemberships.peladaId, peladaId), eq(peladaMemberships.userId, userId)))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'Este membro já faz parte desta pelada fixa.' });
      return;
    }

    const [profile] = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    const scores: SkillScores = {
      dribbling: clampScore(req.body?.dribbling ?? profile?.initDribbling, 6),
      physical: clampScore(req.body?.physical ?? profile?.initPhysical, 6),
      passing: clampScore(req.body?.passing ?? profile?.initPassing, 6),
      attack: clampScore(req.body?.attack ?? profile?.initAttack, 6),
      defense: clampScore(req.body?.defense ?? profile?.initDefense, 6),
      shooting: clampScore(req.body?.shooting ?? profile?.initShooting, 6),
    };
    const overall = computeOverall(scores);

    const [membership] = await db
      .insert(peladaMemberships)
      .values({
        peladaId,
        userId,
        category,
        active: true,
        ...scores,
        overall,
      })
      .returning();

    res.status(201).json({ membership });
  } catch (err) {
    console.error('Erro em POST /peladas/:id/members:', err);
    res.status(500).json({ error: 'Erro ao adicionar membro à pelada.' });
  }
});

// Admin updates member category (mensalista/avulso) or distinct 6-criteria scores for THIS pelada only
apiRouter.patch(
  '/peladas/:peladaId/members/:membershipId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const peladaId = parsePositiveInt(req.params.peladaId);
      const membershipId = parsePositiveInt(req.params.membershipId);
      if (!peladaId || !membershipId) {
        res.status(400).json({ error: 'Identificadores inválidos.' });
        return;
      }

      const [current] = await db
        .select()
        .from(peladaMemberships)
        .where(and(eq(peladaMemberships.id, membershipId), eq(peladaMemberships.peladaId, peladaId)))
        .limit(1);

      if (!current) {
        res.status(404).json({ error: 'Vínculo do membro não encontrado nesta pelada.' });
        return;
      }

      const category: MemberCategory =
        req.body?.category === 'mensalista'
          ? 'mensalista'
          : req.body?.category === 'avulso'
            ? 'avulso'
            : (current.category as MemberCategory);

      const active =
        typeof req.body?.active === 'boolean' ? req.body.active : current.active;

      const scores: SkillScores = {
        dribbling: clampScore(req.body?.dribbling, current.dribbling),
        physical: clampScore(req.body?.physical, current.physical),
        passing: clampScore(req.body?.passing, current.passing),
        attack: clampScore(req.body?.attack, current.attack),
        defense: clampScore(req.body?.defense, current.defense),
        shooting: clampScore(req.body?.shooting, current.shooting),
      };
      const overall = computeOverall(scores);

      const [updated] = await db
        .update(peladaMemberships)
        .set({
          category,
          active,
          dribbling: scores.dribbling,
          physical: scores.physical,
          passing: scores.passing,
          attack: scores.attack,
          defense: scores.defense,
          shooting: scores.shooting,
          overall,
          updatedAt: new Date(),
        })
        .where(eq(peladaMemberships.id, membershipId))
        .returning();

      // Mantém snapshot da categoria sincronizado nos encontros abertos
      await db
        .update(encounterAttendances)
        .set({ categorySnapshot: category })
        .where(eq(encounterAttendances.membershipId, membershipId));

      res.json({ membership: updated });
    } catch (err) {
      console.error('Erro em PATCH /peladas/:id/members/:membershipId:', err);
      res.status(500).json({ error: 'Erro ao atualizar notas/categoria do membro.' });
    }
  }
);

apiRouter.delete(
  '/peladas/:peladaId/members/:membershipId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const peladaId = parsePositiveInt(req.params.peladaId);
      const membershipId = parsePositiveInt(req.params.membershipId);
      if (!peladaId || !membershipId) {
        res.status(400).json({ error: 'Identificadores inválidos.' });
        return;
      }

      const [deleted] = await db
        .delete(peladaMemberships)
        .where(and(eq(peladaMemberships.id, membershipId), eq(peladaMemberships.peladaId, peladaId)))
        .returning({ id: peladaMemberships.id });

      if (!deleted) {
        res.status(404).json({ error: 'Membro não encontrado nesta pelada.' });
        return;
      }

      res.json({ deleted: true });
    } catch (err) {
      console.error('Erro em DELETE /peladas/:id/members/:membershipId:', err);
      res.status(500).json({ error: 'Erro ao remover membro da pelada.' });
    }
  }
);

// ============================================================================
// ENCOUNTERS, ATTENDANCE (MENSALISTA PRIORITY) & TEAM DRAW
// ============================================================================

apiRouter.get('/peladas/:peladaId/encounters', requireAuth, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    if (!peladaId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const encRows = await db
      .select()
      .from(peladaEncounters)
      .where(eq(peladaEncounters.peladaId, peladaId))
      .orderBy(desc(peladaEncounters.eventDate), desc(peladaEncounters.id));

    const allAtt = await db
      .select({
        encounterId: encounterAttendances.encounterId,
        userId: encounterAttendances.userId,
        status: encounterAttendances.status,
        category: peladaMemberships.category,
      })
      .from(encounterAttendances)
      .innerJoin(peladaMemberships, eq(peladaMemberships.id, encounterAttendances.membershipId))
      .innerJoin(peladaEncounters, eq(peladaEncounters.id, encounterAttendances.encounterId))
      .where(eq(peladaEncounters.peladaId, peladaId));

    const draws = await db
      .select({ encounterId: encounterTeamDraws.encounterId })
      .from(encounterTeamDraws)
      .innerJoin(peladaEncounters, eq(peladaEncounters.id, encounterTeamDraws.encounterId))
      .where(eq(peladaEncounters.peladaId, peladaId));

    const drawSet = new Set(draws.map((d) => d.encounterId));

    const encounters = encRows.map((enc) => {
      const att = allAtt.filter((a) => a.encounterId === enc.id);
      const confirmed = att.filter((a) => a.status === 'confirmed');
      const absent = att.filter((a) => a.status === 'absent');
      const mensalistaConfirmed = confirmed.filter((a) => a.category === 'mensalista');
      const mine = att.find((a) => a.userId === req.authUser!.id);

      return {
        ...enc,
        confirmedCount: confirmed.length,
        absentCount: absent.length,
        mensalistaConfirmedCount: mensalistaConfirmed.length,
        myAttendanceStatus: (mine?.status as AttendanceStatus) || null,
        hasTeamDraw: drawSet.has(enc.id),
      };
    });

    res.json({ encounters });
  } catch (err) {
    console.error('Erro em GET /peladas/:id/encounters:', err);
    res.status(500).json({ error: 'Erro ao carregar encontros.' });
  }
});

apiRouter.post('/peladas/:peladaId/encounters', requireAuth, requireAdmin, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    if (!peladaId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const [pelada] = await db
      .select()
      .from(weeklyPeladas)
      .where(eq(weeklyPeladas.id, peladaId))
      .limit(1);

    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const eventDate = String(req.body?.eventDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      res.status(400).json({ error: 'Informe uma data válida (AAAA-MM-DD).' });
      return;
    }

    const title = String(req.body?.title || `${pelada.name} — ${eventDate}`).trim();
    const startTime = String(req.body?.startTime || pelada.startTime).trim();
    const endTime = String(req.body?.endTime || pelada.endTime).trim();
    const rawMax = req.body?.maxPlayers;
    const maxPlayers =
      rawMax !== null && rawMax !== undefined && rawMax !== '' && Number(rawMax) > 0
        ? Math.min(100, Math.floor(Number(rawMax)))
        : pelada.maxPlayers;

    const [created] = await db
      .insert(peladaEncounters)
      .values({
        peladaId,
        title,
        eventDate,
        startTime,
        endTime,
        maxPlayers,
        status: 'open',
        createdByUserId: req.authUser!.id,
      })
      .returning();

    res.status(201).json({ encounter: created });
  } catch (err) {
    console.error('Erro em POST /peladas/:id/encounters:', err);
    res.status(500).json({ error: 'Erro ao criar encontro.' });
  }
});

async function loadEncounterDetails(encounterId: number) {
  const [encounter] = await db
    .select()
    .from(peladaEncounters)
    .where(eq(peladaEncounters.id, encounterId))
    .limit(1);

  if (!encounter) return null;

  const [pelada] = await db
    .select()
    .from(weeklyPeladas)
    .where(eq(weeklyPeladas.id, encounter.peladaId))
    .limit(1);

  const rawRows = await db
    .select({
      id: encounterAttendances.id,
      encounterId: encounterAttendances.encounterId,
      membershipId: encounterAttendances.membershipId,
      userId: encounterAttendances.userId,
      status: encounterAttendances.status,
      confirmedAt: encounterAttendances.confirmedAt,
      category: peladaMemberships.category,
      dribbling: peladaMemberships.dribbling,
      physical: peladaMemberships.physical,
      passing: peladaMemberships.passing,
      attack: peladaMemberships.attack,
      defense: peladaMemberships.defense,
      shooting: peladaMemberships.shooting,
      overall: peladaMemberships.overall,
      userName: users.name,
      nickname: memberProfiles.nickname,
      preferredPosition: memberProfiles.preferredPosition,
      dominantFoot: memberProfiles.dominantFoot,
      photoUrl: memberProfiles.photoUrl,
    })
    .from(encounterAttendances)
    .innerJoin(peladaMemberships, eq(peladaMemberships.id, encounterAttendances.membershipId))
    .innerJoin(users, eq(users.id, encounterAttendances.userId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, encounterAttendances.userId))
    .where(eq(encounterAttendances.encounterId, encounterId));

  // Regra de prioridade: Mensalistas sempre vêm antes de Avulsos entre os confirmados!
  const confirmedSorted = rawRows
    .filter((r) => r.status === 'confirmed')
    .sort((a, b) => {
      const tierA = a.category === 'mensalista' ? 0 : 1;
      const tierB = b.category === 'mensalista' ? 0 : 1;
      if (tierA !== tierB) return tierA - tierB;
      return new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime();
    });

  const absentSorted = rawRows
    .filter((r) => r.status === 'absent')
    .sort((a, b) => a.userName.localeCompare(b.userName));

  const maxCap = encounter.maxPlayers ?? pelada?.maxPlayers ?? null;

  const attendances: EncounterAttendanceItem[] = [
    ...confirmedSorted.map((r, idx) => {
      const rank = idx + 1;
      return {
        id: r.id,
        encounterId: r.encounterId,
        membershipId: r.membershipId,
        userId: r.userId,
        status: 'confirmed' as const,
        category: (r.category === 'mensalista' ? 'mensalista' : 'avulso') as MemberCategory,
        confirmedAt: r.confirmedAt.toISOString(),
        userName: r.userName,
        nickname: r.nickname,
        preferredPosition: (r.preferredPosition || 'Coringa') as PlayerPosition,
        dominantFoot: (r.dominantFoot || 'Destro') as DominantFoot,
        photoUrl: r.photoUrl,
        overall: r.overall,
        dribbling: r.dribbling,
        physical: r.physical,
        passing: r.passing,
        attack: r.attack,
        defense: r.defense,
        shooting: r.shooting,
        priorityRank: rank,
        inMainSquad: maxCap ? rank <= maxCap : true,
      };
    }),
    ...absentSorted.map((r) => ({
      id: r.id,
      encounterId: r.encounterId,
      membershipId: r.membershipId,
      userId: r.userId,
      status: 'absent' as const,
      category: (r.category === 'mensalista' ? 'mensalista' : 'avulso') as MemberCategory,
      confirmedAt: r.confirmedAt.toISOString(),
      userName: r.userName,
      nickname: r.nickname,
      preferredPosition: (r.preferredPosition || 'Coringa') as PlayerPosition,
      dominantFoot: (r.dominantFoot || 'Destro') as DominantFoot,
      photoUrl: r.photoUrl,
      overall: r.overall,
      dribbling: r.dribbling,
      physical: r.physical,
      passing: r.passing,
      attack: r.attack,
      defense: r.defense,
      shooting: r.shooting,
      priorityRank: null,
      inMainSquad: false,
    })),
  ];

  const [latestDrawRow] = await db
    .select()
    .from(encounterTeamDraws)
    .where(eq(encounterTeamDraws.encounterId, encounterId))
    .orderBy(desc(encounterTeamDraws.id))
    .limit(1);

  let latestDraw = null;
  if (latestDrawRow) {
    try {
      latestDraw = {
        id: latestDrawRow.id,
        encounterId: latestDrawRow.encounterId,
        teamsCount: latestDrawRow.teamsCount,
        playersPerTeam: latestDrawRow.playersPerTeam,
        teams: JSON.parse(latestDrawRow.teamsJson) as DrawnTeam[],
        createdAt: latestDrawRow.createdAt.toISOString(),
      };
    } catch {
      latestDraw = null;
    }
  }

  return { encounter, pelada, attendances, latestDraw };
}

apiRouter.get('/encounters/:encounterId', requireAuth, async (req, res) => {
  try {
    const encounterId = parsePositiveInt(req.params.encounterId);
    if (!encounterId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const details = await loadEncounterDetails(encounterId);
    if (!details) {
      res.status(404).json({ error: 'Encontro não encontrado.' });
      return;
    }

    res.json(details);
  } catch (err) {
    console.error('Erro em GET /encounters/:id:', err);
    res.status(500).json({ error: 'Erro ao carregar detalhes do encontro.' });
  }
});

apiRouter.post('/encounters/:encounterId/attendance', requireAuth, async (req, res) => {
  try {
    const encounterId = parsePositiveInt(req.params.encounterId);
    if (!encounterId) {
      res.status(400).json({ error: 'ID do encontro inválido.' });
      return;
    }

    const status: AttendanceStatus = req.body?.status === 'absent' ? 'absent' : 'confirmed';
    const requestedUserId = req.body?.userId ? parsePositiveInt(req.body.userId) : null;
    const targetUserId =
      requestedUserId && req.authUser!.role === 'admin' ? requestedUserId : req.authUser!.id;

    const [encounter] = await db
      .select()
      .from(peladaEncounters)
      .where(eq(peladaEncounters.id, encounterId))
      .limit(1);

    if (!encounter) {
      res.status(404).json({ error: 'Encontro não encontrado.' });
      return;
    }

    let [membership] = await db
      .select()
      .from(peladaMemberships)
      .where(
        and(
          eq(peladaMemberships.peladaId, encounter.peladaId),
          eq(peladaMemberships.userId, targetUserId)
        )
      )
      .limit(1);

    // Se o próprio peladeiro ainda não tinha vínculo nesta pelada, cria vínculo inicial avulso usando a ficha de ingresso
    if (!membership) {
      const [profile] = await db
        .select()
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, targetUserId))
        .limit(1);

      const scores: SkillScores = {
        dribbling: profile?.initDribbling ?? 6,
        physical: profile?.initPhysical ?? 6,
        passing: profile?.initPassing ?? 6,
        attack: profile?.initAttack ?? 6,
        defense: profile?.initDefense ?? 6,
        shooting: profile?.initShooting ?? 6,
      };

      [membership] = await db
        .insert(peladaMemberships)
        .values({
          peladaId: encounter.peladaId,
          userId: targetUserId,
          category: 'avulso',
          active: true,
          ...scores,
          overall: computeOverall(scores),
        })
        .returning();
    }

    const [existingAtt] = await db
      .select()
      .from(encounterAttendances)
      .where(
        and(
          eq(encounterAttendances.encounterId, encounterId),
          eq(encounterAttendances.userId, targetUserId)
        )
      )
      .limit(1);

    const now = new Date();
    if (existingAtt) {
      await db
        .update(encounterAttendances)
        .set({
          status,
          categorySnapshot: membership.category,
          confirmedAt: status === 'confirmed' && existingAtt.status !== 'confirmed' ? now : existingAtt.confirmedAt,
          updatedAt: now,
        })
        .where(eq(encounterAttendances.id, existingAtt.id));
    } else {
      await db.insert(encounterAttendances).values({
        encounterId,
        membershipId: membership.id,
        userId: targetUserId,
        status,
        categorySnapshot: membership.category,
        confirmedAt: now,
        updatedAt: now,
      });
    }

    const details = await loadEncounterDetails(encounterId);
    res.json(details);
  } catch (err) {
    console.error('Erro em POST /encounters/:id/attendance:', err);
    res.status(500).json({ error: 'Erro ao registrar presença/ausência.' });
  }
});

apiRouter.post('/encounters/:encounterId/draw', requireAuth, requireAdmin, async (req, res) => {
  try {
    const encounterId = parsePositiveInt(req.params.encounterId);
    if (!encounterId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const details = await loadEncounterDetails(encounterId);
    if (!details) {
      res.status(404).json({ error: 'Encontro não encontrado.' });
      return;
    }

    const confirmedMain = details.attendances.filter(
      (a) => a.status === 'confirmed' && a.inMainSquad
    );

    if (confirmedMain.length < 2) {
      res.status(400).json({
        error: 'É necessário ter pelo menos 2 jogadores confirmados para sortear os times.',
      });
      return;
    }

    const requestedTeams = Number(req.body?.teamsCount) || details.pelada?.defaultTeamsCount || 2;
    const teamsCount = Math.max(2, Math.min(6, Math.min(requestedTeams, confirmedMain.length)));
    const playersPerTeam = details.pelada?.playersPerTeam || Math.ceil(confirmedMain.length / teamsCount);

    const teams = drawBalancedTeams(
      confirmedMain.map((a) => ({
        userId: a.userId,
        membershipId: a.membershipId,
        name: a.userName,
        nickname: a.nickname,
        position: a.preferredPosition,
        category: a.category,
        overall: a.overall,
        scores: {
          dribbling: a.dribbling,
          physical: a.physical,
          passing: a.passing,
          attack: a.attack,
          defense: a.defense,
          shooting: a.shooting,
        },
      })),
      teamsCount
    );

    await db.insert(encounterTeamDraws).values({
      encounterId,
      teamsCount,
      playersPerTeam,
      teamsJson: JSON.stringify(teams),
      drawnByUserId: req.authUser!.id,
    });

    await db
      .update(peladaEncounters)
      .set({ status: 'drawn' })
      .where(eq(peladaEncounters.id, encounterId));

    const updatedDetails = await loadEncounterDetails(encounterId);
    res.json(updatedDetails);
  } catch (err) {
    console.error('Erro em POST /encounters/:id/draw:', err);
    res.status(500).json({ error: 'Erro ao sortear times.' });
  }
});

apiRouter.delete('/encounters/:encounterId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const encounterId = parsePositiveInt(req.params.encounterId);
    if (!encounterId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const [deleted] = await db
      .delete(peladaEncounters)
      .where(eq(peladaEncounters.id, encounterId))
      .returning({ id: peladaEncounters.id });

    if (!deleted) {
      res.status(404).json({ error: 'Encontro não encontrado.' });
      return;
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('Erro em DELETE /encounters/:id:', err);
    res.status(500).json({ error: 'Erro ao excluir encontro.' });
  }
});

// ============================================================================
// FINANCIAL FLOW WITH RECEIPT IMAGE PROOF (FLUXO FINANCEIRO & COMPROVANTES)
// ============================================================================

apiRouter.get('/peladas/:peladaId/finance', requireAuth, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    if (!peladaId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const [pelada] = await db
      .select()
      .from(weeklyPeladas)
      .where(eq(weeklyPeladas.id, peladaId))
      .limit(1);

    if (!pelada) {
      res.status(404).json({ error: 'Pelada não encontrada.' });
      return;
    }

    const txRows = await db
      .select({
        id: financeTransactions.id,
        peladaId: financeTransactions.peladaId,
        encounterId: financeTransactions.encounterId,
        relatedUserId: financeTransactions.relatedUserId,
        type: financeTransactions.type,
        category: financeTransactions.category,
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        transactionDate: financeTransactions.transactionDate,
        receiptImageUrl: financeTransactions.receiptImageUrl,
        createdByUserId: financeTransactions.createdByUserId,
        createdAt: financeTransactions.createdAt,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.peladaId, peladaId))
      .orderBy(desc(financeTransactions.transactionDate), desc(financeTransactions.id));

    const userRows = await db
      .select({ id: users.id, name: users.name })
      .from(users);
    const userMap = new Map(userRows.map((u) => [u.id, u.name]));

    const transactions = txRows.map((tx) => ({
      ...tx,
      relatedUserName: tx.relatedUserId ? userMap.get(tx.relatedUserId) || null : null,
      createdByUserName: tx.createdByUserId ? userMap.get(tx.createdByUserId) || null : null,
      createdAt: tx.createdAt.toISOString(),
    }));

    const totalIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    res.json({
      pelada,
      summary: {
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpense: Math.round(totalExpense * 100) / 100,
        balance: Math.round((totalIncome - totalExpense) * 100) / 100,
        transactionsCount: transactions.length,
        receiptsCount: transactions.filter((t) => Boolean(t.receiptImageUrl)).length,
      },
      transactions,
    });
  } catch (err) {
    console.error('Erro em GET /peladas/:id/finance:', err);
    res.status(500).json({ error: 'Erro ao carregar fluxo financeiro.' });
  }
});

apiRouter.post('/peladas/:peladaId/finance', requireAuth, requireAdmin, async (req, res) => {
  try {
    const peladaId = parsePositiveInt(req.params.peladaId);
    if (!peladaId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const type = req.body?.type === 'expense' ? 'expense' : 'income';
    const category = String(req.body?.category || (type === 'income' ? 'Mensalidade' : 'Aluguel de Quadra')).trim();
    const description = String(req.body?.description || '').trim();
    const amount = parseNonNegativeMoney(req.body?.amount, -1);
    const transactionDate = String(req.body?.transactionDate || '').trim();
    const encounterId = req.body?.encounterId ? parsePositiveInt(req.body.encounterId) : null;
    const relatedUserId = req.body?.relatedUserId ? parsePositiveInt(req.body.relatedUserId) : null;
    const receiptImageUrl = sanitizeImageUrl(req.body?.receiptImageUrl, 2_200_000);

    if (description.length < 2) {
      res.status(400).json({ error: 'Informe uma descrição para o lançamento.' });
      return;
    }
    if (amount <= 0) {
      res.status(400).json({ error: 'Informe um valor maior que zero.' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      res.status(400).json({ error: 'Informe uma data válida (AAAA-MM-DD).' });
      return;
    }
    if (req.body?.receiptImageUrl && !receiptImageUrl) {
      res.status(400).json({
        error: 'Imagem de comprovante inválida ou excede o limite (use JPEG, PNG ou WebP).',
      });
      return;
    }

    const [created] = await db
      .insert(financeTransactions)
      .values({
        peladaId,
        encounterId,
        relatedUserId,
        type,
        category,
        description,
        amount,
        transactionDate,
        receiptImageUrl,
        createdByUserId: req.authUser!.id,
      })
      .returning();

    res.status(201).json({ transaction: created });
  } catch (err) {
    console.error('Erro em POST /peladas/:id/finance:', err);
    res.status(500).json({ error: 'Erro ao registrar lançamento financeiro.' });
  }
});

apiRouter.delete('/finance/:txId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const txId = parsePositiveInt(req.params.txId);
    if (!txId) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }

    const [deleted] = await db
      .delete(financeTransactions)
      .where(eq(financeTransactions.id, txId))
      .returning({ id: financeTransactions.id });

    if (!deleted) {
      res.status(404).json({ error: 'Lançamento não encontrado.' });
      return;
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('Erro em DELETE /finance/:txId:', err);
    res.status(500).json({ error: 'Erro ao excluir lançamento.' });
  }
});
