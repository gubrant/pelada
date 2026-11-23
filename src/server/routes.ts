import crypto from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adminNotifications,
  matchEvents,
  matches,
  peladaAttendances,
  peladaFinanceEntries,
  peladaGroupMembers,
  peladaGroups,
  peladaJoinRequests,
  peladaParticipantPayments,
  peladaTeams,
  peladas,
  playerEvaluations,
  playerInitialVotes,
  playerSummaryEmails,
  players,
  seasons,
  users,
} from '../db/schema.ts';
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
} from '../lib/auth-crypto.ts';
import { type AuthRequest, requireAdmin, requireAuth } from '../middleware/auth.ts';
import {
  BASE_CRITERIA_KEYS,
  DEFAULT_GROUP_CRITERIA,
  type GroupCriterion,
  type SevenCriteria,
  computeOverall,
  computeWeightedOverall,
  getGroupCriteriaConfig,
  getPeladaCriteriaConfig,
  getPlayerHistoryAndEvolution,
  getPlayerScoresMap,
  parseCriteriaConfig,
  parseScoresJson,
  recalculatePlayerRatings,
  round2,
} from './ratings.ts';
import {
  computePeladaStats,
  computeSeasonStats,
  recalculatePeladaTeamStandings,
} from './stats.ts';
import { balancePlayersIntoTeams } from './team-balancer.ts';

export const apiRouter = Router();

const VALID_POSITIONS = new Set([
  'Goleiro',
  'Fixo',
  'Ala Direito',
  'Ala Esquerdo',
  'Pivô',
  'Coringa',
]);
const VALID_FEET = new Set(['Destro', 'Canhoto', 'Ambidestro']);
const VALID_CATEGORIES = new Set(['mensalista', 'avulso', 'eventual']);
const VALID_ADMIN_TITLES = new Set([
  'presidente',
  'tesoureiro',
  'presidente_tesoureiro',
  'administrador',
]);
const FINANCIAL_CONFIRMER_TITLES = new Set([
  'presidente',
  'tesoureiro',
  'presidente_tesoureiro',
]);

function categoryPriority(cat: string): number {
  if (cat === 'mensalista') return 0;
  if (cat === 'avulso') return 1;
  return 2;
}

function clampScore(val: unknown, fallback = 7): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n * 10) / 10));
}

function clampIntScore(val: unknown, fallback = 7): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function sanitizeImageUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('data:image/jpeg;base64,') ||
    trimmed.startsWith('data:image/png;base64,') ||
    trimmed.startsWith('data:image/webp;base64,') ||
    trimmed.startsWith('/src/assets/images/') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed.slice(0, 600000);
  }
  return null;
}

async function sendTransactionalEmail(params: {
  toEmail: string;
  subject: string;
  bodyText: string;
}): Promise<'sent' | 'queued'> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return 'queued';
  const from = process.env.EMAIL_FROM?.trim() || 'QuadraMestre <onboarding@resend.dev>';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.toEmail],
        subject: params.subject,
        text: params.bodyText,
      }),
    });
    if (!resp.ok) {
      console.warn('Falha ao enviar e-mail transacional via Resend:', resp.status);
      return 'queued';
    }
    return 'sent';
  } catch (err) {
    console.warn('Erro de rede ao enviar e-mail transacional:', err);
    return 'queued';
  }
}

function maskPlayerForViewer(
  p: typeof players.$inferSelect,
  viewer: AuthRequest['authUser'],
  criteriaConfig?: GroupCriterion[]
) {
  const isAdmin = viewer?.role === 'admin';
  const isOwner = viewer?.id != null && p.userId === viewer.id;
  const initScores = getPlayerScoresMap(p, 'init');
  const curScores = getPlayerScoresMap(p, 'cur');
  const initOverall = criteriaConfig
    ? computeWeightedOverall(initScores, criteriaConfig)
    : p.initOverall;
  const curOverall = criteriaConfig
    ? computeWeightedOverall(curScores, criteriaConfig)
    : p.curOverall;
  const enriched = {
    ...p,
    initOverall,
    curOverall,
    initScores,
    curScores,
  };
  if (isAdmin || isOwner) return enriched;
  return {
    ...enriched,
    phone: null,
    email: null,
  };
}

function clampHalfStepScore(val: unknown, fallback = 7): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n * 2) / 2));
}

async function getPeladaAdminUserIds(groupId?: number | null): Promise<number[]> {
  if (groupId && Number.isInteger(groupId)) {
    const adminIds = new Set<number>();
    const groupRow = await db
      .select({ ownerUserId: peladaGroups.ownerUserId })
      .from(peladaGroups)
      .where(eq(peladaGroups.id, groupId))
      .limit(1);
    if (groupRow[0]?.ownerUserId) {
      adminIds.add(groupRow[0].ownerUserId);
    }

    const memberRows = await db
      .select({
        userId: peladaGroupMembers.userId,
        memberRole: peladaGroupMembers.memberRole,
        userRole: users.role,
        active: users.active,
      })
      .from(peladaGroupMembers)
      .leftJoin(users, eq(peladaGroupMembers.userId, users.id))
      .where(eq(peladaGroupMembers.groupId, groupId));

    for (const m of memberRows) {
      if (m.userId && m.active !== false && (m.memberRole === 'admin' || m.userRole === 'admin')) {
        adminIds.add(m.userId);
      }
    }

    if (adminIds.size === 0) {
      const globalAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.active, true)));
      for (const ga of globalAdmins) adminIds.add(ga.id);
    }
    return Array.from(adminIds);
  }

  const globalAdmins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true)));
  return globalAdmins.map((u) => u.id);
}

async function isUserAdminOfGroup(
  authUser: NonNullable<AuthRequest['authUser']>,
  groupId?: number | null
): Promise<boolean> {
  if (authUser.role === 'admin') return true;
  if (!groupId || !Number.isInteger(groupId)) return false;

  const groupRow = await db
    .select({ ownerUserId: peladaGroups.ownerUserId })
    .from(peladaGroups)
    .where(eq(peladaGroups.id, groupId))
    .limit(1);
  if (groupRow[0]?.ownerUserId === authUser.id) return true;

  const memberRow = await db
    .select({ id: peladaGroupMembers.id })
    .from(peladaGroupMembers)
    .where(
      and(
        eq(peladaGroupMembers.groupId, groupId),
        eq(peladaGroupMembers.userId, authUser.id),
        eq(peladaGroupMembers.memberRole, 'admin')
      )
    )
    .limit(1);
  return memberRow.length > 0;
}

async function getGroupFinancialPermission(
  authUser: NonNullable<AuthRequest['authUser']>,
  groupId: number
): Promise<{
  isGroupAdmin: boolean;
  myAdminTitle: 'presidente' | 'tesoureiro' | 'presidente_tesoureiro' | 'administrador' | null;
  canConfirmPayments: boolean;
}> {
  const groupRows = await db
    .select({ ownerUserId: peladaGroups.ownerUserId })
    .from(peladaGroups)
    .where(eq(peladaGroups.id, groupId))
    .limit(1);
  const isOwner = groupRows[0]?.ownerUserId === authUser.id;

  const conds = [eq(peladaGroupMembers.userId, authUser.id)];
  if (authUser.playerId) conds.push(eq(peladaGroupMembers.playerId, authUser.playerId));

  const memberRows = await db
    .select()
    .from(peladaGroupMembers)
    .where(and(eq(peladaGroupMembers.groupId, groupId), or(...conds)))
    .limit(1);

  const memberRow = memberRows[0] ?? null;
  const isMemberAdmin = memberRow?.memberRole === 'admin';
  const isGroupAdmin = authUser.role === 'admin' || isOwner || isMemberAdmin;

  let myAdminTitle: 'presidente' | 'tesoureiro' | 'presidente_tesoureiro' | 'administrador' | null =
    null;

  if (memberRow?.memberRole === 'admin') {
    if (memberRow.adminTitle && VALID_ADMIN_TITLES.has(memberRow.adminTitle)) {
      myAdminTitle = memberRow.adminTitle as
        | 'presidente'
        | 'tesoureiro'
        | 'presidente_tesoureiro'
        | 'administrador';
    } else if (isOwner) {
      myAdminTitle = 'presidente_tesoureiro';
    } else {
      myAdminTitle = 'administrador';
    }
  } else if (isOwner) {
    myAdminTitle = 'presidente_tesoureiro';
  } else if (authUser.role === 'admin') {
    myAdminTitle = 'administrador';
  }

  const canConfirmPayments =
    myAdminTitle !== null && FINANCIAL_CONFIRMER_TITLES.has(myAdminTitle);

  return { isGroupAdmin, myAdminTitle, canConfirmPayments };
}

async function notifyPeladaAdminsForNewPlayer(params: {
  playerId: number;
  playerNickname: string;
  playerName: string;
  groupId?: number | null;
  creatorUserId?: number | null;
  creatorVoted?: boolean;
}) {
  const { playerId, playerNickname, playerName, groupId, creatorUserId, creatorVoted } = params;
  const adminIds = await getPeladaAdminUserIds(groupId);
  if (adminIds.length === 0) return;

  let groupName: string | null = null;
  if (groupId && Number.isInteger(groupId)) {
    const gRow = await db
      .select({ name: peladaGroups.name })
      .from(peladaGroups)
      .where(eq(peladaGroups.id, groupId))
      .limit(1);
    groupName = gRow[0]?.name ?? null;
  }

  const title = 'Novo cadastro para votação inicial';
  const message = `${playerNickname} (${playerName}) foi cadastrado${
    groupName ? ` em ${groupName}` : ''
  }. Vote nos critérios para compor a nota inicial.`;

  for (const adminId of adminIds) {
    const alreadyVoted = Boolean(creatorVoted && creatorUserId === adminId);
    await db
      .insert(adminNotifications)
      .values({
        recipientUserId: adminId,
        groupId: groupId ?? null,
        playerId,
        type: 'initial_rating_vote',
        title,
        message,
        read: alreadyVoted,
        voted: alreadyVoted,
      })
      .onConflictDoUpdate({
        target: [
          adminNotifications.recipientUserId,
          adminNotifications.playerId,
          adminNotifications.type,
        ],
        set: {
          groupId: groupId ?? null,
          title,
          message,
          ...(alreadyVoted ? { read: true, voted: true } : {}),
        },
      });
  }
}

function isValidLoginIdentifier(val: string): boolean {
  if (!val || val.length < 3 || val.length > 180) return false;
  return /^[a-z0-9._@-]+$/i.test(val);
}

function parseAccessExpiresAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normalizeTimeStr(raw: unknown, fallback = '20:00'): string {
  const s = String(raw ?? '').trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return fallback;
}

function hasEncounterEndTimeReached(eventDate: string, endTime: string, status: string): boolean {
  if (status === 'finished') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return true;
  const normalizedEnd = /^\d{2}:\d{2}$/.test(endTime) ? endTime : '22:00';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const nowDate = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  const nowTime = `${getPart('hour')}:${getPart('minute')}`;
  if (nowDate > eventDate) return true;
  if (nowDate < eventDate) return false;
  return nowTime >= normalizedEnd;
}

function computeEventualExpiration(eventDate?: string | null): Date {
  if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    const [y, m, d] = eventDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 3, 23, 59, 59, 999));
  }
  return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
}

function isMemberAccessActive(
  member: {
    userId?: number | null;
    memberRole: string;
    playerCategory: string;
    accessExpiresAt: Date | string | null;
  },
  ownerUserId?: number | null
): boolean {
  if (ownerUserId != null && member.userId === ownerUserId) return true;
  if (!member.accessExpiresAt) return true;
  return new Date() <= new Date(member.accessExpiresAt);
}

async function hasActiveGroupAccess(
  authUser: NonNullable<AuthRequest['authUser']>,
  groupId?: number | null
): Promise<boolean> {
  if (authUser.role === 'admin') return true;
  if (!groupId || !Number.isInteger(groupId)) return true;

  const groupRows = await db
    .select({ ownerUserId: peladaGroups.ownerUserId })
    .from(peladaGroups)
    .where(eq(peladaGroups.id, groupId))
    .limit(1);
  const ownerUserId = groupRows[0]?.ownerUserId ?? null;
  if (ownerUserId === authUser.id) return true;

  const conds = [eq(peladaGroupMembers.userId, authUser.id)];
  if (authUser.playerId) conds.push(eq(peladaGroupMembers.playerId, authUser.playerId));

  const memberRows = await db
    .select()
    .from(peladaGroupMembers)
    .where(and(eq(peladaGroupMembers.groupId, groupId), or(...conds)));

  return memberRows.some((m) => isMemberAccessActive(m, ownerUserId));
}

async function notifyPeladaAdminsForJoinRequest(params: {
  joinRequestId: number;
  groupId: number;
  playerId: number;
  playerNickname: string;
  playerName: string;
  requestedCategory: string;
}) {
  const { joinRequestId, groupId, playerId, playerNickname, playerName, requestedCategory } = params;
  const adminIds = await getPeladaAdminUserIds(groupId);
  if (adminIds.length === 0) return;

  const gRow = await db
    .select({ name: peladaGroups.name })
    .from(peladaGroups)
    .where(eq(peladaGroups.id, groupId))
    .limit(1);
  const groupName = gRow[0]?.name ?? 'Pelada Fixa';

  const catLabel =
    requestedCategory === 'mensalista'
      ? 'Mensalista'
      : requestedCategory === 'avulso'
        ? 'Avulso'
        : 'Peladeiro Eventual';

  const title = 'Solicitação de acesso à pelada';
  const message = `${playerNickname} (${playerName}) solicitou autorização para entrar em ${groupName} como ${catLabel}.`;

  for (const adminId of adminIds) {
    await db
      .insert(adminNotifications)
      .values({
        recipientUserId: adminId,
        groupId,
        playerId,
        joinRequestId,
        type: 'join_request',
        title,
        message,
        read: false,
        voted: false,
      })
      .onConflictDoUpdate({
        target: [
          adminNotifications.recipientUserId,
          adminNotifications.playerId,
          adminNotifications.type,
        ],
        set: {
          groupId,
          joinRequestId,
          title,
          message,
          read: false,
          voted: false,
          createdAt: new Date(),
        },
      });
  }
}

async function generateSummaryEmailForEventualMember(
  memberRow: typeof peladaGroupMembers.$inferSelect,
  explicitPeladaId?: number | null
) {
  if (!memberRow.playerId) return null;

  const [groupRows, playerRows, userRows] = await Promise.all([
    db.select().from(peladaGroups).where(eq(peladaGroups.id, memberRow.groupId)).limit(1),
    db.select().from(players).where(eq(players.id, memberRow.playerId)).limit(1),
    memberRow.userId
      ? db.select().from(users).where(eq(users.id, memberRow.userId)).limit(1)
      : Promise.resolve([]),
  ]);

  const group = groupRows[0];
  const player = playerRows[0];
  if (!group || !player) return null;

  const toEmail = player.email || userRows[0]?.email || '';

  let targetPeladaId = explicitPeladaId ?? memberRow.accessPeladaId ?? null;
  if (!targetPeladaId) {
    const attPelada = await db
      .select({ peladaId: peladas.id })
      .from(peladaAttendances)
      .innerJoin(peladas, eq(peladaAttendances.peladaId, peladas.id))
      .where(
        and(
          eq(peladaAttendances.playerId, player.id),
          eq(peladaAttendances.present, true),
          eq(peladas.groupId, group.id)
        )
      )
      .orderBy(desc(peladas.eventDate), desc(peladas.id))
      .limit(1);
    targetPeladaId = attPelada[0]?.peladaId ?? null;
  }
  if (!targetPeladaId) {
    const latestGroupPelada = await db
      .select({ id: peladas.id })
      .from(peladas)
      .where(eq(peladas.groupId, group.id))
      .orderBy(desc(peladas.eventDate), desc(peladas.id))
      .limit(1);
    targetPeladaId = latestGroupPelada[0]?.id ?? null;
  }

  let peladaRow: typeof peladas.$inferSelect | null = null;
  let playerStat: {
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goals: number;
    assists: number;
    defenses: number;
    rating: number;
  } = {
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    defenses: 0,
    rating: round2(player.curOverall),
  };

  if (targetPeladaId) {
    const pRows = await db.select().from(peladas).where(eq(peladas.id, targetPeladaId)).limit(1);
    peladaRow = pRows[0] ?? null;
    const stats = await computePeladaStats(targetPeladaId);
    const found = stats?.playersStats.find((ps) => ps.playerId === player.id);
    if (found) {
      playerStat = {
        matchesPlayed: found.matchesPlayed,
        wins: found.wins,
        draws: found.draws,
        losses: found.losses,
        goals: found.goals,
        assists: found.assists,
        defenses: found.defensiveActions,
        rating: round2(player.curOverall),
      };
    }
  }

  const peladaDesc = peladaRow
    ? `${peladaRow.title} (${peladaRow.eventDate} · ${peladaRow.location})`
    : `${group.name} (${group.location})`;

  const subject = `Obrigado por jogar na ${group.name}! Resumo das suas estatísticas`;
  const bodyText = [
    `Olá ${player.nickname} (${player.name})!`,
    ``,
    `Muito obrigado por participar como Peladeiro Eventual em ${peladaDesc}.`,
    `Seu período de acesso temporário após o jogo foi encerrado e preparamos o resumo da sua participação:`,
    ``,
    `• Partidas disputadas: ${playerStat.matchesPlayed}`,
    `• Vitórias / Empates / Derrotas: ${playerStat.wins}V / ${playerStat.draws}E / ${playerStat.losses}D`,
    `• Gols marcados: ${playerStat.goals}`,
    `• Assistências: ${playerStat.assists}`,
    `• Defesas / Desarmes de destaque: ${playerStat.defenses}`,
    `• Nota geral registrada: ${playerStat.rating.toFixed(2)}`,
    ``,
    `Quando quiser voltar a jogar conosco, basta solicitar nova entrada pelo QuadraMestre!`,
  ].join('\n');

  const statsJson = JSON.stringify(playerStat);

  // Check for existing summary email so null peladaId does not duplicate
  const existingEmail = targetPeladaId
    ? await db
        .select()
        .from(playerSummaryEmails)
        .where(
          and(
            eq(playerSummaryEmails.groupId, group.id),
            eq(playerSummaryEmails.peladaId, targetPeladaId),
            eq(playerSummaryEmails.playerId, player.id)
          )
        )
        .limit(1)
    : await db
        .select()
        .from(playerSummaryEmails)
        .where(
          and(
            eq(playerSummaryEmails.groupId, group.id),
            isNull(playerSummaryEmails.peladaId),
            eq(playerSummaryEmails.playerId, player.id)
          )
        )
        .limit(1);

  const resolvedToEmail = toEmail || existingEmail[0]?.toEmail || '';
  const canSendRealEmail =
    resolvedToEmail.includes('@') && !resolvedToEmail.endsWith('.local');
  const deliveryStatus: 'sent' | 'queued' = canSendRealEmail
    ? await sendTransactionalEmail({
        toEmail: resolvedToEmail,
        subject,
        bodyText,
      })
    : 'queued';

  let emailRecord: typeof playerSummaryEmails.$inferSelect;
  if (existingEmail.length > 0) {
    const updated = await db
      .update(playerSummaryEmails)
      .set({
        toEmail: resolvedToEmail || existingEmail[0].toEmail,
        subject,
        bodyText,
        statsJson,
        status: deliveryStatus,
        sentAt: new Date(),
      })
      .where(eq(playerSummaryEmails.id, existingEmail[0].id))
      .returning();
    emailRecord = updated[0];
  } else {
    const inserted = await db
      .insert(playerSummaryEmails)
      .values({
        groupId: group.id,
        peladaId: targetPeladaId,
        userId: memberRow.userId ?? player.userId ?? null,
        playerId: player.id,
        toEmail: resolvedToEmail || 'sem-email@quadramestre.local',
        subject,
        bodyText,
        statsJson,
        status: deliveryStatus,
      })
      .returning();
    emailRecord = inserted[0];
  }

  await db
    .update(peladaGroupMembers)
    .set({ summaryEmailSentAt: new Date() })
    .where(eq(peladaGroupMembers.id, memberRow.id));

  return emailRecord;
}

async function processEventualPostPeladaLifecycle(
  groupId?: number | null,
  options?: { forceFinished?: boolean }
) {
  const conds = [
    eq(peladaGroupMembers.playerCategory, 'eventual'),
    isNull(peladaGroupMembers.summaryEmailSentAt),
  ];
  if (groupId && Number.isInteger(groupId)) {
    conds.push(eq(peladaGroupMembers.groupId, groupId));
  }

  const candidates = await db
    .select()
    .from(peladaGroupMembers)
    .where(and(...conds));

  const now = new Date();
  const generated: Array<typeof playerSummaryEmails.$inferSelect> = [];

  for (const m of candidates) {
    if (m.memberRole === 'admin') continue;
    const isExpired = m.accessExpiresAt != null && new Date(m.accessExpiresAt) <= now;
    let isPeladaFinished = false;
    if (options?.forceFinished && m.accessPeladaId) {
      const pRow = await db
        .select({ status: peladas.status })
        .from(peladas)
        .where(eq(peladas.id, m.accessPeladaId))
        .limit(1);
      isPeladaFinished = pRow[0]?.status === 'finished';
    }
    if (isExpired || isPeladaFinished) {
      const rec = await generateSummaryEmailForEventualMember(m);
      if (rec) generated.push(rec);
    }
  }
  return generated;
}

async function upsertGroupMembership(params: {
  groupId: number;
  userId?: number | null;
  playerId?: number | null;
  memberRole?: 'admin' | 'member';
  adminTitle?: string | null;
  playerCategory?: string;
  accessPeladaId?: number | null;
  accessExpiresAt?: Date | null;
  summaryEmailSentAt?: Date | null;
  resetEventualWindow?: boolean;
}) {
  const {
    groupId,
    userId = null,
    playerId = null,
    memberRole = 'member',
    adminTitle,
    playerCategory,
    accessPeladaId,
    accessExpiresAt,
    summaryEmailSentAt,
    resetEventualWindow = false,
  } = params;
  if (!userId && !playerId) return null;

  const conditions = [];
  if (userId) conditions.push(eq(peladaGroupMembers.userId, userId));
  if (playerId) conditions.push(eq(peladaGroupMembers.playerId, playerId));

  const existing = await db
    .select()
    .from(peladaGroupMembers)
    .where(and(eq(peladaGroupMembers.groupId, groupId), or(...conditions)));

  const resolvedCat = VALID_CATEGORIES.has(playerCategory ?? '') ? playerCategory! : 'mensalista';
  const resolvedAdminTitle =
    adminTitle !== undefined
      ? adminTitle && VALID_ADMIN_TITLES.has(adminTitle)
        ? adminTitle
        : null
      : memberRole === 'admin'
        ? 'administrador'
        : null;

  if (existing.length === 0) {
    const inserted = await db
      .insert(peladaGroupMembers)
      .values({
        groupId,
        userId,
        playerId,
        memberRole,
        adminTitle: memberRole === 'admin' ? resolvedAdminTitle : null,
        playerCategory: resolvedCat,
        accessPeladaId: accessPeladaId ?? null,
        accessExpiresAt: accessExpiresAt ?? null,
        summaryEmailSentAt: summaryEmailSentAt ?? null,
      })
      .returning();
    return inserted[0];
  }

  const primary = existing[0];
  if (existing.length > 1) {
    const extraIds = existing.slice(1).map((r) => r.id);
    await db.delete(peladaGroupMembers).where(inArray(peladaGroupMembers.id, extraIds));
  }

  const mergedUserId = userId ?? existing.find((r) => r.userId != null)?.userId ?? null;
  const mergedPlayerId = playerId ?? existing.find((r) => r.playerId != null)?.playerId ?? null;
  const mergedRole =
    existing.some((r) => r.memberRole === 'admin') || memberRole === 'admin' ? 'admin' : 'member';
  const mergedCategory =
    playerCategory && VALID_CATEGORIES.has(playerCategory)
      ? playerCategory
      : primary.playerCategory;
  const nextAdminTitle =
    adminTitle !== undefined
      ? adminTitle && VALID_ADMIN_TITLES.has(adminTitle)
        ? adminTitle
        : null
      : primary.adminTitle ?? (mergedRole === 'admin' ? 'administrador' : null);

  const updated = await db
    .update(peladaGroupMembers)
    .set({
      userId: mergedUserId,
      playerId: mergedPlayerId,
      memberRole: mergedRole,
      adminTitle: mergedRole === 'admin' ? nextAdminTitle : null,
      playerCategory: mergedCategory,
      ...(accessPeladaId !== undefined ? { accessPeladaId } : {}),
      ...(accessExpiresAt !== undefined ? { accessExpiresAt } : {}),
      ...(resetEventualWindow
        ? { summaryEmailSentAt: null }
        : summaryEmailSentAt !== undefined
          ? { summaryEmailSentAt }
          : {}),
    })
    .where(eq(peladaGroupMembers.id, primary.id))
    .returning();

  return updated[0];
}

async function syncUserPlayerGroupLinks(userId: number, playerId: number) {
  const rows = await db
    .select()
    .from(peladaGroupMembers)
    .where(or(eq(peladaGroupMembers.userId, userId), eq(peladaGroupMembers.playerId, playerId)));

  const groupIds = Array.from(new Set(rows.map((r) => r.groupId)));
  for (const gid of groupIds) {
    await upsertGroupMembership({ groupId: gid, userId, playerId });
  }
}

// ==========================================
// AUTHENTICATION (LOGIN & CADASTRO DIRETO)
// ==========================================

apiRouter.post('/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const rawName = String(req.body?.name ?? '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
      return res.status(400).json({ error: 'Informe um e-mail válido para criar seu login.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 dígitos.' });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0 && existing[0].passwordHash) {
      return res.status(409).json({
        error: 'Este e-mail já possui um login cadastrado. Utilize a tela de entrada.',
      });
    }

    const name = rawName || email.split('@')[0].slice(0, 60) || 'Peladeiro';
    const passwordHash = await hashPassword(password);

    let savedUser: typeof users.$inferSelect;
    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          name: rawName || existing[0].name || name,
          passwordHash,
          inviteToken: null,
          inviteExpiresAt: null,
          mustChangePassword: false,
          active: true,
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      savedUser = updated[0];
    } else {
      const inserted = await db
        .insert(users)
        .values({
          uid: `local:${crypto.randomUUID()}`,
          email,
          name,
          passwordHash,
          role: 'player',
          active: true,
        })
        .returning();
      savedUser = inserted[0];
    }

    const linkedPlayers = await db
      .select()
      .from(players)
      .where(eq(players.userId, savedUser.id))
      .limit(1);

    const role = savedUser.role === 'admin' ? 'admin' : 'player';
    const token = signSessionToken({
      userId: savedUser.id,
      uid: savedUser.uid,
      email: savedUser.email,
      role,
    });

    res.status(201).json({
      token,
      user: {
        id: savedUser.id,
        uid: savedUser.uid,
        email: savedUser.email,
        name: savedUser.name,
        role,
        playerId: linkedPlayers[0]?.id ?? null,
      },
      player: linkedPlayers[0] ?? null,
    });
  } catch (error) {
    console.error('Erro ao criar login e senha:', error);
    res.status(500).json({ error: 'Não foi possível criar seu acesso.' });
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const login = String(req.body?.login ?? req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const groupId = req.body?.groupId ? Number(req.body.groupId) : null;

    if (!login || !password) {
      return res.status(400).json({ error: 'Informe login e senha.' });
    }

    const found = await db.select().from(users).where(eq(users.email, login)).limit(1);
    if (found.length === 0 || !found[0].active) {
      return res.status(401).json({ error: 'Login ou senha inválidos.' });
    }

    const user = found[0];
    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'Esta conta ainda não possui senha definida. Crie uma senha ou peça ao administrador da pelada.',
      });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Login ou senha inválidos.' });
    }

    const linkedPlayers = await db
      .select()
      .from(players)
      .where(eq(players.userId, user.id))
      .limit(1);
    const linkedPlayer = linkedPlayers[0] ?? null;

    let groupAccess: { allowed: boolean; reason?: string; expiredAt?: string | null } | null = null;
    if (groupId && Number.isInteger(groupId)) {
      const gRows = await db
        .select({ id: peladaGroups.id, name: peladaGroups.name, ownerUserId: peladaGroups.ownerUserId })
        .from(peladaGroups)
        .where(eq(peladaGroups.id, groupId))
        .limit(1);
      if (gRows.length === 0) {
        groupAccess = { allowed: false, reason: 'Pelada fixa não encontrada.' };
      } else if (user.role === 'admin' || gRows[0].ownerUserId === user.id) {
        groupAccess = { allowed: true };
      } else {
        const conds = [eq(peladaGroupMembers.userId, user.id)];
        if (linkedPlayer) conds.push(eq(peladaGroupMembers.playerId, linkedPlayer.id));
        const memRows = await db
          .select()
          .from(peladaGroupMembers)
          .where(and(eq(peladaGroupMembers.groupId, groupId), or(...conds)));

        if (memRows.length === 0) {
          groupAccess = {
            allowed: false,
            reason: `Seu login não possui acesso cadastrado para "${gRows[0].name}". Solicite entrada ou peça ao administrador da pelada.`,
          };
        } else {
          const activeMem = memRows.find((m) => isMemberAccessActive(m, gRows[0].ownerUserId));
          if (activeMem) {
            groupAccess = { allowed: true };
          } else {
            const exp = memRows[0].accessExpiresAt;
            const expStr = exp ? new Date(exp).toLocaleDateString('pt-BR') : '';
            groupAccess = {
              allowed: false,
              expiredAt: exp ? new Date(exp).toISOString() : null,
              reason: expStr
                ? `Seu acesso a "${gRows[0].name}" expirou em ${expStr}. Peça ao administrador da pelada para renovar a validade.`
                : `Seu acesso a "${gRows[0].name}" foi encerrado.`,
            };
          }
        }
      }
    }

    const role = user.role === 'admin' ? 'admin' : 'player';
    const token = signSessionToken({
      userId: user.id,
      uid: user.uid,
      email: user.email,
      role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        name: user.name,
        role,
        playerId: linkedPlayer?.id ?? null,
      },
      player: linkedPlayer,
      groupAccess,
    });
  } catch (error) {
    console.error('Erro ao realizar login:', error);
    res.status(500).json({ error: 'Erro interno ao autenticar.' });
  }
});

apiRouter.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    let player = null;
    if (authUser.playerId) {
      const rows = await db.select().from(players).where(eq(players.id, authUser.playerId)).limit(1);
      player = rows[0] ?? null;
    }
    res.json({ user: authUser, player });
  } catch (error) {
    console.error('Erro ao carregar perfil autenticado:', error);
    res.status(500).json({ error: 'Erro ao carregar dados da conta.' });
  }
});

apiRouter.post('/auth/register-profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    const name = String(req.body?.name ?? authUser.name).trim();
    const nickname = String(req.body?.nickname ?? '').trim();
    const age = req.body?.age ? Number(req.body.age) : null;
    const position = VALID_POSITIONS.has(req.body?.position) ? req.body.position : 'Ala Direito';
    const dominantFoot = VALID_FEET.has(req.body?.dominantFoot) ? req.body.dominantFoot : 'Destro';
    const phone = String(req.body?.phone ?? '').trim() || null;
    const email = String(req.body?.email ?? authUser.email).trim().toLowerCase();
    const photoUrl = sanitizeImageUrl(req.body?.photoUrl);

    if (!name || !nickname) {
      return res.status(400).json({ error: 'Nome e apelido são obrigatórios.' });
    }

    await db.update(users).set({ name }).where(eq(users.id, authUser.id));

    const existing = await db
      .select()
      .from(players)
      .where(eq(players.userId, authUser.id))
      .limit(1);

    let savedPlayer: typeof players.$inferSelect;
    let isBrandNewPlayer = false;
    if (existing.length > 0) {
      const updated = await db
        .update(players)
        .set({
          name,
          nickname,
          age: age && Number.isFinite(age) ? Math.max(12, Math.min(80, Math.round(age))) : null,
          position,
          dominantFoot,
          phone,
          email,
          photoUrl: photoUrl ?? existing[0].photoUrl,
          profileCompleted: true,
        })
        .where(eq(players.id, existing[0].id))
        .returning();
      savedPlayer = updated[0];
    } else {
      isBrandNewPlayer = true;
      const inserted = await db
        .insert(players)
        .values({
          userId: authUser.id,
          name,
          nickname,
          age: age && Number.isFinite(age) ? Math.max(12, Math.min(80, Math.round(age))) : null,
          position,
          dominantFoot,
          phone,
          email,
          photoUrl,
          initRatingStatus: 'pending_votes',
          initVotesCount: 0,
          profileCompleted: true,
        })
        .returning();
      savedPlayer = inserted[0];
    }

    await syncUserPlayerGroupLinks(authUser.id, savedPlayer.id);

    if (isBrandNewPlayer) {
      const mGroups = await db
        .select({ groupId: peladaGroupMembers.groupId })
        .from(peladaGroupMembers)
        .where(
          or(
            eq(peladaGroupMembers.userId, authUser.id),
            eq(peladaGroupMembers.playerId, savedPlayer.id)
          )
        );
      await notifyPeladaAdminsForNewPlayer({
        playerId: savedPlayer.id,
        playerNickname: savedPlayer.nickname,
        playerName: savedPlayer.name,
        groupId: mGroups[0]?.groupId ?? null,
        creatorUserId: authUser.id,
        creatorVoted: false,
      });
    }

    res.json({ player: savedPlayer });
  } catch (error) {
    console.error('Erro ao salvar ficha do peladeiro:', error);
    res.status(500).json({ error: 'Não foi possível salvar a ficha do jogador.' });
  }
});

// ==========================================
// ADMIN USER MANAGEMENT
// ==========================================

apiRouter.get('/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
        hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    const allPlayers = await db
      .select({ id: players.id, userId: players.userId, nickname: players.nickname })
      .from(players);

    const playerByUser = new Map<number, { id: number; nickname: string }>();
    for (const p of allPlayers) {
      if (p.userId) playerByUser.set(p.userId, { id: p.id, nickname: p.nickname });
    }

    res.json(
      allUsers.map((u) => ({
        ...u,
        player: playerByUser.get(u.id) ?? null,
      }))
    );
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Falha ao carregar contas de acesso.' });
  }
});

apiRouter.post('/admin/users', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const name = String(req.body?.name ?? '').trim();
    const role = req.body?.role === 'admin' ? 'admin' : 'player';
    const password = String(req.body?.password ?? '');
    const playerId = req.body?.playerId ? Number(req.body.playerId) : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Informe o nome do usuário.' });
    }
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Informe uma senha com no mínimo 6 dígitos.',
      });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const passwordHash = await hashPassword(password);

    let savedUser: typeof users.$inferSelect;
    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          name,
          role,
          passwordHash,
          inviteToken: null,
          inviteExpiresAt: null,
          mustChangePassword: false,
          active: true,
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      savedUser = updated[0];
    } else {
      const inserted = await db
        .insert(users)
        .values({
          uid: `local:${crypto.randomUUID()}`,
          email,
          name,
          role,
          passwordHash,
          active: true,
        })
        .returning();
      savedUser = inserted[0];
    }

    const groupId = req.body?.groupId ? Number(req.body.groupId) : null;

    if (playerId) {
      await db
        .update(players)
        .set({ userId: savedUser.id, email })
        .where(eq(players.id, playerId));
    }

    if (groupId && Number.isInteger(groupId)) {
      await upsertGroupMembership({
        groupId,
        userId: savedUser.id,
        playerId: playerId || null,
        memberRole: role === 'admin' ? 'admin' : 'member',
      });
    }

    res.status(201).json({
      user: {
        id: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
        role: savedUser.role,
      },
    });
  } catch (error) {
    console.error('Erro ao criar acesso de usuário:', error);
    res.status(500).json({ error: 'Falha ao criar conta de acesso.' });
  }
});

// ==========================================
// PLAYERS (CADASTRO, NOTA INICIAL, HISTÓRICO)
// ==========================================

apiRouter.get('/players', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = req.query.groupId ? Number(req.query.groupId) : null;
    if (groupId && Number.isInteger(groupId)) {
      const allowed = await hasActiveGroupAccess(req.authUser!, groupId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Acesso não autorizado ou período de participação eventual encerrado nesta pelada.',
        });
      }
      const criteriaConfig = await getGroupCriteriaConfig(groupId);
      const memberships = await db
        .select({
          playerId: peladaGroupMembers.playerId,
          playerCategory: peladaGroupMembers.playerCategory,
        })
        .from(peladaGroupMembers)
        .where(
          and(eq(peladaGroupMembers.groupId, groupId), isNotNull(peladaGroupMembers.playerId))
        );
      const memberCatMap = new Map<number, string>();
      for (const m of memberships) {
        if (m.playerId != null) memberCatMap.set(m.playerId, m.playerCategory);
      }
      const playerIds = Array.from(memberCatMap.keys());
      if (playerIds.length === 0) {
        return res.json([]);
      }
      const list = await db
        .select()
        .from(players)
        .where(inArray(players.id, playerIds))
        .orderBy(desc(players.curOverall), players.name);

      const enriched = list
        .map((p) => {
          const cat = memberCatMap.get(p.id) ?? p.category ?? 'mensalista';
          return maskPlayerForViewer({ ...p, category: cat }, req.authUser, criteriaConfig);
        })
        .sort(
          (a, b) =>
            categoryPriority(a.category) - categoryPriority(b.category) ||
            b.curOverall - a.curOverall ||
            a.nickname.localeCompare(b.nickname)
        );
      return res.json(enriched);
    }

    // Global pool (used to reuse players across peladas): exclude single-pelada exclusive players
    const list = await db
      .select()
      .from(players)
      .where(and(isNull(players.exclusiveGroupId), isNull(players.exclusivePeladaId)))
      .orderBy(desc(players.curOverall), players.name);
    res.json(list.map((p) => maskPlayerForViewer(p, req.authUser)));
  } catch (error) {
    console.error('Erro ao listar jogadores:', error);
    res.status(500).json({ error: 'Falha ao carregar elenco de jogadores.' });
  }
});

apiRouter.post('/players', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    const groupId = req.body?.groupId ? Number(req.body.groupId) : null;
    const isAdmin = await isUserAdminOfGroup(authUser, groupId);

    if (!isAdmin) {
      if (!groupId || !Number.isInteger(groupId)) {
        return res.status(403).json({
          error: 'Selecione uma pelada fixa em que você está inscrito para cadastrar um peladeiro eventual.',
        });
      }
      const groupRow = await db
        .select({ id: peladaGroups.id, ownerUserId: peladaGroups.ownerUserId })
        .from(peladaGroups)
        .where(eq(peladaGroups.id, groupId))
        .limit(1);
      if (groupRow.length === 0) {
        return res.status(404).json({ error: 'Pelada fixa não encontrada.' });
      }
      const memberConditions = [eq(peladaGroupMembers.userId, authUser.id)];
      if (authUser.playerId) {
        memberConditions.push(eq(peladaGroupMembers.playerId, authUser.playerId));
      }
      const enrolled = await db
        .select({ id: peladaGroupMembers.id })
        .from(peladaGroupMembers)
        .where(and(eq(peladaGroupMembers.groupId, groupId), or(...memberConditions)))
        .limit(1);
      if (enrolled.length === 0 && groupRow[0].ownerUserId !== authUser.id) {
        return res.status(403).json({
          error: 'Apenas inscritos nesta pelada podem cadastrar peladeiros eventuais.',
        });
      }
    }

    const name = String(req.body?.name ?? '').trim();
    const nickname = String(req.body?.nickname ?? '').trim();
    const age = req.body?.age ? Number(req.body.age) : null;
    const position = VALID_POSITIONS.has(req.body?.position) ? req.body.position : 'Ala Direito';
    const dominantFoot = VALID_FEET.has(req.body?.dominantFoot) ? req.body.dominantFoot : 'Destro';
    const phone = String(req.body?.phone ?? '').trim() || null;
    const email = String(req.body?.email ?? '').trim().toLowerCase() || null;
    const photoUrl = sanitizeImageUrl(req.body?.photoUrl);

    if (!name || !nickname) {
      return res.status(400).json({ error: 'Nome e apelido do jogador são obrigatórios.' });
    }

    // Category & single-pelada exclusivity rules:
    // Non-admin enrolled users can ONLY create 'eventual' players exclusive to this pelada.
    const requestedCat = String(req.body?.category ?? 'mensalista');
    const category = isAdmin
      ? VALID_CATEGORIES.has(requestedCat)
        ? requestedCat
        : 'mensalista'
      : 'eventual';

    const requestedExclusivity = String(
      req.body?.exclusivity ?? (category === 'eventual' && groupId ? 'group' : 'none')
    );
    const reqExclusivePeladaId = req.body?.exclusivePeladaId ? Number(req.body.exclusivePeladaId) : null;

    let exclusiveGroupId: number | null = null;
    let exclusivePeladaId: number | null = null;

    if (!isAdmin) {
      exclusiveGroupId = groupId;
      if (requestedExclusivity === 'encounter' && reqExclusivePeladaId && Number.isInteger(reqExclusivePeladaId)) {
        const pelRow = await db
          .select({ id: peladas.id, groupId: peladas.groupId })
          .from(peladas)
          .where(eq(peladas.id, reqExclusivePeladaId))
          .limit(1);
        if (pelRow.length > 0 && pelRow[0].groupId === groupId) {
          exclusivePeladaId = pelRow[0].id;
        }
      }
    } else if (groupId && Number.isInteger(groupId)) {
      if (
        requestedExclusivity === 'group' ||
        (category === 'eventual' && requestedExclusivity !== 'none' && requestedExclusivity !== 'encounter')
      ) {
        exclusiveGroupId = groupId;
      } else if (requestedExclusivity === 'encounter') {
        exclusiveGroupId = groupId;
        if (reqExclusivePeladaId && Number.isInteger(reqExclusivePeladaId)) {
          const pelRow = await db
            .select({ id: peladas.id, groupId: peladas.groupId })
            .from(peladas)
            .where(eq(peladas.id, reqExclusivePeladaId))
            .limit(1);
          if (pelRow.length > 0 && pelRow[0].groupId === groupId) {
            exclusivePeladaId = pelRow[0].id;
          }
        }
      }
    }

    const criteriaConfig = await getGroupCriteriaConfig(groupId);
    const reqScoresObj =
      req.body?.scores && typeof req.body.scores === 'object' ? req.body.scores : {};
    const criteria: SevenCriteria = {
      physical: clampScore(reqScoresObj.physical ?? req.body?.initPhysical, 7),
      dribbling: clampScore(reqScoresObj.dribbling ?? req.body?.initDribbling, 7),
      shooting: clampScore(reqScoresObj.shooting ?? req.body?.initShooting, 7),
      defense: clampScore(reqScoresObj.defense ?? req.body?.initDefense, 7),
      attack: clampScore(reqScoresObj.attack ?? req.body?.initAttack, 7),
      passing: clampScore(reqScoresObj.passing ?? req.body?.initPassing, 7),
      positioning: clampScore(reqScoresObj.positioning ?? req.body?.initPositioning, 7),
    };
    const scoresMap: Record<string, number> = {
      physical: criteria.physical,
      dribbling: criteria.dribbling,
      shooting: criteria.shooting,
      defense: criteria.defense,
      attack: criteria.attack,
      passing: criteria.passing,
      positioning: criteria.positioning,
    };
    for (const c of criteriaConfig) {
      if (reqScoresObj[c.key] !== undefined) {
        scoresMap[c.key] = clampScore(reqScoresObj[c.key], 7);
      } else if (scoresMap[c.key] === undefined) {
        scoresMap[c.key] = 7;
      }
    }
    const overall = computeWeightedOverall(scoresMap, criteriaConfig);
    const scoresJson = JSON.stringify(scoresMap);

    // Notify all pelada admins on new registration so they vote on the criteria.
    // An admin creator can optionally check `castInitialVote: true` to record their vote immediately.
    const castInitialVote = isAdmin && req.body?.castInitialVote === true;
    const peladaAdminIds = await getPeladaAdminUserIds(groupId);
    const initialVotesCount = castInitialVote ? 1 : 0;
    const initialStatus =
      castInitialVote && peladaAdminIds.length <= 1 ? 'approved' : 'pending_votes';

    const accessMode = isAdmin && req.body?.accessMode === 'password' ? 'password' : 'none';
    const initialPassword = String(req.body?.initialPassword ?? '');

    let linkedUserId: number | null = null;

    if (accessMode === 'password') {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          error: 'Para criar login e senha do jogador, informe um e-mail válido.',
        });
      }
      if (initialPassword.length < 6) {
        return res.status(400).json({
          error: 'A senha inicial do jogador deve ter pelo menos 6 dígitos.',
        });
      }

      const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const passwordHash = await hashPassword(initialPassword);

      if (existingUser.length > 0) {
        const updatedUser = await db
          .update(users)
          .set({
            name,
            passwordHash,
            inviteToken: null,
            inviteExpiresAt: null,
            active: true,
          })
          .where(eq(users.id, existingUser[0].id))
          .returning();
        linkedUserId = updatedUser[0].id;
      } else {
        const insertedUser = await db
          .insert(users)
          .values({
            uid: `local:${crypto.randomUUID()}`,
            email,
            name,
            role: 'player',
            passwordHash,
            active: true,
          })
          .returning();
        linkedUserId = insertedUser[0].id;
      }
    }

    const insertedPlayer = await db
      .insert(players)
      .values({
        userId: linkedUserId,
        name,
        nickname,
        age: age && Number.isFinite(age) ? Math.max(12, Math.min(80, Math.round(age))) : null,
        position,
        dominantFoot,
        phone,
        email,
        photoUrl,
        initPhysical: criteria.physical,
        initDribbling: criteria.dribbling,
        initShooting: criteria.shooting,
        initDefense: criteria.defense,
        initAttack: criteria.attack,
        initPassing: criteria.passing,
        initPositioning: criteria.positioning,
        initOverall: overall,
        curPhysical: criteria.physical,
        curDribbling: criteria.dribbling,
        curShooting: criteria.shooting,
        curDefense: criteria.defense,
        curAttack: criteria.attack,
        curPassing: criteria.passing,
        curPositioning: criteria.positioning,
        curOverall: overall,
        ratedByUserId: authUser.id,
        category,
        exclusiveGroupId,
        exclusivePeladaId,
        invitedByUserId: category === 'eventual' ? authUser.id : null,
        initRatingStatus: initialStatus,
        initVotesCount: initialVotesCount,
        initScoresJson: scoresJson,
        curScoresJson: scoresJson,
        profileCompleted: true,
      })
      .returning();

    let createdPlayer = insertedPlayer[0];
    if (groupId && Number.isInteger(groupId)) {
      await upsertGroupMembership({
        groupId,
        userId: linkedUserId,
        playerId: createdPlayer.id,
        memberRole: 'member',
        playerCategory: category,
      });
    }

    if (exclusivePeladaId) {
      await db
        .insert(peladaAttendances)
        .values({
          peladaId: exclusivePeladaId,
          playerId: createdPlayer.id,
          present: true,
          teamId: null,
        })
        .onConflictDoNothing();
    }

    if (castInitialVote) {
      await db.insert(playerInitialVotes).values({
        groupId: groupId ?? null,
        playerId: createdPlayer.id,
        adminUserId: authUser.id,
        scoresJson,
        averageScore: overall,
        comment: 'Voto inicial no cadastro',
      });
      createdPlayer = (await recalculatePlayerRatings(createdPlayer.id, { groupId })) ?? createdPlayer;
    }

    await notifyPeladaAdminsForNewPlayer({
      playerId: createdPlayer.id,
      playerNickname: createdPlayer.nickname,
      playerName: createdPlayer.name,
      groupId,
      creatorUserId: authUser.id,
      creatorVoted: castInitialVote,
    });

    res.status(201).json({
      player: {
        ...createdPlayer,
        initScores: scoresMap,
        curScores: scoresMap,
      },
    });
  } catch (error) {
    console.error('Erro ao cadastrar jogador:', error);
    res.status(500).json({ error: 'Falha ao cadastrar jogador.' });
  }
});

apiRouter.put('/players/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

    const existingRows = await db.select().from(players).where(eq(players.id, id)).limit(1);
    if (existingRows.length === 0) return res.status(404).json({ error: 'Jogador não encontrado.' });
    const existing = existingRows[0];

    const reqGroupId = req.body?.groupId ? Number(req.body.groupId) : existing.exclusiveGroupId;
    const isAdmin = await isUserAdminOfGroup(req.authUser!, reqGroupId);
    const isOwner = existing.userId === req.authUser!.id;
    const isInviterOfEventual =
      existing.category === 'eventual' && existing.invitedByUserId === req.authUser!.id;
    if (!isAdmin && !isOwner && !isInviterOfEventual) {
      return res.status(403).json({ error: 'Você só pode editar o próprio perfil ou convidado eventual.' });
    }

    const name = String(req.body?.name ?? existing.name).trim();
    const nickname = String(req.body?.nickname ?? existing.nickname).trim();
    const age = req.body?.age !== undefined ? (req.body.age ? Number(req.body.age) : null) : existing.age;
    const position = VALID_POSITIONS.has(req.body?.position) ? req.body.position : existing.position;
    const dominantFoot = VALID_FEET.has(req.body?.dominantFoot)
      ? req.body.dominantFoot
      : existing.dominantFoot;
    const phone =
      req.body?.phone !== undefined ? String(req.body.phone ?? '').trim() || null : existing.phone;
    const email =
      req.body?.email !== undefined
        ? String(req.body.email ?? '').trim().toLowerCase() || null
        : existing.email;
    const photoUrl =
      req.body?.photoUrl !== undefined ? sanitizeImageUrl(req.body.photoUrl) : existing.photoUrl;

    let adminFields: Partial<typeof players.$inferInsert> = {};
    if (isAdmin) {
      const reqScoresObj =
        req.body?.scores && typeof req.body.scores === 'object' ? req.body.scores : null;
      if (req.body?.initPhysical !== undefined || reqScoresObj !== null) {
        const criteriaConfig = await getGroupCriteriaConfig(reqGroupId);
        const prevScores = getPlayerScoresMap(existing, 'init');
        const criteria: SevenCriteria = {
          physical: clampScore(reqScoresObj?.physical ?? req.body.initPhysical, existing.initPhysical),
          dribbling: clampScore(reqScoresObj?.dribbling ?? req.body.initDribbling, existing.initDribbling),
          shooting: clampScore(reqScoresObj?.shooting ?? req.body.initShooting, existing.initShooting),
          defense: clampScore(reqScoresObj?.defense ?? req.body.initDefense, existing.initDefense),
          attack: clampScore(reqScoresObj?.attack ?? req.body.initAttack, existing.initAttack),
          passing: clampScore(reqScoresObj?.passing ?? req.body.initPassing, existing.initPassing),
          positioning: clampScore(reqScoresObj?.positioning ?? req.body.initPositioning, existing.initPositioning),
        };
        const nextScores: Record<string, number> = {
          ...prevScores,
          physical: criteria.physical,
          dribbling: criteria.dribbling,
          shooting: criteria.shooting,
          defense: criteria.defense,
          attack: criteria.attack,
          passing: criteria.passing,
          positioning: criteria.positioning,
        };
        if (reqScoresObj) {
          for (const [k, v] of Object.entries(reqScoresObj)) {
            nextScores[k] = clampScore(v, nextScores[k] ?? 7);
          }
        }
        adminFields = {
          ...adminFields,
          initPhysical: criteria.physical,
          initDribbling: criteria.dribbling,
          initShooting: criteria.shooting,
          initDefense: criteria.defense,
          initAttack: criteria.attack,
          initPassing: criteria.passing,
          initPositioning: criteria.positioning,
          initOverall: computeWeightedOverall(nextScores, criteriaConfig),
          initScoresJson: JSON.stringify(nextScores),
        };
      }
      if (req.body?.category && VALID_CATEGORIES.has(req.body.category)) {
        adminFields.category = req.body.category;
      }
      if (req.body?.exclusivity !== undefined) {
        const groupId = reqGroupId;
        const excl = String(req.body.exclusivity);
        if (excl === 'none') {
          adminFields.exclusiveGroupId = null;
          adminFields.exclusivePeladaId = null;
        } else if (excl === 'group' && groupId) {
          adminFields.exclusiveGroupId = groupId;
          adminFields.exclusivePeladaId = null;
        } else if (excl === 'encounter' && groupId) {
          adminFields.exclusiveGroupId = groupId;
          adminFields.exclusivePeladaId = req.body?.exclusivePeladaId
            ? Number(req.body.exclusivePeladaId)
            : existing.exclusivePeladaId;
        }
      }
    }

    await db
      .update(players)
      .set({
        name,
        nickname,
        age: age && Number.isFinite(age) ? Math.max(12, Math.min(80, Math.round(age))) : null,
        position,
        dominantFoot,
        phone,
        email,
        photoUrl,
        profileCompleted: true,
        ...adminFields,
      })
      .where(eq(players.id, id));

    if (isAdmin && adminFields.category && reqGroupId && Number.isInteger(reqGroupId)) {
      await db
        .update(peladaGroupMembers)
        .set({ playerCategory: adminFields.category })
        .where(and(eq(peladaGroupMembers.groupId, reqGroupId), eq(peladaGroupMembers.playerId, id)));
    }

    const refreshed = await recalculatePlayerRatings(id, { groupId: reqGroupId });
    res.json({
      player: refreshed
        ? {
            ...refreshed,
            initScores: getPlayerScoresMap(refreshed, 'init'),
            curScores: getPlayerScoresMap(refreshed, 'cur'),
          }
        : refreshed,
    });
  } catch (error) {
    console.error('Erro ao atualizar jogador:', error);
    res.status(500).json({ error: 'Falha ao atualizar jogador.' });
  }
});

apiRouter.delete('/players/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db.delete(players).where(eq(players.id, id));
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover jogador:', error);
    res.status(500).json({ error: 'Falha ao remover jogador.' });
  }
});

apiRouter.get('/players/:id/history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
    const groupId = req.query.groupId ? Number(req.query.groupId) : null;
    const data = await getPlayerHistoryAndEvolution(id, groupId);
    if (!data) return res.status(404).json({ error: 'Jogador não encontrado.' });
    res.json({
      ...data,
      player: maskPlayerForViewer(data.player, req.authUser, data.criteriaConfig),
    });
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ error: 'Falha ao buscar histórico de evolução.' });
  }
});

// ==========================================
// INITIAL ADMIN VOTING & NOTIFICATIONS
// ==========================================

apiRouter.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    const rows = await db
      .select({
        id: adminNotifications.id,
        recipientUserId: adminNotifications.recipientUserId,
        groupId: adminNotifications.groupId,
        groupName: peladaGroups.name,
        playerId: adminNotifications.playerId,
        joinRequestId: adminNotifications.joinRequestId,
        playerName: players.name,
        playerNickname: players.nickname,
        playerPosition: players.position,
        playerPhotoUrl: players.photoUrl,
        playerInitOverall: players.initOverall,
        playerInitRatingStatus: players.initRatingStatus,
        playerInitVotesCount: players.initVotesCount,
        type: adminNotifications.type,
        title: adminNotifications.title,
        message: adminNotifications.message,
        read: adminNotifications.read,
        voted: adminNotifications.voted,
        createdAt: adminNotifications.createdAt,
      })
      .from(adminNotifications)
      .innerJoin(players, eq(adminNotifications.playerId, players.id))
      .leftJoin(peladaGroups, eq(adminNotifications.groupId, peladaGroups.id))
      .where(eq(adminNotifications.recipientUserId, authUser.id))
      .orderBy(adminNotifications.voted, desc(adminNotifications.createdAt))
      .limit(50);

    const groupIds = Array.from(
      new Set(rows.map((r) => r.groupId).filter((id): id is number => id != null))
    );
    const adminCountByGroup = new Map<number | null, number>();
    for (const gid of groupIds) {
      const admins = await getPeladaAdminUserIds(gid);
      adminCountByGroup.set(gid, admins.length);
    }
    if (rows.some((r) => r.groupId == null)) {
      const globalAdmins = await getPeladaAdminUserIds(null);
      adminCountByGroup.set(null, globalAdmins.length);
    }

    res.json(
      rows.map((r) => ({
        ...r,
        totalAdmins: adminCountByGroup.get(r.groupId ?? null) ?? 1,
      }))
    );
  } catch (error) {
    console.error('Erro ao listar notificações de administrador:', error);
    res.status(500).json({ error: 'Falha ao carregar notificações.' });
  }
});

apiRouter.post('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db
      .update(adminNotifications)
      .set({ read: true })
      .where(and(eq(adminNotifications.id, id), eq(adminNotifications.recipientUserId, req.authUser!.id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({ error: 'Falha ao atualizar notificação.' });
  }
});

apiRouter.get('/players/:id/initial-votes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const playerId = Number(req.params.id);
    if (!Number.isInteger(playerId)) return res.status(400).json({ error: 'ID inválido.' });
    const reqGroupId = req.query.groupId ? Number(req.query.groupId) : null;

    const pRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (pRows.length === 0) return res.status(404).json({ error: 'Jogador não encontrado.' });
    const p = pRows[0];

    let resolvedGroupId = reqGroupId ?? p.exclusiveGroupId;
    if (!resolvedGroupId) {
      const mRows = await db
        .select({ groupId: peladaGroupMembers.groupId })
        .from(peladaGroupMembers)
        .where(eq(peladaGroupMembers.playerId, playerId))
        .limit(1);
      resolvedGroupId = mRows[0]?.groupId ?? null;
    }

    const criteriaConfig = await getGroupCriteriaConfig(resolvedGroupId);
    const voteRows = await db
      .select({
        id: playerInitialVotes.id,
        groupId: playerInitialVotes.groupId,
        playerId: playerInitialVotes.playerId,
        adminUserId: playerInitialVotes.adminUserId,
        adminName: users.name,
        scoresJson: playerInitialVotes.scoresJson,
        averageScore: playerInitialVotes.averageScore,
        comment: playerInitialVotes.comment,
        createdAt: playerInitialVotes.createdAt,
        updatedAt: playerInitialVotes.updatedAt,
      })
      .from(playerInitialVotes)
      .innerJoin(users, eq(playerInitialVotes.adminUserId, users.id))
      .where(eq(playerInitialVotes.playerId, playerId))
      .orderBy(desc(playerInitialVotes.updatedAt));

    const votes = voteRows.map((v) => ({
      id: v.id,
      groupId: v.groupId,
      playerId: v.playerId,
      adminUserId: v.adminUserId,
      adminName: v.adminName,
      scores: parseScoresJson(v.scoresJson),
      averageScore: v.averageScore,
      comment: v.comment,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));

    const adminIds = await getPeladaAdminUserIds(resolvedGroupId);
    const myVote = votes.find((v) => v.adminUserId === req.authUser!.id) ?? null;

    res.json({
      player: maskPlayerForViewer(p, req.authUser, criteriaConfig),
      groupId: resolvedGroupId,
      criteriaConfig,
      votes,
      myVote,
      totalAdmins: adminIds.length,
      votesCount: votes.length,
    });
  } catch (error) {
    console.error('Erro ao carregar votação inicial do peladeiro:', error);
    res.status(500).json({ error: 'Falha ao carregar votos iniciais.' });
  }
});

apiRouter.post('/players/:id/initial-votes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const playerId = Number(req.params.id);
    if (!Number.isInteger(playerId)) return res.status(400).json({ error: 'ID inválido.' });

    const pRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (pRows.length === 0) return res.status(404).json({ error: 'Jogador não encontrado.' });
    const p = pRows[0];

    let resolvedGroupId = req.body?.groupId ? Number(req.body.groupId) : p.exclusiveGroupId;
    if (!resolvedGroupId) {
      const mRows = await db
        .select({ groupId: peladaGroupMembers.groupId })
        .from(peladaGroupMembers)
        .where(eq(peladaGroupMembers.playerId, playerId))
        .limit(1);
      resolvedGroupId = mRows[0]?.groupId ?? null;
    }

    const canVote = await isUserAdminOfGroup(req.authUser!, resolvedGroupId);
    if (!canVote) {
      return res.status(403).json({
        error: 'Apenas administradores da pelada podem votar nos critérios da nota inicial.',
      });
    }

    const criteriaConfig = await getGroupCriteriaConfig(resolvedGroupId);
    const rawScores = req.body?.scores && typeof req.body.scores === 'object' ? req.body.scores : {};
    const sanitizedScores: Record<string, number> = {};
    for (const c of criteriaConfig) {
      sanitizedScores[c.key] = clampHalfStepScore(rawScores[c.key], 7);
    }
    for (const k of BASE_CRITERIA_KEYS) {
      if (sanitizedScores[k] === undefined) {
        sanitizedScores[k] = clampHalfStepScore(rawScores[k], 7);
      }
    }

    const averageScore = computeWeightedOverall(sanitizedScores, criteriaConfig);
    const comment = String(req.body?.comment ?? '').trim().slice(0, 400) || null;
    const scoresJson = JSON.stringify(sanitizedScores);

    await db
      .insert(playerInitialVotes)
      .values({
        groupId: resolvedGroupId ?? null,
        playerId,
        adminUserId: req.authUser!.id,
        scoresJson,
        averageScore,
        comment,
      })
      .onConflictDoUpdate({
        target: [playerInitialVotes.playerId, playerInitialVotes.adminUserId],
        set: {
          groupId: resolvedGroupId ?? null,
          scoresJson,
          averageScore,
          comment,
          updatedAt: new Date(),
        },
      });

    await db
      .update(adminNotifications)
      .set({ read: true, voted: true })
      .where(
        and(
          eq(adminNotifications.recipientUserId, req.authUser!.id),
          eq(adminNotifications.playerId, playerId)
        )
      );

    await recalculatePlayerRatings(playerId, { groupId: resolvedGroupId });

    const allVotes = await db
      .select({
        id: playerInitialVotes.id,
        groupId: playerInitialVotes.groupId,
        playerId: playerInitialVotes.playerId,
        adminUserId: playerInitialVotes.adminUserId,
        adminName: users.name,
        scoresJson: playerInitialVotes.scoresJson,
        averageScore: playerInitialVotes.averageScore,
        comment: playerInitialVotes.comment,
        createdAt: playerInitialVotes.createdAt,
        updatedAt: playerInitialVotes.updatedAt,
      })
      .from(playerInitialVotes)
      .innerJoin(users, eq(playerInitialVotes.adminUserId, users.id))
      .where(eq(playerInitialVotes.playerId, playerId))
      .orderBy(desc(playerInitialVotes.updatedAt));

    const adminIds = await getPeladaAdminUserIds(resolvedGroupId);
    const nextStatus = allVotes.length >= Math.max(1, adminIds.length) ? 'approved' : 'pending_votes';

    const updatedRows = await db
      .update(players)
      .set({
        initRatingStatus: nextStatus,
        initVotesCount: allVotes.length,
      })
      .where(eq(players.id, playerId))
      .returning();

    const updatedPlayer = updatedRows[0];

    res.status(201).json({
      player: maskPlayerForViewer(updatedPlayer, req.authUser, criteriaConfig),
      votes: allVotes.map((v) => ({
        ...v,
        scores: parseScoresJson(v.scoresJson),
      })),
      totalAdmins: adminIds.length,
      votesCount: allVotes.length,
    });
  } catch (error) {
    console.error('Erro ao salvar voto inicial:', error);
    res.status(500).json({ error: 'Falha ao registrar voto na nota inicial.' });
  }
});

// ==========================================
// PELADAS FIXAS (GRUPOS DO USUÁRIO)
// ==========================================

apiRouter.get('/public/groups', async (_req, res) => {
  try {
    const groupRows = await db.select().from(peladaGroups).orderBy(desc(peladaGroups.id));
    if (groupRows.length === 0) {
      return res.json([]);
    }

    const gIds = groupRows.map((g) => g.id);
    const [allMembers, allGroupPeladas, allGroupSeasons] = await Promise.all([
      db
        .select({
          groupId: peladaGroupMembers.groupId,
          userId: peladaGroupMembers.userId,
          memberRole: peladaGroupMembers.memberRole,
          playerCategory: peladaGroupMembers.playerCategory,
          accessExpiresAt: peladaGroupMembers.accessExpiresAt,
        })
        .from(peladaGroupMembers)
        .where(inArray(peladaGroupMembers.groupId, gIds)),
      db
        .select({
          id: peladas.id,
          groupId: peladas.groupId,
        })
        .from(peladas)
        .where(inArray(peladas.groupId, gIds)),
      db
        .select({
          groupId: seasons.groupId,
          name: seasons.name,
          status: seasons.status,
        })
        .from(seasons)
        .where(inArray(seasons.groupId, gIds))
        .orderBy(desc(seasons.id)),
    ]);

    const payload = groupRows.map((g) => {
      const gMembers = allMembers.filter((m) => m.groupId === g.id);
      const gPeladas = allGroupPeladas.filter((p) => p.groupId === g.id);
      const openSeason = allGroupSeasons.find((s) => s.groupId === g.id && s.status === 'open');
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        weekday: g.weekday,
        startTime: g.startTime,
        endTime: g.endTime,
        location: g.location,
        fullAddress: g.fullAddress,
        avulsoFee: g.avulsoFee,
        playersPerTeam: g.playersPerTeam,
        defaultTeamsCount: g.defaultTeamsCount,
        photoUrl: g.photoUrl,
        membersCount: gMembers.filter((m) => isMemberAccessActive(m, g.ownerUserId)).length,
        peladasCount: gPeladas.length,
        openSeasonName: openSeason?.name ?? null,
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Erro ao listar peladas fixas públicas:', error);
    res.status(500).json({ error: 'Falha ao carregar as peladas fixas cadastradas.' });
  }
});

apiRouter.get('/groups', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    await processEventualPostPeladaLifecycle();

    const groupRows = await db.select().from(peladaGroups).orderBy(desc(peladaGroups.id));
    if (groupRows.length === 0) {
      return res.json([]);
    }

    const gIds = groupRows.map((g) => g.id);
    const [allMembers, allGroupPeladas, allGroupSeasons, myJoinRequests, allPendingJoinReqs] =
      await Promise.all([
        db.select().from(peladaGroupMembers).where(inArray(peladaGroupMembers.groupId, gIds)),
        db
          .select({
            id: peladas.id,
            groupId: peladas.groupId,
            title: peladas.title,
            eventDate: peladas.eventDate,
            startTime: peladas.startTime,
            endTime: peladas.endTime,
            status: peladas.status,
          })
          .from(peladas)
          .where(inArray(peladas.groupId, gIds))
          .orderBy(desc(peladas.eventDate), desc(peladas.id)),
        db
          .select({ id: seasons.id, groupId: seasons.groupId, name: seasons.name, status: seasons.status })
          .from(seasons)
          .where(inArray(seasons.groupId, gIds))
          .orderBy(desc(seasons.id)),
        db
          .select()
          .from(peladaJoinRequests)
          .where(eq(peladaJoinRequests.userId, authUser.id)),
        db
          .select({
            id: peladaJoinRequests.id,
            groupId: peladaJoinRequests.groupId,
          })
          .from(peladaJoinRequests)
          .where(eq(peladaJoinRequests.status, 'pending')),
      ]);

    const joinReqByGroup = new Map<number, typeof myJoinRequests[number]>();
    for (const jr of myJoinRequests) {
      joinReqByGroup.set(jr.groupId, jr);
    }

    const pendingCountByGroup = new Map<number, number>();
    for (const pjr of allPendingJoinReqs) {
      pendingCountByGroup.set(pjr.groupId, (pendingCountByGroup.get(pjr.groupId) ?? 0) + 1);
    }

    const payload = groupRows.map((g) => {
      const gMembers = allMembers.filter((m) => m.groupId === g.id);
      const myRoleEntry = gMembers.find(
        (m) => m.userId === authUser.id || (authUser.playerId != null && m.playerId === authUser.playerId)
      );
      const isOwner = g.ownerUserId === authUser.id;
      const myMemberActive = myRoleEntry ? isMemberAccessActive(myRoleEntry, g.ownerUserId) : false;
      const myMemberRole: 'admin' | 'member' =
        isOwner || (myRoleEntry?.memberRole === 'admin' && myMemberActive) ? 'admin' : 'member';
      const isGroupAdmin =
        authUser.role === 'admin' || isOwner || (myRoleEntry?.memberRole === 'admin' && myMemberActive);

      let myAdminTitle: 'presidente' | 'tesoureiro' | 'presidente_tesoureiro' | 'administrador' | null =
        null;
      if (myRoleEntry?.memberRole === 'admin' && myMemberActive) {
        if (myRoleEntry.adminTitle && VALID_ADMIN_TITLES.has(myRoleEntry.adminTitle)) {
          myAdminTitle = myRoleEntry.adminTitle as
            | 'presidente'
            | 'tesoureiro'
            | 'presidente_tesoureiro'
            | 'administrador';
        } else if (isOwner) {
          myAdminTitle = 'presidente_tesoureiro';
        } else {
          myAdminTitle = 'administrador';
        }
      } else if (isOwner) {
        myAdminTitle = 'presidente_tesoureiro';
      } else if (authUser.role === 'admin') {
        myAdminTitle = 'administrador';
      }
      const canConfirmPayments =
        myAdminTitle !== null && FINANCIAL_CONFIRMER_TITLES.has(myAdminTitle);

      const gPeladas = allGroupPeladas.filter((p) => p.groupId === g.id);
      const openSeason = allGroupSeasons.find((s) => s.groupId === g.id && s.status === 'open');
      const jr = joinReqByGroup.get(g.id) ?? null;

      let membershipStatus: 'member' | 'pending' | 'rejected' | 'expired' | 'none' = 'none';
      if (authUser.role === 'admin' || isOwner) {
        membershipStatus = 'member';
      } else if (myRoleEntry) {
        membershipStatus = myMemberActive ? 'member' : 'expired';
      } else if (jr?.status === 'pending') {
        membershipStatus = 'pending';
      } else if (jr?.status === 'rejected') {
        membershipStatus = 'rejected';
      }

      const accessPelada = myRoleEntry?.accessPeladaId
        ? gPeladas.find((p) => p.id === myRoleEntry.accessPeladaId) ?? null
        : null;

      return {
        ...g,
        membersCount: gMembers.filter((m) => isMemberAccessActive(m, g.ownerUserId)).length,
        peladasCount: gPeladas.length,
        openSeasonName: openSeason?.name ?? null,
        myMemberRole,
        myAdminTitle,
        canConfirmPayments,
        isGroupAdmin,
        criteriaConfig: parseCriteriaConfig(g.criteriaConfig),
        membershipStatus,
        myMemberCategory: myRoleEntry?.playerCategory ?? null,
        accessExpiresAt: myRoleEntry?.accessExpiresAt ?? null,
        accessPeladaId: myRoleEntry?.accessPeladaId ?? null,
        accessPeladaTitle: accessPelada?.title ?? null,
        myJoinRequest: jr
          ? {
              id: jr.id,
              status: jr.status,
              requestedCategory: jr.requestedCategory,
              requestedPeladaId: jr.requestedPeladaId,
              responseNote: jr.responseNote,
              createdAt: jr.createdAt,
              respondedAt: jr.respondedAt,
            }
          : null,
        pendingJoinRequestsCount: isGroupAdmin ? (pendingCountByGroup.get(g.id) ?? 0) : 0,
        upcomingPeladas: gPeladas.slice(0, 10).map((p) => ({
          id: p.id,
          title: p.title,
          eventDate: p.eventDate,
          startTime: p.startTime,
          endTime: p.endTime,
          status: p.status,
        })),
      };
    });

    const rank = (s: string) =>
      s === 'member' ? 0 : s === 'pending' ? 1 : s === 'expired' ? 2 : s === 'none' ? 3 : 4;
    payload.sort((a, b) => rank(a.membershipStatus) - rank(b.membershipStatus) || b.id - a.id);

    res.json(payload);
  } catch (error) {
    console.error('Erro ao listar peladas fixas:', error);
    res.status(500).json({ error: 'Falha ao carregar suas peladas fixas.' });
  }
});

function parseNonNegativeFee(raw: unknown, fallback = 0): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const normalized = typeof raw === 'string' ? raw.replace(',', '.').trim() : raw;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(10000, Math.round(num * 100) / 100);
}

apiRouter.post('/groups', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    const name = String(req.body?.name ?? '').trim();
    const description = String(req.body?.description ?? '').trim() || null;
    const weekday = String(req.body?.weekday ?? 'Quarta-feira').trim() || 'Quarta-feira';
    const startTime = normalizeTimeStr(req.body?.startTime, '20:00');
    const endTime = normalizeTimeStr(req.body?.endTime, '22:00');
    const location = String(req.body?.location ?? 'Quadra Principal').trim() || 'Quadra Principal';
    const fullAddress = String(req.body?.fullAddress ?? '').trim().slice(0, 300) || null;
    const avulsoFee = parseNonNegativeFee(req.body?.avulsoFee, 0);
    const playersPerTeam = Math.max(3, Math.min(7, Number(req.body?.playersPerTeam ?? 5)));
    const defaultTeamsCount = Math.max(2, Math.min(12, Math.round(Number(req.body?.defaultTeamsCount ?? 2))));
    const photoUrl = sanitizeImageUrl(req.body?.photoUrl);
    const createInitialSeason = req.body?.createInitialSeason !== false;
    const initialSeasonName =
      String(req.body?.initialSeasonName ?? '').trim() || `Temporada ${new Date().getFullYear()}`;
    const memberPlayerIds = Array.isArray(req.body?.memberPlayerIds)
      ? req.body.memberPlayerIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    if (!name) {
      return res.status(400).json({ error: 'Informe o nome da pelada fixa.' });
    }

    const inserted = await db
      .insert(peladaGroups)
      .values({
        name,
        description,
        weekday,
        startTime,
        endTime,
        location,
        fullAddress,
        avulsoFee,
        playersPerTeam,
        defaultTeamsCount,
        photoUrl,
        ownerUserId: authUser.id,
      })
      .returning();

    const group = inserted[0];

    await upsertGroupMembership({
      groupId: group.id,
      userId: authUser.id,
      playerId: authUser.playerId,
      memberRole: 'admin',
      adminTitle: 'presidente_tesoureiro',
    });

    if (memberPlayerIds.length > 0) {
      const selectedPlayers = await db
        .select()
        .from(players)
        .where(inArray(players.id, memberPlayerIds));
      for (const sp of selectedPlayers) {
        await upsertGroupMembership({
          groupId: group.id,
          userId: sp.userId,
          playerId: sp.id,
          memberRole: sp.userId === authUser.id ? 'admin' : 'member',
        });
      }
    }

    let createdSeason = null;
    if (createInitialSeason) {
      const sInserted = await db
        .insert(seasons)
        .values({
          groupId: group.id,
          name: initialSeasonName,
          startDate: new Date().toISOString().slice(0, 10),
          status: 'open',
          createdByUserId: authUser.id,
        })
        .returning();
      createdSeason = sInserted[0];
    }

    res.status(201).json({
      group: {
        ...group,
        membersCount: 1 + memberPlayerIds.length,
        peladasCount: 0,
        openSeasonName: createdSeason?.name ?? null,
        myMemberRole: 'admin' as const,
      },
      season: createdSeason,
    });
  } catch (error) {
    console.error('Erro ao criar pelada fixa:', error);
    res.status(500).json({ error: 'Falha ao cadastrar pelada fixa.' });
  }
});

apiRouter.put('/groups/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

    const allowed = await isUserAdminOfGroup(req.authUser!, id);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores desta pelada podem editar as informações.' });
    }

    const existing = await db.select().from(peladaGroups).where(eq(peladaGroups.id, id)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: 'Pelada fixa não encontrada.' });
    const prev = existing[0];

    const name = String(req.body?.name ?? prev.name).trim();
    if (!name) return res.status(400).json({ error: 'Nome da pelada é obrigatório.' });

    const nextFullAddress =
      req.body?.fullAddress !== undefined
        ? String(req.body.fullAddress ?? '').trim().slice(0, 300) || null
        : prev.fullAddress;

    const nextAvulsoFee =
      req.body?.avulsoFee !== undefined
        ? parseNonNegativeFee(req.body.avulsoFee, prev.avulsoFee ?? 0)
        : prev.avulsoFee ?? 0;

    const updated = await db
      .update(peladaGroups)
      .set({
        name,
        description:
          req.body?.description !== undefined
            ? String(req.body.description ?? '').trim() || null
            : prev.description,
        weekday: req.body?.weekday ? String(req.body.weekday).trim() : prev.weekday,
        startTime: req.body?.startTime ? normalizeTimeStr(req.body.startTime, prev.startTime) : prev.startTime,
        endTime: req.body?.endTime ? normalizeTimeStr(req.body.endTime, prev.endTime) : prev.endTime,
        location: req.body?.location ? String(req.body.location).trim() : prev.location,
        fullAddress: nextFullAddress,
        avulsoFee: nextAvulsoFee,
        playersPerTeam:
          req.body?.playersPerTeam !== undefined
            ? Math.max(3, Math.min(7, Number(req.body.playersPerTeam)))
            : prev.playersPerTeam,
        defaultTeamsCount:
          req.body?.defaultTeamsCount !== undefined
            ? Math.max(2, Math.min(12, Math.round(Number(req.body.defaultTeamsCount))))
            : prev.defaultTeamsCount,
        photoUrl: req.body?.photoUrl !== undefined ? sanitizeImageUrl(req.body.photoUrl) : prev.photoUrl,
      })
      .where(eq(peladaGroups.id, id))
      .returning();

    res.json({ group: updated[0] });
  } catch (error) {
    console.error('Erro ao atualizar pelada fixa:', error);
    res.status(500).json({ error: 'Falha ao atualizar pelada fixa.' });
  }
});

apiRouter.delete('/groups/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db.delete(peladaGroups).where(eq(peladaGroups.id, id));
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover pelada fixa:', error);
    res.status(500).json({ error: 'Falha ao remover pelada fixa.' });
  }
});

apiRouter.get('/groups/:id/members', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'ID inválido.' });

    const authUser = req.authUser!;
    const isAdmin = await isUserAdminOfGroup(authUser, groupId);
    const hasAccess = isAdmin || (await hasActiveGroupAccess(authUser, groupId));
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso não autorizado a esta pelada fixa.' });
    }

    const groupRows = await db
      .select({ ownerUserId: peladaGroups.ownerUserId })
      .from(peladaGroups)
      .where(eq(peladaGroups.id, groupId))
      .limit(1);
    const ownerUserId = groupRows[0]?.ownerUserId ?? null;

    const rows = await db
      .select({
        id: peladaGroupMembers.id,
        groupId: peladaGroupMembers.groupId,
        userId: peladaGroupMembers.userId,
        playerId: peladaGroupMembers.playerId,
        memberRole: peladaGroupMembers.memberRole,
        adminTitle: peladaGroupMembers.adminTitle,
        playerCategory: peladaGroupMembers.playerCategory,
        accessPeladaId: peladaGroupMembers.accessPeladaId,
        accessExpiresAt: peladaGroupMembers.accessExpiresAt,
        summaryEmailSentAt: peladaGroupMembers.summaryEmailSentAt,
        userName: users.name,
        userEmail: users.email,
        userRole: users.role,
        userHasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
        playerName: players.name,
        playerNickname: players.nickname,
        playerPosition: players.position,
        playerPhoto: players.photoUrl,
        playerOverall: players.curOverall,
      })
      .from(peladaGroupMembers)
      .leftJoin(users, eq(peladaGroupMembers.userId, users.id))
      .leftJoin(players, eq(peladaGroupMembers.playerId, players.id))
      .where(eq(peladaGroupMembers.groupId, groupId));

    const payload = rows.map((r) => {
      const canEditCredentials =
        isAdmin &&
        (authUser.role === 'admin' ||
          (r.userRole !== 'admin' && (r.userId == null || r.userId !== ownerUserId || r.userId === authUser.id)));
      return {
        id: r.id,
        groupId: r.groupId,
        userId: r.userId,
        playerId: r.playerId,
        memberRole: r.memberRole,
        adminTitle: r.adminTitle,
        playerCategory: r.playerCategory,
        accessPeladaId: r.accessPeladaId,
        accessExpiresAt: r.accessExpiresAt,
        summaryEmailSentAt: r.summaryEmailSentAt,
        userName: r.userName,
        userEmail: isAdmin || r.userId === authUser.id ? r.userEmail : null,
        userHasPassword: isAdmin ? Boolean(r.userHasPassword) : false,
        canEditCredentials,
        playerName: r.playerName,
        playerNickname: r.playerNickname,
        playerPosition: r.playerPosition,
        playerPhoto: r.playerPhoto,
        playerOverall: r.playerOverall,
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Erro ao listar participantes da pelada fixa:', error);
    res.status(500).json({ error: 'Falha ao carregar membros da pelada.' });
  }
});

apiRouter.post('/groups/:id/members/create-access', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'ID inválido.' });

    const authUser = req.authUser!;
    const allowed = await isUserAdminOfGroup(authUser, groupId);
    if (!allowed) {
      return res.status(403).json({
        error: 'Apenas o criador ou administradores desta pelada fixa podem criar acessos de jogadores.',
      });
    }

    const reqPlayerId = req.body?.playerId ? Number(req.body.playerId) : null;
    const login = String(req.body?.login ?? req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const rawName = String(req.body?.name ?? '').trim();
    const rawNickname = String(req.body?.nickname ?? '').trim();
    const position = VALID_POSITIONS.has(req.body?.position) ? String(req.body.position) : 'Ala Direito';
    const playerCategory = VALID_CATEGORIES.has(req.body?.playerCategory)
      ? String(req.body.playerCategory)
      : 'mensalista';
    const memberRole = req.body?.memberRole === 'admin' ? 'admin' : 'member';
    const accessExpiresAt = parseAccessExpiresAt(req.body?.accessExpiresAt);

    if (!isValidLoginIdentifier(login)) {
      return res.status(400).json({
        error: 'Informe um login válido (mínimo 3 caracteres, sem espaços — pode ser e-mail ou nome de usuário).',
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        error: 'A senha deve ter no mínimo 6 dígitos.',
      });
    }

    let targetPlayer: typeof players.$inferSelect | null = null;
    if (reqPlayerId && Number.isInteger(reqPlayerId)) {
      const pRows = await db.select().from(players).where(eq(players.id, reqPlayerId)).limit(1);
      if (pRows.length === 0) {
        return res.status(404).json({ error: 'Jogador não encontrado.' });
      }
      if (pRows[0].exclusiveGroupId != null && pRows[0].exclusiveGroupId !== groupId) {
        return res.status(400).json({
          error: 'Este jogador é exclusivo de outra pelada fixa.',
        });
      }
      targetPlayer = pRows[0];
    }

    const name = rawName || targetPlayer?.name || rawNickname || login;
    const nickname = rawNickname || targetPlayer?.nickname || name.split(' ')[0] || login;

    // Check if login already exists in users
    const existingUsers = await db.select().from(users).where(eq(users.email, login)).limit(1);
    const passwordHash = await hashPassword(password);
    let savedUser: typeof users.$inferSelect;

    if (existingUsers.length > 0) {
      const exUser = existingUsers[0];
      if (exUser.role === 'admin' && authUser.role !== 'admin') {
        return res.status(403).json({
          error: 'Não é permitido alterar credenciais de um administrador global por esta tela.',
        });
      }
      if (targetPlayer?.userId && targetPlayer.userId !== exUser.id) {
        return res.status(409).json({
          error: 'Este login já pertence a outro usuário cadastrado. Escolha outro login.',
        });
      }
      const alreadyInGroup = await db
        .select({ id: peladaGroupMembers.id })
        .from(peladaGroupMembers)
        .where(and(eq(peladaGroupMembers.groupId, groupId), eq(peladaGroupMembers.userId, exUser.id)))
        .limit(1);

      if (alreadyInGroup.length === 0 && authUser.role !== 'admin') {
        return res.status(409).json({
          error: 'Este login já está em uso no sistema. Escolha um login específico para este jogador.',
        });
      }

      const updatedUsers = await db
        .update(users)
        .set({
          name,
          passwordHash,
          mustChangePassword: false,
          active: true,
        })
        .where(eq(users.id, exUser.id))
        .returning();
      savedUser = updatedUsers[0];
    } else if (targetPlayer?.userId) {
      const currentOwnerUsers = await db
        .select()
        .from(users)
        .where(eq(users.id, targetPlayer.userId))
        .limit(1);
      const curUser = currentOwnerUsers[0];
      if (curUser) {
        if (curUser.role === 'admin' && authUser.role !== 'admin') {
          return res.status(403).json({
            error: 'Não é permitido alterar credenciais de um administrador global.',
          });
        }
        const updatedUsers = await db
          .update(users)
          .set({
            email: login,
            name,
            passwordHash,
            mustChangePassword: false,
            active: true,
          })
          .where(eq(users.id, curUser.id))
          .returning();
        savedUser = updatedUsers[0];
      } else {
        const insertedUsers = await db
          .insert(users)
          .values({
            uid: `local:${crypto.randomUUID()}`,
            email: login,
            name,
            role: 'player',
            passwordHash,
            active: true,
          })
          .returning();
        savedUser = insertedUsers[0];
      }
    } else {
      const insertedUsers = await db
        .insert(users)
        .values({
          uid: `local:${crypto.randomUUID()}`,
          email: login,
          name,
          role: 'player',
          passwordHash,
          active: true,
        })
        .returning();
      savedUser = insertedUsers[0];
    }

    if (targetPlayer) {
      const updatedP = await db
        .update(players)
        .set({
          userId: savedUser.id,
          name,
          nickname,
          email: targetPlayer.email || (login.includes('@') ? login : targetPlayer.email),
        })
        .where(eq(players.id, targetPlayer.id))
        .returning();
      targetPlayer = updatedP[0];
    } else {
      const existingPlayerForUser = await db
        .select()
        .from(players)
        .where(eq(players.userId, savedUser.id))
        .limit(1);

      if (existingPlayerForUser.length > 0) {
        targetPlayer = existingPlayerForUser[0];
      } else {
        const insertedPlayers = await db
          .insert(players)
          .values({
            userId: savedUser.id,
            name,
            nickname,
            position,
            dominantFoot: 'Destro',
            email: login.includes('@') ? login : null,
            category: playerCategory,
            exclusiveGroupId: groupId,
            ratedByUserId: authUser.id,
            initRatingStatus: 'approved',
            profileCompleted: true,
          })
          .returning();
        targetPlayer = insertedPlayers[0];
      }
    }

    const member = await upsertGroupMembership({
      groupId,
      userId: savedUser.id,
      playerId: targetPlayer.id,
      memberRole,
      playerCategory,
      accessExpiresAt,
      summaryEmailSentAt: null,
    });

    res.status(201).json({
      member,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
        role: savedUser.role,
      },
      player: targetPlayer,
    });
  } catch (error) {
    console.error('Erro ao criar acesso do jogador na pelada fixa:', error);
    res.status(500).json({ error: 'Falha ao cadastrar login e senha para o jogador.' });
  }
});

apiRouter.patch('/groups/:id/members/:memberId/access', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    if (!Number.isInteger(groupId) || !Number.isInteger(memberId)) {
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }

    const authUser = req.authUser!;
    const allowed = await isUserAdminOfGroup(authUser, groupId);
    if (!allowed) {
      return res.status(403).json({
        error: 'Apenas o criador ou administradores desta pelada podem editar acessos.',
      });
    }

    const groupRows = await db
      .select({ ownerUserId: peladaGroups.ownerUserId })
      .from(peladaGroups)
      .where(eq(peladaGroups.id, groupId))
      .limit(1);
    const ownerUserId = groupRows[0]?.ownerUserId ?? null;

    const existingRows = await db
      .select()
      .from(peladaGroupMembers)
      .where(and(eq(peladaGroupMembers.groupId, groupId), eq(peladaGroupMembers.id, memberId)))
      .limit(1);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Participante não encontrado nesta pelada fixa.' });
    }
    const member = existingRows[0];

    let linkedUser: typeof users.$inferSelect | null = null;
    if (member.userId) {
      const uRows = await db.select().from(users).where(eq(users.id, member.userId)).limit(1);
      linkedUser = uRows[0] ?? null;
    }

    if (
      linkedUser &&
      authUser.role !== 'admin' &&
      (linkedUser.role === 'admin' || (linkedUser.id === ownerUserId && linkedUser.id !== authUser.id))
    ) {
      return res.status(403).json({
        error: 'Você não tem permissão para alterar as credenciais deste administrador.',
      });
    }

    const rawName = req.body?.name !== undefined ? String(req.body.name ?? '').trim() : undefined;
    const rawNickname =
      req.body?.nickname !== undefined ? String(req.body.nickname ?? '').trim() : undefined;
    const rawLogin =
      req.body?.login !== undefined ? String(req.body.login ?? '').trim().toLowerCase() : undefined;
    const rawPassword =
      req.body?.password !== undefined ? String(req.body.password ?? '') : undefined;

    if (rawLogin !== undefined && rawLogin !== '') {
      if (!isValidLoginIdentifier(rawLogin)) {
        return res.status(400).json({
          error: 'Informe um login válido (mínimo 3 caracteres, sem espaços).',
        });
      }
      const conflict = await db.select().from(users).where(eq(users.email, rawLogin)).limit(1);
      if (conflict.length > 0 && conflict[0].id !== linkedUser?.id) {
        return res.status(409).json({
          error: 'Este login já está em uso por outro usuário. Escolha outro login.',
        });
      }
    }

    if (rawPassword !== undefined && rawPassword !== '' && rawPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 dígitos.' });
    }

    let resolvedUserId = member.userId;
    if (linkedUser) {
      const userUpdates: Partial<typeof users.$inferInsert> = {};
      if (rawLogin) userUpdates.email = rawLogin;
      if (rawName) userUpdates.name = rawName;
      if (rawPassword && rawPassword.length >= 6) {
        userUpdates.passwordHash = await hashPassword(rawPassword);
        userUpdates.mustChangePassword = false;
      }
      if (Object.keys(userUpdates).length > 0) {
        await db.update(users).set(userUpdates).where(eq(users.id, linkedUser.id));
      }
    } else if (rawLogin) {
      if (!rawPassword || rawPassword.length < 6) {
        return res.status(400).json({
          error: 'Informe uma senha (mínimo 6 dígitos) ao criar o login do jogador.',
        });
      }
      let fallbackName = rawName || rawNickname || rawLogin;
      if (member.playerId && !rawName) {
        const pRow = await db
          .select({ name: players.name })
          .from(players)
          .where(eq(players.id, member.playerId))
          .limit(1);
        if (pRow[0]?.name) fallbackName = pRow[0].name;
      }
      const passwordHash = await hashPassword(rawPassword);
      const inserted = await db
        .insert(users)
        .values({
          uid: `local:${crypto.randomUUID()}`,
          email: rawLogin,
          name: fallbackName,
          role: 'player',
          passwordHash,
          active: true,
        })
        .returning();
      resolvedUserId = inserted[0].id;
      if (member.playerId) {
        await db
          .update(players)
          .set({ userId: resolvedUserId })
          .where(eq(players.id, member.playerId));
      }
    }

    if (member.playerId) {
      const playerUpdates: Partial<typeof players.$inferInsert> = {};
      if (rawName) playerUpdates.name = rawName;
      if (rawNickname) playerUpdates.nickname = rawNickname;
      if (req.body?.playerCategory && VALID_CATEGORIES.has(req.body.playerCategory)) {
        playerUpdates.category = String(req.body.playerCategory);
      }
      if (Object.keys(playerUpdates).length > 0) {
        await db.update(players).set(playerUpdates).where(eq(players.id, member.playerId));
      }
    }

    const nextCategory =
      req.body?.playerCategory && VALID_CATEGORIES.has(req.body.playerCategory)
        ? String(req.body.playerCategory)
        : member.playerCategory;
    const nextRole =
      req.body?.memberRole === 'admin'
        ? 'admin'
        : req.body?.memberRole === 'member'
          ? 'member'
          : member.memberRole;
    const nextExpiresAt =
      req.body?.accessExpiresAt !== undefined
        ? parseAccessExpiresAt(req.body.accessExpiresAt)
        : member.accessExpiresAt;

    const updatedMember = await db
      .update(peladaGroupMembers)
      .set({
        userId: resolvedUserId,
        playerCategory: nextCategory,
        memberRole: nextRole,
        accessExpiresAt: nextExpiresAt,
        summaryEmailSentAt: nextExpiresAt == null || new Date(nextExpiresAt) > new Date() ? null : member.summaryEmailSentAt,
      })
      .where(eq(peladaGroupMembers.id, memberId))
      .returning();

    res.json({ member: updatedMember[0] });
  } catch (error) {
    console.error('Erro ao atualizar acesso do jogador:', error);
    res.status(500).json({ error: 'Falha ao atualizar acesso do participante.' });
  }
});

apiRouter.post('/groups/:id/members', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'ID inválido.' });

    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem gerenciar membros.' });
    }

    const playerId = req.body?.playerId ? Number(req.body.playerId) : null;
    let userId = req.body?.userId ? Number(req.body.userId) : null;
    const memberRole = req.body?.memberRole === 'admin' ? 'admin' : 'member';
    let playerCategory = VALID_CATEGORIES.has(req.body?.playerCategory)
      ? String(req.body.playerCategory)
      : undefined;

    if (!playerId && !userId) {
      return res.status(400).json({ error: 'Selecione um jogador ou usuário.' });
    }

    if (playerId) {
      const pRow = await db
        .select({
          userId: players.userId,
          category: players.category,
          exclusiveGroupId: players.exclusiveGroupId,
          exclusivePeladaId: players.exclusivePeladaId,
        })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      if (pRow.length === 0) {
        return res.status(404).json({ error: 'Jogador não encontrado.' });
      }
      if (
        (pRow[0].exclusiveGroupId != null && pRow[0].exclusiveGroupId !== groupId) ||
        pRow[0].exclusivePeladaId != null
      ) {
        return res.status(400).json({
          error: 'Este peladeiro está cadastrado exclusivamente para outra pelada e não pode participar desta.',
        });
      }
      if (!userId && pRow[0].userId) {
        userId = pRow[0].userId;
      }
      if (!playerCategory) {
        playerCategory = pRow[0].category;
      }
    }

    let finalPlayerId = playerId;
    if (userId && !finalPlayerId) {
      const pRow = await db
        .select({ id: players.id, category: players.category })
        .from(players)
        .where(eq(players.userId, userId))
        .limit(1);
      if (pRow.length > 0) {
        finalPlayerId = pRow[0].id;
        if (!playerCategory) playerCategory = pRow[0].category;
      }
    }

    const saved = await upsertGroupMembership({
      groupId,
      userId,
      playerId: finalPlayerId,
      memberRole,
      playerCategory,
    });

    res.status(201).json({ member: saved });
  } catch (error) {
    console.error('Erro ao adicionar participante na pelada fixa:', error);
    res.status(500).json({ error: 'Falha ao adicionar participante na pelada.' });
  }
});

apiRouter.get('/groups/:id/criteria', requireAuth, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'ID inválido.' });
    const criteriaConfig = await getGroupCriteriaConfig(groupId);
    res.json({ criteriaConfig });
  } catch (error) {
    console.error('Erro ao carregar critérios da pelada:', error);
    res.status(500).json({ error: 'Falha ao carregar critérios da nota.' });
  }
});

apiRouter.put('/groups/:id/criteria', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'ID inválido.' });
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem alterar os critérios da nota.' });
    }

    const inputList = req.body?.criteria;
    if (!Array.isArray(inputList) || inputList.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um critério válido.' });
    }

    const sanitized: GroupCriterion[] = [];
    const seen = new Set<string>();
    for (const item of inputList) {
      if (!item || typeof item !== 'object') continue;
      const rawKey = String(item.key ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 48);
      const label = String(item.label ?? '').trim().slice(0, 60);
      if (!label) continue;
      const key =
        rawKey ||
        `custom_${label
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 24)}_${sanitized.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const short = String(item.short ?? label.slice(0, 10)).trim().slice(0, 16) || label.slice(0, 10);
      const weightNum = Number(item.weight ?? 1);
      const weight = Number.isFinite(weightNum)
        ? Math.max(0.5, Math.min(5, Math.round(weightNum * 2) / 2))
        : 1;
      sanitized.push({
        key,
        label,
        short,
        weight,
        enabled: item.enabled !== false,
      });
    }

    if (!sanitized.some((c) => c.enabled)) {
      return res.status(400).json({ error: 'Pelo menos 1 critério deve permanecer ativo para compor a nota.' });
    }

    await db
      .update(peladaGroups)
      .set({ criteriaConfig: JSON.stringify(sanitized) })
      .where(eq(peladaGroups.id, groupId));

    const members = await db
      .select({ playerId: peladaGroupMembers.playerId })
      .from(peladaGroupMembers)
      .where(and(eq(peladaGroupMembers.groupId, groupId), isNotNull(peladaGroupMembers.playerId)));

    const playerIds = Array.from(
      new Set(members.map((m) => m.playerId).filter((id): id is number => id != null))
    );
    for (const pid of playerIds) {
      await recalculatePlayerRatings(pid, { groupId, criteriaOverride: sanitized });
    }

    res.json({ criteriaConfig: sanitized, updatedPlayersCount: playerIds.length });
  } catch (error) {
    console.error('Erro ao atualizar critérios da pelada:', error);
    res.status(500).json({ error: 'Falha ao salvar critérios da pelada.' });
  }
});

apiRouter.patch('/groups/:id/members/:memberId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    if (!Number.isInteger(groupId) || !Number.isInteger(memberId)) {
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Acesso restrito a administradores.' });
    }

    const existingRows = await db
      .select()
      .from(peladaGroupMembers)
      .where(and(eq(peladaGroupMembers.groupId, groupId), eq(peladaGroupMembers.id, memberId)))
      .limit(1);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado nesta pelada.' });
    }
    const prev = existingRows[0];

    const nextRole =
      req.body?.memberRole === 'admin'
        ? 'admin'
        : req.body?.memberRole === 'member'
          ? 'member'
          : prev.memberRole;
    const nextAdminTitle =
      nextRole !== 'admin'
        ? null
        : req.body?.adminTitle !== undefined
          ? VALID_ADMIN_TITLES.has(String(req.body.adminTitle))
            ? String(req.body.adminTitle)
            : 'administrador'
          : prev.adminTitle ?? 'administrador';
    const nextCategory =
      req.body?.playerCategory && VALID_CATEGORIES.has(req.body.playerCategory)
        ? String(req.body.playerCategory)
        : prev.playerCategory;

    const updated = await db
      .update(peladaGroupMembers)
      .set({
        memberRole: nextRole,
        adminTitle: nextAdminTitle,
        playerCategory: nextCategory,
      })
      .where(eq(peladaGroupMembers.id, memberId))
      .returning();

    if (nextRole === 'admin' && prev.userId) {
      const pendingPlayers = await db
        .select({
          id: players.id,
          name: players.name,
          nickname: players.nickname,
        })
        .from(peladaGroupMembers)
        .innerJoin(players, eq(peladaGroupMembers.playerId, players.id))
        .where(
          and(
            eq(peladaGroupMembers.groupId, groupId),
            eq(players.initRatingStatus, 'pending_votes')
          )
        );
      for (const pp of pendingPlayers) {
        await notifyPeladaAdminsForNewPlayer({
          playerId: pp.id,
          playerNickname: pp.nickname,
          playerName: pp.name,
          groupId,
          creatorUserId: null,
          creatorVoted: false,
        });
      }
    }

    res.json({ member: updated[0] });
  } catch (error) {
    console.error('Erro ao atualizar membro da pelada fixa:', error);
    res.status(500).json({ error: 'Falha ao atualizar participante.' });
  }
});

apiRouter.delete('/groups/:id/members/:memberId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    if (!Number.isInteger(groupId) || !Number.isInteger(memberId)) {
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem remover membros.' });
    }
    await db
      .delete(peladaGroupMembers)
      .where(and(eq(peladaGroupMembers.groupId, groupId), eq(peladaGroupMembers.id, memberId)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover participante da pelada fixa:', error);
    res.status(500).json({ error: 'Falha ao remover participante.' });
  }
});

// ==========================================
// SOLICITAÇÕES DE ENTRADA & E-MAIL RESUMO EVENTUAL
// ==========================================

apiRouter.post('/groups/:id/join-requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'Pelada inválida.' });

    const groupRows = await db.select().from(peladaGroups).where(eq(peladaGroups.id, groupId)).limit(1);
    if (groupRows.length === 0) return res.status(404).json({ error: 'Pelada fixa não encontrada.' });
    const group = groupRows[0];

    const existingMemberRows = await db
      .select()
      .from(peladaGroupMembers)
      .where(
        and(
          eq(peladaGroupMembers.groupId, groupId),
          or(
            eq(peladaGroupMembers.userId, authUser.id),
            ...(authUser.playerId ? [eq(peladaGroupMembers.playerId, authUser.playerId)] : [])
          )
        )
      );
    if (existingMemberRows.some((m) => isMemberAccessActive(m))) {
      return res.status(400).json({ error: 'Você já possui acesso ativo a esta pelada.' });
    }

    const name = String(req.body?.name ?? authUser.name ?? '').trim();
    const nickname = String(req.body?.nickname ?? '').trim();
    const age = req.body?.age ? Number(req.body.age) : null;
    const position = VALID_POSITIONS.has(req.body?.position) ? req.body.position : 'Ala Direito';
    const dominantFoot = VALID_FEET.has(req.body?.dominantFoot) ? req.body.dominantFoot : 'Destro';
    const phone = String(req.body?.phone ?? '').trim() || null;
    const email = String(req.body?.email ?? authUser.email).trim().toLowerCase();
    const photoUrl = sanitizeImageUrl(req.body?.photoUrl);
    const requestedCategory = VALID_CATEGORIES.has(req.body?.requestedCategory)
      ? String(req.body.requestedCategory)
      : 'mensalista';
    const reqPeladaId = req.body?.requestedPeladaId ? Number(req.body.requestedPeladaId) : null;
    const message = String(req.body?.message ?? '').trim().slice(0, 500) || null;

    if (!name || !nickname) {
      return res.status(400).json({ error: 'Nome completo e apelido são obrigatórios.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }

    let resolvedPeladaId: number | null = null;
    if (reqPeladaId && Number.isInteger(reqPeladaId)) {
      const pelRow = await db
        .select({ id: peladas.id, groupId: peladas.groupId })
        .from(peladas)
        .where(eq(peladas.id, reqPeladaId))
        .limit(1);
      if (pelRow.length > 0 && pelRow[0].groupId === groupId) {
        resolvedPeladaId = pelRow[0].id;
      }
    }

    const criteriaConfig = await getGroupCriteriaConfig(groupId);
    const rawScores = req.body?.scores && typeof req.body.scores === 'object' ? req.body.scores : {};
    const criteria: SevenCriteria = {
      physical: clampHalfStepScore(rawScores.physical, 7),
      dribbling: clampHalfStepScore(rawScores.dribbling, 7),
      shooting: clampHalfStepScore(rawScores.shooting, 7),
      defense: clampHalfStepScore(rawScores.defense, 7),
      attack: clampHalfStepScore(rawScores.attack, 7),
      passing: clampHalfStepScore(rawScores.passing, 7),
      positioning: clampHalfStepScore(rawScores.positioning, 7),
    };
    const scoresMap: Record<string, number> = { ...criteria };
    for (const c of criteriaConfig) {
      if (rawScores[c.key] !== undefined) {
        scoresMap[c.key] = clampHalfStepScore(rawScores[c.key], 7);
      } else if (scoresMap[c.key] === undefined) {
        scoresMap[c.key] = 7;
      }
    }
    const overall = computeWeightedOverall(scoresMap, criteriaConfig);
    const scoresJson = JSON.stringify(scoresMap);

    await db.update(users).set({ name }).where(eq(users.id, authUser.id));

    const existingPlayerRows = await db
      .select()
      .from(players)
      .where(eq(players.userId, authUser.id))
      .limit(1);

    let savedPlayer: typeof players.$inferSelect;
    if (existingPlayerRows.length > 0) {
      const existingP = existingPlayerRows[0];
      const shouldUpdateSelfScores = existingP.initVotesCount === 0;
      const updated = await db
        .update(players)
        .set({
          name,
          nickname,
          age: age && Number.isFinite(age) ? Math.max(12, Math.min(80, Math.round(age))) : existingP.age,
          position,
          dominantFoot,
          phone,
          email,
          photoUrl: photoUrl ?? existingP.photoUrl,
          category: requestedCategory,
          profileCompleted: true,
          ...(shouldUpdateSelfScores
            ? {
                initPhysical: criteria.physical,
                initDribbling: criteria.dribbling,
                initShooting: criteria.shooting,
                initDefense: criteria.defense,
                initAttack: criteria.attack,
                initPassing: criteria.passing,
                initPositioning: criteria.positioning,
                initOverall: overall,
                curPhysical: criteria.physical,
                curDribbling: criteria.dribbling,
                curShooting: criteria.shooting,
                curDefense: criteria.defense,
                curAttack: criteria.attack,
                curPassing: criteria.passing,
                curPositioning: criteria.positioning,
                curOverall: overall,
                initScoresJson: scoresJson,
                curScoresJson: scoresJson,
                initRatingStatus: 'pending_votes',
              }
            : {}),
        })
        .where(eq(players.id, existingP.id))
        .returning();
      savedPlayer = updated[0];
    } else {
      const inserted = await db
        .insert(players)
        .values({
          userId: authUser.id,
          name,
          nickname,
          age: age && Number.isFinite(age) ? Math.max(12, Math.min(80, Math.round(age))) : null,
          position,
          dominantFoot,
          phone,
          email,
          photoUrl,
          initPhysical: criteria.physical,
          initDribbling: criteria.dribbling,
          initShooting: criteria.shooting,
          initDefense: criteria.defense,
          initAttack: criteria.attack,
          initPassing: criteria.passing,
          initPositioning: criteria.positioning,
          initOverall: overall,
          curPhysical: criteria.physical,
          curDribbling: criteria.dribbling,
          curShooting: criteria.shooting,
          curDefense: criteria.defense,
          curAttack: criteria.attack,
          curPassing: criteria.passing,
          curPositioning: criteria.positioning,
          curOverall: overall,
          ratedByUserId: authUser.id,
          category: requestedCategory,
          initRatingStatus: 'pending_votes',
          initVotesCount: 0,
          initScoresJson: scoresJson,
          curScoresJson: scoresJson,
          profileCompleted: true,
        })
        .returning();
      savedPlayer = inserted[0];
    }

    const reqRows = await db
      .insert(peladaJoinRequests)
      .values({
        groupId: group.id,
        userId: authUser.id,
        playerId: savedPlayer.id,
        requestedCategory,
        requestedPeladaId: resolvedPeladaId,
        message,
        scoresJson,
        status: 'pending',
        respondedByUserId: null,
        responseNote: null,
        respondedAt: null,
      })
      .onConflictDoUpdate({
        target: [peladaJoinRequests.groupId, peladaJoinRequests.userId],
        set: {
          playerId: savedPlayer.id,
          requestedCategory,
          requestedPeladaId: resolvedPeladaId,
          message,
          scoresJson,
          status: 'pending',
          respondedByUserId: null,
          responseNote: null,
          respondedAt: null,
          createdAt: new Date(),
        },
      })
      .returning();

    const joinReq = reqRows[0];

    await notifyPeladaAdminsForJoinRequest({
      joinRequestId: joinReq.id,
      groupId: group.id,
      playerId: savedPlayer.id,
      playerNickname: savedPlayer.nickname,
      playerName: savedPlayer.name,
      requestedCategory,
    });

    res.status(201).json({
      request: {
        ...joinReq,
        scores: scoresMap,
      },
      player: savedPlayer,
    });
  } catch (error) {
    console.error('Erro ao enviar solicitação de entrada na pelada:', error);
    res.status(500).json({ error: 'Falha ao enviar solicitação de entrada.' });
  }
});

apiRouter.get('/groups/:id/join-requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'ID inválido.' });

    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem analisar solicitações.' });
    }

    const [rows, criteriaConfig, groupPeladas] = await Promise.all([
      db
        .select({
          id: peladaJoinRequests.id,
          groupId: peladaJoinRequests.groupId,
          userId: peladaJoinRequests.userId,
          playerId: peladaJoinRequests.playerId,
          requestedCategory: peladaJoinRequests.requestedCategory,
          requestedPeladaId: peladaJoinRequests.requestedPeladaId,
          message: peladaJoinRequests.message,
          scoresJson: peladaJoinRequests.scoresJson,
          status: peladaJoinRequests.status,
          respondedByUserId: peladaJoinRequests.respondedByUserId,
          responseNote: peladaJoinRequests.responseNote,
          respondedAt: peladaJoinRequests.respondedAt,
          createdAt: peladaJoinRequests.createdAt,
          playerName: players.name,
          playerNickname: players.nickname,
          playerAge: players.age,
          playerPosition: players.position,
          playerDominantFoot: players.dominantFoot,
          playerPhone: players.phone,
          playerEmail: players.email,
          playerPhotoUrl: players.photoUrl,
          playerInitOverall: players.initOverall,
        })
        .from(peladaJoinRequests)
        .innerJoin(players, eq(peladaJoinRequests.playerId, players.id))
        .where(eq(peladaJoinRequests.groupId, groupId))
        .orderBy(peladaJoinRequests.status, desc(peladaJoinRequests.createdAt)),
      getGroupCriteriaConfig(groupId),
      db
        .select({
          id: peladas.id,
          title: peladas.title,
          eventDate: peladas.eventDate,
          startTime: peladas.startTime,
          status: peladas.status,
        })
        .from(peladas)
        .where(eq(peladas.groupId, groupId))
        .orderBy(desc(peladas.eventDate), desc(peladas.id)),
    ]);

    const responderIds = Array.from(
      new Set(rows.map((r) => r.respondedByUserId).filter((id): id is number => id != null))
    );
    const responderNames = new Map<number, string>();
    if (responderIds.length > 0) {
      const respUsers = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, responderIds));
      for (const u of respUsers) responderNames.set(u.id, u.name);
    }

    const peladaMap = new Map(groupPeladas.map((p) => [p.id, p]));

    res.json({
      criteriaConfig,
      upcomingPeladas: groupPeladas.slice(0, 12),
      requests: rows.map((r) => {
        const pel = r.requestedPeladaId ? peladaMap.get(r.requestedPeladaId) : null;
        return {
          id: r.id,
          groupId: r.groupId,
          userId: r.userId,
          playerId: r.playerId,
          requestedCategory: r.requestedCategory,
          requestedPeladaId: r.requestedPeladaId,
          requestedPeladaTitle: pel?.title ?? null,
          requestedPeladaDate: pel?.eventDate ?? null,
          message: r.message,
          scores: parseScoresJson(r.scoresJson),
          status: r.status,
          respondedByUserId: r.respondedByUserId,
          respondedByName: r.respondedByUserId ? (responderNames.get(r.respondedByUserId) ?? null) : null,
          responseNote: r.responseNote,
          respondedAt: r.respondedAt,
          createdAt: r.createdAt,
          player: {
            id: r.playerId,
            name: r.playerName,
            nickname: r.playerNickname,
            age: r.playerAge,
            position: r.playerPosition,
            dominantFoot: r.playerDominantFoot,
            phone: r.playerPhone,
            email: r.playerEmail,
            photoUrl: r.playerPhotoUrl,
            initOverall: r.playerInitOverall,
          },
          criteriaConfig,
        };
      }),
    });
  } catch (error) {
    console.error('Erro ao listar solicitações de entrada:', error);
    res.status(500).json({ error: 'Falha ao carregar solicitações de entrada.' });
  }
});

apiRouter.post('/join-requests/:requestId/respond', requireAuth, async (req: AuthRequest, res) => {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId)) return res.status(400).json({ error: 'Solicitação inválida.' });

    const reqRows = await db
      .select()
      .from(peladaJoinRequests)
      .where(eq(peladaJoinRequests.id, requestId))
      .limit(1);
    if (reqRows.length === 0) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const joinReq = reqRows[0];

    const allowed = await isUserAdminOfGroup(req.authUser!, joinReq.groupId);
    if (!allowed) {
      return res.status(403).json({
        error: 'Apenas administradores desta pelada podem autorizar ou recusar solicitações.',
      });
    }

    const decision = String(req.body?.decision ?? '');
    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ error: 'Informe decision: approve ou reject.' });
    }

    const responseNote = String(req.body?.responseNote ?? '').trim().slice(0, 400) || null;
    const nextStatus = decision === 'approve' ? 'approved' : 'rejected';

    const updatedReqRows = await db
      .update(peladaJoinRequests)
      .set({
        status: nextStatus,
        respondedByUserId: req.authUser!.id,
        responseNote,
        respondedAt: new Date(),
      })
      .where(eq(peladaJoinRequests.id, requestId))
      .returning();

    await db
      .update(adminNotifications)
      .set({ read: true, voted: true })
      .where(
        and(
          eq(adminNotifications.groupId, joinReq.groupId),
          eq(adminNotifications.playerId, joinReq.playerId),
          eq(adminNotifications.type, 'join_request')
        )
      );

    let membership = null;
    if (decision === 'approve') {
      const finalCategory = VALID_CATEGORIES.has(req.body?.category)
        ? String(req.body.category)
        : joinReq.requestedCategory;

      let finalPeladaId: number | null =
        req.body?.peladaId !== undefined
          ? req.body.peladaId
            ? Number(req.body.peladaId)
            : null
          : joinReq.requestedPeladaId;

      let accessExpiresAt: Date | null = null;
      if (finalCategory === 'eventual') {
        let targetEventDate: string | null = null;
        if (finalPeladaId && Number.isInteger(finalPeladaId)) {
          const pelRows = await db
            .select({ id: peladas.id, groupId: peladas.groupId, eventDate: peladas.eventDate })
            .from(peladas)
            .where(eq(peladas.id, finalPeladaId))
            .limit(1);
          if (pelRows.length > 0 && pelRows[0].groupId === joinReq.groupId) {
            targetEventDate = pelRows[0].eventDate;
          } else {
            finalPeladaId = null;
          }
        }
        if (!finalPeladaId) {
          const latestPel = await db
            .select({ id: peladas.id, eventDate: peladas.eventDate })
            .from(peladas)
            .where(eq(peladas.groupId, joinReq.groupId))
            .orderBy(desc(peladas.eventDate), desc(peladas.id))
            .limit(1);
          if (latestPel.length > 0) {
            finalPeladaId = latestPel[0].id;
            targetEventDate = latestPel[0].eventDate;
          }
        }
        accessExpiresAt = computeEventualExpiration(targetEventDate);
      } else {
        finalPeladaId = null;
        accessExpiresAt = null;
      }

      membership = await upsertGroupMembership({
        groupId: joinReq.groupId,
        userId: joinReq.userId,
        playerId: joinReq.playerId,
        memberRole: 'member',
        playerCategory: finalCategory,
        accessPeladaId: finalPeladaId,
        accessExpiresAt,
        resetEventualWindow: true,
      });

      await db
        .update(players)
        .set({ category: finalCategory })
        .where(eq(players.id, joinReq.playerId));

      if (finalCategory === 'eventual' && finalPeladaId) {
        await db
          .insert(peladaAttendances)
          .values({
            peladaId: finalPeladaId,
            playerId: joinReq.playerId,
            present: true,
            teamId: null,
          })
          .onConflictDoNothing();
      }

      const pRows = await db
        .select({
          id: players.id,
          name: players.name,
          nickname: players.nickname,
          initVotesCount: players.initVotesCount,
        })
        .from(players)
        .where(eq(players.id, joinReq.playerId))
        .limit(1);

      if (pRows[0] && pRows[0].initVotesCount === 0) {
        await notifyPeladaAdminsForNewPlayer({
          playerId: pRows[0].id,
          playerNickname: pRows[0].nickname,
          playerName: pRows[0].name,
          groupId: joinReq.groupId,
          creatorUserId: null,
          creatorVoted: false,
        });
      }
    }

    res.json({ request: updatedReqRows[0], membership });
  } catch (error) {
    console.error('Erro ao responder solicitação de entrada:', error);
    res.status(500).json({ error: 'Falha ao processar resposta da solicitação.' });
  }
});

apiRouter.get('/my-summary-emails', requireAuth, async (req: AuthRequest, res) => {
  try {
    await processEventualPostPeladaLifecycle();
    const authUser = req.authUser!;
    const conds = [eq(playerSummaryEmails.userId, authUser.id)];
    if (authUser.playerId) {
      conds.push(eq(playerSummaryEmails.playerId, authUser.playerId));
    }
    const rows = await db
      .select({
        id: playerSummaryEmails.id,
        groupId: playerSummaryEmails.groupId,
        groupName: peladaGroups.name,
        peladaId: playerSummaryEmails.peladaId,
        peladaTitle: peladas.title,
        peladaDate: peladas.eventDate,
        userId: playerSummaryEmails.userId,
        playerId: playerSummaryEmails.playerId,
        playerNickname: players.nickname,
        toEmail: playerSummaryEmails.toEmail,
        subject: playerSummaryEmails.subject,
        bodyText: playerSummaryEmails.bodyText,
        statsJson: playerSummaryEmails.statsJson,
        status: playerSummaryEmails.status,
        sentAt: playerSummaryEmails.sentAt,
      })
      .from(playerSummaryEmails)
      .innerJoin(peladaGroups, eq(playerSummaryEmails.groupId, peladaGroups.id))
      .leftJoin(peladas, eq(playerSummaryEmails.peladaId, peladas.id))
      .innerJoin(players, eq(playerSummaryEmails.playerId, players.id))
      .where(or(...conds))
      .orderBy(desc(playerSummaryEmails.sentAt));

    res.json(
      rows.map((r) => ({
        ...r,
        stats: r.statsJson ? JSON.parse(r.statsJson) : null,
      }))
    );
  } catch (error) {
    console.error('Erro ao carregar e-mails de resumo:', error);
    res.status(500).json({ error: 'Falha ao carregar e-mails de resumo.' });
  }
});

apiRouter.get('/groups/:id/summary-emails', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'ID inválido.' });
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem consultar e-mails enviados do grupo.' });
    }
    await processEventualPostPeladaLifecycle(groupId);

    const rows = await db
      .select({
        id: playerSummaryEmails.id,
        groupId: playerSummaryEmails.groupId,
        groupName: peladaGroups.name,
        peladaId: playerSummaryEmails.peladaId,
        peladaTitle: peladas.title,
        peladaDate: peladas.eventDate,
        userId: playerSummaryEmails.userId,
        playerId: playerSummaryEmails.playerId,
        playerNickname: players.nickname,
        toEmail: playerSummaryEmails.toEmail,
        subject: playerSummaryEmails.subject,
        bodyText: playerSummaryEmails.bodyText,
        statsJson: playerSummaryEmails.statsJson,
        status: playerSummaryEmails.status,
        sentAt: playerSummaryEmails.sentAt,
      })
      .from(playerSummaryEmails)
      .innerJoin(peladaGroups, eq(playerSummaryEmails.groupId, peladaGroups.id))
      .leftJoin(peladas, eq(playerSummaryEmails.peladaId, peladas.id))
      .innerJoin(players, eq(playerSummaryEmails.playerId, players.id))
      .where(eq(playerSummaryEmails.groupId, groupId))
      .orderBy(desc(playerSummaryEmails.sentAt));

    res.json(
      rows.map((r) => ({
        ...r,
        stats: r.statsJson ? JSON.parse(r.statsJson) : null,
      }))
    );
  } catch (error) {
    console.error('Erro ao listar e-mails de resumo do grupo:', error);
    res.status(500).json({ error: 'Falha ao carregar e-mails de resumo da pelada.' });
  }
});

apiRouter.post('/groups/:id/process-eventual-emails', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) return res.status(400).json({ error: 'ID inválido.' });
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Acesso restrito a administradores da pelada.' });
    }

    const memberId = req.body?.memberId ? Number(req.body.memberId) : null;
    if (memberId && Number.isInteger(memberId)) {
      const mRows = await db
        .select()
        .from(peladaGroupMembers)
        .where(and(eq(peladaGroupMembers.id, memberId), eq(peladaGroupMembers.groupId, groupId)))
        .limit(1);
      if (mRows.length === 0) return res.status(404).json({ error: 'Participante não encontrado.' });
      await db
        .update(peladaGroupMembers)
        .set({ accessExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(peladaGroupMembers.id, memberId));
      const rec = await generateSummaryEmailForEventualMember(mRows[0]);
      return res.json({ processedCount: rec ? 1 : 0, emails: rec ? [rec] : [] });
    }

    const generated = await processEventualPostPeladaLifecycle(groupId, { forceFinished: true });
    res.json({ processedCount: generated.length, emails: generated });
  } catch (error) {
    console.error('Erro ao processar e-mails pós-pelada:', error);
    res.status(500).json({ error: 'Falha ao processar e-mails de resumo.' });
  }
});

// ==========================================
// SEASONS (TEMPORADAS)
// ==========================================

apiRouter.get('/seasons', requireAuth, async (req, res) => {
  try {
    const groupId = req.query.groupId ? Number(req.query.groupId) : null;
    const list =
      groupId && Number.isInteger(groupId)
        ? await db.select().from(seasons).where(eq(seasons.groupId, groupId)).orderBy(desc(seasons.id))
        : await db.select().from(seasons).orderBy(desc(seasons.id));
    res.json(list);
  } catch (error) {
    console.error('Erro ao listar temporadas:', error);
    res.status(500).json({ error: 'Falha ao carregar temporadas.' });
  }
});

apiRouter.post('/seasons', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = req.body?.groupId ? Number(req.body.groupId) : null;
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem abrir temporadas.' });
    }

    const name = String(req.body?.name ?? '').trim();
    const description = String(req.body?.description ?? '').trim() || null;
    const startDate = String(req.body?.startDate ?? new Date().toISOString().slice(0, 10));

    if (!name) {
      return res.status(400).json({ error: 'Informe o nome da temporada.' });
    }

    const inserted = await db
      .insert(seasons)
      .values({
        groupId: groupId && Number.isInteger(groupId) ? groupId : null,
        name,
        description,
        startDate,
        status: 'open',
        createdByUserId: req.authUser!.id,
      })
      .returning();

    res.status(201).json(inserted[0]);
  } catch (error) {
    console.error('Erro ao abrir temporada:', error);
    res.status(500).json({ error: 'Falha ao abrir nova temporada.' });
  }
});

apiRouter.post('/seasons/:id/close', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

    const seasonRow = await db.select().from(seasons).where(eq(seasons.id, id)).limit(1);
    if (seasonRow.length === 0) return res.status(404).json({ error: 'Temporada não encontrada.' });

    const allowed = await isUserAdminOfGroup(req.authUser!, seasonRow[0].groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem fechar temporadas.' });
    }

    const stats = await computeSeasonStats(id);
    if (!stats) return res.status(404).json({ error: 'Temporada não encontrada.' });

    const summary = {
      totals: stats.totals,
      awards: {
        artilheiro: stats.topScorers[0] ?? null,
        reiAssistencias: stats.topAssists[0] ?? null,
        melhorDefensor: stats.bestDefenders[0] ?? null,
        goleiroDestaque: stats.bestGoalkeepers[0] ?? null,
        maisAssiduo: stats.attendanceRanking[0] ?? null,
        craqueTemporada: stats.mvpRanking[0] ?? null,
      },
      closedAt: new Date().toISOString(),
    };

    const endDate = new Date().toISOString().slice(0, 10);
    const updated = await db
      .update(seasons)
      .set({
        status: 'closed',
        endDate,
        closedAt: new Date(),
        summaryJson: JSON.stringify(summary),
      })
      .where(eq(seasons.id, id))
      .returning();

    res.json({ season: updated[0], summary });
  } catch (error) {
    console.error('Erro ao fechar temporada:', error);
    res.status(500).json({ error: 'Falha ao fechar temporada.' });
  }
});

apiRouter.post('/seasons/:id/reopen', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

    const seasonRow = await db.select().from(seasons).where(eq(seasons.id, id)).limit(1);
    if (seasonRow.length === 0) return res.status(404).json({ error: 'Temporada não encontrada.' });

    const allowed = await isUserAdminOfGroup(req.authUser!, seasonRow[0].groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem reabrir temporadas.' });
    }

    const updated = await db
      .update(seasons)
      .set({ status: 'open', endDate: null, closedAt: null })
      .where(eq(seasons.id, id))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    console.error('Erro ao reabrir temporada:', error);
    res.status(500).json({ error: 'Falha ao reabrir temporada.' });
  }
});

apiRouter.get('/seasons/:id/stats', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
    const stats = await computeSeasonStats(id);
    if (!stats) return res.status(404).json({ error: 'Temporada não encontrada.' });
    res.json(stats);
  } catch (error) {
    console.error('Erro ao carregar estatísticas da temporada:', error);
    res.status(500).json({ error: 'Falha ao carregar estatísticas.' });
  }
});

// ==========================================
// PELADAS, TIMES, PARTIDAS & EVENTOS
// ==========================================

apiRouter.get('/peladas', requireAuth, async (req, res) => {
  try {
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const groupId = req.query.groupId ? Number(req.query.groupId) : null;

    const conditions = [];
    if (seasonId && Number.isInteger(seasonId)) {
      conditions.push(eq(peladas.seasonId, seasonId));
    }
    if (groupId && Number.isInteger(groupId)) {
      conditions.push(eq(peladas.groupId, groupId));
    }

    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(peladas)
            .where(and(...conditions))
            .orderBy(desc(peladas.eventDate), desc(peladas.id))
        : await db.select().from(peladas).orderBy(desc(peladas.eventDate), desc(peladas.id));

    const peladaIds = rows.map((r) => r.id);
    const attCounts = new Map<number, number>();
    const matchCounts = new Map<number, number>();

    if (peladaIds.length > 0) {
      const atts = await db
        .select()
        .from(peladaAttendances)
        .where(inArray(peladaAttendances.peladaId, peladaIds));
      for (const a of atts) {
        if (a.present) attCounts.set(a.peladaId, (attCounts.get(a.peladaId) ?? 0) + 1);
      }

      const mList = await db
        .select({ id: matches.id, peladaId: matches.peladaId })
        .from(matches)
        .where(inArray(matches.peladaId, peladaIds));
      for (const m of mList) {
        matchCounts.set(m.peladaId, (matchCounts.get(m.peladaId) ?? 0) + 1);
      }
    }

    res.json(
      rows.map((r) => ({
        ...r,
        presentCount: attCounts.get(r.id) ?? 0,
        matchesCount: matchCounts.get(r.id) ?? 0,
      }))
    );
  } catch (error) {
    console.error('Erro ao listar peladas:', error);
    res.status(500).json({ error: 'Falha ao carregar peladas.' });
  }
});

apiRouter.post('/peladas', requireAuth, async (req: AuthRequest, res) => {
  try {
    const seasonId = Number(req.body?.seasonId);
    const reqGroupId = req.body?.groupId ? Number(req.body.groupId) : null;
    const title = String(req.body?.title ?? '').trim();
    const location = String(req.body?.location ?? '').trim() || 'Quadra Principal';
    const eventDate = String(req.body?.eventDate ?? new Date().toISOString().slice(0, 10));
    const startTime = normalizeTimeStr(req.body?.startTime, '20:00');
    const playersPerTeam = Math.max(3, Math.min(7, Number(req.body?.playersPerTeam ?? 5)));
    const teamCount = Math.max(2, Math.min(12, Math.round(Number(req.body?.teamCount ?? 2))));
    const notes = String(req.body?.notes ?? '').trim() || null;

    if (!Number.isInteger(seasonId)) {
      return res.status(400).json({ error: 'Selecione uma temporada aberta.' });
    }
    if (!title) {
      return res.status(400).json({ error: 'Informe o nome da pelada.' });
    }

    const seasonRow = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
    if (seasonRow.length === 0) {
      return res.status(404).json({ error: 'Temporada não encontrada.' });
    }
    if (seasonRow[0].status === 'closed') {
      return res.status(400).json({
        error: 'Esta temporada está encerrada. Reabra ou crie uma nova temporada.',
      });
    }

    const resolvedGroupId =
      reqGroupId && Number.isInteger(reqGroupId) ? reqGroupId : seasonRow[0].groupId ?? null;
    const allowed = await isUserAdminOfGroup(req.authUser!, resolvedGroupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem cadastrar encontros.' });
    }

    let fallbackEndTime = '22:00';
    if (resolvedGroupId) {
      const gRow = await db
        .select({ endTime: peladaGroups.endTime })
        .from(peladaGroups)
        .where(eq(peladaGroups.id, resolvedGroupId))
        .limit(1);
      if (gRow[0]?.endTime) fallbackEndTime = gRow[0].endTime;
    }
    const endTime = normalizeTimeStr(req.body?.endTime, fallbackEndTime);

    const inserted = await db
      .insert(peladas)
      .values({
        groupId: resolvedGroupId,
        seasonId,
        title,
        location,
        eventDate,
        startTime,
        endTime,
        playersPerTeam,
        status: 'in_progress',
        notes,
        createdByUserId: req.authUser!.id,
      })
      .returning();

    const pelada = inserted[0];
    const presetTeams = [
      { name: 'Time Verde', colorHex: '#059669' },
      { name: 'Time Branco', colorHex: '#475569' },
      { name: 'Time Ouro', colorHex: '#D97706' },
      { name: 'Time Azul', colorHex: '#2563EB' },
      { name: 'Time Vermelho', colorHex: '#DC2626' },
      { name: 'Time Preto', colorHex: '#0F172A' },
      { name: 'Time Laranja', colorHex: '#EA580C' },
      { name: 'Time Roxo', colorHex: '#7C3AED' },
      { name: 'Time Celeste', colorHex: '#0284C7' },
      { name: 'Time Cinza', colorHex: '#64748B' },
      { name: 'Time Vinho', colorHex: '#9F1239' },
      { name: 'Time Lima', colorHex: '#65A30D' },
    ];

    const createdTeams = await db
      .insert(peladaTeams)
      .values(
        presetTeams.slice(0, teamCount).map((t) => ({
          peladaId: pelada.id,
          name: t.name,
          colorHex: t.colorHex,
        }))
      )
      .returning();

    res.status(201).json({ pelada, teams: createdTeams });
  } catch (error) {
    console.error('Erro ao criar pelada:', error);
    res.status(500).json({ error: 'Falha ao cadastrar pelada.' });
  }
});

apiRouter.get('/peladas/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

    const peladaRows = await db.select().from(peladas).where(eq(peladas.id, id)).limit(1);
    if (peladaRows.length === 0) return res.status(404).json({ error: 'Pelada não encontrada.' });

    if (peladaRows[0].groupId) {
      const allowed = await hasActiveGroupAccess(req.authUser!, peladaRows[0].groupId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Seu acesso a esta pelada não está autorizado ou o prazo de validade expirou.',
        });
      }
    }

    const teams = await db
      .select()
      .from(peladaTeams)
      .where(eq(peladaTeams.peladaId, id))
      .orderBy(peladaTeams.id);

    const attendances = await db
      .select({
        id: peladaAttendances.id,
        peladaId: peladaAttendances.peladaId,
        playerId: peladaAttendances.playerId,
        teamId: peladaAttendances.teamId,
        present: peladaAttendances.present,
        playerName: players.name,
        playerNickname: players.nickname,
        playerPosition: players.position,
        playerOverall: players.curOverall,
        playerPhoto: players.photoUrl,
        playerUserId: players.userId,
        playerCategory: players.category,
      })
      .from(peladaAttendances)
      .innerJoin(players, eq(peladaAttendances.playerId, players.id))
      .where(eq(peladaAttendances.peladaId, id));

    const matchRows = await db
      .select()
      .from(matches)
      .where(eq(matches.peladaId, id))
      .orderBy(desc(matches.matchNumber), desc(matches.id));

    const events = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.peladaId, id))
      .orderBy(matchEvents.minute, matchEvents.id);

    const stats = await computePeladaStats(id);
    const criteriaConfig = await getPeladaCriteriaConfig(id);

    res.json({
      pelada: {
        ...peladaRows[0],
        criteriaConfig,
      },
      criteriaConfig,
      teams,
      attendances,
      matches: matchRows.map((m) => ({
        ...m,
        events: events.filter((e) => e.matchId === m.id),
      })),
      stats,
    });
  } catch (error) {
    console.error('Erro ao carregar detalhes da pelada:', error);
    res.status(500).json({ error: 'Falha ao carregar dados da pelada.' });
  }
});

apiRouter.patch('/peladas/:id/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const status = String(req.body?.status ?? '');
    if (!['scheduled', 'in_progress', 'finished'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const existingPelada = await db.select().from(peladas).where(eq(peladas.id, id)).limit(1);
    if (existingPelada.length === 0) {
      return res.status(404).json({ error: 'Pelada não encontrada.' });
    }
    const pelada = existingPelada[0];
    const allowed = await isUserAdminOfGroup(req.authUser!, pelada.groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem alterar o status da pelada.' });
    }

    const updated = await db
      .update(peladas)
      .set({ status })
      .where(eq(peladas.id, id))
      .returning();

    let financeSummary = null;
    if (status === 'finished' && pelada.groupId) {
      financeSummary = await ensurePeladaCharges({
        groupId: pelada.groupId,
        peladaId: id,
        createMissingForPelada: true,
      });
    }

    res.json({
      ...updated[0],
      financeSummary,
    });
  } catch (error) {
    console.error('Erro ao atualizar status da pelada:', error);
    res.status(500).json({ error: 'Falha ao atualizar status.' });
  }
});

apiRouter.post('/peladas/:id/rsvp', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    const playerId = req.authUser!.playerId;
    if (!playerId) {
      return res.status(400).json({
        error: 'Complete sua ficha de peladeiro antes de confirmar presença.',
      });
    }
    const pelRow = await db.select().from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (pelRow.length === 0) return res.status(404).json({ error: 'Pelada não encontrada.' });
    if (pelRow[0].groupId) {
      const allowed = await hasActiveGroupAccess(req.authUser!, pelRow[0].groupId);
      if (!allowed) {
        return res.status(403).json({
          error: 'Seu acesso a esta pelada não está autorizado ou já expirou.',
        });
      }
    }

    const present = req.body?.present !== false;

    if (present && pelRow[0].groupId) {
      await db
        .update(peladaGroupMembers)
        .set({
          accessPeladaId: peladaId,
          accessExpiresAt: computeEventualExpiration(pelRow[0].eventDate),
          summaryEmailSentAt: null,
        })
        .where(
          and(
            eq(peladaGroupMembers.groupId, pelRow[0].groupId),
            eq(peladaGroupMembers.playerId, playerId),
            eq(peladaGroupMembers.playerCategory, 'eventual'),
            isNull(peladaGroupMembers.accessExpiresAt)
          )
        );
    }

    const existing = await db
      .select()
      .from(peladaAttendances)
      .where(
        and(eq(peladaAttendances.peladaId, peladaId), eq(peladaAttendances.playerId, playerId))
      )
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(peladaAttendances)
        .set({ present, teamId: present ? existing[0].teamId : null })
        .where(eq(peladaAttendances.id, existing[0].id))
        .returning();
      return res.json(updated[0]);
    }

    const inserted = await db
      .insert(peladaAttendances)
      .values({ peladaId, playerId, present, teamId: null })
      .returning();
    res.status(201).json(inserted[0]);
  } catch (error) {
    console.error('Erro ao confirmar presença:', error);
    res.status(500).json({ error: 'Falha ao registrar presença.' });
  }
});

apiRouter.post('/peladas/:id/attendance', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    const playerId = Number(req.body?.playerId);
    const present = req.body?.present !== false;
    const teamId =
      req.body?.teamId === null || req.body?.teamId === undefined
        ? null
        : Number(req.body.teamId);

    if (!Number.isInteger(peladaId) || !Number.isInteger(playerId)) {
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }

    const pelRow = await db.select().from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (pelRow.length === 0) return res.status(404).json({ error: 'Pelada não encontrada.' });
    const allowed = await isUserAdminOfGroup(req.authUser!, pelRow[0].groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem gerenciar presenças.' });
    }

    if (present) {
      if (pelRow[0].groupId) {
        await db
          .update(peladaGroupMembers)
          .set({
            accessPeladaId: peladaId,
            accessExpiresAt: computeEventualExpiration(pelRow[0].eventDate),
            summaryEmailSentAt: null,
          })
          .where(
            and(
              eq(peladaGroupMembers.groupId, pelRow[0].groupId),
              eq(peladaGroupMembers.playerId, playerId),
              eq(peladaGroupMembers.playerCategory, 'eventual'),
              isNull(peladaGroupMembers.accessExpiresAt)
            )
          );
      }
    }

    const existing = await db
      .select()
      .from(peladaAttendances)
      .where(
        and(eq(peladaAttendances.peladaId, peladaId), eq(peladaAttendances.playerId, playerId))
      )
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(peladaAttendances)
        .set({
          present,
          teamId: present ? (req.body?.teamId !== undefined ? teamId : existing[0].teamId) : null,
        })
        .where(eq(peladaAttendances.id, existing[0].id))
        .returning();
      return res.json(updated[0]);
    }

    const inserted = await db
      .insert(peladaAttendances)
      .values({ peladaId, playerId, present, teamId: present ? teamId : null })
      .returning();

    res.status(201).json(inserted[0]);
  } catch (error) {
    console.error('Erro ao gerenciar presença:', error);
    res.status(500).json({ error: 'Falha ao atualizar lista de presença.' });
  }
});

apiRouter.post('/peladas/:id/teams', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    if (!Number.isInteger(peladaId)) return res.status(400).json({ error: 'ID inválido.' });
    const pelRow = await db.select({ groupId: peladas.groupId }).from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (pelRow.length === 0) return res.status(404).json({ error: 'Pelada não encontrada.' });
    const allowed = await isUserAdminOfGroup(req.authUser!, pelRow[0].groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem criar times.' });
    }

    const name = String(req.body?.name ?? '').trim();
    const colorHex = String(req.body?.colorHex ?? '#059669').trim();
    if (!name) return res.status(400).json({ error: 'Informe o nome do time.' });

    const inserted = await db
      .insert(peladaTeams)
      .values({ peladaId, name, colorHex })
      .returning();
    res.status(201).json(inserted[0]);
  } catch (error) {
    console.error('Erro ao criar time:', error);
    res.status(500).json({ error: 'Falha ao criar time.' });
  }
});

apiRouter.delete('/peladas/:id/teams/:teamId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    const teamId = Number(req.params.teamId);
    if (!Number.isInteger(peladaId) || !Number.isInteger(teamId)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const pelRow = await db.select({ groupId: peladas.groupId }).from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (pelRow.length === 0) return res.status(404).json({ error: 'Pelada não encontrada.' });
    const allowed = await isUserAdminOfGroup(req.authUser!, pelRow[0].groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem remover times.' });
    }

    const usedInMatch = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.peladaId, peladaId),
          sql`(${matches.teamAId} = ${teamId} OR ${matches.teamBId} = ${teamId})`
        )
      )
      .limit(1);

    if (usedInMatch.length > 0) {
      return res.status(400).json({
        error: 'Não é possível excluir um time que já possui partidas registradas.',
      });
    }

    await db
      .update(peladaAttendances)
      .set({ teamId: null })
      .where(and(eq(peladaAttendances.peladaId, peladaId), eq(peladaAttendances.teamId, teamId)));
    await db
      .delete(peladaTeams)
      .where(and(eq(peladaTeams.peladaId, peladaId), eq(peladaTeams.id, teamId)));

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao excluir time:', error);
    res.status(500).json({ error: 'Falha ao remover time.' });
  }
});

apiRouter.post('/peladas/:id/teams/auto-balance', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    if (!Number.isInteger(peladaId)) return res.status(400).json({ error: 'ID inválido.' });
    const pelRow = await db.select({ groupId: peladas.groupId }).from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (pelRow.length === 0) return res.status(404).json({ error: 'Pelada não encontrada.' });
    const allowed = await isUserAdminOfGroup(req.authUser!, pelRow[0].groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem sortear times.' });
    }
    const existingTeams = await db
      .select()
      .from(peladaTeams)
      .where(eq(peladaTeams.peladaId, peladaId))
      .orderBy(peladaTeams.id);

    if (existingTeams.length < 2) {
      return res.status(400).json({ error: 'Crie pelo menos 2 times para separar os jogadores.' });
    }

    const presentAtts = await db
      .select({
        attId: peladaAttendances.id,
        playerId: players.id,
        name: players.name,
        nickname: players.nickname,
        position: players.position,
        curOverall: players.curOverall,
      })
      .from(peladaAttendances)
      .innerJoin(players, eq(peladaAttendances.playerId, players.id))
      .where(and(eq(peladaAttendances.peladaId, peladaId), eq(peladaAttendances.present, true)));

    if (presentAtts.length < 2) {
      return res.status(400).json({
        error: 'Confirme pelo menos 2 jogadores presentes na pelada antes de sortear os times.',
      });
    }

    const buckets = balancePlayersIntoTeams(
      presentAtts.map((a) => ({
        id: a.playerId,
        name: a.name,
        nickname: a.nickname,
        position: a.position,
        curOverall: a.curOverall,
      })),
      existingTeams.length
    );

    for (const bucket of buckets) {
      const targetTeam = existingTeams[bucket.teamIndex];
      if (!targetTeam || bucket.players.length === 0) continue;
      const pIds = bucket.players.map((p) => p.id);
      await db
        .update(peladaAttendances)
        .set({ teamId: targetTeam.id })
        .where(
          and(
            eq(peladaAttendances.peladaId, peladaId),
            inArray(peladaAttendances.playerId, pIds)
          )
        );
    }

    res.json({ ok: true, balancedTeams: buckets.length });
  } catch (error) {
    console.error('Erro ao balancear times:', error);
    res.status(500).json({ error: 'Falha ao separar os times.' });
  }
});

// ==========================================
// MATCHES & EVENTS (GOLS, ASSISTÊNCIAS, DEFESAS)
// ==========================================

apiRouter.post('/peladas/:id/matches', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    const teamAId = Number(req.body?.teamAId);
    const teamBId = Number(req.body?.teamBId);
    const durationMinutes = Math.max(5, Math.min(60, Number(req.body?.durationMinutes ?? 10)));

    if (!Number.isInteger(teamAId) || !Number.isInteger(teamBId) || teamAId === teamBId) {
      return res.status(400).json({ error: 'Selecione dois times diferentes para a partida.' });
    }

    const peladaRows = await db.select().from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (peladaRows.length === 0) return res.status(404).json({ error: 'Pelada não encontrada.' });
    const allowed = await isUserAdminOfGroup(req.authUser!, peladaRows[0].groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem iniciar partidas.' });
    }

    const existingMatches = await db
      .select({ matchNumber: matches.matchNumber })
      .from(matches)
      .where(eq(matches.peladaId, peladaId));
    const nextNumber =
      existingMatches.reduce((max, m) => Math.max(max, m.matchNumber), 0) + 1;

    const inserted = await db
      .insert(matches)
      .values({
        peladaId,
        seasonId: peladaRows[0].seasonId,
        matchNumber: nextNumber,
        teamAId,
        teamBId,
        scoreA: 0,
        scoreB: 0,
        status: 'live',
        durationMinutes,
      })
      .returning();

    res.status(201).json(inserted[0]);
  } catch (error) {
    console.error('Erro ao iniciar partida:', error);
    res.status(500).json({ error: 'Falha ao criar partida.' });
  }
});

async function syncMatchScoreFromEvents(matchId: number) {
  const matchRows = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (matchRows.length === 0) return null;
  const m = matchRows[0];
  const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId));

  let scoreA = 0;
  let scoreB = 0;
  for (const ev of events) {
    if (ev.eventType === 'goal') {
      if (ev.teamId === m.teamAId) scoreA += 1;
      else if (ev.teamId === m.teamBId) scoreB += 1;
    } else if (ev.eventType === 'own_goal') {
      if (ev.teamId === m.teamAId) scoreB += 1;
      else if (ev.teamId === m.teamBId) scoreA += 1;
    }
  }

  const updated = await db
    .update(matches)
    .set({ scoreA, scoreB })
    .where(eq(matches.id, matchId))
    .returning();

  if (m.status === 'finished') {
    await recalculatePeladaTeamStandings(m.peladaId);
  }

  return updated[0];
}

apiRouter.post('/matches/:id/events', requireAuth, async (req: AuthRequest, res) => {
  try {
    const matchId = Number(req.params.id);
    const eventType = String(req.body?.eventType ?? '');
    const teamId = Number(req.body?.teamId);
    const playerId = Number(req.body?.playerId);
    const assistPlayerId = req.body?.assistPlayerId ? Number(req.body.assistPlayerId) : null;
    const minute = Math.max(1, Math.min(90, Number(req.body?.minute ?? 1)));

    if (!['goal', 'defense', 'own_goal'].includes(eventType)) {
      return res.status(400).json({ error: 'Tipo de evento inválido.' });
    }
    if (!Number.isInteger(playerId) || !Number.isInteger(teamId)) {
      return res.status(400).json({ error: 'Informe jogador e time.' });
    }
    if (assistPlayerId && assistPlayerId === playerId) {
      return res.status(400).json({ error: 'O autor do gol não pode dar assistência para si mesmo.' });
    }

    const matchRows = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (matchRows.length === 0) return res.status(404).json({ error: 'Partida não encontrada.' });
    const m = matchRows[0];

    const pelRow = await db.select({ groupId: peladas.groupId }).from(peladas).where(eq(peladas.id, m.peladaId)).limit(1);
    const allowed = await isUserAdminOfGroup(req.authUser!, pelRow[0]?.groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem registrar lances na partida.' });
    }

    const inserted = await db
      .insert(matchEvents)
      .values({
        matchId,
        peladaId: m.peladaId,
        seasonId: m.seasonId,
        teamId,
        eventType,
        playerId,
        assistPlayerId: eventType === 'goal' ? assistPlayerId : null,
        minute,
      })
      .returning();

    const updatedMatch = await syncMatchScoreFromEvents(matchId);
    res.status(201).json({ event: inserted[0], match: updatedMatch });
  } catch (error) {
    console.error('Erro ao registrar lance na partida:', error);
    res.status(500).json({ error: 'Falha ao registrar gol/assistência/defesa.' });
  }
});

apiRouter.delete('/match-events/:eventId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const eventId = Number(req.params.eventId);
    const rows = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, eventId))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Lance não encontrado.' });

    const pelRow = await db.select({ groupId: peladas.groupId }).from(peladas).where(eq(peladas.id, rows[0].peladaId)).limit(1);
    const allowed = await isUserAdminOfGroup(req.authUser!, pelRow[0]?.groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem remover lances da partida.' });
    }

    const matchId = rows[0].matchId;
    await db.delete(matchEvents).where(eq(matchEvents.id, eventId));
    const updatedMatch = await syncMatchScoreFromEvents(matchId);
    res.json({ ok: true, match: updatedMatch });
  } catch (error) {
    console.error('Erro ao excluir lance:', error);
    res.status(500).json({ error: 'Falha ao remover lance.' });
  }
});

apiRouter.post('/matches/:id/finish', requireAuth, async (req: AuthRequest, res) => {
  try {
    const matchId = Number(req.params.id);
    const matchRows = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (matchRows.length === 0) return res.status(404).json({ error: 'Partida não encontrada.' });

    const pelRow = await db.select({ groupId: peladas.groupId }).from(peladas).where(eq(peladas.id, matchRows[0].peladaId)).limit(1);
    const allowed = await isUserAdminOfGroup(req.authUser!, pelRow[0]?.groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem finalizar partidas.' });
    }

    const updated = await db
      .update(matches)
      .set({ status: 'finished', finishedAt: new Date() })
      .where(eq(matches.id, matchId))
      .returning();

    const teams = await recalculatePeladaTeamStandings(matchRows[0].peladaId);
    res.json({ match: updated[0], teams });
  } catch (error) {
    console.error('Erro ao finalizar partida:', error);
    res.status(500).json({ error: 'Falha ao finalizar partida.' });
  }
});

apiRouter.post('/matches/:id/reopen', requireAuth, async (req: AuthRequest, res) => {
  try {
    const matchId = Number(req.params.id);
    const matchRows = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (matchRows.length === 0) return res.status(404).json({ error: 'Partida não encontrada.' });

    const pelRow = await db.select({ groupId: peladas.groupId }).from(peladas).where(eq(peladas.id, matchRows[0].peladaId)).limit(1);
    const allowed = await isUserAdminOfGroup(req.authUser!, pelRow[0]?.groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores podem reabrir partidas.' });
    }

    const updated = await db
      .update(matches)
      .set({ status: 'live', finishedAt: null })
      .where(eq(matches.id, matchId))
      .returning();

    const teams = await recalculatePeladaTeamStandings(matchRows[0].peladaId);
    res.json({ match: updated[0], teams });
  } catch (error) {
    console.error('Erro ao reabrir partida:', error);
    res.status(500).json({ error: 'Falha ao reabrir partida.' });
  }
});

// ==========================================
// EVALUATIONS (7 CRITÉRIOS, ÚLTIMOS 10 JOGOS)
// ==========================================

apiRouter.get('/matches/:id/evaluations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const matchId = Number(req.params.id);
    const rows = await db
      .select()
      .from(playerEvaluations)
      .where(eq(playerEvaluations.matchId, matchId));

    res.json({
      evaluations: rows,
      myEvaluations: rows.filter((r) => r.evaluatorUserId === req.authUser!.id),
    });
  } catch (error) {
    console.error('Erro ao buscar avaliações da partida:', error);
    res.status(500).json({ error: 'Falha ao carregar avaliações.' });
  }
});

apiRouter.post('/matches/:id/evaluations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const matchId = Number(req.params.id);
    const playerId = Number(req.body?.playerId);
    if (!Number.isInteger(matchId) || !Number.isInteger(playerId)) {
      return res.status(400).json({ error: 'Partida ou jogador inválido.' });
    }

    const matchRows = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (matchRows.length === 0) return res.status(404).json({ error: 'Partida não encontrada.' });
    const m = matchRows[0];

    const targetPlayer = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    if (targetPlayer.length === 0) {
      return res.status(404).json({ error: 'Jogador não encontrado.' });
    }

    if (targetPlayer[0].userId && targetPlayer[0].userId === req.authUser!.id) {
      return res.status(400).json({ error: 'Você não pode avaliar a si mesmo.' });
    }

    const peladaRow = await db
      .select({ groupId: peladas.groupId })
      .from(peladas)
      .where(eq(peladas.id, m.peladaId))
      .limit(1);
    const groupId = peladaRow[0]?.groupId ?? null;
    const criteriaConfig = await getGroupCriteriaConfig(groupId);
    const rawScores = req.body?.scores && typeof req.body.scores === 'object' ? req.body.scores : {};

    const scoresMap: Record<string, number> = {
      physical: clampHalfStepScore(rawScores.physical ?? req.body?.physical, 7),
      dribbling: clampHalfStepScore(rawScores.dribbling ?? req.body?.dribbling, 7),
      shooting: clampHalfStepScore(rawScores.shooting ?? req.body?.shooting, 7),
      defense: clampHalfStepScore(rawScores.defense ?? req.body?.defense, 7),
      attack: clampHalfStepScore(rawScores.attack ?? req.body?.attack, 7),
      passing: clampHalfStepScore(rawScores.passing ?? req.body?.passing, 7),
      positioning: clampHalfStepScore(rawScores.positioning ?? req.body?.positioning, 7),
    };
    for (const c of criteriaConfig) {
      if (rawScores[c.key] !== undefined) {
        scoresMap[c.key] = clampHalfStepScore(rawScores[c.key], 7);
      } else if (scoresMap[c.key] === undefined) {
        scoresMap[c.key] = 7;
      }
    }

    const physical = clampIntScore(scoresMap.physical, 7);
    const dribbling = clampIntScore(scoresMap.dribbling, 7);
    const shooting = clampIntScore(scoresMap.shooting, 7);
    const defense = clampIntScore(scoresMap.defense, 7);
    const attack = clampIntScore(scoresMap.attack, 7);
    const passing = clampIntScore(scoresMap.passing, 7);
    const positioning = clampIntScore(scoresMap.positioning, 7);

    const averageScore = computeWeightedOverall(scoresMap, criteriaConfig);
    const scoresJson = JSON.stringify(scoresMap);
    const comment = String(req.body?.comment ?? '').trim().slice(0, 400) || null;

    const saved = await db
      .insert(playerEvaluations)
      .values({
        matchId,
        peladaId: m.peladaId,
        playerId,
        evaluatorUserId: req.authUser!.id,
        physical,
        dribbling,
        shooting,
        defense,
        attack,
        passing,
        positioning,
        scoresJson,
        averageScore,
        comment,
      })
      .onConflictDoUpdate({
        target: [
          playerEvaluations.matchId,
          playerEvaluations.playerId,
          playerEvaluations.evaluatorUserId,
        ],
        set: {
          physical,
          dribbling,
          shooting,
          defense,
          attack,
          passing,
          positioning,
          scoresJson,
          averageScore,
          comment,
        },
      })
      .returning();

    const updatedPlayer = await recalculatePlayerRatings(playerId, { groupId });
    res.status(201).json({ evaluation: saved[0], player: updatedPlayer });
  } catch (error) {
    console.error('Erro ao salvar avaliação:', error);
    res.status(500).json({ error: 'Falha ao registrar avaliação do jogador.' });
  }
});

apiRouter.put('/peladas/:id/criteria', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    if (!Number.isInteger(peladaId)) return res.status(400).json({ error: 'ID inválido.' });

    const pelRows = await db.select().from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (pelRows.length === 0) return res.status(404).json({ error: 'Encontro não encontrado.' });

    const allowed = await isUserAdminOfGroup(req.authUser!, pelRows[0].groupId);
    if (!allowed) {
      return res.status(403).json({
        error: 'Apenas administradores da pelada podem ajustar os critérios deste encontro.',
      });
    }

    const inputList = req.body?.criteria;
    if (!Array.isArray(inputList) || inputList.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um critério válido.' });
    }

    const sanitized: GroupCriterion[] = [];
    const seen = new Set<string>();
    for (const item of inputList) {
      if (!item || typeof item !== 'object') continue;
      const rawKey = String(item.key ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 48);
      const label = String(item.label ?? '').trim().slice(0, 60);
      if (!label) continue;
      const key =
        rawKey ||
        `custom_${label
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 24)}_${sanitized.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const short =
        String(item.short ?? label.slice(0, 10)).trim().slice(0, 16) || label.slice(0, 10);
      const weightNum = Number(item.weight ?? 1);
      const weight = Number.isFinite(weightNum)
        ? Math.max(0.5, Math.min(5, Math.round(weightNum * 2) / 2))
        : 1;
      sanitized.push({
        key,
        label,
        short,
        weight,
        enabled: item.enabled !== false,
      });
    }

    if (!sanitized.some((c) => c.enabled)) {
      return res.status(400).json({
        error: 'Pelo menos 1 critério deve permanecer ativo para compor a nota.',
      });
    }

    await db
      .update(peladas)
      .set({ criteriaConfig: JSON.stringify(sanitized) })
      .where(eq(peladas.id, peladaId));

    const attRows = await db
      .select({ playerId: peladaAttendances.playerId })
      .from(peladaAttendances)
      .where(eq(peladaAttendances.peladaId, peladaId));
    for (const a of attRows) {
      await recalculatePlayerRatings(a.playerId, {
        groupId: pelRows[0].groupId,
        criteriaOverride: sanitized,
      });
    }

    res.json({ criteriaConfig: sanitized });
  } catch (error) {
    console.error('Erro ao salvar critérios do encontro:', error);
    res.status(500).json({ error: 'Falha ao salvar critérios do encontro.' });
  }
});

apiRouter.get('/peladas/:id/encounter-evaluation', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    if (!Number.isInteger(peladaId)) return res.status(400).json({ error: 'ID inválido.' });

    const authUser = req.authUser!;
    const pelRows = await db.select().from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (pelRows.length === 0) return res.status(404).json({ error: 'Encontro não encontrado.' });
    const pelada = pelRows[0];

    if (pelada.groupId) {
      const allowed = await hasActiveGroupAccess(authUser, pelada.groupId);
      if (!allowed) {
        return res.status(403).json({ error: 'Acesso não autorizado a esta pelada.' });
      }
    }

    const attRows = await db
      .select({
        playerId: players.id,
        userId: players.userId,
        name: players.name,
        nickname: players.nickname,
        position: players.position,
        photoUrl: players.photoUrl,
        overall: players.curOverall,
      })
      .from(peladaAttendances)
      .innerJoin(players, eq(peladaAttendances.playerId, players.id))
      .where(and(eq(peladaAttendances.peladaId, peladaId), eq(peladaAttendances.present, true)));

    const endTimeReached = hasEncounterEndTimeReached(
      pelada.eventDate,
      pelada.endTime,
      pelada.status
    );
    const userAttended = attRows.some(
      (a) =>
        (authUser.playerId != null && a.playerId === authUser.playerId) ||
        (a.userId != null && a.userId === authUser.id)
    );
    const canEvaluate = userAttended && endTimeReached;

    const criteriaConfig = await getPeladaCriteriaConfig(peladaId);
    const participants = attRows
      .filter(
        (a) =>
          !(authUser.playerId != null && a.playerId === authUser.playerId) &&
          !(a.userId != null && a.userId === authUser.id)
      )
      .map((a) => ({
        playerId: a.playerId,
        name: a.name,
        nickname: a.nickname,
        position: a.position,
        photoUrl: a.photoUrl,
        overall: a.overall,
      }));

    const myEvaluations = await db
      .select()
      .from(playerEvaluations)
      .where(
        and(
          eq(playerEvaluations.peladaId, peladaId),
          isNull(playerEvaluations.matchId),
          eq(playerEvaluations.evaluatorUserId, authUser.id)
        )
      );

    res.json({
      canEvaluate,
      attended: userAttended,
      endTimeReached,
      criteriaConfig,
      participants,
      myEvaluations,
    });
  } catch (error) {
    console.error('Erro ao carregar avaliações do encontro:', error);
    res.status(500).json({ error: 'Falha ao carregar contexto de avaliação do encontro.' });
  }
});

apiRouter.post('/peladas/:id/encounter-evaluate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const peladaId = Number(req.params.id);
    const playerId = Number(req.body?.playerId);
    if (!Number.isInteger(peladaId) || !Number.isInteger(playerId)) {
      return res.status(400).json({ error: 'Encontro ou jogador inválido.' });
    }

    const authUser = req.authUser!;
    const pelRows = await db.select().from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (pelRows.length === 0) return res.status(404).json({ error: 'Encontro não encontrado.' });
    const pelada = pelRows[0];

    if (pelada.groupId) {
      const allowed = await hasActiveGroupAccess(authUser, pelada.groupId);
      if (!allowed) {
        return res.status(403).json({ error: 'Acesso não autorizado a esta pelada.' });
      }
    }

    const endTimeReached = hasEncounterEndTimeReached(
      pelada.eventDate,
      pelada.endTime,
      pelada.status
    );
    if (!endTimeReached) {
      return res.status(403).json({
        error: `A avaliação será liberada após o horário de término (${pelada.endTime}) ou encerramento do encontro.`,
      });
    }

    const attRows = await db
      .select({
        playerId: players.id,
        userId: players.userId,
      })
      .from(peladaAttendances)
      .innerJoin(players, eq(peladaAttendances.playerId, players.id))
      .where(and(eq(peladaAttendances.peladaId, peladaId), eq(peladaAttendances.present, true)));

    const userAttended = attRows.some(
      (a) =>
        (authUser.playerId != null && a.playerId === authUser.playerId) ||
        (a.userId != null && a.userId === authUser.id)
    );
    if (!userAttended) {
      return res.status(403).json({
        error: 'Apenas jogadores que compareceram a este encontro podem avaliar os participantes.',
      });
    }

    const targetAtt = attRows.find((a) => a.playerId === playerId);
    if (!targetAtt) {
      return res.status(400).json({
        error: 'Este jogador não consta como presente neste encontro.',
      });
    }
    if (
      (authUser.playerId != null && targetAtt.playerId === authUser.playerId) ||
      (targetAtt.userId != null && targetAtt.userId === authUser.id)
    ) {
      return res.status(400).json({ error: 'Você não pode avaliar a si mesmo.' });
    }

    const criteriaConfig = await getPeladaCriteriaConfig(peladaId);
    const rawScores = req.body?.scores && typeof req.body.scores === 'object' ? req.body.scores : {};
    const scoresMap: Record<string, number> = {
      physical: clampHalfStepScore(rawScores.physical ?? req.body?.physical, 7),
      dribbling: clampHalfStepScore(rawScores.dribbling ?? req.body?.dribbling, 7),
      shooting: clampHalfStepScore(rawScores.shooting ?? req.body?.shooting, 7),
      defense: clampHalfStepScore(rawScores.defense ?? req.body?.defense, 7),
      attack: clampHalfStepScore(rawScores.attack ?? req.body?.attack, 7),
      passing: clampHalfStepScore(rawScores.passing ?? req.body?.passing, 7),
      positioning: clampHalfStepScore(rawScores.positioning ?? req.body?.positioning, 7),
    };
    for (const c of criteriaConfig) {
      if (rawScores[c.key] !== undefined) {
        scoresMap[c.key] = clampHalfStepScore(rawScores[c.key], 7);
      } else if (scoresMap[c.key] === undefined) {
        scoresMap[c.key] = 7;
      }
    }

    const physical = clampIntScore(scoresMap.physical, 7);
    const dribbling = clampIntScore(scoresMap.dribbling, 7);
    const shooting = clampIntScore(scoresMap.shooting, 7);
    const defense = clampIntScore(scoresMap.defense, 7);
    const attack = clampIntScore(scoresMap.attack, 7);
    const passing = clampIntScore(scoresMap.passing, 7);
    const positioning = clampIntScore(scoresMap.positioning, 7);
    const averageScore = computeWeightedOverall(scoresMap, criteriaConfig);
    const scoresJson = JSON.stringify(scoresMap);
    const comment = String(req.body?.comment ?? '').trim().slice(0, 400) || null;

    const existing = await db
      .select()
      .from(playerEvaluations)
      .where(
        and(
          eq(playerEvaluations.peladaId, peladaId),
          isNull(playerEvaluations.matchId),
          eq(playerEvaluations.playerId, playerId),
          eq(playerEvaluations.evaluatorUserId, authUser.id)
        )
      )
      .limit(1);

    let savedRow: typeof playerEvaluations.$inferSelect;
    if (existing.length > 0) {
      const updated = await db
        .update(playerEvaluations)
        .set({
          physical,
          dribbling,
          shooting,
          defense,
          attack,
          passing,
          positioning,
          scoresJson,
          averageScore,
          comment,
        })
        .where(eq(playerEvaluations.id, existing[0].id))
        .returning();
      savedRow = updated[0];
    } else {
      const inserted = await db
        .insert(playerEvaluations)
        .values({
          matchId: null,
          peladaId,
          playerId,
          evaluatorUserId: authUser.id,
          physical,
          dribbling,
          shooting,
          defense,
          attack,
          passing,
          positioning,
          scoresJson,
          averageScore,
          comment,
        })
        .returning();
      savedRow = inserted[0];
    }

    const updatedPlayer = await recalculatePlayerRatings(playerId, {
      groupId: pelada.groupId,
      criteriaOverride: criteriaConfig,
    });
    res.status(201).json({ evaluation: savedRow, player: updatedPlayer });
  } catch (error) {
    console.error('Erro ao salvar avaliação do encontro:', error);
    res.status(500).json({ error: 'Falha ao registrar avaliação do jogador neste encontro.' });
  }
});

// ==========================================
// CONTROLE FINANCEIRO DA PELADA
// ==========================================

const VALID_FINANCE_ENTRY_TYPES = new Set(['cash_box', 'income', 'expense', 'pending_debt']);

function formatMonthYearRef(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (m) return `${m[2]}/${m[1]}`;
  const now = new Date();
  return `${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()}`;
}

async function ensurePeladaCharges(params: {
  groupId: number;
  peladaId?: number | null;
  createMissingForPelada?: boolean;
}) {
  const { groupId, peladaId = null, createMissingForPelada = false } = params;

  const groupRows = await db
    .select()
    .from(peladaGroups)
    .where(eq(peladaGroups.id, groupId))
    .limit(1);
  if (groupRows.length === 0) {
    return { chargesCreated: 0 };
  }
  const group = groupRows[0];

  let targetPelada: typeof peladas.$inferSelect | null = null;
  if (peladaId && Number.isInteger(peladaId)) {
    const pRows = await db
      .select()
      .from(peladas)
      .where(and(eq(peladas.id, peladaId), eq(peladas.groupId, groupId)))
      .limit(1);
    targetPelada = pRows[0] ?? null;
  }

  let chargesCreated = 0;

  if (targetPelada && createMissingForPelada) {
    const attRows = await db
      .select({ playerId: peladaAttendances.playerId })
      .from(peladaAttendances)
      .where(and(eq(peladaAttendances.peladaId, targetPelada.id), eq(peladaAttendances.present, true)));
    const presentPlayerIds = attRows.map((a) => a.playerId);

    if (presentPlayerIds.length > 0) {
      const memberRows = await db
        .select()
        .from(peladaGroupMembers)
        .where(eq(peladaGroupMembers.groupId, groupId));
      const playerRows = await db
        .select()
        .from(players)
        .where(inArray(players.id, presentPlayerIds));
      const existingPayments = await db
        .select()
        .from(peladaParticipantPayments)
        .where(eq(peladaParticipantPayments.groupId, groupId));

      const monthRef = formatMonthYearRef(targetPelada.eventDate);
      const sessionRef = `${targetPelada.title} (${targetPelada.eventDate})`;

      for (const p of playerRows) {
        const mem = memberRows.find(
          (m) => m.playerId === p.id || (p.userId != null && m.userId === p.userId)
        );
        const cat = mem?.playerCategory ?? p.category ?? 'mensalista';
        const isMensalista = cat === 'mensalista';

        if (isMensalista && (group.monthlyFee ?? 0) > 0) {
          const alreadyHasMonthly = existingPayments.some(
            (pay) =>
              pay.playerId === p.id &&
              pay.paymentType === 'mensalidade' &&
              pay.referenceLabel === monthRef
          );
          if (!alreadyHasMonthly) {
            await db.insert(peladaParticipantPayments).values({
              groupId,
              peladaId: targetPelada.id,
              playerId: p.id,
              userId: p.userId ?? mem?.userId ?? null,
              paymentType: 'mensalidade',
              referenceLabel: monthRef,
              amount: group.monthlyFee,
              status: 'pending',
              notes: `Mensalidade referente a ${monthRef}`,
            });
            chargesCreated++;
          }
        } else if ((group.avulsoFee ?? 0) > 0) {
          const alreadyHasDiaria = existingPayments.some(
            (pay) =>
              pay.playerId === p.id &&
              pay.paymentType === 'diaria' &&
              pay.peladaId === targetPelada!.id
          );
          if (!alreadyHasDiaria) {
            await db.insert(peladaParticipantPayments).values({
              groupId,
              peladaId: targetPelada.id,
              playerId: p.id,
              userId: p.userId ?? mem?.userId ?? null,
              paymentType: 'diaria',
              referenceLabel: sessionRef,
              amount: group.avulsoFee,
              status: 'pending',
              notes: `Diária do encontro ${sessionRef}`,
            });
            chargesCreated++;
          }
        }
      }
    }
  }

  return { chargesCreated };
}

apiRouter.get('/groups/:id/finance', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: 'ID da pelada inválido.' });
    }

    const authUser = req.authUser!;
    const allowed =
      (await isUserAdminOfGroup(authUser, groupId)) ||
      (await hasActiveGroupAccess(authUser, groupId));
    if (!allowed) {
      return res.status(403).json({
        error: 'Apenas participantes desta pelada têm acesso ao controle financeiro.',
      });
    }

    const groupRows = await db
      .select()
      .from(peladaGroups)
      .where(eq(peladaGroups.id, groupId))
      .limit(1);
    if (groupRows.length === 0) {
      return res.status(404).json({ error: 'Pelada fixa não encontrada.' });
    }
    const group = groupRows[0];

    const permissions = await getGroupFinancialPermission(authUser, groupId);

    const [entryRows, paymentRows, groupPeladas, groupMemberRows] =
      await Promise.all([
        db
          .select()
          .from(peladaFinanceEntries)
          .where(eq(peladaFinanceEntries.groupId, groupId))
          .orderBy(desc(peladaFinanceEntries.entryDate), desc(peladaFinanceEntries.id)),
        db
          .select()
          .from(peladaParticipantPayments)
          .where(eq(peladaParticipantPayments.groupId, groupId))
          .orderBy(desc(peladaParticipantPayments.createdAt), desc(peladaParticipantPayments.id)),
        db
          .select({
            id: peladas.id,
            title: peladas.title,
            eventDate: peladas.eventDate,
            status: peladas.status,
          })
          .from(peladas)
          .where(eq(peladas.groupId, groupId))
          .orderBy(desc(peladas.eventDate), desc(peladas.id)),
        db
          .select({
            playerId: peladaGroupMembers.playerId,
            playerCategory: peladaGroupMembers.playerCategory,
            playerName: players.name,
            playerNickname: players.nickname,
            playerEmail: players.email,
            userEmail: users.email,
          })
          .from(peladaGroupMembers)
          .leftJoin(players, eq(peladaGroupMembers.playerId, players.id))
          .leftJoin(users, eq(peladaGroupMembers.userId, users.id))
          .where(eq(peladaGroupMembers.groupId, groupId)),
      ]);

    const extraUserIds = Array.from(
      new Set(
        [
          ...entryRows.map((e) => e.createdByUserId),
          ...paymentRows.map((p) => p.confirmedByUserId),
        ].filter((id): id is number => id != null)
      )
    );
    const userRows =
      extraUserIds.length > 0
        ? await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, extraUserIds))
        : [];
    const userNameMap = new Map(userRows.map((u) => [u.id, u.name]));

    const allPayPlayerIds = Array.from(new Set(paymentRows.map((p) => p.playerId)));
    const payPlayers =
      allPayPlayerIds.length > 0
        ? await db.select().from(players).where(inArray(players.id, allPayPlayerIds))
        : [];
    const payPlayerMap = new Map(payPlayers.map((p) => [p.id, p]));
    const peladaTitleMap = new Map(groupPeladas.map((p) => [p.id, p.title]));

    const initialCashBalance = round2(group.initialCashBalance ?? 0);
    let cashBoxContributions = 0;
    let extraIncome = 0;
    let paidExpenses = 0;
    let pendingDebts = 0;

    for (const e of entryRows) {
      if (e.entryType === 'cash_box' && e.status === 'settled') {
        cashBoxContributions += e.amount;
      } else if (e.entryType === 'income' && e.status === 'settled') {
        extraIncome += e.amount;
      } else if (e.entryType === 'expense' && e.status === 'settled') {
        paidExpenses += e.amount;
      } else if (
        e.entryType === 'pending_debt' ||
        (e.entryType === 'expense' && e.status === 'pending')
      ) {
        pendingDebts += e.amount;
      }
    }

    let participantPaymentsReceived = 0;
    let pendingReceivables = 0;
    for (const pay of paymentRows) {
      if (pay.status === 'paid') {
        participantPaymentsReceived += pay.amount;
      } else {
        pendingReceivables += pay.amount;
      }
    }

    const totalRevenue = round2(extraIncome + participantPaymentsReceived);
    const currentCashBalance = round2(
      initialCashBalance + cashBoxContributions + totalRevenue - paidExpenses
    );
    const projectedBalance = round2(currentCashBalance + pendingReceivables - pendingDebts);

    const participantBalanceMap = new Map<
      number,
      {
        playerId: number;
        name: string;
        nickname: string;
        email: string | null;
        category: string;
        totalPaid: number;
        totalPending: number;
        pendingCount: number;
        paidCount: number;
      }
    >();

    for (const gm of groupMemberRows) {
      if (!gm.playerId) continue;
      participantBalanceMap.set(gm.playerId, {
        playerId: gm.playerId,
        name: gm.playerName ?? 'Participante',
        nickname: gm.playerNickname ?? gm.playerName ?? 'Peladeiro',
        email: gm.playerEmail ?? gm.userEmail ?? null,
        category: gm.playerCategory ?? 'mensalista',
        totalPaid: 0,
        totalPending: 0,
        pendingCount: 0,
        paidCount: 0,
      });
    }

    for (const pay of paymentRows) {
      const pInfo = payPlayerMap.get(pay.playerId);
      const cur = participantBalanceMap.get(pay.playerId) ?? {
        playerId: pay.playerId,
        name: pInfo?.name ?? 'Participante',
        nickname: pInfo?.nickname ?? 'Peladeiro',
        email: pInfo?.email ?? null,
        category: pInfo?.category ?? 'mensalista',
        totalPaid: 0,
        totalPending: 0,
        pendingCount: 0,
        paidCount: 0,
      };
      if (pay.status === 'paid') {
        cur.totalPaid = round2(cur.totalPaid + pay.amount);
        cur.paidCount += 1;
      } else {
        cur.totalPending = round2(cur.totalPending + pay.amount);
        cur.pendingCount += 1;
      }
      participantBalanceMap.set(pay.playerId, cur);
    }

    const participants = Array.from(participantBalanceMap.values()).sort(
      (a, b) => b.totalPending - a.totalPending || a.nickname.localeCompare(b.nickname, 'pt-BR')
    );

    const memberCatMap = new Map(
      groupMemberRows
        .filter((m) => m.playerId != null)
        .map((m) => [m.playerId!, m.playerCategory])
    );

    res.json({
      group: {
        id: group.id,
        name: group.name,
        pixKey: group.pixKey ?? null,
        avulsoFee: group.avulsoFee ?? 0,
        monthlyFee: group.monthlyFee ?? 0,
        initialCashBalance,
      },
      permissions,
      summary: {
        initialCashBalance,
        cashBoxContributions: round2(cashBoxContributions),
        extraIncome: round2(extraIncome),
        participantPaymentsReceived: round2(participantPaymentsReceived),
        totalRevenue,
        paidExpenses: round2(paidExpenses),
        pendingDebts: round2(pendingDebts),
        pendingReceivables: round2(pendingReceivables),
        currentCashBalance,
        projectedBalance,
      },
      entries: entryRows.map((e) => ({
        ...e,
        peladaTitle: e.peladaId ? (peladaTitleMap.get(e.peladaId) ?? null) : null,
        createdByName: e.createdByUserId ? (userNameMap.get(e.createdByUserId) ?? null) : null,
      })),
      payments: paymentRows.map((pay) => {
        const pInfo = payPlayerMap.get(pay.playerId);
        return {
          ...pay,
          peladaTitle: pay.peladaId ? (peladaTitleMap.get(pay.peladaId) ?? null) : null,
          playerName: pInfo?.name ?? 'Participante',
          playerNickname: pInfo?.nickname ?? 'Peladeiro',
          playerEmail: pInfo?.email ?? null,
          playerCategory: memberCatMap.get(pay.playerId) ?? pInfo?.category ?? 'mensalista',
          confirmedByName: pay.confirmedByUserId
            ? (userNameMap.get(pay.confirmedByUserId) ?? null)
            : null,
        };
      }),
      peladas: groupPeladas,
      participants,
    });
  } catch (error) {
    console.error('Erro ao carregar controle financeiro da pelada:', error);
    res.status(500).json({ error: 'Falha ao carregar dados financeiros da pelada.' });
  }
});

apiRouter.put('/groups/:id/finance/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({
        error: 'Apenas administradores da pelada podem configurar o PIX e valores financeiros.',
      });
    }

    const existing = await db
      .select()
      .from(peladaGroups)
      .where(eq(peladaGroups.id, groupId))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Pelada fixa não encontrada.' });
    }
    const prev = existing[0];

    const pixKey =
      req.body?.pixKey !== undefined
        ? String(req.body.pixKey ?? '').trim().slice(0, 180) || null
        : prev.pixKey;
    const monthlyFee =
      req.body?.monthlyFee !== undefined
        ? parseNonNegativeFee(req.body.monthlyFee, prev.monthlyFee ?? 0)
        : prev.monthlyFee ?? 0;
    const avulsoFee =
      req.body?.avulsoFee !== undefined
        ? parseNonNegativeFee(req.body.avulsoFee, prev.avulsoFee ?? 0)
        : prev.avulsoFee ?? 0;
    const initialCashBalance =
      req.body?.initialCashBalance !== undefined
        ? (() => {
            const raw =
              typeof req.body.initialCashBalance === 'string'
                ? req.body.initialCashBalance.replace(',', '.').trim()
                : req.body.initialCashBalance;
            const n = Number(raw);
            return Number.isFinite(n) ? Math.max(-1000000, Math.min(1000000, round2(n))) : prev.initialCashBalance ?? 0;
          })()
        : prev.initialCashBalance ?? 0;

    const updated = await db
      .update(peladaGroups)
      .set({ pixKey, monthlyFee, avulsoFee, initialCashBalance })
      .where(eq(peladaGroups.id, groupId))
      .returning();

    res.json({ group: updated[0] });
  } catch (error) {
    console.error('Erro ao salvar configurações financeiras:', error);
    res.status(500).json({ error: 'Falha ao salvar configurações financeiras.' });
  }
});

apiRouter.post('/groups/:id/finance/entries', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({
        error: 'Apenas administradores da pelada podem lançar movimentações no caixa.',
      });
    }

    const entryType = String(req.body?.entryType ?? '');
    if (!VALID_FINANCE_ENTRY_TYPES.has(entryType)) {
      return res.status(400).json({ error: 'Tipo de lançamento financeiro inválido.' });
    }

    const title = String(req.body?.title ?? '').trim().slice(0, 140);
    if (!title) {
      return res.status(400).json({ error: 'Informe o título ou descrição curta do lançamento.' });
    }

    const rawAmount =
      typeof req.body?.amount === 'string' ? req.body.amount.replace(',', '.').trim() : req.body?.amount;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ error: 'Informe um valor válido maior que R$ 0,00.' });
    }

    const peladaId = req.body?.peladaId ? Number(req.body.peladaId) : null;
    if (peladaId) {
      const pCheck = await db
        .select({ id: peladas.id })
        .from(peladas)
        .where(and(eq(peladas.id, peladaId), eq(peladas.groupId, groupId)))
        .limit(1);
      if (pCheck.length === 0) {
        return res.status(400).json({ error: 'Encontro selecionado não pertence a esta pelada.' });
      }
    }

    const description = String(req.body?.description ?? '').trim().slice(0, 1000) || null;
    const attachmentUrl = sanitizeImageUrl(req.body?.attachmentUrl);
    const entryDate =
      typeof req.body?.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.entryDate)
        ? req.body.entryDate
        : new Date().toISOString().slice(0, 10);

    const status =
      entryType === 'pending_debt'
        ? 'pending'
        : req.body?.status === 'pending'
          ? 'pending'
          : 'settled';

    const inserted = await db
      .insert(peladaFinanceEntries)
      .values({
        groupId,
        peladaId: peladaId || null,
        entryType,
        title,
        description,
        amount: round2(amount),
        status,
        attachmentUrl,
        entryDate,
        createdByUserId: req.authUser!.id,
      })
      .returning();

    res.status(201).json({ entry: inserted[0] });
  } catch (error) {
    console.error('Erro ao registrar lançamento financeiro:', error);
    res.status(500).json({ error: 'Falha ao salvar lançamento financeiro.' });
  }
});

apiRouter.patch('/groups/:id/finance/entries/:entryId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(groupId) || !Number.isInteger(entryId)) {
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem editar lançamentos.' });
    }

    const existing = await db
      .select()
      .from(peladaFinanceEntries)
      .where(and(eq(peladaFinanceEntries.id, entryId), eq(peladaFinanceEntries.groupId, groupId)))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Lançamento não encontrado.' });
    }
    const prev = existing[0];

    const nextStatus =
      req.body?.status === 'settled' || req.body?.status === 'pending'
        ? req.body.status
        : prev.status;
    const nextEntryType =
      prev.entryType === 'pending_debt' && nextStatus === 'settled'
        ? 'expense'
        : prev.entryType;
    const nextAttachment =
      req.body?.attachmentUrl !== undefined
        ? sanitizeImageUrl(req.body.attachmentUrl)
        : prev.attachmentUrl;

    const updated = await db
      .update(peladaFinanceEntries)
      .set({
        status: nextStatus,
        entryType: nextEntryType,
        attachmentUrl: nextAttachment,
        description:
          req.body?.description !== undefined
            ? String(req.body.description ?? '').trim().slice(0, 1000) || null
            : prev.description,
      })
      .where(eq(peladaFinanceEntries.id, entryId))
      .returning();

    res.json({ entry: updated[0] });
  } catch (error) {
    console.error('Erro ao atualizar lançamento financeiro:', error);
    res.status(500).json({ error: 'Falha ao atualizar lançamento.' });
  }
});

apiRouter.delete('/groups/:id/finance/entries/:entryId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(groupId) || !Number.isInteger(entryId)) {
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem excluir lançamentos.' });
    }

    await db
      .delete(peladaFinanceEntries)
      .where(and(eq(peladaFinanceEntries.id, entryId), eq(peladaFinanceEntries.groupId, groupId)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover lançamento financeiro:', error);
    res.status(500).json({ error: 'Falha ao remover lançamento.' });
  }
});

apiRouter.post('/groups/:id/finance/payments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const allowed = await isUserAdminOfGroup(req.authUser!, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Apenas administradores da pelada podem gerar cobranças.' });
    }

    const mode = String(req.body?.mode ?? 'single'); // 'single' | 'monthly_all' | 'pelada_present'
    const paymentType = req.body?.paymentType === 'mensalidade' ? 'mensalidade' : 'diaria';
    const peladaId = req.body?.peladaId ? Number(req.body.peladaId) : null;
    const referenceLabel =
      String(req.body?.referenceLabel ?? '').trim().slice(0, 120) ||
      formatMonthYearRef(new Date().toISOString().slice(0, 10));

    const groupRows = await db
      .select()
      .from(peladaGroups)
      .where(eq(peladaGroups.id, groupId))
      .limit(1);
    if (groupRows.length === 0) return res.status(404).json({ error: 'Pelada não encontrada.' });
    const group = groupRows[0];

    const defaultAmount = paymentType === 'mensalidade' ? group.monthlyFee ?? 0 : group.avulsoFee ?? 0;
    const rawAmount =
      req.body?.amount !== undefined && String(req.body.amount).trim() !== ''
        ? Number(String(req.body.amount).replace(',', '.'))
        : defaultAmount;
    if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > 100000) {
      return res.status(400).json({ error: 'Informe um valor válido maior que R$ 0,00.' });
    }
    const amount = round2(rawAmount);

    if (mode === 'pelada_present' && peladaId) {
      const resSync = await ensurePeladaCharges({
        groupId,
        peladaId,
        createMissingForPelada: true,
      });
      return res.status(201).json({ createdCount: resSync.chargesCreated });
    }

    if (mode === 'monthly_all') {
      const members = await db
        .select({
          playerId: peladaGroupMembers.playerId,
          userId: peladaGroupMembers.userId,
          playerCategory: peladaGroupMembers.playerCategory,
        })
        .from(peladaGroupMembers)
        .where(
          and(
            eq(peladaGroupMembers.groupId, groupId),
            eq(peladaGroupMembers.playerCategory, 'mensalista'),
            isNotNull(peladaGroupMembers.playerId)
          )
        );
      const existing = await db
        .select()
        .from(peladaParticipantPayments)
        .where(
          and(
            eq(peladaParticipantPayments.groupId, groupId),
            eq(peladaParticipantPayments.paymentType, 'mensalidade'),
            eq(peladaParticipantPayments.referenceLabel, referenceLabel)
          )
        );
      const existingSet = new Set(existing.map((e) => e.playerId));
      let createdCount = 0;
      for (const m of members) {
        if (!m.playerId || existingSet.has(m.playerId)) continue;
        await db.insert(peladaParticipantPayments).values({
          groupId,
          peladaId: peladaId || null,
          playerId: m.playerId,
          userId: m.userId ?? null,
          paymentType: 'mensalidade',
          referenceLabel,
          amount,
          status: 'pending',
          notes: String(req.body?.notes ?? '').trim().slice(0, 300) || null,
        });
        createdCount++;
      }
      return res.status(201).json({ createdCount });
    }

    const playerId = Number(req.body?.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ error: 'Selecione o participante para lançar a cobrança.' });
    }
    const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (playerRows.length === 0) {
      return res.status(404).json({ error: 'Participante não encontrado.' });
    }

    const markPaid = req.body?.status === 'paid';
    let perm: Awaited<ReturnType<typeof getGroupFinancialPermission>> | null = null;
    if (markPaid) {
      perm = await getGroupFinancialPermission(req.authUser!, groupId);
      if (!perm.canConfirmPayments) {
        return res.status(403).json({
          error:
            'Somente o administrador com função de Presidente e/ou Tesoureiro pode marcar mensalidades e diárias como recebidas.',
        });
      }
    }

    const inserted = await db
      .insert(peladaParticipantPayments)
      .values({
        groupId,
        peladaId: peladaId || null,
        playerId,
        userId: playerRows[0].userId ?? null,
        paymentType,
        referenceLabel,
        amount,
        status: markPaid ? 'paid' : 'pending',
        paidAt: markPaid ? new Date() : null,
        confirmedByUserId: markPaid ? req.authUser!.id : null,
        confirmedByRole: markPaid ? perm?.myAdminTitle ?? null : null,
        notes: String(req.body?.notes ?? '').trim().slice(0, 300) || null,
        attachmentUrl: sanitizeImageUrl(req.body?.attachmentUrl),
      })
      .returning();

    res.status(201).json({ payment: inserted[0], createdCount: 1 });
  } catch (error) {
    console.error('Erro ao lançar cobrança de participante:', error);
    res.status(500).json({ error: 'Falha ao lançar mensalidade ou diária.' });
  }
});

apiRouter.post(
  '/groups/:id/finance/payments/:paymentId/confirm',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const groupId = Number(req.params.id);
      const paymentId = Number(req.params.paymentId);
      if (!Number.isInteger(groupId) || !Number.isInteger(paymentId)) {
        return res.status(400).json({ error: 'Parâmetros inválidos.' });
      }

      const perm = await getGroupFinancialPermission(req.authUser!, groupId);
      if (!perm.canConfirmPayments) {
        return res.status(403).json({
          error:
            'Somente o administrador com função de Presidente e/ou Tesoureiro pode marcar mensalidades e diárias como recebidas.',
        });
      }

      const existing = await db
        .select()
        .from(peladaParticipantPayments)
        .where(
          and(
            eq(peladaParticipantPayments.id, paymentId),
            eq(peladaParticipantPayments.groupId, groupId)
          )
        )
        .limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Cobrança não encontrada.' });
      }

      const nextStatus = req.body?.status === 'pending' ? 'pending' : 'paid';
      const attachmentUrl =
        req.body?.attachmentUrl !== undefined
          ? sanitizeImageUrl(req.body.attachmentUrl)
          : existing[0].attachmentUrl;

      const updated = await db
        .update(peladaParticipantPayments)
        .set({
          status: nextStatus,
          paidAt: nextStatus === 'paid' ? new Date() : null,
          confirmedByUserId: nextStatus === 'paid' ? req.authUser!.id : null,
          confirmedByRole: nextStatus === 'paid' ? perm.myAdminTitle : null,
          attachmentUrl,
          notes:
            req.body?.notes !== undefined
              ? String(req.body.notes ?? '').trim().slice(0, 300) || null
              : existing[0].notes,
        })
        .where(eq(peladaParticipantPayments.id, paymentId))
        .returning();

      res.json({ payment: updated[0] });
    } catch (error) {
      console.error('Erro ao confirmar recebimento:', error);
      res.status(500).json({ error: 'Falha ao confirmar recebimento do pagamento.' });
    }
  }
);

apiRouter.delete(
  '/groups/:id/finance/payments/:paymentId',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const groupId = Number(req.params.id);
      const paymentId = Number(req.params.paymentId);
      if (!Number.isInteger(groupId) || !Number.isInteger(paymentId)) {
        return res.status(400).json({ error: 'Parâmetros inválidos.' });
      }
      const perm = await getGroupFinancialPermission(req.authUser!, groupId);
      if (!perm.canConfirmPayments && !perm.isGroupAdmin) {
        return res.status(403).json({ error: 'Apenas administradores podem excluir cobranças.' });
      }
      await db
        .delete(peladaParticipantPayments)
        .where(
          and(
            eq(peladaParticipantPayments.id, paymentId),
            eq(peladaParticipantPayments.groupId, groupId)
          )
        );
      res.json({ ok: true });
    } catch (error) {
      console.error('Erro ao excluir cobrança:', error);
      res.status(500).json({ error: 'Falha ao excluir cobrança.' });
    }
  }
);



