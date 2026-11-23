export type UserRole = 'admin' | 'member';
export type MemberCategory = 'mensalista' | 'avulso';
export type DominantFoot = 'Destro' | 'Canhoto' | 'Ambidestro';
export type PlayerPosition =
  | 'Goleiro'
  | 'Fixo'
  | 'Ala Direito'
  | 'Ala Esquerdo'
  | 'Pivô'
  | 'Coringa';

export type BloodType =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'Não sei';

export type AttendanceStatus = 'confirmed' | 'absent';
export type EncounterStatus = 'open' | 'drawn' | 'finished';
export type FinanceType = 'income' | 'expense';

export type SkillCriterionKey =
  | 'dribbling'
  | 'physical'
  | 'passing'
  | 'attack'
  | 'defense'
  | 'shooting';

export interface SkillScores {
  dribbling: number;
  physical: number;
  passing: number;
  attack: number;
  defense: number;
  shooting: number;
}

export const SKILL_CRITERIA: { key: SkillCriterionKey; label: string; shortLabel: string }[] = [
  { key: 'dribbling', label: 'Drible', shortLabel: 'DRI' },
  { key: 'physical', label: 'Preparo físico', shortLabel: 'PRE' },
  { key: 'passing', label: 'Passe', shortLabel: 'PAS' },
  { key: 'attack', label: 'Ataque', shortLabel: 'ATA' },
  { key: 'defense', label: 'Defesa', shortLabel: 'DEF' },
  { key: 'shooting', label: 'Chute', shortLabel: 'CHU' },
];

export const WEEKDAYS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
] as const;

export const BLOOD_TYPES: BloodType[] = [
  'Não sei',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

export const DOMINANT_FEET: DominantFoot[] = ['Destro', 'Canhoto', 'Ambidestro'];

export const PLAYER_POSITIONS: PlayerPosition[] = [
  'Goleiro',
  'Fixo',
  'Ala Direito',
  'Ala Esquerdo',
  'Pivô',
  'Coringa',
];

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export interface MemberProfile {
  id: number;
  userId: number;
  fullName: string;
  nickname: string | null;
  age: number | null;
  dominantFoot: DominantFoot;
  preferredPosition: PlayerPosition;
  phone: string | null;
  photoUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bloodType: BloodType;
  medicalNotes: string | null;
  preExistingConditions: string | null;
  routineMedications: string | null;
  allergies: string | null;
  initDribbling: number;
  initPhysical: number;
  initPassing: number;
  initAttack: number;
  initDefense: number;
  initShooting: number;
  initOverall: number;
  profileCompleted: boolean;
  updatedAt: string;
}

export interface WeeklyPelada {
  id: number;
  name: string;
  weekday: string;
  startTime: string;
  endTime: string;
  location: string;
  address: string | null;
  playersPerTeam: number;
  defaultTeamsCount: number;
  maxPlayers: number | null;
  pixKey: string;
  avulsoFee: number;
  mensalistaFee: number;
  notes: string | null;
  createdByUserId: number | null;
  createdAt: string;
  memberCount?: number;
  mensalistaCount?: number;
  myMembership?: PeladaMembership | null;
  balance?: number;
}

export interface PeladaMembership {
  id: number;
  peladaId: number;
  userId: number;
  category: MemberCategory;
  active: boolean;
  dribbling: number;
  physical: number;
  passing: number;
  attack: number;
  defense: number;
  shooting: number;
  overall: number;
  joinedAt: string;
  updatedAt: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  nickname: string | null;
  preferredPosition: PlayerPosition;
  dominantFoot: DominantFoot;
  age: number | null;
  photoUrl: string | null;
  profileCompleted: boolean;
  otherPeladasCount?: number;
}

export interface PeladaEncounter {
  id: number;
  peladaId: number;
  title: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  maxPlayers: number | null;
  status: EncounterStatus;
  createdAt: string;
  confirmedCount?: number;
  absentCount?: number;
  mensalistaConfirmedCount?: number;
  myAttendanceStatus?: AttendanceStatus | null;
  hasTeamDraw?: boolean;
}

export interface EncounterAttendanceItem {
  id: number;
  encounterId: number;
  membershipId: number;
  userId: number;
  status: AttendanceStatus;
  category: MemberCategory;
  confirmedAt: string;
  userName: string;
  nickname: string | null;
  preferredPosition: PlayerPosition;
  dominantFoot: DominantFoot;
  photoUrl: string | null;
  overall: number;
  dribbling: number;
  physical: number;
  passing: number;
  attack: number;
  defense: number;
  shooting: number;
  priorityRank: number | null; // 1..N apenas para confirmados
  inMainSquad: boolean; // dentro do limite de vagas (se houver)
}

export interface DrawnTeamPlayer {
  userId: number;
  membershipId: number;
  name: string;
  nickname: string | null;
  position: PlayerPosition;
  category: MemberCategory;
  overall: number;
  scores: SkillScores;
}

export interface DrawnTeam {
  teamIndex: number;
  name: string;
  colorHex: string;
  players: DrawnTeamPlayer[];
  avgOverall: number;
  avgScores: SkillScores;
}

export interface EncounterTeamDraw {
  id: number;
  encounterId: number;
  teamsCount: number;
  playersPerTeam: number;
  teams: DrawnTeam[];
  createdAt: string;
}

export interface FinanceTransaction {
  id: number;
  peladaId: number;
  encounterId: number | null;
  relatedUserId: number | null;
  relatedUserName: string | null;
  type: FinanceType;
  category: string;
  description: string;
  amount: number;
  transactionDate: string;
  receiptImageUrl: string | null;
  createdByUserName: string | null;
  createdAt: string;
}

export interface PeladaFinanceSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  transactionsCount: number;
  receiptsCount: number;
}
