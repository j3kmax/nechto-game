'use client';

import React from 'react';
import { 
  Biohazard, 
  Skull, 
  ShieldAlert, 
  EyeOff, 
  Check, 
  AlertTriangle, 
  ShieldCheck, 
  Flame, 
  UserCheck 
} from 'lucide-react';
import { Role } from '@/types/game';
import { soundFx } from '@/lib/soundEffects';

interface InfectionAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  role?: Role;
  infectedByName?: string;
  isInitialAlert?: boolean; // true when first infected, false when opened via role badge
}

export const InfectionAlertModal: React.FC<InfectionAlertModalProps> = ({
  isOpen,
  onClose,
  role = 'INFECTED',
  infectedByName,
  isInitialAlert = true,
}) => {
  if (!isOpen) return null;

  const handleDismiss = () => {
    soundFx.playCardDraw();
    onClose();
  };

  // 1. Памятка для НЕЧТО
  if (role === 'THE_THING') {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleDismiss();
        }}
      >
        <div 
          className="relative w-full max-w-lg p-5 sm:p-7 rounded-3xl bg-gradient-to-b from-polar-900 via-polar-900 to-polar-950 border border-hazard-crimson/70 shadow-2xl shadow-red-950/70 text-slate-100 flex flex-col items-center animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/20 border border-hazard-crimson text-hazard-crimson text-xs font-black tracking-widest uppercase mb-3 sm:mb-4 animate-pulse">
            <Skull className="w-4 h-4" />
            <span>СЕКРЕТНАЯ РОЛЬ: ВЫ — НЕЧТО</span>
            <Skull className="w-4 h-4" />
          </div>

          <h3 className="text-xl sm:text-2xl font-black text-center text-slate-100 mb-2">
            Абсолютный хищник станции
          </h3>

          <div className="w-full p-3.5 rounded-2xl bg-red-950/40 border border-red-500/30 text-xs sm:text-sm text-slate-200 mb-4 leading-relaxed text-center">
            <p>
              Вы — космический организм, проникший на полярную станцию. Ваша цель — тайно заразить всех полярников или уничтожить оставшихся людей!
            </p>
          </div>

          <div className="w-full space-y-2.5 mb-5 text-left text-xs sm:text-[13px]">
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
              <Skull className="w-4 h-4 text-hazard-crimson shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">Карта «НЕЧТО»:</strong>
                <span className="text-slate-400 ml-1">
                  Эту карту строго запрещено сбрасывать в сброс или передавать при обмене. Она всегда остается в вашей руке.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
              <Biohazard className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">Заражение других:</strong>
                <span className="text-slate-400 ml-1">
                  Только вы можете заражать людей, передавая карту «Заражение» в фазе тайного обмена. Зараженный становится вашим верным союзником!
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
              <Flame className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">Смертельная уязвимость:</strong>
                <span className="text-slate-400 ml-1">
                  Огнемёт — единственное оружие, способное убить Нечто. Всегда держите защиту («Никакого шашлыка!», «Нет уж, спасибо!») на случай атаки.
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-3 rounded-2xl bg-hazard-crimson hover:bg-red-500 text-white font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-red-950/50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Понятно, скрывать сущность</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Памятка для ЗДОРОВОГО ЧЕЛОВЕКА
  if (role === 'HUMAN') {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleDismiss();
        }}
      >
        <div 
          className="relative w-full max-w-lg p-5 sm:p-7 rounded-3xl bg-gradient-to-b from-polar-900 via-polar-900 to-polar-950 border border-frost/50 shadow-2xl shadow-cyan-950/70 text-slate-100 flex flex-col items-center animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/20 border border-frost/40 text-frost text-xs font-black tracking-widest uppercase mb-3 sm:mb-4">
            <ShieldCheck className="w-4 h-4" />
            <span>РОЛЬ: ЗДОРОВЫЙ ЧЕЛОВЕК</span>
            <ShieldCheck className="w-4 h-4" />
          </div>

          <h3 className="text-xl sm:text-2xl font-black text-center text-slate-100 mb-2">
            Исследователь станции «Аванпост 31»
          </h3>

          <div className="w-full p-3.5 rounded-2xl bg-cyan-950/40 border border-frost/30 text-xs sm:text-sm text-slate-200 mb-4 leading-relaxed text-center">
            <p>
              Вы чисты и здоровы. Ваша цель — объединиться с людьми, вычислить, кто из полярников скрывает монстра, и сжечь Нечто дотла!
            </p>
          </div>

          <div className="w-full space-y-2.5 mb-5 text-left text-xs sm:text-[13px]">
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
              <Flame className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">Цель людей:</strong>
                <span className="text-slate-400 ml-1">
                  Найти Нечто и уничтожить его с помощью карты «Огнемёт». Как только Нечто сожжено — Люди побеждают немедленно!
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
              <Biohazard className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">Опасность заражения:</strong>
                <span className="text-slate-400 ml-1">
                  Если при тайном обмене Нечто передаст вам карту «Заражение», вы тайно перейдете в команду монстра. Защищайтесь от нежелательного обмена картами «Нет уж, спасибо!» и «Мимо!».
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
              <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-100">Карта «Заражение» из колоды:</strong>
                <span className="text-slate-400 ml-1">
                  Если вы взяли «Заражение» в начале хода из колоды, вы НЕ заражаетесь. Однако человеку запрещено передавать эту карту другим игрокам.
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-3 rounded-2xl bg-frost hover:bg-cyan-400 text-polar-950 font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Вернуться к столу</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. Памятка и тревога для ЗАРАЖЕННОГО
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div 
        className="relative w-full max-w-lg p-5 sm:p-7 rounded-3xl bg-gradient-to-b from-polar-900 via-polar-900 to-polar-950 border border-hazard-amber/60 shadow-2xl shadow-amber-950/70 text-slate-100 flex flex-col items-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Аварийный маяк */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-hazard-amber text-amber-400 text-xs font-black tracking-widest uppercase mb-3 sm:mb-4 animate-pulse">
          <Biohazard className="w-4 h-4" />
          <span>{isInitialAlert ? 'ТРЕВОГА: ВЫ ЗАРАЖЕНЫ!' : 'ПАМЯТКА: ЗАРАЖЕННЫЙ'}</span>
          <Biohazard className="w-4 h-4" />
        </div>

        {/* Заголовок */}
        <h3 className="text-xl sm:text-2xl font-black text-center text-slate-100 mb-2">
          {isInitialAlert ? 'Вирус проник в ваш организм' : 'Вы на стороне Нечто'}
        </h3>

        {/* Описание события передачи */}
        <div className="w-full p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-xs sm:text-sm text-slate-200 mb-4 leading-relaxed text-center">
          {infectedByName ? (
            <p>
              Полярник <strong className="text-amber-300 font-bold">{infectedByName}</strong> тайно передал вам карту <strong className="text-amber-400">«Заражение»</strong>. Вы больше не человек — теперь вы заражены и сражаетесь в одной команде с <strong>Нечто</strong>!
            </p>
          ) : (
            <p>
              Вы получили карту <strong className="text-amber-400">«Заражение»</strong> при обмене. Вы больше не человек — теперь вы заражены и сражаетесь в одной команде с <strong>Нечто</strong>!
            </p>
          )}
        </div>

        {/* Правила игры за Зараженного */}
        <div className="w-full space-y-2.5 mb-5 text-left text-xs sm:text-[13px]">
          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
            <Skull className="w-4 h-4 text-hazard-crimson shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Ваша цель — победа Нечто:</strong>
              <span className="text-slate-400 ml-1">
                Вы побеждаете, если Нечто победит (все люди на станции уничтожены или заражены). Если Нечто погибнет от огнемёта — вы тоже проиграете.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
            <EyeOff className="w-4 h-4 text-frost shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Строгая секретность:</strong>
              <span className="text-slate-400 ml-1">
                Никому не сообщайте о своем статусе. Ведите себя как обычный полярник, блефуйте, сейте подозрения и отводите огонь от Нечто.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
            <Biohazard className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Хранение карты Заражения:</strong>
              <span className="text-slate-400 ml-1">
                По правилам вы обязаны всегда держать на руке хотя бы 1 карту «Заражение» (её нельзя сбросить в стопку сброса).
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Кто может заражать:</strong>
              <span className="text-slate-400 ml-1">
                Только само Нечто может заражать здоровых людей при обмене. Зараженные полярники не могут передавать карту «Заражение» другим игрокам (кроме как обратно самому Нечто).
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-polar-950/80 border border-white/5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Тайна сокомандников:</strong>
              <span className="text-slate-400 ml-1">
                Вы знаете только того, кто передал вам карту. Вы <em>не знаете</em>, кто еще из полярников заражен — они могут быть как людьми, так и вашими тайными союзниками!
              </span>
            </div>
          </div>
        </div>

        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={handleDismiss}
          className="w-full py-3 rounded-2xl bg-hazard-amber hover:bg-amber-400 text-polar-950 font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-amber-950/50 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{isInitialAlert ? 'Понятно, хранить тайну' : 'Закрыть памятку'}</span>
        </button>
      </div>
    </div>
  );
};
