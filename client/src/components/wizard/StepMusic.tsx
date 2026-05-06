import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MUSIC_TRACKS } from '@/lib/wizard-data';
import { Music, Shuffle, VolumeX, Play, Pause, Loader2, Check } from 'lucide-react';
import { t } from '@/lib/app-language';

interface Props {
  music: string | null;
  uiLanguage: string;
  onChange: (field: string, value: string | null) => void;
}

const GENRE_COLORS: Record<string, string> = {
  'Cinematic': '#8B5CF6',
  'Lo-Fi': '#EC4899',
  'Electronic': '#06B6D4',
  'Ambient': '#10B981',
  'Pop': '#F59E0B',
  'Rock': '#EF4444',
  'Hip-Hop': '#F97316',
  'Jazz': '#A78BFA',
  'Classical': '#6366F1',
  'Trap': '#E11D48',
  'Drill': '#DC2626',
  'Synthwave': '#7C3AED',
  'Lullaby': '#F0ABFC',
  'Corporate': '#64748B',
  'Upbeat': '#22C55E',
  'Dramatic': '#B91C1C',
  'Epic': '#7E22CE',
  'Chill': '#2DD4BF',
  'Dark': '#475569',
  'Happy': '#FBBF24',
};

const container = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
const cardVariant = {
  hidden: { opacity: 0, scale: 0.95 },
  show:   { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } },
};

const StepMusic = ({ music, uiLanguage, onChange }: Props) => {
  const text = t(uiLanguage);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handlePreview = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (playingId === trackId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    const audio = new Audio(`/api/music-preview?id=${trackId}`);
    audioRef.current = audio;
    setLoadingId(trackId);
    audio.addEventListener('canplay', () => { setLoadingId(null); setPlayingId(trackId); audio.play(); });
    audio.addEventListener('ended', () => setPlayingId(null));
    audio.addEventListener('error', () => { setLoadingId(null); setPlayingId(null); });
    audio.load();
  };

  const stopPreview = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.src = '';
    setPlayingId(null);
    setLoadingId(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">{text.backgroundMusic}</h2>
          <p className="text-sm text-muted-foreground mt-1">{text.musicSubtitle}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          {[
            { id: null, icon: VolumeX, label: text.noMusic },
            { id: 'random', icon: Shuffle, label: text.random },
          ].map(opt => {
            const active = music === opt.id;
            return (
              <button
                key={opt.label}
                onClick={() => { stopPreview(); onChange('music', opt.id); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  active
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-secondary hover:border-primary/40 text-muted-foreground'
                }`}
              >
                <opt.icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Track grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1 overflow-y-auto"
      >
        {MUSIC_TRACKS.map(t => {
          const isSelected = music === t.id;
          const isPlaying = playingId === t.id;
          const isLoading = loadingId === t.id;
          const accent = GENRE_COLORS[t.genre || ''] || '#6b7280';

          return (
            <motion.div
              role="button"
              tabIndex={0}
              key={t.id}
              variants={cardVariant}
              onClick={() => onChange('music', t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange('music', t.id);
                }
              }}
              className="group relative overflow-hidden rounded-xl text-left transition-all duration-200 cursor-pointer"
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
                {/* Icon */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: `${accent}22`,
                    border: `1px solid ${accent}33`,
                  }}
                >
                  <Music className="w-3.5 h-3.5" style={{ color: accent }} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div
                    className="font-semibold text-xs leading-tight truncate"
                    style={{ color: isSelected ? accent : 'inherit' }}
                  >
                    {t.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{t.genre}</div>
                </div>

                {/* Play / Check */}
                <div className="flex-shrink-0">
                  {isSelected && !isPlaying && !isLoading ? (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: accent }}
                    >
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handlePreview(e, t.id)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isPlaying
                          ? 'text-white'
                          : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                      }`}
                      style={isPlaying ? { background: accent } : { background: 'rgba(255,255,255,0.08)' }}
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
    </motion.div>
  );
};

export default StepMusic;
