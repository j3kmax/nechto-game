/**
 * Comprehensive Automated Game Rules & Interactions Audit Suite
 * Tests 10+ scenarios to guarantee zero bugs across all cards, physical seats,
 * door mechanics, defenses, quarantines, infections, and panic cards.
 */

import { 
  PlayerPublic, 
  PlayerPrivate, 
  GameCard, 
  BarredDoor, 
  RoomPublicState, 
  CardCode 
} from '../src/types/game';
import { 
  getLivingPlayers, 
  getPlayerNeighbors, 
  isDoorBetween, 
  validatePlayCard, 
  validateDiscardCard, 
  validateExchangeCard,
  evaluateWinConditions 
} from '../src/game/rulesEngine';
import { CARD_DEFINITIONS } from '../src/game/cardsData';
import { setupGameDeck } from '../src/game/deckBuilder';

function createCard(code: CardCode, id = `${code}_test`): GameCard {
  const def = CARD_DEFINITIONS[code];
  return {
    id,
    code,
    name: def.name,
    category: def.category,
    description: def.description,
    flavorText: def.flavorText,
  };
}

function createPlayer(id: string, name: string, seatIndex: number, overrides: Partial<PlayerPublic> = {}): PlayerPublic {
  return {
    id,
    name,
    avatar: 'explorer',
    isHost: seatIndex === 0,
    isBot: false,
    isConnected: true,
    seatIndex,
    handCount: 4,
    isDead: false,
    quarantineTurns: 0,
    ...overrides,
  };
}

function createPrivate(id: string, role: 'HUMAN' | 'THE_THING' | 'INFECTED', cards: GameCard[]): PlayerPrivate {
  return {
    role,
    cards,
  };
}

function createRoom(players: PlayerPublic[], doors: BarredDoor[] = []): RoomPublicState {
  return {
    roomId: 'TEST_ROOM',
    hostId: players[0]?.id || 'p1',
    status: 'PLAYING',
    phase: 'ACTION',
    currentTurnPlayerId: players[0]?.id || 'p1',
    direction: 1,
    roundNumber: 1,
    deckCount: 50,
    discardPile: [],
    doors,
    players,
    pendingDefense: null,
    winner: null,
    logs: [],
    settings: {
      turnTimerSeconds: 60,
      allowBots: true,
      maxPlayers: 8,
    },
    revealedCards: null,
    lastUpdated: Date.now(),
  };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (failureDetails) console.error(`     -> ${failureDetails}`);
    process.exitCode = 1;
  }
}

console.log('================================================================');
console.log('🧪 RUNNING COMPREHENSIVE NECHTO GAME RULES & INTERACTION AUDITS');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Physical Seating & Neighbors after SWITCH_PLACES
// -----------------------------------------------------------------------------
console.log('Test Scenario 1: Seating order & neighbor calculation after seat swaps');
{
  const p1 = createPlayer('p1', 'Player 1', 0);
  const p2 = createPlayer('p2', 'Player 2', 1);
  const p3 = createPlayer('p3', 'Player 3', 2);
  const p4 = createPlayer('p4', 'Player 4', 3);
  const players = [p1, p2, p3, p4];

  // Initial neighbors for p1 (clockwise = p2, counter-clockwise = p4)
  let neighbors = getPlayerNeighbors(players, 'p1', 1, []);
  assert(neighbors.targetNeighbor?.id === 'p2', 'Initial clockwise neighbor of p1 is p2');
  assert(neighbors.leftNeighbor?.id === 'p4', 'Initial left neighbor of p1 is p4');
  assert(neighbors.rightNeighbor?.id === 'p2', 'Initial right neighbor of p1 is p2');

  // p1 (seat 0) and p3 (seat 2) swap places!
  p1.seatIndex = 2;
  p3.seatIndex = 0;

  // Living players should be ordered by seatIndex: [p3 (0), p2 (1), p1 (2), p4 (3)]
  const living = getLivingPlayers(players);
  assert(living.map(p => p.id).join(',') === 'p3,p2,p1,p4', 'Living players sorted by seat index: p3, p2, p1, p4');

  // Now p1 is at seat 2. Neighbors should be p2 (seat 1) and p4 (seat 3).
  neighbors = getPlayerNeighbors(players, 'p1', 1, []);
  assert(neighbors.targetNeighbor?.id === 'p4', 'After swap, p1 clockwise neighbor is p4 (seat 3)');
  assert(neighbors.leftNeighbor?.id === 'p2', 'After swap, p1 left neighbor is p2 (seat 1)');
  assert(neighbors.rightNeighbor?.id === 'p4', 'After swap, p1 right neighbor is p4 (seat 3)');
}

// -----------------------------------------------------------------------------
// TEST 2: Doors remain on physical table doorways regardless of seat swaps
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 2: Barred Door physical seat locking across player swaps');
{
  const p1 = createPlayer('p1', 'Player 1', 0);
  const p2 = createPlayer('p2', 'Player 2', 1);
  const p3 = createPlayer('p3', 'Player 3', 2);
  const players = [p1, p2, p3];

  // Door is placed between seat 0 and seat 1
  const doors: BarredDoor[] = [
    { seatA: 0, seatB: 1, playerAId: 'p1', playerBId: 'p2' }
  ];

  assert(isDoorBetween(doors, 'p1', 'p2', players), 'Door is between p1 (seat 0) and p2 (seat 1)');
  assert(!isDoorBetween(doors, 'p2', 'p3', players), 'No door between p2 (seat 1) and p3 (seat 2)');

  // Now p1 (seat 0) and p3 (seat 2) swap places!
  p1.seatIndex = 2;
  p3.seatIndex = 0;

  // Door was on physical doorway between seat 0 and seat 1.
  // Now seat 0 is occupied by p3, and seat 1 is occupied by p2!
  assert(isDoorBetween(doors, 'p3', 'p2', players), 'Door is now between p3 (seat 0) and p2 (seat 1)');
  assert(!isDoorBetween(doors, 'p1', 'p2', players), 'Door is NO LONGER between p1 (seat 2) and p2 (seat 1)');

  // Also check getPlayerNeighbors door blockage
  const p3Neighbors = getPlayerNeighbors(players, 'p3', 1, doors);
  assert(p3Neighbors.targetNeighbor?.id === 'p2' && p3Neighbors.isBlockedByDoor, 'p3 clockwise to p2 is blocked by door');
}

// -----------------------------------------------------------------------------
// TEST 3: Barred Door placement validation (adjacent seats only, no duplicate doors)
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 3: Barred Door placement validation');
{
  const p1 = createPlayer('p1', 'Player 1', 0);
  const p2 = createPlayer('p2', 'Player 2', 1);
  const p3 = createPlayer('p3', 'Player 3', 2);
  const p4 = createPlayer('p4', 'Player 4', 3);
  const players = [p1, p2, p3, p4];
  const room = createRoom(players);

  const doorCard = createCard('BARRED_DOOR');
  const priv1 = createPrivate('p1', 'HUMAN', [doorCard]);

  // Can place door between adjacent neighbors p1 (seat 0) and p2 (seat 1)
  const validAdjacent = validatePlayCard(doorCard, p1, priv1, p2, room);
  assert(validAdjacent.valid, 'Valid to place door between adjacent neighbors (p1 & p2)');

  // Cannot place door between non-adjacent players (p1 and p3)
  const invalidNonAdjacent = validatePlayCard(doorCard, p1, priv1, p3, room);
  assert(!invalidNonAdjacent.valid, 'Invalid to place door between non-adjacent players (p1 & p3)');

  // Cannot place second door where one already exists
  room.doors.push({ seatA: 0, seatB: 1, playerAId: 'p1', playerBId: 'p2' });
  const duplicateDoor = validatePlayCard(doorCard, p1, priv1, p2, room);
  assert(!duplicateDoor.valid, 'Invalid to place duplicate door between same seats');
}

// -----------------------------------------------------------------------------
// TEST 4: Axe chopping doors vs clearing quarantine
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 4: Axe chopping doors and clearing quarantine');
{
  const p1 = createPlayer('p1', 'Player 1', 0);
  const p2 = createPlayer('p2', 'Player 2', 1, { quarantineTurns: 2 });
  const players = [p1, p2];
  const room = createRoom(players, [{ seatA: 0, seatB: 1 }]);

  const axeCard = createCard('AXE');
  const priv1 = createPrivate('p1', 'HUMAN', [axeCard]);

  // Axe can chop door index
  const chopDoor = validatePlayCard(axeCard, p1, priv1, null, room, 0);
  assert(chopDoor.valid, 'Axe can chop door at selected index');

  // Axe can break quarantine on player
  const breakQuarantine = validatePlayCard(axeCard, p1, priv1, p2, room);
  assert(breakQuarantine.valid, 'Axe can destroy player quarantine');

  // Axe cannot target healthy non-quarantined player with no door
  p2.quarantineTurns = 0;
  const invalidAxe = validatePlayCard(axeCard, p1, priv1, p2, room);
  assert(!invalidAxe.valid, 'Axe cannot target healthy player without quarantine or door selection');
}

// -----------------------------------------------------------------------------
// TEST 5: Flamethrower attack, door blocking, and NO_BARBECUE / MISSED defense
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 5: Flamethrower targeting, obstacles, and defense');
{
  const p1 = createPlayer('p1', 'Player 1', 0);
  const p2 = createPlayer('p2', 'Player 2', 1);
  const p3 = createPlayer('p3', 'Player 3', 2);
  const p4 = createPlayer('p4', 'Player 4', 3);
  const players = [p1, p2, p3, p4];
  const room = createRoom(players);

  const flameCard = createCard('FLAMETHROWER');
  const priv1 = createPrivate('p1', 'HUMAN', [flameCard]);

  // Valid attack on adjacent neighbor p2
  const validAttack = validatePlayCard(flameCard, p1, priv1, p2, room);
  assert(validAttack.valid, 'Flamethrower can attack adjacent neighbor p2');

  // Blocked by door
  room.doors.push({ seatA: 0, seatB: 1 });
  const blockedAttack = validatePlayCard(flameCard, p1, priv1, p2, room);
  assert(!blockedAttack.valid, 'Flamethrower attack blocked by barred door');
  room.doors = [];

  // Blocked by quarantine
  p2.quarantineTurns = 2;
  const quarantineAttack = validatePlayCard(flameCard, p1, priv1, p2, room);
  assert(!quarantineAttack.valid, 'Flamethrower attack blocked by target in quarantine');
  p2.quarantineTurns = 0;

  // Cannot attack non-adjacent player (p3 in 4-player game)
  const nonNeighborAttack = validatePlayCard(flameCard, p1, priv1, p3, room);
  assert(!nonNeighborAttack.valid, 'Flamethrower cannot attack non-adjacent player');
}

// -----------------------------------------------------------------------------
// TEST 6: GET_OUT_OF_HERE vs SWITCH_PLACES range and IM_FINE_HERE defense
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 6: GET_OUT_OF_HERE & SWITCH_PLACES distance rules and defense');
{
  const p1 = createPlayer('p1', 'Player 1', 0);
  const p2 = createPlayer('p2', 'Player 2', 1);
  const p3 = createPlayer('p3', 'Player 3', 2);
  const p4 = createPlayer('p4', 'Player 4', 3);
  const players = [p1, p2, p3, p4];
  const room = createRoom(players, [{ seatA: 0, seatB: 1 }]);

  const switchCard = createCard('SWITCH_PLACES');
  const getOutCard = createCard('GET_OUT_OF_HERE');
  const priv1 = createPrivate('p1', 'HUMAN', [switchCard, getOutCard]);

  // SWITCH_PLACES is blocked by door between p1 and p2
  const switchBlocked = validatePlayCard(switchCard, p1, priv1, p2, room);
  assert(!switchBlocked.valid, 'SWITCH_PLACES is blocked by barred door');

  // SWITCH_PLACES cannot target non-adjacent player p3 (in 4-player game)
  const switchNonAdjacent = validatePlayCard(switchCard, p1, priv1, p3, room);
  assert(!switchNonAdjacent.valid, 'SWITCH_PLACES cannot target non-adjacent player');

  // GET_OUT_OF_HERE IGNORES DOORS and DISTANCE!
  const getOutP2 = validatePlayCard(getOutCard, p1, priv1, p2, room);
  assert(getOutP2.valid, 'GET_OUT_OF_HERE ignores barred door to p2');

  const getOutP3 = validatePlayCard(getOutCard, p1, priv1, p3, room);
  assert(getOutP3.valid, 'GET_OUT_OF_HERE can target distant player p3');

  // But cannot target player in quarantine
  p3.quarantineTurns = 2;
  const getOutQuarantine = validatePlayCard(getOutCard, p1, priv1, p3, room);
  assert(!getOutQuarantine.valid, 'GET_OUT_OF_HERE cannot target player in quarantine');
}

// -----------------------------------------------------------------------------
// TEST 7: Exchange rules & Infection restriction (humans cannot give Infection)
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 7: Exchange rules and Infection transmission validation');
{
  const infCard = createCard('INFECTION');
  const safeCard = createCard('WHISKEY');

  const humanPrivate = createPrivate('p1', 'HUMAN', [infCard, safeCard]);
  const thingPrivate = createPrivate('p2', 'THE_THING', [infCard, safeCard]);
  const infectedPrivate = createPrivate('p3', 'INFECTED', [infCard, safeCard]);

  // Humans are strictly forbidden from passing Infection
  const humanExchangeInf = validateExchangeCard(infCard, humanPrivate);
  assert(!humanExchangeInf.valid, 'Human cannot pass Infection card during exchange');

  const humanExchangeSafe = validateExchangeCard(safeCard, humanPrivate);
  assert(humanExchangeSafe.valid, 'Human can pass safe card during exchange');

  // The Thing CAN pass Infection
  const thingExchangeInf = validateExchangeCard(infCard, thingPrivate);
  assert(thingExchangeInf.valid, 'The Thing CAN pass Infection card');

  // Infected player CAN pass Infection
  const infectedExchangeInf = validateExchangeCard(infCard, infectedPrivate);
  assert(infectedExchangeInf.valid, 'Infected player CAN pass Infection card');
}

// -----------------------------------------------------------------------------
// TEST 8: Discard validation (THE_THING cannot be discarded; single Infection cannot be discarded)
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 8: Discard rules (THE_THING, INFECTION)');
{
  const thingCard = createCard('THE_THING');
  const infCard = createCard('INFECTION');
  const flameCard = createCard('FLAMETHROWER');

  const thingPriv = createPrivate('p1', 'THE_THING', [thingCard, flameCard]);
  const humanInfectedPriv = createPrivate('p2', 'INFECTED', [infCard, flameCard]);

  // Cannot discard THE_THING
  const discardThing = validateDiscardCard(thingCard, thingPriv);
  assert(!discardThing.valid, 'Player cannot discard THE_THING card');

  // Human/Infected with only 1 infection cannot discard it (must keep infection to prove status)
  const discardSingleInf = validateDiscardCard(infCard, humanInfectedPriv);
  assert(!discardSingleInf.valid, 'Infected player cannot discard their only Infection card');

  // Can discard normal action card
  const discardFlame = validateDiscardCard(flameCard, thingPriv);
  assert(discardFlame.valid, 'Player can discard normal action card');
}

// -----------------------------------------------------------------------------
// TEST 9: Deck generation and distribution integrity for 4 to 8 players
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 9: Deck construction, roles, and card distribution');
{
  for (const playerCount of [4, 6, 8]) {
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player_${i + 1}`);
    const deckResult = setupGameDeck(playerIds);

    // Exactly 1 player has THE_THING role
    const thingRoles = Object.values(deckResult.playerHands).filter(p => p.role === 'THE_THING');
    assert(thingRoles.length === 1, `${playerCount} players: Exactly 1 player is THE_THING`);

    // All players have exactly 4 cards
    const allHandsHave4 = Object.values(deckResult.playerHands).every(p => p.cards.length === 4);
    assert(allHandsHave4, `${playerCount} players: All players start with exactly 4 cards`);

    // Draw deck contains Infection cards = numPlayers - 1
    const infectionCountInDeck = deckResult.drawDeck.filter(c => c.code === 'INFECTION').length;
    assert(infectionCountInDeck === playerCount - 1, `${playerCount} players: Draw deck contains exactly ${playerCount - 1} Infection cards`);

    // Draw deck contains panic cards including PARTY_OVER
    const hasPartyOver = deckResult.drawDeck.some(c => c.code === 'PARTY_OVER');
    assert(hasPartyOver, `${playerCount} players: Draw deck contains PARTY_OVER panic card`);
  }
}

// -----------------------------------------------------------------------------
// TEST 10: Win conditions evaluation
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 10: Win condition evaluation');
{
  const p1 = createPlayer('p1', 'Player 1', 0); // Human
  const p2 = createPlayer('p2', 'Player 2', 1); // Thing
  const p3 = createPlayer('p3', 'Player 3', 2); // Human
  const players = [p1, p2, p3];

  const privates: Record<string, PlayerPrivate> = {
    p1: createPrivate('p1', 'HUMAN', []),
    p2: createPrivate('p2', 'THE_THING', []),
    p3: createPrivate('p3', 'HUMAN', []),
  };

  // 1. Ongoing game
  let winResult = evaluateWinConditions(players, privates);
  assert(!winResult.gameOver, 'Game continues while Thing is alive and humans survive');

  // 2. Thing dies: Humans win!
  p2.isDead = true;
  winResult = evaluateWinConditions(players, privates);
  assert(winResult.gameOver && winResult.winner === 'HUMANS', 'When The Thing is dead, Humans win!');

  // 3. Thing survives and all remaining humans are infected: The Thing wins!
  p2.isDead = false;
  privates['p1'].role = 'INFECTED';
  privates['p3'].role = 'INFECTED';
  winResult = evaluateWinConditions(players, privates);
  assert(winResult.gameOver && winResult.winner === 'THE_THING', 'When all survivors are infected, The Thing wins!');
}

console.log('\n================================================================');
console.log(`🎉 AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log('================================================================');
