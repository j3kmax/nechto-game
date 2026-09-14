'use client';

import React, { useEffect, useState } from 'react';
import { PendingDefense, GameCard, PlayerPublic } from '@/types/game';
import { ShieldAlert, Flame, Handshake, ShieldCheck, X } from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';
import { getCardVisual } from './CardHand';

interface DefenseModalProps {
  pendingDefense: PendingDefense;
  sourcePlayer: PlayerPublic;
  matchingDefenseCards: GameCard[];
  onPlayDefense: (card: GameCard) => void;
  onPassDefense: () => void;
}

export const DefenseModal: React.FC<DefenseModalProps> = ({
  pendingDefense,
  sourcePlayer,
  matchingDefenseCards,
  onPlayDefense,
  onPassDefense,
}) => {
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    soundFx.playAlarm();
    soundFx.playHeartbeat();

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((pendingDefense.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onPassDefense();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingDefense.expiresAt, onPassDefense]);

  const isAttack = pendingDefense.actionType === 'ATTACK';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg p-6 rounded-2xl bg-polar-900 border-2 border-hazard-crimson shadow-2xl shadow-red-950/80 text-slate-100 flex flex-col items-center text-center">
        
        {/* Иконка опасности и таймер */}
        <div className="relative mb-3">
          <div className="p-4 rounded-full bg-red-950/80 border border-hazard-crimson text-hazard-crimson animate-pulse">
            {isAttack ? <Flame className="w-10 h-10 text-orange-400" /> : <ShieldAlert className="w-10 h-10 text-amber-400" />}
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-hazard-crimson text-white font-extrabold text-xs flex items-center justify-center shadow-lg">
            {timeLeft}с
          </div>
        </div>

        {/* Заголовок тревоги */}
        <h3 className="text-xl font-black text-hazard-crimson tracking-wide mb-1 uppercase">
          {isAttack ? '⚠️ НА ВАС НАПРАВЛЕН ОГНЕМЁТ!' : '⚠️ ПОПЫТКА ОБМЕНА КАРТОЙ!'}
        </h3>
        <p className="text-sm text-slate-300 mb-4">
          Полярник <strong className="text-frost">{sourcePlayer.name}</strong> разыграл карту «{pendingDefense.actionCard.name}».
          {isAttack && ' Если вы не защититесь, вы сгорите и выбудете из игры!'}
        </p>

        {/* Карты защиты из руки */}
        <div className="w-full bg-polar-950 p-4 rounded-xl border border-white/10 mb-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Ваши карты защиты:
          </div>

          {matchingDefenseCards.length > 0 ? (
            <div className="flex justify-center gap-3 flex-wrap">
              {matchingDefenseCards.map(card => {
                const visual = getCardVisual(card.code);
                return (
                  <button
                    key={card.id}
                    onClick={() => {
                      soundFx.playDefenseSuccess();
                      onPlayDefense(card);
                    }}
                    className={`flex flex-col items-center justify-between p-3 w-32 h-40 rounded-xl border transition-all hover:scale-105 shadow-lg ${visual.bg} ${visual.border}`}
                  >
                    <span className="text-[10px] font-bold text-emerald-300">ЗАЩИТА</span>
                    <div className="p-2 rounded-full bg-black/40 text-emerald-400">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-100">{card.name}</span>
                    <span className="text-[10px] py-1 px-2 rounded-lg bg-emerald-500 text-polar-950 font-bold w-full">
                      Сыграть!
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-xs text-slate-400 italic">
              У вас нет подходящей карты защиты в руке.
            </div>
          )}
        </div>

        {/* Кнопка сдачи / пропуска */}
        <button
          onClick={onPassDefense}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors border border-white/10"
        >
          {isAttack ? 'Смириться с судьбой (Принять удар пламени)' : 'Согласиться на обмен'}
        </button>

      </div>
    </div>
  );
};
