'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvatarSelector } from '@/components/AvatarSelector';
import { RulebookModal } from '@/components/RulebookModal';
import { SoundToggle } from '@/components/SoundToggle';
import { AvatarId } from '@/types/game';
import { networkManager } from '@/lib/networkManager';
import { soundFx } from '@/lib/soundEffects';
import { 
  Biohazard, 
  Users, 
  Play, 
  LogIn, 
  BookOpen, 
  Sparkles, 
  Bot, 
  Flame, 
  ShieldAlert,
  Compass
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>('explorer');
  const [joinCode, setJoinCode] = useState('');
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Создать новую комнату
  const handleCreateRoom = async () => {
    if (!nickname.trim()) {
      setError('Пожалуйста, введите ваш позывной (никнейм).');
      return;
    }
    setLoading(true);
    setError(null);
    soundFx.playCardDraw();

    try {
      const { roomId, playerId } = await networkManager.createRoom(nickname, avatar);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`nechto_player_${roomId}`, JSON.stringify({ playerId, name: nickname, avatar }));
      }
      router.push(`/room/${roomId}`);
    } catch (e) {
      setError('Не удалось создать комнату. Попробуйте еще раз.');
      setLoading(false);
    }
  };

  // 2. Войти по коду
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('Пожалуйста, введите ваш позывной (никнейм).');
      return;
    }
    if (!joinCode.trim()) {
      setError('Введите 6-значный код комнаты.');
      return;
    }

    const code = joinCode.toUpperCase().trim();
    setLoading(true);
    setError(null);
    soundFx.playCardDraw();

    try {
      const res = await networkManager.joinRoom(code, nickname, avatar);
      if (res.success) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`nechto_player_${code}`, JSON.stringify({ playerId: res.playerId, name: nickname, avatar }));
        }
        router.push(`/room/${code}`);
      } else {
        setError(res.error || 'Ошибка подключения к комнате.');
        setLoading(false);
      }
    } catch (e) {
      setError('Не удалось подключиться к комнате.');
      setLoading(false);
    }
  };

  // 3. Быстрый соло-старт с 3 ботами для мгновенного теста
  const handleQuickSoloTest = async () => {
    const name = nickname.trim() || 'Командир Макриди';
    setLoading(true);
    setError(null);
    soundFx.playCardDraw();

    try {
      const { roomId, playerId } = await networkManager.createRoom(name, avatar);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`nechto_player_${roomId}`, JSON.stringify({ playerId, name, avatar }));
      }
      // Добавляем 3 ИИ-ботов
      await networkManager.addBot(roomId);
      await networkManager.addBot(roomId);
      await networkManager.addBot(roomId);

      router.push(`/room/${roomId}`);
    } catch (e) {
      setError('Не удалось запустить тестовую игру.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-between p-4 sm:p-6 overflow-hidden">
      
      {/* Верхняя панель: лого и звук/правила */}
      <header className="w-full max-w-5xl flex items-center justify-between py-2 z-20">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-red-950/60 border border-hazard-crimson/50 text-hazard-crimson animate-pulse">
            <Biohazard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-widest text-slate-100 uppercase">
              НЕЧТО <span className="text-xs font-semibold text-frost tracking-normal lowercase opacity-80">(Stay Away!)</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">Антарктическая станция «Аванпост 31»</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRulesOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-polar-900/80 border border-frost/20 text-xs font-semibold text-frost hover:bg-polar-850 hover:border-frost/40 transition-all shadow-md backdrop-blur-sm"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Правила игры</span>
          </button>
          <SoundToggle />
        </div>
      </header>

      {/* Центральный контент */}
      <div className="w-full max-w-xl my-auto py-6 z-20 flex flex-col items-center text-center">
        
        {/* Баннер атмосферы */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/50 border border-frost/30 text-frost text-xs font-semibold mb-4 backdrop-blur-sm shadow-lg shadow-cyan-950/40">
          <Flame className="w-3.5 h-3.5 text-orange-400" />
          <span>Психологический хоррор для игры с друзьями в Discord</span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight mb-2">
          Кто-то из вас уже <span className="text-hazard-crimson hazard-text-glow">не человек</span>...
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
          Берите огнеметы, заколачивайте двери, проверяйте кровь соседа и не позволяйте чудовищу заразить экспедицию.
        </p>

        {/* Сообщение об ошибке */}
        {error && (
          <div className="w-full p-3 mb-4 rounded-xl bg-red-950/80 border border-hazard-crimson text-hazard-crimson text-xs font-semibold flex items-center justify-center gap-2 animate-shake">
            <ShieldAlert className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Форма входа */}
        <div className="w-full p-6 sm:p-7 rounded-3xl bg-polar-900/80 border border-frost/25 shadow-2xl backdrop-blur-md flex flex-col gap-5 text-left">
          
          {/* Позывной */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Ваш позывной на станции:
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Например: Макриди, Д-р Блэр, Чайлдс..."
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl bg-polar-950/90 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-frost focus:ring-2 focus:ring-frost/20 text-sm font-medium transition-all"
            />
          </div>

          {/* Выбор аватара */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              Специальность полярника:
            </label>
            <AvatarSelector selected={avatar} onSelect={setAvatar} />
          </div>

          {/* Кнопка создания */}
          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-frost hover:bg-cyan-400 text-polar-950 font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-frost/20 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{loading ? 'Создание базы...' : 'Создать новую станцию (Комнату)'}</span>
          </button>

          {/* Разделитель */}
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] font-bold text-slate-500 uppercase">или подключитесь по коду</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Подключение по коду */}
          <form onSubmit={handleJoinRoom} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="КОД КОМНАТЫ"
              maxLength={6}
              className="flex-1 px-4 py-2.5 rounded-xl bg-polar-950/90 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-frost text-xs font-mono font-bold tracking-widest uppercase text-center"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-white/10 flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Войти</span>
            </button>
          </form>

          {/* Быстрый соло-старт с 3 ботами */}
          <div className="pt-2 border-t border-white/5 flex justify-center">
            <button
              type="button"
              onClick={handleQuickSoloTest}
              disabled={loading}
              className="flex items-center gap-2 text-xs text-frost/80 hover:text-frost transition-colors py-1 px-2 rounded-lg hover:bg-white/5"
            >
              <Bot className="w-4 h-4 text-frost" />
              <span>Быстрый соло-тест: начать сразу с 3 ботами</span>
            </button>
          </div>

        </div>

      </div>

      {/* Футер */}
      <footer className="w-full max-w-5xl py-3 text-center text-xs text-slate-500 z-20 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>© Настольная игра «НЕЧТО» (Stay Away!). Разработано для игры с друзьями по Discord.</span>
        <span className="text-[11px] text-frost/60">Аванпост 31 • Температура за бортом: -48°C</span>
      </footer>

      {/* Модальное окно правил */}
      <RulebookModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />

    </div>
  );
}
