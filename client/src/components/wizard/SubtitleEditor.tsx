import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Type, Palette, AlignCenter, AlignLeft, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  RotateCcw, Download, Loader2, X, Search, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUBTITLE_TEMPLATES, SUBTITLE_FONTS, type WizardState } from '@/lib/wizard-data';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubState = Pick<
  WizardState,
  | 'subtitleTemplate' | 'subtitleFont' | 'subtitleSize'
  | 'subtitleColor' | 'subtitleStroke' | 'subtitleStrokeWidth'
  | 'subtitlePosition' | 'subtitleAlign'
  | 'subtitleBgColor' | 'subtitleBgOpacity' | 'subtitleBgRadius'
  | 'subtitleBgHeight' | 'subtitleBgWidth' | 'subtitleBgOffsetX' | 'subtitleBgOffsetY'
>;

interface Props {
  jobId: string;
  initialState: SubState;
  onRebuildDone: (newJobId: string) => void;
  onDownload: () => void;
}

function toCaptionSettings(s: SubState) {
  return {
    enabled: true,
    template: s.subtitleTemplate,
    fontFamily: s.subtitleFont,
    fontSize: s.subtitleSize,
    textColor: s.subtitleColor,
    outlineColor: s.subtitleStroke,
    outlineThickness: s.subtitleStrokeWidth,
    verticalPosition: s.subtitlePosition,
    alignment: s.subtitleAlign,
    bubble: false,
    showBackground: s.subtitleBgOpacity > 0,
    bgColor: s.subtitleBgColor,
    bgOpacity: s.subtitleBgOpacity,
    bgRadius: s.subtitleBgRadius,
    bgHeight: s.subtitleBgHeight,
    bgWidth: s.subtitleBgWidth,
    bgOffsetX: s.subtitleBgOffsetX,
    bgOffsetY: s.subtitleBgOffsetY,
  };
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'template' | 'font' | 'position' | 'background';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'template', label: 'Стиль',     icon: <Palette className="w-3.5 h-3.5" /> },
  { id: 'font',     label: 'Шрифт',     icon: <Type className="w-3.5 h-3.5" /> },
  { id: 'position', label: 'Позиция',   icon: <AlignCenterVertical className="w-3.5 h-3.5" /> },
  { id: 'background', label: 'Фон',     icon: <Palette className="w-3.5 h-3.5" /> },
];

// ── Slider ────────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-bold text-primary">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-primary cursor-pointer rounded-full" />
    </div>
  );
}

// ── Color picker row ──────────────────────────────────────────────────────────
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <label className="flex items-center gap-2 cursor-pointer">
        <div className="w-7 h-7 rounded-lg border-2 border-border overflow-hidden"
          style={{ background: value }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            className="opacity-0 w-full h-full cursor-pointer" />
        </div>
        <span className="text-xs font-mono text-muted-foreground w-16">{value.toUpperCase()}</span>
      </label>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const SubtitleEditor = ({ jobId, initialState, onRebuildDone, onDownload }: Props) => {
  const [s, setS] = useState<SubState>(initialState);
  const [activeTab, setActiveTab] = useState<Tab>('template');
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontSearch, setFontSearch] = useState('');
  const [fontCategory, setFontCategory] = useState('Все');

  const upd = <K extends keyof SubState>(field: K, value: SubState[K]) =>
    setS(prev => ({ ...prev, [field]: value }));

  const applyTemplate = (id: string) => {
    const t = SUBTITLE_TEMPLATES.find(t => t.id === id);
    if (!t) return;
    setS(prev => ({
      ...prev,
      subtitleTemplate: id,
      subtitleFont: t.font,
      subtitleSize: t.size,
      subtitleColor: t.color,
      subtitleStroke: t.stroke,
      subtitleStrokeWidth: t.strokeWidth,
    }));
  };

  const handleRebuild = async () => {
    setIsRebuilding(true);
    setError(null);
    try {
      const resp = await fetch(`/api/job/${jobId}/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captionSettings: toCaptionSettings(s) }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      onRebuildDone(data.jobId || jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRebuilding(false);
    }
  };

  const FONT_CATEGORIES = ['Все', 'Гротеск', 'Дисплейный', 'Техно', 'Декоративный'];
  const filteredFonts = SUBTITLE_FONTS.filter(f => {
    const matchCat = fontCategory === 'Все' || f.category === fontCategory;
    const matchSearch = f.name.toLowerCase().includes(fontSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    // Full-height editor — no outer scroll
    <div className="flex flex-col h-full" style={{ minHeight: 0, position: 'relative' }}>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl bg-secondary border border-border mb-3 shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[11px] font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable tab content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3" style={{ minHeight: 0 }}>
          <AnimatePresence mode="wait">

            {/* ── Template tab ── */}
            {activeTab === 'template' && (
              <motion.div key="template"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
              >
                <div className="grid grid-cols-3 gap-2">
                  {SUBTITLE_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => applyTemplate(t.id)}
                      className={`relative p-3 rounded-xl border-2 transition-all text-center ${
                        s.subtitleTemplate === t.id
                          ? 'border-primary ring-1 ring-primary/50'
                          : 'border-border hover:border-primary/40'
                      }`}
                      style={{ background: t.preview.bg }}
                    >
                      {s.subtitleTemplate === t.id && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      <span style={{ ...t.preview.textStyle as React.CSSProperties, fontSize: '15px' }}>Aa</span>
                      <p className="text-[10px] text-zinc-400 mt-1.5 leading-none">{t.label}</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Font tab ── */}
            {activeTab === 'font' && (
              <motion.div key="font"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* Font selector button */}
                <button onClick={() => setFontPickerOpen(true)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Type className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span style={{ fontFamily: `'${s.subtitleFont}', sans-serif`, fontWeight: 700 }} className="text-sm">
                      {s.subtitleFont}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">Изменить →</span>
                </button>

                <Slider label="Размер шрифта" value={s.subtitleSize} min={24} max={72} step={2} unit="px"
                  onChange={v => upd('subtitleSize', v)} />
                <Slider label="Толщина обводки" value={s.subtitleStrokeWidth} min={0} max={8} step={0.5}
                  onChange={v => upd('subtitleStrokeWidth', v)} />

                <div className="space-y-2 pt-1 border-t border-border">
                  <ColorRow label="Цвет текста" value={s.subtitleColor}
                    onChange={v => upd('subtitleColor', v)} />
                  <ColorRow label="Цвет обводки" value={s.subtitleStroke}
                    onChange={v => upd('subtitleStroke', v)} />
                </div>
              </motion.div>
            )}

            {/* ── Position tab ── */}
            {activeTab === 'position' && (
              <motion.div key="position"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Вертикаль</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['top', 'center', 'bottom'] as const).map(v => (
                      <button key={v} onClick={() => upd('subtitlePosition', v)}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-all ${
                          s.subtitlePosition === v
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary hover:border-primary/40'
                        }`}
                      >
                        {v === 'top'    && <AlignStartVertical  className="w-4 h-4" />}
                        {v === 'center' && <AlignCenterVertical className="w-4 h-4" />}
                        {v === 'bottom' && <AlignEndVertical    className="w-4 h-4" />}
                        {v === 'top' ? 'Верх' : v === 'center' ? 'Центр' : 'Низ'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Горизонталь</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['left', 'center', 'right'] as const).map(v => (
                      <button key={v} onClick={() => upd('subtitleAlign', v)}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-all ${
                          s.subtitleAlign === v
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary hover:border-primary/40'
                        }`}
                      >
                        {v === 'left'   && <AlignLeft   className="w-4 h-4" />}
                        {v === 'center' && <AlignCenter className="w-4 h-4" />}
                        {v === 'right'  && <AlignRight  className="w-4 h-4" />}
                        {v === 'left' ? 'Лево' : v === 'center' ? 'Центр' : 'Право'}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Background tab ── */}
            {activeTab === 'background' && (
              <motion.div key="background"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary">
                  <span className="text-sm font-medium">Фон под текстом</span>
                  <button
                    onClick={() => upd('subtitleBgOpacity', s.subtitleBgOpacity > 0 ? 0 : 0.6)}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                      s.subtitleBgOpacity > 0 ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                      s.subtitleBgOpacity > 0 ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>

                <AnimatePresence>
                  {s.subtitleBgOpacity > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-3"
                    >
                      <ColorRow label="Цвет фона" value={s.subtitleBgColor}
                        onChange={v => upd('subtitleBgColor', v)} />
                      <Slider label="Прозрачность" value={Math.round(s.subtitleBgOpacity * 100)}
                        min={10} max={100} unit="%" onChange={v => upd('subtitleBgOpacity', v / 100)} />
                      <Slider label="Скругление углов" value={s.subtitleBgRadius}
                        min={0} max={50} unit="%" onChange={v => upd('subtitleBgRadius', v)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive shrink-0">
            {error}
          </div>
        )}

        {/* Action buttons — always visible at bottom */}
        <div className="flex gap-2 mt-3 shrink-0">
          <Button onClick={handleRebuild} disabled={isRebuilding}
            className="flex-1 gap-1.5 gradient-primary text-primary-foreground hover:opacity-90 glow-primary"
            size="sm"
          >
            {isRebuilding
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Применяю…</>
              : <><RotateCcw className="w-3.5 h-3.5" />Применить</>
            }
          </Button>
          <Button variant="outline" onClick={onDownload} size="sm" className="gap-1.5 shrink-0">
            <Download className="w-3.5 h-3.5" />Скачать
          </Button>
        </div>

      {/* ── Font Picker Modal ── */}
      <AnimatePresence>
        {fontPickerOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setFontPickerOpen(false)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              style={{ maxHeight: '80vh' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <h3 className="font-bold">Выбрать шрифт</h3>
                <button onClick={() => setFontPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-4 pt-3 pb-2 shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input value={fontSearch} onChange={e => setFontSearch(e.target.value)}
                    placeholder="Поиск шрифта…"
                    className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/60" />
                </div>
              </div>

              <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto shrink-0">
                {FONT_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setFontCategory(cat)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      fontCategory === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >{cat}</button>
                ))}
              </div>

              <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-0.5">
                {filteredFonts.map(f => (
                  <button key={f.name}
                    onClick={() => { upd('subtitleFont', f.name); setFontPickerOpen(false); setFontSearch(''); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left ${
                      s.subtitleFont === f.name
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-secondary'
                    }`}
                  >
                    <span style={{ fontFamily: `'${f.name}', sans-serif`, fontWeight: f.weight }} className="text-base">
                      {f.name}
                    </span>
                    {s.subtitleFont === f.name && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
                {filteredFonts.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">Шрифты не найдены</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SubtitleEditor;
