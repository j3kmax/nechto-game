'use client';

import React, { useState } from 'react';
import { GameCard } from '@/types/game';
import { getCardVisual } from './CardHand';
import { AlertTriangle, Info, Check } from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';
import { CardDetailModal } from './CardDetailModal';

interface PanicModalProps {
  panicEvent: {
    card: GameCard;
    playerId: string;
    playerName: string;
    timestamp: number;
  };
  onClose: () => void;
}

export const PanicModal: React.FC<PanicModalProps> = ({ panicEvent, onClose }) => {
  const [inspectedCard, setInspectedCard] = useState<GameCard | null>(null);
  const visual = getCardVisual(panicEvent.card.code);

  const handleDismiss = () => {
    soundFx.playCardDraw();
    onClose();
  };

  const getEffectDetails = (code: string) => {
    switch (code) {
      case 'PANIC_OPEN_DOORS':
        return 'Все сыгранные карты «Заколоченная дверь» сорваны с петель и сброшены!';
      case 'PANIC_FORGETFULNESS':
        return 'Игрок сбросил до 3 карт с руки и взял столько же новых карт событий!';
      case 'PANIC_BLIND_DATE':
        return 'Игрок поменял 1 карту с руки на верхнюю карту колоды. Ход завершен!';
      case 'PANIC_CHAIN_REACTION':
        return 'Все игроки одновременно передали по 1 карте соседу по порядку хода! Ход завершен.';
      case 'PANIC_ONE_TWO_5':
        return 'Игрок поменялся местами с третьим от себя полярником за столом!';
      case 'PANIC_PARTY_5':
      case 'PARTY_OVER':
        return 'Все заколоченные двери сорваны с петель, все карантины сняты, игроки попарно поменялись местами!';
      case 'PANIC_GET_AWAY_5':
        return 'Игрок поменялся местами с другим полярником за столом!';
      case 'CHANGE_DIRECTION':
        return 'Направление передачи ходов и обмена картами мгновенно изменено на противоположное!';
      case 'BLIND_FAITH':
        return 'Игроки теряют бдительность. Атмосфера паранойи усиливается!';
      default:
        return panicEvent.card.description;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleDismiss();
        }
      }}
    >
      <div 
        className="relative w-full max-w-lg p-6 rounded-3xl bg-gradient-to-b from-polar-900 via-polar-900 to-polar-950 border border-amber-500/50 shadow-2xl shadow-amber-950/60 text-slate-100 flex flex-col items-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Верхняя аварийная полоса */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-black tracking-widest uppercase mb-4 animate-pulse">
          <AlertTriangle className="w-4 h-4" />
          <span>ТРЕВОГА: КАРТА ПАНИКИ!</span>
          <AlertTriangle className="w-4 h-4" />
        </div>

        <p className="text-sm text-center text-slate-300 mb-4">
          Полярник <span className="font-bold text-frost">{panicEvent.playerName}</span> вытянул из колоды карту паники. По официальным правилам (стр. 14) она сыграна <span className="text-amber-400 font-bold">немедленно</span> и уходит в сброс.
        </p>

        {/* Карточка паники */}
        <div className={`relative flex flex-col justify-between w-40 h-56 rounded-2xl p-4 border shadow-2xl ${visual.bg} ${visual.border} my-2`}>
          <div className="flex items-center justify-between gap-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${visual.badge}`}>
              {visual.label}
            </span>
            <button
              type="button"
              onClick={() => {
                soundFx.playCardDraw();
                setInspectedCard(panicEvent.card);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-frost hover:bg-white/10 transition-colors cursor-pointer"
              title="Описание карты"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>

          <h4 className="text-sm font-black text-slate-100 text-center mt-2 leading-tight">
            {panicEvent.card.name}
          </h4>

          <div 
            className="flex items-center justify-center py-2 cursor-pointer hover:scale-105 transition-transform"
            onClick={() => {
              soundFx.playCardDraw();
              setInspectedCard(panicEvent.card);
            }}
          >
            <div className="p-3.5 rounded-full bg-black/40">
              {visual.icon}
            </div>
          </div>

          <p className="text-[10px] text-slate-400 text-center line-clamp-3 leading-tight">
            {panicEvent.card.description}
          </p>
        </div>

        {/* Эффект события */}
        <div className="w-full mt-4 p-3.5 rounded-2xl bg-black/40 border border-amber-500/20 text-xs text-amber-200 text-center leading-relaxed">
          <span className="font-bold text-white block mb-0.5">Применённый эффект:</span>
          {getEffectDetails(panicEvent.card.code)}
        </div>

        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={handleDismiss}
          className="mt-5 w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-polar-950 font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-amber-500/30 cursor-pointer active:scale-95 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          Принять к сведению
        </button>

        {/* Модалка с подробным описанием */}
        <CardDetailModal
          card={inspectedCard}
          isOpen={!!inspectedCard}
          onClose={() => setInspectedCard(null)}
        />
      </div>
    </div>
  );
};
