import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  matchEvents,
  matches,
  peladaAttendances,
  peladaGroupMembers,
  peladaGroups,
  peladaTeams,
  peladas,
  playerEvaluations,
  playerInitialVotes,
  players,
} from '../db/schema.ts';

export interface SevenCriteria {
  physical: number;
  dribbling: number;
  shooting: number;
  defense: number;
  attack: number;
  passing: number;
  positioning: number;
}

export interface GroupCriterion {
  key: string;
  label: string;
  short: string;
  weight: number;
  enabled: boolean;
}

export const BASE_CRITERIA_KEYS = [
  'physical',
  'dribbling',
  'shooting',
  'defense',
  'attack',
  'passing',
  'positioning',
] as const;

export const DEFAULT_GROUP_CRITERIA: GroupCriterion[] = [
  { key: 'physical', label: 'Preparo físico', short: 'Físico', weight: 1, enabled: true },
  { key: 'dribbling', label: 'Drible', short: 'Drible', weight: 1, enabled: true },
  { key: 'shooting', label: 'Chute', short: 'Chute', weight: 1, enabled: true },
  { key: 'defense', label: 'Capacidade de defesa', short: 'Defesa', weight: 1, enabled: true },
  { key: 'attack', label: 'Capacidade de ataque', short: 'Ataque', weight: 1, enabled: true },
  { key: 'passing', label: 'Qualidade do passe', short: 'Passe', weight: 1, enabled: true },
  { key: 'positioning', label: 'Posicionamento', short: 'Posic.', weight: 1, enabled: true },
];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeOverall(c: SevenCriteria): number {
  return round2(
    (c.physical + c.dribbling + c.shooting + c.defense + c.attack + c.passing + c.positioning) / 7
  );
}

export function parseCriteriaConfig(raw: string | null | undefined): GroupCriterion[] {
  if (!raw) return DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c }));
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c }));
    }
    const sanitized: GroupCriterion[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const key = String(item.key ?? '').trim().slice(0, 48);
      const label = String(item.label ?? '').trim().slice(0, 60);
      const short = String(item.short ?? label.slice(0, 10)).trim().slice(0, 16);
      if (!key || !label || seen.has(key)) continue;
      seen.add(key);
      const weightNum = Number(item.weight);
      const weight = Number.isFinite(weightNum)
        ? Math.max(0.5, Math.min(5, Math.round(weightNum * 2) / 2))
        : 1;
      sanitized.push({
        key,
        label,
        short: short || label.slice(0, 10),
        weight,
        enabled: item.enabled !== false,
      });
    }
    if (sanitized.length === 0 || !sanitized.some((c) => c.enabled)) {
      return DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c }));
    }
    return sanitized;
  } catch {
    return DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c }));
  }
}

export function parseScoresJson(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n)) {
        out[k] = Math.max(1, Math.min(10, round2(n)));
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function getPlayerScoresMap(
  player: typeof players.$inferSelect,
  kind: 'init' | 'cur'
): Record<string, number> {
  const base: Record<string, number> =
    kind === 'init'
      ? {
          physical: player.initPhysical,
          dribbling: player.initDribbling,
          shooting: player.initShooting,
          defense: player.initDefense,
          attack: player.initAttack,
          passing: player.initPassing,
          positioning: player.initPositioning,
        }
      : {
          physical: player.curPhysical,
          dribbling: player.curDribbling,
          shooting: player.curShooting,
          defense: player.curDefense,
          attack: player.curAttack,
          passing: player.curPassing,
          positioning: player.curPositioning,
        };
  const extra = parseScoresJson(kind === 'init' ? player.initScoresJson : player.curScoresJson);
  return { ...base, ...extra };
}

export function computeWeightedOverall(
  scores: Record<string, number>,
  criteria: GroupCriterion[]
): number {
  const active = criteria.filter((c) => c.enabled && c.weight > 0);
  const list = active.length > 0 ? active : DEFAULT_GROUP_CRITERIA;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const c of list) {
    const val = typeof scores[c.key] === 'number' && Number.isFinite(scores[c.key]) ? scores[c.key] : 7;
    weightedSum += val * c.weight;
    totalWeight += c.weight;
  }
  if (totalWeight <= 0) return 7;
  return round2(weightedSum / totalWeight);
}

export async function getGroupCriteriaConfig(groupId: number | null | undefined): Promise<GroupCriterion[]> {
  if (!groupId || !Number.isInteger(groupId)) {
    return DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c }));
  }
  const rows = await db
    .select({ criteriaConfig: peladaGroups.criteriaConfig })
    .from(peladaGroups)
    .where(eq(peladaGroups.id, groupId))
    .limit(1);
  if (rows.length === 0) return DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c }));
  return parseCriteriaConfig(rows[0].criteriaConfig);
}

export async function resolvePlayerCriteriaConfig(
  player: typeof players.$inferSelect,
  preferredGroupId?: number | null
): Promise<GroupCriterion[]> {
  const gid = preferredGroupId ?? player.exclusiveGroupId;
  if (gid) return getGroupCriteriaConfig(gid);
  const memRows = await db
    .select({ groupId: peladaGroupMembers.groupId })
    .from(peladaGroupMembers)
    .where(eq(peladaGroupMembers.playerId, player.id))
    .limit(1);
  if (memRows.length > 0) {
    return getGroupCriteriaConfig(memRows[0].groupId);
  }
  return DEFAULT_GROUP_CRITERIA.map((c) => ({ ...c }));
}

export async function recalculatePlayerRatings(
  playerId: number,
  options?: { groupId?: number | null; criteriaOverride?: GroupCriterion[] }
) {
  try {
    const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (playerRows.length === 0) return null;
    const player = playerRows[0];

    const criteriaConfig =
      options?.criteriaOverride ?? (await resolvePlayerCriteriaConfig(player, options?.groupId));

    // 1. Check initial admin votes
    const initVotes = await db
      .select()
      .from(playerInitialVotes)
      .where(eq(playerInitialVotes.playerId, playerId));

    let initScores = getPlayerScoresMap(player, 'init');
    let initVotesCount = player.initVotesCount;

    if (initVotes.length > 0) {
      initVotesCount = initVotes.length;
      const allKeys = new Set<string>([
        ...BASE_CRITERIA_KEYS,
        ...criteriaConfig.map((c) => c.key),
      ]);
      const voteMaps = initVotes.map((v) => parseScoresJson(v.scoresJson));
      for (const vm of voteMaps) {
        for (const k of Object.keys(vm)) allKeys.add(k);
      }
      const nextInitScores: Record<string, number> = {};
      for (const key of allKeys) {
        const vals = voteMaps
          .map((vm) => vm[key])
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        if (vals.length > 0) {
          nextInitScores[key] = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
        } else {
          nextInitScores[key] = initScores[key] ?? 7;
        }
      }
      initScores = nextInitScores;
    }

    const initPhysical = initScores.physical ?? player.initPhysical;
    const initDribbling = initScores.dribbling ?? player.initDribbling;
    const initShooting = initScores.shooting ?? player.initShooting;
    const initDefense = initScores.defense ?? player.initDefense;
    const initAttack = initScores.attack ?? player.initAttack;
    const initPassing = initScores.passing ?? player.initPassing;
    const initPositioning = initScores.positioning ?? player.initPositioning;
    const initOverall = computeWeightedOverall(initScores, criteriaConfig);
    const initScoresJson = JSON.stringify(initScores);

    // 2. Check post-match player evaluations (last 10 matches)
    const evalRows = await db
      .select({
        evalId: playerEvaluations.id,
        matchId: playerEvaluations.matchId,
        physical: playerEvaluations.physical,
        dribbling: playerEvaluations.dribbling,
        shooting: playerEvaluations.shooting,
        defense: playerEvaluations.defense,
        attack: playerEvaluations.attack,
        passing: playerEvaluations.passing,
        positioning: playerEvaluations.positioning,
        scoresJson: playerEvaluations.scoresJson,
        eventDate: peladas.eventDate,
        matchNumber: matches.matchNumber,
      })
      .from(playerEvaluations)
      .innerJoin(matches, eq(playerEvaluations.matchId, matches.id))
      .innerJoin(peladas, eq(matches.peladaId, peladas.id))
      .where(eq(playerEvaluations.playerId, playerId))
      .orderBy(desc(peladas.eventDate), desc(matches.matchNumber), desc(matches.id));

    if (evalRows.length === 0) {
      const updated = await db
        .update(players)
        .set({
          initPhysical,
          initDribbling,
          initShooting,
          initDefense,
          initAttack,
          initPassing,
          initPositioning,
          initOverall,
          initScoresJson,
          initVotesCount,
          curPhysical: initPhysical,
          curDribbling: initDribbling,
          curShooting: initShooting,
          curDefense: initDefense,
          curAttack: initAttack,
          curPassing: initPassing,
          curPositioning: initPositioning,
          curOverall: initOverall,
          curScoresJson: initScoresJson,
        })
        .where(eq(players.id, playerId))
        .returning();
      return updated[0];
    }

    const groupedByMatch = new Map<
      number,
      Array<Record<string, number>>
    >();

    for (const row of evalRows) {
      let bucket = groupedByMatch.get(row.matchId);
      if (!bucket) {
        if (groupedByMatch.size >= 10) continue;
        bucket = [];
        groupedByMatch.set(row.matchId, bucket);
      }
      const rowScores: Record<string, number> = {
        physical: row.physical,
        dribbling: row.dribbling,
        shooting: row.shooting,
        defense: row.defense,
        attack: row.attack,
        passing: row.passing,
        positioning: row.positioning,
        ...parseScoresJson(row.scoresJson),
      };
      bucket.push(rowScores);
    }

    const allEvalKeys = new Set<string>([
      ...BASE_CRITERIA_KEYS,
      ...criteriaConfig.map((c) => c.key),
    ]);
    for (const bucket of groupedByMatch.values()) {
      for (const m of bucket) {
        for (const k of Object.keys(m)) allEvalKeys.add(k);
      }
    }

    const matchAverages: Array<Record<string, number>> = [];
    for (const bucket of groupedByMatch.values()) {
      const mAvg: Record<string, number> = {};
      for (const key of allEvalKeys) {
        const vals = bucket
          .map((item) => item[key])
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        if (vals.length > 0) {
          mAvg[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
      }
      matchAverages.push(mAvg);
    }

    const curScores: Record<string, number> = {};
    for (const key of allEvalKeys) {
      const vals = matchAverages
        .map((m) => m[key])
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      if (vals.length > 0) {
        curScores[key] = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
      } else {
        curScores[key] = initScores[key] ?? 7;
      }
    }

    const curPhysical = curScores.physical ?? initPhysical;
    const curDribbling = curScores.dribbling ?? initDribbling;
    const curShooting = curScores.shooting ?? initShooting;
    const curDefense = curScores.defense ?? initDefense;
    const curAttack = curScores.attack ?? initAttack;
    const curPassing = curScores.passing ?? initPassing;
    const curPositioning = curScores.positioning ?? initPositioning;
    const curOverall = computeWeightedOverall(curScores, criteriaConfig);

    const updated = await db
      .update(players)
      .set({
        initPhysical,
        initDribbling,
        initShooting,
        initDefense,
        initAttack,
        initPassing,
        initPositioning,
        initOverall,
        initScoresJson,
        initVotesCount,
        curPhysical,
        curDribbling,
        curShooting,
        curDefense,
        curAttack,
        curPassing,
        curPositioning,
        curOverall,
        curScoresJson: JSON.stringify(curScores),
      })
      .where(eq(players.id, playerId))
      .returning();

    return updated[0];
  } catch (error) {
    console.error('Erro ao recalcular nota do jogador:', error);
    throw new Error('Não foi possível recalcular as notas do jogador.', { cause: error });
  }
}

export async function getPlayerHistoryAndEvolution(playerId: number, groupId?: number | null) {
  try {
    const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (playerRows.length === 0) return null;
    const player = playerRows[0];
    const criteriaConfig = await resolvePlayerCriteriaConfig(player, groupId);
    const initScores = getPlayerScoresMap(player, 'init');
    const curScores = getPlayerScoresMap(player, 'cur');

    const attendances = await db
      .select({
        peladaId: peladaAttendances.peladaId,
        teamId: peladaAttendances.teamId,
        present: peladaAttendances.present,
        peladaTitle: peladas.title,
        eventDate: peladas.eventDate,
        location: peladas.location,
      })
      .from(peladaAttendances)
      .innerJoin(peladas, eq(peladaAttendances.peladaId, peladas.id))
      .where(eq(peladaAttendances.playerId, playerId));

    const presentPeladaIds = attendances.filter((a) => a.present && a.teamId).map((a) => a.peladaId);
    const teamMap = new Map<number, number>();
    const peladaMetaMap = new Map<number, { title: string; eventDate: string; location: string }>();
    for (const a of attendances) {
      if (a.present && a.teamId) {
        teamMap.set(a.peladaId, a.teamId);
        peladaMetaMap.set(a.peladaId, {
          title: a.peladaTitle,
          eventDate: a.eventDate,
          location: a.location,
        });
      }
    }

    const matchList =
      presentPeladaIds.length > 0
        ? await db
            .select()
            .from(matches)
            .where(inArray(matches.peladaId, presentPeladaIds))
            .orderBy(matches.id)
        : [];

    const playerMatches = matchList.filter((m) => {
      const tId = teamMap.get(m.peladaId);
      return tId === m.teamAId || tId === m.teamBId;
    });

    const teamIdsSet = new Set<number>();
    for (const m of playerMatches) {
      teamIdsSet.add(m.teamAId);
      teamIdsSet.add(m.teamBId);
    }
    const allTeams =
      teamIdsSet.size > 0
        ? await db.select().from(peladaTeams).where(inArray(peladaTeams.id, Array.from(teamIdsSet)))
        : [];
    const teamNameMap = new Map<number, { name: string; colorHex: string }>();
    for (const t of allTeams) {
      teamNameMap.set(t.id, { name: t.name, colorHex: t.colorHex });
    }

    const events = await db.select().from(matchEvents);
    const evals = await db
      .select()
      .from(playerEvaluations)
      .where(eq(playerEvaluations.playerId, playerId));

    const evalsByMatch = new Map<number, typeof evals>();
    for (const ev of evals) {
      const arr = evalsByMatch.get(ev.matchId) ?? [];
      arr.push(ev);
      evalsByMatch.set(ev.matchId, arr);
    }

    const historyItems = playerMatches
      .map((m) => {
        const myTeamId = teamMap.get(m.peladaId)!;
        const isTeamA = myTeamId === m.teamAId;
        const myScore = isTeamA ? m.scoreA : m.scoreB;
        const oppScore = isTeamA ? m.scoreB : m.scoreA;
        const oppTeamId = isTeamA ? m.teamBId : m.teamAId;
        let result: 'V' | 'E' | 'D' | 'Em andamento' = 'Em andamento';
        if (m.status === 'finished') {
          result = myScore > oppScore ? 'V' : myScore < oppScore ? 'D' : 'E';
        }

        const goals = events.filter(
          (e) => e.matchId === m.id && e.eventType === 'goal' && e.playerId === playerId
        ).length;
        const assists = events.filter(
          (e) => e.matchId === m.id && e.eventType === 'goal' && e.assistPlayerId === playerId
        ).length;
        const defenses = events.filter(
          (e) => e.matchId === m.id && e.eventType === 'defense' && e.playerId === playerId
        ).length;

        const mEvals = evalsByMatch.get(m.id) ?? [];
        let avgScores: Record<string, number> | null = null;
        if (mEvals.length > 0) {
          avgScores = {};
          const keys = new Set<string>([
            ...BASE_CRITERIA_KEYS,
            ...criteriaConfig.map((c) => c.key),
          ]);
          const maps: Array<Record<string, number>> = mEvals.map((x) => ({
            physical: x.physical,
            dribbling: x.dribbling,
            shooting: x.shooting,
            defense: x.defense,
            attack: x.attack,
            passing: x.passing,
            positioning: x.positioning,
            ...parseScoresJson(x.scoresJson),
          }));
          for (const k of keys) {
            const vals = maps
              .map((mp) => mp[k])
              .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
            if (vals.length > 0) {
              avgScores[k] = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
            }
          }
        }
        const avgCriteria: SevenCriteria | null = avgScores
          ? {
              physical: avgScores.physical ?? 7,
              dribbling: avgScores.dribbling ?? 7,
              shooting: avgScores.shooting ?? 7,
              defense: avgScores.defense ?? 7,
              attack: avgScores.attack ?? 7,
              passing: avgScores.passing ?? 7,
              positioning: avgScores.positioning ?? 7,
            }
          : null;
        const matchRating = avgScores ? computeWeightedOverall(avgScores, criteriaConfig) : null;
        const meta = peladaMetaMap.get(m.peladaId);

        return {
          matchId: m.id,
          peladaId: m.peladaId,
          peladaTitle: meta?.title ?? 'Pelada',
          eventDate: meta?.eventDate ?? '',
          matchNumber: m.matchNumber,
          myTeamName: teamNameMap.get(myTeamId)?.name ?? 'Time',
          myTeamColor: teamNameMap.get(myTeamId)?.colorHex ?? '#059669',
          opponentTeamName: teamNameMap.get(oppTeamId)?.name ?? 'Adversário',
          myScore,
          oppScore,
          result,
          status: m.status,
          goals,
          assists,
          defenses,
          evaluationsCount: mEvals.length,
          matchRating,
          criteria: avgCriteria,
        };
      })
      .sort((a, b) => {
        if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
        return a.matchId - b.matchId;
      });

    const initOverallContextual = computeWeightedOverall(initScores, criteriaConfig);
    const curOverallContextual =
      historyItems.some((h) => h.matchRating !== null)
        ? computeWeightedOverall(curScores, criteriaConfig)
        : initOverallContextual;

    const evaluatedPoints = historyItems.filter((h) => h.matchRating !== null);
    const evolutionSeries: Array<{
      label: string;
      date: string;
      matchRating: number;
      rolling10Rating: number;
      goals: number;
      assists: number;
      criteria: SevenCriteria;
    }> = [
      {
        label: 'Inicial',
        date: player.createdAt.toISOString().slice(0, 10),
        matchRating: initOverallContextual,
        rolling10Rating: initOverallContextual,
        goals: 0,
        assists: 0,
        criteria: {
          physical: player.initPhysical,
          dribbling: player.initDribbling,
          shooting: player.initShooting,
          defense: player.initDefense,
          attack: player.initAttack,
          passing: player.initPassing,
          positioning: player.initPositioning,
        },
      },
    ];

    evaluatedPoints.forEach((pt, idx) => {
      const windowSlice = evaluatedPoints.slice(Math.max(0, idx - 9), idx + 1);
      const rolling = round2(
        windowSlice.reduce((s, item) => s + (item.matchRating ?? 0), 0) / windowSlice.length
      );
      evolutionSeries.push({
        label: `J${idx + 1} (${pt.eventDate.slice(5)})`,
        date: pt.eventDate,
        matchRating: pt.matchRating!,
        rolling10Rating: rolling,
        goals: pt.goals,
        assists: pt.assists,
        criteria: pt.criteria!,
      });
    });

    const summary = {
      peladasAttended: presentPeladaIds.length,
      matchesPlayed: historyItems.filter((h) => h.status === 'finished').length,
      wins: historyItems.filter((h) => h.result === 'V').length,
      draws: historyItems.filter((h) => h.result === 'E').length,
      losses: historyItems.filter((h) => h.result === 'D').length,
      goals: historyItems.reduce((s, h) => s + h.goals, 0),
      assists: historyItems.reduce((s, h) => s + h.assists, 0),
      defenses: historyItems.reduce((s, h) => s + h.defenses, 0),
      evaluatedMatchesCount: evaluatedPoints.length,
    };

    return {
      player: {
        ...player,
        initOverall: initOverallContextual,
        curOverall: curOverallContextual,
        initScores,
        curScores,
      },
      criteriaConfig,
      summary,
      evolutionSeries,
      history: historyItems.slice().reverse(),
    };
  } catch (error) {
    console.error('Erro ao buscar histórico do jogador:', error);
    throw new Error('Falha ao carregar histórico de evolução do jogador.', { cause: error });
  }
}
