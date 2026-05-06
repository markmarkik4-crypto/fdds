import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Loader2, Save, Sparkles, Type, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import SubtitleEditor from '@/components/wizard/SubtitleEditor';
import { DEFAULT_STATE } from '@/lib/wizard-data';
import { downloadVideo } from '@/lib/download-video';

type Tab = 'script' | 'subtitles';

interface ProjectScene {
  duration: number;
  voiceover: string;
  image_description?: string;
}

interface ProjectPayload {
  job: {
    jobId: string;
    topicLabel: string;
  };
  script: {
    title?: string;
    scenes?: ProjectScene[];
    cap?: Record<string, unknown>;
  };
}

interface Props {
  jobId: string;
  onClose: () => void;
  onUpdated: (newJobId?: string) => void;
}

function toSubtitleState(cap?: Record<string, unknown>) {
  return {
    subtitleTemplate: typeof cap?.template === 'string' ? cap.template : DEFAULT_STATE.subtitleTemplate,
    subtitleFont: typeof cap?.fontFamily === 'string' ? cap.fontFamily : DEFAULT_STATE.subtitleFont,
    subtitleSize: typeof cap?.fontSize === 'number' ? cap.fontSize : DEFAULT_STATE.subtitleSize,
    subtitleColor: typeof cap?.textColor === 'string' ? cap.textColor : DEFAULT_STATE.subtitleColor,
    subtitleStroke: typeof cap?.outlineColor === 'string' ? cap.outlineColor : DEFAULT_STATE.subtitleStroke,
    subtitleStrokeWidth: typeof cap?.outlineThickness === 'number' ? cap.outlineThickness : DEFAULT_STATE.subtitleStrokeWidth,
    subtitlePosition: cap?.verticalPosition === 'top' || cap?.verticalPosition === 'center' || cap?.verticalPosition === 'bottom'
      ? cap.verticalPosition
      : DEFAULT_STATE.subtitlePosition,
    subtitleAlign: cap?.alignment === 'left' || cap?.alignment === 'center' || cap?.alignment === 'right'
      ? cap.alignment
      : DEFAULT_STATE.subtitleAlign,
    subtitleBgColor: typeof cap?.bgColor === 'string' ? cap.bgColor : DEFAULT_STATE.subtitleBgColor,
    subtitleBgOpacity: typeof cap?.bgOpacity === 'number' ? cap.bgOpacity : DEFAULT_STATE.subtitleBgOpacity,
    subtitleBgRadius: typeof cap?.bgRadius === 'number' ? cap.bgRadius : DEFAULT_STATE.subtitleBgRadius,
    subtitleBgHeight: typeof cap?.bgHeight === 'number' ? cap.bgHeight : DEFAULT_STATE.subtitleBgHeight,
    subtitleBgWidth: typeof cap?.bgWidth === 'number' ? cap.bgWidth : DEFAULT_STATE.subtitleBgWidth,
    subtitleBgOffsetX: typeof cap?.bgOffsetX === 'number' ? cap.bgOffsetX : DEFAULT_STATE.subtitleBgOffsetX,
    subtitleBgOffsetY: typeof cap?.bgOffsetY === 'number' ? cap.bgOffsetY : DEFAULT_STATE.subtitleBgOffsetY,
  };
}

const ProjectEditor = ({ jobId, onClose, onUpdated }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('script');
  const [title, setTitle] = useState('');
  const [scenes, setScenes] = useState<ProjectScene[]>([]);
  const [subtitleState, setSubtitleState] = useState(() => toSubtitleState());

  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/job/${jobId}/project`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: ProjectPayload = await resp.json();
        if (cancelled) return;
        setTitle(data.script.title || data.job.topicLabel || 'Без названия');
        setScenes(Array.isArray(data.script.scenes) ? data.script.scenes : []);
        setSubtitleState(toSubtitleState(data.script.cap));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProject();
    return () => { cancelled = true; };
  }, [jobId]);

  const updateScene = (index: number, patch: Partial<ProjectScene>) => {
    setScenes(prev => prev.map((scene, i) => (i === index ? { ...scene, ...patch } : scene)));
  };

  const saveScript = async () => {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`/api/job/${jobId}/script`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, scenes }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      toast.success('Проект сохранён');
      onUpdated();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(`Не удалось сохранить проект: ${message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const rebuildProject = async () => {
    const saved = await saveScript();
    if (!saved) return;

    setRebuilding(true);
    try {
      const resp = await fetch(`/api/job/${jobId}/rebuild`, { method: 'POST' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      toast.success('Пересборка запущена');
      onUpdated(data.jobId);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(`Не удалось пересобрать проект: ${message}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      >
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            className="w-full max-w-6xl h-[88vh] rounded-3xl border border-border bg-card shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border bg-card/95">
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 shrink-0">
                  <ArrowLeft className="w-4 h-4" /> Назад
                </Button>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold font-heading truncate">Редактирование проекта</h2>
                  <p className="text-xs text-muted-foreground truncate">{title || 'Без названия'}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex gap-1 p-1 rounded-xl bg-secondary border border-border">
                  <button
                    onClick={() => setActiveTab('script')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'script' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Сценарий
                  </button>
                  <button
                    onClick={() => setActiveTab('subtitles')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'subtitles' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Субтитры
                  </button>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full border border-border bg-secondary/80 hover:bg-secondary transition-colors flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="h-[calc(88vh-74px)] overflow-hidden">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                </div>
              ) : error && scenes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                  <p className="text-destructive">{error}</p>
                  <Button variant="outline" onClick={onClose}>Закрыть</Button>
                </div>
              ) : activeTab === 'script' ? (
                <div className="h-full flex flex-col">
                  <div className="px-6 py-4 border-b border-border bg-secondary/20">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Название проекта
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm outline-none focus:border-primary/60"
                      placeholder="Название проекта"
                    />
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Здесь можно править название, текст озвучки и длительность сцен. После сохранения нажмите пересборку, чтобы получить новую версию ролика.
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {scenes.map((scene, index) => (
                      <div key={index} className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Сцена {index + 1}</p>
                            {scene.image_description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{scene.image_description}</p>
                            )}
                          </div>
                          <div className="w-28">
                            <label className="block text-[11px] text-muted-foreground mb-1">Длительность, сек</label>
                            <input
                              type="number"
                              min={1}
                              value={scene.duration}
                              onChange={(e) => updateScene(index, { duration: Number(e.target.value) || 1 })}
                              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">Текст озвучки</label>
                          <textarea
                            value={scene.voiceover}
                            onChange={(e) => updateScene(index, { voiceover: e.target.value })}
                            rows={4}
                            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary/60 resize-y"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="px-6 py-4 border-t border-border bg-card/95 flex items-center justify-between gap-4">
                    <div className="text-xs text-muted-foreground">
                      {error ? <span className="text-destructive">{error}</span> : 'Сохранение меняет проект, пересборка создаёт новую версию ролика.'}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={saveScript} disabled={saving || rebuilding} className="gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Сохранить
                      </Button>
                      <Button onClick={rebuildProject} disabled={saving || rebuilding} className="gap-2 gradient-primary text-primary-foreground hover:opacity-90">
                        {rebuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Пересобрать
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full p-4">
                  <SubtitleEditor
                    jobId={jobId}
                    initialState={subtitleState}
                    onDownload={() => downloadVideo(jobId)}
                    onRebuildDone={(newJobId) => {
                      toast.success('Новая версия с обновлёнными субтитрами создана');
                      onUpdated(newJobId);
                      onClose();
                    }}
                  />
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProjectEditor;
