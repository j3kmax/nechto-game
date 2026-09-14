export type Role = 'HUMAN' | 'THE_THING' | 'INFECTED';

export type CardCategory = 
  | 'THE_THING' 
  | 'INFECTION' 
  | 'ACTION' 
  | 'DEFENSE' 
  | 'OBSTACLE' 
  | 'PANIC';

export type CardCode =
  | 'THE_THING'
  | 'INFECTION'
  | 'FLAMETHROWER'    // Огнемёт
  | 'AXE'              // Топор
  | 'ANALYSIS'         // Анализ
  | 'SUSPICION'        // Подозрение
  | 'WHISKEY'          // Виски
  | 'SEDUCTION'        // Соблазн
  | 'SWITCH_PLACES'    // Перемена мест
  | 'PERSEVERANCE'     // Упорство
  | 'NO_THANKS'        // Нет, спасибо!
  | 'MISSED'           // Мимо!
  | 'FEAR'             // Страх
  | 'BARRED_DOOR'      // Заколоченная дверь
  | 'QUARANTINE'       // Карантин
  | 'CHANGE_DIRECTION' // Смена направления
  | 'BLIND_FAITH';     // Слепое доверие

export interface GameCard {
  id: string;
  code: CardCode;
  name: string;
  category: CardCategory;
  description: string;
  flavorText?: string;
  minPlayers?: number;
}

export type AvatarId = 'explorer' | 'scientist' | 'doctor' | 'mechanic' | 'radio' | 'officer';

export interface AvatarInfo {
  id: AvatarId;
  name: string;
  title: string;
  iconName: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: AvatarId;
  seatIndex: number;
  isHost: boolean;
  isDead: boolean;
  handCount: number;
  quarantineTurns: number; // 0 = not in quarantine, >0 = turns remaining
  isConnected: boolean;
  isBot?: boolean;
}

export interface PlayerPrivate {
  role: Role;
  cards: GameCard[];
  infectedBy?: string; // ID игрока, который заразил
}

export type TurnPhase = 
  | 'LOBBY'
  | 'DRAW'
  | 'ACTION'
  | 'DEFENSE_WAIT'
  | 'EXCHANGE_OFFER'
  | 'EXCHANGE_RESPOND'
  | 'EXCHANGE_DEFENSE_WAIT'
  | 'DISCARD'
  | 'GAME_OVER';

export interface PendingDefense {
  sourcePlayerId: string;
  targetPlayerId: string;
  actionCard: GameCard;
  actionType: 'ATTACK' | 'EXCHANGE';
  expiresAt: number; // unix timestamp in ms
  allowedDefenseCodes: CardCode[];
  offeredCard?: GameCard; // for exchange
}

export interface BarredDoor {
  playerAId: string;
  playerBId: string;
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  text: string;
  type: 'INFO' | 'ATTACK' | 'DEFENSE' | 'DEATH' | 'EXCHANGE' | 'PANIC' | 'WARNING';
}

export type GameWinner = 'HUMANS' | 'THE_THING' | null;

export interface RoomSettings {
  turnTimerSeconds: number; // 0 = disabled, or 30, 60, 90
  allowBots: boolean;
  maxPlayers: number;
}

export interface RoomPublicState {
  roomId: string;
  hostId: string;
  status: 'LOBBY' | 'PLAYING' | 'GAME_OVER';
  players: PlayerPublic[];
  currentTurnPlayerId: string;
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  phase: TurnPhase;
  roundNumber: number;
  doors: BarredDoor[];
  discardPile: GameCard[];
  deckCount: number;
  pendingDefense: PendingDefense | null;
  winner: GameWinner;
  winningRoleReason?: string;
  logs: GameLogEntry[];
  settings: RoomSettings;
  revealedCards?: {
    fromPlayerId: string;
    targetPlayerId?: string; // if only visible to one player (whiskey or analysis)
    cards: GameCard[];
    title: string;
  } | null;
  finalRoles?: Record<string, Role>;
  lastUpdated: number;
}
