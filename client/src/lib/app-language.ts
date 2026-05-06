export const APP_LANGUAGE_STORAGE_KEY = 'vidrush_app_language';

export function getStoredAppLanguage() {
  try {
    return localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) || 'ru';
  } catch {
    return 'ru';
  }
}

export function storeAppLanguage(language: string) {
  try {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  } catch {}
}

export function uiLang(language: string) {
  return language === 'ru' ? 'ru' : 'en';
}

const TEXT = {
  ru: {
    myVideos: 'Мои видео',
    createVideo: 'Создать видео',
    language: 'Язык',
    heroBadge: 'AI-powered видеогенератор',
    heroTitleA: 'Создавай видео',
    heroTitleB: 'из текста за минуты',
    heroSubtitle: 'Опиши тему — получи готовое видео с озвучкой, субтитрами и фоновой музыкой. Всё делает AI.',
    heroStart: 'Начать создание',
    statLanguages: 'языков',
    statVoices: 'голосов',
    statMusic: 'стилей музыки',
    statQuality: 'качество',
    back: 'Назад',
    next: 'Далее',
    videoReady: 'Видео готово!',
    downloadOrNew: 'Скачайте или создайте новое',
    newVideo: 'Новое',
    download: 'Скачать',
    loading: 'Загрузка...',
    generate: 'Создать видео',
    generating: 'Генерация...',
    formatTitle: 'Формат и параметры',
    formatSubtitle: 'Настройте параметры видео',
    voiceLanguage: 'Язык озвучки',
    videoFormat: 'Формат видео',
    duration: 'Длительность',
    durationStrict: 'Итоговое видео будет собрано строго в выбранную длину',
    selected: 'Выбрано',
    ready: 'Всё готово!',
    checkSettings: 'Проверьте настройки и запустите генерацию',
    topic: 'Тема',
    details: 'Детали',
    storyStyle: 'Стиль истории',
    format: 'Формат',
    style: 'Стиль',
    music: 'Музыка',
    voice: 'Голос',
    subtitles: 'Субтитры',
    noMusic: 'Без музыки',
    random: 'Случайная',
    customPrompt: 'Свой промпт',
    noVideos: 'Пока нет видео',
    createFirst: 'Создайте первое видео в мастере',
    tryAgain: 'Попробовать снова',
    edit: 'Редакт.',
    delete: 'Удалить',
    justNow: 'Только что',
    minAgo: 'мин назад',
    hourAgo: 'ч назад',
    visualStyle: 'Визуальный стиль',
    visualStyleSubtitle: 'Как будут выглядеть кадры видео?',
    backgroundMusic: 'Фоновая музыка',
    musicSubtitle: 'Локальная библиотека royalty-free треков',
    voiceTitle: 'Голос озвучки',
    voiceSubtitle: 'Выберите голос — нажмите play для прослушивания',
    compatibleVoices: 'Показаны голоса, совместимые с выбранным языком, плюс универсальные',
  },
  en: {
    myVideos: 'My videos',
    createVideo: 'Create video',
    language: 'Language',
    heroBadge: 'AI-powered video generator',
    heroTitleA: 'Create videos',
    heroTitleB: 'from text in minutes',
    heroSubtitle: 'Describe a topic and get a ready video with voiceover, subtitles, and background music. AI handles everything.',
    heroStart: 'Start creating',
    statLanguages: 'languages',
    statVoices: 'voices',
    statMusic: 'music styles',
    statQuality: 'quality',
    back: 'Back',
    next: 'Next',
    videoReady: 'Video ready!',
    downloadOrNew: 'Download it or create a new one',
    newVideo: 'New',
    download: 'Download',
    loading: 'Loading...',
    generate: 'Create video',
    generating: 'Generating...',
    formatTitle: 'Format and settings',
    formatSubtitle: 'Configure video settings',
    voiceLanguage: 'Voiceover language',
    videoFormat: 'Video format',
    duration: 'Duration',
    durationStrict: 'The final video will be assembled to the selected length',
    selected: 'Selected',
    ready: 'Ready!',
    checkSettings: 'Review settings and start generation',
    topic: 'Topic',
    details: 'Details',
    storyStyle: 'Story style',
    format: 'Format',
    style: 'Style',
    music: 'Music',
    voice: 'Voice',
    subtitles: 'Subtitles',
    noMusic: 'No music',
    random: 'Random',
    customPrompt: 'Custom prompt',
    noVideos: 'No videos yet',
    createFirst: 'Create your first video in the wizard',
    tryAgain: 'Try again',
    edit: 'Edit',
    delete: 'Delete',
    justNow: 'Just now',
    minAgo: 'min ago',
    hourAgo: 'h ago',
    visualStyle: 'Visual style',
    visualStyleSubtitle: 'How should the video frames look?',
    backgroundMusic: 'Background music',
    musicSubtitle: 'Local royalty-free track library',
    voiceTitle: 'Voiceover voice',
    voiceSubtitle: 'Choose a voice — press play to preview',
    compatibleVoices: 'Showing voices compatible with the selected language plus universal voices',
  },
} as const;

export function t(language: string) {
  return TEXT[uiLang(language)];
}
