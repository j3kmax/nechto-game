import { GameCard, CardCode, PlayerPrivate, Role } from '@/types/game';
import { CARD_DEFINITIONS } from './cardsData';

function generateCard(code: CardCode, uniqueIndex: number): GameCard {
  const def = CARD_DEFINITIONS[code];
  if (!def) {
    throw new Error(`Определение для карты с кодом ${code} не найдено!`);
  }
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
  totalCardsCount: number;
}

/**
 * Сборка и раздача колоды «НЕЧТО» по точным спецификациям для 4 и 5 игроков:
 * 
 * ДЛЯ 4 ИГРОКОВ (Всего 35 карт, маркировка "4"):
 * 1. 1x «Нечто»
 * 2. 8x «Заражение!»
 * 3. 4x Паника («Забывчивость», «Свидание вслепую», «Цепная реакция», «...Три, четыре... открывайте дверь пошире!»)
 * 4. 22x Действия/Защита/Препятствия
 * Стартовая раздача (16 карт): 1 «Нечто» + 15 случайных из 22 безопасных (по 4 каждому).
 * Колода добора (19 карт): 7 оставшихся безопасных + 8 Заражений + 4 Паники.
 * 
 * ДЛЯ 5 ИГРОКОВ (Всего 41 карта, маркировка "4" + 6 карт с маркировкой "5"):
 * Добавляются ровно 6 карт:
 * - 1x «Карантин» (OBSTACLE)
 * - 1x «Анализ» (ACTION)
 * - 1x «Страх» (DEFENSE)
 * - 1x «Раз, два... Нечто поднялось со дна!» (PANIC)
 * - 1x «И это вы называете вечеринкой?» (PANIC)
 * - 1x «Убирайся прочь!» (PANIC)
 * Стартовая раздача (20 карт): 1 «Нечто» + 19 случайных из 25 безопасных (по 4 каждому).
 * Колода добора (21 карта): 6 оставшихся безопасных + 8 Заражений + 7 Паник.
 */
export function setupGameDeck(playerIds: string[]): DeckBuildResult {
  const numPlayers = playerIds.length;
  if (numPlayers !== 4 && numPlayers !== 5) {
    throw new Error(`Данный режим поддерживает строго 4 или 5 игроков. Текущее число: ${numPlayers}`);
  }

  let cardSeq = 1;

  // 1. Формируем 22 базовые карты Действий, Защиты и Препятствий (маркировка "4")
  const base22SafeTemplates: { code: CardCode; count: number }[] = [
    { code: 'FLAMETHROWER', count: 2 },
    { code: 'AXE', count: 1 },
    { code: 'BARRED_DOOR', count: 1 },
    { code: 'SUSPICION', count: 4 },
    { code: 'PERSEVERANCE', count: 2 },
    { code: 'SWITCH_PLACES', count: 2 },
    { code: 'GET_OUT_OF_HERE', count: 2 },
    { code: 'SEDUCTION', count: 2 },
    { code: 'WHISKEY', count: 1 },
    { code: 'LOOK_AROUND', count: 1 },
    { code: 'NO_BARBECUE', count: 1 },
    { code: 'IM_FINE_HERE', count: 1 },
    { code: 'NO_THANKS', count: 1 },
    { code: 'MISSED', count: 1 },
  ];

  const safePool: GameCard[] = [];
  for (const { code, count } of base22SafeTemplates) {
    for (let i = 0; i < count; i++) {
      safePool.push(generateCard(code, cardSeq++));
    }
  }

  // 2. Базовые 4 карты паники (маркировка "4")
  const panicCardsPool: GameCard[] = [
    generateCard('PANIC_FORGETFULNESS', cardSeq++),
    generateCard('PANIC_BLIND_DATE', cardSeq++),
    generateCard('PANIC_CHAIN_REACTION', cardSeq++),
    generateCard('PANIC_OPEN_DOORS', cardSeq++),
  ];

  // 3. Если 5 игроков — добавляем 6 специальных карт модуля расширения "5"
  if (numPlayers === 5) {
    // 3 безопасные карты добавляются в безопасный пул (всего становится 25)
    safePool.push(generateCard('QUARANTINE', cardSeq++));
    safePool.push(generateCard('ANALYSIS', cardSeq++));
    safePool.push(generateCard('FEAR', cardSeq++));

    // 3 карты паники добавляются в пул паники (всего становится 7)
    panicCardsPool.push(generateCard('PANIC_ONE_TWO_5', cardSeq++));
    panicCardsPool.push(generateCard('PANIC_PARTY_5', cardSeq++));
    panicCardsPool.push(generateCard('PANIC_GET_AWAY_5', cardSeq++));
  }

  // 4. Карты Заражения (всегда ровно 8 карт с маркировкой "4")
  const infectionCards: GameCard[] = [];
  for (let i = 0; i < 8; i++) {
    infectionCards.push(generateCard('INFECTION', cardSeq++));
  }

  // 5. Карта Нечто (ровно 1 карта)
  const theThingCard = generateCard('THE_THING', cardSeq++);

  // 6. Формирование стартовой раздачи
  // Для 4 игроков: 15 безопасных карт + 1 Нечто = 16 карт
  // Для 5 игроков: 19 безопасных карт + 1 Нечто = 20 карт
  const neededSafeCount = numPlayers * 4 - 1; // 15 для 4 игроков, 19 для 5 игроков
  const shuffledSafePool = shuffle(safePool);

  const startingSafeCards = shuffledSafePool.slice(0, neededSafeCount);
  const leftoverSafeCards = shuffledSafePool.slice(neededSafeCount);

  const startingHandPool = shuffle([...startingSafeCards, theThingCard]);

  // Раздаем ровно по 4 карты каждому игроку
  const playerHands: Record<string, PlayerPrivate> = {};
  let theThingPlayerId = '';

  for (let i = 0; i < numPlayers; i++) {
    const pId = playerIds[i];
    const cards = startingHandPool.slice(i * 4, (i + 1) * 4);
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

  // 7. Формирование колоды добора (Draw Deck)
  // Для 4 игроков: 7 оставшихся безопасных + 8 Заражений + 4 Паники = 19 карт
  // Для 5 игроков: 6 оставшихся безопасных + 8 Заражений + 7 Паник = 21 карта
  const drawDeckPool = [...leftoverSafeCards, ...infectionCards, ...panicCardsPool];
  const finalDrawDeck = shuffle(drawDeckPool);

  const totalCardsCount = numPlayers * 4 + finalDrawDeck.length;

  return {
    playerHands,
    drawDeck: finalDrawDeck,
    theThingPlayerId,
    totalCardsCount,
  };
}
