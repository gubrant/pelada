import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  matchEvents,
  matches,
  peladaAttendances,
  peladaTeams,
  peladas,
  players,
  seasons,
} from '../db/schema.ts';
import { round2 } from './ratings.ts';

export async function recalculatePeladaTeamStandings(peladaId: number) {
  try {
    const teams = await db.select().from(peladaTeams).where(eq(peladaTeams.peladaId, peladaId));
    const finishedMatches = await db
      .select()
      .from(matches)
      .where(eq(matches.peladaId, peladaId));

    const statsMap = new Map<
      number,
      { wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number }
    >();
    for (const t of teams) {
      statsMap.set(t.id, { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
    }

    for (const m of finishedMatches) {
      if (m.status !== 'finished') continue;
      const a = statsMap.get(m.teamAId);
      const b = statsMap.get(m.teamBId);
      if (!a || !b) continue;

      a.goalsFor += m.scoreA;
      a.goalsAgainst += m.scoreB;
      b.goalsFor += m.scoreB;
      b.goalsAgainst += m.scoreA;

      if (m.scoreA > m.scoreB) {
        a.wins += 1;
        b.losses += 1;
      } else if (m.scoreB > m.scoreA) {
        b.wins += 1;
        a.losses += 1;
      } else {
        a.draws += 1;
        b.draws += 1;
      }
    }

    for (const [teamId, st] of statsMap.entries()) {
      await db
        .update(peladaTeams)
        .set({
          wins: st.wins,
          draws: st.draws,
          losses: st.losses,
          goalsFor: st.goalsFor,
          goalsAgainst: st.goalsAgainst,
        })
        .where(eq(peladaTeams.id, teamId));
    }

    return await db.select().from(peladaTeams).where(eq(peladaTeams.peladaId, peladaId));
  } catch (error) {
    console.error('Erro ao recalcular classificação dos times:', error);
    throw new Error('Falha ao atualizar placar de vitórias dos times.', { cause: error });
  }
}

export interface PlayerSeasonStat {
  playerId: number;
  name: string;
  nickname: string;
  position: string;
  photoUrl: string | null;
  curOverall: number;
  curDefense: number;
  curAttack: number;
  peladasCount: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  goals: number;
  assists: number;
  goalContributions: number;
  defensiveActions: number;
  goalsConceded: number;
  goalsConcededAvg: number;
  defenderScore: number;
  mvpScore: number;
}

export async function computeStatsForPeladaIds(peladaIds: number[]) {
  const allPlayers = await db.select().from(players);

  if (peladaIds.length === 0) {
    return {
      totals: {
        peladasCount: 0,
        matchesCount: 0,
        goalsCount: 0,
        assistsCount: 0,
        defensesCount: 0,
      },
      playersStats: [] as PlayerSeasonStat[],
      attendanceRanking: [] as PlayerSeasonStat[],
      topScorers: [] as PlayerSeasonStat[],
      topAssists: [] as PlayerSeasonStat[],
      bestDefenders: [] as PlayerSeasonStat[],
      bestGoalkeepers: [] as PlayerSeasonStat[],
      mvpRanking: [] as PlayerSeasonStat[],
    };
  }

  const attendances = await db
    .select()
    .from(peladaAttendances)
    .where(inArray(peladaAttendances.peladaId, peladaIds));

  const matchList = await db
    .select()
    .from(matches)
    .where(inArray(matches.peladaId, peladaIds));

  const events = await db
    .select()
    .from(matchEvents)
    .where(inArray(matchEvents.peladaId, peladaIds));

  const playerMap = new Map<number, typeof allPlayers[number]>();
  for (const p of allPlayers) {
    playerMap.set(p.id, p);
  }

  const statAccumulator = new Map<number, PlayerSeasonStat>();
  const ensureStat = (pId: number) => {
    const existing = statAccumulator.get(pId);
    if (existing) return existing;
    const p = playerMap.get(pId);
    if (!p) return null;
    const row: PlayerSeasonStat = {
      playerId: p.id,
      name: p.name,
      nickname: p.nickname,
      position: p.position,
      photoUrl: p.photoUrl,
      curOverall: round2(p.curOverall),
      curDefense: round2(p.curDefense),
      curAttack: round2(p.curAttack),
      peladasCount: 0,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: 0,
      goals: 0,
      assists: 0,
      goalContributions: 0,
      defensiveActions: 0,
      goalsConceded: 0,
      goalsConcededAvg: 0,
      defenderScore: 0,
      mvpScore: 0,
    };
    statAccumulator.set(pId, row);
    return row;
  };

  // Pelada attendance & team map
  const peladaTeamByPlayer = new Map<string, number>();
  for (const att of attendances) {
    if (!att.present) continue;
    const st = ensureStat(att.playerId);
    if (!st) continue;
    st.peladasCount += 1;
    if (att.teamId) {
      peladaTeamByPlayer.set(`${att.peladaId}:${att.playerId}`, att.teamId);
    }
  }

  const finishedMatches = matchList.filter((m) => m.status === 'finished');
  for (const m of finishedMatches) {
    for (const att of attendances) {
      if (!att.present || att.peladaId !== m.peladaId || !att.teamId) continue;
      if (att.teamId !== m.teamAId && att.teamId !== m.teamBId) continue;
      const st = ensureStat(att.playerId);
      if (!st) continue;

      st.matchesPlayed += 1;
      const isA = att.teamId === m.teamAId;
      const myScore = isA ? m.scoreA : m.scoreB;
      const oppScore = isA ? m.scoreB : m.scoreA;
      st.goalsConceded += oppScore;

      if (myScore > oppScore) st.wins += 1;
      else if (myScore < oppScore) st.losses += 1;
      else st.draws += 1;
    }
  }

  let goalsCount = 0;
  let assistsCount = 0;
  let defensesCount = 0;

  for (const ev of events) {
    if (ev.eventType === 'goal') {
      goalsCount += 1;
      const scorer = ensureStat(ev.playerId);
      if (scorer) scorer.goals += 1;
      if (ev.assistPlayerId) {
        assistsCount += 1;
        const assister = ensureStat(ev.assistPlayerId);
        if (assister) assister.assists += 1;
      }
    } else if (ev.eventType === 'defense') {
      defensesCount += 1;
      const defender = ensureStat(ev.playerId);
      if (defender) defender.defensiveActions += 1;
    } else if (ev.eventType === 'own_goal') {
      goalsCount += 1;
    }
  }

  const playersStats = Array.from(statAccumulator.values()).map((st) => {
    st.goalContributions = st.goals + st.assists;
    st.winRate = st.matchesPlayed > 0 ? round2((st.wins / st.matchesPlayed) * 100) : 0;
    st.goalsConcededAvg =
      st.matchesPlayed > 0 ? round2(st.goalsConceded / st.matchesPlayed) : 0;

    // Composite score for Melhor Defensor:
    // rewards high defense rating, defensive highlights, team win rate, and fewer goals conceded per match
    const concededPenalty = st.matchesPlayed > 0 ? Math.min(4, st.goalsConcededAvg * 0.65) : 2;
    st.defenderScore = round2(
      st.curDefense * 1.4 +
        st.defensiveActions * 1.15 +
        (st.winRate / 100) * 3 -
        concededPenalty
    );

    // Composite MVP index: rating + G/A + wins + attendance
    st.mvpScore = round2(
      st.curOverall * 2.0 +
        st.goals * 1.2 +
        st.assists * 1.0 +
        st.defensiveActions * 0.5 +
        st.wins * 0.8 +
        st.peladasCount * 0.4
    );
    return st;
  });

  const active = playersStats.filter((p) => p.peladasCount > 0 || p.goals > 0 || p.assists > 0);

  return {
    totals: {
      peladasCount: peladaIds.length,
      matchesCount: finishedMatches.length,
      goalsCount,
      assistsCount,
      defensesCount,
    },
    playersStats: active.slice().sort((a, b) => b.mvpScore - a.mvpScore),
    attendanceRanking: active
      .slice()
      .sort((a, b) => b.peladasCount - a.peladasCount || b.matchesPlayed - a.matchesPlayed),
    topScorers: active
      .slice()
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.curOverall - a.curOverall),
    topAssists: active
      .slice()
      .sort((a, b) => b.assists - a.assists || b.goals - a.goals || b.curOverall - a.curOverall),
    bestDefenders: active
      .filter((p) => p.position !== 'Goleiro')
      .slice()
      .sort((a, b) => b.defenderScore - a.defenderScore || b.curDefense - a.curDefense),
    bestGoalkeepers: active
      .filter((p) => p.position === 'Goleiro')
      .slice()
      .sort(
        (a, b) =>
          a.goalsConcededAvg - b.goalsConcededAvg ||
          b.defensiveActions - a.defensiveActions ||
          b.curDefense - a.curDefense
      ),
    mvpRanking: active.slice().sort((a, b) => b.mvpScore - a.mvpScore),
  };
}

export async function computeSeasonStats(seasonId: number) {
  try {
    const seasonRows = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
    if (seasonRows.length === 0) return null;
    const season = seasonRows[0];

    const seasonPeladas = await db
      .select()
      .from(peladas)
      .where(eq(peladas.seasonId, seasonId));
    const peladaIds = seasonPeladas.map((p) => p.id);
    const stats = await computeStatsForPeladaIds(peladaIds);

    return {
      season,
      ...stats,
    };
  } catch (error) {
    console.error('Erro ao calcular estatísticas da temporada:', error);
    throw new Error('Não foi possível calcular estatísticas da temporada.', { cause: error });
  }
}

export async function computePeladaStats(peladaId: number) {
  try {
    const peladaRows = await db.select().from(peladas).where(eq(peladas.id, peladaId)).limit(1);
    if (peladaRows.length === 0) return null;
    const pelada = peladaRows[0];
    const teams = await recalculatePeladaTeamStandings(peladaId);
    const stats = await computeStatsForPeladaIds([peladaId]);

    const sortedTeams = teams.slice().sort((a, b) => {
      const ptsA = a.wins * 3 + a.draws;
      const ptsB = b.wins * 3 + b.draws;
      if (ptsB !== ptsA) return ptsB - ptsA;
      const gdA = a.goalsFor - a.goalsAgainst;
      const gdB = b.goalsFor - b.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      return b.goalsFor - a.goalsFor;
    });

    return {
      pelada,
      teamStandings: sortedTeams,
      ...stats,
    };
  } catch (error) {
    console.error('Erro ao calcular estatísticas da pelada:', error);
    throw new Error('Não foi possível calcular estatísticas da pelada.', { cause: error });
  }
}
