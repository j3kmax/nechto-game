'use client';

import React, { useState } from 'react';
import { RoomPublicState, PlayerPublic } from '@/types/game';
import { getAvatarIcon } from './AvatarSelector';
import { 
  Copy, 
  Check, 
  Crown, 
  UserMinus, 
  PlusCircle, 
  Play, 
  Clock, 
  Users, 
  BookOpen, 
  Bot, 
  Radio
} from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';

interface LobbyProps {
  roomState: RoomPublicState;
  currentUserId: string;
  onStartGame: () => void;
  onAddBot: () => void;
  onKickPlayer: (targetId: string) => void;
  onTransferHost: (newHostId: string) => void;
  onOpenRules: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomState,
  currentUserId,
  onStartGame,
  onAddBot,
  onKickPlayer,
  onTransferHost,
  onOpenRules,
}) => {
  const [copied, setCopied] = useState(false);
  const isHost = roomState.hostId === currentUserId;
  const numPlayers = roomState.players.length;
  const canStart = numPlayers === 4 || numPlayers === 5;

  const copyRoomLink = () => {
    if (typeof window !== 'undefined') {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      setCopied(true);
      soundFx.playCardDraw();
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-4 sm:p-6 animate-in fade-in">
      
      {/* Верхний блок: Код комнаты и ссылка для Discord */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-3xl bg-polar-900/80 border border-frost/25 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-cyan-950/60 border border-frost/40 text-frost">
            <Radio className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-semibold text-frost/80 uppercase tracking-widest">
              Сектор связи станции
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-slate-100">
                {roomState.roomId}
              </span>
              <button
                onClick={copyRoomLink}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-frost/10 hover:bg-frost/20 text-frost text-xs font-semibold border border-frost/30 transition-all shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Ссылка скопирована!' : 'Скопировать ссылку для Discord'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Статус заполнения и колоды */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-polar-950 border border-white/10 text-xs">
            <Users className="w-4 h-4 text-frost" />
            <span className="text-slate-300">
              Полярники: <strong className="text-frost">{numPlayers}</strong> / 5
            </span>
            {numPlayers < 4 && (
              <span className="text-hazard-amber font-semibold ml-1">(нужно еще {4 - numPlayers})</span>
            )}
          </div>
          {numPlayers === 4 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-cyan-950/60 border border-frost/30 text-frost text-xs font-bold shadow-sm">
              <span>🃏 Базовая колода: 35 карт</span>
            </div>
          )}
          {numPlayers === 5 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-bold shadow-sm">
              <span>🃏 Расширенная колода: 41 карта (+модуль «5»)</span>
            </div>
          )}
        </div>
      </div>

      {/* Сетка игроков в лобби */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span>Экипаж полярной экспедиции:</span>
          </h3>
          {isHost && numPlayers < 5 && (
            <button
              onClick={onAddBot}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-polar-850 hover:bg-polar-800 border border-white/10 text-slate-300 hover:text-frost text-xs font-medium transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5 text-frost" />
              <span>Добавить ИИ-полярника (Бота)</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {roomState.players.map((player) => {
            const isMe = player.id === currentUserId;
            return (
              <div
                key={player.id}
                className={`relative flex items-center justify-between p-3.5 rounded-2xl border backdrop-blur-md transition-all ${
                  player.isHost
                    ? 'bg-polar-900/90 border-amber-500/40 shadow-lg shadow-amber-950/20'
                    : isMe
                    ? 'bg-polar-900/90 border-frost/40 ring-1 ring-frost/30'
                    : 'bg-polar-900/60 border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-frost">
                    {getAvatarIcon(player.avatar, 'w-6 h-6')}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-100">{player.name}</span>
                      {player.isHost && (
                        <span title="Командир (Хост)">
                          <Crown className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        </span>
                      )}
                      {player.isBot && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 flex items-center gap-0.5">
                          <Bot className="w-2.5 h-2.5" /> Бот
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Место #{player.seatIndex + 1} {isMe && '• (Вы)'}
                    </div>
                  </div>
                </div>

                {/* Действия хоста над другими игроками */}
                {isHost && !player.isHost && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onTransferHost(player.id)}
                      title="Сделать командиром"
                      className="p-1.5 rounded-lg hover:bg-amber-950/50 text-slate-400 hover:text-amber-400 transition-colors"
                    >
                      <Crown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onKickPlayer(player.id)}
                      title="Исключить из комнаты"
                      className="p-1.5 rounded-lg hover:bg-red-950/50 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Пустые слоты */}
          {Array.from({ length: Math.max(0, 4 - numPlayers) }).map((_, i) => (
            <div
              key={`empty_${i}`}
              className="flex items-center justify-center p-4 rounded-2xl border border-dashed border-white/10 text-slate-600 text-xs italic"
            >
              Свободное место экспедиции
            </div>
          ))}
        </div>
      </div>

      {/* Настройки и запуск игры */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-3xl bg-polar-950/80 border border-white/10">
        
        {/* Кнопка открытия правил */}
        <button
          onClick={onOpenRules}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-polar-900 hover:bg-polar-850 border border-frost/30 text-frost text-xs font-bold transition-all shadow"
        >
          <BookOpen className="w-4 h-4" />
          <span>Справочник правил «НЕЧТО»</span>
        </button>

        {/* Панель хоста: кнопка старта */}
        {isHost ? (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {!canStart && (
              <span className="text-xs text-hazard-amber">
                {numPlayers < 4 ? `Для старта нужно 4 или 5 игроков (добавьте ${4 - numPlayers} бота)` : 'Максимум 5 игроков'}
              </span>
            )}
            <button
              onClick={onStartGame}
              disabled={!canStart}
              className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-xl ${
                canStart
                  ? 'bg-frost hover:bg-cyan-400 text-polar-950 shadow-frost/25 hover:scale-105 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Начать выживание</span>
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic">
            Ожидание командира станции для старта экспедиции...
          </div>
        )}

      </div>

    </div>
  );
};
