'use client';

import React, { useState } from 'react';
import { GameLogEntry } from '@/types/game';
import { networkManager } from '@/lib/networkManager';
import { 
  Terminal, 
  ChevronRight, 
  ChevronLeft, 
  Shield, 
  Flame, 
  Biohazard, 
  RefreshCw, 
  Skull, 
  User, 
  Globe, 
  Download,
  X
} from 'lucide-react';

interface ActionLogProps {
  logs: GameLogEntry[];
  privateLogs?: GameLogEntry[];
  roomId?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  activeTab?: 'station' | 'personal';
  onTabChange?: (tab: 'station' | 'personal') => void;
}

export const ActionLog: React.FC<ActionLogProps> = ({ 
  logs, 
  privateLogs = [], 
  roomId,
  isOpen,
  onOpenChange,
  activeTab,
  onTabChange
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isOpen !== undefined ? isOpen : internalExpanded;
  const setIsExpanded = (val: boolean) => {
    if (onOpenChange) onOpenChange(val);
    setInternalExpanded(val);
  };

  const [internalTab, setInternalTab] = useState<'station' | 'personal'>('station');
  const currentTab = activeTab !== undefined ? activeTab : internalTab;
  const setCurrentTab = (val: 'station' | 'personal') => {
    if (onTabChange) onTabChange(val);
    setInternalTab(val);
  };

  const getLogIcon = (type: GameLogEntry['type']) => {
    switch (type) {
      case 'ATTACK': return <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />;
      case 'DEFENSE': return <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
      case 'EXCHANGE': return <RefreshCw className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case 'PANIC': return <Biohazard className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />;
      case 'DEATH': return <Skull className="w-3.5 h-3.5 text-hazard-crimson shrink-0 mt-0.5" />;
      case 'WARNING': return <Biohazard className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
      default: return <Terminal className="w-3.5 h-3.5 text-frost shrink-0 mt-0.5" />;
    }
  };

  const currentList = currentTab === 'station' ? logs : privateLogs;

  const handleDownloadLogs = () => {
    if (!roomId) return;
    networkManager.downloadGameLogReport(roomId);
  };

  return (
    <div
      className={`fixed top-14 sm:top-16 right-0 z-40 transition-all duration-300 flex select-none ${
        isExpanded ? 'translate-x-0' : 'translate-x-[calc(100%-38px)]'
      }`}
    >
      {/* Боковой ярлычок сворачивания/разворачивания */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="h-14 w-9 bg-polar-900 border border-r-0 border-frost/30 rounded-l-xl flex flex-col items-center justify-center text-frost hover:bg-polar-850 shadow-xl cursor-pointer group"
        title={isExpanded ? 'Свернуть журнал' : 'Развернуть журнал событий и личное досье'}
      >
        {isExpanded ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <ChevronLeft className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-[9px] font-mono font-bold text-amber-400">
              {privateLogs.length > 0 ? privateLogs.length : logs.length}
            </span>
          </div>
        )}
      </button>

      {/* Основная панель лога */}
      <div className="w-84 sm:w-96 h-[470px] bg-polar-950/95 border-l border-b border-t border-frost/30 rounded-bl-2xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden">
        
        {/* Шапка: переключатель вкладок + кнопки закрытия и скачивания */}
        <div className="px-2 pt-2 bg-polar-900/90 border-b border-white/10 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 flex-1">
            <button
              type="button"
              onClick={() => setCurrentTab('station')}
              className={`flex-1 py-1.5 px-2 rounded-t-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'station'
                  ? 'bg-polar-950 text-frost border-t-2 border-frost shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>Станция</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-mono ml-0.5">
                {logs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('personal')}
              className={`flex-1 py-1.5 px-2 rounded-t-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'personal'
                  ? 'bg-polar-950 text-amber-400 border-t-2 border-amber-400 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span>Личное досье</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono ml-0.5">
                {privateLogs.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1 pb-1">
            {roomId && (
              <button
                type="button"
                onClick={handleDownloadLogs}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-frost text-xs transition-colors cursor-pointer"
                title="Скачать все логи (общие и личные) для диагностики"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-red-950/50 hover:border-red-500/40 text-slate-400 hover:text-red-400 text-xs transition-colors cursor-pointer"
              title="Закрыть панель журнала"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Подзаголовок режима и быстрый экспорт */}
        <div className="px-3 py-1.5 bg-black/40 border-b border-white/5 flex items-center justify-between text-[10px] text-slate-400">
          <span>
            {currentTab === 'station' 
              ? '📢 Публичные события стола' 
              : '🔒 Секретный журнал ваших карт и действий'}
          </span>
          <div className="flex items-center gap-2 font-mono">
            <span>{currentList.length} зап.</span>
            {roomId && (
              <button
                type="button"
                onClick={handleDownloadLogs}
                className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer ml-1"
              >
                скачать (.txt)
              </button>
            )}
          </div>
        </div>

        {/* Список записей */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 text-xs font-mono">
          {currentList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
              <Terminal className="w-8 h-8 opacity-30 mb-2" />
              <p className="text-xs">Записей пока нет</p>
              <p className="text-[10px] text-slate-600 mt-1 max-w-[220px]">
                {currentTab === 'station'
                  ? 'События станции будут появляться по ходу игры'
                  : 'Здесь фиксируются все ваши полученные карты, проверки других игроков и статус заражения'}
              </p>
            </div>
          ) : (
            currentList.map((log) => {
              const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div
                  key={log.id}
                  className={`p-2 rounded-xl border transition-colors flex items-start gap-2 ${
                    currentTab === 'personal'
                      ? 'bg-amber-950/20 border-amber-500/25 hover:bg-amber-950/35'
                      : 'bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.06]'
                  }`}
                >
                  {getLogIcon(log.type)}
                  <div className="flex-1 leading-snug">
                    <span className="text-[10px] text-slate-500 mr-1.5 font-mono">[{timeStr}]</span>
                    <span className={currentTab === 'personal' ? 'text-amber-100' : 'text-slate-200'}>
                      {log.text}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};
