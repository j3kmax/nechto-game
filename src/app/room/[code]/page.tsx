'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  RoomPublicState, 
  PlayerPrivate, 
  GameCard, 
  PlayerPublic,
  AvatarId 
} from '@/types/game';
import { networkManager } from '@/lib/networkManager';
import { soundFx } from '@/lib/soundEffects';
import { Lobby } from '@/components/Lobby';
import { BunkerTable } from '@/components/BunkerTable';
import { CardHand } from '@/components/CardHand';
import { DefenseModal } from '@/components/DefenseModal';
import { TargetSelectorModal } from '@/components/TargetSelectorModal';
import { RevealedCardsModal } from '@/components/RevealedCardsModal';
import { GameOverModal } from '@/components/GameOverModal';
import { ActionLog } from '@/components/ActionLog';
import { RulebookModal } from '@/components/RulebookModal';
import { SoundToggle } from '@/components/SoundToggle';
import { AvatarSelector } from '@/components/AvatarSelector';
import { 
  Biohazard, 
  Flame, 
  BookOpen, 
  RotateCw, 
  Radio, 
  ShieldAlert,
  DoorClosed,
  Eye,
  LogOut,
  ChevronRight
} from 'lucide-react';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const roomCode = (rawCode || '').toUpperCase().trim();

  // Состояние пользователя в этой комнате
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userAvatar, setUserAvatar] = useState<AvatarId>('explorer');

  // Состояние игры
  const [roomState, setRoomState] = useState<RoomPublicState | null>(null);
  const [privateHand, setPrivateHand] = useState<PlayerPrivate | null>(null);

  // Модальные окна и интеракции
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [targetCardToPlay, setTargetCardToPlay] = useState<GameCard | null>(null);
  const [dismissedRevealedKey, setDismissedRevealedKey] = useState<string | null>(null);
  const [needJoinPrompt, setNeedJoinPrompt] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);

  // 1. Инициализация и проверка локального профиля игрока
  useEffect(() => {
    if (!roomCode || typeof window === 'undefined') return;

    const savedSession = sessionStorage.getItem(`nechto_player_${roomCode}`);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setCurrentUserId(parsed.playerId);
        setUserName(parsed.name);
        setUserAvatar(parsed.avatar);
      } catch (e) {
        setNeedJoinPrompt(true);
      }
    } else {
      setNeedJoinPrompt(true);
    }
  }, [roomCode]);

  // 2. Подписка на комнату
  useEffect(() => {
    if (!roomCode) return;

    const unsubRoom = networkManager.subscribeToRoom(roomCode, (state) => {
      setRoomState(state);
    });

    return () => {
      unsubRoom();
    };
  }, [roomCode]);

  // 3. Подписка на приватные карты игрока
  useEffect(() => {
    if (!roomCode || !currentUserId) return;

    const unsubPrivate = networkManager.subscribeToPrivate(roomCode, currentUserId, (hand) => {
      setPrivateHand(hand);
    });

    return () => {
      unsubPrivate();
    };
  }, [roomCode, currentUserId]);

  // 4. Звуковые эффекты при смене фаз/ходов
  useEffect(() => {
    if (!roomState) return;

    if (roomState.status === 'PLAYING') {
      if (roomState.currentTurnPlayerId === currentUserId) {
        soundFx.playHeartbeat();
      }
      if (roomState.pendingDefense?.targetPlayerId === currentUserId) {
        soundFx.playAlarm();
      }
    }
  }, [roomState?.currentTurnPlayerId, roomState?.pendingDefense, currentUserId]);

  // Быстрый вход, если перешли по прямой ссылке из Discord
  const handleDirectJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setJoinError('Введите ваш позывной.');
      return;
    }
    setJoinLoading(true);
    setJoinError(null);

    const res = await networkManager.joinRoom(roomCode, userName, userAvatar);
    if (res.success) {
      setCurrentUserId(res.playerId);
      sessionStorage.setItem(`nechto_player_${roomCode}`, JSON.stringify({
        playerId: res.playerId,
        name: userName,
        avatar: userAvatar
      }));
      setNeedJoinPrompt(false);
    } else {
      setJoinError(res.error || 'Ошибка входа в комнату.');
    }
    setJoinLoading(false);
  };

  // ДЕЙСТВИЯ ХОСТА
  const handleStartGame = async () => {
    try {
      soundFx.playCardDraw();
      const res = await networkManager.startGame(roomCode, currentUserId);
      if (!res.success) {
        alert(res.error || 'Ошибка старта игры.');
      }
    } catch (e: unknown) {
      console.error('Ошибка старта игры:', e);
      alert('Ошибка старта игры: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleAddBot = async () => {
    soundFx.playCardDraw();
    await networkManager.addBot(roomCode);
  };

  const handleKickPlayer = async (targetId: string) => {
    await networkManager.kickPlayer(roomCode, currentUserId, targetId);
  };

  const handleTransferHost = async (newHostId: string) => {
    await networkManager.transferHost(roomCode, currentUserId, newHostId);
  };

  const handleRestartLobby = async () => {
    try {
      soundFx.playCardDraw();
      const res = await networkManager.resetToLobby(roomCode, currentUserId);
      if (!res.success) {
        alert(res.error || 'Ошибка перезапуска лобби.');
      }
    } catch (e: unknown) {
      console.error('Ошибка перезапуска:', e);
      alert('Ошибка перезапуска: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // ИГРОВЫЕ ДЕЙСТВИЯ (ACTION PHASE)
  const handlePlayCardClick = async (card: GameCard) => {
    const targetedCodes = ['FLAMETHROWER', 'AXE', 'ANALYSIS', 'SUSPICION', 'BARRED_DOOR', 'QUARANTINE', 'SWITCH_PLACES', 'SEDUCTION'];
    if (targetedCodes.includes(card.code)) {
      setTargetCardToPlay(card);
    } else {
      soundFx.playCardDraw();
      await networkManager.playCard(roomCode, currentUserId, card.id);
    }
  };

  const handleConfirmTargetPlayer = async (targetPlayerId: string) => {
    if (!targetCardToPlay) return;
    if (targetCardToPlay.code === 'FLAMETHROWER') {
      soundFx.playFlamethrower();
    } else if (targetCardToPlay.code === 'BARRED_DOOR' || targetCardToPlay.code === 'AXE') {
      soundFx.playBarricade();
    } else {
      soundFx.playCardDraw();
    }
    await networkManager.playCard(roomCode, currentUserId, targetCardToPlay.id, targetPlayerId);
    setTargetCardToPlay(null);
  };

  const handleConfirmDoorIndex = async (doorIndex: number) => {
    if (!targetCardToPlay) return;
    soundFx.playBarricade();
    await networkManager.playCard(roomCode, currentUserId, targetCardToPlay.id, undefined, doorIndex);
    setTargetCardToPlay(null);
  };

  const handleDiscardCard = async (card: GameCard) => {
    soundFx.playCardDraw();
    await networkManager.discardCard(roomCode, currentUserId, card.id);
  };

  // ОБМЕН КАРТАМИ (EXCHANGE PHASE)
  const handleOfferExchangeCard = async (card: GameCard) => {
    soundFx.playCardDraw();
    await networkManager.offerExchangeCard(roomCode, currentUserId, card.id);
  };

  const handleRespondExchangeCard = async (card: GameCard) => {
    soundFx.playCardDraw();
    await networkManager.respondExchange(roomCode, currentUserId, card.id);
  };

  const handleCloseRevealedCards = async () => {
    soundFx.playCardDraw();
    if (roomState?.revealedCards) {
      const key = `${roomState.revealedCards.title}_${roomState.revealedCards.targetPlayerId || 'all'}_${roomState.revealedCards.cards.length}`;
      setDismissedRevealedKey(key);
    }
    setRoomState(prev => prev ? { ...prev, revealedCards: null } : null);
    await networkManager.clearRevealedCards(roomCode);
  };

  const currentRevealedKey = roomState?.revealedCards
    ? `${roomState.revealedCards.title}_${roomState.revealedCards.targetPlayerId || 'all'}_${roomState.revealedCards.cards.length}`
    : null;
  const isRevealedCardsVisible = Boolean(
    roomState?.revealedCards &&
    (!roomState.revealedCards.targetPlayerId || roomState.revealedCards.targetPlayerId === currentUserId) &&
    currentRevealedKey !== dismissedRevealedKey
  );

  // ЗАЩИТА (DEFENSE)
  const handlePlayDefense = async (card: GameCard) => {
    soundFx.playDefenseSuccess();
    await networkManager.respondDefense(roomCode, currentUserId, card.id);
  };

  const handlePassDefense = async () => {
    await networkManager.respondDefense(roomCode, currentUserId, null);
  };

  // Загрузка или проверка существования комнаты
  if (!roomState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <div className="p-4 rounded-2xl bg-polar-900 border border-frost/30 text-frost animate-spin mb-4">
          <RotateCw className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100 mb-1">Подключение к Аванпосту [{roomCode}]...</h2>
        <p className="text-xs text-slate-400">Синхронизация состояния полярной станции...</p>
      </div>
    );
  }

  // Модальное окно прямого подключения (для друзей из Discord)
  if (needJoinPrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 rounded-3xl bg-polar-900/95 border border-frost/40 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-frost/40 text-frost">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Присоединение к станции</h3>
              <p className="text-xs text-frost">Сектор комнаты: [{roomCode}]</p>
            </div>
          </div>

          {joinError && (
            <div className="p-3 mb-4 rounded-xl bg-red-950/80 border border-hazard-crimson text-hazard-crimson text-xs font-semibold">
              {joinError}
            </div>
          )}

          <form onSubmit={handleDirectJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Ваш позывной исследователя:
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Имя или никнейм..."
                maxLength={20}
                required
                className="w-full px-4 py-3 rounded-xl bg-polar-950 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-frost text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Специальность:
              </label>
              <AvatarSelector selected={userAvatar} onSelect={setUserAvatar} />
            </div>

            <button
              type="submit"
              disabled={joinLoading}
              className="w-full py-3 rounded-2xl bg-frost hover:bg-cyan-400 text-polar-950 font-bold text-sm uppercase tracking-wider transition-all shadow-lg shadow-frost/20"
            >
              {joinLoading ? 'Вход в отсек...' : 'Занять место за столом'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const myPlayer = roomState.players.find(p => p.id === currentUserId);
  const isHost = roomState.hostId === currentUserId;
  const isMyTurn = roomState.currentTurnPlayerId === currentUserId;

  // Проверка окна защиты для меня
  const isDefenseTarget = roomState.pendingDefense?.targetPlayerId === currentUserId;
  const matchingDefenseCards = (privateHand?.cards || []).filter(c => 
    roomState.pendingDefense?.allowedDefenseCodes.includes(c.code)
  );

  // Проверка обмена
  const isExchangeTarget = roomState.phase === 'EXCHANGE_RESPOND' || roomState.phase === 'EXCHANGE_DEFENSE_WAIT';

  return (
    <div className="min-h-screen flex flex-col justify-between overflow-x-hidden">
      
      {/* Верхний бар станции */}
      <header className="w-full max-w-6xl mx-auto px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-950/60 border border-frost/30 text-frost">
            <Biohazard className="w-5 h-5 text-hazard-crimson animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-wider text-slate-100">
                НЕЧТО
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-polar-900 border border-white/10 text-frost">
                {roomCode}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
              <span>Раунд #{roomState.roundNumber}</span>
              <span>•</span>
              <span className="text-frost">Вы: {myPlayer?.name || userName}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRulesOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-polar-900/80 border border-frost/20 text-xs font-semibold text-frost hover:bg-polar-850 shadow-sm"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Правила</span>
          </button>
          <SoundToggle />
        </div>
      </header>

      {/* Основная зона: Лобби ИЛИ Игровой стол */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 z-10">
        {roomState.status === 'LOBBY' ? (
          <Lobby
            roomState={roomState}
            currentUserId={currentUserId}
            onStartGame={handleStartGame}
            onAddBot={handleAddBot}
            onKickPlayer={handleKickPlayer}
            onTransferHost={handleTransferHost}
            onOpenRules={() => setIsRulesOpen(true)}
          />
        ) : (
          <div className="w-full flex flex-col items-center">
            {/* Овальный бункерный стол */}
            <BunkerTable
              players={roomState.players}
              currentTurnPlayerId={roomState.currentTurnPlayerId}
              currentUserId={currentUserId}
              direction={roomState.direction}
              phase={roomState.phase}
              doors={roomState.doors}
              discardPile={roomState.discardPile}
              deckCount={roomState.deckCount}
              pendingDefense={roomState.pendingDefense}
            />

            {/* Лоток с секретными картами игрока */}
            {privateHand && myPlayer && !myPlayer.isDead && (
              <CardHand
                cards={privateHand.cards}
                playerPrivate={privateHand}
                activePlayer={myPlayer}
                currentTurnPlayerId={roomState.currentTurnPlayerId}
                phase={roomState.phase}
                doors={roomState.doors}
                isCurrentTurn={isMyTurn}
                onPlayCard={handlePlayCardClick}
                onDiscardCard={handleDiscardCard}
                onOfferExchangeCard={handleOfferExchangeCard}
                onRespondExchangeCard={handleRespondExchangeCard}
                onDefenseCard={handlePlayDefense}
                isDefenseTarget={isDefenseTarget}
                isExchangeTarget={isExchangeTarget}
              />
            )}

            {/* Если игрок сожжен/мертв */}
            {myPlayer?.isDead && (
              <div className="p-4 rounded-2xl bg-red-950/80 border border-hazard-crimson text-center my-4 shadow-xl">
                <h4 className="text-sm font-bold text-hazard-crimson uppercase">Вы были сожжены в пламени огнемёта</h4>
                <p className="text-xs text-slate-400 mt-1">Наблюдайте за выживанием оставшихся членов экспедиции.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Журнал публичных событий станции */}
      <ActionLog logs={roomState.logs} />

      {/* Модальное окно окна защиты (15 секунд) */}
      {isDefenseTarget && roomState.pendingDefense && (
        <DefenseModal
          pendingDefense={roomState.pendingDefense}
          sourcePlayer={roomState.players.find(p => p.id === roomState.pendingDefense?.sourcePlayerId)!}
          matchingDefenseCards={matchingDefenseCards}
          onPlayDefense={handlePlayDefense}
          onPassDefense={handlePassDefense}
        />
      )}

      {/* Модальное окно выбора цели (Огнемёт, Топор, Дверь, Анализ) */}
      {targetCardToPlay && (
        <TargetSelectorModal
          card={targetCardToPlay}
          players={roomState.players}
          currentUserId={currentUserId}
          doors={roomState.doors}
          direction={roomState.direction}
          onSelectTargetPlayer={handleConfirmTargetPlayer}
          onSelectDoorIndex={handleConfirmDoorIndex}
          onClose={() => setTargetCardToPlay(null)}
        />
      )}

      {/* Модальное окно раскрытых карт (Виски, Анализ крови, Подозрение, Страх) */}
      {isRevealedCardsVisible && roomState.revealedCards && (
        <RevealedCardsModal
          title={roomState.revealedCards.title}
          cards={roomState.revealedCards.cards}
          onClose={handleCloseRevealedCards}
        />
      )}

      {/* Финальный экран победы */}
      {roomState.status === 'GAME_OVER' && (
        <GameOverModal
          winner={roomState.winner}
          reason={roomState.winningRoleReason}
          players={roomState.players}
          finalRoles={roomState.finalRoles}
          isHost={isHost}
          onRestartLobby={handleRestartLobby}
        />
      )}

      {/* Модальное окно правил */}
      <RulebookModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />

    </div>
  );
}
