import { Globe2 } from 'lucide-react';
import { LANGUAGES } from '@/lib/wizard-data';
import { t } from '@/lib/app-language';

interface Props {
  value: string;
  onChange: (language: string) => void;
}

const LanguageSwitcher = ({ value, onChange }: Props) => {
  const text = t(value);
  const languages = LANGUAGES.length > 0
    ? LANGUAGES
    : [
      { code: 'ru', label: 'Русский', flag: '🇷🇺' },
      { code: 'en', label: 'English', flag: '🇬🇧' },
    ];

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{text.language}</span>
      <Globe2 className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-border bg-secondary/80 pl-9 pr-8 text-sm font-medium text-foreground outline-none transition-all hover:border-primary/40 focus:border-primary"
        aria-label={text.language}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.flag ? `${language.flag} ` : ''}{language.label}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSwitcher;
