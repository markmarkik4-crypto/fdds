import { motion } from 'framer-motion';
import { TOPICS, LANGUAGES, STYLES, VOICES, MUSIC_TRACKS, STORY_STYLES } from '@/lib/wizard-data';
import type { WizardState } from '@/lib/wizard-data';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/app-language';

interface Props {
  state: WizardState;
  isGenerating: boolean;
  onGenerate: () => void;
  uiLanguage: string;
}

const StepSummary = ({ state, isGenerating, onGenerate, uiLanguage }: Props) => {
  const text = t(uiLanguage);
  const topicItem = TOPICS.find(t => t.id === state.topic);
  const subtopicItem = topicItem?.subtopics?.find(st => st.id === state.subtopic);
  const topic = state.promptMode === 'custom'
    ? text.customPrompt
    : topicItem?.label || '—';
  const lang = LANGUAGES.find(l => l.code === state.language);
  const style = STYLES.find(s => s.id === state.style);
  const storyStyle = STORY_STYLES.find(s => s.id === state.storyStyle);
  const voice = VOICES.find(v => v.id === state.voice);
  const music = state.music === null
    ? text.noMusic
    : state.music === 'random'
    ? text.random
    : MUSIC_TRACKS.find(t => t.id === state.music)?.label || '—';

  const rows = [
    [text.topic, state.promptMode === 'custom' ? state.customPrompt : `${topic}${subtopicItem ? ` → ${subtopicItem.label}` : ''}${state.angle ? ` → ${state.angle}` : ''}`],
    [text.details, state.promptMode === 'genre' ? (state.topicDetails || '—') : '—'],
    [text.storyStyle, state.promptMode === 'genre' ? (storyStyle?.label || state.storyStyle) : '—'],
    [text.language, `${lang?.flag} ${lang?.label}`],
    [text.format, `${state.format} • ${state.duration} ${uiLanguage === 'ru' ? 'сек' : 'sec'}`],
    [text.style, style?.label || '—'],
    [text.music, music],
    [text.voice, voice?.label || '—'],
    [text.subtitles, `${state.subtitleFont} • ${state.subtitleSize}px • ${state.subtitlePosition}`],
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold font-heading mb-2">{text.ready}</h2>
        <p className="text-muted-foreground">{text.checkSettings}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between items-center py-2 border-b border-border last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-medium">{value}</span>
          </div>
        ))}
      </div>

      <Button
        onClick={onGenerate}
        disabled={isGenerating}
        size="lg"
        className="w-full h-14 text-lg font-bold gradient-primary text-primary-foreground hover:opacity-90 transition-opacity glow-primary"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            {text.generating}
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 mr-2" />
            {text.generate}
          </>
        )}
      </Button>
    </motion.div>
  );
};

export default StepSummary;
