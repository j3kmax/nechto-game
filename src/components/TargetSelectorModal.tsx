'use client';

import React, { useEffect } from 'react';
import { GameCard, PlayerPublic, BarredDoor } from '@/types/game';
import { getAvatarIcon } from './AvatarSelector';
import { getLivingPlayers, getPlayerNeighbors, isDoorBetween } from '@/game/rulesEngine';
import { X, Flame, Axe, DoorClosed, Biohazard, ShieldAlert } from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';

interface TargetSelectorModalProps {
  card: GameCard;
  players: PlayerPublic[];
  currentUserId: string;
  doors: BarredDoor[];
  direction: 1 | -1;
  onSelectTargetPlayer: (targetId: string) => void;
  onSelectDoorIndex: (doorIndex: number) => void;
  onClose: () => void;
}

export const TargetSelectorModal: React.FC<TargetSelectorModalProps> = ({
  card,
  players,
  currentUserId,
  doors,
  direction,
  onSelectTargetPlayer,
  onSelectDoorIndex,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const livingPlayers = getLivingPlayers(players);
  const neighbors = getPlayerNeighbors(players, currentUserId, direction, doors);
  const leftNeighbor = neighbors.leftNeighbor;
  const rightNeighbor = neighbors.rightNeighbor;

  const isFlamethrower = card.code === 'FLAMETHROWER';
  const isAxe = card.code === 'AXE';
  const isDoor = card.code === 'BARRED_DOOR';
  const isQuarantine = card.code === 'QUARANTINE';
  const isSeduction = card.code === 'SEDUCTION';
  const isSwitch = card.code === 'SWITCH_PLACES';
  const isGetOutOfHere = card.code === 'GET_OUT_OF_HERE';

  // Вычисляем статус для каждого игрока с подробной причиной недоступности
  const playersWithStatus = livingPlayers
    .filter(p => {
      // Себя показываем только для карт, которые можно играть на себя (Карантин, Топор)
      if (p.id === currentUserId && !isQuarantine && !isAxe) return false;
      return true;
    })
    .map(p => {
      let eligible = true;
      let reason = 'Доступен для выбора';

      const isSelf = p.id === currentUserId;
      const isNeighbor = p.id === leftNeighbor?.id || p.id === rightNeighbor?.id;
      const doorBlocked = isDoorBetween(doors, currentUserId, p.id, players);

      if (isGetOutOfHere) {
        if (isSelf) {
          eligible = false;
          reason = 'Нельзя на себя';
        } else if (p.quarantineTurns > 0) {
          eligible = false;
          reason = 'В карантине (стр. 12)';
        }
      } else if (isSeduction) {
        if (isSelf) {
          eligible = false;
          reason = 'Нельзя на себя';
        } else if (p.quarantineTurns > 0) {
          eligible = false;
          reason = 'В карантине (стр. 12)';
        }
      } else if (isQuarantine) {
        if (p.quarantineTurns > 0) {
          eligible = false;
          reason = 'Уже в карантине';
        } else if (!isSelf && !isNeighbor) {
          eligible = false;
          reason = 'Не смежный сосед';
        }
      } else if (isDoor) {
        if (isSelf) {
          eligible = false;
          reason = 'Нельзя на себя';
        } else if (!isNeighbor) {
          eligible = false;
          reason = 'Не смежный сосед';
        } else if (doorBlocked) {
          eligible = false;
          reason = 'Дверь уже установлена';
        }
      } else if (isFlamethrower || isSwitch || card.code === 'ANALYSIS' || card.code === 'SUSPICION') {
        if (isSelf) {
          eligible = false;
          reason = 'Нельзя на себя';
        } else if (!isNeighbor) {
          eligible = false;
          reason = 'Не смежный сосед';
        } else if (doorBlocked) {
          eligible = false;
          reason = 'Заблокирован дверью';
        } else if (p.quarantineTurns > 0) {
          eligible = false;
          reason = 'В карантине';
        }
      } else if (isAxe) {
        if (p.quarantineTurns === 0) {
          eligible = false;
          reason = 'Не в карантине';
        }
      }

      return { player: p, eligible, reason };
    });

  const availableCount = playersWithStatus.filter(item => item.eligible).length;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="relative w-full max-w-lg p-6 rounded-2xl bg-polar-900 border border-frost/30 shadow-2xl shadow-cyan-950/60 text-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Заголовок */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-frost flex items-center gap-2">
              Выберите цель для: «{card.name}»
            </h3>
            <p className="text-xs text-slate-400">
              {card.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Закрыть (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Вариант 1: Срубить дверь (для карты Топор) */}
        {isAxe && doors.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DoorClosed className="w-4 h-4" /> Заколоченные двери для сруба:
            </div>
            <div className="flex flex-col gap-2">
              {doors.map((d, idx) => {
                const pA = (d.seatA !== undefined ? players.find(p => p.seatIndex === d.seatA) : null) || players.find(p => p.id === d.playerAId);
                const pB = (d.seatB !== undefined ? players.find(p => p.seatIndex === d.seatB) : null) || players.find(p => p.id === d.playerBId);
                const nameA = pA?.name || `Место ${d.seatA ?? 'A'}`;
                const nameB = pB?.name || `Место ${d.seatB ?? 'B'}`;
                return (
                  <button
                    key={`door_opt_${idx}`}
                    type="button"
                    onClick={() => {
                      soundFx.playBarricade();
                      onSelectDoorIndex(idx);
                    }}
                    className="flex items-center justify-between p-3 rounded-xl bg-polar-950 border border-amber-500/30 hover:border-amber-400 text-left transition-all hover:bg-amber-950/30 cursor-pointer active:scale-98"
                  >
                    <span className="text-xs text-slate-200">
                      Дверь между <strong className="text-frost">{nameA}</strong> и <strong className="text-frost">{nameB}</strong>
                    </span>
                    <span className="text-xs font-bold px-2 py-1 rounded bg-amber-500 text-polar-950">
                      Срубить!
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Вариант 2: Список игроков станции */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Игроки экспедиции:</span>
            <span className="text-[10px] text-frost lowercase font-mono">доступно целей: {availableCount}</span>
          </div>

          {playersWithStatus.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {playersWithStatus.map(({ player: p, eligible, reason }) => {
                if (eligible) {
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        soundFx.playCardDraw();
                        onSelectTargetPlayer(p.id);
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-polar-950/90 border border-frost/50 hover:border-cyan-400 hover:bg-polar-850 transition-all text-left group cursor-pointer shadow-md active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-white/5 group-hover:text-frost text-slate-300">
                          {getAvatarIcon(p.avatar, 'w-5 h-5')}
                        </div>
                        <div className="overflow-hidden">
                          <div className="text-xs font-bold text-slate-200 group-hover:text-frost truncate">
                            {p.name} {p.id === currentUserId && '(Вы)'}
                          </div>
                          <div className="text-[10px] text-cyan-300 font-medium">
                            {p.quarantineTurns > 0 ? `Карантин (${p.quarantineTurns})` : `${p.handCount} карт`}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded bg-frost hover:bg-cyan-400 text-polar-950 uppercase shrink-0">
                        Выбрать
                      </span>
                    </button>
                  );
                } else {
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-polar-950/40 border border-white/5 text-left opacity-60 cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-white/5 text-slate-600">
                          {getAvatarIcon(p.avatar, 'w-5 h-5')}
                        </div>
                        <div className="overflow-hidden">
                          <div className="text-xs font-medium text-slate-400 truncate">
                            {p.name} {p.id === currentUserId && '(Вы)'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {p.handCount} карт
                          </div>
                        </div>
                      </div>
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-red-950/60 border border-red-500/20 text-red-300 text-right shrink-0 max-w-[120px] truncate" title={reason}>
                        {reason}
                      </span>
                    </div>
                  );
                }
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400 italic">
              Нет подходящих игроков за столом.
            </div>
          )}
        </div>

        {/* Закрыть */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Отмена
          </button>
        </div>

      </div>
    </div>
  );
};
