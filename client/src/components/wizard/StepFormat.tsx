import { motion } from 'framer-motion';
import { LANGUAGES, FORMATS } from '@/lib/wizard-data';
import { t } from '@/lib/app-language';

interface Props {
  language: string;
  uiLanguage: string;
  format: string;
  duration: string;
  onChange: (field: string, value: string) => void;
}

const DURATION_MIN = 30;
const DURATION_MAX = 180;
const DURATION_STEP = 5;
const DURATION_MARKS = [30, 60, 90, 120, 150, 180];

function formatDuration(value: number, language: string) {
  const isRu = language === 'ru';
  if (value < 60) return `${value} ${isRu ? 'сек' : 'sec'}`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  if (seconds === 0) return `${minutes} ${isRu ? 'мин' : 'min'}`;
  return `${minutes} ${isRu ? 'мин' : 'min'} ${seconds} ${isRu ? 'сек' : 'sec'}`;
}

const StepFormat = ({ language, uiLanguage, format, duration, onChange }: Props) => {
  const text = t(uiLanguage);
  const durationValue = Math.min(
    DURATION_MAX,
    Math.max(DURATION_MIN, Number.parseInt(duration, 10) || 60),
  );
  const sliderPercent = ((durationValue - DURATION_MIN) / (DURATION_MAX - DURATION_MIN)) * 100;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl md:text-3xl font-bold font-heading">{text.formatTitle}</h2>
        <p className="text-muted-foreground">{text.formatSubtitle}</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{text.voiceLanguage}</h3>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => onChange('language', l.code)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                language === l.code
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-secondary hover:border-primary/40'
              }`}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{text.videoFormat}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => onChange('format', f.id)}
              className={`p-5 rounded-2xl text-center transition-all border ${
                format === f.id
                  ? 'border-primary bg-primary/10 glow-primary'
                  : 'border-border bg-card hover:border-primary/40'
              }`}
            >
              <div
                className={`mx-auto mb-3 border-2 rounded ${
                  f.id === '9:16' ? 'w-9 h-16' : f.id === '1:1' ? 'w-12 h-12' : 'w-16 h-9'
                } ${format === f.id ? 'border-primary' : 'border-muted-foreground/30'}`}
              />
              <div className="font-bold text-xl">{f.label}</div>
              <div className="text-sm text-muted-foreground mt-1">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-secondary/35 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{text.duration}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {text.durationStrict}
            </p>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-right">
            <div className="text-xs text-muted-foreground">{text.selected}</div>
            <div className="text-2xl font-bold text-primary">{formatDuration(durationValue, uiLanguage)}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative h-3 rounded-full bg-muted">
            <div
              className="absolute left-0 top-0 h-3 rounded-full gradient-primary"
              style={{ width: `${sliderPercent}%` }}
            />
            <input
              type="range"
              min={DURATION_MIN}
              max={DURATION_MAX}
              step={DURATION_STEP}
              value={durationValue}
              onChange={(e) => onChange('duration', e.target.value)}
              className="absolute inset-0 h-3 w-full cursor-pointer appearance-none bg-transparent"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {DURATION_MARKS.map(mark => (
              <button
                key={mark}
                type="button"
                onClick={() => onChange('duration', String(mark))}
                className={`transition-colors ${durationValue === mark ? 'text-primary font-semibold' : 'hover:text-foreground'}`}
              >
                {mark === 180 ? (uiLanguage === 'ru' ? '3 мин' : '3 min') : formatDuration(mark, uiLanguage)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default StepFormat;
