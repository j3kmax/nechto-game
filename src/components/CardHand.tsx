'use client';

import React, { useState } from 'react';
import { GameCard, TurnPhase, PlayerPrivate, PlayerPublic, BarredDoor } from '@/types/game';
import { 
  Flame, 
  Axe, 
  Microscope, 
  Eye, 
  Wine, 
  HeartHandshake, 
  ArrowLeftRight, 
  Search, 
  ShieldCheck, 
  ShieldX, 
  Ghost, 
  DoorClosed, 
  Biohazard, 
  Skull, 
  Sparkles,
  Footprints,
  Bomb,
  Info,
  DoorOpen,
  RotateCw,
  Zap,
  EyeOff
} from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';
import { CardDetailModal } from './CardDetailModal';

interface CardHandProps {
  cards: GameCard[];
  playerPrivate: PlayerPrivate;
  activePlayer: PlayerPublic;
  currentTurnPlayerId: string;
  phase: TurnPhase;
  doors: BarredDoor[];
  isCurrentTurn: boolean;
  onPlayCard: (card: GameCard) => void;
  onDiscardCard: (card: GameCard) => void;
  onOfferExchangeCard: (card: GameCard) => void;
  onRespondExchangeCard: (card: GameCard) => void;
  onDefenseCard: (card: GameCard) => void;
  isDefenseTarget: boolean;
  isExchangeTarget: boolean;
  onOpenRoleMemo?: () => void;
}

export const getCardVisual = (code: string) => {
  switch (code) {
    case 'THE_THING':
      return {
        icon: <Skull className="w-8 h-8 text-hazard-crimson animate-pulse" />,
        bg: 'bg-gradient-to-b from-red-950/80 to-black',
        border: 'border-hazard-crimson/70 shadow-red-950/50',
        badge: 'bg-red-950 text-red-300 border-red-500/50',
        label: 'НЕЧТО',
      };
    case 'INFECTION':
      return {
        icon: <Biohazard className="w-8 h-8 text-hazard-amber" />,
        bg: 'bg-gradient-to-b from-amber-950/70 to-polar-950',
        border: 'border-hazard-amber/60 shadow-amber-950/40',
        badge: 'bg-amber-950 text-amber-300 border-amber-500/50',
        label: 'ЗАРАЖЕНИЕ',
      };
    case 'FLAMETHROWER':
      return {
        icon: <Flame className="w-8 h-8 text-orange-400" />,
        bg: 'bg-gradient-to-b from-orange-950/60 to-polar-950',
        border: 'border-orange-500/60 shadow-orange-950/40',
        badge: 'bg-orange-950 text-orange-300 border-orange-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'AXE':
      return {
        icon: <Axe className="w-8 h-8 text-sky-400" />,
        bg: 'bg-gradient-to-b from-slate-900 to-polar-950',
        border: 'border-sky-500/50 shadow-sky-950/40',
        badge: 'bg-slate-900 text-sky-300 border-sky-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'ANALYSIS':
      return {
        icon: <Microscope className="w-8 h-8 text-teal-400" />,
        bg: 'bg-gradient-to-b from-teal-950/60 to-polar-950',
        border: 'border-teal-500/50 shadow-teal-950/40',
        badge: 'bg-teal-950 text-teal-300 border-teal-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'SUSPICION':
      return {
        icon: <Eye className="w-8 h-8 text-cyan-400" />,
        bg: 'bg-gradient-to-b from-cyan-950/60 to-polar-950',
        border: 'border-cyan-500/50 shadow-cyan-950/40',
        badge: 'bg-cyan-950 text-cyan-300 border-cyan-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'WHISKEY':
      return {
        icon: <Wine className="w-8 h-8 text-amber-500" />,
        bg: 'bg-gradient-to-b from-amber-950/50 to-polar-950',
        border: 'border-amber-500/50 shadow-amber-950/40',
        badge: 'bg-amber-950 text-amber-300 border-amber-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'SEDUCTION':
      return {
        icon: <HeartHandshake className="w-8 h-8 text-rose-400" />,
        bg: 'bg-gradient-to-b from-rose-950/50 to-polar-950',
        border: 'border-rose-500/50 shadow-rose-950/40',
        badge: 'bg-rose-950 text-rose-300 border-rose-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'SWITCH_PLACES':
      return {
        icon: <ArrowLeftRight className="w-8 h-8 text-blue-400" />,
        bg: 'bg-gradient-to-b from-blue-950/50 to-polar-950',
        border: 'border-blue-500/50 shadow-blue-950/40',
        badge: 'bg-blue-950 text-blue-300 border-blue-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'GET_OUT_OF_HERE':
      return {
        icon: <Footprints className="w-8 h-8 text-sky-400" />,
        bg: 'bg-gradient-to-b from-sky-950/50 to-polar-950',
        border: 'border-sky-500/50 shadow-sky-950/40',
        badge: 'bg-sky-950 text-sky-300 border-sky-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'PERSEVERANCE':
      return {
        icon: <Search className="w-8 h-8 text-indigo-400" />,
        bg: 'bg-gradient-to-b from-indigo-950/50 to-polar-950',
        border: 'border-indigo-500/50 shadow-indigo-950/40',
        badge: 'bg-indigo-950 text-indigo-300 border-indigo-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'NO_THANKS':
      return {
        icon: <ShieldX className="w-8 h-8 text-emerald-400" />,
        bg: 'bg-gradient-to-b from-emerald-950/60 to-polar-950',
        border: 'border-emerald-500/60 shadow-emerald-950/40',
        badge: 'bg-emerald-950 text-emerald-300 border-emerald-500/50',
        label: 'ЗАЩИТА',
      };
    case 'NO_BARBECUE':
      return {
        icon: <ShieldCheck className="w-8 h-8 text-amber-400" />,
        bg: 'bg-gradient-to-b from-amber-950/60 to-polar-950',
        border: 'border-amber-500/60 shadow-amber-950/40',
        badge: 'bg-amber-950 text-amber-300 border-amber-500/50',
        label: 'ЗАЩИТА',
      };
    case 'IM_FINE_HERE':
      return {
        icon: <ShieldCheck className="w-8 h-8 text-cyan-400" />,
        bg: 'bg-gradient-to-b from-cyan-950/60 to-polar-950',
        border: 'border-cyan-500/60 shadow-cyan-950/40',
        badge: 'bg-cyan-950 text-cyan-300 border-cyan-500/50',
        label: 'ЗАЩИТА',
      };
    case 'MISSED':
      return {
        icon: <ShieldCheck className="w-8 h-8 text-emerald-400" />,
        bg: 'bg-gradient-to-b from-emerald-950/60 to-polar-950',
        border: 'border-emerald-500/60 shadow-emerald-950/40',
        badge: 'bg-emerald-950 text-emerald-300 border-emerald-500/50',
        label: 'ЗАЩИТА',
      };
    case 'PARTY_OVER':
      return {
        icon: <Bomb className="w-8 h-8 text-rose-400 animate-pulse" />,
        bg: 'bg-gradient-to-b from-rose-950/60 to-polar-950',
        border: 'border-rose-500/60 shadow-rose-950/40',
        badge: 'bg-rose-950 text-rose-300 border-rose-500/50',
        label: 'ПАНИКА',
      };
    case 'FEAR':
      return {
        icon: <Ghost className="w-8 h-8 text-emerald-400" />,
        bg: 'bg-gradient-to-b from-emerald-950/60 to-polar-950',
        border: 'border-emerald-500/60 shadow-emerald-950/40',
        badge: 'bg-emerald-950 text-emerald-300 border-emerald-500/50',
        label: 'ЗАЩИТА',
      };
    case 'BARRED_DOOR':
      return {
        icon: <DoorClosed className="w-8 h-8 text-slate-300" />,
        bg: 'bg-gradient-to-b from-slate-900 to-polar-950',
        border: 'border-slate-500/60 shadow-slate-950/40',
        badge: 'bg-slate-900 text-slate-300 border-slate-500/50',
        label: 'ПРЕПЯТСТВИЕ',
      };
    case 'QUARANTINE':
      return {
        icon: <Biohazard className="w-8 h-8 text-cyan-400" />,
        bg: 'bg-gradient-to-b from-cyan-950/60 to-polar-950',
        border: 'border-cyan-500/60 shadow-cyan-950/40',
        badge: 'bg-cyan-950 text-cyan-300 border-cyan-500/50',
        label: 'ПРЕПЯТСТВИЕ',
      };
    case 'LOOK_AROUND':
    case 'CHANGE_DIRECTION':
      return {
        icon: <RotateCw className="w-8 h-8 text-amber-400" />,
        bg: 'bg-gradient-to-b from-amber-950/50 to-polar-950',
        border: 'border-amber-500/50 shadow-amber-950/40',
        badge: 'bg-amber-950 text-amber-300 border-amber-500/50',
        label: 'ДЕЙСТВИЕ',
      };
    case 'PANIC_FORGETFULNESS':
      return {
        icon: <Sparkles className="w-8 h-8 text-fuchsia-400 animate-pulse" />,
        bg: 'bg-gradient-to-b from-fuchsia-950/60 to-polar-950',
        border: 'border-fuchsia-500/60 shadow-fuchsia-950/40',
        badge: 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-500/50',
        label: 'ПАНИКА',
      };
    case 'PANIC_BLIND_DATE':
      return {
        icon: <EyeOff className="w-8 h-8 text-fuchsia-400 animate-pulse" />,
        bg: 'bg-gradient-to-b from-fuchsia-950/60 to-polar-950',
        border: 'border-fuchsia-500/60 shadow-fuchsia-950/40',
        badge: 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-500/50',
        label: 'ПАНИКА',
      };
    case 'PANIC_CHAIN_REACTION':
      return {
        icon: <Zap className="w-8 h-8 text-fuchsia-400 animate-pulse" />,
        bg: 'bg-gradient-to-b from-fuchsia-950/60 to-polar-950',
        border: 'border-fuchsia-500/60 shadow-fuchsia-950/40',
        badge: 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-500/50',
        label: 'ПАНИКА',
      };
    case 'PANIC_OPEN_DOORS':
      return {
        icon: <DoorOpen className="w-8 h-8 text-fuchsia-400 animate-pulse" />,
        bg: 'bg-gradient-to-b from-fuchsia-950/60 to-polar-950',
        border: 'border-fuchsia-500/60 shadow-fuchsia-950/40',
        badge: 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-500/50',
        label: 'ПАНИКА',
      };
    case 'PANIC_ONE_TWO_5':
      return {
        icon: <ArrowLeftRight className="w-8 h-8 text-pink-400 animate-pulse" />,
        bg: 'bg-gradient-to-b from-pink-950/60 to-polar-950',
        border: 'border-pink-500/60 shadow-pink-950/40',
        badge: 'bg-pink-950 text-pink-300 border-pink-500/50',
        label: 'ПАНИКА',
      };
    case 'PANIC_PARTY_5':
      return {
        icon: <Bomb className="w-8 h-8 text-pink-400 animate-pulse" />,
        bg: 'bg-gradient-to-b from-pink-950/60 to-polar-950',
        border: 'border-pink-500/60 shadow-pink-950/40',
        badge: 'bg-pink-950 text-pink-300 border-pink-500/50',
        label: 'ПАНИКА',
      };
    case 'PANIC_GET_AWAY_5':
      return {
        icon: <Footprints className="w-8 h-8 text-pink-400 animate-pulse" />,
        bg: 'bg-gradient-to-b from-pink-950/60 to-polar-950',
        border: 'border-pink-500/60 shadow-pink-950/40',
        badge: 'bg-pink-950 text-pink-300 border-pink-500/50',
        label: 'ПАНИКА',
      };
    default:
      return {
        icon: <Sparkles className="w-8 h-8 text-frost" />,
        bg: 'bg-gradient-to-b from-polar-900 to-polar-950',
        border: 'border-frost/40 shadow-cyan-950/40',
        badge: 'bg-polar-900 text-frost border-frost/30',
        label: 'КАРТА',
      };
  }
};

export const CardHand: React.FC<CardHandProps> = ({
  cards,
  playerPrivate,
  activePlayer,
  currentTurnPlayerId,
  phase,
  doors,
  isCurrentTurn,
  onPlayCard,
  onDiscardCard,
  onOfferExchangeCard,
  onRespondExchangeCard,
  onDefenseCard,
  isDefenseTarget,
  isExchangeTarget,
  onOpenRoleMemo,
}) => {
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [inspectedCard, setInspectedCard] = useState<GameCard | null>(null);

  // Определение роли для секретного бейджа
  let roleBadge = {
    title: 'ЗДОРОВЫЙ ЧЕЛОВЕК',
    desc: 'Вы человек. Ваша цель: найти и сжечь Нечто.',
    style: 'border-frost/40 bg-cyan-950/60 text-frost hover:border-frost',
    icon: <ShieldCheck className="w-4 h-4 text-frost" />,
  };

  if (playerPrivate.role === 'THE_THING') {
    roleBadge = {
      title: 'ВЫ — НЕЧТО',
      desc: 'Вы чудовище! Заражайте полярников через обмен картами.',
      style: 'border-hazard-crimson/80 bg-red-950/80 text-hazard-crimson animate-pulse hover:border-red-400',
      icon: <Skull className="w-4 h-4 text-hazard-crimson" />,
    };
  } else if (playerPrivate.role === 'INFECTED') {
    roleBadge = {
      title: 'ВЫ ЗАРАЖЕНЫ',
      desc: 'Вы в команде Нечто. Нажмите для памятки правил роли.',
      style: 'border-hazard-amber/70 bg-amber-950/70 text-hazard-amber hover:border-amber-400',
      icon: <Biohazard className="w-4 h-4 text-hazard-amber" />,
    };
  }

  return (
    <div className="w-full flex flex-col items-center select-none pb-2 pt-1 px-3">
      
      {/* Секретный бейдж роли (виден только владельцу, кликабелен для памятки) */}
      <button
        type="button"
        onClick={() => onOpenRoleMemo?.()}
        className={`flex items-center gap-2 mb-2 px-3.5 py-1.5 rounded-full border shadow-lg backdrop-blur-md transition-all text-xs font-semibold cursor-pointer hover:scale-105 active:scale-95 ${roleBadge.style}`}
        title="Нажмите, чтобы открыть памятку по вашей роли и правилам"
      >
        {roleBadge.icon}
        <span>{roleBadge.title}</span>
        <span className="text-[11px] opacity-80 hidden sm:inline">• {roleBadge.desc}</span>
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-slate-300 ml-1">
          Памятка
        </span>
      </button>

      {/* Подсказка текущего шага хода / статуса */}
      <div className="w-full max-w-2xl mb-2 px-3 py-1.5 rounded-xl border border-white/10 bg-polar-900/90 text-center text-xs font-semibold backdrop-blur-md shadow-md transition-all">
        {isCurrentTurn ? (
          phase === 'ACTION' ? (
            activePlayer.quarantineTurns > 0 ? (
              <span className="text-amber-300">
                ☣️ <strong>ВЫ В КАРАНТИНЕ:</strong> По правилам (стр. 13) играть действия нельзя. Выберите карту и нажмите <strong>«Сбросить»</strong> в закрытую.
              </span>
            ) : (
              <span className="text-frost">
                🎯 <strong>ВАШ ХОД (Шаг 2 из 3):</strong> Нажмите <strong>«Сыграть»</strong> на карте действия ИЛИ <strong>«Сбросить»</strong> карту в закрытую стопку сброса.
              </span>
            )
          ) : phase === 'EXCHANGE_OFFER' ? (
            <span className="text-amber-300">
              🤝 <strong>ВАШ ХОД (Шаг 3 из 3 — Обмен):</strong> Выберите 1 карту из руки и нажмите <strong>«Передать»</strong> для тайного обмена со следующим полярником.
            </span>
          ) : (
            <span className="text-slate-300">
              ⏳ Ожидание ответа на обмен...
            </span>
          )
        ) : isDefenseTarget ? (
          <span className="text-red-300 animate-pulse">
            🚨 <strong>ВАС АТАКУЮТ ИЛИ ПРЕДЛАГАЮТ ОБМЕН!</strong> Сыграйте карту защиты ниже или ответьте в окне защиты.
          </span>
        ) : isExchangeTarget ? (
          <span className="text-emerald-300 animate-pulse">
            🤝 <strong>ВАМ ПРЕДЛОЖИЛИ ТАЙНЫЙ ОБМЕН!</strong> Выберите карту и нажмите <strong>«Отдать в ответ»</strong>.
          </span>
        ) : (
          <span className="text-slate-400">
            👁️ Наблюдайте за действиями полярников. В начале и конце хода у каждого всегда ровно 4 карты.
          </span>
        )}
      </div>

      {/* Веер карт в руке */}
      <div className="flex items-end justify-center gap-2 sm:gap-3 flex-wrap max-w-5xl px-2 py-1">
        {cards.map((card, idx) => {
          const visual = getCardVisual(card.code);
          const isHovered = hoveredCardId === card.id;

          // Проверка доступных действий
          const isPlayable = isCurrentTurn && phase === 'ACTION' && card.category !== 'THE_THING' && card.category !== 'INFECTION' && card.category !== 'DEFENSE' && activePlayer.quarantineTurns === 0;
          const isDiscardable = isCurrentTurn && phase === 'ACTION' && card.code !== 'THE_THING' && !(card.code === 'INFECTION' && playerPrivate.role === 'INFECTED' && cards.filter(c => c.code === 'INFECTION').length <= 1);
          const isExchangeableOffer = isCurrentTurn && phase === 'EXCHANGE_OFFER' && card.code !== 'THE_THING' && (card.code !== 'INFECTION' || playerPrivate.role !== 'HUMAN');
          const isExchangeableResponse = isExchangeTarget && (phase === 'EXCHANGE_RESPOND' || phase === 'EXCHANGE_DEFENSE_WAIT') && card.code !== 'THE_THING' && (card.code !== 'INFECTION' || playerPrivate.role !== 'HUMAN');
          const isDefendable = isDefenseTarget && card.category === 'DEFENSE';
          const hasAnyAction = isPlayable || isDiscardable || isExchangeableOffer || isExchangeableResponse || isDefendable;

          let disabledReason = 'Недоступно в текущий момент';
          if (card.code === 'THE_THING') {
            disabledReason = 'Нечто нельзя сбросить или передать (стр. 8)';
          } else if (activePlayer.quarantineTurns > 0 && card.category === 'ACTION') {
            disabledReason = 'В карантине играть действия запрещено (стр. 13)';
          } else if (card.category === 'DEFENSE' && isCurrentTurn) {
            disabledReason = 'Защита играется только в чужой ход (стр. 12)';
          } else if (card.code === 'INFECTION' && playerPrivate.role === 'HUMAN' && (phase === 'EXCHANGE_OFFER' || isExchangeTarget)) {
            disabledReason = 'Человек не может передавать Заражение (стр. 7)';
          } else if (card.code === 'INFECTION' && playerPrivate.role === 'INFECTED' && cards.filter(c => c.code === 'INFECTION').length <= 1) {
            disabledReason = 'Заражённый обязан держать 1 Заражение (стр. 7)';
          } else if (!isCurrentTurn && !isDefenseTarget && !isExchangeTarget) {
            disabledReason = 'Действие недоступно в чужой ход';
          } else if (isCurrentTurn && phase === 'EXCHANGE_OFFER') {
            disabledReason = 'В фазе обмена можно только передать карту';
          }

          return (
            <div
              key={card.id}
              onMouseEnter={() => {
                setHoveredCardId(card.id);
                soundFx.playCardDraw();
              }}
              onMouseLeave={() => setHoveredCardId(null)}
              className={`relative flex flex-col justify-between w-32 sm:w-36 h-48 sm:h-52 rounded-xl p-2.5 border transition-all duration-200 shadow-xl cursor-pointer ${visual.bg} ${visual.border} ${
                isHovered ? '-translate-y-4 scale-105 z-30 shadow-2xl ring-2 ring-frost/50' : 'hover:-translate-y-2'
              }`}
            >
              {/* Верх: категория, иконка инфо и название */}
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
                    className="p-1 rounded-md text-slate-400 hover:text-frost hover:bg-white/10 transition-colors cursor-pointer"
                    title="Посмотреть описание и правила карты"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-100 leading-tight">
                  {card.name}
                </h4>
              </div>

              {/* Центр: иллюстрация/символ */}
              <div 
                className="flex items-center justify-center py-2"
                onClick={(e) => {
                  e.stopPropagation();
                  soundFx.playCardDraw();
                  setInspectedCard(card);
                }}
                title="Нажмите для просмотра правил карты"
              >
                <div className="p-3 rounded-full bg-black/40 border border-white/5 shadow-inner hover:scale-110 transition-transform">
                  {visual.icon}
                </div>
              </div>

              {/* Низ: краткий эффект или кнопки действий */}
              <div className="space-y-1">
                {isHovered ? (
                  <div className="flex flex-col gap-1 animate-in fade-in duration-150">
                    {isPlayable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayCard(card);
                        }}
                        className="w-full py-1 text-[11px] font-bold rounded-lg bg-frost hover:bg-cyan-400 text-polar-950 transition-colors shadow cursor-pointer active:scale-95"
                      >
                        Сыграть
                      </button>
                    )}

                    {isDiscardable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDiscardCard(card);
                        }}
                        className="w-full py-1 text-[11px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-white/10 cursor-pointer active:scale-95"
                      >
                        Сбросить
                      </button>
                    )}

                    {isExchangeableOffer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOfferExchangeCard(card);
                        }}
                        className="w-full py-1 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-polar-950 transition-colors shadow cursor-pointer active:scale-95"
                      >
                        Передать
                      </button>
                    )}

                    {isExchangeableResponse && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRespondExchangeCard(card);
                        }}
                        className="w-full py-1 text-[11px] font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-polar-950 transition-colors shadow cursor-pointer active:scale-95"
                      >
                        Отдать в ответ
                      </button>
                    )}

                    {isDefendable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDefenseCard(card);
                        }}
                        className="w-full py-1 text-[11px] font-bold rounded-lg bg-emerald-400 hover:bg-emerald-300 text-polar-950 transition-colors shadow animate-pulse cursor-pointer active:scale-95"
                      >
                        Защититься!
                      </button>
                    )}

                    {!hasAnyAction && (
                      <div className="py-1 px-1.5 rounded bg-black/70 border border-amber-500/30 text-[9px] text-amber-300 font-medium text-center leading-tight">
                        {disabledReason}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        soundFx.playCardDraw();
                        setInspectedCard(card);
                      }}
                      className="w-full py-0.5 text-[10px] font-semibold text-slate-400 hover:text-frost flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Info className="w-3 h-3" /> Описание
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight">
                    {card.description}
                  </p>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* Модальное окно просмотра правил карты */}
      <CardDetailModal
        card={inspectedCard}
        isOpen={!!inspectedCard}
        onClose={() => setInspectedCard(null)}
      />

    </div>
  );
};
