import { motion } from 'framer-motion';
import { Check, FileText, Image, Mic, Type, Film, Download, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadVideo } from '@/lib/download-video';

const GEN_STEPS = [
  { icon: FileText, label: 'Сценарий',  desc: 'GPT-4o пишет текст и описания',      minPct: 0,  maxPct: 12  },
  { icon: Image,    label: 'Картинки',  desc: 'Imagen генерирует кадры',             minPct: 12, maxPct: 50  },
  { icon: Mic,      label: 'Озвучка',   desc: 'OpenAI TTS создаёт голос',            minPct: 50, maxPct: 77  },
  { icon: Type,     label: 'Субтитры',  desc: 'Синхронизация субтитров с озвучкой',  minPct: 77, maxPct: 82  },
  { icon: Film,     label: 'Видео',     desc: 'FFmpeg собирает финальный ролик',      minPct: 82, maxPct: 100 },
];

interface Props {
  currentStep: number;
  progress: number;
  stepText: string;
  isDone: boolean;
  error?: string | null;
  jobId?: string | null;
  onReset: () => void;
  onCancel?: () => void;
}

const GenerationProgress = ({ currentStep, progress, stepText, isDone, error, jobId, onReset, onCancel }: Props) => {
  const isGenerating = !isDone && !error;
  const displayPct = isDone ? 100 : progress;

  // Determine which step is active/done based on progress percentage
  const getStepState = (idx: number) => {
    const s = GEN_STEPS[idx];
    if (isDone) return 'done';
    if (displayPct >= s.maxPct) return 'done';
    if (displayPct >= s.minPct) return 'active';
    return 'pending';
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
        <h2 className="text-3xl font-bold font-heading mb-2">
          {isDone ? '🎬 Видео готово!' : isGenerating ? '⚡ Генерация...' : '⚠️ Отменено'}
        </h2>
        <p className="text-muted-foreground">
          {isDone
            ? 'Ваше видео успешно создано'
            : isGenerating
            ? stepText || 'Это займёт 1–3 минуты'
            : 'Генерация была остановлена'}
        </p>
      </motion.div>

      {/* Step list */}
      <div className="space-y-3 mb-8">
        {GEN_STEPS.map((s, i) => {
          const state = getStepState(i);
          const done   = state === 'done';
          const active = state === 'active';
          const Icon = s.icon;

          // Inner progress for active step (0–100% within this step's range)
          const innerPct = active
            ? Math.min(100, Math.round(((displayPct - s.minPct) / (s.maxPct - s.minPct)) * 100))
            : 0;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                done
                  ? 'border-success/30 bg-success/5'
                  : active
                  ? 'border-primary/50 bg-primary/5 glow-primary'
                  : 'border-border bg-card/50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                done
                  ? 'bg-success text-success-foreground'
                  : active
                  ? 'gradient-primary text-primary-foreground animate-pulse'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm ${active ? 'text-primary' : done ? 'text-success' : 'text-muted-foreground'}`}>
                  {s.label}
                </div>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
                {active && (
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full gradient-primary rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${innerPct}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}
              </div>

              {active && (
                <div className="ml-auto shrink-0">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Global progress bar */}
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        <span>{isGenerating ? stepText : isDone ? 'Готово!' : ''}</span>
        <span>{displayPct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-8">
        <motion.div
          className="h-full gradient-primary rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: `${displayPct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Actions */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 justify-center flex-wrap">

        {isGenerating && onCancel && (
          <Button size="lg" variant="outline" onClick={onCancel} className="gap-2">
            <X className="w-5 h-5" /> Отменить
          </Button>
        )}

        {isDone && jobId && (
          <>
            <Button size="lg" className="gap-2 gradient-primary text-primary-foreground hover:opacity-90 glow-primary" onClick={() => downloadVideo(jobId)}>
              <Download className="w-5 h-5" /> Скачать видео
            </Button>
            <Button size="lg" variant="outline" onClick={onReset} className="gap-2">
              <RotateCcw className="w-5 h-5" /> Новое видео
            </Button>
          </>
        )}

        {error && (
          <Button size="lg" variant="outline" onClick={onReset} className="gap-2">
            <RotateCcw className="w-5 h-5" /> Попробовать снова
          </Button>
        )}
      </motion.div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive text-sm text-center">
          ⚠️ {error}
        </motion.div>
      )}
    </div>
  );
};

export default GenerationProgress;
