'use client';

import React from 'react';
import { GameCard, PlayerPublic, BarredDoor } from '@/types/game';
import { getAvatarIcon } from './AvatarSelector';
import { X, Flame, Axe, DoorClosed, Biohazard, ShieldAlert } from 'lucide-react';

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
  const livingPlayers = players.filter(p => !p.isDead);
  const myIndex = livingPlayers.findIndex(p => p.id === currentUserId);
  const n = livingPlayers.length;

  // Определение допустимых целей в зависимости от типа карты
  const leftNeighbor = n >= 2 && myIndex !== -1 ? livingPlayers[(myIndex - 1 + n) % n] : null;
  const rightNeighbor = n >= 2 && myIndex !== -1 ? livingPlayers[(myIndex + 1) % n] : null;

  const isFlamethrower = card.code === 'FLAMETHROWER';
  const isAxe = card.code === 'AXE';
  const isDoor = card.code === 'BARRED_DOOR';
  const isQuarantine = card.code === 'QUARANTINE';
  const isSeduction = card.code === 'SEDUCTION';
  const isSwitch = card.code === 'SWITCH_PLACES';

  // Фильтруем игроков
  const candidatePlayers = livingPlayers.filter(p => {
    if (p.id === currentUserId && !isQuarantine) return false;

    if (isSeduction) return p.id !== currentUserId;

    if (isFlamethrower || isSwitch || isDoor || isQuarantine || card.code === 'ANALYSIS' || card.code === 'SUSPICION') {
      const isDirectNeighbor = p.id === leftNeighbor?.id || p.id === rightNeighbor?.id;
      if (!isDirectNeighbor && p.id !== currentUserId) return false;
      if (isFlamethrower && p.quarantineTurns > 0) return false;
      return true;
    }

    if (isAxe) {
      return p.quarantineTurns > 0;
    }

    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg p-6 rounded-2xl bg-polar-900 border border-frost/30 shadow-2xl shadow-cyan-950/60 text-slate-100">
        
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
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
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
                const pA = players.find(p => p.id === d.playerAId)?.name || 'Игрок';
                const pB = players.find(p => p.id === d.playerBId)?.name || 'Игрок';
                return (
                  <button
                    key={`door_opt_${idx}`}
                    onClick={() => onSelectDoorIndex(idx)}
                    className="flex items-center justify-between p-3 rounded-xl bg-polar-950 border border-amber-500/30 hover:border-amber-400 text-left transition-all hover:bg-amber-950/30"
                  >
                    <span className="text-xs text-slate-200">
                      Дверь между <strong className="text-frost">{pA}</strong> и <strong className="text-frost">{pB}</strong>
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

        {/* Вариант 2: Список подходящих игроков */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Доступные игроки:
          </div>

          {candidatePlayers.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {candidatePlayers.map(p => (
                <button
                  key={p.id}
                  onClick={() => onSelectTargetPlayer(p.id)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-polar-950/80 border border-white/10 hover:border-frost hover:bg-polar-850 transition-all text-left group"
                >
                  <div className="p-2 rounded-lg bg-white/5 group-hover:text-frost text-slate-300">
                    {getAvatarIcon(p.avatar, 'w-5 h-5')}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-slate-200 group-hover:text-frost truncate">
                      {p.name} {p.id === currentUserId && '(Вы)'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {p.quarantineTurns > 0 ? `Карантин (${p.quarantineTurns})` : `${p.handCount} карт`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400 italic">
              Нет доступных целей для применения этой карты прямо сейчас.
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
