import { GameCard, PlayerPrivate, PlayerPublic, RoomPublicState, Role } from '@/types/game';
import { getPlayerNeighbors, isDoorBetween, getLivingPlayers } from './rulesEngine';

export interface BotTurnDecision {
  action: 'PLAY' | 'DISCARD';
  cardId: string;
  targetPlayerId?: string;
  selectedDoorIndex?: number;
}

/**
 * Находит безопасную для сброса карту с учетом роли игрока
 * - НЕЧТО никогда не сбрасывается
 * - ЗАРАЖЕНИЕ может сбросить только Зараженный, если у него их больше 1
 * - Человек никогда не сбрасывает Заражение
 */
export function findBestDiscardCandidate(cards: GameCard[], role: Role): GameCard | null {
  const safeCards = cards.filter(c => {
    if (c.code === 'THE_THING') return false;
    if (c.code === 'INFECTION') {
      return role === 'INFECTED' && cards.filter(x => x.code === 'INFECTION').length > 1;
    }
    return true;
  });

  return safeCards[0] || null;
}

/**
 * Принятие решения ботом во время своего хода (Phase: ACTION)
 */
export function decideBotTurnAction(
  botPlayer: PlayerPublic,
  botPrivate: PlayerPrivate,
  state: RoomPublicState
): BotTurnDecision | null {
  const cards = botPrivate.cards;
  if (!cards || cards.length === 0) return null;

  // 1. Если бот в карантине — по правилам играть карты действий запрещено, только сброс
  if (botPlayer.quarantineTurns > 0) {
    const candidate = findBestDiscardCandidate(cards, botPrivate.role);
    if (candidate) {
      return { action: 'DISCARD', cardId: candidate.id };
    }
    return null;
  }

  const living = getLivingPlayers(state.players);
  const currentId = botPlayer.id;
  const neighbors = getPlayerNeighbors(state.players, currentId, state.direction, state.doors);
  const adjacentTargets = [neighbors.leftNeighbor, neighbors.rightNeighbor].filter((p): p is PlayerPublic => Boolean(p && !p.isDead));

  // Приоритет 1: ОГНЕМЁТ
  const flameCard = cards.find(c => c.code === 'FLAMETHROWER');
  if (flameCard) {
    const validTarget = adjacentTargets.find(t => 
      t.quarantineTurns === 0 && !isDoorBetween(state.doors, currentId, t.id, state.players)
    );
    if (validTarget) {
      return { action: 'PLAY', cardId: flameCard.id, targetPlayerId: validTarget.id };
    }
  }

  // Приоритет 2: УПОРСТВО (поиск снабжения)
  const perseveranceCard = cards.find(c => c.code === 'PERSEVERANCE');
  if (perseveranceCard) {
    return { action: 'PLAY', cardId: perseveranceCard.id };
  }

  // Приоритет 3: ТОПОР (срубить смежную дверь или снять карантин)
  const axeCard = cards.find(c => c.code === 'AXE');
  if (axeCard) {
    const doorIdx = state.doors.findIndex(d => 
      d.seatA === botPlayer.seatIndex || d.seatB === botPlayer.seatIndex
    );
    if (doorIdx !== -1) {
      return { action: 'PLAY', cardId: axeCard.id, selectedDoorIndex: doorIdx };
    }
    const quarTarget = adjacentTargets.find(t => t.quarantineTurns > 0);
    if (quarTarget) {
      return { action: 'PLAY', cardId: axeCard.id, targetPlayerId: quarTarget.id };
    }
  }

  // Приоритет 4: АНАЛИЗ КРОВИ или ПОДОЗРЕНИЕ
  const checkCard = cards.find(c => c.code === 'ANALYSIS' || c.code === 'SUSPICION');
  if (checkCard) {
    const validTarget = adjacentTargets.find(t => 
      t.quarantineTurns === 0 && !isDoorBetween(state.doors, currentId, t.id, state.players)
    );
    if (validTarget) {
      return { action: 'PLAY', cardId: checkCard.id, targetPlayerId: validTarget.id };
    }
  }

  // Приоритет 5: ВИСКИ (человек раскрывает карты для доказательства чистоты)
  const whiskeyCard = cards.find(c => c.code === 'WHISKEY');
  if (whiskeyCard && botPrivate.role === 'HUMAN') {
    return { action: 'PLAY', cardId: whiskeyCard.id };
  }

  // Приоритет 6: ГЛЯДИ ПО СТОРОНАМ (смена направления)
  const lookCard = cards.find(c => c.code === 'LOOK_AROUND');
  if (lookCard) {
    return { action: 'PLAY', cardId: lookCard.id };
  }

  // Приоритет 7: СОБЛАЗН (внеочередной обмен)
  const seductionCard = cards.find(c => c.code === 'SEDUCTION');
  if (seductionCard) {
    const otherPlayers = living.filter(p => p.id !== currentId && p.quarantineTurns === 0);
    if (otherPlayers.length > 0) {
      const target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
      return { action: 'PLAY', cardId: seductionCard.id, targetPlayerId: target.id };
    }
  }

  // Приоритет 8: ЗАКОЛОЧЕННАЯ ДВЕРЬ
  const doorCard = cards.find(c => c.code === 'BARRED_DOOR');
  if (doorCard) {
    const openNeighbor = adjacentTargets.find(t => !isDoorBetween(state.doors, currentId, t.id, state.players));
    if (openNeighbor) {
      return { action: 'PLAY', cardId: doorCard.id, targetPlayerId: openNeighbor.id };
    }
  }

  // Приоритет 9: КАРАНТИН
  const quarCard = cards.find(c => c.code === 'QUARANTINE');
  if (quarCard) {
    const validTarget = adjacentTargets.find(t => t.quarantineTurns === 0);
    if (validTarget) {
      return { action: 'PLAY', cardId: quarCard.id, targetPlayerId: validTarget.id };
    }
  }

  // Приоритет 10: СБРОС КАРТЫ (если ничего не сыграно)
  const discardCandidate = findBestDiscardCandidate(cards, botPrivate.role);
  if (discardCandidate) {
    return { action: 'DISCARD', cardId: discardCandidate.id };
  }

  return null;
}

/**
 * Выбор карты защиты ботом
 */
export function decideBotDefenseCard(
  botPrivate: PlayerPrivate,
  allowedDefenseCodes: string[]
): GameCard | null {
  return botPrivate.cards.find(c => allowedDefenseCodes.includes(c.code)) || null;
}

/**
 * Выбор карты ботом для предложения обмена
 */
export function decideBotExchangeOfferCard(botPrivate: PlayerPrivate): GameCard | null {
  // Только Нечто может передавать Заражение!
  if (botPrivate.role === 'THE_THING') {
    const inf = botPrivate.cards.find(c => c.code === 'INFECTION');
    if (inf) return inf;
  }

  // Обычный игрок (Человек / Зараженный) отдает безопасную карту
  const safe = botPrivate.cards.find(c => c.code !== 'THE_THING' && c.code !== 'INFECTION');
  return safe || botPrivate.cards[0] || null;
}

/**
 * Выбор карты ботом для ответа на предложение обмена
 */
export function decideBotExchangeResponseCard(botPrivate: PlayerPrivate): GameCard | null {
  const safe = botPrivate.cards.find(c => c.code !== 'THE_THING' && c.code !== 'INFECTION');
  return safe || botPrivate.cards[0] || null;
}

/**
 * Выбор карты ботом при Цепной реакции
 */
export function decideBotChainReactionCard(botPrivate: PlayerPrivate): GameCard | null {
  if (botPrivate.role === 'THE_THING') {
    const inf = botPrivate.cards.find(c => c.code === 'INFECTION');
    if (inf) return inf;
  }
  const safe = botPrivate.cards.find(c => c.code !== 'THE_THING' && c.code !== 'INFECTION');
  return safe || botPrivate.cards[0] || null;
}
