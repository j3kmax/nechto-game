'use client';

import React from 'react';
import { AVATARS } from '@/game/cardsData';
import { AvatarId } from '@/types/game';
import { 
  Compass, 
  Microscope, 
  Stethoscope, 
  Wrench, 
  Radio, 
  ShieldAlert,
  Check
} from 'lucide-react';

interface AvatarSelectorProps {
  selected: AvatarId;
  onSelect: (id: AvatarId) => void;
}

export const getAvatarIcon = (id: AvatarId, className = 'w-6 h-6') => {
  switch (id) {
    case 'explorer': return <Compass className={className} />;
    case 'scientist': return <Microscope className={className} />;
    case 'doctor': return <Stethoscope className={className} />;
    case 'mechanic': return <Wrench className={className} />;
    case 'radio': return <Radio className={className} />;
    case 'officer': return <ShieldAlert className={className} />;
    default: return <Compass className={className} />;
  }
};

export const AvatarSelector: React.FC<AvatarSelectorProps> = ({ selected, onSelect }) => {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
      {AVATARS.map((av) => {
        const isSelected = selected === av.id;
        return (
          <button
            key={av.id}
            type="button"
            onClick={() => onSelect(av.id)}
            className={`relative p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center group ${
              isSelected
                ? 'bg-cyan-950/70 border-frost text-frost shadow-lg shadow-cyan-900/30 scale-105 ring-2 ring-frost/30'
                : 'bg-polar-900/60 border-white/10 text-slate-400 hover:text-slate-200 hover:border-frost/30 hover:bg-polar-850'
            }`}
          >
            {isSelected && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-frost text-polar-950 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </span>
            )}
            <div className={`p-2 rounded-lg ${isSelected ? 'bg-frost/10 text-frost' : 'bg-black/20 group-hover:text-frost'} transition-colors`}>
              {getAvatarIcon(av.id, 'w-6 h-6')}
            </div>
            <span className="text-xs font-bold truncate max-w-full text-slate-200">{av.title}</span>
            <span className="text-[10px] text-slate-500 truncate max-w-full">{av.name}</span>
          </button>
        );
      })}
    </div>
  );
};
