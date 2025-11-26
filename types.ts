export enum Suit {
  HEARTS = '♥',
  DIAMONDS = '♦',
  CLUBS = '♣',
  SPADES = '♠',
}

export enum Rank {
  TWO = '2', THREE = '3', FOUR = '4', FIVE = '5', SIX = '6',
  SEVEN = '7', EIGHT = '8', NINE = '9', TEN = 'T',
  JACK = 'J', QUEEN = 'Q', KING = 'K', ACE = 'A',
}

export interface Card {
  suit: Suit;
  rank: Rank;
  value: number; // 2-14
}

export enum HandPhase {
  PREFLOP = 'PREFLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN = 'SHOWDOWN',
  GAME_OVER = 'GAME_OVER',
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  hand: Card[];
  isFolded: boolean;
  currentBet: number;
  isBot: boolean;
  action?: 'CHECK' | 'CALL' | 'RAISE' | 'FOLD' | 'ALL-IN';
}

export interface HandActionLog {
  phase: string;
  actor: string; // 'Player', 'Bot', or 'System'
  action: string;
  amount?: number;
  details?: string;
}

export interface GameState {
  deck: Card[];
  communityCards: Card[];
  pot: number;
  currentBet: number;
  phase: HandPhase;
  players: Player[];
  currentPlayerIndex: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  message: string;
  handWinnerId: string | null;
  handLogs: HandActionLog[];
}

export enum SkillLevel {
  BEGINNER = '新手',
  INTERMEDIATE = '中级',
  ADVANCED = '高级',
  PRO = '职业',
}

export interface HandRecord {
  id: string;
  timestamp: number;
  userHand: Card[];
  botHand: Card[];
  communityCards: Card[];
  winnerId: string | null;
  pot: number;
  logs: HandActionLog[];
  aiAnalysis?: string;
}

export interface TrainingProfile {
  gamesPlayed: number;
  handsWon: number;
  totalWinnings: number;
  skillLevel: SkillLevel;
  strengths: string[];
  weaknesses: string[];
  assessmentComplete: boolean;
}