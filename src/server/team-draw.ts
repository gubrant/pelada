import {
  SKILL_CRITERIA,
  type DrawnTeam,
  type DrawnTeamPlayer,
  type MemberCategory,
  type PlayerPosition,
  type SkillCriterionKey,
  type SkillScores,
} from '../types/pelada.ts';

export interface DrawCandidate {
  userId: number;
  membershipId: number;
  name: string;
  nickname: string | null;
  position: PlayerPosition;
  category: MemberCategory;
  overall: number;
  scores: SkillScores;
}

const TEAM_PALETTE = [
  { name: 'Time Verde', colorHex: '#059669' },
  { name: 'Time Azul', colorHex: '#2563EB' },
  { name: 'Time Âmbar', colorHex: '#D97706' },
  { name: 'Time Carmim', colorHex: '#DC2626' },
  { name: 'Time Ardósia', colorHex: '#334155' },
  { name: 'Time Violeta', colorHex: '#7C3AED' },
];

export function computeOverall(scores: SkillScores): number {
  const sum =
    scores.dribbling +
    scores.physical +
    scores.passing +
    scores.attack +
    scores.defense +
    scores.shooting;
  return Math.round((sum / 6) * 10) / 10;
}

function emptyScores(): SkillScores {
  return {
    dribbling: 0,
    physical: 0,
    passing: 0,
    attack: 0,
    defense: 0,
    shooting: 0,
  };
}

function computeTeamAverages(players: DrawCandidate[]): {
  avgOverall: number;
  avgScores: SkillScores;
} {
  if (players.length === 0) {
    return { avgOverall: 0, avgScores: emptyScores() };
  }
  const totals = emptyScores();
  let overallSum = 0;
  for (const p of players) {
    overallSum += p.overall;
    for (const c of SKILL_CRITERIA) {
      totals[c.key] += p.scores[c.key];
    }
  }
  const n = players.length;
  const avgScores: SkillScores = {
    dribbling: Math.round((totals.dribbling / n) * 10) / 10,
    physical: Math.round((totals.physical / n) * 10) / 10,
    passing: Math.round((totals.passing / n) * 10) / 10,
    attack: Math.round((totals.attack / n) * 10) / 10,
    defense: Math.round((totals.defense / n) * 10) / 10,
    shooting: Math.round((totals.shooting / n) * 10) / 10,
  };
  return {
    avgOverall: Math.round((overallSum / n) * 10) / 10,
    avgScores,
  };
}

function balanceCost(buckets: DrawCandidate[][]): number {
  const activeBuckets = buckets.filter((b) => b.length > 0);
  if (activeBuckets.length <= 1) return 0;

  const stats = activeBuckets.map((b) => {
    const n = b.length;
    const sumOverall = b.reduce((acc, p) => acc + p.overall, 0);
    const sums: Record<SkillCriterionKey, number> = {
      dribbling: 0,
      physical: 0,
      passing: 0,
      attack: 0,
      defense: 0,
      shooting: 0,
    };
    for (const p of b) {
      for (const c of SKILL_CRITERIA) {
        sums[c.key] += p.scores[c.key];
      }
    }
    return {
      avgOverall: sumOverall / n,
      avgCriteria: {
        dribbling: sums.dribbling / n,
        physical: sums.physical / n,
        passing: sums.passing / n,
        attack: sums.attack / n,
        defense: sums.defense / n,
        shooting: sums.shooting / n,
      },
    };
  });

  const meanOverall = stats.reduce((s, t) => s + t.avgOverall, 0) / stats.length;
  const overallVar =
    stats.reduce((s, t) => s + Math.pow(t.avgOverall - meanOverall, 2), 0) / stats.length;

  let criteriaVarSum = 0;
  for (const c of SKILL_CRITERIA) {
    const meanC = stats.reduce((s, t) => s + t.avgCriteria[c.key], 0) / stats.length;
    const varC =
      stats.reduce((s, t) => s + Math.pow(t.avgCriteria[c.key] - meanC, 2), 0) / stats.length;
    criteriaVarSum += varC;
  }

  return overallVar * 2.5 + criteriaVarSum;
}

export function drawBalancedTeams(
  candidates: DrawCandidate[],
  teamsCount: number
): DrawnTeam[] {
  const safeTeamsCount = Math.max(2, Math.min(teamsCount, candidates.length || 2));
  const buckets: DrawCandidate[][] = Array.from({ length: safeTeamsCount }, () => []);

  // Separa goleiros para distribuir no máximo um por time inicialmente
  const goalkeepers = candidates
    .filter((p) => p.position === 'Goleiro')
    .sort((a, b) => b.overall - a.overall + (Math.random() - 0.5) * 0.25);
  const outfield = candidates
    .filter((p) => p.position !== 'Goleiro')
    .sort((a, b) => b.overall - a.overall + (Math.random() - 0.5) * 0.35);

  goalkeepers.forEach((gk, idx) => {
    buckets[idx % safeTeamsCount].push(gk);
  });

  // Snake draft inicial para preencher respeitando equilíbrio numérico
  let forward = true;
  let cursor = 0;
  for (const player of outfield) {
    // Escolhe o time com menos jogadores dentro da sequência snake
    const minLen = Math.min(...buckets.map((b) => b.length));
    let targetIdx = cursor;
    if (buckets[targetIdx].length > minLen) {
      targetIdx = buckets.findIndex((b) => b.length === minLen);
    }
    buckets[targetIdx].push(player);

    if (forward) {
      if (cursor === safeTeamsCount - 1) forward = false;
      else cursor += 1;
    } else {
      if (cursor === 0) forward = true;
      else cursor -= 1;
    }
  }

  // Otimização local por trocas 2-opt entre jogadores de linha para equilibrar os 6 critérios
  let currentCost = balanceCost(buckets);
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 120) {
    improved = false;
    iterations += 1;
    for (let i = 0; i < safeTeamsCount; i += 1) {
      for (let j = i + 1; j < safeTeamsCount; j += 1) {
        for (let pi = 0; pi < buckets[i].length; pi += 1) {
          for (let pj = 0; pj < buckets[j].length; pj += 1) {
            const pA = buckets[i][pi];
            const pB = buckets[j][pj];
            // Não troca goleiro com jogador de linha
            if ((pA.position === 'Goleiro') !== (pB.position === 'Goleiro')) {
              continue;
            }
            buckets[i][pi] = pB;
            buckets[j][pj] = pA;
            const nextCost = balanceCost(buckets);
            if (nextCost + 1e-6 < currentCost) {
              currentCost = nextCost;
              improved = true;
            } else {
              buckets[i][pi] = pA;
              buckets[j][pj] = pB;
            }
          }
        }
      }
    }
  }

  return buckets.map((players, idx) => {
    const palette = TEAM_PALETTE[idx % TEAM_PALETTE.length];
    const sortedPlayers: DrawnTeamPlayer[] = [...players]
      .sort((a, b) => b.overall - a.overall)
      .map((p) => ({
        userId: p.userId,
        membershipId: p.membershipId,
        name: p.name,
        nickname: p.nickname,
        position: p.position,
        category: p.category,
        overall: p.overall,
        scores: p.scores,
      }));
    const { avgOverall, avgScores } = computeTeamAverages(players);
    return {
      teamIndex: idx + 1,
      name: palette.name,
      colorHex: palette.colorHex,
      players: sortedPlayers,
      avgOverall,
      avgScores,
    };
  });
}
