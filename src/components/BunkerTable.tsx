'use client';

import React from 'react';
import { 
  PlayerPublic, 
  BarredDoor, 
  GameCard, 
  TurnPhase, 
  GameWinner,
  PendingDefense
} from '@/types/game';
import { getAvatarIcon } from './AvatarSelector';
import { 
  Crown, 
  Skull, 
  Biohazard, 
  DoorClosed, 
  Layers, 
  RotateCw, 
  RotateCcw, 
  Flame, 
  ShieldAlert,
  Bot
} from 'lucide-react';
import { getCardVisual } from './CardHand';

interface BunkerTableProps {
  players: PlayerPublic[];
  currentTurnPlayerId: string;
  currentUserId: string;
  direction: 1 | -1;
  phase: TurnPhase;
  doors: BarredDoor[];
  discardPile: GameCard[];
  deckCount: number;
  pendingDefense: PendingDefense | null;
  onSelectPlayer?: (player: PlayerPublic) => void;
  selectablePlayerIds?: string[];
}

export const BunkerTable: React.FC<BunkerTableProps> = ({
  players,
  currentTurnPlayerId,
  currentUserId,
  direction,
  phase,
  doors,
  discardPile,
  deckCount,
  pendingDefense,
  onSelectPlayer,
  selectablePlayerIds = [],
}) => {
  const numPlayers = players.length;
  // Сортируем игроков по seatIndex
  const sortedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);

  // Вычисляем координаты игроков по эллипсу
  const getPlayerPosition = (index: number) => {
    // Угол в радианах: начинаем снизу (для текущего игрока или 0)
    const angle = (2 * Math.PI * index) / numPlayers - Math.PI / 2;
    // Радиусы эллипса в процентах
    const rx = 40; // по горизонтали
    const ry = 36; // по вертикали
    const x = 50 + rx * Math.cos(angle);
    const y = 50 + ry * Math.sin(angle);
    return { x, y, angle };
  };

  const topDiscard = discardPile[0];
  const activePlayer = players.find(p => p.id === currentTurnPlayerId);

  return (
    <div className="relative w-full max-w-4xl h-[420px] sm:h-[480px] my-2 mx-auto flex items-center justify-center select-none">
      
      {/* Овальный стол бункера */}
      <div className="absolute inset-6 sm:inset-10 rounded-[42%] bg-gradient-to-b from-polar-900/90 via-polar-950/95 to-black/95 border border-cyan-900/30 shadow-2xl shadow-cyan-950/40 backdrop-blur-md overflow-hidden flex items-center justify-center">
        
        {/* Радарная сетка стола */}
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
        
        {/* Вращающийся луч сканера станции */}
        <div className="absolute w-full h-full rounded-full radar-sweep pointer-events-none opacity-20 bg-gradient-to-r from-transparent via-frost/10 to-transparent" />

        {/* Центр стола: колода, сброс и индикатор хода */}
        <div className="relative z-10 flex flex-col items-center gap-3">
          
          {/* Индикатор направления и фазы */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-polar-950/80 border border-frost/20 text-xs text-frost shadow-md">
            {direction === 1 ? (
              <RotateCw className="w-3.5 h-3.5 text-frost animate-spin [animation-duration:8s]" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5 text-frost animate-spin [animation-duration:8s]" />
            )}
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {direction === 1 ? 'По часовой ↻' : 'Против часовой ↺'}
            </span>
            <span className="text-white/30">•</span>
            <span className="text-slate-300 font-medium text-[11px]">
              {phase === 'DRAW' && 'Добор карты'}
              {phase === 'ACTION' && 'Ход: Действие / Сброс'}
              {phase === 'DEFENSE_WAIT' && 'Окно защиты (15 сек)'}
              {phase === 'EXCHANGE_OFFER' && 'Выбор карты для обмена'}
              {phase === 'EXCHANGE_RESPOND' && 'Ответный выбор карты'}
              {phase === 'EXCHANGE_DEFENSE_WAIT' && 'Защита от обмена'}
              {phase === 'GAME_OVER' && 'Игра окончена'}
            </span>
          </div>

          {/* Стопки карт: Колода добора и Сброс */}
          <div className="flex items-center gap-6">
            
            {/* Колода */}
            <div className="flex flex-col items-center">
              <div className="relative w-14 h-20 rounded-lg bg-gradient-to-b from-polar-800 to-polar-950 border border-frost/30 shadow-lg flex items-center justify-center text-frost">
                <Layers className="w-6 h-6 opacity-70" />
                <div className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-frost text-polar-950 text-[10px] font-bold shadow">
                  {deckCount}
                </div>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 font-mono">Колода</span>
            </div>

            {/* Сброс */}
            <div className="flex flex-col items-center">
              <div className="relative w-14 h-20 rounded-lg bg-polar-950 border border-white/10 shadow-lg flex flex-col items-center justify-center p-1 text-center">
                {topDiscard ? (
                  <>
                    <div className="p-1 rounded bg-white/5 text-slate-300">
                      {getCardVisual(topDiscard.code).icon}
                    </div>
                    <span className="text-[9px] font-bold text-slate-300 truncate max-w-full mt-0.5">
                      {topDiscard.name}
                    </span>
                  </>
                ) : (
                  <span className="text-[9px] text-slate-600 italic">Пусто</span>
                )}
                <div className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-slate-800 border border-white/10 text-slate-300 text-[10px] font-mono">
                  {discardPile.length}
                </div>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 font-mono">Сброс</span>
            </div>

          </div>

          {/* Плашка текущего активного игрока */}
          {activePlayer && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/30 text-xs text-slate-200 shadow">
              <Flame className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
              <span>Сейчас ходит: <strong className="text-frost">{activePlayer.name}</strong></span>
            </div>
          )}

        </div>

      </div>

      {/* Отрисовка заколоченных дверей между игроками */}
      {doors.map((door, dIdx) => {
        const pAIdx = sortedPlayers.findIndex(p => p.id === door.playerAId);
        const pBIdx = sortedPlayers.findIndex(p => p.id === door.playerBId);
        if (pAIdx === -1 || pBIdx === -1) return null;

        const posA = getPlayerPosition(pAIdx);
        const posB = getPlayerPosition(pBIdx);
        // Середина между двумя игроками
        const midX = (posA.x + posB.x) / 2;
        const midY = (posA.y + posB.y) / 2;

        return (
          <div
            key={`door_${door.playerAId}_${door.playerBId}_${dIdx}`}
            style={{ left: `${midX}%`, top: `${midY}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-30 flex items-center justify-center"
            title="Заколоченная дверь: блокирует обмен картами и атаки соседа"
          >
            <div className="px-2 py-1 rounded-lg bg-amber-950/90 border border-amber-500/60 shadow-lg shadow-black flex items-center gap-1 text-amber-300 animate-pulse">
              <DoorClosed className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] font-extrabold uppercase tracking-wide">Дверь</span>
            </div>
          </div>
        );
      })}

      {/* Места игроков вокруг стола */}
      {sortedPlayers.map((player, idx) => {
        const { x, y } = getPlayerPosition(idx);
        const isCurrentTurn = player.id === currentTurnPlayerId;
        const isMe = player.id === currentUserId;
        const isSelectable = selectablePlayerIds.includes(player.id);
        const isDefenseTarget = pendingDefense?.targetPlayerId === player.id;
        const inQuarantine = player.quarantineTurns > 0;

        return (
          <div
            key={player.id}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => isSelectable && onSelectPlayer && onSelectPlayer(player)}
            className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center transition-all duration-300 ${
              isSelectable ? 'cursor-pointer scale-110' : ''
            }`}
          >
            
            {/* Карточка игрока */}
            <div
              className={`relative flex flex-col items-center p-2 rounded-2xl border backdrop-blur-md transition-all duration-200 shadow-xl min-w-[90px] sm:min-w-[105px] ${
                player.isDead
                  ? 'bg-polar-950/80 border-slate-800 opacity-60 grayscale'
                  : isCurrentTurn
                  ? 'bg-polar-900/95 border-frost shadow-cyan-900/50 ring-2 ring-frost/60 scale-105'
                  : isDefenseTarget
                  ? 'bg-red-950/90 border-hazard-crimson animate-bounce shadow-red-950/70 ring-2 ring-red-500'
                  : isSelectable
                  ? 'bg-amber-950/80 border-amber-400 shadow-amber-900/50 hover:scale-110'
                  : 'bg-polar-900/80 border-white/10'
              }`}
            >
              
              {/* Бейдж хоста (корона) */}
              {player.isHost && (
                <div className="absolute -top-2 -left-1 text-amber-400 drop-shadow" title="Командир станции (Хост)">
                  <Crown className="w-4 h-4 fill-amber-400" />
                </div>
              )}

              {/* Бейдж бота */}
              {player.isBot && (
                <div className="absolute -top-2 -right-1 text-slate-400" title="ИИ исследователь">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Аватар */}
              <div className="relative mb-1">
                <div className={`p-2 rounded-xl border ${
                  player.isDead 
                    ? 'bg-black/60 border-slate-800 text-slate-600'
                    : isCurrentTurn
                    ? 'bg-frost/10 border-frost/40 text-frost'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}>
                  {player.isDead ? <Skull className="w-6 h-6 text-hazard-crimson" /> : getAvatarIcon(player.avatar, 'w-6 h-6')}
                </div>

                {/* Индикатор карантина */}
                {inQuarantine && !player.isDead && (
                  <div 
                    className="absolute -bottom-1.5 -right-1.5 px-1 rounded-full bg-cyan-500 border border-white text-polar-950 font-bold text-[9px] flex items-center gap-0.5 shadow"
                    title={`В карантине: осталось раундов: ${player.quarantineTurns}`}
                  >
                    <Biohazard className="w-2.5 h-2.5" />
                    <span>{player.quarantineTurns}</span>
                  </div>
                )}
              </div>

              {/* Имя и статус */}
              <div className="text-center w-full">
                <div className="text-xs font-bold text-slate-100 truncate max-w-[85px] sm:max-w-[100px] flex items-center justify-center gap-1">
                  <span>{player.name}</span>
                  {isMe && <span className="text-[10px] text-frost">(Вы)</span>}
                </div>
                
                {/* Карты в руке / статус */}
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  {player.isDead ? (
                    <span className="text-hazard-crimson font-bold">СОЖЖЁН</span>
                  ) : (
                    <span>{player.handCount} карт</span>
                  )}
                </div>
              </div>

              {/* Пульсирующий огонь, если игрок под атакой огнемета */}
              {isDefenseTarget && (
                <div className="absolute -inset-1 rounded-2xl border-2 border-hazard-crimson animate-pulse pointer-events-none" />
              )}

            </div>

            {/* Подпись цели, если выбирается */}
            {isSelectable && (
              <span className="mt-1 px-2 py-0.5 rounded-full bg-amber-400 text-polar-950 font-bold text-[9px] shadow animate-bounce">
                Выбрать цель
              </span>
            )}

          </div>
        );
      })}

    </div>
  );
};
