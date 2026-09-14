'use client';

import React, { useState } from 'react';
import { 
  BookOpen, 
  X, 
  Flame, 
  ShieldAlert, 
  Biohazard, 
  Users, 
  RotateCw, 
  Sparkles,
  HelpCircle,
  Skull,
  Eye
} from 'lucide-react';
import { CARD_DEFINITIONS } from '@/game/cardsData';

interface RulebookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulebookModal: React.FC<RulebookModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'GOAL' | 'PHASES' | 'CARDS' | 'TACTICS'>('GOAL');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-polar-900 border border-frost/30 rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-polar-950/90 border-b border-frost/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-frost">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wide text-slate-100 flex items-center gap-2">
                Справочник выживания: «НЕЧТО» (Stay Away!)
              </h2>
              <p className="text-xs text-frost/70">Станция «Аванпост 31» • Секретный протокол защиты</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-polar-950/50 px-6 gap-2 pt-2 text-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('GOAL')}
            className={`pb-3 px-3 font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'GOAL'
                ? 'border-frost text-frost font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Skull className="w-4 h-4" /> Роли и Цель игры
          </button>
          <button
            onClick={() => setActiveTab('PHASES')}
            className={`pb-3 px-3 font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'PHASES'
                ? 'border-frost text-frost font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RotateCw className="w-4 h-4" /> Фазы хода
          </button>
          <button
            onClick={() => setActiveTab('CARDS')}
            className={`pb-3 px-3 font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'CARDS'
                ? 'border-frost text-frost font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" /> Каталог карт
          </button>
          <button
            onClick={() => setActiveTab('TACTICS')}
            className={`pb-3 px-3 font-medium transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'TACTICS'
                ? 'border-frost text-frost font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" /> Тактика и Discord
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-300 text-sm leading-relaxed">
          {activeTab === 'GOAL' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/20">
                <h3 className="text-base font-bold text-frost mb-2 flex items-center gap-2">
                  <Biohazard className="w-5 h-5 text-hazard-amber" /> Сюжет и Атмосфера
                </h3>
                <p>
                  Глубоко во льдах Антарктики группа полярников пробудила древнюю форму жизни. 
                  Один из вас уже не человек — он может поглощать и имитировать членов группы. 
                  Через обмены картами заражение распространяется по станции. Никому нельзя доверять!
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-hazard-darkRed/20 border border-hazard-crimson/40">
                  <div className="flex items-center gap-2 text-hazard-crimson font-bold text-base mb-1">
                    <Biohazard className="w-5 h-5" /> НЕЧТО (1 игрок)
                  </div>
                  <p className="text-xs text-slate-300 mb-2">
                    Монстр, получивший карту «НЕЧТО». Знает свою сущность с первого хода.
                  </p>
                  <ul className="text-xs space-y-1 text-slate-400 list-disc list-inside">
                    <li>Никогда не может сбросить или передать карту «НЕЧТО».</li>
                    <li>Передает карты «Заражение» при обмене, чтобы вербовать союзников.</li>
                    <li><strong className="text-white">Победа:</strong> заразить или истребить всех людей.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-cyan-950/30 border border-frost/30">
                  <div className="flex items-center gap-2 text-frost font-bold text-base mb-1">
                    <Users className="w-5 h-5" /> ЗДОРОВЫЕ ЛЮДИ
                  </div>
                  <p className="text-xs text-slate-300 mb-2">
                    Обычные полярники, борющиеся за выживание станции.
                  </p>
                  <ul className="text-xs space-y-1 text-slate-400 list-disc list-inside">
                    <li>Никогда не могут передавать карту «Заражение».</li>
                    <li>Ищут огнеметы для уничтожения паразита.</li>
                    <li><strong className="text-white">Победа:</strong> сжечь Нечто из огнемёта.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-base mb-1">
                    <Eye className="w-5 h-5" /> ЗАРАЖЕННЫЕ
                  </div>
                  <p className="text-xs text-slate-300 mb-2">
                    Люди, получившие «Заражение» во время обмена от Нечто или другого зараженного.
                  </p>
                  <ul className="text-xs space-y-1 text-slate-400 list-disc list-inside">
                    <li>С этого момента играют в одной команде с Нечто.</li>
                    <li>Обязаны сохранять тайну и помогать Нечто победить.</li>
                    <li><strong className="text-white">Победа:</strong> вместе с Нечто.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'PHASES' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-polar-950 border border-white/10">
                <div className="text-frost font-bold text-sm mb-1">1. ФАЗА ДОБОРА (DRAW)</div>
                <p className="text-xs text-slate-300">
                  Активный игрок берет 1 карту из колоды в руку (рука увеличивается с 4 до 5 карт).
                  Если взята карта <span className="text-purple-400 font-semibold">Паники</span>, она применяется немедленно (например, меняет направление игры), после чего добирается обычная карта.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-polar-950 border border-white/10">
                <div className="text-frost font-bold text-sm mb-1">2. ФАЗА ДЕЙСТВИЯ (ACTION)</div>
                <p className="text-xs text-slate-300">
                  Игрок обязан сделать ОДНО из двух действий:
                </p>
                <ul className="mt-1 text-xs text-slate-400 space-y-1 list-disc list-inside">
                  <li><strong className="text-slate-200">Сыграть карту Действия / Препятствия:</strong> атаковать Огнемётом соседа, поставить заколоченную дверь, изолировать соседа в карантин или провести анализ крови.</li>
                  <li><strong className="text-slate-200">Или сбросить 1 ненужную карту в сброс</strong> в закрытую (нельзя сбрасывать «Нечто»!).</li>
                </ul>
                <p className="text-xs text-slate-400 mt-1">В руке снова становится 4 карты.</p>
              </div>

              <div className="p-4 rounded-xl bg-polar-950 border border-white/10">
                <div className="text-frost font-bold text-sm mb-1">3. ФАЗА ОБМЕНА КАРТАМИ (EXCHANGE)</div>
                <p className="text-xs text-slate-300">
                  Активный игрок ОБЯЗАН предложить 1 карту из руки своему живому соседу по текущему направлению хода (если путь не заблокирован дверью или карантином).
                </p>
                <ul className="mt-1 text-xs text-slate-400 space-y-1 list-disc list-inside">
                  <li>Сосед может защититься картой «Нет, спасибо!» или «Страх», отменив обмен.</li>
                  <li>Если защиты нет, сосед выбирает 1 свою карту для отдачи, и карты меняются одновременно!</li>
                  <li>Именно в этот момент Нечто может незаметно заразить соседа, передав карту «Заражение»!</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-polar-950 border border-white/10">
                <div className="text-frost font-bold text-sm mb-1">4. ПЕРЕДАЧА ХОДА (END TURN)</div>
                <p className="text-xs text-slate-300">
                  Ход передается следующему живому и незапертому в карантин игроку.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'CARDS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(CARD_DEFINITIONS).map(([key, card]) => {
                let badgeColor = 'bg-cyan-950 border-cyan-500/40 text-cyan-300';
                if (card.category === 'THE_THING') badgeColor = 'bg-red-950 border-red-500/50 text-red-300';
                if (card.category === 'INFECTION') badgeColor = 'bg-amber-950 border-amber-500/50 text-amber-300';
                if (card.category === 'DEFENSE') badgeColor = 'bg-emerald-950 border-emerald-500/50 text-emerald-300';
                if (card.category === 'OBSTACLE') badgeColor = 'bg-slate-800 border-slate-500/50 text-slate-200';
                if (card.category === 'PANIC') badgeColor = 'bg-purple-950 border-purple-500/50 text-purple-300';

                return (
                  <div key={key} className="p-3 rounded-xl bg-polar-950 border border-white/5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-slate-100 text-sm">{card.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeColor}`}>
                          {card.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mb-2 leading-relaxed">{card.description}</p>
                    </div>
                    {card.flavorText && (
                      <p className="text-[11px] text-slate-500 italic border-t border-white/5 pt-1.5">{card.flavorText}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'TACTICS' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-polar-950 border border-white/10">
                <h4 className="text-sm font-bold text-frost mb-1 flex items-center gap-2">
                  🎙️ Голосовой чат Discord — ваше главное оружие
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  «НЕЧТО» раскрывается на 100% при игре с живым голосовым общением. Блефуйте, обвиняйте других, 
                  убеждайте соседей, что вы здоровы, или договаривайтесь о срубе дверей. 
                  Если кто-то нервничает после обмена — возможно, он только что стал монстром!
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-cyan-950/20 border border-frost/20">
                  <h4 className="text-xs font-bold text-frost uppercase tracking-wider mb-2">Советы для Людей</h4>
                  <ul className="text-xs space-y-1.5 text-slate-300 list-disc list-inside">
                    <li>Используйте «Анализ крови» и «Подозрение», чтобы вычислять Нечто.</li>
                    <li>Берегите карту «Нет, спасибо!» на случай подозрительного соседа.</li>
                    <li>Заколачивайте двери, если сосед слева ведет себя агрессивно или подозрительно.</li>
                    <li>Огнемёт — единственный способ убить Нечто. Не тратьте его вслепую!</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-red-950/20 border border-hazard-crimson/30">
                  <h4 className="text-xs font-bold text-hazard-crimson uppercase tracking-wider mb-2">Советы для Нечто</h4>
                  <ul className="text-xs space-y-1.5 text-slate-300 list-disc list-inside">
                    <li>Не спешите сжигать людей сразу — старайтесь заразить как можно больше союзников.</li>
                    <li>Зараженные игроки будут отводить от вас подозрения и атаковать оставшихся людей.</li>
                    <li>Никогда не признавайтесь, если вас обвиняют — сейте паранойю между здоровыми игроками.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-polar-950 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-frost hover:bg-cyan-400 text-polar-950 font-bold text-sm transition-colors shadow-lg shadow-frost/20"
          >
            Понятно, в бой!
          </button>
        </div>

      </div>
    </div>
  );
};
