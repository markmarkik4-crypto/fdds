import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SUBTITLE_TEMPLATES, SUBTITLE_FONTS } from '@/lib/wizard-data';
import type { WizardState } from '@/lib/wizard-data';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

interface Props {
  state: WizardState;
  onChange: (field: string, value: string | number) => void;
}

const PREVIEW_TEXT: Record<string, string> = {
  ru: 'Это пример субтитров',
  en: 'This is a subtitle preview',
  uk: 'Це приклад субтитрів',
  es: 'Esta es una vista previa',
  de: 'Dies ist eine Vorschau',
  fr: "C'est un aperçu",
  pt: 'Esta é uma pré-visualização',
  ar: 'هذا معاينة الترجمة',
  zh: '这是字幕预览',
  ja: 'これは字幕のプレビューです',
  ko: '이것은 자막 미리보기입니다',
};

const CATEGORY_ORDER = ['Гротеск', 'Дисплейный', 'Техно', 'Декоративный'];

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">{children}</span>
);

const Row = ({ label, value, children }: { label: string; value?: string | number; children: React.ReactNode }) => (
  <div className="space-y-0.5">
    <div className="flex justify-between items-center">
      <Lbl>{label}</Lbl>
      {value !== undefined && <span className="text-[9px] text-muted-foreground tabular-nums">{value}</span>}
    </div>
    {children}
  </div>
);

const StepSubtitles = ({ state, onChange }: Props) => {
  const isVertical = state.format === '9:16';
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Все');

  const applyTemplate = (templateId: string) => {
    const tpl = SUBTITLE_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    onChange('subtitleTemplate', tpl.id);
    onChange('subtitleFont', tpl.font);
    onChange('subtitleSize', tpl.size);
    onChange('subtitleColor', tpl.color);
    onChange('subtitleStroke', tpl.stroke);
    onChange('subtitleStrokeWidth', tpl.strokeWidth);
  };

  const posY =
    state.subtitlePosition === 'top' ? '15%' :
    state.subtitlePosition === 'center' ? '50%' : '85%';

  const filtered = SUBTITLE_FONTS.filter(f => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'Все' || f.category === activeCategory;
    return matchSearch && matchCat;
  });

  const currentFont = SUBTITLE_FONTS.find(f => f.name === state.subtitleFont);
  const categories = ['Все', ...CATEGORY_ORDER];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div>
        <h2 className="text-base font-bold font-heading leading-none">Субтитры</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">Настройте внешний вид</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">

        {/* ── Left: controls ── */}
        <div className="flex-1 space-y-2 min-w-0">

          {/* Templates */}
          <div className="space-y-1">
            <Lbl>Шаблон</Lbl>
            <div className="grid grid-cols-6 gap-0.5">
              {SUBTITLE_TEMPLATES.map(t => {
                const active = state.subtitleTemplate === t.id;
                const ps = { ...t.preview.textStyle };
                if (ps.fontSize) ps.fontSize = `${Math.max(parseFloat(String(ps.fontSize)) * 0.5, 8)}px`;
                if (ps.WebkitTextStroke) ps.WebkitTextStroke = String(ps.WebkitTextStroke).replace(/[\d.]+px/, m => `${parseFloat(m) * 0.5}px`);
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    className={`relative rounded overflow-hidden aspect-[2/1.2] flex items-center justify-center transition-all border-2 ${
                      active ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary))]' : 'border-transparent hover:border-border'
                    }`}
                    style={{ background: t.preview.bg }}
                  >
                    <span style={{ display: 'inline-block', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...ps } as React.CSSProperties}>
                      QUICK
                    </span>
                    {active && (
                      <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-primary flex items-center justify-center text-[6px] text-white font-bold">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font picker */}
          <button
            onClick={() => setFontPickerOpen(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg border border-border bg-secondary hover:border-primary/50 transition-all text-left group"
          >
            <span className="text-sm truncate flex-1" style={{ fontFamily: `'${state.subtitleFont}', sans-serif`, fontWeight: currentFont?.weight ?? 700 }}>
              {state.subtitleFont}
            </span>
            <span className="text-[9px] text-muted-foreground bg-muted px-1 py-0.5 rounded flex-shrink-0">{currentFont?.category ?? ''}</span>
            <svg className="w-3 h-3 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Size + Colors + Stroke in one compact row */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] gap-x-2 gap-y-0.5 items-end">
            <div className="col-span-2 space-y-0.5">
              <div className="flex justify-between"><Lbl>Размер</Lbl><span className="text-[9px] text-muted-foreground">{state.subtitleSize}px</span></div>
              <Slider value={[state.subtitleSize]} onValueChange={([v]) => onChange('subtitleSize', v)} min={24} max={72} step={2} />
            </div>
            <div className="space-y-0.5">
              <Lbl>Текст</Lbl>
              <Input type="color" value={state.subtitleColor} onChange={e => onChange('subtitleColor', e.target.value)} className="w-8 h-7 p-0.5 bg-secondary border-border cursor-pointer" />
            </div>
            <div className="space-y-0.5">
              <Lbl>Обводка</Lbl>
              <Input type="color" value={state.subtitleStroke} onChange={e => onChange('subtitleStroke', e.target.value)} className="w-8 h-7 p-0.5 bg-secondary border-border cursor-pointer" />
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between"><Lbl>Толщина</Lbl><span className="text-[9px] text-muted-foreground">{state.subtitleStrokeWidth}</span></div>
              <Slider value={[state.subtitleStrokeWidth]} onValueChange={([v]) => onChange('subtitleStrokeWidth', v)} min={0} max={6} step={1} />
            </div>
          </div>

          {/* Position + Align in one line */}
          <div className="flex gap-2 items-end">
            <div className="space-y-0.5">
              <Lbl>Позиция</Lbl>
              <div className="flex gap-0.5">
                {(['top', 'center', 'bottom'] as const).map(p => (
                  <button key={p} onClick={() => onChange('subtitlePosition', p)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${state.subtitlePosition === p ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary hover:border-primary/40'}`}>
                    {p === 'top' ? 'Верх' : p === 'center' ? 'Центр' : 'Низ'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-0.5">
              <Lbl>Выравнивание</Lbl>
              <div className="flex gap-0.5">
                {(['left', 'center', 'right'] as const).map(a => (
                  <button key={a} onClick={() => onChange('subtitleAlign', a)}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium border transition-all ${state.subtitleAlign === a ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary hover:border-primary/40'}`}>
                    {a === 'left' ? '←' : a === 'center' ? '↔' : '→'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Background block ── */}
          <div className="rounded-lg border border-border bg-secondary/30 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <Lbl>Фон субтитров</Lbl>
              <button
                onClick={() => onChange('subtitleBgOpacity', state.subtitleBgOpacity > 0 ? 0 : 0.8)}
                className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border transition-all ${state.subtitleBgOpacity > 0 ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${state.subtitleBgOpacity > 0 ? 'bg-primary' : 'bg-muted-foreground'}`} />
                {state.subtitleBgOpacity > 0 ? 'Вкл' : 'Выкл'}
              </button>
            </div>

            {/* Type cards */}
            <div className="flex gap-1.5">
              {([0, 50] as const).map(r => {
                const active = r === 0 ? state.subtitleBgRadius < 20 : state.subtitleBgRadius >= 20;
                return (
                  <button key={r} onClick={() => onChange('subtitleBgRadius', r)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md border-2 transition-all ${active ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:border-primary/40'}`}>
                    <div className="w-10 h-5 flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: 'rgba(90,90,90,0.85)', borderRadius: r === 0 ? '2px' : '10px' }}>
                      ABC
                    </div>
                    <span className="text-[8px] text-muted-foreground">{r === 0 ? 'Прямой' : 'Скруглённый'}</span>
                  </button>
                );
              })}
            </div>

            {/* Color + Opacity + Radius in one row */}
            <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-end">
              <div className="space-y-0.5">
                <Lbl>Цвет</Lbl>
                <Input type="color" value={state.subtitleBgColor} onChange={e => onChange('subtitleBgColor', e.target.value)} className="w-8 h-7 p-0.5 bg-secondary border-border cursor-pointer" />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between"><Lbl>Затемнение</Lbl><span className="text-[9px] text-muted-foreground">{Math.round(state.subtitleBgOpacity * 100)}%</span></div>
                <Slider value={[state.subtitleBgOpacity]} onValueChange={([v]) => onChange('subtitleBgOpacity', v)} min={0} max={1} step={0.05} />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between"><Lbl>Скругление</Lbl><span className="text-[9px] text-muted-foreground">{state.subtitleBgRadius}%</span></div>
                <Slider value={[state.subtitleBgRadius]} onValueChange={([v]) => onChange('subtitleBgRadius', v)} min={0} max={100} step={1} />
              </div>
            </div>

            {/* H/W/X/Y in 2×2 grid */}
            <div className="grid grid-cols-4 gap-1.5">
              <Row label="Высота" value={`${state.subtitleBgHeight}%`}>
                <Slider value={[state.subtitleBgHeight]} onValueChange={([v]) => onChange('subtitleBgHeight', v)} min={0} max={100} step={1} />
              </Row>
              <Row label="Ширина" value={`${state.subtitleBgWidth}%`}>
                <Slider value={[state.subtitleBgWidth]} onValueChange={([v]) => onChange('subtitleBgWidth', v)} min={0} max={100} step={1} />
              </Row>
              <Row label="Смещ. X" value={`${state.subtitleBgOffsetX}%`}>
                <Slider value={[state.subtitleBgOffsetX]} onValueChange={([v]) => onChange('subtitleBgOffsetX', v)} min={0} max={100} step={1} />
              </Row>
              <Row label="Смещ. Y" value={`${state.subtitleBgOffsetY}%`}>
                <Slider value={[state.subtitleBgOffsetY]} onValueChange={([v]) => onChange('subtitleBgOffsetY', v)} min={0} max={100} step={1} />
              </Row>
            </div>
          </div>

        </div>

        {/* ── Right: Phone preview — sticky, bigger ── */}
        <div className="flex justify-center lg:justify-end lg:self-start lg:sticky lg:top-4">
          <div className={`relative rounded-[2rem] border-2 border-border overflow-hidden shadow-2xl flex-shrink-0 bg-slate-900 ${
            isVertical ? 'w-[200px] h-[360px]' : 'w-[360px] h-[200px]'
          }`}>
            {/* notch */}
            {isVertical && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-background rounded-full z-10" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-700 to-slate-950" />

            {/* subtitle */}
            <div
              className="absolute z-10 whitespace-nowrap"
              style={{
                left: `${state.subtitleBgOffsetX}%`,
                top: posY,
                transform: 'translate(-50%, -50%)',
                textAlign: state.subtitleAlign,
              }}
            >
              {state.subtitleBgOpacity > 0 && (
                <div style={{
                  position: 'absolute',
                  top: `-${3 + state.subtitleBgHeight * 0.12}px`,
                  bottom: `-${3 + state.subtitleBgHeight * 0.12}px`,
                  left: `-${6 + state.subtitleBgWidth * 0.25}px`,
                  right: `-${6 + state.subtitleBgWidth * 0.25}px`,
                  borderRadius: `${state.subtitleBgRadius * 0.45}px`,
                  background: state.subtitleBgColor,
                  opacity: state.subtitleBgOpacity,
                }} />
              )}
              <span style={{
                position: 'relative',
                fontFamily: `'${state.subtitleFont}', sans-serif`,
                fontSize: `${state.subtitleSize * 0.33}px`,
                color: state.subtitleColor,
                WebkitTextStroke: state.subtitleStrokeWidth > 0 ? `${state.subtitleStrokeWidth * 0.33}px ${state.subtitleStroke}` : undefined,
                fontWeight: currentFont?.weight ?? 900,
                lineHeight: 1.3,
                textShadow: state.subtitleStrokeWidth === 0 ? '1px 1px 4px rgba(0,0,0,0.9)' : undefined,
              }}>
                {PREVIEW_TEXT[state.language] || PREVIEW_TEXT.en}
              </span>
            </div>

            {/* home indicator */}
            {isVertical && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 bg-white/20 rounded-full z-10" />
            )}
          </div>
        </div>

      </div>

      {/* ── Font Picker Modal ── */}
      <AnimatePresence>
        {fontPickerOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4"
            onClick={() => setFontPickerOpen(false)}
          >
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 24 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: 'min(82vh, 680px)' }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
                <div>
                  <h3 className="text-base font-bold tracking-tight">Шрифт</h3>
                  <p className="text-xs text-muted-foreground">{filtered.length} из {SUBTITLE_FONTS.length}</p>
                </div>
                <button onClick={() => setFontPickerOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary hover:bg-primary/20 transition-colors text-muted-foreground hover:text-foreground text-sm">✕</button>
              </div>
              <div className="px-5 pb-3 flex-shrink-0">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input autoFocus type="text" placeholder="Поиск шрифта..." value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground" />
                </div>
              </div>
              <div className="px-5 pb-3 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-none">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all ${activeCategory === cat ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground hover:border-primary/40'}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="overflow-y-auto flex-1 px-2 pb-4">
                {filtered.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground text-sm">Шрифт не найден</div>
                ) : (
                  filtered.map((f, i) => {
                    const active = state.subtitleFont === f.name;
                    return (
                      <motion.button key={f.name}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.012, duration: 0.18 }}
                        onClick={() => { onChange('subtitleFont', f.name); setFontPickerOpen(false); setSearch(''); }}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-left group ${active ? 'bg-primary/12 text-primary' : 'hover:bg-secondary/80 text-foreground'}`}
                      >
                        <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-bold transition-all ${active ? 'bg-primary text-white' : 'text-muted-foreground'}`}>
                          {active ? '✓' : ''}
                        </span>
                        <span className="flex-1 text-[22px] leading-tight truncate"
                          style={{ fontFamily: `'${f.name}', sans-serif`, fontWeight: f.weight, color: active ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}>
                          {f.name}
                        </span>
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">{f.category}</span>
                      </motion.button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StepSubtitles;
