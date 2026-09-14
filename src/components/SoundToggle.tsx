'use client';

import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { soundFx } from '@/lib/soundEffects';

export const SoundToggle: React.FC = () => {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(soundFx.isEnabled());
  }, []);

  const handleToggle = () => {
    const nextState = soundFx.toggleSound();
    setEnabled(nextState);
    if (nextState) {
      soundFx.playCardDraw();
    }
  };

  return (
    <button
      onClick={handleToggle}
      title={enabled ? 'Выключить звук' : 'Включить звук'}
      className="p-2 rounded-xl bg-polar-900/80 border border-frost/20 text-slate-300 hover:text-frost hover:border-frost/50 transition-all shadow-md backdrop-blur-sm"
    >
      {enabled ? <Volume2 className="w-5 h-5 text-frost" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
    </button>
  );
};
