import { 
  RoomPublicState, 
  PlayerPublic, 
  PlayerPrivate, 
  GameCard, 
  RoomSettings, 
  AvatarId, 
  GameLogEntry,
  CardCode,
  Role
} from '@/types/game';
import { setupGameDeck } from '@/game/deckBuilder';
import { 
  validatePlayCard, 
  validateDiscardCard, 
  validateExchangeCard, 
  getPlayerNeighbors, 
  evaluateWinConditions, 
  isDoorBetween,
  getLivingPlayers
} from '@/game/rulesEngine';
import { isFirebaseConfigured, db } from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  updateDoc 
} from 'firebase/firestore';

// Генерация короткого кода комнаты (например, ARCTIC, POLAR8)
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Очистка объекта от значений undefined перед отправкой в Firestore
function cleanForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (key, value) => (value === undefined ? null : value)));
}

// Локальное и серверное хранилище комнаты
interface LocalGameState {
  publicState: RoomPublicState;
  privateStates: Record<string, PlayerPrivate>;
  fullDrawDeck?: GameCard[];
  offeredExchangeCard?: {
    fromPlayerId: string;
    targetPlayerId: string;
    card: GameCard;
  };
  forcedExchangeTargetId?: string;
}

class NetworkManager {
  private localRooms: Map<string, LocalGameState> = new Map();
  private localChannels: Map<string, BroadcastChannel> = new Map();
  private botTimers: Map<string, NodeJS.Timeout> = new Map();
  public botDelayMs?: number;

  public scheduleBotAction(fn: () => void | Promise<void>, delayMs: number = 1200, actionKey: string = 'default') {
    const actualDelay = this.botDelayMs !== undefined ? this.botDelayMs : delayMs;
    if (this.botTimers.has(actionKey)) {
      clearTimeout(this.botTimers.get(actionKey)!);
    }
    const timer = setTimeout(() => {
      this.botTimers.delete(actionKey);
      fn();
    }, actualDelay);
    this.botTimers.set(actionKey, timer);
  }

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('nechto_local_rooms');
        if (saved) {
          const parsed = JSON.parse(saved);
          for (const key in parsed) {
            this.localRooms.set(key, parsed[key]);
          }
        }
      } catch (e) {
        console.warn('Не удалось загрузить локальные комнаты:', e);
      }
    }
  }

  // Централизованное сохранение и синхронизация (LocalStorage + BroadcastChannel + Firestore)
  private async saveAndSync(roomId: string, state: LocalGameState, modifiedPlayerIds?: string[]) {
    roomId = roomId.toUpperCase().trim();
    this.localRooms.set(roomId, state);

    if (typeof window !== 'undefined') {
      try {
        const obj: Record<string, LocalGameState> = {};
        this.localRooms.forEach((v, k) => { obj[k] = v; });
        localStorage.setItem('nechto_local_rooms', JSON.stringify(obj));
        
        const ch = this.getChannel(roomId);
        ch.postMessage({ type: 'SYNC', roomId });
      } catch (e) {
        console.error('Ошибка сохранения локальной комнаты:', e);
      }
    }

    // СИНХРОНИЗАЦИЯ С ОБЛАЧНЫМ FIREBASE FIRESTORE
    if (isFirebaseConfigured && db) {
      try {
        const promises: Promise<unknown>[] = [];

        // 1. Публичное состояние стола
        const cleanPublic = cleanForFirestore(state.publicState);
        promises.push(setDoc(doc(db, 'rooms', roomId, 'public', 'state'), cleanPublic));

        // 2. Секретные карты каждого игрока (сохраняем ТОЛЬКО затронутых игроков, чтобы не перезаписывать чужие руки)
        const targetIds = modifiedPlayerIds && modifiedPlayerIds.length > 0 
          ? modifiedPlayerIds 
          : Object.keys(state.privateStates);

        for (const pId of targetIds) {
          if (state.privateStates[pId]) {
            const cleanPriv = cleanForFirestore(state.privateStates[pId]);
            promises.push(setDoc(doc(db, 'rooms', roomId, 'private', pId), cleanPriv));
          }
        }

        // 3. Метаданные колоды и обмена
        const meta = {
          fullDrawDeck: state.fullDrawDeck || [],
          offeredExchangeCard: state.offeredExchangeCard || null,
          forcedExchangeTargetId: state.forcedExchangeTargetId || null,
        };
        promises.push(setDoc(doc(db, 'rooms', roomId, 'private', '_game_meta'), cleanForFirestore(meta)));

        await Promise.all(promises);
      } catch (err) {
        console.error('[Firebase] Ошибка синхронизации с Firestore:', err);
      }
    }
  }

  // Убедиться, что актуальное состояние загружено (из Firestore или памяти)
  private async ensureRoomState(roomId: string): Promise<LocalGameState | null> {
    roomId = roomId.toUpperCase().trim();
    let local = this.localRooms.get(roomId);

    if (isFirebaseConfigured && db) {
      try {
        const snap = await getDoc(doc(db, 'rooms', roomId, 'public', 'state'));
        if (snap.exists()) {
          const remotePublic = snap.data() as RoomPublicState;
          if (!local) {
            local = { publicState: remotePublic, privateStates: {} };
            this.localRooms.set(roomId, local);
          } else {
            local.publicState = remotePublic;
          }
        }

        const metaSnap = await getDoc(doc(db, 'rooms', roomId, 'private', '_game_meta'));
        if (metaSnap.exists() && local) {
          const meta = metaSnap.data();
          if (meta.fullDrawDeck) local.fullDrawDeck = meta.fullDrawDeck;
          if (meta.offeredExchangeCard) local.offeredExchangeCard = meta.offeredExchangeCard;
          if (meta.forcedExchangeTargetId) local.forcedExchangeTargetId = meta.forcedExchangeTargetId;
        }
      } catch (err) {
        console.warn('[Firebase] ensureRoomState error:', err);
      }
    }

    return local || null;
  }

  private getChannel(roomId: string): BroadcastChannel {
    if (!this.localChannels.has(roomId) && typeof window !== 'undefined') {
      const ch = new BroadcastChannel(`nechto_room_${roomId}`);
      this.localChannels.set(roomId, ch);
    }
    return this.localChannels.get(roomId)!;
  }

  private addLog(state: RoomPublicState, text: string, type: GameLogEntry['type'] = 'INFO') {
    state.logs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: Date.now(),
      text,
      type,
    });
    if (state.logs.length > 50) {
      state.logs.pop();
    }
  }

  private addPrivateLog(local: LocalGameState, playerId: string, text: string, type: GameLogEntry['type'] = 'INFO') {
    const priv = local.privateStates[playerId];
    if (!priv) return;
    if (!priv.privateLogs) priv.privateLogs = [];
    priv.privateLogs.unshift({
      id: `priv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      text,
      type,
    });
    if (priv.privateLogs.length > 80) {
      priv.privateLogs.pop();
    }
  }

  private syncDeckState(local: LocalGameState) {
    const fullDeck = local.fullDrawDeck || [];
    local.publicState.deckCount = fullDeck.length;
    if (fullDeck.length > 0) {
      local.publicState.topDeckType = fullDeck[0].category === 'PANIC' ? 'PANIC' : 'EVENT';
    } else {
      local.publicState.topDeckType = null;
    }
  }

  // Получить секретное состояние игрока (из памяти или Firestore)
  public async getPlayerPrivate(roomId: string, playerId: string, forceFresh: boolean = false): Promise<PlayerPrivate | null> {
    roomId = roomId.toUpperCase().trim();
    const local = this.localRooms.get(roomId);
    if (!forceFresh && local?.privateStates[playerId]) {
      return local.privateStates[playerId];
    }
    if (isFirebaseConfigured && db) {
      try {
        const snap = await getDoc(doc(db, 'rooms', roomId, 'private', playerId));
        if (snap.exists()) {
          const priv = snap.data() as PlayerPrivate;
          if (local) {
            local.privateStates[playerId] = priv;
          }
          return priv;
        }
      } catch (err) {
        console.warn(`[Firebase] getPlayerPrivate error for ${playerId}:`, err);
      }
    }
    return local?.privateStates[playerId] || null;
  }

  // Получить секретные состояния всех игроков (для проверки условий победы и показа итоговых ролей)
  public async getAllPlayerPrivates(roomId: string, players: PlayerPublic[]): Promise<Record<string, PlayerPrivate>> {
    roomId = roomId.toUpperCase().trim();
    const local = this.localRooms.get(roomId);
    const result: Record<string, PlayerPrivate> = {};

    for (const p of players) {
      if (local?.privateStates[p.id]) {
        result[p.id] = { ...local.privateStates[p.id] };
        if (p.isDead) {
          result[p.id].cards = [];
          local.privateStates[p.id].cards = [];
        }
      }
    }

    if (isFirebaseConfigured && db) {
      const firestore = db;
      try {
        const promises = players.map(async (p) => {
          if (p.isDead) {
            if (result[p.id]) result[p.id].cards = [];
            if (local?.privateStates[p.id]) local.privateStates[p.id].cards = [];
            return;
          }

          const snap = await getDoc(doc(firestore, 'rooms', roomId, 'private', p.id));
          if (snap.exists()) {
            const priv = snap.data() as PlayerPrivate;
            if (!result[p.id]) {
              result[p.id] = priv;
              if (local) local.privateStates[p.id] = priv;
            } else {
              // Обновляем роль и статус заражения из базы
              result[p.id].role = priv.role;
              if (priv.infectedBy) result[p.id].infectedBy = priv.infectedBy;
              // Если локально карт нет, берем из базы
              if (!result[p.id].cards || result[p.id].cards.length === 0) {
                result[p.id].cards = priv.cards || [];
              }
              // Приватные логи объединяем
              if (priv.privateLogs && priv.privateLogs.length > (result[p.id].privateLogs?.length || 0)) {
                result[p.id].privateLogs = priv.privateLogs;
              }
            }
          }
        });
        await Promise.all(promises);
      } catch (err) {
        console.warn('[Firebase] getAllPlayerPrivates error:', err);
      }
    }
    return result;
  }

  // Очистить раскрытые карты (закрытие модального окна)
  public async clearRevealedCards(roomId: string): Promise<void> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return;
    local.publicState.revealedCards = null;
    local.publicState.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local);
  }

  // 1. Создание новой комнаты
  public async createRoom(
    hostName: string, 
    hostAvatar: AvatarId, 
    settings?: Partial<RoomSettings>
  ): Promise<{ roomId: string; playerId: string }> {
    const roomId = generateRoomCode();
    const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const defaultSettings: RoomSettings = {
      turnTimerSeconds: 60,
      allowBots: true,
      maxPlayers: 5,
      ...settings,
    };

    const hostPlayer: PlayerPublic = {
      id: playerId,
      name: hostName.trim() || 'Полярник',
      avatar: hostAvatar,
      seatIndex: 0,
      isHost: true,
      isDead: false,
      handCount: 0,
      quarantineTurns: 0,
      isConnected: true,
    };

    const publicState: RoomPublicState = {
      roomId,
      hostId: playerId,
      status: 'LOBBY',
      players: [hostPlayer],
      currentTurnPlayerId: playerId,
      direction: 1,
      phase: 'LOBBY',
      roundNumber: 1,
      doors: [],
      discardPile: [],
      deckCount: 0,
      pendingDefense: null,
      winner: null,
      logs: [
        {
          id: `log_init_${Date.now()}`,
          timestamp: Date.now(),
          text: `Комната [${roomId}] создана исследователем ${hostPlayer.name}. Ожидание полярников...`,
          type: 'INFO',
        }
      ],
      settings: defaultSettings,
      lastUpdated: Date.now(),
    };

    const privateState: PlayerPrivate = {
      role: 'HUMAN',
      cards: [],
    };

    const localState: LocalGameState = {
      publicState,
      privateStates: { [playerId]: privateState },
    };

    await this.saveAndSync(roomId, localState);
    return { roomId, playerId };
  }

  // 2. Подключение к комнате
  public async joinRoom(
    roomId: string, 
    playerName: string, 
    playerAvatar: AvatarId
  ): Promise<{ success: boolean; playerId: string; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);

    if (!local) {
      return { success: false, playerId: '', error: 'Комната с таким кодом не найдена.' };
    }

    if (local.publicState.status !== 'LOBBY') {
      return { success: false, playerId: '', error: 'Игра уже началась. Подключение невозможно.' };
    }

    if (local.publicState.players.length >= local.publicState.settings.maxPlayers) {
      return { success: false, playerId: '', error: 'В комнате достигнут лимит игроков.' };
    }

    const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newPlayer: PlayerPublic = {
      id: playerId,
      name: playerName.trim() || `Полярник #${local.publicState.players.length + 1}`,
      avatar: playerAvatar,
      seatIndex: local.publicState.players.length,
      isHost: false,
      isDead: false,
      handCount: 0,
      quarantineTurns: 0,
      isConnected: true,
    };

    local.publicState.players.push(newPlayer);
    this.addLog(local.publicState, `${newPlayer.name} вошел в полярный отсек.`);
    local.publicState.lastUpdated = Date.now();

    local.privateStates[playerId] = {
      role: 'HUMAN',
      cards: [],
    };

    await this.saveAndSync(roomId, local);
    return { success: true, playerId };
  }

  // 3. Добавление бота
  public async addBot(roomId: string): Promise<boolean> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local || local.publicState.status !== 'LOBBY') return false;
    if (local.publicState.players.length >= local.publicState.settings.maxPlayers) return false;

    const botNames = ['Бот Блэр', 'Бот Макриди', 'Бот Чайлдс', 'Бот Коппер', 'Бот Уиндоус', 'Бот Палмер', 'Бот Норис'];
    const botAvatars: AvatarId[] = ['scientist', 'explorer', 'mechanic', 'doctor', 'radio', 'officer'];
    
    const usedNames = local.publicState.players.map(p => p.name);
    const availableName = botNames.find(n => !usedNames.includes(n)) || `Бот #${local.publicState.players.length + 1}`;
    const avatar = botAvatars[local.publicState.players.length % botAvatars.length];

    const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const botPlayer: PlayerPublic = {
      id: botId,
      name: availableName,
      avatar,
      seatIndex: local.publicState.players.length,
      isHost: false,
      isDead: false,
      handCount: 0,
      quarantineTurns: 0,
      isConnected: true,
      isBot: true,
    };

    local.publicState.players.push(botPlayer);
    this.addLog(local.publicState, `ИИ-исследователь ${botPlayer.name} добавлен в команду.`);
    local.publicState.lastUpdated = Date.now();

    local.privateStates[botId] = {
      role: 'HUMAN',
      cards: [],
    };

    await this.saveAndSync(roomId, local);
    return true;
  }

  // 4. Исключение игрока (Кик)
  public async kickPlayer(roomId: string, hostPlayerId: string, targetPlayerId: string): Promise<boolean> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local || local.publicState.hostId !== hostPlayerId) return false;

    const targetIdx = local.publicState.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return false;

    const targetName = local.publicState.players[targetIdx].name;
    local.publicState.players.splice(targetIdx, 1);
    
    local.publicState.players.forEach((p, idx) => { p.seatIndex = idx; });
    delete local.privateStates[targetPlayerId];

    this.addLog(local.publicState, `Игрок ${targetName} был исключен из комнаты.`, 'WARNING');
    local.publicState.lastUpdated = Date.now();

    await this.saveAndSync(roomId, local);
    return true;
  }

  // 5. Передача прав хоста
  public async transferHost(roomId: string, currentHostId: string, newHostId: string): Promise<boolean> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local || local.publicState.hostId !== currentHostId) return false;

    const newHost = local.publicState.players.find(p => p.id === newHostId);
    if (!newHost) return false;

    local.publicState.players.forEach(p => {
      p.isHost = p.id === newHostId;
    });
    local.publicState.hostId = newHostId;

    this.addLog(local.publicState, `Права командира станции переданы: ${newHost.name}.`);
    local.publicState.lastUpdated = Date.now();

    await this.saveAndSync(roomId, local);
    return true;
  }

  // 6. СТАРТ ИГРЫ
  public async startGame(roomId: string, hostPlayerId: string): Promise<{ success: boolean; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return { success: false, error: 'Комната не найдена.' };
    if (local.publicState.hostId !== hostPlayerId) return { success: false, error: 'Только командир (хост) может начать игру.' };
    if (local.publicState.players.length !== 4 && local.publicState.players.length !== 5) {
      return { success: false, error: 'Игра поддерживает строго 4 или 5 полярников (добавьте бота или пригласите друга).' };
    }

    const playerIds = local.publicState.players.map(p => p.id);
    const { playerHands, drawDeck } = setupGameDeck(playerIds);

    // Применяем розданные карты и роли
    local.privateStates = playerHands;
    local.publicState.status = 'PLAYING';
    local.publicState.deckCount = drawDeck.length;
    local.publicState.doors = [];
    local.publicState.discardPile = [];
    local.publicState.pendingDefense = null;
    local.publicState.direction = 1;
    local.publicState.roundNumber = 1;

    // Обновляем количество карт у игроков
    local.publicState.players.forEach(p => {
      p.handCount = local.privateStates[p.id]?.cards.length || 4;
      p.isDead = false;
      p.quarantineTurns = 0;
    });

    // Начинает случайный игрок
    const startPlayerIndex = Math.floor(Math.random() * local.publicState.players.length);
    local.publicState.currentTurnPlayerId = local.publicState.players[startPlayerIndex].id;

    local.fullDrawDeck = drawDeck;
    this.syncDeckState(local);

    // Начальные персональные логи для каждого игрока
    for (const pId of playerIds) {
      const priv = local.privateStates[pId];
      if (priv) {
        priv.privateLogs = [];
        const roleName = priv.role === 'THE_THING' ? 'НЕЧТО (Монстр)' : priv.role === 'INFECTED' ? 'ЗАРАЖЕННЫЙ' : 'ЗДОРОВЫЙ ЧЕЛОВЕК';
        this.addPrivateLog(local, pId, `🚀 Игра началась! Ваша тайная роль: ${roleName}.`, 'WARNING');
        this.addPrivateLog(local, pId, `🎴 Стартовая рука: ${priv.cards.map(c => `«${c.name}»`).join(', ')}.`, 'INFO');
      }
    }

    const startPlayer = local.publicState.players[startPlayerIndex];
    this.addLog(local.publicState, `ВНИМАНИЕ! Экспедиция изолирована (${playerIds.length} полярников). Среди вас бродит НЕЧТО!`, 'WARNING');
    this.addLog(local.publicState, `Каждому роздано по 4 секретных карты. Первым начинает ${startPlayer.name}.`);

    // Фаза первого добора
    await this.executeDrawPhase(local, roomId);

    local.publicState.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local);
    return { success: true };
  }

  // Вспомогательный метод добора карт событий (пропуская панику в сброс)
  private drawEventCard(local: LocalGameState, priv: PlayerPrivate): GameCard | null {
    const state = local.publicState;
    let safety = 0;
    while (safety++ < 40) {
      if (!local.fullDrawDeck || local.fullDrawDeck.length === 0) {
        if (state.discardPile.length > 0) {
          local.fullDrawDeck = [...state.discardPile].sort(() => Math.random() - 0.5);
          state.discardPile = [];
          this.syncDeckState(local);
        } else {
          break;
        }
      }
      const top = local.fullDrawDeck.shift();
      if (!top) break;
      this.syncDeckState(local);
      if (top.category === 'PANIC') {
        state.discardPile.unshift(top);
        continue;
      }
      priv.cards.push(top);
      return top;
    }
    return null;
  }

  // Интерактивная Цепная реакция: выбор карт игроками ПО ОЧЕРЕДИ
  private async initiateChainReaction(local: LocalGameState, roomId: string, starterId: string): Promise<void> {
    const state = local.publicState;
    const living = getLivingPlayers(state.players);
    if (living.length < 2) {
      this.addLog(state, `«Цепная реакция» невозможна — за столом недостаточно живых полярников.`);
      await this.endTurn(local, roomId);
      return;
    }

    const startIdx = living.findIndex(p => p.id === starterId);
    const initialIdx = startIdx !== -1 ? startIdx : 0;
    const order: string[] = [];

    for (let i = 0; i < living.length; i++) {
      const idx = (initialIdx + (state.direction === 1 ? i : -i) + living.length * 10) % living.length;
      order.push(living[idx].id);
    }

    state.phase = 'CHAIN_REACTION';
    const firstTargetId = order[1 % order.length];
    state.chainReaction = {
      activePlayerId: order[0],
      targetPlayerId: firstTargetId,
      pendingOrder: order,
      picks: {},
    };

    this.addLog(state, `⚡ «Цепная реакция»! Все полярники по очереди выбирают по 1 карте для передачи соседу по кругу (${state.direction === 1 ? 'по часовой стрелке ↻' : 'против часовой стрелки ↺'}).`, 'PANIC');

    await this.activateChainReactionStep(local, roomId, order[0]);
  }

  private async activateChainReactionStep(local: LocalGameState, roomId: string, playerId: string): Promise<void> {
    const state = local.publicState;
    const chain = state.chainReaction;
    if (!chain) return;

    const currentOrderIdx = chain.pendingOrder.indexOf(playerId);
    const targetOrderIdx = (currentOrderIdx + 1) % chain.pendingOrder.length;
    const targetId = chain.pendingOrder[targetOrderIdx];

    const player = state.players.find(p => p.id === playerId);
    const target = state.players.find(p => p.id === targetId);
    if (!player || !target) return;

    chain.activePlayerId = playerId;
    chain.targetPlayerId = targetId;

    if (!local.privateStates[playerId]) {
      await this.getPlayerPrivate(roomId, playerId);
    }
    const priv = local.privateStates[playerId];
    if (!priv) return;

    const validCards = priv.cards.filter(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || priv.role !== 'HUMAN'));
    priv.pendingChoice = {
      type: 'CHAIN_REACTION_PASS',
      title: 'Цепная реакция: Выберите карту',
      description: `Передайте 1 карту полярнику ${target.name} по кругу (направление: ${state.direction === 1 ? 'по часовой ↻' : 'против часовой ↺'}).`,
      availableCards: validCards.length > 0 ? validCards : priv.cards,
    };

    if (player.isBot) {
      this.addLog(state, `⚡ «Цепная реакция»: ${player.name} выбирает карту для передачи ${target.name}...`, 'PANIC');
      this.scheduleBotAction(() => this.runBotChainReactionPick(roomId, playerId), 1200, `bot_chain_${playerId}`);
    } else {
      this.addLog(state, `⚡ «Цепная реакция»: ожидается выбор карты от ${player.name} для передачи ${target.name}...`, 'PANIC');
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [playerId]);
  }

  private async finalizeChainReaction(local: LocalGameState, roomId: string): Promise<void> {
    const state = local.publicState;
    const chain = state.chainReaction;
    if (!chain) return;

    const order = chain.pendingOrder;
    const cardsToTransfer: { fromId: string; toId: string; card: GameCard; fromRole: Role }[] = [];

    for (let i = 0; i < order.length; i++) {
      const fromId = order[i];
      const toId = order[(i + 1) % order.length];
      const cardId = chain.picks[fromId];

      if (!local.privateStates[fromId]) {
        await this.getPlayerPrivate(roomId, fromId);
      }
      const fromPriv = local.privateStates[fromId];
      if (!fromPriv) continue;

      let cardIdx = fromPriv.cards.findIndex(c => c.id === cardId || c.code === cardId);
      if (cardIdx === -1) {
        const safeIdx = fromPriv.cards.findIndex(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || fromPriv.role !== 'HUMAN'));
        cardIdx = safeIdx !== -1 ? safeIdx : 0;
      }
      const card = fromPriv.cards.splice(cardIdx, 1)[0];
      cardsToTransfer.push({ fromId, toId, card, fromRole: fromPriv.role });
    }

    for (const item of cardsToTransfer) {
      if (!local.privateStates[item.toId]) {
        await this.getPlayerPrivate(roomId, item.toId);
      }
      const toPriv = local.privateStates[item.toId];
      const fromPlayer = state.players.find(p => p.id === item.fromId);
      const toPlayer = state.players.find(p => p.id === item.toId);

      if (toPriv) {
        toPriv.cards.push(item.card);
        this.addPrivateLog(local, item.fromId, `⚡ «Цепная реакция»: вы передали карту «${item.card.name}» игроку ${toPlayer?.name || 'соседу'}.`, 'EXCHANGE');
        this.addPrivateLog(local, item.toId, `⚡ «Цепная реакция»: вы получили карту «${item.card.name}» от игрока ${fromPlayer?.name || 'соседа'}.`, 'EXCHANGE');

        if (item.card.code === 'INFECTION' && item.fromRole === 'THE_THING') {
          if (toPriv.role === 'HUMAN') {
            toPriv.role = 'INFECTED';
            toPriv.infectedBy = item.fromId;
            this.addPrivateLog(local, item.toId, `☣️ ВАС ЗАРАЗИЛИ: Вы получили карту «Заражение» от Нечто! Теперь вы на стороне Нечто. Помогите Нечто победить людей!`, 'WARNING');
            this.addPrivateLog(local, item.fromId, `☣️ УСПЕХ: В ходе цепной реакции вы заразили игрока ${toPlayer?.name}! Теперь он ваш союзник.`, 'WARNING');
          }
        }
      }
    }

    for (const p of state.players) {
      const priv = local.privateStates[p.id];
      if (priv) p.handCount = priv.cards.length;
    }

    state.chainReaction = null;
    this.addLog(state, `⚡ «Цепная реакция» завершена! Все полярники по очереди выбрали и передали карты соседям по кругу. Ход завершен.`, 'PANIC');

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, order);
    await this.endTurn(local, roomId);
  }

  public async runBotChainReactionPick(roomId: string, botId: string): Promise<void> {
    const local = this.localRooms.get(roomId);
    if (!local || local.publicState.phase !== 'CHAIN_REACTION') return;

    const botPlayer = local.publicState.players.find(p => p.id === botId);
    if (!botPlayer || !botPlayer.isBot) return;

    if (!local.privateStates[botId]) {
      await this.getPlayerPrivate(roomId, botId);
    }
    const botPriv = local.privateStates[botId];
    if (!botPriv || botPriv.cards.length === 0) return;

    let cardToPass: GameCard | undefined;
    if (botPriv.role === 'THE_THING') {
      cardToPass = botPriv.cards.find(c => c.code === 'INFECTION');
    }
    if (!cardToPass) {
      cardToPass = botPriv.cards.find(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || botPriv.role !== 'HUMAN')) || botPriv.cards[0];
    }

    if (cardToPass) {
      await this.confirmCardChoice(roomId, botId, cardToPass.id);
    }
  }

  // Вспомогательный метод: Фаза Добора (Draw Phase)
  private async executeDrawPhase(local: LocalGameState, roomId: string): Promise<void> {
    const state = local.publicState;
    const currentId = state.currentTurnPlayerId;
    const fullDeck = local.fullDrawDeck;

    if (!fullDeck || fullDeck.length === 0) {
      if (state.discardPile.length > 0) {
        local.fullDrawDeck = [...state.discardPile].sort(() => Math.random() - 0.5);
        state.discardPile = [];
        this.addLog(state, `Колода опустела. Стопка сброса перетасована.`);
      } else {
        state.phase = 'ACTION';
        return;
      }
    }

    const drawnCard = local.fullDrawDeck!.shift()!;
    this.syncDeckState(local);

    const activePlayer = state.players.find(p => p.id === currentId);
    const activePrivate = local.privateStates[currentId];

    if (!activePlayer || !activePrivate) return;

    // ПРОВЕРКА КАРТЫ ПАНИКИ
    if (drawnCard.category === 'PANIC') {
      this.addLog(state, `ПАНИКА! ${activePlayer.name} вытянул карту паники «${drawnCard.name}»!`, 'PANIC');
      this.addPrivateLog(local, currentId, `⚠️ Вы вытянули из колоды карту паники «${drawnCard.name}»! Она сыграна немедленно.`, 'PANIC');
      state.discardPile.unshift(drawnCard);

      state.panicEvent = {
        card: drawnCard,
        playerId: currentId,
        playerName: activePlayer.name,
        timestamp: Date.now(),
      };

      if (drawnCard.code === 'PANIC_OPEN_DOORS') {
        state.doors = [];
        this.addLog(state, `🚪 «...Три, четыре... открывайте дверь пошире!» Все заколоченные двери сорваны с петель!`, 'PANIC');
      } else if (drawnCard.code === 'PANIC_PARTY_5' || drawnCard.code === 'PARTY_OVER') {
        state.doors = [];
        state.players.forEach(p => { p.quarantineTurns = 0; });
        this.addLog(state, `💥 «И ЭТО ВЫ НАЗЫВАЕТЕ ВЕЧЕРИНКОЙ?!» Все двери сорваны с петель, все карантины немедленно сняты!`, 'PANIC');

        const living = getLivingPlayers(state.players);
        const activeIdx = living.findIndex(p => p.id === currentId);
        if (activeIdx !== -1) {
          const ordered: PlayerPublic[] = [];
          for (let i = 0; i < living.length; i++) {
            ordered.push(living[(activeIdx + i) % living.length]);
          }
          for (let i = 0; i + 1 < ordered.length; i += 2) {
            const p1 = ordered[i];
            const p2 = ordered[i + 1];
            const tempSeat = p1.seatIndex;
            p1.seatIndex = p2.seatIndex;
            p2.seatIndex = tempSeat;
          }
          this.addLog(state, `🔄 Полярники попарно поменялись местами за столом!`, 'PANIC');
        }
      } else if (drawnCard.code === 'PANIC_ONE_TWO_5') {
        const living = getLivingPlayers(state.players);
        const activeIdx = living.findIndex(p => p.id === currentId);
        if (activeIdx !== -1 && living.length >= 4) {
          const targetP = living[(activeIdx + 3) % living.length];
          if (targetP && targetP.id !== currentId && targetP.quarantineTurns === 0 && activePlayer.quarantineTurns === 0) {
            const tempSeat = activePlayer.seatIndex;
            activePlayer.seatIndex = targetP.seatIndex;
            targetP.seatIndex = tempSeat;
            this.addLog(state, `🔄 «Раз, два... Нечто поднялось со дна!» ${activePlayer.name} поменялся местами с ${targetP.name}!`, 'PANIC');
          }
        }
      } else if (drawnCard.code === 'PANIC_GET_AWAY_5') {
        const others = getLivingPlayers(state.players).filter(p => p.id !== currentId && p.quarantineTurns === 0);
        if (others.length > 0 && activePlayer.quarantineTurns === 0) {
          const targetP = others[0];
          const tempSeat = activePlayer.seatIndex;
          activePlayer.seatIndex = targetP.seatIndex;
          targetP.seatIndex = tempSeat;
          this.addLog(state, `🏃‍♂️ «Убирайся прочь!» ${activePlayer.name} занял место ${targetP.name}!`, 'PANIC');
        }
      } else if (drawnCard.code === 'PANIC_FORGETFULNESS') {
        let discardedCount = 0;
        while (discardedCount < 3 && activePrivate.cards.length > 1) {
          const idx = activePrivate.cards.findIndex(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || activePrivate.role !== 'INFECTED'));
          if (idx !== -1) {
            state.discardPile.unshift(activePrivate.cards.splice(idx, 1)[0]);
            discardedCount++;
          } else {
            break;
          }
        }
        for (let i = 0; i < discardedCount; i++) {
          this.drawEventCard(local, activePrivate);
        }
        activePlayer.handCount = activePrivate.cards.length;
        this.addLog(state, `🧠 «Забывчивость»! ${activePlayer.name} сбросил ${discardedCount} карт и обновил руку из колоды. Ход завершен!`, 'PANIC');
        state.lastUpdated = Date.now();
        await this.saveAndSync(roomId, local, [currentId]);
        await this.endTurn(local, roomId);
        return;
      } else if (drawnCard.code === 'PANIC_BLIND_DATE') {
        const newCard = this.drawEventCard(local, activePrivate);
        if (!newCard) {
          this.addLog(state, `🙈 «Свидание вслепую»! Но в колоде не осталось карт событий. Ход завершен.`, 'PANIC');
          await this.endTurn(local, roomId);
          return;
        }

        activePlayer.handCount = activePrivate.cards.length;

        if (activePlayer.isBot) {
          const swapIdx = activePrivate.cards.findIndex(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || activePrivate.role !== 'INFECTED' || activePrivate.cards.filter(x => x.code === 'INFECTION').length > 1));
          if (swapIdx !== -1) {
            const discarded = activePrivate.cards.splice(swapIdx, 1)[0];
            state.discardPile.unshift(discarded);
            activePlayer.handCount = activePrivate.cards.length;
            this.addLog(state, `🙈 «Свидание вслепую»! ${activePlayer.name} тайно сменил карту из руки на карту из колоды. Ход завершен!`, 'PANIC');
          }
          await this.endTurn(local, roomId);
          return;
        } else {
          const discardableCards = activePrivate.cards.filter(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || activePrivate.role !== 'INFECTED' || activePrivate.cards.filter(x => x.code === 'INFECTION').length > 1));
          activePrivate.pendingChoice = {
            type: 'BLIND_DATE_DISCARD',
            title: 'Паника: Свидание вслепую!',
            description: `Вы взяли верхнюю карту «${newCard.name}» из колоды (теперь у вас 5 карт). Выберите, какую карту сбросить из руки в отбой взамен, чтобы на руке осталось ровно 4 карты. После сброса ваш ход завершится.`,
            availableCards: discardableCards.length > 0 ? discardableCards : activePrivate.cards,
          };
          this.addLog(state, `🙈 «Свидание вслепую»! ${activePlayer.name} взял верхнюю карту из колоды и выбирает, какую карту сбросить взамен...`, 'PANIC');
          this.addPrivateLog(local, currentId, `Вы вытянули «Свидание вслепую»! Из колоды получена карта «${newCard.name}» (всего 5 карт в руке). Выберите 1 карту для сброса в отбой.`, 'PANIC');
          state.lastUpdated = Date.now();
          await this.saveAndSync(roomId, local, [currentId]);
          return;
        }
      } else if (drawnCard.code === 'PANIC_CHAIN_REACTION') {
        await this.initiateChainReaction(local, roomId, currentId);
        return;
      } else if (drawnCard.code === 'CHANGE_DIRECTION') {
        state.direction = state.direction === 1 ? -1 : 1;
        this.addLog(state, `Направление хода изменилось: теперь ${state.direction === 1 ? 'по часовой стрелке ↻' : 'против часовой стрелки ↺'}.`, 'PANIC');
      } else if (drawnCard.code === 'BLIND_FAITH') {
        this.addLog(state, `Слепое доверие заставляет всех быть настороже.`, 'PANIC');
      }

      // После применения эффекта карты паники (не завершающей ход) фаза действия считается сыгранной самой паникой.
      // На руке ровно 4 карты, игрок сразу переходит к фазе обмена!
      state.lastUpdated = Date.now();
      await this.saveAndSync(roomId, local);
      await this.advanceToExchange(local, roomId);
      return;
    }

    // Обычная карта добавляется в руку
    activePrivate.cards.push(drawnCard);
    activePlayer.handCount = activePrivate.cards.length;
    this.addPrivateLog(local, currentId, `📥 Вы взяли из колоды карту «${drawnCard.name}» (${drawnCard.category === 'ACTION' ? 'Действие' : drawnCard.category === 'DEFENSE' ? 'Защита' : drawnCard.category === 'OBSTACLE' ? 'Препятствие' : 'Заражение'}).`, 'INFO');
    state.phase = 'ACTION';
    state.lastUpdated = Date.now();

    await this.saveAndSync(roomId, local, [currentId]);

    if (activePlayer.isBot) {
      this.scheduleBotAction(() => this.runBotTurn(roomId), 1200, `bot_turn_${currentId}`);
    }
  }

  // 7. Розыгрыш карты (Action Phase)
  public async playCard(
    roomId: string, 
    playerId: string, 
    cardId: string, 
    targetPlayerId?: string, 
    selectedDoorIndex?: number
  ): Promise<{ success: boolean; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return { success: false, error: 'Комната не найдена.' };

    const state = local.publicState;
    if (state.currentTurnPlayerId !== playerId) return { success: false, error: 'Сейчас не ваш ход.' };
    if (state.phase !== 'ACTION') return { success: false, error: 'Сейчас нельзя разыгрывать карты.' };

    const activePlayer = state.players.find(p => p.id === playerId);
    let activePrivate: PlayerPrivate | null | undefined = local.privateStates[playerId];
    if (!activePrivate) {
      activePrivate = await this.getPlayerPrivate(roomId, playerId);
      if (activePrivate) local.privateStates[playerId] = activePrivate;
    }
    if (!activePlayer || !activePrivate) return { success: false, error: 'Игрок не найден.' };

    const cardIndex = activePrivate.cards.findIndex(c => c.id === cardId || c.code === cardId || c.id.startsWith(cardId));
    if (cardIndex === -1) return { success: false, error: 'Карта отсутствует в руке.' };
    const card = activePrivate.cards[cardIndex];

    const targetPlayer = targetPlayerId ? state.players.find(p => p.id === targetPlayerId) || null : null;

    const validation = validatePlayCard(card, activePlayer, activePrivate, targetPlayer, state, selectedDoorIndex);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    activePrivate.cards.splice(cardIndex, 1);
    activePlayer.handCount = activePrivate.cards.length;
    state.discardPile.unshift(card);
    this.addPrivateLog(local, playerId, `🚀 Вы сыграли карту «${card.name}»${targetPlayer ? ` на ${targetPlayer.name}` : ''}.`, 'INFO');

    switch (card.code) {
      case 'FLAMETHROWER': {
        if (!targetPlayer) break;
        this.addLog(state, `🔥 ${activePlayer.name} направляет ОГНЕМЁТ на ${targetPlayer.name}!`, 'ATTACK');
        
        state.pendingDefense = {
          sourcePlayerId: playerId,
          targetPlayerId: targetPlayer.id,
          actionCard: card,
          actionType: 'ATTACK',
          expiresAt: Date.now() + 15000,
          allowedDefenseCodes: ['NO_BARBECUE'],
        };
        state.phase = 'DEFENSE_WAIT';
        
        if (targetPlayer.isBot) {
          this.scheduleBotAction(() => this.runBotDefense(roomId), 1500);
        }
        break;
      }

      case 'AXE': {
        if (selectedDoorIndex !== undefined && selectedDoorIndex >= 0 && state.doors[selectedDoorIndex]) {
          state.doors.splice(selectedDoorIndex, 1);
          this.addLog(state, `🪓 ${activePlayer.name} срубил заколоченную дверь топором!`, 'INFO');
        } else if (targetPlayer && targetPlayer.quarantineTurns > 0) {
          targetPlayer.quarantineTurns = 0;
          this.addLog(state, `🪓 ${activePlayer.name} разрушил карантин игрока ${targetPlayer.name}.`, 'INFO');
        }
        await this.advanceToExchange(local, roomId);
        break;
      }

      case 'BARRED_DOOR': {
        if (targetPlayer) {
          state.doors.push({
            seatA: activePlayer.seatIndex,
            seatB: targetPlayer.seatIndex,
            playerAId: playerId,
            playerBId: targetPlayer.id,
          });
          this.addLog(state, `🚪 ${activePlayer.name} наглухо заколотил проход к ${targetPlayer.name}!`, 'WARNING');
        }
        await this.advanceToExchange(local, roomId);
        break;
      }

      case 'QUARANTINE': {
        if (targetPlayer) {
          targetPlayer.quarantineTurns = 2;
          this.addLog(state, `☣️ ${targetPlayer.name} отправлен в КАРАНТИН на 2 хода!`, 'WARNING');
        }
        await this.advanceToExchange(local, roomId);
        break;
      }

      case 'LOOK_AROUND': {
        state.direction = state.direction === 1 ? -1 : 1;
        this.addLog(state, `👀 ${activePlayer.name} сыграл «Гляди по сторонам»! Очередность хода и направление обмена меняются: теперь ${state.direction === 1 ? 'по часовой стрелке ↻' : 'против часовой стрелки ↺'}.`, 'INFO');
        await this.advanceToExchange(local, roomId);
        break;
      }

      case 'ANALYSIS': {
        if (targetPlayer) {
          let targetCards = local.privateStates[targetPlayer.id]?.cards;
          if (!targetCards || targetCards.length === 0) {
            const priv = await this.getPlayerPrivate(roomId, targetPlayer.id);
            if (priv) {
              local.privateStates[targetPlayer.id] = priv;
              targetCards = priv.cards;
            }
          }
          state.revealedCards = {
            fromPlayerId: targetPlayer.id,
            targetPlayerId: playerId,
            cards: targetCards || [],
            title: `Анализ крови: карты игрока ${targetPlayer.name}`,
          };
          this.addLog(state, `🔬 ${activePlayer.name} провёл анализ крови у ${targetPlayer.name}.`, 'INFO');
          this.addPrivateLog(local, playerId, `🔬 Анализ крови показал карты ${targetPlayer.name}: ${(targetCards || []).map(c => `«${c.name}»`).join(', ')}.`, 'INFO');
          this.addPrivateLog(local, targetPlayer.id, `🔬 ${activePlayer.name} провёл у вас анализ крови и просмотрел все ваши карты!`, 'WARNING');
        }
        await this.advanceToExchange(local, roomId);
        break;
      }

      case 'SUSPICION': {
        if (targetPlayer) {
          let targetCards = local.privateStates[targetPlayer.id]?.cards;
          if (!targetCards || targetCards.length === 0) {
            const priv = await this.getPlayerPrivate(roomId, targetPlayer.id);
            if (priv) {
              local.privateStates[targetPlayer.id] = priv;
              targetCards = priv.cards;
            }
          }
          const cardsList = targetCards || [];
          let randomCard: GameCard | null = null;
          if (cardsList.length > 0) {
            randomCard = cardsList[Math.floor(Math.random() * cardsList.length)];
            state.revealedCards = {
              fromPlayerId: targetPlayer.id,
              targetPlayerId: playerId,
              cards: [randomCard],
              title: `Подозрение: случайная карта ${targetPlayer.name}`,
            };
          }
          this.addLog(state, `👁️ ${activePlayer.name} обыскал карманы ${targetPlayer.name}.`, 'INFO');
          if (randomCard) {
            this.addPrivateLog(local, playerId, `👁️ Подозрение: вы вытащили и посмотрели случайную карту «${randomCard.name}» у игрока ${targetPlayer.name}.`, 'INFO');
            this.addPrivateLog(local, targetPlayer.id, `👁️ ${activePlayer.name} вытащил и посмотрел вашу случайную карту «${randomCard.name}» (карта возвращена вам).`, 'WARNING');
          }
        }
        await this.advanceToExchange(local, roomId);
        break;
      }

      case 'WHISKEY': {
        state.revealedCards = {
          fromPlayerId: playerId,
          cards: activePrivate.cards,
          title: `Виски: ${activePlayer.name} показывает свои карты всем!`,
        };
        this.addLog(state, `🥃 ${activePlayer.name} выпил виски и раскрыл все свои карты для проверки чистоты!`, 'INFO');
        this.addPrivateLog(local, playerId, `🥃 Вы выпили виски и раскрыли все свои карты (${activePrivate.cards.map(c => `«${c.name}»`).join(', ')}) всем игрокам за столом.`, 'INFO');
        await this.advanceToExchange(local, roomId);
        break;
      }

      case 'SWITCH_PLACES':
      case 'GET_OUT_OF_HERE': {
        if (!targetPlayer) break;
        let targetPrivate: PlayerPrivate | null = local.privateStates[targetPlayer.id] || null;
        if (!targetPrivate) {
          targetPrivate = await this.getPlayerPrivate(roomId, targetPlayer.id);
          if (targetPrivate) local.privateStates[targetPlayer.id] = targetPrivate;
        }

        const hasDefense = targetPrivate?.cards.some(c => c.code === 'IM_FINE_HERE');
        if (hasDefense) {
          state.pendingDefense = {
            sourcePlayerId: playerId,
            targetPlayerId: targetPlayer.id,
            actionCard: card,
            actionType: 'SWITCH_PLACES',
            expiresAt: Date.now() + 15000,
            allowedDefenseCodes: ['IM_FINE_HERE'],
          };
          state.phase = 'DEFENSE_WAIT';
          this.addLog(state, `🔄 ${activePlayer.name} пытается поменяться местами с ${targetPlayer.name}... У цели есть шанс защититься!`, 'DEFENSE');
          if (targetPlayer.isBot) {
            this.scheduleBotAction(() => this.runBotDefense(roomId), 1500);
          }
          break;
        }

        const tempSeat = activePlayer.seatIndex;
        activePlayer.seatIndex = targetPlayer.seatIndex;
        targetPlayer.seatIndex = tempSeat;
        this.addLog(state, `🔄 ${activePlayer.name} и ${targetPlayer.name} поменялись местами за столом!`, 'INFO');
        await this.advanceToExchange(local, roomId);
        break;
      }

      case 'SEDUCTION': {
        if (targetPlayer) {
          this.addLog(state, `🤝 ${activePlayer.name} применил «Соблазн» к ${targetPlayer.name}, требуя внеочередного обмена!`, 'EXCHANGE');
          state.phase = 'EXCHANGE_OFFER';
          local.forcedExchangeTargetId = targetPlayer.id;
        }
        break;
      }

      case 'PERSEVERANCE': {
        const eventCards: GameCard[] = [];
        let safety = 0;
        while (eventCards.length < 3 && safety++ < 60) {
          if (!local.fullDrawDeck || local.fullDrawDeck.length === 0) {
            if (state.discardPile.length > 0) {
              local.fullDrawDeck = [...state.discardPile].sort(() => Math.random() - 0.5);
              state.discardPile = [];
              this.addLog(state, `Колода пополнена из стопки сброса для поиска снабжения.`);
              this.syncDeckState(local);
            } else {
              break;
            }
          }
          const topCard = local.fullDrawDeck!.shift()!;
          this.syncDeckState(local);
          if (topCard.category === 'PANIC') {
            state.discardPile.unshift(topCard);
            this.addLog(state, `При обыске полярник ${activePlayer.name} наткнулся на карту паники «${topCard.name}» — она сброшена!`, 'PANIC');
            this.addPrivateLog(local, playerId, `При розыгрыше «Упорства» в ящиках обнаружена карта паники «${topCard.name}» — отправлена в сброс.`, 'PANIC');
          } else {
            eventCards.push(topCard);
          }
        }

        if (eventCards.length === 0) {
          this.addLog(state, `В ящиках снабжения ничего не найдено!`);
          await this.advanceToExchange(local, roomId);
          break;
        }

        this.addLog(state, `📦 ${activePlayer.name} тщательно обыскивает станцию с картой «Упорство»...`, 'INFO');

        if (activePlayer.isBot) {
          const chosen = eventCards[0];
          const toDiscard = eventCards.slice(1);
          state.discardPile.unshift(...toDiscard);
          activePrivate.cards.push(chosen);
          const excessIdx = activePrivate.cards.findIndex(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || activePrivate.role !== 'INFECTED' || activePrivate.cards.filter(x => x.code === 'INFECTION').length > 1));
          if (excessIdx !== -1) {
            const discarded = activePrivate.cards.splice(excessIdx, 1)[0];
            state.discardPile.unshift(discarded);
          }
          activePlayer.handCount = activePrivate.cards.length;
          await this.advanceToExchange(local, roomId);
        } else {
          this.addPrivateLog(local, playerId, `Вы нашли 3 карты снабжения: ${eventCards.map(c => `«${c.name}»`).join(', ')}. Выберите 1 для добавления в руку!`, 'INFO');
          activePrivate.pendingChoice = {
            type: 'PERSEVERANCE_PICK',
            title: 'Упорство: Выберите 1 карту в руку',
            description: 'Вы нашли 3 карты событий. Выберите 1 карту, которую оставите себе в руку. Остальные 2 карты будут сброшены.',
            availableCards: eventCards,
          };
        }
        break;
      }

      default:
        await this.advanceToExchange(local, roomId);
        break;
    }

    state.lastUpdated = Date.now();
    const affected = targetPlayerId ? [playerId, targetPlayerId] : [playerId];
    await this.saveAndSync(roomId, local, affected);
    return { success: true };
  }

  // 8. Сброс карты
  public async discardCard(roomId: string, playerId: string, cardId: string): Promise<{ success: boolean; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return { success: false, error: 'Комната не найдена.' };

    const state = local.publicState;
    if (state.currentTurnPlayerId !== playerId || state.phase !== 'ACTION') {
      return { success: false, error: 'Сейчас нельзя сбрасывать карту.' };
    }

    const activePlayer = state.players.find(p => p.id === playerId);
    let activePrivate: PlayerPrivate | null | undefined = local.privateStates[playerId];
    if (!activePrivate) {
      activePrivate = await this.getPlayerPrivate(roomId, playerId);
      if (activePrivate) local.privateStates[playerId] = activePrivate;
    }
    if (!activePlayer || !activePrivate) return { success: false, error: 'Игрок не найден.' };

    const cardIndex = activePrivate.cards.findIndex(c => c.id === cardId || c.code === cardId || c.id.startsWith(cardId));
    if (cardIndex === -1) return { success: false, error: 'Карта не найдена.' };

    const card = activePrivate.cards[cardIndex];
    const validation = validateDiscardCard(card, activePrivate);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    activePrivate.cards.splice(cardIndex, 1);
    activePlayer.handCount = activePrivate.cards.length;
    state.discardPile.unshift(card);

    this.addLog(state, `${activePlayer.name} сбросил карту в стопку сброса в темноте.`);
    this.addPrivateLog(local, playerId, `🗑️ Вы сбросили карту «${card.name}» в стопку сброса.`, 'INFO');
    await this.advanceToExchange(local, roomId);

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [playerId]);
    return { success: true };
  }

  // Переход к фазе обмена
  private async advanceToExchange(local: LocalGameState, roomId: string): Promise<void> {
    const state = local.publicState;
    const currentId = state.currentTurnPlayerId;
    const activePlayer = state.players.find(p => p.id === currentId);

    if (activePlayer && activePlayer.quarantineTurns > 0) {
      this.addLog(state, `${activePlayer.name} находится в карантине и пропускает обмен картами.`);
      await this.endTurn(local, roomId);
      return;
    }

    const forcedTargetId = local.forcedExchangeTargetId;
    let targetNeighbor: PlayerPublic | null = null;
    let isBlocked = false;

    if (forcedTargetId) {
      targetNeighbor = state.players.find(p => p.id === forcedTargetId) || null;
    } else {
      const neighbors = getPlayerNeighbors(state.players, currentId, state.direction, state.doors);
      targetNeighbor = neighbors.targetNeighbor;
      isBlocked = neighbors.isBlockedByDoor;
    }

    if (!targetNeighbor || targetNeighbor.isDead) {
      await this.endTurn(local, roomId);
      return;
    }

    if (isBlocked) {
      this.addLog(state, `🚪 Обмен картами заблокирован заколоченной дверью! Ход завершен.`, 'INFO');
      await this.endTurn(local, roomId);
      return;
    }

    if (targetNeighbor.quarantineTurns > 0) {
      this.addLog(state, `☣️ Сосед находится в карантине. Обмен невозможен.`);
      await this.endTurn(local, roomId);
      return;
    }

    state.phase = 'EXCHANGE_OFFER';
    this.addLog(state, `Фаза обмена: ${activePlayer?.name} должен выбрать карту для передачи ${targetNeighbor.name}.`, 'EXCHANGE');

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local);

    if (activePlayer?.isBot) {
      this.scheduleBotAction(() => this.runBotExchangeOffer(roomId), 1200, `bot_offer_${currentId}`);
    }
  }

  // 9. Предложение карты для обмена
  public async offerExchangeCard(roomId: string, playerId: string, cardId: string): Promise<{ success: boolean; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return { success: false, error: 'Комната не найдена.' };

    const state = local.publicState;
    if (state.currentTurnPlayerId !== playerId || state.phase !== 'EXCHANGE_OFFER') {
      return { success: false, error: 'Сейчас нельзя предложить обмен.' };
    }

    const activePlayer = state.players.find(p => p.id === playerId);
    const activePrivate = local.privateStates[playerId];
    const card = activePrivate?.cards.find(c => c.id === cardId || c.code === cardId || c.id.startsWith(cardId));
    if (!card) return { success: false, error: 'Карта не найдена.' };

    const validation = validateExchangeCard(card, activePrivate);
    if (!validation.valid) return { success: false, error: validation.error };

    const forcedTargetId = local.forcedExchangeTargetId;
    let targetNeighbor: PlayerPublic | null = null;
    if (forcedTargetId) {
      targetNeighbor = state.players.find(p => p.id === forcedTargetId) || null;
      delete local.forcedExchangeTargetId;
    } else {
      const neighbors = getPlayerNeighbors(state.players, playerId, state.direction, state.doors);
      targetNeighbor = neighbors.targetNeighbor;
    }

    if (!targetNeighbor) return { success: false, error: 'Нет доступного соседа для обмена.' };

    local.offeredExchangeCard = {
      fromPlayerId: playerId,
      targetPlayerId: targetNeighbor.id,
      card,
    };

    let targetPrivate: PlayerPrivate | null | undefined = local.privateStates[targetNeighbor.id];
    if (!targetPrivate) {
      targetPrivate = await this.getPlayerPrivate(roomId, targetNeighbor.id);
      if (targetPrivate) local.privateStates[targetNeighbor.id] = targetPrivate;
    }
    const hasDefense = targetPrivate?.cards.some(c => c.code === 'NO_THANKS' || c.code === 'FEAR' || c.code === 'MISSED');

    if (hasDefense) {
      state.pendingDefense = {
        sourcePlayerId: playerId,
        targetPlayerId: targetNeighbor.id,
        actionCard: card,
        actionType: 'EXCHANGE',
        expiresAt: Date.now() + 15000,
        allowedDefenseCodes: ['NO_THANKS', 'FEAR', 'MISSED'],
        offeredCard: card,
      };
      state.phase = 'EXCHANGE_DEFENSE_WAIT';
      this.addLog(state, `В темноте передается карта... У ${targetNeighbor.name} есть шанс защититься!`, 'EXCHANGE');
      this.addPrivateLog(local, playerId, `🤝 Вы предложили карту «${card.name}» игроку ${targetNeighbor.name}. Ожидание его реакции/защиты...`, 'EXCHANGE');
      this.addPrivateLog(local, targetNeighbor.id, `🤝 ${activePlayer?.name} передаёт вам карту для обмена... У вас есть шанс сыграть карту защиты!`, 'EXCHANGE');

      if (targetNeighbor.isBot) {
        this.scheduleBotAction(() => this.runBotDefense(roomId), 1500);
      }
    } else {
      state.phase = 'EXCHANGE_RESPOND';
      this.addLog(state, `${targetNeighbor.name} должен выбрать карту для ответного обмена.`, 'EXCHANGE');
      this.addPrivateLog(local, playerId, `🤝 Вы предложили карту «${card.name}» для обмена игроку ${targetNeighbor.name}.`, 'EXCHANGE');
      this.addPrivateLog(local, targetNeighbor.id, `🤝 ${activePlayer?.name} протягивает вам карту для обмена. Выберите карту из руки в ответ.`, 'EXCHANGE');

      if (targetNeighbor.isBot) {
        this.scheduleBotAction(() => this.runBotExchangeResponse(roomId), 1500);
      }
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [playerId, targetNeighbor.id]);
    return { success: true };
  }

  // 10. Ответ на обмен
  public async respondExchange(roomId: string, targetPlayerId: string, cardId: string): Promise<{ success: boolean; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return { success: false, error: 'Комната не найдена.' };

    const state = local.publicState;
    if (state.phase !== 'EXCHANGE_RESPOND' && state.phase !== 'EXCHANGE_DEFENSE_WAIT') {
      return { success: false, error: 'Сейчас не фаза ответа на обмен.' };
    }

    const offer = local.offeredExchangeCard;
    if (!offer || offer.targetPlayerId !== targetPlayerId) {
      return { success: false, error: 'Предложение обмена не адресовано вам.' };
    }

    // Получаем приватные состояния игроков: из локальной памяти, если есть, или из базы если отсутствуют
    if (!local.privateStates[targetPlayerId]) {
      await this.getPlayerPrivate(roomId, targetPlayerId);
    }
    if (!local.privateStates[offer.fromPlayerId]) {
      await this.getPlayerPrivate(roomId, offer.fromPlayerId);
    }

    const targetPrivate = local.privateStates[targetPlayerId];
    const sourcePrivate = local.privateStates[offer.fromPlayerId];
    if (!targetPrivate || !sourcePrivate) return { success: false, error: 'Данные игроков не найдены.' };

    let cardIndex = targetPrivate.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      cardIndex = targetPrivate.cards.findIndex(c => c.code === cardId);
    }
    if (cardIndex === -1) return { success: false, error: 'Карта не найдена в руке.' };
    const targetCard = targetPrivate.cards[cardIndex];

    const validation = validateExchangeCard(targetCard, targetPrivate);
    if (!validation.valid) return { success: false, error: validation.error };

    // Находим отдаваемую инициатором карту в руке инициатора
    let sourceCardIndex = sourcePrivate.cards.findIndex(c => c.id === offer.card.id);
    if (sourceCardIndex === -1) {
      sourceCardIndex = sourcePrivate.cards.findIndex(c => c.code === offer.card.code);
    }
    let actualOfferedCard = offer.card;
    if (sourceCardIndex !== -1) {
      actualOfferedCard = sourcePrivate.cards.splice(sourceCardIndex, 1)[0];
    } else if (sourcePrivate.cards.length > 0) {
      // Защита от рассинхронизации: берем подходящую карту
      const safeIdx = sourcePrivate.cards.findIndex(c => c.code !== 'THE_THING');
      actualOfferedCard = sourcePrivate.cards.splice(safeIdx !== -1 ? safeIdx : 0, 1)[0];
    }
    targetPrivate.cards.splice(cardIndex, 1);

    // Добавляем карты в руки
    sourcePrivate.cards.push(targetCard);
    targetPrivate.cards.push(actualOfferedCard);

    // Строго синхронизируем handCount обоих участников
    const sourcePlayer = state.players.find(p => p.id === offer.fromPlayerId);
    const targetPlayer = state.players.find(p => p.id === targetPlayerId);
    if (sourcePlayer) sourcePlayer.handCount = sourcePrivate.cards.length;
    if (targetPlayer) targetPlayer.handCount = targetPrivate.cards.length;

    // Механика заражения при обмене: по официальным правилам ТОЛЬКО Нечто может заражать людей
    if (actualOfferedCard.code === 'INFECTION' && sourcePrivate.role === 'THE_THING') {
      if (targetPrivate.role === 'HUMAN') {
        targetPrivate.role = 'INFECTED';
        targetPrivate.infectedBy = offer.fromPlayerId;
        this.addPrivateLog(local, targetPlayerId, `☣️ ВАС ЗАРАЗИЛИ: Вы получили карту «Заражение» от Нечто! Теперь вы на стороне Нечто. Помогите Нечто победить людей!`, 'WARNING');
        this.addPrivateLog(local, offer.fromPlayerId, `☣️ УСПЕХ: Вы успешно заразили игрока ${targetPlayer?.name}! Теперь он ваш тайный союзник.`, 'WARNING');
      }
    }
    if (targetCard.code === 'INFECTION' && targetPrivate.role === 'THE_THING') {
      if (sourcePrivate.role === 'HUMAN') {
        sourcePrivate.role = 'INFECTED';
        sourcePrivate.infectedBy = targetPlayerId;
        this.addPrivateLog(local, offer.fromPlayerId, `☣️ ВАС ЗАРАЗИЛИ: Вы получили карту «Заражение» от Нечто! Теперь вы на стороне Нечто. Помогите Нечто победить людей!`, 'WARNING');
        this.addPrivateLog(local, targetPlayerId, `☣️ УСПЕХ: Вы успешно заразили игрока ${sourcePlayer?.name}! Теперь он ваш тайный союзник.`, 'WARNING');
      }
    }

    this.addLog(state, `🤝 ${sourcePlayer?.name} и ${targetPlayer?.name} тайно обменялись картами под столом.`, 'EXCHANGE');
    this.addPrivateLog(local, offer.fromPlayerId, `🤝 Вы передали карту «${actualOfferedCard.name}» и получили «${targetCard.name}» от ${targetPlayer?.name}.`, 'EXCHANGE');
    this.addPrivateLog(local, targetPlayerId, `🤝 Вы передали карту «${targetCard.name}» и получили «${actualOfferedCard.name}» от ${sourcePlayer?.name}.`, 'EXCHANGE');

    local.offeredExchangeCard = undefined;
    state.pendingDefense = null;
    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [offer.fromPlayerId, targetPlayerId]);

    const allPrivates = await this.getAllPlayerPrivates(roomId, state.players);
    const winCheck = evaluateWinConditions(state.players, allPrivates);
    if (winCheck.gameOver) {
      state.status = 'GAME_OVER';
      state.winner = winCheck.winner;
      state.winningRoleReason = winCheck.reason;
      const roles: Record<string, Role> = {};
      for (const p of state.players) {
        roles[p.id] = allPrivates[p.id]?.role || 'HUMAN';
      }
      state.finalRoles = roles;
      this.addLog(state, `🏆 ИГРА ОКОНЧЕНА! ${winCheck.reason}`, 'WARNING');
      await this.saveAndSync(roomId, local);
    } else {
      await this.endTurn(local, roomId);
    }

    return { success: true };
  }

  // 11. Защита
  public async respondDefense(roomId: string, defenderId: string, defenseCardId: string | null): Promise<{ success: boolean; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return { success: false, error: 'Комната не найдена.' };

    const state = local.publicState;
    const defense = state.pendingDefense;
    if (!defense || defense.targetPlayerId !== defenderId) {
      return { success: false, error: 'Нет активного запроса на защиту.' };
    }

    const defenderPrivate = local.privateStates[defenderId];
    const defenderPlayer = state.players.find(p => p.id === defenderId);
    if (!defenderPlayer || !defenderPrivate) return { success: false, error: 'Игрок не найден.' };

    if (defenseCardId) {
      const cardIdx = defenderPrivate.cards.findIndex(c => c.id === defenseCardId || c.code === defenseCardId || c.id.startsWith(defenseCardId));
      if (cardIdx === -1) return { success: false, error: 'Карта защиты отсутствует.' };
      const card = defenderPrivate.cards[cardIdx];

      if (!defense.allowedDefenseCodes.includes(card.code)) {
        return { success: false, error: 'Эта карта не подходит для защиты от данного эффекта.' };
      }

      defenderPrivate.cards.splice(cardIdx, 1);
      defenderPlayer.handCount = defenderPrivate.cards.length;
      state.discardPile.unshift(card);

      if (card.code === 'NO_BARBECUE') {
        this.addLog(state, `🛡️ ${defenderPlayer.name} сыграл «НИКАКОГО ШАШЛЫКА!» и спасся от огнемёта!`, 'DEFENSE');
        this.drawReplacementCardForDefender(local, defenderId);
        state.pendingDefense = null;
        await this.advanceToExchange(local, roomId);
      } else if (card.code === 'MISSED') {
        if (defense.actionType === 'ATTACK') {
          this.addLog(state, `🛡️ ${defenderPlayer.name} сыграл «МИМО!» и уклонился от огнемёта!`, 'DEFENSE');
          this.drawReplacementCardForDefender(local, defenderId);
          state.pendingDefense = null;
          await this.advanceToExchange(local, roomId);
        } else if (defense.actionType === 'EXCHANGE') {
          this.addLog(state, `↪️ ${defenderPlayer.name} сыграл «МИМО!» — обмен передается следующему игроку!`, 'DEFENSE');
          this.drawReplacementCardForDefender(local, defenderId);
          state.pendingDefense = null;

          const living = getLivingPlayers(state.players);
          const defIdx = living.findIndex(p => p.id === defenderId);
          const nextIdx = (defIdx + (state.direction === 1 ? 1 : -1) + living.length) % living.length;
          const redirectTarget = living[nextIdx];

          if (redirectTarget && redirectTarget.id !== defense.sourcePlayerId && !redirectTarget.isDead && redirectTarget.quarantineTurns === 0) {
            await this.forwardExchangeOffer(local, roomId, defense.sourcePlayerId, redirectTarget.id, defense.offeredCard || defense.actionCard);
          } else {
            this.addLog(state, `Обмен картами завершен.`);
            local.offeredExchangeCard = undefined;
            await this.endTurn(local, roomId);
          }
        }
      } else if (card.code === 'NO_THANKS') {
        this.addLog(state, `🙅‍♂️ ${defenderPlayer.name} ответил «НЕТ, СПАСИБО!» и отказался от обмена.`, 'DEFENSE');
        this.drawReplacementCardForDefender(local, defenderId);
        state.pendingDefense = null;
        local.offeredExchangeCard = undefined;
        await this.endTurn(local, roomId);
      } else if (card.code === 'FEAR') {
        this.addLog(state, `😱 ${defenderPlayer.name} сыграл «СТРАХ»! Обмен отменен, а предложенная карта раскрыта!`, 'DEFENSE');
        this.drawReplacementCardForDefender(local, defenderId);
        if (defense.offeredCard) {
          state.revealedCards = {
            fromPlayerId: defense.sourcePlayerId,
            targetPlayerId: defenderId,
            cards: [defense.offeredCard],
            title: `Карта, которую пытались вам передать`,
          };
          this.addPrivateLog(local, defenderId, `😱 Вы сыграли «СТРАХ»! Обмен отменен. Раскрыта предложенная карта: «${defense.offeredCard.name}».`, 'DEFENSE');
          this.addPrivateLog(local, defense.sourcePlayerId, `😱 ${defenderPlayer.name} сыграл «СТРАХ» и отклонил обмен, подсмотрев вашу карту «${defense.offeredCard.name}»!`, 'DEFENSE');
        }
        state.pendingDefense = null;
        local.offeredExchangeCard = undefined;
        await this.endTurn(local, roomId);
      } else if (card.code === 'IM_FINE_HERE') {
        this.addLog(state, `🛡️ ${defenderPlayer.name} сыграл «МНЕ И ЗДЕСЬ НЕПЛОХО»! Смена мест отменена.`, 'DEFENSE');
        this.drawReplacementCardForDefender(local, defenderId);
        state.pendingDefense = null;
        await this.advanceToExchange(local, roomId);
      }
    } else {
      if (defense.actionType === 'ATTACK' && defense.actionCard.code === 'FLAMETHROWER') {
        defenderPlayer.isDead = true;
        this.addLog(state, `💀 ${defenderPlayer.name} сгорел в пламени огнемёта и выбывает из игры!`, 'DEATH');

        state.discardPile.push(...defenderPrivate.cards);
        defenderPrivate.cards = [];
        defenderPlayer.handCount = 0;

        if (defenderPrivate.role === 'THE_THING') {
          this.addLog(state, `💥 ИСПЫТАНИЕ ЗАВЕРШЕНО! ${defenderPlayer.name} был НЕЧТО!`, 'WARNING');
        }

        state.pendingDefense = null;
        state.lastUpdated = Date.now();
        await this.saveAndSync(roomId, local, [defenderId, defense.sourcePlayerId]);

        const allPrivates = await this.getAllPlayerPrivates(roomId, state.players);
        const winCheck = evaluateWinConditions(state.players, allPrivates);
        if (winCheck.gameOver) {
          state.status = 'GAME_OVER';
          state.winner = winCheck.winner;
          state.winningRoleReason = winCheck.reason;
          const roles: Record<string, Role> = {};
          for (const p of state.players) {
            roles[p.id] = allPrivates[p.id]?.role || 'HUMAN';
          }
          state.finalRoles = roles;
          this.addLog(state, `🏆 ${winCheck.reason}`, 'WARNING');
          await this.saveAndSync(roomId, local);
        } else {
          this.addPrivateLog(local, defenderId, `💀 ВАС СОЖГЛИ: Вы погибли в пламени огнемёта и выбыли из игры!`, 'DEATH');
          this.addPrivateLog(local, defense.sourcePlayerId, `🔥 Ваш огнемёт успешно испепелил ${defenderPlayer.name}! Переход к фазе обмена.`, 'ATTACK');
          await this.advanceToExchange(local, roomId);
        }
      } else if (defense.actionType === 'EXCHANGE') {
        state.phase = 'EXCHANGE_RESPOND';
        state.pendingDefense = null;
        this.addLog(state, `${defenderPlayer.name} соглашается на обмен и выбирает карту.`, 'EXCHANGE');

        if (defenderPlayer.isBot) {
          this.scheduleBotAction(() => this.runBotExchangeResponse(roomId), 1200, `bot_resp_${defenderPlayer.id}`);
        }
      } else if (defense.actionType === 'SWITCH_PLACES') {
        const sourcePlayer = state.players.find(p => p.id === defense.sourcePlayerId);
        if (sourcePlayer && defenderPlayer) {
          const tempSeat = sourcePlayer.seatIndex;
          sourcePlayer.seatIndex = defenderPlayer.seatIndex;
          defenderPlayer.seatIndex = tempSeat;
          this.addLog(state, `🔄 ${sourcePlayer.name} и ${defenderPlayer.name} поменялись местами за столом!`, 'INFO');
        }
        state.pendingDefense = null;
        await this.advanceToExchange(local, roomId);
      }
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [defenderId, defense.sourcePlayerId]);
    return { success: true };
  }

  // Добор карты взамен сыгранной карты защиты (Официальные правила, стр. 12)
  private drawReplacementCardForDefender(local: LocalGameState, defenderId: string) {
    const state = local.publicState;
    const defenderPlayer = state.players.find(p => p.id === defenderId);
    const defenderPrivate = local.privateStates[defenderId];
    if (!defenderPlayer || !defenderPrivate) return;

    let safetyCounter = 0;
    while (safetyCounter++ < 20) {
      if (!local.fullDrawDeck || local.fullDrawDeck.length === 0) {
        if (state.discardPile.length > 0) {
          local.fullDrawDeck = [...state.discardPile].sort(() => Math.random() - 0.5);
          state.discardPile = [];
          this.addLog(state, `Колода пополнена из сброса для добора карты взамен защиты.`);
        } else {
          break;
        }
      }
      const drawn = local.fullDrawDeck.shift()!;
      state.deckCount = local.fullDrawDeck.length;

      // Если взята карта паники при доборе взамен защиты, она сбрасывается без эффекта (стр. 12 правил)
      if (drawn.category === 'PANIC') {
        state.discardPile.unshift(drawn);
        this.addLog(state, `⚠️ Карта паники «${drawn.name}», вытянутая взамен карты защиты, сброшена без эффекта.`);
        continue;
      }

      defenderPrivate.cards.push(drawn);
      defenderPlayer.handCount = defenderPrivate.cards.length;
      this.syncDeckState(local);
      this.addLog(state, `🎴 ${defenderPlayer.name} добрал 1 карту из колоды взамен сыгранной защиты.`);
      this.addPrivateLog(local, defenderId, `🎴 Вы добрали карту «${drawn.name}» взамен сыгранной защиты.`, 'DEFENSE');
      break;
    }
  }

  // Перенаправление обмена при розыгрыше «МИМО!» (Официальные правила, стр. 12)
  private async forwardExchangeOffer(local: LocalGameState, roomId: string, sourcePlayerId: string, targetPlayerId: string, card: GameCard): Promise<void> {
    const state = local.publicState;
    const targetPlayer = state.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      await this.endTurn(local, roomId);
      return;
    }

    local.offeredExchangeCard = {
      fromPlayerId: sourcePlayerId,
      targetPlayerId,
      card,
    };

    if (!local.privateStates[targetPlayerId]) {
      await this.getPlayerPrivate(roomId, targetPlayerId);
    }
    const targetPrivate: PlayerPrivate | null | undefined = local.privateStates[targetPlayerId];
    const hasDefense = targetPrivate?.cards.some(c => c.code === 'NO_THANKS' || c.code === 'FEAR' || c.code === 'MISSED');

    if (hasDefense) {
      state.pendingDefense = {
        sourcePlayerId,
        targetPlayerId,
        actionCard: card,
        actionType: 'EXCHANGE',
        expiresAt: Date.now() + 15000,
        allowedDefenseCodes: ['NO_THANKS', 'FEAR', 'MISSED'],
        offeredCard: card,
      };
      state.phase = 'EXCHANGE_DEFENSE_WAIT';
      this.addLog(state, `Обмен перенаправлен на ${targetPlayer.name}... Есть ли защита?`, 'EXCHANGE');
      if (targetPlayer.isBot) {
        this.scheduleBotAction(() => this.runBotDefense(roomId), 1500, `bot_def_${targetPlayer.id}`);
      }
    } else {
      state.phase = 'EXCHANGE_RESPOND';
      this.addLog(state, `${targetPlayer.name} должен выбрать карту для ответного обмена.`, 'EXCHANGE');
      if (targetPlayer.isBot) {
        this.scheduleBotAction(() => this.runBotExchangeResponse(roomId), 1500, `bot_resp_${targetPlayer.id}`);
      }
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [sourcePlayerId, targetPlayerId]);
  }

  // 12. Подтверждение выбора карты (Упорство / Свидание вслепую)
  public async confirmCardChoice(roomId: string, playerId: string, cardId: string): Promise<{ success: boolean; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return { success: false, error: 'Комната не найдена.' };

    const state = local.publicState;
    const activePlayer = state.players.find(p => p.id === playerId);
    let activePrivate: PlayerPrivate | null | undefined = local.privateStates[playerId];
    if (!activePrivate) {
      activePrivate = await this.getPlayerPrivate(roomId, playerId);
      if (activePrivate) local.privateStates[playerId] = activePrivate;
    }
    if (!activePlayer || !activePrivate) return { success: false, error: 'Игрок не найден.' };

    const choice = activePrivate.pendingChoice;
    if (!choice) return { success: false, error: 'Нет активного выбора карт.' };

    if (choice.type === 'PERSEVERANCE_PICK') {
      const card = choice.availableCards.find(c => c.id === cardId || c.code === cardId || c.id.startsWith(cardId));
      if (!card) return { success: false, error: 'Выбранная карта не найдена среди предложенных.' };

      // Добавляем выбранную карту в руку
      activePrivate.cards.push(card);
      activePlayer.handCount = activePrivate.cards.length;

      // Остальные 2 карты отправляем в сброс
      const unchosenCards = choice.availableCards.filter(c => c.id !== card.id);
      state.discardPile.unshift(...unchosenCards);

      this.addLog(state, `📦 ${activePlayer.name} выбрал 1 карту снабжения из ящика и сбросил остальные.`);
      this.addPrivateLog(local, playerId, `Вы выбрали карту «${card.name}» и добавили её в руку. Теперь у вас ${activePrivate.cards.length} карт. Выберите 1 карту из руки для сброса.`, 'INFO');

      // Переходим ко второму шагу «Упорства»: сброс 1 карты из руки
      const discardableCards = activePrivate.cards.filter(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || activePrivate.role !== 'INFECTED' || activePrivate.cards.filter(x => x.code === 'INFECTION').length > 1));

      activePrivate.pendingChoice = {
        type: 'PERSEVERANCE_DISCARD',
        title: 'Упорство: Сбросьте 1 карту',
        description: 'У вас на руке 5 карт. Выберите 1 карту из руки для сброса в отбой, чтобы на руке осталось ровно 4 карты перед обменом.',
        availableCards: discardableCards.length > 0 ? discardableCards : activePrivate.cards,
      };

      state.lastUpdated = Date.now();
      await this.saveAndSync(roomId, local, [playerId]);
      return { success: true };
    } else if (choice.type === 'PERSEVERANCE_DISCARD') {
      const cardIdx = activePrivate.cards.findIndex(c => c.id === cardId || c.code === cardId || c.id.startsWith(cardId));
      if (cardIdx === -1) return { success: false, error: 'Карта не найдена в руке.' };
      const card = activePrivate.cards[cardIdx];

      const validation = validateDiscardCard(card, activePrivate);
      if (!validation.valid) return { success: false, error: validation.error };

      activePrivate.cards.splice(cardIdx, 1);
      state.discardPile.unshift(card);
      activePlayer.handCount = activePrivate.cards.length;

      this.addLog(state, `${activePlayer.name} сбросил карту в отбой после розыгрыша «Упорства».`);
      this.addPrivateLog(local, playerId, `Вы сбросили карту «${card.name}» в отбой. На руке 4 карты. Переход к фазе обмена.`, 'INFO');

      activePrivate.pendingChoice = null;
      await this.advanceToExchange(local, roomId);

      state.lastUpdated = Date.now();
      await this.saveAndSync(roomId, local, [playerId]);
      return { success: true };
    } else if (choice.type === 'BLIND_DATE_DISCARD') {
      const cardIdx = activePrivate.cards.findIndex(c => c.id === cardId || c.code === cardId || c.id.startsWith(cardId));
      if (cardIdx === -1) return { success: false, error: 'Карта не найдена в руке.' };
      const card = activePrivate.cards[cardIdx];

      const validation = validateDiscardCard(card, activePrivate);
      if (!validation.valid) return { success: false, error: validation.error };

      activePrivate.cards.splice(cardIdx, 1);
      state.discardPile.unshift(card);
      activePlayer.handCount = activePrivate.cards.length;

      this.addLog(state, `🙈 «Свидание вслепую»! ${activePlayer.name} сбросил карту из руки в отбой взамен карты из колоды. Ход завершен!`, 'PANIC');
      this.addPrivateLog(local, playerId, `Вы сбросили карту «${card.name}» в отбой. На руке 4 карты. Ход завершён.`, 'PANIC');

      activePrivate.pendingChoice = null;
      await this.endTurn(local, roomId);

      state.lastUpdated = Date.now();
      await this.saveAndSync(roomId, local, [playerId]);
      return { success: true };
    } else if (choice.type === 'CHAIN_REACTION_PASS') {
      const cardIdx = activePrivate.cards.findIndex(c => c.id === cardId || c.code === cardId || c.id.startsWith(cardId));
      if (cardIdx === -1) return { success: false, error: 'Карта не найдена в руке.' };
      const card = activePrivate.cards[cardIdx];

      if (card.code === 'THE_THING') {
        return { success: false, error: 'Карту «НЕЧТО» категорически запрещено передавать!' };
      }
      if (card.code === 'INFECTION' && activePrivate.role === 'HUMAN') {
        return { success: false, error: 'Люди не могут передавать карту заражения.' };
      }

      const chain = state.chainReaction;
      if (!chain) return { success: false, error: 'Цепная реакция не активна.' };

      chain.picks[playerId] = card.id;
      activePrivate.pendingChoice = null;

      const nextPlayerId = chain.pendingOrder.find(pId => !chain.picks[pId]);

      if (nextPlayerId) {
        chain.activePlayerId = nextPlayerId;
        const currentOrderIdx = chain.pendingOrder.indexOf(nextPlayerId);
        const targetOrderIdx = (currentOrderIdx + 1) % chain.pendingOrder.length;
        chain.targetPlayerId = chain.pendingOrder[targetOrderIdx];

        await this.activateChainReactionStep(local, roomId, nextPlayerId);
      } else {
        await this.finalizeChainReaction(local, roomId);
      }

      state.lastUpdated = Date.now();
      await this.saveAndSync(roomId, local, [playerId]);
      return { success: true };
    }

    return { success: false, error: 'Неизвестный тип выбора.' };
  }

  // 13. Перезапуск в лобби (Реванш)
  public async resetToLobby(roomId: string, hostPlayerId: string): Promise<{ success: boolean; error?: string }> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return { success: false, error: 'Комната не найдена.' };
    if (local.publicState.hostId !== hostPlayerId) return { success: false, error: 'Только командир (хост) может начать новую игру.' };

    const state = local.publicState;
    state.status = 'LOBBY';
    state.phase = 'LOBBY';
    state.winner = null;
    state.winningRoleReason = undefined;
    state.finalRoles = undefined;
    state.roundNumber = 1;
    state.doors = [];
    state.discardPile = [];
    state.deckCount = 0;
    state.pendingDefense = null;
    state.revealedCards = null;

    state.players.forEach(p => {
      p.isDead = false;
      p.quarantineTurns = 0;
      p.handCount = 0;
    });

    for (const pId in local.privateStates) {
      local.privateStates[pId] = {
        role: 'HUMAN',
        cards: [],
      };
    }

    local.fullDrawDeck = [];
    local.offeredExchangeCard = undefined;
    state.chainReaction = null;

    this.addLog(state, `Экспедиция завершена. Станция возвращена в режим подготовки к новому выходу.`);
    state.lastUpdated = Date.now();

    await this.saveAndSync(roomId, local);
    return { success: true };
  }

  // 12. Завершение хода
  private async endTurn(local: LocalGameState, roomId: string): Promise<void> {
    const state = local.publicState;
    const living = getLivingPlayers(state.players);

    if (living.length === 0) return;

    // Уменьшаем счетчик карантина у активного игрока за его завершенный ход (Официальные правила, стр. 13)
    const currentId = state.currentTurnPlayerId;
    const currentTurnPlayer = state.players.find(p => p.id === currentId);
    if (currentTurnPlayer && currentTurnPlayer.quarantineTurns > 0) {
      currentTurnPlayer.quarantineTurns -= 1;
      if (currentTurnPlayer.quarantineTurns === 0) {
        this.addLog(state, `Карантин игрока ${currentTurnPlayer.name} истек. Он возвращается в строй.`);
      } else {
        this.addLog(state, `У игрока ${currentTurnPlayer.name} осталось ходов карантина: ${currentTurnPlayer.quarantineTurns}.`);
      }
    }

    const currentIdx = living.findIndex(p => p.id === state.currentTurnPlayerId);
    const nextIdx = (currentIdx + (state.direction === 1 ? 1 : -1) + living.length) % living.length;
    const nextPlayer = living[nextIdx];

    if (nextIdx === 0) {
      state.roundNumber += 1;
    }

    // Строгий инвариант официальных правил (стр. 8): В начале и в конце хода на руке ровно 4 карты
    for (const p of state.players) {
      if (p.isDead) continue;
      const priv = local.privateStates[p.id];
      if (priv) {
        while (priv.cards.length > 4) {
          const excessIdx = priv.cards.findIndex(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || priv.role !== 'INFECTED'));
          const toDiscard = excessIdx !== -1 ? priv.cards.splice(excessIdx, 1)[0] : priv.cards.pop()!;
          state.discardPile.unshift(toDiscard);
        }
        while (priv.cards.length < 4 && local.fullDrawDeck && local.fullDrawDeck.length > 0) {
          const restoredCard = local.fullDrawDeck.shift()!;
          priv.cards.push(restoredCard);
          this.syncDeckState(local);
        }
        p.handCount = priv.cards.length;
      }
    }

    state.currentTurnPlayerId = nextPlayer.id;
    // Сбрасываем раскрытые карты только если они не адресованы защитившемуся игроку (например, при розыгрыше «Страха»)
    if (!state.revealedCards || !state.revealedCards.targetPlayerId || state.revealedCards.targetPlayerId === currentId) {
      state.revealedCards = null;
    }

    this.addLog(state, `Ход переходит к полярнику ${nextPlayer.name}.`);
    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local);
    await this.executeDrawPhase(local, roomId);
  }

  // Боты
  public async runBotTurn(roomId: string) {
    const local = this.localRooms.get(roomId);
    if (!local || local.publicState.status !== 'PLAYING') return;

    const state = local.publicState;
    const currentId = state.currentTurnPlayerId;
    const botPlayer = state.players.find(p => p.id === currentId);
    if (!botPlayer || !botPlayer.isBot || botPlayer.isDead) return;

    if (!local.privateStates[currentId]) {
      await this.getPlayerPrivate(roomId, currentId);
    }
    const botPrivate = local.privateStates[currentId];
    if (!botPrivate || botPrivate.cards.length === 0) return;

    // Добираем карту до 5, если на руке меньше 5 карт перед совершением действия
    while (botPrivate.cards.length < 5 && local.fullDrawDeck && local.fullDrawDeck.length > 0) {
      const card = local.fullDrawDeck.shift()!;
      botPrivate.cards.push(card);
      this.syncDeckState(local);
      botPlayer.handCount = botPrivate.cards.length;
    }

    // Если бот на карантине - может только сбросить карту
    if (botPlayer.quarantineTurns > 0) {
      const discardCandidate = botPrivate.cards.find(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || botPrivate.role !== 'INFECTED' || botPrivate.cards.filter(x => x.code === 'INFECTION').length > 1)) || botPrivate.cards[0];
      if (discardCandidate) {
        await this.discardCard(roomId, currentId, discardCandidate.id);
      }
      return;
    }

    const living = getLivingPlayers(state.players);
    const neighbors = getPlayerNeighbors(state.players, currentId, state.direction, state.doors);
    const adjacentTargets = [neighbors.leftNeighbor, neighbors.rightNeighbor].filter((p): p is PlayerPublic => Boolean(p && !p.isDead));

    const cards = botPrivate.cards;

    // 1. Огнемёт: наивысший приоритет
    const flameCard = cards.find(c => c.code === 'FLAMETHROWER');
    if (flameCard) {
      const validTarget = adjacentTargets.find(t => 
        t.quarantineTurns === 0 && !isDoorBetween(state.doors, currentId, t.id, state.players)
      );
      if (validTarget) {
        await this.playCard(roomId, currentId, flameCard.id, validTarget.id);
        return;
      }
    }

    // 2. Упорство: поиск снабжения
    const perseveranceCard = cards.find(c => c.code === 'PERSEVERANCE');
    if (perseveranceCard) {
      await this.playCard(roomId, currentId, perseveranceCard.id);
      return;
    }

    // 3. Топор: срубить смежную дверь или карантин
    const axeCard = cards.find(c => c.code === 'AXE');
    if (axeCard) {
      const doorIdx = state.doors.findIndex(d => 
        (d.seatA === botPlayer.seatIndex || d.seatB === botPlayer.seatIndex)
      );
      if (doorIdx !== -1) {
        await this.playCard(roomId, currentId, axeCard.id, undefined, doorIdx);
        return;
      }
      const quarTarget = adjacentTargets.find(t => t.quarantineTurns > 0);
      if (quarTarget) {
        await this.playCard(roomId, currentId, axeCard.id, quarTarget.id);
        return;
      }
    }

    // 4. Анализ крови / Подозрение
    const checkCard = cards.find(c => c.code === 'ANALYSIS' || c.code === 'SUSPICION');
    if (checkCard) {
      const validTarget = adjacentTargets.find(t => 
        t.quarantineTurns === 0 && !isDoorBetween(state.doors, currentId, t.id, state.players)
      );
      if (validTarget) {
        await this.playCard(roomId, currentId, checkCard.id, validTarget.id);
        return;
      }
    }

    // 5. Виски
    const whiskeyCard = cards.find(c => c.code === 'WHISKEY');
    if (whiskeyCard && botPrivate.role === 'HUMAN') {
      await this.playCard(roomId, currentId, whiskeyCard.id);
      return;
    }

    // 6. Смена направления (Гляди по сторонам)
    const lookCard = cards.find(c => c.code === 'LOOK_AROUND');
    if (lookCard) {
      await this.playCard(roomId, currentId, lookCard.id);
      return;
    }

    // 7. Соблазн: внеочередной обмен
    const seductionCard = cards.find(c => c.code === 'SEDUCTION');
    if (seductionCard) {
      const otherPlayers = living.filter(p => p.id !== currentId && p.quarantineTurns === 0);
      if (otherPlayers.length > 0) {
        const target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
        await this.playCard(roomId, currentId, seductionCard.id, target.id);
        return;
      }
    }

    // 8. Заколоченная дверь
    const doorCard = cards.find(c => c.code === 'BARRED_DOOR');
    if (doorCard) {
      const openNeighbor = adjacentTargets.find(t => !isDoorBetween(state.doors, currentId, t.id, state.players));
      if (openNeighbor) {
        await this.playCard(roomId, currentId, doorCard.id, openNeighbor.id);
        return;
      }
    }

    // 9. Карантин
    const quarCard = cards.find(c => c.code === 'QUARANTINE');
    if (quarCard) {
      const validTarget = adjacentTargets.find(t => t.quarantineTurns === 0);
      if (validTarget) {
        await this.playCard(roomId, currentId, quarCard.id, validTarget.id);
        return;
      }
    }

    // 10. Если карты действия не разыграны — сброс карты
    const nonCriticalCards = botPrivate.cards.filter(c => c.code !== 'THE_THING');
    const discardCandidate = nonCriticalCards.find(c => c.code !== 'INFECTION' || botPrivate.role !== 'INFECTED' || botPrivate.cards.filter(x => x.code === 'INFECTION').length > 1) || nonCriticalCards[0];
    if (discardCandidate) {
      await this.discardCard(roomId, currentId, discardCandidate.id);
    }
  }

  public async runBotDefense(roomId: string) {
    const local = this.localRooms.get(roomId);
    if (!local || !local.publicState.pendingDefense) return;

    const targetId = local.publicState.pendingDefense.targetPlayerId;
    const botPlayer = local.publicState.players.find(p => p.id === targetId);
    if (!botPlayer || !botPlayer.isBot) return;

    const botPrivate = local.privateStates[targetId];
    if (!botPrivate) return;

    const allowed = local.publicState.pendingDefense.allowedDefenseCodes;
    const defenseCard = botPrivate.cards.find(c => allowed.includes(c.code));

    if (defenseCard) {
      await this.respondDefense(roomId, targetId, defenseCard.id);
    } else {
      await this.respondDefense(roomId, targetId, null);
    }
  }

  public async runBotExchangeOffer(roomId: string) {
    const local = this.localRooms.get(roomId);
    if (!local || local.publicState.phase !== 'EXCHANGE_OFFER') return;

    const currentId = local.publicState.currentTurnPlayerId;
    const botPlayer = local.publicState.players.find(p => p.id === currentId);
    if (!botPlayer || !botPlayer.isBot) return;

    if (!local.privateStates[currentId]) {
      await this.getPlayerPrivate(roomId, currentId);
    }
    const botPrivate = local.privateStates[currentId];
    if (!botPrivate || botPrivate.cards.length === 0) return;

    let cardToOffer: GameCard | undefined;
    // Только Нечто может передавать заражение!
    if (botPrivate.role === 'THE_THING') {
      cardToOffer = botPrivate.cards.find(c => c.code === 'INFECTION');
    }
    // Если Нечто передает обычную карту или бот — Человек/Зараженный:
    if (!cardToOffer) {
      cardToOffer = botPrivate.cards.find(c => c.code !== 'THE_THING' && c.code !== 'INFECTION') || botPrivate.cards[0];
    }

    if (cardToOffer) {
      await this.offerExchangeCard(roomId, currentId, cardToOffer.id);
    }
  }

  public async runBotExchangeResponse(roomId: string) {
    const local = this.localRooms.get(roomId);
    if (!local) return;

    const offer = local.offeredExchangeCard;
    if (!offer) return;

    const targetId = offer.targetPlayerId;
    const botPlayer = local.publicState.players.find(p => p.id === targetId);
    if (!botPlayer || !botPlayer.isBot) return;

    if (!local.privateStates[targetId]) {
      await this.getPlayerPrivate(roomId, targetId);
    }
    const botPrivate = local.privateStates[targetId];
    if (!botPrivate || botPrivate.cards.length === 0) return;

    let cardToGive = botPrivate.cards.find(c => c.code !== 'THE_THING' && c.code !== 'INFECTION');
    if (!cardToGive) {
      cardToGive = botPrivate.cards[0];
    }

    if (cardToGive) {
      await this.respondExchange(roomId, targetId, cardToGive.id);
    }
  }

  public handleHostBotTriggers(roomId: string) {
    const local = this.localRooms.get(roomId);
    if (!local || local.publicState.status !== 'PLAYING') return;

    const state = local.publicState;

    // 1. Ход бота (фаза действия)
    if (state.phase === 'ACTION') {
      const current = state.players.find(p => p.id === state.currentTurnPlayerId);
      if (current && current.isBot && !current.isDead) {
        this.scheduleBotAction(() => this.runBotTurn(roomId), 1200, `bot_turn_${current.id}`);
      }
    }

    // 2. Бот должен предложить обмен
    if (state.phase === 'EXCHANGE_OFFER') {
      const current = state.players.find(p => p.id === state.currentTurnPlayerId);
      if (current && current.isBot && !current.isDead) {
        this.scheduleBotAction(() => this.runBotExchangeOffer(roomId), 1200, `bot_offer_${current.id}`);
      }
    }

    // 3. Бот должен ответить на обмен
    if (state.phase === 'EXCHANGE_RESPOND' && local.offeredExchangeCard) {
      const target = state.players.find(p => p.id === local.offeredExchangeCard?.targetPlayerId);
      if (target && target.isBot && !target.isDead) {
        this.scheduleBotAction(() => this.runBotExchangeResponse(roomId), 1200, `bot_resp_${target.id}`);
      }
    }

    // 4. Бот должен защититься
    if ((state.phase === 'DEFENSE_WAIT' || state.phase === 'EXCHANGE_DEFENSE_WAIT') && state.pendingDefense) {
      const target = state.players.find(p => p.id === state.pendingDefense?.targetPlayerId);
      if (target && target.isBot && !target.isDead) {
        this.scheduleBotAction(() => this.runBotDefense(roomId), 1500, `bot_def_${target.id}`);
      }
    }

    // 5. Бот в цепной реакции
    if (state.phase === 'CHAIN_REACTION' && state.chainReaction) {
      const active = state.players.find(p => p.id === state.chainReaction?.activePlayerId);
      if (active && active.isBot && !active.isDead) {
        this.scheduleBotAction(() => this.runBotChainReactionPick(roomId, active.id), 1200, `bot_chain_${active.id}`);
      }
    }
  }

  // 13. Подписка на публичное состояние комнаты
  public subscribeToRoom(roomId: string, callback: (state: RoomPublicState | null) => void): () => void {
    roomId = roomId.toUpperCase().trim();

    if (isFirebaseConfigured && db) {
      try {
        const unsub = onSnapshot(doc(db, 'rooms', roomId, 'public', 'state'), snap => {
          if (snap.exists()) {
            const remotePublic = snap.data() as RoomPublicState;
            let local = this.localRooms.get(roomId);
            if (!local) {
              local = { publicState: remotePublic, privateStates: {} };
              this.localRooms.set(roomId, local);
            } else {
              local.publicState = remotePublic;
            }
            callback(remotePublic);
            this.handleHostBotTriggers(roomId);
          } else {
            callback(this.localRooms.get(roomId)?.publicState || null);
          }
        });

        const unsubMeta = onSnapshot(doc(db, 'rooms', roomId, 'private', '_game_meta'), snap => {
          if (snap.exists()) {
            const meta = snap.data();
            const local = this.localRooms.get(roomId);
            if (local) {
              if (meta.fullDrawDeck) local.fullDrawDeck = meta.fullDrawDeck;
              if (meta.offeredExchangeCard) local.offeredExchangeCard = meta.offeredExchangeCard;
              if (meta.forcedExchangeTargetId) local.forcedExchangeTargetId = meta.forcedExchangeTargetId;
              this.handleHostBotTriggers(roomId);
            }
          }
        });

        return () => {
          unsub();
          unsubMeta();
        };
      } catch (err) {
        console.warn('Firebase subscribe error:', err);
      }
    }

    const sync = () => {
      const room = this.localRooms.get(roomId);
      callback(room ? { ...room.publicState } : null);
    };
    sync();

    const ch = this.getChannel(roomId);
    const listener = (ev: MessageEvent) => {
      if (ev.data?.roomId === roomId) {
        sync();
      }
    };
    ch.addEventListener('message', listener);

    return () => {
      ch.removeEventListener('message', listener);
    };
  }

  // 14. Подписка на приватные карты игрока
  public subscribeToPrivate(roomId: string, playerId: string, callback: (state: PlayerPrivate | null) => void): () => void {
    roomId = roomId.toUpperCase().trim();

    if (isFirebaseConfigured && db) {
      try {
        const unsub = onSnapshot(doc(db, 'rooms', roomId, 'private', playerId), snap => {
          if (snap.exists()) {
            const priv = snap.data() as PlayerPrivate;
            const local = this.localRooms.get(roomId);
            if (local) {
              local.privateStates[playerId] = priv;
            }
            callback(priv);
          } else {
            const priv = this.localRooms.get(roomId)?.privateStates[playerId];
            callback(priv || null);
          }
        });
        return unsub;
      } catch (err) {
        console.warn('Firebase private subscribe error:', err);
      }
    }

    const sync = () => {
      const priv = this.localRooms.get(roomId)?.privateStates[playerId];
      callback(priv ? { ...priv } : null);
    };
    sync();

    const ch = this.getChannel(roomId);
    const listener = (ev: MessageEvent) => {
      if (ev.data?.roomId === roomId) {
        sync();
      }
    };
    ch.addEventListener('message', listener);

    return () => {
      ch.removeEventListener('message', listener);
    };
  }

  public async clearPanicEvent(roomId: string): Promise<void> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return;
    local.publicState.panicEvent = null;
    local.publicState.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local);
  }

  public getRoomSnapshot(roomId: string): RoomPublicState | null {
    return this.localRooms.get(roomId.toUpperCase().trim())?.publicState || null;
  }

  // Формирование и экспорт детального отчета со всеми логами (общими и личными) для отладки
  public async generateGameLogReport(roomId: string): Promise<string> {
    roomId = roomId.toUpperCase().trim();
    const local = await this.ensureRoomState(roomId);
    if (!local) return `Комната [${roomId}] не найдена.`;

    const state = local.publicState;
    const allPrivates = await this.getAllPlayerPrivates(roomId, state.players);

    const now = new Date();
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`               ПОЛНЫЙ ДИАГНОСТИЧЕСКИЙ ОТЧЕТ ИГРЫ «НЕЧТО»`);
    lines.push(`Комната: ${roomId}`);
    lines.push(`Время выгрузки: ${now.toLocaleString('ru-RU')}`);
    lines.push(`Статус: ${state.status} | Раунд #${state.roundNumber} | Направление: ${state.direction === 1 ? 'По часовой ↻' : 'Против часовой ↺'}`);
    if (state.winner) {
      lines.push(`🏆 Победитель: ${state.winner === 'HUMANS' ? 'ЛЮДИ' : 'НЕЧТО'}`);
      lines.push(`Причина победы: ${state.winningRoleReason || 'Не указана'}`);
    }
    lines.push('='.repeat(80));
    lines.push('');

    lines.push('--- 🪑 РАССАДКА И СОСТОЯНИЕ ИГРОКОВ ЗА СТОЛОМ ---');
    const sortedPlayers = [...state.players].sort((a, b) => a.seatIndex - b.seatIndex);
    for (const p of sortedPlayers) {
      const priv = allPrivates[p.id];
      const roleStr = priv?.role || state.finalRoles?.[p.id] || 'HUMAN';
      const infectedInfo = priv?.infectedBy ? ` (Заражен игроком: ${state.players.find(x => x.id === priv.infectedBy)?.name || priv.infectedBy})` : '';
      const deadStr = p.isDead ? '💀 ПОГИБ' : '🛡️ ВЫЖИЛ';
      const typeStr = p.isBot ? '🤖 ИИ-Бот' : '👤 Игрок';
      const quarStr = p.quarantineTurns > 0 ? ` [В карантине: ${p.quarantineTurns} х.]` : '';
      lines.push(`[Место #${p.seatIndex}] ${p.name} (${typeStr}, ID: ${p.id})`);
      lines.push(`    Статус: ${deadStr}${quarStr} | Роль: ${roleStr}${infectedInfo} | Карт в руке: ${priv?.cards?.length ?? p.handCount}`);
      if (priv?.cards && priv.cards.length > 0) {
        lines.push(`    Карты: ${priv.cards.map(c => `«${c.name}» (${c.category})`).join(', ')}`);
      }
    }
    lines.push('');

    lines.push('--- 🚪 ДВЕРИ И ОБСТАНОВКА ---');
    if (state.doors && state.doors.length > 0) {
      lines.push(`Установлено заколоченных дверей: ${state.doors.length}`);
      state.doors.forEach((d, idx) => {
        const pA = state.players.find(p => p.id === d.playerAId)?.name || `Место ${d.seatA}`;
        const pB = state.players.find(p => p.id === d.playerBId)?.name || `Место ${d.seatB}`;
        lines.push(`  #${idx + 1}: Между ${pA} и ${pB}`);
      });
    } else {
      lines.push('Заколоченных дверей нет.');
    }
    lines.push(`Карт в колоде добора: ${state.deckCount}, карт в сбросе: ${state.discardPile.length}`);
    lines.push('');

    lines.push(`--- 📢 ОБЩИЙ ЖУРНАЛ СТАНЦИИ (${state.logs.length} записей, от новых к старым) ---`);
    state.logs.forEach((l, idx) => {
      const t = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('ru-RU') : '';
      lines.push(`[${idx + 1}] [${t}] [${l.type}] ${l.text}`);
    });
    lines.push('');

    lines.push('--- 🔒 ЛИЧНЫЕ ДОСЬЕ ИГРОКОВ (СЕКРЕТНЫЕ ЖУРНАЛЫ) ---');
    for (const p of sortedPlayers) {
      const priv = allPrivates[p.id];
      lines.push(`\n📂 ДОСЬЕ ИГРОКА: ${p.name} (Роль: ${priv?.role || 'HUMAN'})`);
      if (priv?.privateLogs && priv.privateLogs.length > 0) {
        lines.push(`  Личные записи (${priv.privateLogs.length}):`);
        priv.privateLogs.forEach((pl, pIdx) => {
          const t = pl.timestamp ? new Date(pl.timestamp).toLocaleTimeString('ru-RU') : '';
          lines.push(`    [${pIdx + 1}] [${t}] ${pl.text}`);
        });
      } else {
        lines.push('    (Личных записей нет)');
      }
    }
    lines.push('');
    lines.push('='.repeat(80));
    lines.push('Конец отчета.');

    return lines.join('\n');
  }

  public async downloadGameLogReport(roomId: string): Promise<void> {
    const report = await this.generateGameLogReport(roomId);
    if (typeof window !== 'undefined') {
      const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nechto_game_${roomId.toUpperCase()}_${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }
}

export const networkManager = new NetworkManager();
