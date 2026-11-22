export type UserRole = 'admin' | 'player';

export type FutsalPosition =
  | 'Goleiro'
  | 'Fixo'
  | 'Ala Direito'
  | 'Ala Esquerdo'
  | 'Pivô'
  | 'Coringa';

export type DominantFoot = 'Destro' | 'Canhoto' | 'Ambidestro';

export type PlayerCategory = 'mensalista' | 'avulso' | 'eventual';

export const PLAYER_CATEGORIES: Array<{
  value: PlayerCategory;
  label: string;
  description: string;
}> = [
  {
    value: 'mensalista',
    label: 'Mensalista',
    description: 'Tem prioridade para participar dos jogos marcados.',
  },
  {
    value: 'avulso',
    label: 'Avulso',
    description: 'Frequenta com alguma regularidade, após os mensalistas.',
  },
  {
    value: 'eventual',
    label: 'Peladeiro Eventual',
    description: 'Vai aos jogos apenas quando convidado por algum peladeiro.',
  },
];

export interface AuthUser {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  playerId: number | null;
}

export interface Player {
  id: number;
  userId: number | null;
  name: string;
  nickname: string;
  age: number | null;
  position: FutsalPosition;
  dominantFoot: DominantFoot;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  initPhysical: number;
  initDribbling: number;
  initShooting: number;
  initDefense: number;
  initAttack: number;
  initPassing: number;
  initPositioning: number;
  initOverall: number;
  curPhysical: number;
  curDribbling: number;
  curShooting: number;
  curDefense: number;
  curAttack: number;
  curPassing: number;
  curPositioning: number;
  curOverall: number;
  category: PlayerCategory;
  exclusiveGroupId: number | null;
  exclusivePeladaId: number | null;
  invitedByUserId: number | null;
  initRatingStatus?: 'pending_votes' | 'approved';
  initVotesCount?: number;
  initScores?: Record<string, number>;
  curScores?: Record<string, number>;
  profileCompleted: boolean;
  createdAt: string;
}

export interface GroupCriterion {
  key: string;
  label: string;
  short: string;
  weight: number;
  enabled: boolean;
}

export interface SevenCriteria {
  physical: number;
  dribbling: number;
  shooting: number;
  defense: number;
  attack: number;
  passing: number;
  positioning: number;
}

export const CRITERIA_LABELS: Array<{ key: keyof SevenCriteria; label: string; short: string }> = [
  { key: 'physical', label: 'Preparo físico', short: 'Físico' },
  { key: 'dribbling', label: 'Drible', short: 'Drible' },
  { key: 'shooting', label: 'Chute', short: 'Chute' },
  { key: 'defense', label: 'Capacidade de defesa', short: 'Defesa' },
  { key: 'attack', label: 'Capacidade de ataque', short: 'Ataque' },
  { key: 'passing', label: 'Qualidade do passe', short: 'Passe' },
  { key: 'positioning', label: 'Posicionamento', short: 'Posic.' },
];

export const DEFAULT_GROUP_CRITERIA: GroupCriterion[] = CRITERIA_LABELS.map((c) => ({
  key: c.key,
  label: c.label,
  short: c.short,
  weight: 1,
  enabled: true,
}));

export const FUTSAL_POSITIONS: FutsalPosition[] = [
  'Goleiro',
  'Fixo',
  'Ala Direito',
  'Ala Esquerdo',
  'Pivô',
  'Coringa',
];

export const DOMINANT_FEET: DominantFoot[] = ['Destro', 'Canhoto', 'Ambidestro'];

export interface PeladaGroupSummary {
  id: number;
  name: string;
  description: string | null;
  weekday: string;
  startTime: string;
  location: string;
  fullAddress?: string | null;
  avulsoFee?: number | null;
  monthlyFee?: number | null;
  initialCashBalance?: number | null;
  pixKey?: string | null;
  playersPerTeam: number;
  defaultTeamsCount: number;
  photoUrl: string | null;
  ownerUserId: number | null;
  createdAt: string;
  membersCount: number;
  peladasCount: number;
  openSeasonName: string | null;
  myMemberRole: 'admin' | 'member';
  myAdminTitle?: AdminTitle | null;
  canConfirmPayments?: boolean;
  isGroupAdmin?: boolean;
  criteriaConfig?: GroupCriterion[];
  membershipStatus?: 'member' | 'pending' | 'rejected' | 'expired' | 'none';
  myMemberCategory?: PlayerCategory | null;
  accessExpiresAt?: string | null;
  accessPeladaId?: number | null;
  accessPeladaTitle?: string | null;
  myJoinRequest?: {
    id: number;
    status: 'pending' | 'approved' | 'rejected';
    requestedCategory: PlayerCategory;
    requestedPeladaId: number | null;
    responseNote: string | null;
    createdAt: string;
    respondedAt: string | null;
  } | null;
  pendingJoinRequestsCount?: number;
  upcomingPeladas?: Array<{
    id: number;
    title: string;
    eventDate: string;
    startTime: string;
    status: string;
  }>;
}

export type AdminTitle =
  | 'presidente'
  | 'tesoureiro'
  | 'presidente_tesoureiro'
  | 'administrador';

export interface PeladaGroupMember {
  id: number;
  groupId: number;
  userId: number | null;
  playerId: number | null;
  memberRole: 'admin' | 'member';
  adminTitle?: AdminTitle | null;
  playerCategory: PlayerCategory;
  accessPeladaId?: number | null;
  accessExpiresAt?: string | null;
  summaryEmailSentAt?: string | null;
  userName: string | null;
  userEmail: string | null;
  playerName: string | null;
  playerNickname: string | null;
  playerPosition: string | null;
  playerPhoto: string | null;
  playerOverall: number | null;
}

export interface Season {
  id: number;
  groupId?: number | null;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  status: 'open' | 'closed';
  summaryJson: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface PeladaSummary {
  id: number;
  groupId?: number | null;
  seasonId: number;
  title: string;
  location: string;
  eventDate: string;
  startTime: string;
  playersPerTeam: number;
  status: 'scheduled' | 'in_progress' | 'finished';
  notes: string | null;
  presentCount: number;
  matchesCount: number;
}

export interface PeladaTeam {
  id: number;
  peladaId: number;
  name: string;
  colorHex: string;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface PeladaAttendance {
  id: number;
  peladaId: number;
  playerId: number;
  teamId: number | null;
  present: boolean;
  playerName: string;
  playerNickname: string;
  playerPosition: FutsalPosition;
  playerOverall: number;
  playerPhoto: string | null;
  playerUserId: number | null;
  playerCategory?: PlayerCategory;
}

export interface MatchEvent {
  id: number;
  matchId: number;
  peladaId: number;
  seasonId: number;
  teamId: number;
  eventType: 'goal' | 'defense' | 'own_goal';
  playerId: number;
  assistPlayerId: number | null;
  minute: number;
  createdAt: string;
}

export interface Match {
  id: number;
  peladaId: number;
  seasonId: number;
  matchNumber: number;
  teamAId: number;
  teamBId: number;
  scoreA: number;
  scoreB: number;
  status: 'live' | 'finished';
  durationMinutes: number;
  events: MatchEvent[];
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

export interface PeladaStats {
  pelada: PeladaSummary;
  teamStandings: PeladaTeam[];
  totals: {
    peladasCount: number;
    matchesCount: number;
    goalsCount: number;
    assistsCount: number;
    defensesCount: number;
  };
  playersStats: PlayerSeasonStat[];
  attendanceRanking: PlayerSeasonStat[];
  topScorers: PlayerSeasonStat[];
  topAssists: PlayerSeasonStat[];
  bestDefenders: PlayerSeasonStat[];
  bestGoalkeepers: PlayerSeasonStat[];
  mvpRanking: PlayerSeasonStat[];
}

export interface SeasonStats {
  season: Season;
  totals: {
    peladasCount: number;
    matchesCount: number;
    goalsCount: number;
    assistsCount: number;
    defensesCount: number;
  };
  playersStats: PlayerSeasonStat[];
  attendanceRanking: PlayerSeasonStat[];
  topScorers: PlayerSeasonStat[];
  topAssists: PlayerSeasonStat[];
  bestDefenders: PlayerSeasonStat[];
  bestGoalkeepers: PlayerSeasonStat[];
  mvpRanking: PlayerSeasonStat[];
}

export interface PlayerHistoryResponse {
  player: Player;
  criteriaConfig?: GroupCriterion[];
  summary: {
    peladasAttended: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goals: number;
    assists: number;
    defenses: number;
    evaluatedMatchesCount: number;
  };
  evolutionSeries: Array<{
    label: string;
    date: string;
    matchRating: number;
    rolling10Rating: number;
    goals: number;
    assists: number;
    criteria: SevenCriteria;
  }>;
  history: Array<{
    matchId: number;
    peladaId: number;
    peladaTitle: string;
    eventDate: string;
    matchNumber: number;
    myTeamName: string;
    myTeamColor: string;
    opponentTeamName: string;
    myScore: number;
    oppScore: number;
    result: 'V' | 'E' | 'D' | 'Em andamento';
    status: string;
    goals: number;
    assists: number;
    defenses: number;
    evaluationsCount: number;
    matchRating: number | null;
    criteria: SevenCriteria | null;
  }>;
}

export interface InviteEmailRecord {
  id: number;
  userId: number;
  playerId: number | null;
  groupId?: number | null;
  invitedByUserId?: number | null;
  avulsoFee?: number | null;
  toEmail: string;
  subject: string;
  bodyText: string;
  inviteLink: string;
  status: string;
  createdAt: string;
}

export interface PasswordResetEmailRecord {
  id: number;
  userId: number;
  toEmail: string;
  subject: string;
  bodyText: string;
  resetLink: string;
  status: string;
  createdAt: string;
}

export interface AdminUserAccount {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  hasPassword: boolean;
  hasPendingInvite: boolean;
  createdAt: string;
  player: { id: number; nickname: string } | null;
}

export interface InitialVoteRecord {
  id: number;
  groupId: number | null;
  playerId: number;
  adminUserId: number;
  adminName: string;
  scores: Record<string, number>;
  averageScore: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerInitialVotesResponse {
  player: Player;
  groupId: number | null;
  criteriaConfig: GroupCriterion[];
  votes: InitialVoteRecord[];
  myVote: InitialVoteRecord | null;
  totalAdmins: number;
  votesCount: number;
}

export interface AdminNotification {
  id: number;
  recipientUserId: number;
  groupId: number | null;
  groupName: string | null;
  playerId: number;
  joinRequestId?: number | null;
  playerName: string;
  playerNickname: string;
  playerPosition: string;
  playerPhotoUrl: string | null;
  playerInitOverall: number;
  playerInitRatingStatus: 'pending_votes' | 'approved';
  playerInitVotesCount: number;
  totalAdmins: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  voted: boolean;
  createdAt: string;
}

export interface PeladaJoinRequest {
  id: number;
  groupId: number;
  groupName?: string;
  userId: number;
  playerId: number;
  requestedCategory: PlayerCategory;
  requestedPeladaId: number | null;
  requestedPeladaTitle?: string | null;
  requestedPeladaDate?: string | null;
  message: string | null;
  scores: Record<string, number>;
  status: 'pending' | 'approved' | 'rejected';
  respondedByUserId: number | null;
  respondedByName?: string | null;
  responseNote: string | null;
  respondedAt: string | null;
  createdAt: string;
  player: {
    id: number;
    name: string;
    nickname: string;
    age: number | null;
    position: FutsalPosition;
    dominantFoot: DominantFoot;
    phone: string | null;
    email: string | null;
    photoUrl: string | null;
    initOverall: number;
  };
  criteriaConfig?: GroupCriterion[];
}

export interface PlayerSummaryEmailRecord {
  id: number;
  groupId: number;
  groupName?: string;
  peladaId: number | null;
  peladaTitle?: string | null;
  peladaDate?: string | null;
  userId: number | null;
  playerId: number;
  playerNickname?: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  stats?: {
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goals: number;
    assists: number;
    defenses: number;
    rating: number;
  } | null;
  status: string;
  sentAt: string;
}

export type FinanceEntryType = 'cash_box' | 'income' | 'expense' | 'pending_debt';

export interface PeladaFinanceEntry {
  id: number;
  groupId: number;
  peladaId: number | null;
  peladaTitle?: string | null;
  entryType: FinanceEntryType;
  title: string;
  description: string | null;
  amount: number;
  status: 'settled' | 'pending';
  attachmentUrl: string | null;
  entryDate: string;
  createdByUserId: number | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface PeladaParticipantPayment {
  id: number;
  groupId: number;
  peladaId: number | null;
  peladaTitle?: string | null;
  playerId: number;
  playerName: string;
  playerNickname: string;
  playerEmail: string | null;
  playerCategory: PlayerCategory;
  userId: number | null;
  paymentType: 'mensalidade' | 'diaria';
  referenceLabel: string;
  amount: number;
  status: 'pending' | 'paid';
  paidAt: string | null;
  confirmedByUserId: number | null;
  confirmedByName?: string | null;
  confirmedByRole: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  pixEmailSentAt: string | null;
  createdAt: string;
}

export interface PeladaPixPaymentEmail {
  id: number;
  groupId: number;
  peladaId: number | null;
  paymentId: number | null;
  userId: number | null;
  playerId: number;
  playerNickname?: string | null;
  toEmail: string;
  subject: string;
  bodyText: string;
  pixKey: string;
  amount: number;
  status: string;
  sentAt: string;
}

export interface PeladaFinanceSummary {
  initialCashBalance: number;
  cashBoxContributions: number;
  extraIncome: number;
  participantPaymentsReceived: number;
  totalRevenue: number;
  paidExpenses: number;
  pendingDebts: number;
  pendingReceivables: number;
  currentCashBalance: number;
  projectedBalance: number;
}

export interface PeladaFinanceOverviewResponse {
  group: {
    id: number;
    name: string;
    pixKey: string | null;
    avulsoFee: number;
    monthlyFee: number;
    initialCashBalance: number;
  };
  permissions: {
    isGroupAdmin: boolean;
    myAdminTitle: AdminTitle | null;
    canConfirmPayments: boolean;
  };
  summary: PeladaFinanceSummary;
  entries: PeladaFinanceEntry[];
  payments: PeladaParticipantPayment[];
  pixEmails: PeladaPixPaymentEmail[];
  peladas: Array<{
    id: number;
    title: string;
    eventDate: string;
    status: string;
  }>;
  participants: Array<{
    playerId: number;
    name: string;
    nickname: string;
    email: string | null;
    category: PlayerCategory;
    totalPaid: number;
    totalPending: number;
    pendingCount: number;
    paidCount: number;
  }>;
}

