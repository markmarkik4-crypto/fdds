import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, RotateCcw, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_STATE, TOPICS, VOICES, type WizardState, loadConfig, saveSubtitleSettings, loadSubtitleSettings } from '@/lib/wizard-data';
import { downloadVideo } from '@/lib/download-video';
import { t } from '@/lib/app-language';
import { toast } from 'sonner';
import WizardProgress from './WizardProgress';
import StepTopic from './StepTopic';
import StepFormat from './StepFormat';
import StepStyle from './StepStyle';
import StepMusic from './StepMusic';
import StepVoice from './StepVoice';
import StepSubtitles from './StepSubtitles';
import StepSummary from './StepSummary';
import GenerationProgress from './GenerationProgress';

const TOTAL_STEPS = 7;

function stripLeadingEmoji(text: string | null | undefined) {
  if (!text) return text || '';
  return text.replace(/^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\s*(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*\s*/u, '').trim();
}

interface WizardProps {
  onDone?: () => void;
  appLanguage: string;
  onLanguageChange: (language: string) => void;
}

const VideoWizard = ({ onDone, appLanguage, onLanguageChange }: WizardProps) => {
  const text = t(appLanguage);
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(() => ({
    ...DEFAULT_STATE,
    ...loadSubtitleSettings(),
    language: appLanguage,
  }));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStepText, setGenerationStepText] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadConfig().then(() => setConfigLoaded(true)).catch(console.error);
  }, []);

  useEffect(() => {
    setState(prev => {
      const currentVoice = VOICES.find(voice => voice.id === prev.voice);
      const voiceMatchesLanguage = !currentVoice?.lang || currentVoice.lang === appLanguage;
      const fallbackVoice = VOICES.find(voice => !voice.lang || voice.lang === appLanguage)?.id || prev.voice;
      return {
        ...prev,
        language: appLanguage,
        voice: voiceMatchesLanguage ? prev.voice : fallbackVoice,
      };
    });
  }, [appLanguage]);

  const update = useCallback((field: string, value: string | number | null) => {
    if (field === 'language' && typeof value === 'string') onLanguageChange(value);
    setState(prev => {
      const next = { ...prev, [field]: value };
      if (field.startsWith('subtitle')) saveSubtitleSettings(next);
      return next;
    });
  }, [onLanguageChange]);

  const canNext = () => {
    if (step === 1) {
      if (state.promptMode === 'custom') return state.customPrompt.trim().length > 0;
      return state.topic !== null;
    }
    return true;
  };

  const next = () => {
    if (step < TOTAL_STEPS && canNext()) setStep(s => s + 1);
  };
  const prev = () => {
    if (step > 1) setStep(s => s - 1);
  };

  // Map server step text to wizard step index
  const stepTextToIndex = (text: string): number => {
    const t = text.toLowerCase();
    if (t.includes('сценарий') || t.includes('script')) return 0;
    if (t.includes('изображ') || t.includes('image')) return 1;
    if (t.includes('озвуч') || t.includes('tts') || t.includes('speech')) return 2;
    if (t.includes('субтитр') || t.includes('subtitle')) return 3;
    if (t.includes('видео') || t.includes('ffmpeg') || t.includes('video')) return 4;
    return 0;
  };

  const handleGenerate = async () => {
    setGenerationError(null);
    setVideoReady(false);
    setIsGenerating(true);
    setGenerationStep(0);
    setGenerationProgress(0);
    setGenerationStepText(appLanguage === 'ru' ? 'Запускаем генерацию...' : 'Starting generation...');

    try {
      const selectedTopic = TOPICS.find((entry) => entry.id === state.topic);
      const selectedSubtopic = selectedTopic?.subtopics?.find((entry) => entry.id === state.subtopic);
      const themeLabel = stripLeadingEmoji(selectedTopic?.label || state.topic);
      const subtopicLabel = stripLeadingEmoji(selectedSubtopic?.label || state.subtopic);
      const topicHint = state.promptMode === 'genre'
        ? state.topicDetails.trim() || undefined
        : undefined;

      // Step 1: Start generation
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: state.promptMode === 'custom' ? null : themeLabel,
          customPrompt: state.promptMode === 'custom' ? state.customPrompt : undefined,
          topicHint,
          angle: state.promptMode === 'custom' ? null : state.angle,
          subtopic: state.promptMode === 'custom' ? null : subtopicLabel,
          storyStyle: state.promptMode === 'custom' ? null : state.storyStyle,
          promptPreview: state.promptMode === 'genre' ? (state.promptPreview || undefined) : undefined,
          lang: state.language,
          format: state.format,
          duration: parseInt(state.duration),
          style: state.style,
          music: state.music ?? 'none',
          voice: state.voice,
          ttsSpeed: state.ttsSpeed,
          ttsInstructions: state.ttsInstructions,
          captionSettings: {
            enabled: true,
            template: state.subtitleTemplate,
            fontFamily: state.subtitleFont,
            fontSize: state.subtitleSize,
            textColor: state.subtitleColor,
            outlineColor: state.subtitleStroke,
            outlineThickness: state.subtitleStrokeWidth,
            verticalPosition: state.subtitlePosition,
            alignment: state.subtitleAlign,
            bubble: false,
            showBackground: state.subtitleBgOpacity > 0,
            bgColor: state.subtitleBgColor,
            bgOpacity: state.subtitleBgOpacity,
            bgRadius: state.subtitleBgRadius,
            bgHeight: state.subtitleBgHeight,
            bgWidth: state.subtitleBgWidth,
            bgOffsetX: state.subtitleBgOffsetX,
            bgOffsetY: state.subtitleBgOffsetY,
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const newJobId: string = data.jobId;
      setJobId(newJobId);

      // Step 2: Connect to EventSource for live progress
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(`/api/status/${newJobId}`);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          console.log('[VidRush] SSE:', msg.status, msg.step || '');
          if (msg.status === 'done') {
            setGenerationStep(5);
            setGenerationProgress(100);
            setGenerationStepText(appLanguage === 'ru' ? 'Готово!' : 'Done!');
            setIsGenerating(false);
            setVideoReady(true);
            es.close();
            eventSourceRef.current = null;
            toast.success(`🎬 ${text.videoReady}`);
          } else if (msg.status === 'error') {
            setGenerationError(msg.error || 'Generation failed');
            setIsGenerating(false);
            es.close();
            eventSourceRef.current = null;
            toast.error(`${appLanguage === 'ru' ? 'Ошибка' : 'Error'}: ${msg.error || 'unknown'}`);
          } else {
            const idx = stepTextToIndex(msg.step || '');
            setGenerationStep(idx);
            if (typeof msg.progress === 'number') setGenerationProgress(msg.progress);
            if (msg.step) setGenerationStepText(msg.step);
          }
        } catch (err) {
          console.error('[VidRush] SSE parse error:', err);
        }
      };

      let errorCount = 0;
      es.onerror = async () => {
        errorCount++;
        console.error('[VidRush] SSE connection error, count:', errorCount);
        try {
          const statusResp = await fetch(`/api/status/${newJobId}`, { headers: { Accept: 'application/json' } });
          // If we can reach the server, it's just a reconnect — ignore
          if (statusResp.ok) { errorCount = 0; return; }
        } catch {}
        // Only fail after repeated network errors
        if (errorCount >= 3) {
          setGenerationError(appLanguage === 'ru' ? 'Соединение потеряно — проверьте логи сервера' : 'Connection lost — check server logs');
          es.close();
          eventSourceRef.current = null;
          setIsGenerating(false);
        }
      };
    } catch (err) {
      console.error('[VidRush] handleGenerate error:', err);
      setGenerationError(err instanceof Error ? err.message : String(err));
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setJobId(null);
    setVideoReady(false);
    setIsGenerating(false);
    setGenerationStep(0);
    setGenerationProgress(0);
    setGenerationStepText('');
    setGenerationError(null);
    setStep(1);
    setState(prev => ({ ...DEFAULT_STATE, ...loadSubtitleSettings(), language: appLanguage }));
  };

  const handleCancel = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsGenerating(false);
    setJobId(null);
    setGenerationStep(0);
    setGenerationProgress(0);
    setGenerationStepText('');
    setGenerationError(null);
    setStep(1);
  };

  // Show loading while config loads
  if (!configLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[520px] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">{text.loading}</p>
      </div>
    );
  }

  // Show generation progress
  if (isGenerating) {
    return (
      <GenerationProgress
        currentStep={generationStep}
        progress={generationProgress}
        stepText={generationStepText}
        isDone={false}
        error={generationError}
        jobId={jobId}
        onReset={handleReset}
        onCancel={handleCancel}
      />
    );
  }

  // Show result screen
  if (videoReady && jobId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm mx-auto flex flex-col items-center gap-6"
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold font-heading">{text.videoReady}</h2>
          <p className="text-sm text-muted-foreground mt-1">{text.downloadOrNew}</p>
        </div>

        <div className="rounded-2xl overflow-hidden border border-border bg-black w-full" style={{ aspectRatio: '9/16' }}>
          <video
            key={jobId}
            src={`/api/video/${jobId}`}
            controls
            playsInline
            className="w-full h-full object-contain"
          />
        </div>

        <div className="flex gap-3 w-full">
          <Button size="lg" variant="outline" className="flex-1 gap-2" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" /> {text.newVideo}
          </Button>
          <Button size="lg"
            className="flex-1 gap-2 gradient-primary text-primary-foreground hover:opacity-90 glow-primary"
            onClick={() => downloadVideo(jobId)}
          >
            <Download className="w-4 h-4" /> {text.download}
          </Button>
        </div>
        {onDone && (
          <Button variant="ghost" className="text-muted-foreground" onClick={onDone}>
            {text.myVideos} →
          </Button>
        )}
      </motion.div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="xl:flex-1">
          <WizardProgress current={step} onStepClick={s => s <= step && setStep(s)} language={appLanguage} />
        </div>
        <div className="flex items-center justify-end gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={prev}
            disabled={step === 1}
            className="gap-1.5 px-4"
          >
            <ChevronLeft className="w-4 h-4" /> {text.back}
          </Button>
          {step < TOTAL_STEPS ? (
            <Button
              size="sm"
              onClick={next}
              disabled={!canNext()}
              className="gap-1.5 px-5 gradient-primary text-primary-foreground hover:opacity-90"
            >
              {text.next} <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gap-1.5 px-5 gradient-primary text-primary-foreground hover:opacity-90"
            >
              ⚡ {text.createVideo}
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-[520px] rounded-[28px] border border-border/70 bg-card/55 p-4 sm:p-6 lg:p-8 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 && <StepTopic promptMode={state.promptMode} topic={state.topic} angle={state.angle} subtopic={state.subtopic} storyStyle={state.storyStyle} topicDetails={state.topicDetails} promptPreview={state.promptPreview} customPrompt={state.customPrompt} onChange={update} />}
            {step === 2 && <StepFormat language={state.language} uiLanguage={appLanguage} format={state.format} duration={state.duration} onChange={update} />}
            {step === 3 && <StepStyle style={state.style} uiLanguage={appLanguage} onChange={update} />}
            {step === 4 && <StepMusic music={state.music} uiLanguage={appLanguage} onChange={update} />}
            {step === 5 && <StepVoice voice={state.voice} language={state.language} uiLanguage={appLanguage} ttsSpeed={state.ttsSpeed} ttsInstructions={state.ttsInstructions} onChange={update} />}
            {step === 6 && <StepSubtitles state={state} onChange={update} />}
            {step === 7 && <StepSummary state={state} isGenerating={isGenerating} onGenerate={handleGenerate} uiLanguage={appLanguage} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default VideoWizard;
