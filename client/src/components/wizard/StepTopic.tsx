import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState, useCallback } from 'react';
import { TOPICS, STORY_STYLES } from '@/lib/wizard-data';
import { Shuffle, Pencil, LayoutGrid, Loader2, Sparkles, RefreshCw } from 'lucide-react';

interface Props {
  promptMode: 'genre' | 'custom';
  topic: string | null;
  angle: string | null;
  subtopic: string | null;
  storyStyle: string;
  topicDetails: string;
  promptPreview: string;
  customPrompt: string;
  onChange: (field: string, value: string | null) => void;
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

function displayText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.label === 'string') return obj.label;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.title === 'string') return obj.title;
    if (typeof obj.desc === 'string') return obj.desc;
  }
  return fallback;
}

function stripLeadingEmoji(text: string): string {
  return text.replace(/^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\s*(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*\s*/u, '').trim();
}

const SUBTOPIC_EMOJI: Record<string, string> = {
  ww2: '🌍',
  ww2_ru: '⭐',
  ancient_wars: '🏛️',
  napoleonic: '🎖️',
  modern_conflicts: '🪖',
  civil_wars: '⚔️',
  naval_battles: '🚢',
  air_war: '✈️',
  ancient_mysteries: '🏺',
  disappearances: '🛸',
  conspiracies: '🕵️',
  paranormal: '👻',
  lost_treasures: '💎',
  secrets: '🔐',
  investing: '📈',
  scams: '🎭',
  rich_people: '👑',
  crashes: '📉',
  business_cases: '💼',
  side_money: '🪙',
  animals: '🦁',
  extinct_animals: '🦕',
  predators: '🦈',
  ocean: '🌊',
  jungle: '🌴',
  arctic: '🐻‍❄️',
  catastrophes: '🌋',
};

const StepTopic = ({
  promptMode,
  topic,
  angle: _angle,
  subtopic: _subtopic,
  storyStyle,
  topicDetails,
  promptPreview,
  customPrompt,
  onChange,
}: Props) => {
  const selectedTopic = TOPICS.find(t => t.id === topic);
  const selectedTopicLabel = stripLeadingEmoji(displayText(selectedTopic?.label));
  const selectedSubtopic = selectedTopic?.subtopics?.find(st => st.id === _subtopic);
  const selectedSubtopicLabel = selectedSubtopic ? stripLeadingEmoji(displayText(selectedSubtopic.label)) : '';

  // Live prompt preview — fetches from Claude whenever selections change
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPreview = useCallback(async (topicId: string, subtopicId: string | null, style: string, details: string) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      // Compute labels fresh inside the callback — TOPICS is populated by this point
      const tEntry = TOPICS.find(t => t.id === topicId);
      const genreLabel = tEntry ? stripLeadingEmoji(displayText(tEntry.label)) : topicId;
      const stEntry = subtopicId ? tEntry?.subtopics?.find(st => st.id === subtopicId) : undefined;
      const subGenreLabel = stEntry ? stripLeadingEmoji(displayText(stEntry.label)) : '';
      const styleEntry = STORY_STYLES.find(s => s.id === style);
      const styleLabel = styleEntry ? stripLeadingEmoji(displayText(styleEntry.label)) : style;

      const r = await fetch('/api/prompt-from-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: genreLabel,
          subGenre: subGenreLabel,
          style: styleLabel,
          details,
        }),
        signal: abortRef.current.signal,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      if (data.prompt) onChange('promptPreview', data.prompt);
      else throw new Error('Empty response from server');
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[PromptPreview]', msg);
      setPreviewError(msg);
    } finally {
      setPreviewLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    if (promptMode !== 'genre' || !topic) {
      onChange('promptPreview', '');
      setPreviewError(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = topicDetails ? 700 : 150;
    debounceRef.current = setTimeout(() => {
      fetchPreview(topic, _subtopic, storyStyle, topicDetails);
    }, delay);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [topic, _subtopic, storyStyle, topicDetails, promptMode, fetchPreview]);

  const handleRandom = () => {
    if (TOPICS.length === 0) return;
    const randomTopic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const randomStyle = STORY_STYLES.length
      ? STORY_STYLES[Math.floor(Math.random() * STORY_STYLES.length)].id
      : 'intrigue';
    onChange('promptMode', 'genre');
    onChange('topic', randomTopic.id);
    onChange('angle', null);
    onChange('subtopic', null);
    onChange('storyStyle', randomStyle);
    onChange('topicDetails', '');
    onChange('customPrompt', '');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading leading-tight">О чём видео?</h2>
          <p className="text-sm text-muted-foreground">Выберите жанр или введите свой промпт</p>
        </div>
        <button
          onClick={handleRandom}
          title="Случайная тема"
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-muted-foreground/40 text-sm text-muted-foreground hover:border-primary/60 hover:text-primary transition-all"
        >
          <Shuffle className="w-3.5 h-3.5" />
          Случайная
        </button>
      </div>

      <div className="flex gap-2 p-1 rounded-2xl bg-secondary/90 border border-border">
        <button
          onClick={() => onChange('promptMode', 'genre')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            promptMode === 'genre'
              ? 'bg-primary text-primary-foreground shadow'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Выбрать жанр
        </button>
        <button
          onClick={() => onChange('promptMode', 'custom')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            promptMode === 'custom'
              ? 'bg-primary text-primary-foreground shadow'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Pencil className="w-3.5 h-3.5" />
          Свой промпт
        </button>
      </div>

      <AnimatePresence mode="wait">
        {promptMode === 'genre' && (
          <motion.div
            key="genre"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-5"
          >
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3"
            >
              {TOPICS.map(t => {
                const label = displayText(t.label);
                const cleanLabel = stripLeadingEmoji(label);

                return (
                  <motion.button
                    key={t.id}
                    variants={item}
                    onClick={() => {
                      onChange('topic', t.id);
                      onChange('angle', null);
                      onChange('subtopic', null);
                      onChange('topicDetails', '');
                    }}
                    className={`group relative flex min-h-[110px] flex-col justify-between p-4 rounded-2xl text-left transition-all duration-200 border ${
                      topic === t.id
                        ? 'border-primary bg-primary/10 glow-primary'
                        : 'border-border bg-card/70 hover:border-primary/40 hover:bg-card'
                    }`}
                  >
                    <span className="text-2xl block">{t.emoji}</span>
                    <span className="text-sm font-medium leading-tight">{cleanLabel}</span>
                  </motion.button>
                );
              })}
            </motion.div>

            <AnimatePresence>
              {selectedTopic && selectedTopic.subtopics && selectedTopic.subtopics.length > 0 && (
                <motion.div
                  key="subtopics"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3 rounded-2xl border border-border/70 bg-secondary/35 p-4 sm:p-5"
                >
                  <p className="text-sm font-medium text-muted-foreground">
                    Что именно вас интересует в {selectedTopicLabel.toLowerCase()}?
                  </p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {selectedTopic.subtopics.map(st => {
                      const label = displayText(st.label);
                      const cleanLabel = stripLeadingEmoji(label);
                      const subtopicEmoji = SUBTOPIC_EMOJI[st.id] || selectedTopic.emoji;

                      return (
                        <button
                          key={st.id}
                          onClick={() => {
                            onChange('subtopic', st.id);
                          }}
                          className={`flex items-start gap-3 px-4 py-3 rounded-2xl text-left border transition-all text-sm min-h-[88px] ${
                            _subtopic === st.id
                              ? 'border-primary bg-primary/15 text-primary glow-primary'
                              : 'border-border bg-card/70 hover:border-primary/50 hover:text-foreground'
                          }`}
                        >
                          <span className="text-xl leading-none pt-0.5">{subtopicEmoji}</span>
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight">{cleanLabel}</p>
                            {st.desc && (
                              <p className="text-xs text-muted-foreground mt-1 leading-snug opacity-80">
                                {displayText(st.desc)}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {selectedTopic && (
                <motion.div
                  key="custom-prompt"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-secondary/70">
                    <span className="text-xl shrink-0">{selectedTopic.emoji}</span>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      value={topicDetails}
                      onChange={e => onChange('topicDetails', e.target.value)}
                      placeholder={`Уточните или добавьте детали к ${selectedTopicLabel.toLowerCase()}…`}
                      className="flex-1 bg-transparent h-10 text-sm placeholder:text-muted-foreground/60 border-0 outline-none"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {topic && STORY_STYLES.length > 0 && (
                <motion.div
                  key="story-style"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="space-y-3 pt-5 border-t border-border"
                >
                  <p className="text-sm font-medium text-muted-foreground">Стиль истории:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {STORY_STYLES.map(s => {
                      const label = displayText(s.label);
                      const cleanLabel = stripLeadingEmoji(label);

                      return (
                        <button
                          key={s.id}
                          onClick={() => onChange('storyStyle', s.id)}
                          className={`flex items-start gap-3 px-4 py-3 rounded-2xl text-left border transition-all min-h-[88px] ${
                            storyStyle === s.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-card/70 hover:border-primary/40'
                          }`}
                        >
                          <span className="text-xl leading-none pt-0.5">{s.emoji}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight">{cleanLabel}</p>
                            {s.desc && (
                              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                                {displayText(s.desc)}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Live prompt preview ── */}
            <AnimatePresence>
              {topic && (
                <motion.div
                  key="prompt-preview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-2xl border border-primary/30 bg-primary/5 overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-primary/15 bg-primary/8">
                    {previewLoading ? (
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-primary tracking-wide uppercase">
                      {previewLoading ? 'Генерирую промпт…' : previewError ? 'Ошибка генерации' : 'Готовый промпт для генерации'}
                    </span>
                    <button
                      onClick={() => fetchPreview(topic, _subtopic, storyStyle, topicDetails)}
                      disabled={previewLoading}
                      title="Обновить промпт"
                      className="ml-auto p-1 rounded-lg hover:bg-primary/10 text-muted-foreground/60 hover:text-primary transition-all disabled:opacity-40"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                  {previewError ? (
                    <div className="px-4 py-3">
                      <p className="text-xs text-destructive font-mono break-all">{previewError}</p>
                      <button
                        onClick={() => fetchPreview(topic, _subtopic, storyStyle, topicDetails)}
                        className="mt-2 text-xs text-primary underline"
                      >
                        Попробовать снова
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <textarea
                        value={promptPreview}
                        onChange={e => onChange('promptPreview', e.target.value)}
                        placeholder={previewLoading ? '' : 'Выберите жанр — промпт появится здесь…'}
                        rows={6}
                        className="w-full bg-transparent px-4 py-3 text-xs text-foreground/90 font-mono leading-relaxed resize-none outline-none placeholder:text-muted-foreground/40"
                      />
                      {previewLoading && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <Loader2 className="w-5 h-5 text-primary/40 animate-spin" />
                        </div>
                      )}
                    </div>
                  )}
                  <p className="px-4 pb-2.5 text-xs text-muted-foreground/50">
                    Промпт автоматически обновляется при смене жанра, подтемы, деталей или стиля. Можно редактировать вручную.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {promptMode === 'custom' && (
          <motion.div
            key="custom"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground">
                Опишите тему видео своими словами
              </label>
              <textarea
                value={customPrompt}
                onChange={e => onChange('customPrompt', e.target.value)}
                placeholder="Например: история о великих изобретениях человечества — от колеса до интернета"
                rows={5}
                className="w-full rounded-2xl border border-border bg-secondary/80 px-4 py-4 text-sm placeholder:text-muted-foreground/60 resize-none outline-none focus:border-primary/60 transition-colors"
              />
              <p className="text-xs text-muted-foreground/60">
                ИИ создаст сценарий на основе вашего текста. Чем подробнее — тем точнее результат.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-muted-foreground">Быстрые идеи:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'История Армении от древности до наших дней',
                  'Как работает квантовый компьютер',
                  'Топ-5 самых необычных животных мира',
                  'Секреты долголетия японцев',
                  'Как Илон Маск строит ракеты',
                ].map(idea => (
                  <button
                    key={idea}
                    onClick={() => onChange('customPrompt', idea)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:border-primary/50 hover:text-primary transition-all text-muted-foreground"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StepTopic;
