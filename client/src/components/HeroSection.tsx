import { motion } from 'framer-motion';
import { Zap, Sparkles } from 'lucide-react';
import { t } from '@/lib/app-language';

const HeroSection = ({ onStart, language }: { onStart: () => void; language: string }) => {
  const text = t(language);

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/15 blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-accent/10 blur-[100px] animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-medium mb-8"
        >
          <Zap className="w-3.5 h-3.5" />
          {text.heroBadge}
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-5xl md:text-7xl lg:text-8xl font-bold font-heading leading-[0.95] mb-6"
        >
          <span className="gradient-text">{text.heroTitleA}</span>
          <br />
          <span className="text-foreground">{text.heroTitleB}</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
        >
          {text.heroSubtitle}
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <button
            onClick={onStart}
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-bold gradient-primary text-primary-foreground glow-primary hover:opacity-90 transition-all"
          >
            <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            {text.heroStart}
          </button>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex justify-center gap-8 md:gap-12 mt-16 text-sm text-muted-foreground"
        >
          {[
            ['11', text.statLanguages],
            ['6', text.statVoices],
            ['14', text.statMusic],
            ['HD', text.statQuality],
          ].map(([num, label]) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold font-heading text-foreground">{num}</div>
              <div>{label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
