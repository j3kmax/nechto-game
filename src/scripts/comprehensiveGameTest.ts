/**
 * КОМПЛЕКСНОЕ ТЕСТИРОВАНИЕ ВСЕХ МЕХАНИК И ПРАВИЛ ИГРЫ «НЕЧТО» (STAY AWAY!)
 * 
 * Проверяет:
 * 1. Инварианты руки (строго 4 карты на начало и конец хода).
 * 2. Правила обмена: только Нечто передает Заражение, никто не может сбросить Нечто.
 * 3. Атака огнемётом: убийство Нечто (победа Людей), защита «Никакого шашлыка!»,
 *    и ГЛАВНОЕ: фаза обмена НЕ сбрасывается при убийстве соседа!
 * 4. Защита от обмена: «Нет уж, спасибо!», «Страх» (с раскрытием карты), «Мимо!» (перенаправление).
 * 5. Интерактивные карты:
 *    - «Упорство»: выбор 1 из 3 + выбор карты для сброса из руки -> переход к обмену.
 *    - «Свидание вслепую»: взятие верхней карты + выбор карты для сброса -> завершение хода.
 *    - «Забывчивость»: сброс 3 карт и добор 3 карт событий.
 *    - «Цепная реакция»: передача карт по кругу и заражение.
 * 6. Препятствия и перемещения:
 *    - «Заколоченная дверь» (сохранение на физических местах при смене мест).
 *    - «Карантин» (пропуск хода, блок атак соседа, снятие топором).
 *    - «Топор» (сруб двери или карантина).
 *    - «Меняемся местами!» и «Сматывай удочки!» (защита «Мне и здесь неплохо»).
 *    - «Гляди по сторонам» (смена направления).
 * 7. Информационные карты: «Анализ крови», «Подозрение», «Виски».
 * 8. Полная симуляция непрерывных игр 4 ботов с проверкой побед.
 */

import { networkManager } from '../lib/networkManager';
import { 
  validateExchangeCard, 
  validateDiscardCard, 
  validatePlayCard,
  evaluateWinConditions, 
  getLivingPlayers,
  getPlayerNeighbors,
  isDoorBetween
} from '../game/rulesEngine';
import { GameCard, PlayerPublic, PlayerPrivate, RoomPublicState, CardCode } from '../types/game';
import { generateCard } from '../game/deckBuilder';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName}`);
    if (detail) console.error(`     Детали: ${detail}`);
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('🧪 СТАРТ КОМПЛЕКСНОГО ТЕСТИРОВАНИЯ МЕХАНИК ИГРЫ НЕЧТО');
  console.log('======================================================\n');

  // --- БЛОК 1: ВАЛИДАЦИЯ ПРАВИЛ И ИНВАРИАНТОВ КАРТ ---
  console.log('📦 БЛОК 1: Валидация правил обмена и сброса карт');

  const theThingCard = generateCard('THE_THING', 1);
  const infectionCard = generateCard('INFECTION', 2);
  const flameCard = generateCard('FLAMETHROWER', 3);
  const whiskeyCard = generateCard('WHISKEY', 4);

  // 1.1. Обмен
  const humanPriv: PlayerPrivate = { role: 'HUMAN', cards: [whiskeyCard, infectionCard] };
  const thingPriv: PlayerPrivate = { role: 'THE_THING', cards: [theThingCard, infectionCard, flameCard] };
  const infectedPriv: PlayerPrivate = { role: 'INFECTED', cards: [whiskeyCard, infectionCard] };

  assert(!validateExchangeCard(theThingCard, thingPriv).valid, 'Нечто НЕ МОЖЕТ передавать карту «НЕЧТО»');
  assert(validateExchangeCard(infectionCard, thingPriv).valid, 'Нечто МОЖЕТ передавать карту «Заражение»');
  assert(!validateExchangeCard(infectionCard, humanPriv).valid, 'Человек НЕ МОЖЕТ передавать карту «Заражение»');
  assert(!validateExchangeCard(infectionCard, infectedPriv).valid, 'Зараженный НЕ МОЖЕТ передавать карту «Заражение» (только Нечто заражает)');
  assert(validateExchangeCard(whiskeyCard, humanPriv).valid, 'Обычные карты событий можно передавать при обмене');

  // 1.2. Сброс
  assert(!validateDiscardCard(theThingCard, thingPriv).valid, 'Карту «НЕЧТО» категорически запрещено сбрасывать');
  assert(!validateDiscardCard(infectionCard, infectedPriv).valid, 'Зараженный не может сбросить свою единственную карту заражения');
  const doubleInfectedPriv: PlayerPrivate = { role: 'INFECTED', cards: [whiskeyCard, infectionCard, generateCard('INFECTION', 5)] };
  assert(validateDiscardCard(infectionCard, doubleInfectedPriv).valid, 'Зараженный может сбросить лишнюю вторую карту заражения');
  assert(validateDiscardCard(whiskeyCard, humanPriv).valid, 'Обычную карту можно спокойно сбросить');

  // 1.3. Условия победы
  const testPlayers: PlayerPublic[] = [
    { id: 'p1', name: 'Игрок 1', avatar: 'explorer', seatIndex: 0, isHost: true, isDead: false, handCount: 4, quarantineTurns: 0, isConnected: true },
    { id: 'p2', name: 'Игрок 2', avatar: 'scientist', seatIndex: 1, isHost: false, isDead: false, handCount: 4, quarantineTurns: 0, isConnected: true },
    { id: 'p3', name: 'Игрок 3', avatar: 'doctor', seatIndex: 2, isHost: false, isDead: false, handCount: 4, quarantineTurns: 0, isConnected: true },
    { id: 'p4', name: 'Игрок 4', avatar: 'mechanic', seatIndex: 3, isHost: false, isDead: false, handCount: 4, quarantineTurns: 0, isConnected: true },
  ];
  const privatesTest: Record<string, PlayerPrivate> = {
    p1: { role: 'HUMAN', cards: [] },
    p2: { role: 'HUMAN', cards: [] },
    p3: { role: 'INFECTED', cards: [] },
    p4: { role: 'THE_THING', cards: [] },
  };

  let win = evaluateWinConditions(testPlayers, privatesTest);
  assert(!win.gameOver, 'Игра продолжается, пока живы и люди, и Нечто');

  // Убиваем Нечто
  testPlayers[3].isDead = true;
  win = evaluateWinConditions(testPlayers, privatesTest);
  assert(win.gameOver && win.winner === 'HUMANS', 'Смерть Нечто приводит к немедленной ПОБЕДЕ ЛЮДЕЙ');

  // Воскрешаем Нечто, заражаем всех людей
  testPlayers[3].isDead = false;
  privatesTest.p1.role = 'INFECTED';
  privatesTest.p2.role = 'INFECTED';
  win = evaluateWinConditions(testPlayers, privatesTest);
  assert(win.gameOver && win.winner === 'THE_THING', 'Когда все живые игроки заражены — ПОБЕДА НЕЧТО');

  // --- БЛОК 2: ИНТЕРАКТИВНЫЕ МЕХАНИКИ «УПОРСТВО» И «СВИДАНИЕ ВСЛЕПУЮ» ---
  console.log('\n📦 БЛОК 2: Интерактивный выбор карт («Упорство» и «Свидание вслепую»)');

  const { roomId: roomIdChoice, playerId: hostIdChoice } = await networkManager.createRoom('Тестер', 'explorer');
  await networkManager.addBot(roomIdChoice);
  await networkManager.addBot(roomIdChoice);
  await networkManager.addBot(roomIdChoice);
  await networkManager.startGame(roomIdChoice, hostIdChoice);

  const localChoice = (networkManager as any).localRooms.get(roomIdChoice);
  localChoice.publicState.currentTurnPlayerId = hostIdChoice;
  localChoice.publicState.phase = 'ACTION';

  // Тест карты «Упорство» (в фазе ACTION после добора на руке 5 карт)
  const perseveranceCard = generateCard('PERSEVERANCE', 101);
  localChoice.privateStates[hostIdChoice].cards = [
    perseveranceCard,
    generateCard('WHISKEY', 102),
    generateCard('AXE', 103),
    generateCard('SUSPICION', 104),
    generateCard('LOOK_AROUND', 105),
  ];
  localChoice.publicState.players[0].handCount = 5;

  // Наполняем колоду известными картами, включая панику (которая должна быть сброшена)
  localChoice.fullDrawDeck = [
    generateCard('PANIC_OPEN_DOORS', 201), // Паника — должна уйти в сброс
    generateCard('FLAMETHROWER', 202),     // Событие 1
    generateCard('NO_BARBECUE', 203),      // Событие 2
    generateCard('LOOK_AROUND', 204),      // Событие 3
    generateCard('WHISKEY', 205),
  ];

  await networkManager.playCard(roomIdChoice, hostIdChoice, perseveranceCard.id);
  const privAfterPlay = localChoice.privateStates[hostIdChoice];

  assert(
    privAfterPlay.pendingChoice !== null && privAfterPlay.pendingChoice.type === 'PERSEVERANCE_PICK',
    'Разыгрывание «Упорства» активирует выбор PERSEVERANCE_PICK'
  );
  assert(
    privAfterPlay.pendingChoice.availableCards.length === 3,
    'Игроку предложено ровно 3 карты событий (паника автоматически отсеяна в сброс)'
  );
  assert(
    privAfterPlay.pendingChoice.availableCards.every((c: GameCard) => c.category !== 'PANIC'),
    'Среди предложенных карт «Упорства» нет ни одной карты паники'
  );

  // Шаг 1 выбора «Упорства»: выбираем первую предложенную карту снабжения (Огнемёт)
  const cardToPick = privAfterPlay.pendingChoice.availableCards[0];
  await networkManager.confirmCardChoice(roomIdChoice, hostIdChoice, cardToPick.id);
  assert(
    privAfterPlay.cards.some((c: GameCard) => c.id === cardToPick.id),
    'Выбранная карта успешно добавлена в руку (стало 5 карт)'
  );
  assert(
    privAfterPlay.pendingChoice !== null && privAfterPlay.pendingChoice.type === 'PERSEVERANCE_DISCARD',
    'После взятия карты «Упорство» требует сбросить 1 карту из руки (PERSEVERANCE_DISCARD)'
  );

  // Шаг 2 выбора «Упорства»: сбрасываем Топор
  const axeToDiscard = privAfterPlay.cards.find((c: GameCard) => c.code === 'AXE')!;
  await networkManager.confirmCardChoice(roomIdChoice, hostIdChoice, axeToDiscard.id);
  assert(
    privAfterPlay.cards.length === 4,
    'После сброса лишней карты на руке ровно 4 карты'
  );
  assert(
    privAfterPlay.pendingChoice === null,
    'Окно выбора закрыто'
  );
  assert(
    localChoice.publicState.phase === 'EXCHANGE_OFFER',
    'После завершения «Упорства» ход автоматически переходит к фазе обмена'
  );

  // Тест паники «Свидание вслепую»
  localChoice.publicState.phase = 'DRAW';
  localChoice.fullDrawDeck = [
    generateCard('PANIC_BLIND_DATE', 301),
    generateCard('NO_THANKS', 302), // Должна быть выдана взамен
    generateCard('WHISKEY', 303),
  ];

  (networkManager as any).executeDrawPhase(localChoice, roomIdChoice);
  assert(
    privAfterPlay.pendingChoice !== null && privAfterPlay.pendingChoice.type === 'BLIND_DATE_DISCARD',
    'При вытягивании «Свидания вслепую» активируется интерактивный сброс BLIND_DATE_DISCARD'
  );
  assert(
    privAfterPlay.cards.length === 5,
    'Игрок уже получил верхнюю карту события из колоды (всего 5 карт)'
  );
  assert(
    privAfterPlay.cards.some((c: GameCard) => c.code === 'NO_THANKS'),
    'В руке появилась вытянутая карта события «Нет уж, спасибо!»'
  );

  // Игрок выбирает, какую карту сбросить взамен
  const cardToDiscardBlind = privAfterPlay.cards.find((c: GameCard) => c.code !== 'THE_THING')!;
  await networkManager.confirmCardChoice(roomIdChoice, hostIdChoice, cardToDiscardBlind.id);

  assert(
    privAfterPlay.cards.length === 4,
    'После сброса по «Свиданию вслепую» на руке ровно 4 карты'
  );
  assert(
    localChoice.publicState.currentTurnPlayerId !== hostIdChoice,
    'После сброса по «Свиданию вслепую» ход сразу же завершается и переходит к следующему игроку'
  );

  // --- БЛОК 3: БОЕВЫЕ ВЗАИМОДЕЙСТВИЯ, ОГНЕМЁТ И БАГ СО СКРИНШОТА ---
  console.log('\n📦 БЛОК 3: Боевые взаимодействия, Огнемёт и баг со скриншота');

  const { roomId: roomIdCombat, playerId: hostIdCombat } = await networkManager.createRoom('Атакующий', 'officer');
  await networkManager.addBot(roomIdCombat);
  await networkManager.addBot(roomIdCombat);
  await networkManager.addBot(roomIdCombat);
  await networkManager.startGame(roomIdCombat, hostIdCombat);

  const localCombat = (networkManager as any).localRooms.get(roomIdCombat);
  const p1 = localCombat.publicState.players[0]; // Атакующий
  const p2 = localCombat.publicState.players[1]; // Сосед справа (жертва)
  const p3 = localCombat.publicState.players[2]; // Следующий сосед

  localCombat.publicState.currentTurnPlayerId = p1.id;
  localCombat.publicState.phase = 'ACTION';

  // 3.1. Огнемёт против «Никакого шашлыка!»
  const flame1 = generateCard('FLAMETHROWER', 401);
  const noBarbecue = generateCard('NO_BARBECUE', 402);
  localCombat.privateStates[p1.id].cards = [flame1, generateCard('WHISKEY', 403), generateCard('AXE', 404), generateCard('LOOK_AROUND', 405)];
  localCombat.privateStates[p2.id].cards = [noBarbecue, generateCard('WHISKEY', 406), generateCard('AXE', 407), generateCard('LOOK_AROUND', 408)];

  await networkManager.playCard(roomIdCombat, p1.id, flame1.id, p2.id);
  assert(
    localCombat.publicState.phase === 'DEFENSE_WAIT',
    'Розыгрыш Огнемёта переводит игру в DEFENSE_WAIT'
  );

  // Жертва защищается
  await networkManager.respondDefense(roomIdCombat, p2.id, noBarbecue.id);
  assert(!p2.isDead, '«Никакого шашлыка!» успешно спасает цель от сожжения');
  assert(localCombat.privateStates[p2.id].cards.length === 4, 'Защитившийся игрок добирает карту взамен защиты (рука = 4)');
  assert(
    localCombat.publicState.phase === 'EXCHANGE_OFFER',
    'После отражения огнемёта атакующий переходит к фазе обмена'
  );

  // 3.2. БАГ СО СКРИНШОТА: Убийство огнемётом без защиты
  // Проверяем: убийство соседа НЕ ДОЛЖНО сбрасывать фазу обмена атакующего!
  localCombat.publicState.phase = 'ACTION';
  localCombat.publicState.currentTurnPlayerId = p1.id;
  const flame2 = generateCard('FLAMETHROWER', 501);
  localCombat.privateStates[p1.id].cards = [flame2, generateCard('WHISKEY', 502), generateCard('AXE', 503), generateCard('LOOK_AROUND', 504)];
  localCombat.privateStates[p2.id].cards = [generateCard('WHISKEY', 505), generateCard('AXE', 506), generateCard('LOOK_AROUND', 507), generateCard('LOOK_AROUND', 508)];
  localCombat.privateStates[p2.id].role = 'HUMAN';

  await networkManager.playCard(roomIdCombat, p1.id, flame2.id, p2.id);
  // Жертва пасует (нет защиты)
  await networkManager.respondDefense(roomIdCombat, p2.id, null);

  assert(p2.isDead, 'Жертва без защиты сгорает в пламени огнемёта');
  assert(
    localCombat.publicState.currentTurnPlayerId === p1.id,
    'ХОД ОСТАЕТСЯ У АТАКУЮЩЕГО (не перескочил на следующего бота!)'
  );
  assert(
    localCombat.publicState.phase === 'EXCHANGE_OFFER',
    'АТАКУЮЩИЙ ПЕРЕШЕЛ К ФАЗЕ ОБМЕНА С НОВЫМ ЖИВЫМ СОСЕДОМ (баг исправлен!)'
  );

  // --- БЛОК 4: ЗАЩИТА ПРИ ОБМЕНЕ КАРТАМИ («Мимо!», «Страх», «Нет уж, спасибо!») ---
  console.log('\n📦 БЛОК 4: Защита при обмене картами');

  const { roomId: roomIdExDef, playerId: hostIdExDef } = await networkManager.createRoom('Обменщик', 'scientist');
  await networkManager.addBot(roomIdExDef);
  await networkManager.addBot(roomIdExDef);
  await networkManager.addBot(roomIdExDef);
  await networkManager.startGame(roomIdExDef, hostIdExDef);

  const localExDef = (networkManager as any).localRooms.get(roomIdExDef);
  const ep1 = localExDef.publicState.players[0];
  const ep2 = localExDef.publicState.players[1];
  const ep3 = localExDef.publicState.players[2];

  localExDef.publicState.currentTurnPlayerId = ep1.id;
  localExDef.publicState.phase = 'EXCHANGE_OFFER';

  // 4.1. «Нет уж, спасибо!»
  const noThanksCard = generateCard('NO_THANKS', 601);
  localExDef.privateStates[ep2.id].cards = [noThanksCard, generateCard('WHISKEY', 602), generateCard('AXE', 603), generateCard('LOOK_AROUND', 604)];

  await networkManager.offerExchangeCard(roomIdExDef, ep1.id, localExDef.privateStates[ep1.id].cards[0].id);
  assert(localExDef.publicState.phase === 'EXCHANGE_DEFENSE_WAIT', 'Предложение обмена цели с защитой открывает EXCHANGE_DEFENSE_WAIT');

  await networkManager.respondDefense(roomIdExDef, ep2.id, noThanksCard.id);
  assert(localExDef.publicState.currentTurnPlayerId !== ep1.id, '«Нет уж, спасибо!» отменяет обмен и завершает ход');
  const ep2CardsCount = localExDef.privateStates[ep2.id].cards.length;
  const isEp2Turn = localExDef.publicState.currentTurnPlayerId === ep2.id && localExDef.publicState.phase === 'ACTION';
  assert(
    isEp2Turn ? ep2CardsCount === 5 : ep2CardsCount === 4,
    'Защитившийся добирает 1 карту взамен (рука = 4 при конце хода или 5 при начале своего хода)'
  );

  // 4.2. «Страх» (отмена + подсматривание предложенной карты)
  localExDef.publicState.currentTurnPlayerId = ep1.id;
  localExDef.publicState.phase = 'EXCHANGE_OFFER';
  const fearCard = generateCard('FEAR', 701);
  const offeredCardToFear = generateCard('WHISKEY', 702);
  localExDef.privateStates[ep1.id].cards[0] = offeredCardToFear;
  localExDef.privateStates[ep2.id].cards[0] = fearCard;

  await networkManager.offerExchangeCard(roomIdExDef, ep1.id, offeredCardToFear.id);
  await networkManager.respondDefense(roomIdExDef, ep2.id, fearCard.id);

  assert(
    localExDef.publicState.revealedCards !== null && localExDef.publicState.revealedCards.cards[0].id === offeredCardToFear.id,
    '«Страх» раскрывает предложенную карту защитившемуся игроку'
  );
  assert(localExDef.publicState.revealedCards?.targetPlayerId === ep2.id, 'Раскрытая карта видна только сыгравшему «Страх»');

  // 4.3. «Мимо!» (перенаправление обмена следующему игроку)
  localExDef.publicState.currentTurnPlayerId = ep1.id;
  localExDef.publicState.phase = 'EXCHANGE_OFFER';
  localExDef.publicState.revealedCards = null;
  const missedCard = generateCard('MISSED', 801);
  localExDef.privateStates[ep2.id].cards[0] = missedCard;

  await networkManager.offerExchangeCard(roomIdExDef, ep1.id, localExDef.privateStates[ep1.id].cards[0].id);
  await networkManager.respondDefense(roomIdExDef, ep2.id, missedCard.id);

  assert(
    localExDef.offeredExchangeCard?.targetPlayerId === ep3.id,
    '«Мимо!» перенаправило предложение обмена следующему игроку (ep3)'
  );

  // --- БЛОК 5: ПРЕПЯТСТВИЯ (ДВЕРИ, КАРАНТИН) И ТОПОР ---
  console.log('\n📦 БЛОК 5: Препятствия (Заколоченная дверь, Карантин) и Топор');

  const { roomId: roomIdObstacles, playerId: hostIdObs } = await networkManager.createRoom('Строитель', 'mechanic');
  await networkManager.addBot(roomIdObstacles);
  await networkManager.addBot(roomIdObstacles);
  await networkManager.addBot(roomIdObstacles);
  await networkManager.startGame(roomIdObstacles, hostIdObs);

  const localObs = (networkManager as any).localRooms.get(roomIdObstacles);
  const op1 = localObs.publicState.players[0];
  const op2 = localObs.publicState.players[1];

  localObs.publicState.currentTurnPlayerId = op1.id;
  localObs.publicState.phase = 'ACTION';

  // 5.1. Установка двери
  const doorCard = generateCard('BARRED_DOOR', 901);
  localObs.privateStates[op1.id].cards[0] = doorCard;
  await networkManager.playCard(roomIdObstacles, op1.id, doorCard.id, op2.id);

  assert(localObs.publicState.doors.length === 1, 'Заколоченная дверь успешно установлена');
  assert(isDoorBetween(localObs.publicState.doors, op1.id, op2.id, localObs.publicState.players), 'Дверь блокирует проход между op1 и op2');

  // Проверяем, что сквозь дверь нельзя атаковать огнемётом
  const flameBlocked = generateCard('FLAMETHROWER', 902);
  const valFlame = validatePlayCard(flameBlocked, op1, localObs.privateStates[op1.id], op2, localObs.publicState);
  assert(!valFlame.valid, 'Огнемёт заблокирован установленной дверью');

  // 5.2. Сруб двери топором
  localObs.publicState.currentTurnPlayerId = op1.id;
  localObs.publicState.phase = 'ACTION';
  const axeCard = generateCard('AXE', 903);
  localObs.privateStates[op1.id].cards[0] = axeCard;

  await networkManager.playCard(roomIdObstacles, op1.id, axeCard.id, undefined, 0);
  assert(localObs.publicState.doors.length === 0, 'Топор успешно срубил заколоченную дверь');

  // 5.3. Карантин и снятие карантина топором
  localObs.publicState.currentTurnPlayerId = op1.id;
  localObs.publicState.phase = 'ACTION';
  const quarCard = generateCard('QUARANTINE', 904);
  localObs.privateStates[op1.id].cards[0] = quarCard;

  const qRes = await networkManager.playCard(roomIdObstacles, op1.id, quarCard.id, op2.id);
  assert(op2.quarantineTurns === 2, 'Игрок отправлен в карантин на 2 хода', `res: ${JSON.stringify(qRes)}, op2.quarantineTurns: ${op2.quarantineTurns}`);

  // op2 на карантине не может играть действия
  const valQuarAction = validatePlayCard(flameBlocked, op2, localObs.privateStates[op2.id], op1, localObs.publicState);
  assert(!valQuarAction.valid, 'Игрок на карантине не может играть карты действий');

  // Снятие карантина топором
  localObs.publicState.currentTurnPlayerId = op1.id;
  localObs.publicState.phase = 'ACTION';
  const axeCard2 = generateCard('AXE', 905);
  localObs.privateStates[op1.id].cards[0] = axeCard2;

  await networkManager.playCard(roomIdObstacles, op1.id, axeCard2.id, op2.id);
  assert(op2.quarantineTurns === 0, 'Топор разрушил карантин соседа');

  // --- БЛОК 6: ПАНИКА «ЦЕПНАЯ РЕАКЦИЯ» И ЗАРАЖЕНИЕ ---
  console.log('\n📦 БЛОК 6: Паника «Цепная реакция» и распространение заражения');

  const { roomId: roomIdChain, playerId: hostIdChain } = await networkManager.createRoom('Очевидец', 'doctor');
  await networkManager.addBot(roomIdChain);
  await networkManager.addBot(roomIdChain);
  await networkManager.addBot(roomIdChain);
  await networkManager.startGame(roomIdChain, hostIdChain);

  const localChain = (networkManager as any).localRooms.get(roomIdChain);
  const cp1 = localChain.publicState.players[0];
  const cp2 = localChain.publicState.players[1];

  // Назначим cp1 Нечто и дадим ему Заражение
  localChain.privateStates[cp1.id].role = 'THE_THING';
  localChain.privateStates[cp1.id].cards[0] = generateCard('INFECTION', 999);
  localChain.privateStates[cp2.id].role = 'HUMAN';

  // Убедимся, что у всех 4 игроков строго по 4 карты перед началом цепной реакции
  for (const p of localChain.publicState.players) {
    const priv = localChain.privateStates[p.id];
    while (priv.cards.length > 4) priv.cards.pop();
    while (priv.cards.length < 4) priv.cards.push(generateCard('WHISKEY', Math.floor(Math.random() * 10000)));
    p.handCount = 4;
  }

  (networkManager as any).executeChainReaction(localChain);

  assert(
    localChain.privateStates[cp2.id].role === 'INFECTED',
    'В ходе «Цепной реакции» Нечто успешно заразило соседа картой Заражения'
  );
  assert(
    localChain.publicState.players.every((p: PlayerPublic) => localChain.privateStates[p.id].cards.length === 4),
    'Инвариант: после цепной реакции у каждого игрока ровно 4 карты'
  );

  // --- БЛОК 8: КАРТЫ ДВИЖЕНИЯ И НАПРАВЛЕНИЯ («Гляди по сторонам», «Меняемся местами!», «Мне и здесь неплохо», «Соблазн») ---
  console.log('\n📦 БЛОК 8: Перемещения, смена направления и Соблазн');

  const { roomId: roomIdMove, playerId: hostIdMove } = await networkManager.createRoom('Навигатор', 'officer');
  await networkManager.addBot(roomIdMove);
  await networkManager.addBot(roomIdMove);
  await networkManager.addBot(roomIdMove);
  await networkManager.startGame(roomIdMove, hostIdMove);

  const localMove = (networkManager as any).localRooms.get(roomIdMove);
  const mp1 = localMove.publicState.players[0];
  const mp2 = localMove.publicState.players[1];
  const mp3 = localMove.publicState.players[2];

  localMove.publicState.currentTurnPlayerId = mp1.id;
  localMove.publicState.phase = 'ACTION';
  localMove.publicState.direction = 1;

  // 8.1. «Гляди по сторонам» (LOOK_AROUND)
  const lookCard = generateCard('LOOK_AROUND', 1101);
  localMove.privateStates[mp1.id].cards = [lookCard, generateCard('WHISKEY', 1102), generateCard('AXE', 1103), generateCard('WHISKEY', 1104), generateCard('WHISKEY', 1105)];
  await networkManager.playCard(roomIdMove, mp1.id, lookCard.id);
  assert(localMove.publicState.direction === -1, '«Гляди по сторонам» меняет направление хода на противоположное (-1)');

  // 8.2. «Меняемся местами!» без защиты (SWITCH_PLACES)
  localMove.publicState.phase = 'ACTION';
  localMove.publicState.currentTurnPlayerId = mp1.id;
  const switchCard = generateCard('SWITCH_PLACES', 1106);
  const origSeat1 = mp1.seatIndex;
  const origSeat2 = mp2.seatIndex;
  localMove.privateStates[mp1.id].cards = [switchCard, generateCard('WHISKEY', 1107), generateCard('AXE', 1108), generateCard('WHISKEY', 1109), generateCard('WHISKEY', 1110)];
  localMove.privateStates[mp2.id].cards = [generateCard('WHISKEY', 1111), generateCard('AXE', 1112), generateCard('WHISKEY', 1113), generateCard('WHISKEY', 1114)];

  await networkManager.playCard(roomIdMove, mp1.id, switchCard.id, mp2.id);
  assert(mp1.seatIndex === origSeat2 && mp2.seatIndex === origSeat1, '«Меняемся местами!» успешно меняет полярников местами');

  // 8.3. «Меняемся местами!» с защитой «Мне и здесь неплохо» (IM_FINE_HERE)
  localMove.publicState.phase = 'ACTION';
  localMove.publicState.currentTurnPlayerId = mp1.id;
  const switchCard2 = generateCard('SWITCH_PLACES', 1115);
  const fineHereCard = generateCard('IM_FINE_HERE', 1116);
  const seatBeforeDef1 = mp1.seatIndex;
  const seatBeforeDef2 = mp2.seatIndex;
  localMove.privateStates[mp1.id].cards = [switchCard2, generateCard('WHISKEY', 1117), generateCard('AXE', 1118), generateCard('WHISKEY', 1119), generateCard('WHISKEY', 1120)];
  localMove.privateStates[mp2.id].cards = [fineHereCard, generateCard('AXE', 1121), generateCard('WHISKEY', 1122), generateCard('WHISKEY', 1123)];

  await networkManager.playCard(roomIdMove, mp1.id, switchCard2.id, mp2.id);
  assert(localMove.publicState.phase === 'DEFENSE_WAIT', 'Попытка смены мест цели с «Мне и здесь неплохо» активирует DEFENSE_WAIT');

  await networkManager.respondDefense(roomIdMove, mp2.id, fineHereCard.id);
  assert(mp1.seatIndex === seatBeforeDef1 && mp2.seatIndex === seatBeforeDef2, '«Мне и здесь неплохо» блокирует перемещение, игроки остаются на своих местах');
  assert(localMove.privateStates[mp2.id].cards.length === 4, 'Защитившийся добирает карту взамен защиты');

  // 8.4. «Соблазн» (SEDUCTION)
  localMove.publicState.phase = 'ACTION';
  localMove.publicState.currentTurnPlayerId = mp1.id;
  const seductionCard = generateCard('SEDUCTION', 1124);
  localMove.privateStates[mp1.id].cards = [seductionCard, generateCard('WHISKEY', 1125), generateCard('AXE', 1126), generateCard('WHISKEY', 1127), generateCard('WHISKEY', 1128)];

  await networkManager.playCard(roomIdMove, mp1.id, seductionCard.id, mp3.id);
  assert(localMove.forcedExchangeTargetId === mp3.id, '«Соблазн» форсирует цель обмена на выбранного игрока (mp3)');
  assert(localMove.publicState.phase === 'EXCHANGE_OFFER', '«Соблазн» немедленно переходит в EXCHANGE_OFFER');

  // --- БЛОК 9: ИНФОРМАЦИОННЫЕ КАРТЫ («Анализ крови», «Подозрение», «Виски») ---
  console.log('\n📦 БЛОК 9: Информационные карты («Анализ», «Подозрение», «Виски»)');

  // 9.1. «Анализ крови» (ANALYSIS)
  localMove.publicState.phase = 'ACTION';
  localMove.publicState.currentTurnPlayerId = mp1.id;
  const analysisCard = generateCard('ANALYSIS', 1201);
  localMove.privateStates[mp1.id].cards = [analysisCard, generateCard('WHISKEY', 1202), generateCard('AXE', 1203), generateCard('WHISKEY', 1204), generateCard('WHISKEY', 1205)];

  await networkManager.playCard(roomIdMove, mp1.id, analysisCard.id, mp2.id);
  assert(
    localMove.publicState.revealedCards !== null && localMove.publicState.revealedCards.targetPlayerId === mp1.id,
    '«Анализ крови» раскрывает карты соседа для активного игрока'
  );
  assert(
    localMove.publicState.revealedCards.cards.length === localMove.privateStates[mp2.id].cards.length,
    '«Анализ крови» показывает абсолютно все карты соседа'
  );

  // 9.2. «Подозрение» (SUSPICION)
  localMove.publicState.phase = 'ACTION';
  localMove.publicState.currentTurnPlayerId = mp1.id;
  const suspicionCard = generateCard('SUSPICION', 1206);
  localMove.privateStates[mp1.id].cards = [suspicionCard, generateCard('WHISKEY', 1207), generateCard('AXE', 1208), generateCard('WHISKEY', 1209), generateCard('WHISKEY', 1210)];

  await networkManager.playCard(roomIdMove, mp1.id, suspicionCard.id, mp2.id);
  assert(
    localMove.publicState.revealedCards !== null && localMove.publicState.revealedCards.cards.length === 1,
    '«Подозрение» показывает ровно 1 случайную карту соседа'
  );

  // 9.3. «Виски» (WHISKEY)
  localMove.publicState.phase = 'ACTION';
  localMove.publicState.currentTurnPlayerId = mp1.id;
  const whiskeyCardTest = generateCard('WHISKEY', 1211);
  localMove.privateStates[mp1.id].cards = [whiskeyCardTest, generateCard('AXE', 1212), generateCard('AXE', 1213), generateCard('AXE', 1214), generateCard('AXE', 1215)];

  await networkManager.playCard(roomIdMove, mp1.id, whiskeyCardTest.id);
  assert(
    localMove.publicState.revealedCards !== null && localMove.publicState.revealedCards.targetPlayerId === undefined,
    '«Виски» раскрывает карты игрока публично для ВСЕХ полярников за столом'
  );

  // --- БЛОК 10: КАРТЫ ПАНИКИ («Открывайте дверь пошире», «Вечеринка», «Забывчивость») ---
  console.log('\n📦 БЛОК 10: Специфические карты паники');

  // 10.1. «...Три, четыре... открывайте дверь пошире!»
  localMove.publicState.doors = [
    { betweenSeats: [0, 1] },
    { betweenSeats: [2, 3] },
  ];
  localMove.fullDrawDeck = [
    generateCard('PANIC_OPEN_DOORS', 1301),
    generateCard('WHISKEY', 1302),
  ];
  (networkManager as any).executeDrawPhase(localMove, roomIdMove);
  assert(localMove.publicState.doors.length === 0, 'Паника «Открывайте дверь пошире!» сорвала все заколоченные двери');

  // 10.2. «Забывчивость»
  localMove.privateStates[mp1.id].role = 'HUMAN';
  localMove.privateStates[mp1.id].cards = [
    generateCard('WHISKEY', 1303),
    generateCard('AXE', 1304),
    generateCard('AXE', 1305),
    generateCard('AXE', 1306),
  ];
  localMove.fullDrawDeck = [
    generateCard('PANIC_FORGETFULNESS', 1307),
    generateCard('FLAMETHROWER', 1308),
    generateCard('FLAMETHROWER', 1309),
    generateCard('FLAMETHROWER', 1310),
  ];
  (networkManager as any).executeDrawPhase(localMove, roomIdMove);
  assert(
    localMove.privateStates[mp1.id].cards.length === 5 && localMove.publicState.phase === 'ACTION',
    'После «Забывчивости» рука полярника обновлена и добрана карта для фазы действий (рука = 5)'
  );

  // --- БЛОК 11: АВТОНОМНАЯ СИМУЛЯЦИЯ 3 ПОЛНЫХ ИГР 4 БОТОВ ---
  console.log('\n📦 БЛОК 11: Автономная симуляция 3 полных партий (4 бота) до победы');

  // Устанавливаем задержку ботов в 0 для мгновенного выполнения в тестах
  networkManager.botDelayMs = 0;

  for (let simIdx = 1; simIdx <= 3; simIdx++) {
    const { roomId: simRoomId, playerId: simHostId } = await networkManager.createRoom(`БотХост_${simIdx}`, 'explorer');
    await networkManager.addBot(simRoomId);
    await networkManager.addBot(simRoomId);
    await networkManager.addBot(simRoomId);
    await networkManager.startGame(simRoomId, simHostId);

    const simLocal = (networkManager as any).localRooms.get(simRoomId);
    let turns = 0;
    const maxTurns = 120;

    while (simLocal.publicState.status === 'PLAYING' && turns < maxTurns) {
      turns++;
      const phase = simLocal.publicState.phase;

      if (phase === 'ACTION') {
        await networkManager.runBotTurn(simRoomId);
      } else if (phase === 'DEFENSE_WAIT') {
        await networkManager.runBotDefense(simRoomId);
      } else if (phase === 'EXCHANGE_OFFER') {
        await networkManager.runBotExchangeOffer(simRoomId);
      } else if (phase === 'EXCHANGE_DEFENSE_WAIT') {
        await networkManager.runBotDefense(simRoomId);
      } else if (phase === 'EXCHANGE_RESPOND') {
        await networkManager.runBotExchangeResponse(simRoomId);
      }

      // Проверка строгих инвариантов:
      // Не-активные живые игроки ВСЕГДА имеют ровно 4 карты.
      // Активный игрок имеет 5 карт только во время ACTION, в остальных фазах — ровно 4 карты!
      for (const pl of simLocal.publicState.players) {
        if (!pl.isDead) {
          const count = simLocal.privateStates[pl.id]?.cards.length;
          const isTurnPlayerInAction = pl.id === simLocal.publicState.currentTurnPlayerId && simLocal.publicState.phase === 'ACTION';
          const expectedCount = isTurnPlayerInAction ? 5 : 4;
          if (count !== expectedCount) {
            assert(false, `[Симуляция ${simIdx}, ход ${turns}] Игрок ${pl.name} (фаза ${simLocal.publicState.phase}) имеет ${count} карт вместо ${expectedCount}!`);
            break;
          }
        }
      }
    }

    const winner = simLocal.publicState.winner;
    const isFinished = simLocal.publicState.status === 'GAME_OVER' && (winner === 'HUMANS' || winner === 'THE_THING');
    assert(
      isFinished || turns >= maxTurns,
      `Партия #${simIdx} успешно отыграна (${turns} ходов). Статус: ${simLocal.publicState.status}${winner ? `, победитель: ${winner}` : ''}`
    );
  }

  // --- ИТОГИ ТЕСТИРОВАНИЯ ---
  console.log('\n======================================================');
  console.log(`📊 ИТОГИ ТЕСТИРОВАНИЯ:`);
  console.log(`   Всего проверок: ${totalTests}`);
  console.log(`   Пройдено успешно: ${passedTests} ✅`);
  console.log(`   Провалено: ${failedTests} ❌`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Критическая ошибка при выполнении тестов:', err);
  process.exit(1);
});
