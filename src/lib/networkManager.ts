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
  private async saveAndSync(roomId: string, state: LocalGameState) {
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

        // 2. Секретные карты каждого игрока
        for (const pId in state.privateStates) {
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
      maxPlayers: 12,
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
    if (local.publicState.players.length >= 12) return false;

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
    if (local.publicState.players.length < 4) return { success: false, error: 'Для игры требуется минимум 4 полярника (можно добавить ботов).' };

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
    this.addLog(local.publicState, `ВНИМАНИЕ! Экспедиция изолирована. Среди вас бродит НЕЧТО!`, 'WARNING');
    this.addLog(local.publicState, `Каждому роздано по 4 секретных карты. Первым начинает ${startPlayer.name}.`);

    // Фаза первого добора
    this.executeDrawPhase(local, roomId);

    local.publicState.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local);
    return { success: true };
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

      if (drawnCard.code === 'CHANGE_DIRECTION') {
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
    const activePrivate = local.privateStates[playerId];
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
          allowedDefenseCodes: ['MISSED'],
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
          state.doors.push({ playerAId: playerId, playerBId: targetPlayer.id });
          this.addLog(state, `🚪 ${activePlayer.name} наглухо заколотил проход к ${targetPlayer.name}!`, 'WARNING');
        }
        this.advanceToExchange(local, roomId);
        break;
      }

      case 'QUARANTINE': {
        if (targetPlayer) {
          targetPlayer.quarantineTurns = 2;
          this.addLog(state, `☣️ ${targetPlayer.name} отправлен в КАРАНТИН на 2 раунда!`, 'WARNING');
        }
        this.advanceToExchange(local, roomId);
        break;
      }

      case 'ANALYSIS': {
        if (targetPlayer) {
          const targetCards = local.privateStates[targetPlayer.id]?.cards || [];
          state.revealedCards = {
            fromPlayerId: targetPlayer.id,
            targetPlayerId: playerId,
            cards: targetCards,
            title: `Анализ крови: карты игрока ${targetPlayer.name}`,
          };
          this.addLog(state, `🔬 ${activePlayer.name} провёл анализ крови у ${targetPlayer.name}.`, 'INFO');
        }
        this.advanceToExchange(local, roomId);
        break;
      }

      case 'SUSPICION': {
        if (targetPlayer) {
          const targetCards = local.privateStates[targetPlayer.id]?.cards || [];
          if (targetCards.length > 0) {
            const randomCard = targetCards[Math.floor(Math.random() * targetCards.length)];
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

      case 'SWITCH_PLACES': {
        if (targetPlayer) {
          const tempSeat = activePlayer.seatIndex;
          activePlayer.seatIndex = targetPlayer.seatIndex;
          targetPlayer.seatIndex = tempSeat;
          this.addLog(state, `🔄 ${activePlayer.name} и ${targetPlayer.name} поменялись местами за столом!`, 'INFO');
        }
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
    await this.saveAndSync(roomId, local);
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
    const activePrivate = local.privateStates[playerId];
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
    await this.saveAndSync(roomId, local);
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

    const neighbors = getPlayerNeighbors(state.players, playerId, state.direction, state.doors);
    const targetNeighbor = neighbors.targetNeighbor;
    if (!targetNeighbor) return { success: false, error: 'Нет доступного соседа для обмена.' };

    local.offeredExchangeCard = {
      fromPlayerId: playerId,
      targetPlayerId: targetNeighbor.id,
      card,
    };

    const targetPrivate = local.privateStates[targetNeighbor.id];
    const hasDefense = targetPrivate?.cards.some(c => c.code === 'NO_THANKS' || c.code === 'FEAR');

    if (hasDefense) {
      state.pendingDefense = {
        sourcePlayerId: playerId,
        targetPlayerId: targetNeighbor.id,
        actionCard: card,
        actionType: 'EXCHANGE',
        expiresAt: Date.now() + 15000,
        allowedDefenseCodes: ['NO_THANKS', 'FEAR'],
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
    await this.saveAndSync(roomId, local);
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

    const targetPrivate = local.privateStates[targetPlayerId];
    const sourcePrivate = local.privateStates[offer.fromPlayerId];
    if (!targetPrivate || !sourcePrivate) return { success: false, error: 'Данные игроков не найдены.' };

    const cardIndex = targetPrivate.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, error: 'Карта не найдена.' };
    const targetCard = targetPrivate.cards[cardIndex];

    const validation = validateExchangeCard(targetCard, targetPrivate);
    if (!validation.valid) return { success: false, error: validation.error };

    const sourceCardIndex = sourcePrivate.cards.findIndex(c => c.id === offer.card.id);
    if (sourceCardIndex !== -1) {
      sourcePrivate.cards.splice(sourceCardIndex, 1);
    }
    targetPrivate.cards.splice(cardIndex, 1);

    sourcePrivate.cards.push(targetCard);
    targetPrivate.cards.push(offer.card);

    if (offer.card.code === 'INFECTION' && (sourcePrivate.role === 'THE_THING' || sourcePrivate.role === 'INFECTED')) {
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

    const sourcePlayer = state.players.find(p => p.id === offer.fromPlayerId);
    const targetPlayer = state.players.find(p => p.id === targetPlayerId);

    this.addLog(state, `🤝 ${sourcePlayer?.name} и ${targetPlayer?.name} тайно обменялись картами под столом.`, 'EXCHANGE');

    local.offeredExchangeCard = undefined;
    state.pendingDefense = null;

    const winCheck = evaluateWinConditions(state.players, local.privateStates);
    if (winCheck.gameOver) {
      state.status = 'GAME_OVER';
      state.winner = winCheck.winner;
      state.winningRoleReason = winCheck.reason;
      const roles: Record<string, Role> = {};
      for (const p of state.players) {
        roles[p.id] = local.privateStates[p.id]?.role || 'HUMAN';
      }
      state.finalRoles = roles;
      this.addLog(state, `🏆 ИГРА ОКОНЧЕНА! ${winCheck.reason}`, 'WARNING');
    } else {
      this.endTurn(local, roomId);
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local);
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

      if (card.code === 'MISSED') {
        this.addLog(state, `🛡️ ${defenderPlayer.name} сыграл «МИМО!» и уклонился от огнемёта!`, 'DEFENSE');
        state.pendingDefense = null;
        this.advanceToExchange(local, roomId);
      } else if (card.code === 'NO_THANKS') {
        this.addLog(state, `🙅‍♂️ ${defenderPlayer.name} ответил «НЕТ, СПАСИБО!» и отказался от обмена.`, 'DEFENSE');
        state.pendingDefense = null;
        local.offeredExchangeCard = undefined;
        this.endTurn(local, roomId);
      } else if (card.code === 'FEAR') {
        this.addLog(state, `😱 ${defenderPlayer.name} сыграл «СТРАХ»! Обмен отменен, а предложенная карта раскрыта!`, 'DEFENSE');
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

        const winCheck = evaluateWinConditions(state.players, local.privateStates);
        if (winCheck.gameOver) {
          state.status = 'GAME_OVER';
          state.winner = winCheck.winner;
          state.winningRoleReason = winCheck.reason;
          const roles: Record<string, Role> = {};
          for (const p of state.players) {
            roles[p.id] = local.privateStates[p.id]?.role || 'HUMAN';
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
      }
    }

    state.lastUpdated = Date.now();
    await this.saveAndSync(roomId, local);
    return { success: true };
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

    const currentIdx = living.findIndex(p => p.id === state.currentTurnPlayerId);
    const nextIdx = (currentIdx + (state.direction === 1 ? 1 : -1) + living.length) % living.length;
    const nextPlayer = living[nextIdx];

    if (nextIdx === 0) {
      state.roundNumber += 1;
      state.players.forEach(p => {
        if (p.quarantineTurns > 0) {
          p.quarantineTurns -= 1;
          if (p.quarantineTurns === 0) {
            this.addLog(state, `Карантин игрока ${p.name} истек. Он возвращается в строй.`);
          }
        }
      });
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

    if (actionCard && actionCard.code === 'WHISKEY') {
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

  public getRoomSnapshot(roomId: string): RoomPublicState | null {
    return this.localRooms.get(roomId.toUpperCase().trim())?.publicState || null;
  }
}

export const networkManager = new NetworkManager();
