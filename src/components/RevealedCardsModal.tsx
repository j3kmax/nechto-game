'use client';

import React from 'react';
import { GameCard } from '@/types/game';
import { getCardVisual } from './CardHand';
import { Eye, X } from 'lucide-react';

interface RevealedCardsModalProps {
  title: string;
  cards: GameCard[];
  onClose: () => void;
}

export const RevealedCardsModal: React.FC<RevealedCardsModalProps> = ({
  title,
  cards,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl p-6 rounded-2xl bg-polar-900 border border-frost/30 shadow-2xl shadow-cyan-950/70 text-slate-100 flex flex-col items-center">
        
        <div className="w-full flex items-center justify-between pb-3 mb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-frost" />
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Раскрытые карты */}
        <div className="flex justify-center gap-3 flex-wrap max-w-full my-4">
          {cards.map((card) => {
            const visual = getCardVisual(card.code);
            return (
              <div
                key={card.id}
                className={`flex flex-col justify-between w-32 sm:w-36 h-48 sm:h-52 rounded-xl p-3 border shadow-xl ${visual.bg} ${visual.border}`}
              >
                <div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${visual.badge}`}>
                    {visual.label}
                  </span>
                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-100 mt-1 leading-tight">
                    {card.name}
                  </h4>
                </div>

                <div className="flex items-center justify-center py-2">
                  <div className="p-3 rounded-full bg-black/40">
                    {visual.icon}
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 line-clamp-3 leading-tight">
                  {card.description}
                </p>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="mt-4 px-6 py-2 rounded-xl bg-frost hover:bg-cyan-400 text-polar-950 font-bold text-xs transition-colors shadow-lg shadow-frost/20"
        >
          Всё ясно, закрыть
        </button>

      </div>
    </div>
  );
};
