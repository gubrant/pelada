export interface BalanceablePlayer {
  id: number;
  name: string;
  nickname: string;
  position: string;
  curOverall: number;
}

export interface BalancedTeamBucket {
  teamIndex: number;
  players: BalanceablePlayer[];
  totalRating: number;
  goalkeeperCount: number;
}

export function balancePlayersIntoTeams(
  presentPlayers: BalanceablePlayer[],
  teamCount: number
): BalancedTeamBucket[] {
  const safeCount = Math.max(2, Math.min(12, teamCount));
  const buckets: BalancedTeamBucket[] = Array.from({ length: safeCount }, (_, idx) => ({
    teamIndex: idx,
    players: [],
    totalRating: 0,
    goalkeeperCount: 0,
  }));

  const goalkeepers = presentPlayers
    .filter((p) => p.position === 'Goleiro')
    .sort((a, b) => b.curOverall - a.curOverall);

  const fieldPlayers = presentPlayers
    .filter((p) => p.position !== 'Goleiro')
    .sort((a, b) => b.curOverall - a.curOverall);

  // Distribute goalkeepers evenly first
  goalkeepers.forEach((gk, idx) => {
    const target = buckets[idx % safeCount];
    target.players.push(gk);
    target.totalRating += gk.curOverall;
    target.goalkeeperCount += 1;
  });

  // Assign field players always picking the team with fewest players, then lowest totalRating
  for (const player of fieldPlayers) {
    const sortedBuckets = buckets.slice().sort((a, b) => {
      if (a.players.length !== b.players.length) {
        return a.players.length - b.players.length;
      }
      if (Math.abs(a.totalRating - b.totalRating) > 0.01) {
        return a.totalRating - b.totalRating;
      }
      return a.teamIndex - b.teamIndex;
    });
    const target = sortedBuckets[0];
    target.players.push(player);
    target.totalRating += player.curOverall;
  }

  return buckets;
}
