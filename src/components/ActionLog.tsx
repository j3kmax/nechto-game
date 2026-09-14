'use client';

import React, { useState } from 'react';
import { GameLogEntry } from '@/types/game';
import { Terminal, ChevronRight, ChevronLeft, Shield, Flame, Biohazard, RefreshCw, Skull } from 'lucide-react';

interface ActionLogProps {
  logs: GameLogEntry[];
}

export const ActionLog: React.FC<ActionLogProps> = ({ logs }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getLogIcon = (type: GameLogEntry['type']) => {
    switch (type) {
      case 'ATTACK': return <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />;
      case 'DEFENSE': return <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
      case 'EXCHANGE': return <RefreshCw className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case 'PANIC': return <Biohazard className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />;
      case 'DEATH': return <Skull className="w-3.5 h-3.5 text-hazard-crimson shrink-0 mt-0.5" />;
      default: return <Terminal className="w-3.5 h-3.5 text-frost shrink-0 mt-0.5" />;
    }
  };

  return (
    <div
      className={`fixed top-16 right-0 z-40 transition-all duration-300 flex ${
        isExpanded ? 'translate-x-0' : 'translate-x-[calc(100%-36px)]'
      }`}
    >
      {/* Кнопка сворачивания/разворачивания */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="h-10 w-9 bg-polar-900 border border-r-0 border-frost/30 rounded-l-xl flex items-center justify-center text-frost hover:bg-polar-850 shadow-lg"
        title={isExpanded ? 'Свернуть журнал' : 'Развернуть журнал событий'}
      >
        {isExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Панель лога */}
      <div className="w-72 sm:w-80 h-[380px] bg-polar-950/95 border-l border-b border-t border-frost/20 rounded-bl-2xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden">
        
        {/* Заголовок панели */}
        <div className="px-3 py-2 bg-polar-900/90 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
            <Terminal className="w-3.5 h-3.5 text-frost" />
            <span>Журнал станции</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {logs.length} событий
          </span>
        </div>

        {/* Список логов */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 text-xs font-mono">
          {logs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <div
                key={log.id}
                className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] flex items-start gap-2"
              >
                {getLogIcon(log.type)}
                <div className="flex-1 leading-snug">
                  <span className="text-[10px] text-slate-500 mr-1.5">[{timeStr}]</span>
                  <span className="text-slate-200">{log.text}</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};
