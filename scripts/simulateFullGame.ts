import { setupGameDeck } from '../src/game/deckBuilder';
import { 
  getPlayerNeighbors, 
  getLivingPlayers, 
  validatePlayCard, 
  validateDiscardCard, 
  validateExchangeCard,
  evaluateWinConditions,
  isDoorBetween 
} from '../src/game/rulesEngine';
import { GameCard, PlayerPublic, PlayerPrivate, RoomPublicState, Role } from '../src/types/game';

function runSimulationForPlayers(playerCount: 4 | 5) {
  console.log(`\n=============================================================`);
  console.log(`=== ТЕСТИРОВАНИЕ И СИМУЛЯЦИЯ ИГРЫ «НЕЧТО» НА ${playerCount} ИГРОКОВ ===`);
  console.log(`=============================================================\n`);

  const playerIds = playerCount === 4 
    ? ['p1_alex', 'p2_boris', 'p3_claire', 'p4_dmitry']
    : ['p1_alex', 'p2_boris', 'p3_claire', 'p4_dmitry', 'p5_elena'];

  const playerNames = playerCount === 4
    ? ['Алекс', 'Борис', 'Клэр', 'Дмитрий']
    : ['Алекс', 'Борис', 'Клэр', 'Дмитрий', 'Елена'];

  // 1. Инициализация колоды и стартовой раздачи
  const { playerHands, drawDeck, theThingPlayerId, totalCardsCount } = setupGameDeck(playerIds);

  const expectedTotal = playerCount === 4 ? 35 : 41;
  const expectedStartingDealt = playerCount * 4;
  const expectedDrawDeck = expectedTotal - expectedStartingDealt;

  console.log(`[Колода] Число игроков: ${playerCount}`);
  console.log(`[Колода] Всего карт: ${totalCardsCount} (Ожидалось: ${expectedTotal})`);
  console.log(`[Колода] Роздано на руки: ${expectedStartingDealt}`);
  console.log(`[Колода] В колоде добора: ${drawDeck.length} (Ожидалось: ${expectedDrawDeck})`);
  console.log(`[Колода] Игрок с картой «НЕЧТО»: ${theThingPlayerId}`);

  if (totalCardsCount !== expectedTotal) {
    throw new Error(`ОШИБКА: Общее число карт ${totalCardsCount} не равно ожидаемому ${expectedTotal}!`);
  }
  if (drawDeck.length !== expectedDrawDeck) {
    throw new Error(`ОШИБКА: Колода добора ${drawDeck.length} не равна ожидаемой ${expectedDrawDeck}!`);
  }

  // Проверяем состав колоды
  const allCards: GameCard[] = [...drawDeck];
  for (const pId of playerIds) {
    allCards.push(...playerHands[pId].cards);
  }

  const theThingCards = allCards.filter(c => c.code === 'THE_THING');
  const infectionCards = allCards.filter(c => c.code === 'INFECTION');
  const panicCards = allCards.filter(c => c.category === 'PANIC');

  console.log(`[Проверка состава] Карты «Нечто»: ${theThingCards.length} (Ожидалось: 1)`);
  console.log(`[Проверка состава] Карты «Заражение!»: ${infectionCards.length} (Ожидалось: 8)`);
  console.log(`[Проверка состава] Карты «Паника»: ${panicCards.length} (Ожидалось: ${playerCount === 4 ? 4 : 7})`);

  if (theThingCards.length !== 1) throw new Error('ОШИБКА: Должна быть ровно 1 карта Нечто!');
  if (infectionCards.length !== 8) throw new Error('ОШИБКА: Должно быть ровно 8 карт Заражения!');
  if (playerCount === 4 && panicCards.length !== 4) throw new Error('ОШИБКА: Для 4 игроков должно быть ровно 4 карты Паники!');
  if (playerCount === 5 && panicCards.length !== 7) throw new Error('ОШИБКА: Для 5 игроков должно быть ровно 7 карт Паники!');

  if (playerCount === 5) {
    const hasQuarantine = allCards.some(c => c.code === 'QUARANTINE');
    const hasAnalysis = allCards.some(c => c.code === 'ANALYSIS');
    const hasFear = allCards.some(c => c.code === 'FEAR');
    const hasOneTwo = allCards.some(c => c.code === 'PANIC_ONE_TWO_5');
    const hasParty = allCards.some(c => c.code === 'PANIC_PARTY_5');
    const hasGetAway = allCards.some(c => c.code === 'PANIC_GET_AWAY_5');

    if (!hasQuarantine || !hasAnalysis || !hasFear || !hasOneTwo || !hasParty || !hasGetAway) {
      throw new Error('ОШИБКА: Не все 6 карт модуля расширения «5» присутствуют в колоде на 5 игроков!');
    }
    console.log(`[Проверка модуля 5] Все 6 карт («Карантин», «Анализ», «Страх», 3 карты Паники) присутствуют!`);
  }

  // Создаем публичное состояние игроков
  const players: PlayerPublic[] = playerIds.map((id, idx) => ({
    id,
    name: playerNames[idx],
    avatar: 'explorer',
    seatIndex: idx,
    isHost: idx === 0,
    isBot: true,
    handCount: playerHands[id].cards.length,
    isDead: false,
    quarantineTurns: 0,
    isConnected: true,
  }));

  const state: RoomPublicState = {
    roomId: `TEST_${playerCount}`,
    hostId: playerIds[0],
    status: 'PLAYING',
    phase: 'ACTION',
    players,
    currentTurnPlayerId: playerIds[0],
    roundNumber: 1,
    direction: 1,
    doors: [],
    discardPile: [],
    deckCount: drawDeck.length,
    pendingDefense: null,
    winner: null,
    logs: [],
    settings: { maxPlayers: playerCount, allowBots: true, turnTimerSeconds: 60 },
    lastUpdated: Date.now(),
  };

  // Проверка стартового инварианта
  for (const p of players) {
    const priv = playerHands[p.id];
    if (priv.cards.length !== 4) {
      throw new Error(`ОШИБКА: Игрок ${p.name} стартовал с ${priv.cards.length} картами вместо 4!`);
    }
  }
  console.log('✔ Стартовый инвариант подтверждён: у каждого по 4 карты на руках.\n');

  // Симуляция игрового процесса
  let fullDeck = [...drawDeck];
  let turnCount = 0;
  const MAX_TURNS = 35;

  while (turnCount < MAX_TURNS) {
    turnCount++;
    const activePlayer = players.find(p => p.id === state.currentTurnPlayerId)!;
    const activePrivate = playerHands[activePlayer.id];

    console.log(`--- [Ход #${turnCount}] Полярник: ${activePlayer.name} (Роль: ${activePrivate.role}, карт: ${activePrivate.cards.length}, Карантин: ${activePlayer.quarantineTurns}) ---`);

    // ШАГ 1: Добор 1 карты
    if (fullDeck.length === 0) {
      if (state.discardPile.length > 0) {
        console.log('  [Колода] Колода опустела. Замешиваем сброс в новую колоду.');
        fullDeck = [...state.discardPile].sort(() => Math.random() - 0.5);
        state.discardPile = [];
      }
    }

    let drawnCard: GameCard | null = fullDeck.shift() || null;
    state.deckCount = fullDeck.length;

    let panicEndedTurn = false;

    while (drawnCard && drawnCard.category === 'PANIC') {
      console.log(`  [ПАНИКА!] «${drawnCard.name}» срабатывает немедленно и уходит в сброс!`);
      state.discardPile.unshift(drawnCard);

      if (drawnCard.code === 'PANIC_OPEN_DOORS') {
        state.doors = [];
        console.log(`  [Эффект] Все двери сорваны с петель!`);
      } else if (drawnCard.code === 'PANIC_PARTY_5' || drawnCard.code === 'PARTY_OVER') {
        state.doors = [];
        players.forEach(p => { p.quarantineTurns = 0; });
        console.log(`  [Эффект] Двери и карантины сняты, попарная смена мест!`);
      } else if (drawnCard.code === 'PANIC_CHAIN_REACTION') {
        console.log(`  [Эффект] Цепная реакция: передача по кругу и завершение хода!`);
        panicEndedTurn = true;
        break;
      } else if (drawnCard.code === 'PANIC_BLIND_DATE') {
        console.log(`  [Эффект] Свидание вслепую: смена карты с колодой и завершение хода!`);
        panicEndedTurn = true;
        break;
      } else if (drawnCard.code === 'PANIC_FORGETFULNESS') {
        console.log(`  [Эффект] Забывчивость: сброс карт и обновление руки.`);
      }

      // После не-терминирующей паники добираем еще
      if (fullDeck.length === 0 && state.discardPile.length > 0) {
        fullDeck = [...state.discardPile].sort(() => Math.random() - 0.5);
        state.discardPile = [];
      }
      drawnCard = fullDeck.shift() || null;
      state.deckCount = fullDeck.length;
    }

    if (panicEndedTurn) {
      // Ход завершился от паники
    } else {
      if (drawnCard) {
        activePrivate.cards.push(drawnCard);
        activePlayer.handCount = activePrivate.cards.length;
        console.log(`  [Добор] Взята карта: «${drawnCard.name}» (${drawnCard.category}). Рука: ${activePrivate.cards.length}`);
      }

      // ШАГ 2: Розыгрыш действия или тайный сброс
      const neighbors = getPlayerNeighbors(players, activePlayer.id, state.direction, state.doors);
      const actionCard = activePrivate.cards.find(c => 
        c.category === 'ACTION' && 
        activePlayer.quarantineTurns === 0 &&
        (c.code === 'WHISKEY' || c.code === 'LOOK_AROUND' || c.code === 'BARRED_DOOR')
      );

      if (actionCard && actionCard.code === 'WHISKEY') {
        activePrivate.cards.splice(activePrivate.cards.indexOf(actionCard), 1);
        state.discardPile.unshift(actionCard);
        console.log(`  [Действие] ${activePlayer.name} сыграл «Виски» (сброшено в отбой).`);
      } else if (actionCard && actionCard.code === 'LOOK_AROUND') {
        activePrivate.cards.splice(activePrivate.cards.indexOf(actionCard), 1);
        state.discardPile.unshift(actionCard);
        state.direction = state.direction === 1 ? -1 : 1;
        console.log(`  [Действие] ${activePlayer.name} сыграл «Гляди по сторонам»! Направление сменилось на ${state.direction === 1 ? 'по часовой' : 'против часовой'}.`);
      } else {
        // Сброс 1 карты лицевой стороной вниз
        const discardIdx = activePrivate.cards.findIndex(c => 
          c.code !== 'THE_THING' && 
          !(c.code === 'INFECTION' && activePrivate.role === 'INFECTED' && activePrivate.cards.filter(k => k.code === 'INFECTION').length <= 1)
        );
        const discarded = activePrivate.cards.splice(discardIdx !== -1 ? discardIdx : 0, 1)[0];
        state.discardPile.unshift(discarded);
        console.log(`  [Сброс] ${activePlayer.name} тайно сбросил карту в отбой. Рука: ${activePrivate.cards.length}`);
      }

      activePlayer.handCount = activePrivate.cards.length;
      if (activePrivate.cards.length !== 4) {
        throw new Error(`ОШИБКА: После действия у ${activePlayer.name} ${activePrivate.cards.length} карт вместо 4!`);
      }

      // ШАГ 3: Обмен картами со следующим соседом
      const currentNeighbors = getPlayerNeighbors(players, activePlayer.id, state.direction, state.doors);
      const targetNeighbor = currentNeighbors.targetNeighbor;
      const isBlocked = currentNeighbors.isBlockedByDoor;

      if (activePlayer.quarantineTurns > 0) {
        console.log(`  [Обмен] ${activePlayer.name} в карантине — обмен не проводится.`);
      } else if (isBlocked) {
        console.log(`  [Обмен] Дверь блокирует обмен с ${targetNeighbor?.name}.`);
      } else if (targetNeighbor && targetNeighbor.quarantineTurns > 0) {
        console.log(`  [Обмен] Сосед ${targetNeighbor.name} в карантине — обмен не проводится.`);
      } else if (targetNeighbor && !targetNeighbor.isDead) {
        const targetPrivate = playerHands[targetNeighbor.id];

        let offerIdx = activePrivate.cards.findIndex(c => c.code === 'INFECTION' && (activePrivate.role === 'THE_THING' || activePrivate.role === 'INFECTED'));
        if (offerIdx === -1) {
          offerIdx = activePrivate.cards.findIndex(c => c.code !== 'THE_THING' && (c.code !== 'INFECTION' || activePrivate.role !== 'HUMAN'));
        }
        if (offerIdx === -1) offerIdx = 0;

        // Проверка защиты
        const defIdx = targetPrivate.cards.findIndex(c => c.code === 'NO_THANKS' || c.code === 'FEAR' || c.code === 'MISSED');
        if (defIdx !== -1 && Math.random() < 0.4) {
          const defCard = targetPrivate.cards.splice(defIdx, 1)[0];
          state.discardPile.unshift(defCard);
          // Добор взамен защиты
          if (fullDeck.length === 0 && state.discardPile.length > 0) {
            fullDeck = [...state.discardPile].sort(() => Math.random() - 0.5);
            state.discardPile = [];
          }
          const repl = fullDeck.shift();
          if (repl) targetPrivate.cards.push(repl);
          targetNeighbor.handCount = targetPrivate.cards.length;
          console.log(`  [Защита] ${targetNeighbor.name} сыграл «${defCard.name}» и отклонил обмен! Добрал 1 карту.`);
        } else {
          // Обмен успешен
          const given = activePrivate.cards.splice(offerIdx, 1)[0];
          let respIdx = targetPrivate.cards.findIndex(c => c.code !== 'THE_THING' && c.code !== 'INFECTION');
          if (respIdx === -1) respIdx = 0;
          const returned = targetPrivate.cards.splice(respIdx, 1)[0];

          activePrivate.cards.push(returned);
          targetPrivate.cards.push(given);

          if (given.code === 'INFECTION' && (activePrivate.role === 'THE_THING' || activePrivate.role === 'INFECTED')) {
            if (targetPrivate.role === 'HUMAN') {
              targetPrivate.role = 'INFECTED';
              console.log(`  ☣️ [ЗАРАЖЕНИЕ] ${targetNeighbor.name} заражён через обмен!`);
            }
          }
          console.log(`  [Обмен] Тайный обмен между ${activePlayer.name} и ${targetNeighbor.name} завершён.`);
        }
      }
    }

    // ИНВАРИАНТ: В конце хода у ВСЕХ живых полярников ровно 4 карты
    for (const p of players) {
      if (p.isDead) continue;
      const priv = playerHands[p.id];
      p.handCount = priv.cards.length;
      if (priv.cards.length !== 4) {
        throw new Error(`КРИТИЧЕСКАЯ ОШИБКА: Игрок ${p.name} завершил ход #${turnCount} с ${priv.cards.length} картами (должно быть строго 4)!`);
      }
    }

    // Проверка победы
    const win = evaluateWinConditions(players, playerHands);
    if (win.gameOver) {
      console.log(`\n🏆🏆🏆 ИГРА ОКОНЧЕНА на ходу #${turnCount}! Победитель: ${win.winner} (${win.reason})\n`);
      break;
    }

    // Снижение карантина
    if (activePlayer.quarantineTurns > 0) {
      activePlayer.quarantineTurns--;
    }

    // Переход хода
    const living = getLivingPlayers(players);
    const currIdx = living.findIndex(p => p.id === state.currentTurnPlayerId);
    const nextIdx = (currIdx + (state.direction === 1 ? 1 : -1) + living.length) % living.length;
    state.currentTurnPlayerId = living[nextIdx].id;
  }

  console.log(`✔ Симуляция на ${playerCount} игроков завершена успешно без единой ошибки!`);
}

// Запуск тестов на 4 и 5 игроков
console.log('НАЧАЛО ПОЛНОГО КОМПЛЕКСА ТЕСТОВ (4 и 5 игроков)');
runSimulationForPlayers(4);
runSimulationForPlayers(5);
console.log('\n🎉 ВСЕ ТЕСТЫ ДЛЯ 4 И 5 ИГРОКОВ УСПЕШНО ПРОЙДЕНЫ! 🎉\n');
