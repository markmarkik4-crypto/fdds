import { Check } from 'lucide-react';
import { t } from '@/lib/app-language';

const STEPS = [
  { num: 1, label: 'Тема' },
  { num: 2, label: 'Формат' },
  { num: 3, label: 'Стиль' },
  { num: 4, label: 'Музыка' },
  { num: 5, label: 'Голос' },
  { num: 6, label: 'Субтитры' },
  { num: 7, label: 'Итог' },
];

interface Props {
  current: number;
  onStepClick: (step: number) => void;
  language: string;
}

const WizardProgress = ({ current, onStepClick, language }: Props) => {
  const text = t(language);
  const labels = [
    text.topic,
    text.format,
    text.style,
    text.music,
    text.voice,
    text.subtitles,
    language === 'ru' ? 'Итог' : 'Summary',
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
      {STEPS.map((step, i) => {
        const done = current > step.num;
        const active = current === step.num;

        return (
          <div key={step.num} className="flex items-center">
            <button
              onClick={() => done || active ? onStepClick(step.num) : null}
              className={`flex items-center gap-2 px-2.5 py-2 md:px-3.5 md:py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_0_1px_rgba(168,85,247,0.15)]'
                  : done
                  ? 'bg-success/10 text-success cursor-pointer hover:bg-success/20'
                  : 'border border-border/60 bg-card/50 text-muted-foreground cursor-default'
              }`}
            >
              <span className={`w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold shrink-0 ${
                active
                  ? 'gradient-primary text-primary-foreground'
                  : done
                  ? 'bg-success text-success-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {done ? <Check className="w-3 h-3" /> : step.num}
              </span>
              <span className="hidden sm:inline">{labels[i] || step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`hidden lg:block w-6 xl:w-10 h-px mx-1 ${done ? 'bg-success/40' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default WizardProgress;
