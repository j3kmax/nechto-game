import { 
  PlayerPublic, 
  PlayerPrivate, 
  GameCard, 
  BarredDoor, 
  RoomPublicState, 
  GameWinner,
  CardCode
} from '@/types/game';

/**
 * Получить список живых игроков в порядке их рассадки за столом
 */
export function getLivingPlayers(players: PlayerPublic[]): PlayerPublic[] {
  return [...players]
    .filter(p => !p.isDead)
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

/**
 * Получить смежных живых соседей (слева и справа) с учетом дверей
 */
export function getPlayerNeighbors(
  players: PlayerPublic[],
  currentId: string,
  direction: 1 | -1,
  doors: BarredDoor[]
): {
  targetNeighbor: PlayerPublic | null;
  leftNeighbor: PlayerPublic | null;
  rightNeighbor: PlayerPublic | null;
  isBlockedByDoor: boolean;
} {
  const living = getLivingPlayers(players);
  if (living.length < 2) {
    return { targetNeighbor: null, leftNeighbor: null, rightNeighbor: null, isBlockedByDoor: false };
  }

  const currentIndex = living.findIndex(p => p.id === currentId);
  if (currentIndex === -1) {
    return { targetNeighbor: null, leftNeighbor: null, rightNeighbor: null, isBlockedByDoor: false };
  }

  const n = living.length;
  // Справа (по часовой стрелке)
  const rightNeighbor = living[(currentIndex + 1) % n];
  // Слева (против часовой стрелки)
  const leftNeighbor = living[(currentIndex - 1 + n) % n];

  // Сосед по текущему направлению хода
  const targetNeighbor = direction === 1 ? rightNeighbor : leftNeighbor;

  // Проверка двери между игроком и целью
  const isBlockedByDoor = isDoorBetween(doors, currentId, targetNeighbor.id, players);

  return {
    targetNeighbor,
    leftNeighbor,
    rightNeighbor,
    isBlockedByDoor,
  };
}

/**
 * Проверка наличия двери между двумя игроками (с учетом физических мест за столом)
 */
export function isDoorBetween(
  doors: BarredDoor[],
  playerAId: string,
  playerBId: string,
  players?: PlayerPublic[]
): boolean {
  if (!doors || doors.length === 0) return false;

  let seatA: number | undefined;
  let seatB: number | undefined;

  if (players) {
    seatA = players.find(p => p.id === playerAId)?.seatIndex;
    seatB = players.find(p => p.id === playerBId)?.seatIndex;
  }

  return doors.some(d => {
    // 1. Проверка по физическим местам стола (официальные правила: двери остаются на местах)
    if (seatA !== undefined && seatB !== undefined && d.seatA !== undefined && d.seatB !== undefined) {
      return (d.seatA === seatA && d.seatB === seatB) || (d.seatA === seatB && d.seatB === seatA);
    }
    // 2. Обратная совместимость по ID игроков (только если места еще не были сохранены)
    if (d.seatA === undefined && d.seatB === undefined && d.playerAId && d.playerBId) {
      return (d.playerAId === playerAId && d.playerBId === playerBId) ||
             (d.playerAId === playerBId && d.playerBId === playerAId);
    }
    return false;
  });
}

/**
 * Валидация возможности сыграть карту
 */
export function validatePlayCard(
  card: GameCard,
  activePlayer: PlayerPublic,
  activePrivate: PlayerPrivate,
  targetPlayer: PlayerPublic | null,
  room: RoomPublicState,
  selectedDoorIndex?: number
): { valid: boolean; error?: string } {
  if (activePlayer.isDead) {
    return { valid: false, error: 'Погибшие игроки не могут совершать действий.' };
  }

  if (activePlayer.quarantineTurns > 0) {
    return { valid: false, error: 'Вы находитесь в карантине и можете только сбросить карту (стр. 13 правил).' };
  }

  if (card.category === 'THE_THING') {
    return { valid: false, error: 'Карту «НЕЧТО» нельзя разыграть как действие.' };
  }

  if (card.category === 'INFECTION') {
    return { valid: false, error: 'Карту «Заражение» нельзя разыгрывать как действие (ее можно только передавать).' };
  }

  if (card.category === 'DEFENSE') {
    return { valid: false, error: 'Карты защиты разыгрываются только во время нападения или обмена.' };
  }

  // Специфические проверки по типам карт
  switch (card.code) {
    case 'FLAMETHROWER': {
      if (!targetPlayer) return { valid: false, error: 'Необходимо выбрать цель для Огнемёта.' };
      if (targetPlayer.isDead) return { valid: false, error: 'Цель уже мертва.' };
      if (targetPlayer.id === activePlayer.id) return { valid: false, error: 'Нельзя сжечь самого себя.' };
      if (targetPlayer.quarantineTurns > 0) return { valid: false, error: 'Цель находится в карантине (защищена от атак соседа).' };
      if (isDoorBetween(room.doors, activePlayer.id, targetPlayer.id, room.players)) {
        return { valid: false, error: 'Проход заколочен дверью. Сначала срубите её топором.' };
      }
      // Должен быть живым соседом
      const neighbors = getPlayerNeighbors(room.players, activePlayer.id, room.direction, room.doors);
      const isNeighbor = neighbors.leftNeighbor?.id === targetPlayer.id || neighbors.rightNeighbor?.id === targetPlayer.id;
      if (!isNeighbor) {
        return { valid: false, error: 'Огнемёт достает только до соседних игроков за столом.' };
      }
      return { valid: true };
    }

    case 'AXE': {
      if (selectedDoorIndex !== undefined && selectedDoorIndex >= 0) {
        return { valid: true };
      }
      if (targetPlayer) {
        if (targetPlayer.quarantineTurns > 0) return { valid: true };
        return { valid: false, error: 'Топором можно либо срубить заколоченную дверь, либо разрушить карантин.' };
      }
      return { valid: false, error: 'Выберите дверь для сруба или игрока в карантине.' };
    }

    case 'ANALYSIS':
    case 'SUSPICION': {
      if (!targetPlayer) return { valid: false, error: 'Необходимо выбрать цель.' };
      if (targetPlayer.isDead) return { valid: false, error: 'Нельзя проверять мертвого.' };
      if (targetPlayer.id === activePlayer.id) return { valid: false, error: 'Нельзя проверять самого себя.' };
      if (targetPlayer.quarantineTurns > 0) return { valid: false, error: 'Цель находится в карантине.' };
      if (isDoorBetween(room.doors, activePlayer.id, targetPlayer.id, room.players)) {
        return { valid: false, error: 'Дверь преграждает доступ к игроку.' };
      }
      const neighbors = getPlayerNeighbors(room.players, activePlayer.id, room.direction, room.doors);
      const isNeighbor = neighbors.leftNeighbor?.id === targetPlayer.id || neighbors.rightNeighbor?.id === targetPlayer.id;
      if (!isNeighbor) {
        return { valid: false, error: 'Действие можно применить только к смежному соседу.' };
      }
      return { valid: true };
    }

    case 'BARRED_DOOR': {
      if (!targetPlayer) return { valid: false, error: 'Выберите соседа, с которым хотите заколотить дверь.' };
      const neighbors = getPlayerNeighbors(room.players, activePlayer.id, room.direction, room.doors);
      const isNeighbor = neighbors.leftNeighbor?.id === targetPlayer.id || neighbors.rightNeighbor?.id === targetPlayer.id;
      if (!isNeighbor) return { valid: false, error: 'Дверь можно установить только между смежными соседями за столом.' };
      if (isDoorBetween(room.doors, activePlayer.id, targetPlayer.id, room.players)) {
        return { valid: false, error: 'Между вами уже установлена заколоченная дверь.' };
      }
      return { valid: true };
    }

    case 'QUARANTINE': {
      if (!targetPlayer) return { valid: false, error: 'Выберите игрока для отправки в карантин.' };
      if (targetPlayer.isDead) return { valid: false, error: 'Нельзя отправить в карантин мертвого.' };
      if (targetPlayer.quarantineTurns > 0) return { valid: false, error: 'Игрок уже находится в карантине.' };
      const neighbors = getPlayerNeighbors(room.players, activePlayer.id, room.direction, room.doors);
      const isNeighbor = neighbors.leftNeighbor?.id === targetPlayer.id || neighbors.rightNeighbor?.id === targetPlayer.id || targetPlayer.id === activePlayer.id;
      if (!isNeighbor) return { valid: false, error: 'Карантин можно наложить на себя или на смежного соседа.' };
      return { valid: true };
    }

    case 'SWITCH_PLACES': {
      if (!targetPlayer) return { valid: false, error: 'Выберите соседа для перемены мест.' };
      if (targetPlayer.quarantineTurns > 0) return { valid: false, error: 'Сосед находится в карантине.' };
      const neighbors = getPlayerNeighbors(room.players, activePlayer.id, room.direction, room.doors);
      const isNeighbor = neighbors.leftNeighbor?.id === targetPlayer.id || neighbors.rightNeighbor?.id === targetPlayer.id;
      if (!isNeighbor) return { valid: false, error: 'Поменяться местами можно только со смежным соседом.' };
      if (isDoorBetween(room.doors, activePlayer.id, targetPlayer.id, room.players)) {
        return { valid: false, error: 'Дверь мешает поменяться местами.' };
      }
      return { valid: true };
    }

    case 'GET_OUT_OF_HERE': {
      if (!targetPlayer) return { valid: false, error: 'Выберите игрока, с которым хотите поменяться местами.' };
      if (targetPlayer.id === activePlayer.id) return { valid: false, error: 'Нельзя поменяться местами с самим собой.' };
      if (targetPlayer.isDead) return { valid: false, error: 'Игрок мертв.' };
      if (targetPlayer.quarantineTurns > 0) return { valid: false, error: 'Игрок находится в карантине (пересесть к нему нельзя).' };
      return { valid: true };
    }

    case 'SEDUCTION': {
      if (!targetPlayer) return { valid: false, error: 'Выберите любого живого игрока для обмена.' };
      if (targetPlayer.id === activePlayer.id) return { valid: false, error: 'Нельзя меняться с самим собой.' };
      if (targetPlayer.isDead) return { valid: false, error: 'Игрок мертв.' };
      if (targetPlayer.quarantineTurns > 0) return { valid: false, error: 'Игрок в карантине не может меняться картами.' };
      return { valid: true };
    }

    case 'LOOK_AROUND':
    case 'CHANGE_DIRECTION':
    case 'WHISKEY':
    case 'PERSEVERANCE':
      return { valid: true };

    default:
      return { valid: true };
  }
}

/**
 * Валидация сброса карты
 */
export function validateDiscardCard(
  card: GameCard,
  privateState: PlayerPrivate
): { valid: boolean; error?: string } {
  if (card.code === 'THE_THING') {
    return { valid: false, error: 'Карту «НЕЧТО» категорически запрещено сбрасывать!' };
  }

  if (card.code === 'INFECTION') {
    if (privateState.role === 'HUMAN') {
      return { valid: false, error: 'Человек не может сбросить карту «Заражение» в отбой (стр. 7 правил)!' };
    }
    if (privateState.role === 'THE_THING') {
      return { valid: false, error: 'Нечто не может сбрасывать карты заражения!' };
    }
    const infectionCount = privateState.cards.filter(c => c.code === 'INFECTION').length;
    if (infectionCount <= 1) {
      return { valid: false, error: 'Зараженный обязан держать как минимум 1 карту заражения и не может её сбросить.' };
    }
  }

  return { valid: true };
}

/**
 * Валидация передачи карты при обмене
 */
export function validateExchangeCard(
  card: GameCard,
  privateState: PlayerPrivate
): { valid: boolean; error?: string } {
  if (card.code === 'THE_THING') {
    return { valid: false, error: 'Карту «НЕЧТО» нельзя передавать другим игрокам.' };
  }

  if (card.code === 'INFECTION') {
    // Только Нечто может передавать карту Заражения
    if (privateState.role === 'THE_THING') {
      return { valid: true };
    }
    // Человек и Зараженный НЕ МОГУТ передавать заражение
    return { valid: false, error: 'Только Нечто может передавать карты Заражения!' };
  }

  return { valid: true };
}

/**
 * Проверка условий победы
 */
export function evaluateWinConditions(
  players: PlayerPublic[],
  allPrivateHands: Record<string, PlayerPrivate>
): { gameOver: boolean; winner: GameWinner; reason: string } {
  const livingPlayers = players.filter(p => !p.isDead);
  if (livingPlayers.length === 0) {
    return {
      gameOver: true,
      winner: 'THE_THING',
      reason: 'Все исследователи погибли в ледяной пустоши.',
    };
  }

  // Находим Нечто
  let theThingPlayer: PlayerPublic | null = null;
  let theThingId = '';

  for (const p of players) {
    const priv = allPrivateHands[p.id];
    if (priv && priv.role === 'THE_THING') {
      theThingPlayer = p;
      theThingId = p.id;
      break;
    }
  }

  // 1. Если Нечто мертво -> ПОБЕДА ЛЮДЕЙ!
  if (theThingPlayer && theThingPlayer.isDead) {
    return {
      gameOver: true,
      winner: 'HUMANS',
      reason: 'Монстр «Нечто» успешно уничтожен огнемётом! Человечество спасено от заражения!',
    };
  }

  // 2. Проверяем живых людей
  const livingHumans = livingPlayers.filter(p => {
    const priv = allPrivateHands[p.id];
    return priv && priv.role === 'HUMAN';
  });

  // Если живых здоровых людей не осталось -> ПОБЕДА НЕЧТО!
  if (livingHumans.length === 0) {
    return {
      gameOver: true,
      winner: 'THE_THING',
      reason: 'Все выжившие исследователи заражены или погибли. Нечто поглотило всю экспедицию!',
    };
  }

  // Если осталось всего 2 игрока и один из них Нечто, а второй заражен
  const livingNonInfected = livingPlayers.filter(p => {
    const priv = allPrivateHands[p.id];
    return priv && (priv.role === 'HUMAN');
  });

  if (livingNonInfected.length === 0) {
    return {
      gameOver: true,
      winner: 'THE_THING',
      reason: 'Все выжившие на станции перешли на сторону Нечто.',
    };
  }

  return { gameOver: false, winner: null, reason: '' };
}
