'use client';

import React, { useEffect } from 'react';
import { GameCard } from '@/types/game';
import { getCardVisual } from './CardHand';
import { 
  X, 
  ShieldAlert, 
  Target, 
  DoorClosed, 
  HelpCircle, 
  Lightbulb, 
  Quote 
} from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';

interface CardDetailModalProps {
  card: GameCard | null;
  isOpen: boolean;
  onClose: () => void;
}

interface CardRulesMeta {
  targetType: string;
  defenseInfo: string;
  obstacleInfo: string;
  playPhase: string;
  tacticalTip: string;
}

export const getCardRulesMeta = (code: string): CardRulesMeta => {
  switch (code) {
    case 'THE_THING':
      return {
        targetType: 'Пассивная карта (находится только у истинного Нечто)',
        defenseInfo: 'Не разыгрывается. Защита не требуется.',
        obstacleInfo: 'Не может быть сброшена или передана ни при каких условиях!',
        playPhase: 'Начало игры (роздана втайне)',
        tacticalTip: 'Притворяйтесь обычным человеком! Заражайте соседей при обмене картами Заражения. Остерегайтесь игроков с огнемётом.',
      };

    case 'INFECTION':
      return {
        targetType: 'Скрытая передача при обмене картами',
        defenseInfo: 'Жертва может защититься картами «Нет, спасибо!» или «Страх».',
        obstacleInfo: 'Люди НЕ могут передавать карту Заражения другим. Только Нечто и Зараженные могут распространять заразу.',
        playPhase: 'Фаза обмена (Exchange Phase)',
        tacticalTip: 'Если вы человек и вам передали Заражение от Нечто — вы переходите в команду Нечто! Помогайте монстру победить людей.',
      };

    case 'FLAMETHROWER':
      return {
        targetType: 'Смежный живой сосед за столом (слева или справа)',
        defenseInfo: 'Жертва может спастись, сыграв карту защиты «Мимо!».',
        obstacleInfo: 'Заколоченная дверь блокирует атаку. Игрока в Карантине атаковать нельзя.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Главное оружие людей! Если вы уверены, кто Нечто — сжигайте его без колебаний. Сожженный игрок выбывает навсегда.',
      };

    case 'AXE':
      return {
        targetType: 'Любая заколоченная дверь за столом ИЛИ сосед в карантине',
        defenseInfo: 'Защита невозможна.',
        obstacleInfo: 'Разрушает доски на двери или досрочно освобождает соседа из карантина.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Используйте топор, чтобы прорубить проход к подозрительному игроку для огнемета или чтобы освободить союзника из изолятора.',
      };

    case 'ANALYSIS':
      return {
        targetType: 'Смежный живой сосед (слева или справа)',
        defenseInfo: 'Защита невозможна.',
        obstacleInfo: 'Блокируется заколоченной дверью и карантином.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Вы втайне видите ВСЕ карты в руке соседа. Если у него карта «НЕЧТО» или «Заражение» — в следующий ход готовьте огнемёт!',
      };

    case 'SUSPICION':
      return {
        targetType: 'Смежный живой сосед (слева или справа)',
        defenseInfo: 'Защита невозможна.',
        obstacleInfo: 'Блокируется заколоченной дверью и карантином.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Позволяет вытянуть 1 случайную карту из руки соседа и посмотреть её. Отличный быстрый способ прощупать намерения.',
      };

    case 'WHISKEY':
      return {
        targetType: 'Все игроки за столом (публичный показ)',
        defenseInfo: 'Не применяется.',
        obstacleInfo: 'Работает всегда, даже если вы находитесь в карантине.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Сыграйте виски, чтобы показать всем свои карты и железно доказать свою невиновность, заслужив доверие других исследователей.',
      };

    case 'SEDUCTION':
      return {
        targetType: 'ЛЮБОЙ живой игрок за столом (на любом расстоянии)',
        defenseInfo: 'Цель может ответить картой «Нет, спасибо!» или «Страх».',
        obstacleInfo: 'Полностью ИГНОРИРУЕТ заколоченные двери и расстояние!',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Позволяет обойти баррикады и провести внеочередной обмен с дальним игроком. Опаснейший инструмент в руках Нечто!',
      };

    case 'SWITCH_PLACES':
      return {
        targetType: 'Смежный живой сосед (слева или справа)',
        defenseInfo: 'Защита невозможна.',
        obstacleInfo: 'Нельзя поменяться местами, если между вами стоит заколоченная дверь.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Меняет вас местами за столом! Позволяет сбежать от опасного соседа с огнемётом или подобраться ближе к жертве.',
      };

    case 'PERSEVERANCE':
      return {
        targetType: 'Применяется на самого себя',
        defenseInfo: 'Не применяется.',
        obstacleInfo: 'Работает даже в карантине.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Вы берете 3 карты из колоды, выбираете лучшую в руку, а остальные две сбрасываете. Лучший способ быстро найти огнемёт или защиту!',
      };

    case 'NO_THANKS':
      return {
        targetType: 'В ответ на предложение обмена от соседа или карту «Соблазн»',
        defenseInfo: 'Это сама карта защиты! Полностью отменяет обмен.',
        obstacleInfo: 'Не требует сброса карт взамен.',
        playPhase: 'Фаза защиты при обмене (Exchange Defense)',
        tacticalTip: 'Если вы человек и подозреваете, что сосед — Нечто или заражен, сыграйте эту карту, чтобы не заразиться через обмен.',
      };

    case 'MISSED':
      return {
        targetType: 'В ответ на атаку карты «Огнемёт»',
        defenseInfo: 'Это карта защиты! Спасает вашу жизнь от сожжения.',
        obstacleInfo: 'Разыгрывается строго в течение 15 секунд после атаки.',
        playPhase: 'Фаза защиты от атаки (Attack Defense)',
        tacticalTip: 'Никогда не сбрасывайте эту карту просто так! Это ваша единственная страховка от мгновенной гибели от огня.',
      };

    case 'FEAR':
      return {
        targetType: 'В ответ на попытку обмена картой',
        defenseInfo: 'Отменяет обмен И раскрывает предложенную вам карту!',
        obstacleInfo: 'Только вы видите карту, которую вам пытались подсунуть.',
        playPhase: 'Фаза защиты при обмене (Exchange Defense)',
        tacticalTip: 'Мощнейшая карта: вы не только блокируете обмен, но и узнаете, пытались ли вам подсунуть Заражение!',
      };

    case 'BARRED_DOOR':
      return {
        targetType: 'Проход между вами и смежным соседом',
        defenseInfo: 'Защита невозможна.',
        obstacleInfo: 'Блокирует обмен картами, атаки огнемётом, анализ крови и смену мест. Может быть срублена Топором.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Постройте баррикаду от опасного соседа, чтобы он не мог сжечь вас огнемётом или принудить к обмену.',
      };

    case 'QUARANTINE':
      return {
        targetType: 'Смежный сосед ИЛИ сам разыгравший игрок',
        defenseInfo: 'Защита невозможна.',
        obstacleInfo: 'Длится 2 полных раунда. Игрок в карантине не меняется картами и защищен от атак соседа.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Можно наложить на подозрительного игрока, чтобы изолировать его, или на себя любимого, чтобы пересидеть бурю в безопасности.',
      };

    case 'CHANGE_DIRECTION':
      return {
        targetType: 'Все игроки за столом',
        defenseInfo: 'Невозможно защититься (карта Паники).',
        obstacleInfo: 'Разыгрывается мгновенно при взятии из колоды.',
        playPhase: 'Фаза добора карты (Draw Phase)',
        tacticalTip: 'Разворачивает порядок хода и меняет направление обмена картами на противоположное.',
      };

    case 'BLIND_FAITH':
      return {
        targetType: 'Все игроки за столом',
        defenseInfo: 'Невозможно защититься (карта Паники).',
        obstacleInfo: 'Игроки, отгороженные дверями, пропускают передачу.',
        playPhase: 'Фаза добора карты (Draw Phase)',
        tacticalTip: 'Каждый игрок обязан передать одну случайную карту соседу справа вслепую.',
      };

    case 'NO_BARBECUE':
      return {
        targetType: 'В ответ на атаку карты «Огнемёт»',
        defenseInfo: 'Карта защиты! Спасает от сожжения. После розыгрыша доберите 1 карту из колоды.',
        obstacleInfo: 'Сбрасывается после применения.',
        playPhase: 'Фаза защиты от атаки (Attack Defense)',
        tacticalTip: 'Единственное спасение от верной гибели в огне! Держите её в руке, если подозреваете, что рядом бродят люди с огнемётом.',
      };

    case 'GET_OUT_OF_HERE':
      return {
        targetType: 'Любой игрок за столом (не в карантине)',
        defenseInfo: 'Жертва может сыграть «Мне и здесь неплохо» для отмены.',
        obstacleInfo: 'Игнорирует заколоченные двери и расстояние между игроками.',
        playPhase: 'Фаза действия (Action Phase)',
        tacticalTip: 'Позволяет поменяться местами с любым игроком за столом на любой дистанции, перескакивая через двери!',
      };

    case 'IM_FINE_HERE':
      return {
        targetType: 'В ответ на «Меняемся местами!» или «Сматывай удочки!»',
        defenseInfo: 'Карта защиты! Отменяет смену мест. После розыгрыша доберите 1 карту из колоды.',
        obstacleInfo: 'Сбрасывается после применения.',
        playPhase: 'Фаза защиты при смене мест',
        tacticalTip: 'Не дайте коварному Нечто или подозрительному игроку вытащить вас с безопасной позиции за столом!',
      };

    case 'PARTY_OVER':
      return {
        targetType: 'Все игроки за столом (карта Паники)',
        defenseInfo: 'Защита невозможна.',
        obstacleInfo: 'Срывает ВСЕ заколоченные двери и немедленно снимает все карантины на станции!',
        playPhase: 'Фаза добора карты (Draw Phase)',
        tacticalTip: 'Полный хаос на станции! Сносит все баррикады и освобождает изолированных игроков.',
      };

    default:
      return {
        targetType: 'Смежный игрок или стол',
        defenseInfo: 'Согласно базовым правилам',
        obstacleInfo: 'Зависит от типа преграды',
        playPhase: 'Стандартный ход',
        tacticalTip: 'Изучайте поведение других полярников и следите за стопкой сброса.',
      };
  }
};

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !card) return null;

  const visual = getCardVisual(card.code);
  const meta = getCardRulesMeta(card.code);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          soundFx.playCardDraw();
          onClose();
        }
      }}
    >
      <div 
        className={`relative w-full max-w-lg p-6 sm:p-7 rounded-3xl border shadow-2xl ${visual.bg} ${visual.border} text-slate-100 flex flex-col items-center animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Кнопка закрытия крестик */}
        <button
          type="button"
          onClick={() => {
            soundFx.playCardDraw();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-xl bg-black/40 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer border border-white/5"
          title="Закрыть (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Заголовок карты */}
        <div className="flex flex-col items-center text-center mb-4">
          <div className="p-4 rounded-2xl bg-black/50 border border-white/10 shadow-inner mb-3">
            {visual.icon}
          </div>

          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border uppercase tracking-wider mb-1.5 ${visual.badge}`}>
            {visual.label}
          </span>

          <h3 className="text-xl sm:text-2xl font-black text-slate-100 leading-tight">
            {card.name}
          </h3>
        </div>

        {/* Основное описание карты */}
        <div className="w-full bg-black/40 p-3.5 rounded-2xl border border-white/10 mb-4 text-center">
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
            {card.description}
          </p>
        </div>

        {/* Характеристики карты (Дальность, Защита, Фаза) */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4 text-xs">
          
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <Target className="w-4 h-4 text-frost shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-frost text-[11px] uppercase tracking-wider">Цель / Дальность</div>
              <div className="text-[11px] text-slate-300 leading-tight mt-0.5">{meta.targetType}</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-400 text-[11px] uppercase tracking-wider">Возможность защиты</div>
              <div className="text-[11px] text-slate-300 leading-tight mt-0.5">{meta.defenseInfo}</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <DoorClosed className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">Двери и Карантин</div>
              <div className="text-[11px] text-slate-300 leading-tight mt-0.5">{meta.obstacleInfo}</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <HelpCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-teal-400 text-[11px] uppercase tracking-wider">Когда разыгрывается</div>
              <div className="text-[11px] text-slate-300 leading-tight mt-0.5">{meta.playPhase}</div>
            </div>
          </div>

        </div>

        {/* Тактический совет */}
        <div className="w-full flex items-start gap-2.5 p-3 rounded-xl bg-cyan-950/40 border border-frost/20 mb-4 text-left">
          <Lightbulb className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">Тактический совет:</div>
            <p className="text-[11px] text-slate-300 leading-normal mt-0.5">
              {meta.tacticalTip}
            </p>
          </div>
        </div>

        {/* Цитата / Flavor text */}
        {card.flavorText && (
          <div className="flex items-center gap-1.5 text-slate-400 italic text-[11px] mb-5 text-center max-w-sm">
            <Quote className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>{card.flavorText}</span>
          </div>
        )}

        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={() => {
            soundFx.playCardDraw();
            onClose();
          }}
          className="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-frost hover:bg-cyan-400 text-polar-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-frost/20 cursor-pointer active:scale-95"
        >
          Понятно, закрыть
        </button>

      </div>
    </div>
  );
};
