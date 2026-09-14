'use client';

import React, { useEffect } from 'react';
import { GameWinner, PlayerPublic, Role } from '@/types/game';
import confetti from 'canvas-confetti';
import { Trophy, Skull, Biohazard, ShieldCheck, RotateCcw, AlertTriangle } from 'lucide-react';
import { getAvatarIcon } from './AvatarSelector';

interface GameOverModalProps {
  winner: GameWinner;
  reason?: string;
  players: PlayerPublic[];
  finalRoles?: Record<string, Role>;
  onRestartLobby: () => void;
  isHost: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  reason,
  players,
  finalRoles,
  onRestartLobby,
  isHost,
}) => {
  useEffect(() => {
    if (winner === 'HUMANS') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#38bdf8', '#06b6d4', '#e0f2fe', '#3b82f6'],
      });
    }
  }, [winner]);

  const isHumansWin = winner === 'HUMANS';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg animate-in fade-in">
      <div className={`relative w-full max-w-2xl p-6 sm:p-8 rounded-3xl border-2 shadow-2xl flex flex-col items-center text-center ${
        isHumansWin
          ? 'bg-polar-900/95 border-frost shadow-cyan-950/80'
          : 'bg-polar-950/95 border-hazard-crimson shadow-red-950/90'
      }`}>
        
        {/* Главный символ победы */}
        <div className="relative mb-4">
          <div className={`p-5 rounded-full border-2 ${
            isHumansWin
              ? 'bg-cyan-950/80 border-frost text-frost shadow-lg shadow-cyan-500/30'
              : 'bg-red-950/80 border-hazard-crimson text-hazard-crimson shadow-lg shadow-red-600/40 animate-pulse'
          }`}>
            {isHumansWin ? <Trophy className="w-12 h-12" /> : <Skull className="w-12 h-12" />}
          </div>
        </div>

        {/* Заголовок финала */}
        <h2 className={`text-2xl sm:text-3xl font-black uppercase tracking-wider mb-2 ${
          isHumansWin ? 'text-frost frost-text-glow' : 'text-hazard-crimson hazard-text-glow'
        }`}>
          {isHumansWin ? 'ПОБЕДА ЗДОРОВЫХ ЛЮДЕЙ!' : 'НЕЧТО ПОГЛОТИЛО СТАНЦИЮ!'}
        </h2>

        <p className="text-sm text-slate-300 max-w-lg mb-6 leading-relaxed">
          {reason || (isHumansWin ? 'Паразит был успешно вычислен и сожжен в пламени огнемёта.' : 'Все выжившие исследователи были заражены или погибли во тьме.')}
        </p>

        {/* Список участников и их раскрытые тайные роли */}
        <div className="w-full bg-polar-950/80 rounded-2xl border border-white/10 p-4 mb-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-left">
            Раскрытие тайных ролей экспедиции:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {players.map((p) => {
              const role = finalRoles ? finalRoles[p.id] : undefined;
              let roleBadge = { text: 'ЧЕЛОВЕК', style: 'bg-cyan-950/80 text-frost border-cyan-500/40' };
              if (role === 'THE_THING') {
                roleBadge = { text: 'НЕЧТО ☣️', style: 'bg-red-950/90 text-red-400 border-red-500/60 font-black animate-pulse' };
              } else if (role === 'INFECTED') {
                roleBadge = { text: 'ЗАРАЖЕН ⚠️', style: 'bg-amber-950/90 text-amber-400 border-amber-500/60 font-bold' };
              }

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-black/40 text-slate-300">
                      {getAvatarIcon(p.avatar, 'w-4 h-4')}
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-200">{p.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {p.isDead ? '💀 Погиб' : '🛡️ Выжил'}
                      </div>
                    </div>
                  </div>

                  {role && (
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-lg border tracking-wider font-semibold ${roleBadge.style}`}>
                      {roleBadge.text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Кнопка реванша */}
        {isHost ? (
          <button
            type="button"
            onClick={onRestartLobby}
            className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-frost hover:bg-cyan-400 text-polar-950 font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-frost/30 hover:scale-105 cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            Вернуться в лобби для реванша
          </button>
        ) : (
          <p className="text-xs text-slate-400 italic">
            Ожидание командира станции для начала новой игры...
          </p>
        )}

      </div>
    </div>
  );
};
