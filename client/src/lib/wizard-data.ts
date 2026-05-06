// Types matching server.js CONFIG structure
export interface SubTopicItem {
  id: string;
  label: string;
  desc?: string;
}

export interface TopicItem {
  id: string;
  emoji: string;
  label: string;
  subtopics?: SubTopicItem[];
  angles?: string[];
}

export interface StoryStyleItem {
  id: string;
  label: string;
  emoji: string;
  desc?: string;
}

export interface LangItem {
  code: string;
  label: string;
  flag?: string;
}

export interface FormatItem {
  id: string;
  label: string;
  desc?: string;
}

export interface DurationItem {
  id: string;
  label: string;
  sub?: string;
}

export interface StyleItem {
  id: string;
  label: string;
  desc?: string;
  color?: string;
  emoji?: string;
}

export interface MusicItem {
  id: string;
  label: string;
  genre?: string;
}

export interface VoiceItem {
  id: string;
  label: string;
  desc?: string;
  gender?: string;   // 'м' | 'ж'
  tag?: string;      // 'classic' | 'new' | 'edge'
  engine?: string;   // 'openai' | 'edge'
  lang?: string;     // language code for edge voices, e.g. 'ru'
  traits?: string[]; // up to 3 descriptive labels
}

export type CSSProps = Record<string, string | number | undefined>;

export interface SubtitleTemplate {
  id: string;
  label: string;
  font: string;
  fontWeight: number;
  size: number;
  color: string;
  stroke: string;
  strokeWidth: number;
  // CSS preview styles for the card
  preview: {
    bg: string;           // card background (CSS)
    textStyle: CSSProps;
  };
}

// Live data — loaded from /api/config at startup
export let TOPICS: TopicItem[] = [];
export let LANGUAGES: LangItem[] = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];
export let FORMATS: FormatItem[] = [];
export let DURATIONS: DurationItem[] = [];
export let STYLES: StyleItem[] = [];
export let MUSIC_TRACKS: MusicItem[] = [];
export let VOICES: VoiceItem[] = [];
export let STORY_STYLES: StoryStyleItem[] = [];

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.label === 'string') return obj.label;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.title === 'string') return obj.title;
    if (typeof obj.desc === 'string') return obj.desc;
    if (typeof obj.id === 'string') return obj.id;
  }
  return fallback;
}

function normalizeLang(item: unknown): LangItem | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const code = asText(obj.id || obj.code);
  const rawLabel = asText(obj.label);
  if (!code || !rawLabel) return null;
  const [maybeFlag = '', ...labelParts] = rawLabel.split(' ');
  const flag = /\p{Emoji}/u.test(maybeFlag) ? maybeFlag : '';
  const label = flag ? labelParts.join(' ').trim() : rawLabel;
  return { code, label: label || rawLabel, flag };
}

function normalizeSubTopic(item: unknown): SubTopicItem | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const id = asText(obj.id);
  const label = asText(obj.label);
  const desc = asText(obj.desc);
  if (!id || !label) return null;
  return { id, label, desc: desc || undefined };
}

function normalizeTopic(item: unknown): TopicItem | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const id = asText(obj.id);
  const label = asText(obj.label);
  if (!id || !label) return null;

  const emoji = asText(obj.emoji) || label.split(' ')[0] || '✨';
  const subtopics = Array.isArray(obj.subtopics)
    ? obj.subtopics.map(normalizeSubTopic).filter((entry): entry is SubTopicItem => entry !== null)
    : undefined;
  const angles = Array.isArray(obj.angles)
    ? obj.angles.map((angle) => asText(angle)).filter(Boolean)
    : undefined;

  return { id, emoji, label, subtopics, angles };
}

function normalizeStoryStyle(item: unknown): StoryStyleItem | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const id = asText(obj.id);
  const label = asText(obj.label);
  if (!id || !label) return null;

  return {
    id,
    label,
    emoji: asText(obj.emoji) || label.split(' ')[0] || '✨',
    desc: asText(obj.desc) || undefined,
  };
}

function normalizeFormat(item: unknown): FormatItem | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const id = asText(obj.id);
  const label = asText(obj.label);
  if (!id || !label) return null;
  return { id, label, desc: asText(obj.desc) || undefined };
}

function normalizeStyle(item: unknown): StyleItem | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const id = asText(obj.id);
  const label = asText(obj.label);
  if (!id || !label) return null;
  return {
    id,
    label,
    desc: asText(obj.desc) || undefined,
    color: asText(obj.color) || undefined,
    emoji: asText(obj.emoji) || undefined,
  };
}

function normalizeMusic(item: unknown): MusicItem | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const id = asText(obj.id);
  const label = asText(obj.label);
  if (!id || !label) return null;
  return { id, label, genre: asText(obj.genre) || undefined };
}

function normalizeVoice(item: unknown): VoiceItem | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const id = asText(obj.id);
  const label = asText(obj.label);
  if (!id || !label) return null;
  return {
    id,
    label,
    desc: asText(obj.desc) || undefined,
    gender: asText(obj.gender) || undefined,
    tag: asText(obj.tag) || undefined,
    engine: asText(obj.engine) || undefined,
    lang: asText(obj.lang) || undefined,
    traits: Array.isArray(obj.traits) ? obj.traits.map((trait) => asText(trait)).filter(Boolean) : undefined,
  };
}

export async function loadConfig() {
  const resp = await fetch('/api/config');
  const cfg = await resp.json();
  TOPICS = Array.isArray(cfg.themes)
    ? cfg.themes.map(normalizeTopic).filter((entry): entry is TopicItem => entry !== null)
    : [];
  STORY_STYLES = Array.isArray(cfg.storyStyles)
    ? cfg.storyStyles.map(normalizeStoryStyle).filter((entry): entry is StoryStyleItem => entry !== null)
    : [];
  LANGUAGES = Array.isArray(cfg.langs)
    ? cfg.langs.map(normalizeLang).filter((entry): entry is LangItem => entry !== null)
    : [
      { code: 'ru', label: 'Русский', flag: '🇷🇺' },
      { code: 'en', label: 'English', flag: '🇬🇧' },
    ];
  FORMATS = Array.isArray(cfg.formats)
    ? cfg.formats.map(normalizeFormat).filter((entry): entry is FormatItem => entry !== null)
    : [];
  DURATIONS = cfg.durations?.map((d: { id: number; label: string; sub?: string }) => ({
    id: asText(d?.id),
    label: asText(d?.label),
    sub: asText(d?.sub) || undefined,
  })) || [];
  STYLES = Array.isArray(cfg.styles)
    ? cfg.styles.map(normalizeStyle).filter((entry): entry is StyleItem => entry !== null)
    : [];
  MUSIC_TRACKS = Array.isArray(cfg.music)
    ? cfg.music.map(normalizeMusic).filter((entry): entry is MusicItem => entry !== null)
    : [];
  VOICES = Array.isArray(cfg.voices)
    ? cfg.voices.map(normalizeVoice).filter((entry): entry is VoiceItem => entry !== null)
    : [];
}

export interface SubtitleFont {
  name: string;       // Display name & CSS fontFamily
  weight: number;     // font-weight to use in preview
  category: string;   // Tag for grouping
}

export const SUBTITLE_TEMPLATES: SubtitleTemplate[] = [
  {
    id: 'bold_white',
    label: 'Bold',
    font: 'Anton', fontWeight: 400, size: 52,
    color: '#FFFFFF', stroke: '#000000', strokeWidth: 4,
    preview: {
      bg: '#111111',
      textStyle: {
        fontFamily: "'Anton', sans-serif", fontWeight: 400, fontSize: '28px',
        color: '#FFFFFF',
        WebkitTextStroke: '2px #000000',
        letterSpacing: '1px',
      },
    },
  },
  {
    id: 'yellow_outline',
    label: 'Yellow',
    font: 'Oswald', fontWeight: 700, size: 54,
    color: '#FFE600', stroke: '#000000', strokeWidth: 4,
    preview: {
      bg: '#0a0a0a',
      textStyle: {
        fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: '26px',
        color: '#FFE600',
        WebkitTextStroke: '2.5px #000000',
        letterSpacing: '2px',
        textTransform: 'uppercase',
      },
    },
  },
  {
    id: 'white_outline_italic',
    label: 'Italic',
    font: 'Montserrat', fontWeight: 900, size: 48,
    color: '#FFFFFF', stroke: '#000000', strokeWidth: 5,
    preview: {
      bg: '#0d0d0d',
      textStyle: {
        fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: '22px',
        color: '#FFFFFF',
        WebkitTextStroke: '2px #000000',
        fontStyle: 'italic',
      },
    },
  },
  {
    id: 'neon_green',
    label: 'Neon',
    font: 'Rubik', fontWeight: 900, size: 46,
    color: '#00FF88', stroke: '#000000', strokeWidth: 2,
    preview: {
      bg: '#060606',
      textStyle: {
        fontFamily: "'Rubik', sans-serif", fontWeight: 900, fontSize: '24px',
        color: '#00FF88',
        textShadow: '0 0 12px #00FF88, 0 0 30px #00FF8855',
      },
    },
  },
  {
    id: 'purple_highlight',
    label: 'Highlight',
    font: 'Poppins', fontWeight: 900, size: 44,
    color: '#FFFFFF', stroke: '#000000', strokeWidth: 0,
    preview: {
      bg: '#111111',
      textStyle: {
        fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: '20px',
        color: '#FFFFFF',
        background: 'linear-gradient(135deg,#7B2FBE,#E040FB)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      },
    },
  },
  {
    id: 'fire_orange',
    label: 'Fire',
    font: 'Bebas Neue', fontWeight: 400, size: 58,
    color: '#FF6B00', stroke: '#8B1A00', strokeWidth: 3,
    preview: {
      bg: '#0a0a0a',
      textStyle: {
        fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400, fontSize: '30px',
        color: '#FF6B00',
        WebkitTextStroke: '1.5px #8B1A00',
        textShadow: '0 0 20px #FF400055',
        letterSpacing: '3px',
      },
    },
  },
  {
    id: 'minimal_light',
    label: 'Minimal',
    font: 'Manrope', fontWeight: 800, size: 38,
    color: '#FFFFFF', stroke: '#000000', strokeWidth: 0,
    preview: {
      bg: '#181818',
      textStyle: {
        fontFamily: "'Manrope', sans-serif", fontWeight: 300, fontSize: '18px',
        color: '#FFFFFF',
        letterSpacing: '4px',
        textTransform: 'uppercase',
      },
    },
  },
  {
    id: 'shadow_drop',
    label: 'Shadow',
    font: 'Raleway', fontWeight: 900, size: 50,
    color: '#FFFFFF', stroke: '#000000', strokeWidth: 0,
    preview: {
      bg: '#0f0f0f',
      textStyle: {
        fontFamily: "'Raleway', sans-serif", fontWeight: 900, fontSize: '24px',
        color: '#FFFFFF',
        textShadow: '4px 4px 0px #000000, 6px 6px 0px #333333',
      },
    },
  },
  {
    id: 'retro_caption',
    label: 'Retro',
    font: 'Teko', fontWeight: 700, size: 56,
    color: '#F5E642', stroke: '#000000', strokeWidth: 0,
    preview: {
      bg: '#1a0a00',
      textStyle: {
        fontFamily: "'Teko', sans-serif", fontWeight: 700, fontSize: '30px',
        color: '#F5E642',
        textShadow: '2px 2px 0 #CC3300',
        letterSpacing: '2px',
        textTransform: 'uppercase',
      },
    },
  },
  {
    id: 'pill_dark',
    label: 'Pill',
    font: 'Jost', fontWeight: 900, size: 44,
    color: '#FFFFFF', stroke: '#000000', strokeWidth: 0,
    preview: {
      bg: '#111111',
      textStyle: {
        fontFamily: "'Jost', sans-serif", fontWeight: 900, fontSize: '20px',
        color: '#FFFFFF',
        background: 'rgba(255,255,255,0.12)',
        padding: '4px 14px',
        borderRadius: '20px',
        backdropFilter: 'blur(4px)',
      },
    },
  },
  {
    id: 'cyan_glow',
    label: 'Cyber',
    font: 'Orbitron', fontWeight: 900, size: 38,
    color: '#00E5FF', stroke: '#000000', strokeWidth: 0,
    preview: {
      bg: '#050510',
      textStyle: {
        fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: '16px',
        color: '#00E5FF',
        textShadow: '0 0 8px #00E5FF, 0 0 20px #00E5FF66',
        letterSpacing: '2px',
      },
    },
  },
  {
    id: 'handwritten',
    label: 'Hand',
    font: 'Neucha', fontWeight: 400, size: 42,
    color: '#FFFFFF', stroke: '#333333', strokeWidth: 1,
    preview: {
      bg: '#141414',
      textStyle: {
        fontFamily: "'Neucha', cursive", fontWeight: 400, fontSize: '22px',
        color: '#FFFFFF',
        textShadow: '1px 1px 3px #00000088',
        transform: 'rotate(-1deg)',
      },
    },
  },
];

export const SUBTITLE_FONTS: SubtitleFont[] = [
  // ── Гротески / Sans-serif ────────────────────────────────
  { name: 'Montserrat',          weight: 900, category: 'Гротеск' },
  { name: 'Manrope',             weight: 800, category: 'Гротеск' },
  { name: 'Inter',               weight: 900, category: 'Гротеск' },
  { name: 'Jost',                weight: 900, category: 'Гротеск' },
  { name: 'Nunito',              weight: 900, category: 'Гротеск' },
  { name: 'Rubik',               weight: 900, category: 'Гротеск' },
  { name: 'Raleway',             weight: 900, category: 'Гротеск' },
  { name: 'Roboto',              weight: 900, category: 'Гротеск' },
  { name: 'Poppins',             weight: 900, category: 'Гротеск' },
  { name: 'Fira Sans',           weight: 900, category: 'Гротеск' },
  { name: 'PT Sans',             weight: 700, category: 'Гротеск' },
  { name: 'Golos Text',          weight: 900, category: 'Гротеск' },
  { name: 'Exo 2',               weight: 900, category: 'Гротеск' },
  { name: 'Comfortaa',           weight: 700, category: 'Гротеск' },
  { name: 'Ubuntu',              weight: 700, category: 'Гротеск' },
  { name: 'Barlow',              weight: 900, category: 'Гротеск' },
  { name: 'Lato',                weight: 900, category: 'Гротеск' },
  { name: 'Work Sans',           weight: 900, category: 'Гротеск' },
  { name: 'Mulish',              weight: 900, category: 'Гротеск' },
  { name: 'Nunito Sans',         weight: 900, category: 'Гротеск' },
  { name: 'DM Sans',             weight: 900, category: 'Гротеск' },
  { name: 'Source Sans 3',       weight: 900, category: 'Гротеск' },
  { name: 'Noto Sans',           weight: 900, category: 'Гротеск' },
  { name: 'IBM Plex Sans',       weight: 700, category: 'Гротеск' },
  { name: 'Karla',               weight: 800, category: 'Гротеск' },
  { name: 'Cabin',               weight: 700, category: 'Гротеск' },
  { name: 'Quicksand',           weight: 700, category: 'Гротеск' },
  { name: 'Scada',               weight: 700, category: 'Гротеск' },
  { name: 'Cuprum',              weight: 700, category: 'Гротеск' },
  { name: 'Arimo',               weight: 700, category: 'Гротеск' },
  // ── Конденсированные / Display ──────────────────────────
  { name: 'Oswald',              weight: 700, category: 'Дисплейный' },
  { name: 'Bebas Neue',          weight: 400, category: 'Дисплейный' },
  { name: 'Anton',               weight: 400, category: 'Дисплейный' },
  { name: 'Russo One',           weight: 400, category: 'Дисплейный' },
  { name: 'Tektur',              weight: 900, category: 'Дисплейный' },
  { name: 'Teko',                weight: 700, category: 'Дисплейный' },
  { name: 'Barlow Condensed',    weight: 900, category: 'Дисплейный' },
  { name: 'Saira Condensed',     weight: 900, category: 'Дисплейный' },
  { name: 'Rajdhani',            weight: 700, category: 'Дисплейный' },
  { name: 'Saira',               weight: 900, category: 'Дисплейный' },
  { name: 'Libre Franklin',      weight: 900, category: 'Дисплейный' },
  { name: 'Righteous',           weight: 400, category: 'Дисплейный' },
  { name: 'Secular One',         weight: 400, category: 'Дисплейный' },
  // ── Технические / Sci-Fi ─────────────────────────────────
  { name: 'Orbitron',            weight: 900, category: 'Техно' },
  { name: 'Michroma',            weight: 400, category: 'Техно' },
  { name: 'Chakra Petch',        weight: 700, category: 'Техно' },
  { name: 'Share Tech',          weight: 400, category: 'Техно' },
  // ── Декоративный / Рукописный ────────────────────────────
  { name: 'Neucha',              weight: 400, category: 'Декоративный' },
  { name: 'Pacifico',            weight: 400, category: 'Декоративный' },
  { name: 'Lobster',             weight: 400, category: 'Декоративный' },
];

// Backward compat: flat array of font names for code that uses strings
export const SUBTITLE_FONT_NAMES: string[] = SUBTITLE_FONTS.map(f => f.name);

export interface WizardState {
  promptMode: 'genre' | 'custom';
  topic: string | null;
  angle: string | null;
  subtopic: string | null;
  storyStyle: string;
  topicDetails: string;
  promptPreview: string;
  customPrompt: string;
  language: string;
  format: string;
  duration: string;
  style: string;
  music: string | null;
  voice: string;
  ttsSpeed: number;
  ttsInstructions: string;
  subtitleTemplate: string;
  subtitleFont: string;
  subtitleSize: number;
  subtitleColor: string;
  subtitleStroke: string;
  subtitleStrokeWidth: number;
  subtitlePosition: 'top' | 'center' | 'bottom';
  subtitleAlign: 'left' | 'center' | 'right';
  subtitleBgColor: string;
  subtitleBgOpacity: number;
  subtitleBgRadius: number;
  subtitleBgHeight: number;
  subtitleBgWidth: number;
  subtitleBgOffsetX: number;
  subtitleBgOffsetY: number;
}

const SUBTITLE_KEYS: (keyof WizardState)[] = [
  'subtitleTemplate', 'subtitleFont', 'subtitleSize',
  'subtitleColor', 'subtitleStroke', 'subtitleStrokeWidth',
  'subtitlePosition', 'subtitleAlign',
  'subtitleBgColor', 'subtitleBgOpacity', 'subtitleBgRadius',
  'subtitleBgHeight', 'subtitleBgWidth', 'subtitleBgOffsetX', 'subtitleBgOffsetY',
];

const STORAGE_KEY = 'vidrush_subtitle_settings';

export function saveSubtitleSettings(state: WizardState) {
  const partial: Partial<WizardState> = {};
  for (const k of SUBTITLE_KEYS) partial[k] = state[k];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(partial)); } catch {}
}

export function loadSubtitleSettings(): Partial<WizardState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

export const DEFAULT_STATE: WizardState = {
  promptMode: 'genre',
  topic: null,
  angle: null,
  subtopic: null,
  storyStyle: 'intrigue',
  topicDetails: '',
  promptPreview: '',
  customPrompt: '',
  language: 'ru',
  format: '9:16',
  duration: '60',
  style: 'cinematic',
  music: null,
  voice: 'nova',
  ttsSpeed: 1.0,
  ttsInstructions: '',
  subtitleTemplate: 'bold_white',
  subtitleFont: 'Montserrat',
  subtitleSize: 48,
  subtitleColor: '#FFFFFF',
  subtitleStroke: '#000000',
  subtitleStrokeWidth: 3,
  subtitlePosition: 'bottom',
  subtitleAlign: 'center',
  subtitleBgColor: '#000000',
  subtitleBgOpacity: 0,
  subtitleBgRadius: 0,
  subtitleBgHeight: 25,
  subtitleBgWidth: 14,
  subtitleBgOffsetX: 50,
  subtitleBgOffsetY: 50,
};
