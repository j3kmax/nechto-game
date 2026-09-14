import { GameCard, CardCode, PlayerPrivate, Role } from '@/types/game';
import { CARD_DEFINITIONS } from './cardsData';

function generateCard(code: CardCode, uniqueIndex: number): GameCard {
  const def = CARD_DEFINITIONS[code];
  return {
    id: `${code}_${uniqueIndex}_${Math.random().toString(36).substring(2, 7)}`,
    code,
    name: def.name,
    category: def.category,
    description: def.description,
    flavorText: def.flavorText,
  };
}

function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface DeckBuildResult {
  playerHands: Record<string, PlayerPrivate>;
  drawDeck: GameCard[];
  theThingPlayerId: string;
}

/**
 * Сборка и раздача колоды «НЕЧТО» по официальным правилам:
 * 1. 1 карта «Нечто» + (4 * N - 1) базовых карт замешиваются.
 * 2. Каждому из N игроков раздаётся по 4 карты. Ровно один получает «Нечто».
 * 3. (N - 1) карт «Заражение» + карты Паники и оставшиеся действия замешиваются в колоду добора.
 */
export function setupGameDeck(playerIds: string[]): DeckBuildResult {
  const numPlayers = playerIds.length;
  let cardSeq = 1;

  // Базовый пул безопасных карт для стартовой раздачи
  const initialSafeCards: GameCard[] = [];
  
  // Добавляем карты действий, защиты и препятствий
  const safeTemplates: { code: CardCode; count: number }[] = [
    { code: 'FLAMETHROWER', count: Math.max(3, Math.floor(numPlayers * 0.8)) },
    { code: 'AXE', count: Math.max(2, Math.floor(numPlayers * 0.5)) },
    { code: 'NO_THANKS', count: Math.max(3, Math.floor(numPlayers * 0.8)) },
    { code: 'MISSED', count: Math.max(3, Math.floor(numPlayers * 0.8)) },
    { code: 'FEAR', count: Math.max(2, Math.floor(numPlayers * 0.5)) },
    { code: 'BARRED_DOOR', count: Math.max(3, Math.floor(numPlayers * 0.6)) },
    { code: 'QUARANTINE', count: Math.max(2, Math.floor(numPlayers * 0.5)) },
    { code: 'ANALYSIS', count: Math.max(2, Math.floor(numPlayers * 0.5)) },
    { code: 'SUSPICION', count: Math.max(3, Math.floor(numPlayers * 0.7)) },
    { code: 'WHISKEY', count: Math.max(2, Math.floor(numPlayers * 0.4)) },
    { code: 'SEDUCTION', count: Math.max(2, Math.floor(numPlayers * 0.4)) },
    { code: 'SWITCH_PLACES', count: Math.max(2, Math.floor(numPlayers * 0.5)) },
    { code: 'PERSEVERANCE', count: Math.max(2, Math.floor(numPlayers * 0.5)) },
  ];

  for (const { code, count } of safeTemplates) {
    for (let i = 0; i < count; i++) {
      initialSafeCards.push(generateCard(code, cardSeq++));
    }
  }

  // Перемешиваем безопасные карты
  const shuffledSafe = shuffle(initialSafeCards);

  // Нам нужно (4 * numPlayers - 1) карт для стартовой раздачи
  const neededInitialSafe = numPlayers * 4 - 1;
  const initialPool: GameCard[] = shuffledSafe.slice(0, neededInitialSafe);
  const leftoverSafe: GameCard[] = shuffledSafe.slice(neededInitialSafe);

  // Добавляем 1 карту Нечто
  const theThingCard = generateCard('THE_THING', cardSeq++);
  initialPool.push(theThingCard);

  // Тщательно перемешиваем стартовую стопку
  const shuffledStartPool = shuffle(initialPool);

  // Раздаем каждому по 4 карты
  const playerHands: Record<string, PlayerPrivate> = {};
  let theThingPlayerId = '';

  for (let i = 0; i < numPlayers; i++) {
    const pId = playerIds[i];
    const cards = shuffledStartPool.slice(i * 4, (i + 1) * 4);
    const hasTheThing = cards.some(c => c.code === 'THE_THING');
    
    if (hasTheThing) {
      theThingPlayerId = pId;
    }

    const role: Role = hasTheThing ? 'THE_THING' : 'HUMAN';
    playerHands[pId] = {
      role,
      cards,
    };
  }

  // Формируем колоду добора (Draw Deck)
  const drawDeckPool: GameCard[] = [...leftoverSafe];

  // Добавляем ровно (numPlayers - 1) карт Заражения
  const infectionCount = numPlayers - 1;
  for (let i = 0; i < infectionCount; i++) {
    drawDeckPool.push(generateCard('INFECTION', cardSeq++));
  }

  // Добавляем карты Паники
  const panicCount = Math.max(3, Math.floor(numPlayers * 0.7));
  for (let i = 0; i < panicCount; i++) {
    drawDeckPool.push(generateCard('CHANGE_DIRECTION', cardSeq++));
    drawDeckPool.push(generateCard('BLIND_FAITH', cardSeq++));
  }

  // Дополнительные огнеметы и топоры для остроты игры
  for (let i = 0; i < 2; i++) {
    drawDeckPool.push(generateCard('FLAMETHROWER', cardSeq++));
    drawDeckPool.push(generateCard('AXE', cardSeq++));
    drawDeckPool.push(generateCard('NO_THANKS', cardSeq++));
    drawDeckPool.push(generateCard('MISSED', cardSeq++));
  }

  const finalDrawDeck = shuffle(drawDeckPool);

  return {
    playerHands,
    drawDeck: finalDrawDeck,
    theThingPlayerId,
  };
}
