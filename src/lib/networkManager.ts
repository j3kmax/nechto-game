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

  // Получить секретное состояние игрока (из памяти или Firestore)
  public async getPlayerPrivate(roomId: string, playerId: string): Promise<PlayerPrivate | null> {
    roomId = roomId.toUpperCase().trim();
    const local = this.localRooms.get(roomId);
    if (local?.privateStates[playerId]) {
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
    return null;
  }

  // Получить секретные состояния всех игроков (для проверки условий победы)
  public async getAllPlayerPrivates(roomId: string, players: PlayerPublic[]): Promise<Record<string, PlayerPrivate>> {
    roomId = roomId.toUpperCase().trim();
    const local = this.localRooms.get(roomId);
    const result: Record<string, PlayerPrivate> = { ...(local?.privateStates || {}) };

    if (isFirebaseConfigured && db) {
      const firestore = db;
      try {
        const missingPlayers = players.filter(p => !result[p.id]);
        if (missingPlayers.length > 0) {
          const promises = missingPlayers.map(async (p) => {
            const snap = await getDoc(doc(firestore, 'rooms', roomId, 'private', p.id));
            if (snap.exists()) {
              const priv = snap.data() as PlayerPrivate;
              result[p.id] = priv;
              if (local) local.privateStates[p.id] = priv;
            }
          });
          await Promise.all(promises);
        }
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

    const startPlayer = local.publicState.players[startPlayerIndex];
    this.addLog(local.publicState, `ВНИМАНИЕ! Экспедиция изолирована (${playerIds.length} полярников). Среди вас бродит НЕЧТО!`, 'WARNING');
    this.addLog(local.publicState, `Каждому роздано по 4 секретных карты. Первым начинает ${startPlayer.name}.`);

    // Фаза первого добора
    this.executeDrawPhase(local, roomId);

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
        } else {
          break;
        }
      }
      const top = local.fullDrawDeck.shift();
      if (!top) break;
      state.deckCount = local.fullDrawDeck.length;
      if (top.category === 'PANIC') {
        state.discardPile.unshift(top);
        continue;
      }
      priv.cards.push(top);
      return top;
    }
    return null;
  }

  // Метод выполнения Цепной реакции: одновременная передача 1 карты по кругу
  private executeChainReaction(local: LocalGameState) {
    const state = local.publicState;
    const living = getLivingPlayers(state.players);
    if (living.length < 2) return;

    const passedCards: { fromId: string; toId: string; card: GameCard; fromRole: Role }[] = [];

    for (let i = 0; i < living.length; i++) {
      const p = living[i];
      const priv = local.privateStates[p.id];
      if (!priv || priv.cards.length === 0) continue;

      const nextIdx = (i + (state.direction === 1 ? 1 : -1) + living.length) % living.length;
      const targetP = living[nextIdx];

      let cardIdx = -1;
      if (priv.role === 'THE_THING' || priv.role === 'INFECTED') {
        cardIdx = priv.cards.findIndex(c => c.code === 'INFECTION');
      }
      if (cardIdx === -1) {
        cardIdx = priv.cards.findIndex(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || priv.role !== 'HUMAN'));
      }
      if (cardIdx === -1) cardIdx = 0;

      const card = priv.cards.splice(cardIdx, 1)[0];
      passedCards.push({ fromId: p.id, toId: targetP.id, card, fromRole: priv.role });
    }

    for (const item of passedCards) {
      const targetPriv = local.privateStates[item.toId];
      if (targetPriv) {
        targetPriv.cards.push(item.card);
        if (item.card.code === 'INFECTION' && (item.fromRole === 'THE_THING' || item.fromRole === 'INFECTED')) {
          if (targetPriv.role === 'HUMAN') {
            targetPriv.role = 'INFECTED';
            targetPriv.infectedBy = item.fromId;
          }
        }
      }
    }

    for (const p of state.players) {
      const priv = local.privateStates[p.id];
      if (priv) p.handCount = priv.cards.length;
    }
  }

  // Вспомогательный метод: Фаза Добора (Draw Phase)
  private executeDrawPhase(local: LocalGameState, roomId: string) {
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
    state.deckCount = local.fullDrawDeck!.length;

    const activePlayer = state.players.find(p => p.id === currentId);
    const activePrivate = local.privateStates[currentId];

    if (!activePlayer || !activePrivate) return;

    // ПРОВЕРКА КАРТЫ ПАНИКИ
    if (drawnCard.category === 'PANIC') {
      this.addLog(state, `ПАНИКА! ${activePlayer.name} вытянул карту паники «${drawnCard.name}»!`, 'PANIC');
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
        this.addLog(state, `🧠 «Забывчивость»! ${activePlayer.name} сбросил ${discardedCount} карт и обновил руку из колоды.`, 'PANIC');
      } else if (drawnCard.code === 'PANIC_BLIND_DATE') {
        const swapIdx = activePrivate.cards.findIndex(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || activePrivate.role !== 'INFECTED'));
        if (swapIdx !== -1) {
          const discarded = activePrivate.cards.splice(swapIdx, 1)[0];
          state.discardPile.unshift(discarded);
          this.drawEventCard(local, activePrivate);
          activePlayer.handCount = activePrivate.cards.length;
          this.addLog(state, `🙈 «Свидание вслепую»! ${activePlayer.name} тайно сменил карту из руки на карту из колоды. Ход завершен!`, 'PANIC');
        }
        this.endTurn(local, roomId);
        return;
      } else if (drawnCard.code === 'PANIC_CHAIN_REACTION') {
        this.executeChainReaction(local);
        this.addLog(state, `⚡ «Цепная реакция»! Все игроки одновременно передали по 1 карте соседу по кругу! Ход завершен.`, 'PANIC');
        this.endTurn(local, roomId);
        return;
      } else if (drawnCard.code === 'CHANGE_DIRECTION') {
        state.direction = state.direction === 1 ? -1 : 1;
        this.addLog(state, `Направление хода изменилось: теперь ${state.direction === 1 ? 'по часовой стрелке ↻' : 'против часовой стрелки ↺'}.`, 'PANIC');
      } else if (drawnCard.code === 'BLIND_FAITH') {
        this.addLog(state, `Слепое доверие заставляет всех быть настороже.`, 'PANIC');
      }

      this.executeDrawPhase(local, roomId);
      return;
    }

    // Обычная карта добавляется в руку
    activePrivate.cards.push(drawnCard);
    activePlayer.handCount = activePrivate.cards.length;
    state.phase = 'ACTION';
    state.lastUpdated = Date.now();

    if (activePlayer.isBot) {
      setTimeout(() => this.runBotTurn(roomId), 1200);
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

    const cardIndex = activePrivate.cards.findIndex(c => c.id === cardId);
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
          setTimeout(() => this.runBotDefense(roomId), 1500);
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
        this.advanceToExchange(local, roomId);
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
        this.advanceToExchange(local, roomId);
        break;
      }

      case 'QUARANTINE': {
        if (targetPlayer) {
          targetPlayer.quarantineTurns = 2;
          this.addLog(state, `☣️ ${targetPlayer.name} отправлен в КАРАНТИН на 2 хода!`, 'WARNING');
        }
        this.advanceToExchange(local, roomId);
        break;
      }

      case 'LOOK_AROUND': {
        state.direction = state.direction === 1 ? -1 : 1;
        this.addLog(state, `👀 ${activePlayer.name} сыграл «Гляди по сторонам»! Очередность хода и направление обмена меняются: теперь ${state.direction === 1 ? 'по часовой стрелке ↻' : 'против часовой стрелки ↺'}.`, 'INFO');
        this.advanceToExchange(local, roomId);
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
        }
        this.advanceToExchange(local, roomId);
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
          if (cardsList.length > 0) {
            const randomCard = cardsList[Math.floor(Math.random() * cardsList.length)];
            state.revealedCards = {
              fromPlayerId: targetPlayer.id,
              targetPlayerId: playerId,
              cards: [randomCard],
              title: `Подозрение: случайная карта ${targetPlayer.name}`,
            };
          }
          this.addLog(state, `👁️ ${activePlayer.name} обыскал карманы ${targetPlayer.name}.`, 'INFO');
        }
        this.advanceToExchange(local, roomId);
        break;
      }

      case 'WHISKEY': {
        state.revealedCards = {
          fromPlayerId: playerId,
          cards: activePrivate.cards,
          title: `Виски: ${activePlayer.name} показывает свои карты всем!`,
        };
        this.addLog(state, `🥃 ${activePlayer.name} выпил виски и раскрыл все свои карты для проверки чистоты!`, 'INFO');
        this.advanceToExchange(local, roomId);
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
            setTimeout(() => this.runBotDefense(roomId), 1500);
          }
          break;
        }

        const tempSeat = activePlayer.seatIndex;
        activePlayer.seatIndex = targetPlayer.seatIndex;
        targetPlayer.seatIndex = tempSeat;
        this.addLog(state, `🔄 ${activePlayer.name} и ${targetPlayer.name} поменялись местами за столом!`, 'INFO');
        this.advanceToExchange(local, roomId);
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
        if (!local.fullDrawDeck || local.fullDrawDeck.length < 3) {
          if (state.discardPile.length > 0) {
            local.fullDrawDeck = [...(local.fullDrawDeck || []), ...state.discardPile].sort(() => Math.random() - 0.5);
            state.discardPile = [];
            this.addLog(state, `Колода пополнена из стопки сброса для поиска снабжения.`);
          }
        }
        const fullDeck = local.fullDrawDeck;
        if (fullDeck && fullDeck.length >= 3) {
          const extraCards = fullDeck.splice(0, 3);
          state.deckCount = fullDeck.length;
          activePrivate.cards.push(extraCards[0]);
          state.discardPile.unshift(extraCards[1], extraCards[2]);
          activePlayer.handCount = activePrivate.cards.length;
          this.addLog(state, `📦 ${activePlayer.name} проявил упорство и перерыл ящики снабжения.`, 'INFO');
        }
        this.advanceToExchange(local, roomId);
        break;
      }

      default:
        this.advanceToExchange(local, roomId);
        break;
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [playerId]);
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

    const cardIndex = activePrivate.cards.findIndex(c => c.id === cardId);
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
    this.advanceToExchange(local, roomId);

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [playerId]);
    return { success: true };
  }

  // Переход к фазе обмена
  private advanceToExchange(local: LocalGameState, roomId: string) {
    const state = local.publicState;
    const currentId = state.currentTurnPlayerId;
    const activePlayer = state.players.find(p => p.id === currentId);

    if (activePlayer && activePlayer.quarantineTurns > 0) {
      this.addLog(state, `${activePlayer.name} находится в карантине и пропускает обмен картами.`);
      this.endTurn(local, roomId);
      return;
    }

    const forcedTargetId = local.forcedExchangeTargetId;
    let targetNeighbor: PlayerPublic | null = null;
    let isBlocked = false;

    if (forcedTargetId) {
      targetNeighbor = state.players.find(p => p.id === forcedTargetId) || null;
      delete local.forcedExchangeTargetId;
    } else {
      const neighbors = getPlayerNeighbors(state.players, currentId, state.direction, state.doors);
      targetNeighbor = neighbors.targetNeighbor;
      isBlocked = neighbors.isBlockedByDoor;
    }

    if (!targetNeighbor || targetNeighbor.isDead) {
      this.endTurn(local, roomId);
      return;
    }

    if (isBlocked) {
      this.addLog(state, `🚪 Обмен картами заблокирован заколоченной дверью! Ход завершен.`, 'INFO');
      this.endTurn(local, roomId);
      return;
    }

    if (targetNeighbor.quarantineTurns > 0) {
      this.addLog(state, `☣️ Сосед находится в карантине. Обмен невозможен.`);
      this.endTurn(local, roomId);
      return;
    }

    state.phase = 'EXCHANGE_OFFER';
    this.addLog(state, `Фаза обмена: ${activePlayer?.name} должен выбрать карту для передачи ${targetNeighbor.name}.`, 'EXCHANGE');

    if (activePlayer?.isBot) {
      setTimeout(() => this.runBotExchangeOffer(roomId), 1200);
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

    const activePrivate = local.privateStates[playerId];
    const card = activePrivate?.cards.find(c => c.id === cardId);
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

      if (targetNeighbor.isBot) {
        setTimeout(() => this.runBotDefense(roomId), 1500);
      }
    } else {
      state.phase = 'EXCHANGE_RESPOND';
      this.addLog(state, `${targetNeighbor.name} должен выбрать карту для ответного обмена.`, 'EXCHANGE');

      if (targetNeighbor.isBot) {
        setTimeout(() => this.runBotExchangeResponse(roomId), 1500);
      }
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [playerId]);
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

    // Всегда получаем свежие приватные состояния игроков (из базы или памяти)
    const freshTargetPriv = await this.getPlayerPrivate(roomId, targetPlayerId);
    if (freshTargetPriv) local.privateStates[targetPlayerId] = freshTargetPriv;
    const freshSourcePriv = await this.getPlayerPrivate(roomId, offer.fromPlayerId);
    if (freshSourcePriv) local.privateStates[offer.fromPlayerId] = freshSourcePriv;

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

    // Механика заражения при обмене
    if (actualOfferedCard.code === 'INFECTION' && (sourcePrivate.role === 'THE_THING' || sourcePrivate.role === 'INFECTED')) {
      if (targetPrivate.role === 'HUMAN') {
        targetPrivate.role = 'INFECTED';
        targetPrivate.infectedBy = offer.fromPlayerId;
      }
    }
    if (targetCard.code === 'INFECTION' && (targetPrivate.role === 'THE_THING' || targetPrivate.role === 'INFECTED')) {
      if (sourcePrivate.role === 'HUMAN') {
        sourcePrivate.role = 'INFECTED';
        sourcePrivate.infectedBy = targetPlayerId;
      }
    }

    this.addLog(state, `🤝 ${sourcePlayer?.name} и ${targetPlayer?.name} тайно обменялись картами под столом.`, 'EXCHANGE');

    local.offeredExchangeCard = undefined;
    state.pendingDefense = null;

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
    } else {
      this.endTurn(local, roomId);
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local, [offer.fromPlayerId, targetPlayerId]);
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
      const cardIdx = defenderPrivate.cards.findIndex(c => c.id === defenseCardId);
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
        this.advanceToExchange(local, roomId);
      } else if (card.code === 'MISSED') {
        if (defense.actionType === 'ATTACK') {
          this.addLog(state, `🛡️ ${defenderPlayer.name} сыграл «МИМО!» и уклонился от огнемёта!`, 'DEFENSE');
          this.drawReplacementCardForDefender(local, defenderId);
          state.pendingDefense = null;
          this.advanceToExchange(local, roomId);
        } else if (defense.actionType === 'EXCHANGE') {
          this.addLog(state, `↪️ ${defenderPlayer.name} сыграл «МИМО!» — обмен передается следующему игроку!`, 'DEFENSE');
          this.drawReplacementCardForDefender(local, defenderId);
          state.pendingDefense = null;

          const living = getLivingPlayers(state.players);
          const defIdx = living.findIndex(p => p.id === defenderId);
          const nextIdx = (defIdx + (state.direction === 1 ? 1 : -1) + living.length) % living.length;
          const redirectTarget = living[nextIdx];

          if (redirectTarget && redirectTarget.id !== defense.sourcePlayerId && !redirectTarget.isDead && redirectTarget.quarantineTurns === 0) {
            this.forwardExchangeOffer(local, roomId, defense.sourcePlayerId, redirectTarget.id, defense.offeredCard || defense.actionCard);
          } else {
            this.addLog(state, `Обмен картами завершен.`);
            local.offeredExchangeCard = undefined;
            this.endTurn(local, roomId);
          }
        }
      } else if (card.code === 'NO_THANKS') {
        this.addLog(state, `🙅‍♂️ ${defenderPlayer.name} ответил «НЕТ, СПАСИБО!» и отказался от обмена.`, 'DEFENSE');
        this.drawReplacementCardForDefender(local, defenderId);
        state.pendingDefense = null;
        local.offeredExchangeCard = undefined;
        this.endTurn(local, roomId);
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
        }
        state.pendingDefense = null;
        local.offeredExchangeCard = undefined;
        this.endTurn(local, roomId);
      } else if (card.code === 'IM_FINE_HERE') {
        this.addLog(state, `🛡️ ${defenderPlayer.name} сыграл «МНЕ И ЗДЕСЬ НЕПЛОХО»! Смена мест отменена.`, 'DEFENSE');
        this.drawReplacementCardForDefender(local, defenderId);
        state.pendingDefense = null;
        this.advanceToExchange(local, roomId);
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
        } else {
          this.endTurn(local, roomId);
        }
      } else if (defense.actionType === 'EXCHANGE') {
        state.phase = 'EXCHANGE_RESPOND';
        state.pendingDefense = null;
        this.addLog(state, `${defenderPlayer.name} соглашается на обмен и выбирает карту.`, 'EXCHANGE');

        if (defenderPlayer.isBot) {
          setTimeout(() => this.runBotExchangeResponse(roomId), 1200);
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
        this.advanceToExchange(local, roomId);
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
      this.addLog(state, `🎴 ${defenderPlayer.name} добрал 1 карту из колоды взамен сыгранной защиты.`);
      break;
    }
  }

  // Перенаправление обмена при розыгрыше «МИМО!» (Официальные правила, стр. 12)
  private forwardExchangeOffer(local: LocalGameState, roomId: string, sourcePlayerId: string, targetPlayerId: string, card: GameCard) {
    const state = local.publicState;
    const targetPlayer = state.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      this.endTurn(local, roomId);
      return;
    }

    local.offeredExchangeCard = {
      fromPlayerId: sourcePlayerId,
      targetPlayerId,
      card,
    };

    let targetPrivate: PlayerPrivate | null | undefined = local.privateStates[targetPlayerId];
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
        setTimeout(() => this.runBotDefense(roomId), 1500);
      }
    } else {
      state.phase = 'EXCHANGE_RESPOND';
      this.addLog(state, `${targetPlayer.name} должен выбрать карту для ответного обмена.`, 'EXCHANGE');
      if (targetPlayer.isBot) {
        setTimeout(() => this.runBotExchangeResponse(roomId), 1500);
      }
    }
  }

  // 12. Перезапуск в лобби (Реванш)
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
    local.forcedExchangeTargetId = undefined;

    this.addLog(state, `Экспедиция завершена. Станция возвращена в режим подготовки к новому выходу.`);
    state.lastUpdated = Date.now();

    await this.saveAndSync(roomId, local);
    return { success: true };
  }

  // 12. Завершение хода
  private endTurn(local: LocalGameState, roomId: string) {
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
        p.handCount = priv.cards.length;
      }
    }

    state.currentTurnPlayerId = nextPlayer.id;
    state.revealedCards = null;

    this.addLog(state, `Ход переходит к полярнику ${nextPlayer.name}.`);
    this.executeDrawPhase(local, roomId);
  }

  // Боты
  private runBotTurn(roomId: string) {
    const local = this.localRooms.get(roomId);
    if (!local || local.publicState.status !== 'PLAYING') return;

    const currentId = local.publicState.currentTurnPlayerId;
    const botPlayer = local.publicState.players.find(p => p.id === currentId);
    if (!botPlayer || !botPlayer.isBot) return;

    const botPrivate = local.privateStates[currentId];
    if (!botPrivate || botPrivate.cards.length === 0) return;

    const nonCriticalCards = botPrivate.cards.filter(c => c.code !== 'THE_THING');
    const actionCard = nonCriticalCards.find(c => c.category === 'ACTION' || c.category === 'OBSTACLE');

    if (actionCard && (actionCard.code === 'WHISKEY' || actionCard.code === 'LOOK_AROUND')) {
      this.playCard(roomId, currentId, actionCard.id);
    } else {
      const discardCandidate = nonCriticalCards.find(c => c.code !== 'INFECTION' || botPrivate.role !== 'INFECTED') || nonCriticalCards[0];
      if (discardCandidate) {
        this.discardCard(roomId, currentId, discardCandidate.id);
      }
    }
  }

  private runBotDefense(roomId: string) {
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
      this.respondDefense(roomId, targetId, defenseCard.id);
    } else {
      this.respondDefense(roomId, targetId, null);
    }
  }

  private runBotExchangeOffer(roomId: string) {
    const local = this.localRooms.get(roomId);
    if (!local || local.publicState.phase !== 'EXCHANGE_OFFER') return;

    const currentId = local.publicState.currentTurnPlayerId;
    const botPlayer = local.publicState.players.find(p => p.id === currentId);
    if (!botPlayer || !botPlayer.isBot) return;

    const botPrivate = local.privateStates[currentId];
    if (!botPrivate || botPrivate.cards.length === 0) return;

    let cardToOffer = botPrivate.cards.find(c => c.code === 'INFECTION');
    if (!cardToOffer || botPrivate.role === 'HUMAN') {
      cardToOffer = botPrivate.cards.find(c => c.code !== 'THE_THING' && c.code !== 'INFECTION') || botPrivate.cards[0];
    }

    if (cardToOffer) {
      this.offerExchangeCard(roomId, currentId, cardToOffer.id);
    }
  }

  private runBotExchangeResponse(roomId: string) {
    const local = this.localRooms.get(roomId);
    if (!local) return;

    const offer = local.offeredExchangeCard;
    if (!offer) return;

    const targetId = offer.targetPlayerId;
    const botPlayer = local.publicState.players.find(p => p.id === targetId);
    if (!botPlayer || !botPlayer.isBot) return;

    const botPrivate = local.privateStates[targetId];
    if (!botPrivate || botPrivate.cards.length === 0) return;

    let cardToGive = botPrivate.cards.find(c => c.code !== 'THE_THING' && c.code !== 'INFECTION');
    if (!cardToGive) {
      cardToGive = botPrivate.cards[0];
    }

    if (cardToGive) {
      this.respondExchange(roomId, targetId, cardToGive.id);
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
}

export const networkManager = new NetworkManager();
