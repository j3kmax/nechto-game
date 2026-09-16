'use client';

import React, { useState } from 'react';
import { PendingCardChoice, GameCard } from '@/types/game';
import { getCardVisual } from './CardHand';
import { Check, Info, Layers, Sparkles } from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';
import { CardDetailModal } from './CardDetailModal';

interface CardChoiceModalProps {
  choice: PendingCardChoice;
  onSelectCard: (cardId: string) => void;
}

export const CardChoiceModal: React.FC<CardChoiceModalProps> = ({
  choice,
  onSelectCard,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [inspectedCard, setInspectedCard] = useState<GameCard | null>(null);

  const handleConfirm = () => {
    if (!selectedCardId) return;
    soundFx.playCardDraw();
    onSelectCard(selectedCardId);
  };

  const isPerseverance = choice.type.startsWith('PERSEVERANCE');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in select-none">
      <div 
        className="relative w-full max-w-2xl p-5 sm:p-7 rounded-3xl bg-gradient-to-b from-polar-900 via-polar-900 to-polar-950 border border-frost/40 shadow-2xl shadow-cyan-950/70 text-slate-100 flex flex-col items-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Верхний бейдж типа действия */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/80 border border-frost/40 text-frost text-xs font-black tracking-widest uppercase mb-3 animate-pulse">
          {isPerseverance ? <Layers className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          <span>{choice.title}</span>
        </div>

        {/* Описание выбора */}
        <p className="text-xs sm:text-sm text-slate-300 text-center max-w-lg mb-4 sm:mb-6">
          {choice.description}
        </p>

        {/* Карточки на выбор */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap max-w-xl mb-6">
          {choice.availableCards.map((card) => {
            const visual = getCardVisual(card.code);
            const isSelected = selectedCardId === card.id;

            return (
              <div
                key={card.id}
                onClick={() => {
                  soundFx.playCardDraw();
                  setSelectedCardId(card.id);
                }}
                className={`relative flex flex-col justify-between w-32 sm:w-36 h-48 sm:h-52 rounded-2xl p-3 border transition-all duration-200 shadow-xl cursor-pointer ${visual.bg} ${visual.border} ${
                  isSelected 
                    ? 'ring-4 ring-frost scale-105 shadow-2xl shadow-cyan-500/30 -translate-y-2' 
                    : 'hover:-translate-y-1 hover:border-frost/60 opacity-85 hover:opacity-100'
                }`}
              >
                {/* Верх: категория и кнопка инфо */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
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
                      className="p-1 rounded-md text-slate-400 hover:text-frost hover:bg-white/10 transition-colors"
                      title="Описание карты"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-100 leading-tight">
                    {card.name}
                  </h4>
                </div>

                {/* Центр: иконка */}
                <div className="flex items-center justify-center py-2">
                  <div className="p-3 rounded-full bg-black/40 border border-white/5 shadow-inner">
                    {visual.icon}
                  </div>
                </div>

                {/* Низ: индикатор выбора */}
                <div className="text-center">
                  <div className={`py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    isSelected ? 'bg-frost text-polar-950 font-black' : 'bg-black/40 text-slate-400 border border-white/10'
                  }`}>
                    {isSelected ? '✓ Выбрано' : 'Нажмите для выбора'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Кнопка подтверждения */}
        <button
          type="button"
          disabled={!selectedCardId}
          onClick={handleConfirm}
          className={`w-full max-w-md py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
            selectedCardId
              ? 'bg-frost hover:bg-cyan-400 text-polar-950 shadow-cyan-950/50'
              : 'bg-polar-800 text-slate-500 cursor-not-allowed border border-white/5'
          }`}
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>Подтвердить выбор</span>
        </button>

        {/* Модалка детального просмотра описания карты */}
        {inspectedCard && (
          <CardDetailModal card={inspectedCard} isOpen={Boolean(inspectedCard)} onClose={() => setInspectedCard(null)} />
        )}
      </div>
    </div>
  );
};
