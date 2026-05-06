import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VOICES } from '@/lib/wizard-data';
import { Play, Pause, Loader2, Volume2, Check } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { t } from '@/lib/app-language';

interface Props {
  voice: string;
  language: string;
  uiLanguage: string;
  ttsSpeed: number;
  ttsInstructions: string;
  onChange: (field: string, value: string | number) => void;
}

const GENDER_COLORS = {
  м: '#3b82f6',
  ж: '#ec4899',
} as const;

const ENGINE_COLORS: Record<string, string> = {
  gpt4o: '#8b5cf6',
  edge: '#10b981',
  gtts: '#0ea5e9',
  openai: '#6b7280',
  new: '#f59e0b',
};

const GPT4O_PRESETS = [
  { id: 'tiktok_ru', label: 'TikTok', icon: '⚡', instructions: 'Speak in Russian with high energy and enthusiasm. Fast pace, dynamic intonation. Sound like a young Russian TikTok/Reels narrator — engaging, emotional, slightly dramatic. Clear pronunciation.' },
  { id: 'storyteller_ru', label: 'Сторителлер', icon: '📖', instructions: 'Speak in Russian as a captivating storyteller. Build tension and intrigue with your voice. Vary your pace — slow down at key dramatic moments, speed up during action. Sound mysterious and engaging.' },
  { id: 'news_ru', label: 'Новости', icon: '📺', instructions: 'Speak in Russian as a professional news anchor. Clear, authoritative, neutral tone. Good diction, confident delivery. Precise pronunciation of every word.' },
  { id: 'documentary_ru', label: 'Документал', icon: '🎬', instructions: 'Speak in Russian like a documentary narrator. Deep, thoughtful, slightly dramatic. Pause before important facts. Create a sense of gravity and importance.' },
  { id: 'casual_ru', label: 'Разговор', icon: '💬', instructions: 'Speak in Russian in a natural, conversational way. Like talking to a friend. Relaxed pace, warm tone, occasional emphasis for key points.' },
  { id: 'dramatic_ru', label: 'Драма', icon: '🎭', instructions: 'Speak in Russian with dramatic flair. High emotional range — whisper at tense moments, rise to powerful statements. Build suspense.' },
  { id: 'custom', label: 'Свой', icon: '✏️', instructions: '' },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
const cardVariant = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
};

const StepVoice = ({ voice, language, uiLanguage, ttsSpeed, ttsInstructions, onChange }: Props) => {
  const text = t(uiLanguage);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const stopCurrent = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
    setPlayingId(null); setLoadingId(null);
  }, []);

  const handlePreview = useCallback((e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    if (playingId === voiceId || loadingId === voiceId) { stopCurrent(); return; }
    stopCurrent();
    setLoadingId(voiceId);
    const audio = new Audio();
    audioRef.current = audio;
    const onReady = () => {
      if (audioRef.current !== audio) return;
      setLoadingId(null); setPlayingId(voiceId);
      audio.play().catch(() => { setPlayingId(null); setLoadingId(null); });
    };
    audio.addEventListener('canplaythrough', onReady, { once: true });
    audio.addEventListener('ended', () => setPlayingId(null), { once: true });
    audio.addEventListener('error', () => { setLoadingId(null); setPlayingId(null); }, { once: true });
    let url = `/api/preview?voice=${encodeURIComponent(voiceId)}&lang=${language}`;
    const isGpt4o = voiceId.startsWith('gpt4o_');
    if (isGpt4o) {
      if (ttsSpeed !== 1.0) url += `&speed=${ttsSpeed}`;
      if (ttsInstructions) url += `&instructions=${encodeURIComponent(ttsInstructions)}`;
    }
    audio.src = url;
    audio.load();
  }, [playingId, loadingId, language, ttsSpeed, ttsInstructions, stopCurrent]);

  const getEngineType = (v: typeof VOICES[0]) => {
    if (v.tag === 'gpt4o' || v.engine === 'gpt4o') return 'gpt4o';
    if (v.tag === 'edge' || v.engine === 'edge') return 'edge';
    if (v.tag === 'gtts' || v.engine === 'gtts') return 'gtts';
    if (v.tag === 'new') return 'new';
    return 'openai';
  };

  const isVoiceCompatible = useCallback((v: typeof VOICES[0]) => {
    const engine = getEngineType(v);
    if (engine === 'openai' || engine === 'gpt4o' || engine === 'new') return true;
    if (!v.lang) return true;
    return v.lang === language;
  }, [language]);

  const allVoices = [...VOICES].filter(isVoiceCompatible).sort((a, b) => {
    const order: Record<string, number> = { gpt4o: 0, new: 1, edge: 2, gtts: 3, openai: 4 };
    return (order[getEngineType(a)] ?? 5) - (order[getEngineType(b)] ?? 5);
  });

  useEffect(() => {
    if (!allVoices.length) return;
    const hasCurrent = allVoices.some(v => v.id === voice);
    if (!hasCurrent) onChange('voice', allVoices[0].id);
  }, [allVoices, voice, onChange]);

  const isGpt4oSelected = voice.startsWith('gpt4o_');

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold font-heading mb-1">{text.voiceTitle}</h2>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5" /> {text.voiceSubtitle}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {text.compatibleVoices}
        </p>
      </div>

      {/* Voice grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1 overflow-y-auto pr-1"
      >
        {allVoices.map(v => {
          const isSelected = voice === v.id;
          const isPlaying = playingId === v.id;
          const isLoading = loadingId === v.id;
          const isActive = isPlaying || isLoading;
          const engine = getEngineType(v);
          const accent = ENGINE_COLORS[engine] || '#6b7280';
          const genderColor = GENDER_COLORS[(v.gender ?? 'м') as keyof typeof GENDER_COLORS] || '#6b7280';
          const avatar = v.label.slice(0, 2).toUpperCase();

          return (
            <motion.div
              role="button"
              tabIndex={0}
              key={v.id}
              variants={cardVariant}
              onClick={() => onChange('voice', v.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange('voice', v.id);
                }
              }}
              className="relative overflow-hidden rounded-xl text-left transition-all duration-200 cursor-pointer"
              style={{
                border: isSelected ? `2px solid ${accent}` : '2px solid transparent',
                background: isSelected
                  ? `linear-gradient(145deg, ${accent}22 0%, ${accent}08 100%)`
                  : 'rgba(255,255,255,0.04)',
                boxShadow: isSelected
                  ? `0 0 0 1px ${accent}44, 0 4px 20px ${accent}22`
                  : '0 1px 3px rgba(0,0,0,0.3)',
              }}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Accent blob */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `linear-gradient(135deg, ${accent}33 0%, ${accent}11 60%, transparent 100%)`,
                  opacity: isSelected ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}
              />

              {/* Color bar */}
              <div
                className="h-0.5 w-full"
                style={{
                  background: isSelected
                    ? `linear-gradient(90deg, ${accent}, ${accent}66)`
                    : `linear-gradient(90deg, ${accent}44, transparent)`,
                  transition: 'background 0.2s',
                }}
              />

              {/* Content */}
              <div className="relative px-3 py-2.5 flex items-center gap-2">
                {/* Avatar */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: `${genderColor}22`,
                    border: `1px solid ${genderColor}44`,
                    color: genderColor,
                  }}
                >
                  {avatar}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span
                      className="font-semibold text-xs leading-tight truncate"
                      style={{ color: isSelected ? accent : 'inherit' }}
                    >
                      {v.label}
                    </span>
                    {engine === 'gpt4o' && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 leading-none">4o</span>
                    )}
                    {engine === 'edge' && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 leading-none">FREE</span>
                    )}
                    {engine === 'new' && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 leading-none">NEW</span>
                    )}
                  </div>
                  {v.traits && v.traits.length > 0 ? (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap">
                      {v.traits.slice(0, 2).map(t => (
                        <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground leading-none">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : v.desc && (
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{v.desc}</div>
                  )}
                </div>

                {/* Check / Play */}
                <div className="flex-shrink-0">
                  {isSelected && !isActive ? (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: accent }}
                    >
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handlePreview(e, v.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                      style={{
                        background: isActive ? accent : 'rgba(255,255,255,0.08)',
                        color: isActive ? '#fff' : 'inherit',
                      }}
                    >
                      {isLoading
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : isPlaying
                          ? <Pause className="w-3 h-3" />
                          : <Play className="w-3 h-3" />
                      }
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* GPT-4o controls */}
      <AnimatePresence>
        {isGpt4oSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3">
              {/* Speed */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-violet-500/20 bg-violet-500/5">
                <span className="text-xs font-semibold text-violet-400 shrink-0">Скорость</span>
                <Slider
                  value={[ttsSpeed]}
                  onValueChange={([v]) => onChange('ttsSpeed', Math.round(v * 10) / 10)}
                  min={0.6} max={1.5} step={0.05}
                  className="flex-1 [&_[role=slider]]:border-violet-500 [&_[role=slider]]:bg-violet-500"
                />
                <span className="text-xs font-mono text-violet-400 shrink-0 w-10 text-right">
                  {ttsSpeed === 1.0 ? '1x' : `${ttsSpeed}x`}
                </span>
              </div>

              {/* Style presets */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Стиль речи</span>
                <div className="flex gap-1.5 flex-wrap">
                  {GPT4O_PRESETS.map(preset => {
                    const isActive = selectedPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          if (preset.id === 'custom') {
                            setSelectedPreset('custom');
                            setShowCustomInput(true);
                          } else {
                            setSelectedPreset(preset.id);
                            setShowCustomInput(false);
                            onChange('ttsInstructions', preset.instructions);
                          }
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          isActive
                            ? 'border-violet-500/60 bg-violet-500/15 text-violet-300'
                            : 'border-border/50 bg-secondary/50 hover:border-violet-500/30 text-muted-foreground'
                        }`}
                      >
                        <span>{preset.icon}</span>
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom textarea */}
                <AnimatePresence>
                  {(showCustomInput || selectedPreset === 'custom') && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <textarea
                        value={ttsInstructions}
                        onChange={e => onChange('ttsInstructions', e.target.value)}
                        placeholder="Опишите стиль речи на английском..."
                        className="w-full mt-1 p-2.5 rounded-lg border border-violet-500/30 bg-secondary text-xs placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/60 resize-none"
                        rows={2}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StepVoice;
