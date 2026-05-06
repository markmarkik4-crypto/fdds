import { motion } from 'framer-motion';
import { STYLES } from '@/lib/wizard-data';
import { Check } from 'lucide-react';
import { t } from '@/lib/app-language';

interface Props {
  style: string;
  uiLanguage: string;
  onChange: (field: string, value: string) => void;
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

// Parse emoji from label like "🧙 Фэнтези" → { emoji: "🧙", name: "Фэнтези" }
function parseLabel(label: string): { emoji: string; name: string } {
  const m = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*(.+)$/u);
  if (m) return { emoji: m[1], name: m[2] };
  return { emoji: '🎨', name: label };
}

// Generate a rich gradient from the style's accent color
function makeGradient(color?: string): string {
  if (!color) return 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
  return `linear-gradient(135deg, ${color}33 0%, ${color}11 60%, transparent 100%)`;
}

const StepStyle = ({ style, uiLanguage, onChange }: Props) => {
  const text = t(uiLanguage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold font-heading mb-1">{text.visualStyle}</h2>
        <p className="text-sm text-muted-foreground">{text.visualStyleSubtitle}</p>
      </div>

      {/* Grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-2.5 flex-1"
      >
        {STYLES.map(s => {
          const selected = style === s.id;
          const { emoji, name } = parseLabel(s.label);
          const accentColor = s.color || '#6b7280';

          return (
            <motion.button
              key={s.id}
              variants={cardVariant}
              onClick={() => onChange('style', s.id)}
              className="relative overflow-hidden rounded-xl text-left transition-all duration-200"
              style={{
                border: selected
                  ? `2px solid ${accentColor}`
                  : '2px solid transparent',
                background: selected
                  ? `linear-gradient(145deg, ${accentColor}22 0%, ${accentColor}08 100%)`
                  : 'rgba(255,255,255,0.04)',
                boxShadow: selected
                  ? `0 0 0 1px ${accentColor}44, 0 4px 20px ${accentColor}22`
                  : '0 1px 3px rgba(0,0,0,0.3)',
              }}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Accent blob background */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: makeGradient(s.color),
                  opacity: selected ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}
              />

              {/* Color bar at top */}
              <div
                className="h-0.5 w-full"
                style={{
                  background: selected
                    ? `linear-gradient(90deg, ${accentColor}, ${accentColor}66)`
                    : `linear-gradient(90deg, ${accentColor}44, transparent)`,
                  transition: 'background 0.2s',
                }}
              />

              {/* Content */}
              <div className="relative px-3 py-2.5 flex items-center gap-2.5">
                {/* Emoji circle */}
                <div
                  className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                  style={{
                    background: `${accentColor}22`,
                    border: `1px solid ${accentColor}33`,
                  }}
                >
                  {emoji}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div
                    className="font-semibold text-sm leading-tight truncate"
                    style={{ color: selected ? accentColor : 'inherit' }}
                  >
                    {name}
                  </div>
                  {s.desc && (
                    <div className="text-xs text-muted-foreground mt-0.5 leading-tight truncate">
                      {s.desc}
                    </div>
                  )}
                </div>

                {/* Check mark */}
                {selected && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: accentColor }}
                  >
                    <Check size={11} className="text-white" strokeWidth={3} />
                  </motion.div>
                )}
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
};

export default StepStyle;
