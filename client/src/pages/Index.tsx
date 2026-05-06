import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, Film } from 'lucide-react';
import HeroSection from '@/components/HeroSection';
import VideoWizard from '@/components/wizard/VideoWizard';
import VideoHistory from '@/components/VideoHistory';
import { loadConfig } from '@/lib/wizard-data';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { getStoredAppLanguage, storeAppLanguage, t } from '@/lib/app-language';

type View = 'home' | 'wizard' | 'history';
const VIEW_STORAGE_KEY = 'vidrush_view';

const Index = () => {
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      return saved === 'wizard' || saved === 'history' ? saved : 'home';
    } catch {
      return 'home';
    }
  });
  const [configReady, setConfigReady] = useState(false);
  const [appLanguage, setAppLanguage] = useState(getStoredAppLanguage);
  const wizardRef = useRef<HTMLDivElement>(null);
  const text = t(appLanguage);

  useEffect(() => {
    loadConfig().then(() => setConfigReady(true)).catch(() => setConfigReady(true));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {}
  }, [view]);

  const handleLanguageChange = (language: string) => {
    setAppLanguage(language);
    storeAppLanguage(language);
  };

  const handleStart = () => {
    setView('wizard');
    setTimeout(() => {
      wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className="min-h-screen relative z-10">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="container mx-auto flex items-center justify-between h-16 px-6">
          <button onClick={() => setView('home')} className="flex items-center gap-2 font-heading font-bold text-xl">
            <Zap className="w-5 h-5 text-primary" />
            <span className="gradient-text">VidRush</span>
          </button>
          <div className="flex items-center gap-2">
            <LanguageSwitcher value={appLanguage} onChange={handleLanguageChange} />
            {view !== 'history' && (
              <button
                onClick={() => setView('history')}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center gap-1.5"
              >
                <Film className="w-4 h-4" /> {text.myVideos}
              </button>
            )}
            {view !== 'wizard' && (
              <button
                onClick={handleStart}
                className="px-4 py-2 rounded-lg text-sm font-medium gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                {text.createVideo}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="relative z-10">
        {view === 'home' && <HeroSection onStart={handleStart} language={appLanguage} />}

        <div style={{ display: view === 'wizard' ? 'block' : 'none' }}>
          <div ref={wizardRef} className="pt-24 pb-16 px-6">
            {configReady && (
              <VideoWizard
                onDone={() => setView('history')}
                appLanguage={appLanguage}
                onLanguageChange={handleLanguageChange}
              />
            )}
          </div>
        </div>

        {view === 'history' && (
          <VideoHistory onBack={() => setView('home')} language={appLanguage} />
        )}
      </div>
    </div>
  );
};

export default Index;
