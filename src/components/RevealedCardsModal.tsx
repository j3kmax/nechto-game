'use client';

import React, { useState, useEffect } from 'react';
import { GameCard } from '@/types/game';
import { getCardVisual } from './CardHand';
import { Eye, X, Info } from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';
import { CardDetailModal } from './CardDetailModal';

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
  const [inspectedCard, setInspectedCard] = useState<GameCard | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inspectedCard) {
          setInspectedCard(null);
        } else {
          soundFx.playCardDraw();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectedCard, onClose]);

  const handleModalClose = () => {
    soundFx.playCardDraw();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleModalClose();
        }
      }}
    >
      <div 
        className="relative w-full max-w-xl p-6 rounded-2xl bg-polar-900 border border-frost/30 shadow-2xl shadow-cyan-950/70 text-slate-100 flex flex-col items-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Шапка модального окна */}
        <div className="w-full flex items-center justify-between pb-3 mb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-frost" />
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Закрыть (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Раскрытые карты */}
        {cards && cards.length > 0 ? (
          <div className="flex justify-center gap-3 flex-wrap max-w-full my-4">
            {cards.map((card) => {
              const visual = getCardVisual(card.code);
              return (
                <div
                  key={card.id}
                  className={`relative flex flex-col justify-between w-32 sm:w-36 h-48 sm:h-52 rounded-xl p-3 border shadow-xl ${visual.bg} ${visual.border}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${visual.badge}`}>
                      {visual.label}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        soundFx.playCardDraw();
                        setInspectedCard(card);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-frost hover:bg-white/10 transition-colors cursor-pointer"
                      title="Посмотреть подробное описание карты"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-100 mt-1 leading-tight">
                    {card.name}
                  </h4>

                  <div 
                    className="flex items-center justify-center py-2 cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => {
                      soundFx.playCardDraw();
                      setInspectedCard(card);
                    }}
                    title="Нажмите для просмотра правил карты"
                  >
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
        ) : (
          <div className="py-8 text-center text-xs text-slate-400 italic">
            В руке у игрока нет карт или они не были найдены.
          </div>
        )}

        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={handleModalClose}
          className="mt-4 px-8 py-2.5 rounded-xl bg-frost hover:bg-cyan-400 text-polar-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-frost/20 cursor-pointer active:scale-95"
        >
          Всё ясно, закрыть
        </button>

      </div>

      {/* Просмотр карты при клике на неё */}
      <CardDetailModal
        card={inspectedCard}
        isOpen={!!inspectedCard}
        onClose={() => setInspectedCard(null)}
      />

    </div>
  );
};
