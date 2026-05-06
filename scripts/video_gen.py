#!/usr/bin/env python3
"""
Video Generation Pipeline (VidRush-style)
"""

import sys, os, json, subprocess, re, tempfile, random, uuid, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ── API keys ───────────────────────────────────────────────────────────────────
def load_env_value(name: str, default: str = "") -> str:
    value = os.environ.get(name, default)
    if value:
        return value
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return default


_api_key = load_env_value("OPENAI_API_KEY", "")
if len(sys.argv) > 1 and sys.argv[1] == "--api-key" and len(sys.argv) > 2:
    _api_key = sys.argv[2]
    sys.argv = [sys.argv[0]] + sys.argv[3:]

REPLICATE_API_TOKEN = load_env_value("REPLICATE_API_TOKEN", "")
REPLICATE_IMAGE_MODEL = load_env_value(
    "REPLICATE_IMAGE_MODEL", "black-forest-labs/flux-schnell"
)
HF_TOKEN = load_env_value("HF_TOKEN", "")
HF_IMAGE_MODEL = load_env_value("HF_IMAGE_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
TOGETHER_API_KEY = load_env_value("TOGETHER_API_KEY", "")
FAL_KEY = load_env_value("FAL_KEY", "")
PEXELS_API_KEY = load_env_value("PEXELS_API_KEY", "")
PIXABAY_API_KEY = load_env_value("PIXABAY_API_KEY", "")
GEMINI_API_KEY = load_env_value("GEMINI_API_KEY", "")
IMAGEN_MODEL = load_env_value("IMAGEN_MODEL", "imagen-4.0-ultra-generate-001")
IMAGEN_IMAGE_SIZE = load_env_value("IMAGEN_IMAGE_SIZE", "2K")
IMAGE_SOURCE_MODE = load_env_value("IMAGE_SOURCE_MODE", "ai").strip().lower()

if _api_key:
    os.environ["OPENAI_API_KEY"] = _api_key

# ── gTTS check (no API key needed) ────────────────────────────────────────────
try:
    from gtts import gTTS as _gTTS

    _gtts_available = True
except ImportError:
    _gtts_available = False

try:
    from openai import OpenAI

    client = OpenAI(api_key=_api_key) if _api_key else None
except Exception as e:
    print(f"OpenAI init failed: {e}", file=sys.stderr)
    client = None

try:
    from huggingface_hub import InferenceClient as HFInferenceClient

    hf_client = HFInferenceClient(api_key=HF_TOKEN) if HF_TOKEN else None
except Exception as e:
    print(f"HuggingFace init failed: {e}", file=sys.stderr)
    hf_client = None

_anthropic_key = load_env_value("ANTHROPIC_API_KEY", "")
try:
    from anthropic import Anthropic

    anthropic_client = Anthropic(api_key=_anthropic_key) if _anthropic_key else None
except Exception as e:
    print(f"Anthropic init failed: {e}", file=sys.stderr)
    anthropic_client = None

CLAUDE_MODEL = load_env_value("CLAUDE_MODEL", "claude-sonnet-4-6")

SCRIPTS_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPTS_DIR.parent
VOICES_DIR = PROJECT_ROOT / "voices"

# ─── Constants ─────────────────────────────────────────────────────────────────

THEMES = {
    "health": "Health & Wellness",
    "finance": "Personal Finance",
    "entertainment": "Entertainment",
    "education": "Education",
    "food": "Cooking & Recipes",
    "travel": "Travel",
    "technology": "Technology",
    "history": "History",
    "military": "Military History",
    "sports": "Sports",
    "politics": "Politics",
    "business": "Business",
    "science": "Science",
    "environment": "Environment",
}

LANG_PROMPTS = {
    "en": "in English",
    "ru": "на русском языке",
    "uk": "українською",
    "es": "en español",
    "de": "auf Deutsch",
    "fr": "en français",
    "ar": "بالعربية",
    "zh": "на китайском",
    "ja": "на японском",
    "ko": "на корейском",
    "pt": "em português",
}

LANG_VOICE_MAP = {
    "ru": "ru-RU",
    "uk": "uk-UA",
    "en": "en-US",
    "es": "es-ES",
    "de": "de-DE",
    "fr": "fr-FR",
    "ar": "ar-XA",
    "zh": "zh-CN",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "pt": "pt-BR",
}

VOICE_PREVIEW_TEXT = {
    "ru": "Привет. Это тест озвучки для вашего видео.",
    "uk": "Привіт. Це тест озвучення для вашого відео.",
    "en": "Hello. This is a voice preview for your video.",
    "es": "Hola. Esta es una prueba de voz para tu video.",
    "de": "Hallo. Dies ist eine Sprachprobe für dein Video.",
    "fr": "Bonjour. Ceci est un aperçu de voix pour votre vidéo.",
    "ar": "مرحباً. هذا نموذج صوتي للفيديو الخاص بك.",
    "zh": "你好。这是你的视频语音预览。",
    "ja": "こんにちは。これは動画用の音声プレビューです。",
    "ko": "안녕하세요. 이것은 영상용 음성 미리듣기입니다.",
    "pt": "Olá. Esta é uma prévia de voz para o seu vídeo.",
}

OPENAI_TTS_VOICE = "alloy"  # overwritten by render_voice parameter

# ─── Caption styles per story_style ───────────────────────────────────────────
# Each story_style maps to its own visual caption personality.
# Keys match the storyStyles in server.js CONFIG.
CAPTION_STYLES = {
    # ── intrigue: красная pill, агрессивный Montserrat Black ─────────────────────
    "intrigue": {
        "fontFamily": "Montserrat Black",
        "fontSize": 58,
        "textColor": "#FFFFFF",
        "outlineColor": "#E63946",
        "outlineThickness": 0,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 110,
        "wordsPerChunk": 3,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#CC0022",
        "bubbleAlpha": 235,
        "bubbleRadius": 30,
        "bubblePadX": 40,
        "bubblePadY": 18,
    },
    # ── mystery: тёмно-фиолетовая pill, Rubik ExtraBold ──────────────────────────
    "mystery": {
        "fontFamily": "Rubik ExtraBold",
        "fontSize": 54,
        "textColor": "#F0E6FF",
        "outlineColor": "#6A0DAD",
        "outlineThickness": 0,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 110,
        "wordsPerChunk": 3,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#2D0050",
        "bubbleAlpha": 225,
        "bubbleRadius": 28,
        "bubblePadX": 38,
        "bubblePadY": 16,
    },
    # ── shock: яркий красный прямоугольник, Oswald Bold — острые углы ────────────
    "shock": {
        "fontFamily": "Oswald Bold",
        "fontSize": 72,
        "textColor": "#FFFFFF",
        "outlineColor": "#FF2D00",
        "outlineThickness": 0,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 110,
        "wordsPerChunk": 2,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#DD2200",
        "bubbleAlpha": 245,
        "bubbleRadius": 12,
        "bubblePadX": 32,
        "bubblePadY": 14,
    },
    # ── mystic: тёмно-синяя pill, Raleway Black ───────────────────────────────────
    "mystic": {
        "fontFamily": "Raleway Black",
        "fontSize": 54,
        "textColor": "#D6EEFF",
        "outlineColor": "#003366",
        "outlineThickness": 0,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 110,
        "wordsPerChunk": 3,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#071A3E",
        "bubbleAlpha": 215,
        "bubbleRadius": 34,
        "bubblePadX": 40,
        "bubblePadY": 18,
    },
    # ── paradox: изумрудная pill, Manrope ExtraBold ───────────────────────────────
    "paradox": {
        "fontFamily": "Manrope ExtraBold",
        "fontSize": 56,
        "textColor": "#FFFFFF",
        "outlineColor": "#00AA88",
        "outlineThickness": 0,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 110,
        "wordsPerChunk": 3,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#004236",
        "bubbleAlpha": 225,
        "bubbleRadius": 32,
        "bubblePadX": 40,
        "bubblePadY": 16,
    },
    # ── cliffhanger: оранжевая pill, Jost ExtraBold ───────────────────────────────
    "cliffhanger": {
        "fontFamily": "Jost ExtraBold",
        "fontSize": 60,
        "textColor": "#FFFFFF",
        "outlineColor": "#FF8C00",
        "outlineThickness": 0,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 110,
        "wordsPerChunk": 2,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#6B2F00",
        "bubbleAlpha": 235,
        "bubbleRadius": 30,
        "bubblePadX": 40,
        "bubblePadY": 18,
    },
    # ── horror: кроваво-красная pill, Creepster для максимального ужаса ───────────
    "horror": {
        "fontFamily": "Creepster",
        "fontSize": 64,
        "textColor": "#FF0000",
        "outlineColor": "#8B0000",
        "outlineThickness": 3,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 115,
        "wordsPerChunk": 2,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#1A0000",
        "bubbleAlpha": 240,
        "bubbleRadius": 8,
        "bubblePadX": 30,
        "bubblePadY": 12,
    },
    # ── adventure: золотая bold pill, Righteous для энергии ───────────────────────
    "adventure": {
        "fontFamily": "Righteous",
        "fontSize": 62,
        "textColor": "#FFD700",
        "outlineColor": "#8B4513",
        "outlineThickness": 2,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 110,
        "wordsPerChunk": 3,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#1A1200",
        "bubbleAlpha": 230,
        "bubbleRadius": 26,
        "bubblePadX": 38,
        "bubblePadY": 16,
    },
    # Fallback for image styles (not story styles)
    "_default": {
        "fontFamily": "Montserrat Bold",
        "fontSize": 52,
        "textColor": "#FFFFFF",
        "outlineColor": "#000000",
        "outlineThickness": 0,
        "gradientColors": None,
        "verticalPosition": "bottom",
        "verticalMargin": 100,
        "wordsPerChunk": 3,
        "showBackground": False,
        "bubble": True,
        "bubbleColor": "#1A1A1A",
        "bubbleAlpha": 200,
        "bubbleRadius": 24,
        "bubblePadX": 32,
        "bubblePadY": 14,
    },
}

# ─── Emoji auto-injection map ──────────────────────────────────────────────────
# Word → emoji suffix. Case-insensitive. First match wins per word.
EMOJI_KEYWORDS = {
    # emotions / reactions
    "шок": "😱",
    "невероятно": "🤯",
    "тайна": "🔮",
    "загадка": "🔮",
    "секрет": "🤫",
    "опасность": "⚠️",
    "смерть": "💀",
    "убийство": "🔪",
    "любовь": "❤️",
    "деньги": "💰",
    "богатство": "💎",
    "власть": "👑",
    "победа": "🏆",
    "война": "⚔️",
    "огонь": "🔥",
    "взрыв": "💥",
    "правда": "💡",
    "ложь": "🕵️",
    "заговор": "🕵️",
    "предательство": "🗡️",
    "странный": "👁️",
    "странно": "👁️",
    "странная": "👁️",
    "исчез": "👻",
    "исчезла": "👻",
    "исчез": "👻",
    "нашли": "🔍",
    "найден": "🔍",
    "нашла": "🔍",
    "золото": "🥇",
    "миллион": "💰",
    "миллиард": "💰",
    # EN keywords
    "secret": "🤫",
    "mystery": "🔮",
    "shocking": "😱",
    "shock": "😱",
    "dead": "💀",
    "death": "💀",
    "kill": "🔪",
    "murder": "🔪",
    "love": "❤️",
    "money": "💰",
    "rich": "💎",
    "power": "👑",
    "fire": "🔥",
    "explosion": "💥",
    "truth": "💡",
    "lie": "🕵️",
    "conspiracy": "🕵️",
    "betrayal": "🗡️",
    "strange": "👁️",
    "disappeared": "👻",
    "found": "🔍",
    "gold": "🥇",
    "million": "💰",
    "billion": "💰",
    "danger": "⚠️",
    "war": "⚔️",
    "victory": "🏆",
    "incredible": "🤯",
    "unbelievable": "🤯",
}


def add_emojis_to_text(text: str, max_per_chunk: int = 1) -> str:
    """
    Add a single relevant emoji at the end of a subtitle chunk if any
    keyword matches. Safe for all languages; falls back to no emoji.
    """
    words_lower = text.lower().split()
    for word in words_lower:
        clean = word.strip(".,!?;:\"'")
        if clean in EMOJI_KEYWORDS:
            return text.rstrip() + " " + EMOJI_KEYWORDS[clean]
    return text


# ─── Two-layer prompt system ───────────────────────────────────────────────────
# Each style has:
#   style_block  → visual style anchor (what kind of art this is)
#   lighting     → lighting setup for this style
#   camera       → default camera/lens for this style
#   quality_tags → always-appended quality modifiers

STYLE_LAYER = {
    "fantasy": {
        # DALL-E style parameter: "natural" keeps non-photo styles from being overridden to realism
        "dall_e_style": "natural",
        # style_override = the MANDATORY opening phrase forced into every prompt
        "style_override": (
            "FANTASY ART ONLY — NOT a photograph, NOT realism, NOT anime. "
            "This image MUST look like award-winning fantasy concept art painted by a master illustrator."
        ),
        "style_block": "MASTERPIECE FANTASY CONCEPT ART — epic fantasy illustration, Greg Rutkowski style, Artstation trending, NOT a photograph",
        "lighting": "volumetric god-rays piercing through mystical fog, bioluminescent glow emanating from within, warm golden magical light",
        "camera": "wide establishing shot, 24mm lens, deep depth of field, cinematic fantasy composition",
        "quality_tags": "ultra detailed, 8k resolution, sharp focus, intricate magical textures, ethereal particles, glowing runes, fantasy atmosphere",
    },
    "cinematic": {
        "dall_e_style": "vivid",
        "style_override": (
            "CINEMATIC FILM STILL ONLY — NOT illustration, NOT anime, NOT fantasy. "
            "This image MUST look exactly like a frame from a major Hollywood movie."
        ),
        "style_block": "CINEMATIC MOVIE STILL — photorealistic film frame, shot on ARRI Alexa with anamorphic lens, Hollywood production quality",
        "lighting": "dramatic cinematic lighting, teal-orange color grade, single strong key light creating deep shadows, volumetric god-rays, anamorphic lens flare",
        "camera": "35mm anamorphic lens, shallow depth of field, creamy bokeh, rule of thirds, low dramatic angle",
        "quality_tags": "ultra detailed, photorealistic, 8k, authentic film grain, professional color grading, widescreen cinematic aspect",
    },
    "standard": {
        "dall_e_style": "vivid",
        "style_override": (
            "PREMIUM DIGITAL ILLUSTRATION ONLY — NOT a photograph, NOT anime. "
            "This image MUST look like award-winning editorial concept art."
        ),
        "style_block": "MASTERPIECE DIGITAL ILLUSTRATION — premium editorial concept art, professional digital painting, NOT a photograph",
        "lighting": "balanced studio lighting, soft directional light, subtle rim light, clean professional shadows",
        "camera": "50mm lens equivalent, medium shot, sharp focus, professional composition",
        "quality_tags": "ultra detailed, 8k resolution, sharp focus, vibrant colors, professional render quality",
    },
    "anime": {
        "dall_e_style": "natural",
        "style_override": (
            "JAPANESE ANIME ART STYLE ONLY — NOT a photograph, NOT western cartoon, NOT realism. "
            "This image MUST look exactly like a key visual from a Japanese animated film."
        ),
        "style_block": "ANIME KEY VISUAL — Studio Ghibli / Makoto Shinkai quality Japanese animation, hand-drawn cel-shaded art, NOT a photograph",
        "lighting": "soft diffused anime-style light, golden hour glow, volumetric light rays through foliage, atmospheric particles floating in air",
        "camera": "medium wide shot, dynamic anime composition, breathtaking painted background, dramatic sky framing",
        "quality_tags": "ultra detailed, sharp anime linework, smooth cel shading, vivid color palette, atmospheric depth, professional Japanese animation quality",
    },
    "horror_style": {
        "dall_e_style": "vivid",
        "style_override": (
            "PURE HORROR CINEMATIC ONLY — NOT cheerful, NOT fantasy adventure, NOT cartoon. "
            "This image MUST feel terrifying, disturbing, and psychologically oppressive like a prestige horror film frame."
        ),
        "style_block": "PRESTIGE HORROR FILM STILL — photorealistic dread, occult unease, unsettling realism, NOT illustration or anime",
        "lighting": "extreme low-key lighting, sickly practical light sources, deep black shadows, dirty red undertones, damp fog, harsh flashlight beams",
        "camera": "28mm or 50mm suspense framing, off-center composition, creeping negative space, shallow depth of field, handheld tension",
        "quality_tags": "ultra detailed, photorealistic, 8k, grim textures, unsettling atmosphere, realistic grime, cinematic horror production quality",
    },
    "illustration": {
        "dall_e_style": "natural",
        "style_override": (
            "FLAT VECTOR GRAPHIC DESIGN ONLY — NOT a photograph, NOT 3D render, NOT realism. "
            "This image MUST look like a premium graphic design poster with flat shapes and limited colors."
        ),
        "style_block": "FLAT VECTOR ILLUSTRATION — bold graphic design, Saul Bass poster style, modern editorial, NOT a photograph or 3D render",
        "lighting": "flat design, high-contrast color blocking, bold graphic shadows, clean poster aesthetic",
        "camera": "frontal composition, symmetrical layout, centered subject, premium poster framing",
        "quality_tags": "ultra clean vector quality, crisp edges, 4-5 color palette maximum, high contrast, premium brand design",
    },
    "monochrome": {
        "dall_e_style": "natural",
        "style_override": (
            "STRICTLY BLACK AND WHITE — absolutely NO color, NO sepia, NO tints. "
            "This image MUST be entirely in black, white, and grey tones only — like a silver gelatin print."
        ),
        "style_block": "BLACK AND WHITE FINE ART — silver gelatin print, film noir, zero color, grayscale only, Ansel Adams quality",
        "lighting": "dramatic chiaroscuro, single harsh directional light, pure deep blacks and pure whites, extreme tonal contrast",
        "camera": "85mm portrait lens, shallow depth of field, decisive moment, Henri Cartier-Bresson composition",
        "quality_tags": "ultra detailed, rich tonal range, sharp focus, authentic film grain, timeless B&W composition",
    },
    "moody": {
        "dall_e_style": "vivid",
        "style_override": (
            "DARK MOODY ATMOSPHERIC — NO bright colors, NO cheerful scenes. "
            "This image MUST feel oppressive, dark, and emotionally heavy with minimal light."
        ),
        "style_block": "DARK MOODY ATMOSPHERIC CINEMATIC — gothic darkness, desaturated teal and amber palette, heavy fog, oppressive atmosphere",
        "lighting": "extreme low-key lighting, single amber point light cutting through absolute darkness, heavy volumetric fog, wet reflective surfaces",
        "camera": "wide angle 28mm lens, low dramatic angle, claustrophobic framing, deep atmospheric perspective",
        "quality_tags": "ultra detailed, photorealistic, 8k, deeply desaturated, volumetric fog, teal-amber palette, dark cinematic quality",
    },
    "documentary": {
        "dall_e_style": "natural",
        "style_override": (
            "DOCUMENTARY PHOTOGRAPHY ONLY — NOT glossy fashion, NOT fantasy, NOT CGI, NOT painting. "
            "This image MUST look like a real frame from a serious historical or investigative documentary."
        ),
        "style_block": "DOCUMENTARY PHOTOJOURNALISM — grounded realism, authentic reportage, National Geographic / BBC documentary frame",
        "lighting": "natural available light, realistic cloud cover or indoor practicals, restrained contrast, honest colors, subtle atmospheric haze",
        "camera": "35mm documentary lens, observational composition, believable framing, real-world perspective, moderate depth of field",
        "quality_tags": "highly detailed, realistic textures, authentic environment, non-glamorous realism, historically grounded, editorial documentary quality",
    },
    "photography": {
        "dall_e_style": "vivid",
        "style_override": (
            "REAL PHOTOGRAPH ONLY — NOT illustration, NOT CGI, NOT painting. "
            "This image MUST look like an actual photo taken by a professional photographer."
        ),
        "style_block": "ULTRA-PREMIUM REAL PHOTOGRAPH — magazine cover quality, shot with professional camera, NOT an illustration or CGI",
        "lighting": "golden hour natural light from 45 degrees, catchlights in eyes, natural rim light, professional reflector fill",
        "camera": "85mm f/1.4 lens, shallow depth of field, beautiful bokeh, perfect exposure, sharp focus on subject",
        "quality_tags": "ultra realistic, 4K ultra HD, sharp focus, professional color grading, immaculate photographic detail",
    },
    "3d": {
        "dall_e_style": "vivid",
        "style_override": (
            "3D CGI RENDER ONLY — NOT a photograph, NOT 2D illustration, NOT anime. "
            "This image MUST look like a frame rendered in Unreal Engine 5 or Pixar RenderMan."
        ),
        "style_block": "HIGH-END 3D CGI RENDER — Unreal Engine 5 / Pixar quality, Octane render, physically-based materials, NOT a photograph",
        "lighting": "volumetric lighting, global illumination, god-rays, PBR materials with subsurface scattering, HDR environment reflections",
        "camera": "cinema lens, dynamic angle, depth of field, motion blur, professional VFX shot composition",
        "quality_tags": "ultra detailed, hyperrealistic 8k render, ray tracing, physically accurate PBR materials, AAA game cinematic quality",
    },
    "comic": {
        "dall_e_style": "natural",
        "style_override": (
            "COMIC BOOK ART ONLY — NOT a photograph, NOT anime, NOT painterly realism. "
            "This image MUST look like a premium graphic novel panel with bold inks and dramatic color blocking."
        ),
        "style_block": "GRAPHIC NOVEL PANEL — bold black ink lines, cel-shaded comic rendering, premium western comic art, NOT photography",
        "lighting": "high-contrast comic lighting, dramatic rim lights, stylized shadows, halftone texture accents, saturated print-ready palette",
        "camera": "dynamic panel composition, heroic foreshortening, dramatic perspective, impact framing, poster-like staging",
        "quality_tags": "ultra clean linework, strong silhouette design, bold color separation, crisp ink contours, premium comic-book finish",
    },
    "sci-fi": {
        "dall_e_style": "vivid",
        "style_override": (
            "SCI-FI CINEMATIC ONLY — NOT fantasy medieval, NOT generic modern realism, NOT flat illustration. "
            "This image MUST look like a high-budget futuristic science-fiction film frame."
        ),
        "style_block": "FUTURISTIC SCI-FI FILM STILL — advanced technology, sleek production design, photoreal cinematic futurism",
        "lighting": "cool blue and cyan practicals, neon magenta accents, holographic glow, volumetric haze, reflective metallic highlights",
        "camera": "anamorphic sci-fi framing, wide cinematic composition, precise perspective lines, controlled depth of field, epic scale",
        "quality_tags": "ultra detailed, photorealistic, 8k, futuristic interfaces, advanced materials, cinematic worldbuilding, premium sci-fi spectacle",
    },
    "retro": {
        "dall_e_style": "natural",
        "style_override": (
            "AUTHENTIC VINTAGE ANALOG PHOTOGRAPH — NOT modern, NOT digital, NOT clean. "
            "This image MUST look like an actual photo taken with film camera in the 1960s-1980s."
        ),
        "style_block": "RETRO VINTAGE ANALOG PHOTOGRAPH — Kodak Portra 400 film, 1970s aesthetic, authentic film imperfections, NOT digital",
        "lighting": "warm golden nostalgic light, venetian blind shadow stripes, soft window natural light, amber nostalgic glow",
        "camera": "vintage 50mm prime lens, slight soft focus, natural vignette, authentic film grain, light leak on edges",
        "quality_tags": "authentic heavy film grain, warm orange-amber color cast, slightly desaturated, nostalgic vintage atmosphere",
    },
}

# Universal quality modifiers appended to ALL prompts regardless of style
UNIVERSAL_QUALITY = (
    "ultra detailed, sharp focus, high resolution, professional composition, "
    "cinematic quality, dramatic atmosphere, visually striking"
)

# Camera shot variety — rotated per scene index to keep visual rhythm
CAMERA_SHOTS = [
    "wide establishing shot",
    "medium close-up shot",
    "low angle dramatic shot",
    "over-the-shoulder shot",
    "extreme close-up detail shot",
    "high angle overhead shot",
    "dutch angle tension shot",
]

STYLE_PROMPTS = {
    k: (f"{v['style_block']}. {v['lighting']}. {v['camera']}. {v['quality_tags']}.")
    for k, v in STYLE_LAYER.items()
}


def log(msg):
    print(msg, file=sys.stderr)


def progress(pct: int, step_text: str):
    """Print a progress line to stdout so server.js can parse it in real-time."""
    print(f"PROGRESS:{pct}:{step_text}", flush=True)


def split_total_duration(total_duration: int, scene_count: int):
    base = total_duration // scene_count
    rem = total_duration % scene_count
    return [base + (1 if i < rem else 0) for i in range(scene_count)]


LOCALIZED_SCRIPT_COPY = {
    "ru": {
        "title": "{topic}: короткая история",
        "templates": [
            ("Мало кто замечает, насколько необычна тема «{subject}».", "establishing shot of {subject}, atmospheric opening frame"),
            ("Сначала всё выглядело понятно, но детали быстро начали менять картину.", "close view of key details connected to {subject}, realistic environment"),
            ("Чем глубже смотреть, тем больше появляется неожиданных связей и скрытых причин.", "dramatic moment revealing hidden connections around {subject}"),
            ("Именно здесь возникает главный вопрос, который меняет восприятие всей истории.", "high-impact visual turning point for {subject}, strong composition"),
            ("Поэтому финал этой истории остаётся открытым: всё ли мы на самом деле понимаем?", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {
            "mystery": " В этой истории слишком много необъяснимого, чтобы считать это совпадением.",
            "shock": " Дальше история делает неожиданный и ломающий ожидания поворот.",
            "mystic": " Во всём происходящем чувствуется мистическая и почти сверхъестественная атмосфера.",
            "paradox": " Чем глубже вникаешь, тем сильнее чувствуется противоречие этой истории.",
            "cliffhanger": " И кажется, что самое важное в этой истории ещё впереди.",
            "horror": " Во всём этом нарастает страх, напряжение и явный дискомфорт.",
            "adventure": " Всё это звучит как риск, движение и настоящее открытие.",
        },
        "default_bias": " История с каждой деталью становится напряжённее и увлекательнее.",
        "strict_note": "Все видимые тексты должны быть только на русском языке.",
    },
    "en": {
        "title": "{topic}: short story",
        "templates": [
            ("Very few people realize how unusual the topic of {subject} really is.", "establishing shot of {subject}, atmospheric opening frame"),
            ("At first it seemed simple, but the details quickly changed the whole picture.", "close view of key details connected to {subject}, realistic environment"),
            ("The deeper you look, the more hidden causes and surprising links appear.", "dramatic moment revealing hidden connections around {subject}"),
            ("This is where the central question appears and changes the meaning of the story.", "high-impact visual turning point for {subject}, strong composition"),
            ("That is why the ending stays open: do we really understand all of it?", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {
            "mystery": " There is too much here that remains unexplained to ignore.",
            "shock": " The story is about to take a surprising turn that breaks expectations.",
            "mystic": " Everything here feels eerie, uncanny, and almost supernatural.",
            "paradox": " The deeper you look, the stronger the contradiction becomes.",
            "cliffhanger": " It already feels like the most important part is still ahead.",
            "horror": " A sense of dread and discomfort keeps building underneath every detail.",
            "adventure": " The whole story carries motion, discovery, and real risk.",
        },
        "default_bias": " With every detail, the story grows tenser and more gripping.",
        "strict_note": "All visible text must be strictly in English only.",
    },
    "uk": {
        "title": "{topic}: коротка історія",
        "templates": [
            ("Мало хто помічає, наскільки незвичною є тема «{subject}».", "establishing shot of {subject}, atmospheric opening frame"),
            ("Спочатку все здавалося зрозумілим, але деталі швидко змінили всю картину.", "close view of key details connected to {subject}, realistic environment"),
            ("Чим глибше дивишся, тим більше з’являється несподіваних зв’язків і прихованих причин.", "dramatic moment revealing hidden connections around {subject}"),
            ("Саме тут виникає головне питання, яке змінює сприйняття всієї історії.", "high-impact visual turning point for {subject}, strong composition"),
            ("Тому фінал цієї історії залишається відкритим: чи справді ми все розуміємо?", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {
            "mystery": " Додайте тривогу й відчуття нерозгаданої таємниці.",
            "shock": " Зробіть поворот несподіваним і руйнівним для очікувань.",
            "mystic": " Збережіть містичну та надприродну атмосферу.",
            "paradox": " Підкресліть суперечність і неможливу логіку.",
            "cliffhanger": " Завершуйте кожен фрагмент відчуттям, що головне попереду.",
            "horror": " Нарощуйте страх, напругу й дискомфорт.",
            "adventure": " Додайте рух, ризик і відчуття відкриття.",
        },
        "default_bias": " Зберігайте напружений і захопливий тон.",
        "strict_note": "Усі видимі тексти мають бути тільки українською мовою.",
    },
    "es": {
        "title": "{topic}: historia breve",
        "templates": [
            ("Pocas personas notan lo inusual que realmente es el tema de «{subject}».", "establishing shot of {subject}, atmospheric opening frame"),
            ("Al principio todo parecía claro, pero los detalles cambiaron rápidamente toda la imagen.", "close view of key details connected to {subject}, realistic environment"),
            ("Cuanto más profundo miras, más conexiones inesperadas y causas ocultas aparecen.", "dramatic moment revealing hidden connections around {subject}"),
            ("Aquí surge la pregunta principal que cambia el sentido de toda la historia.", "high-impact visual turning point for {subject}, strong composition"),
            ("Por eso el final sigue abierto: ¿de verdad entendemos todo esto?", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {},
        "default_bias": " Mantén un tono tenso y envolvente.",
        "strict_note": "Todo el texto visible debe estar estrictamente en español.",
    },
    "de": {
        "title": "{topic}: kurze Geschichte",
        "templates": [
            ("Nur wenige bemerken, wie ungewöhnlich das Thema „{subject}“ wirklich ist.", "establishing shot of {subject}, atmospheric opening frame"),
            ("Zuerst schien alles klar, doch die Details veränderten das ganze Bild sehr schnell.", "close view of key details connected to {subject}, realistic environment"),
            ("Je tiefer man schaut, desto mehr unerwartete Verbindungen und verborgene Ursachen tauchen auf.", "dramatic moment revealing hidden connections around {subject}"),
            ("Genau hier entsteht die zentrale Frage, die die ganze Geschichte verändert.", "high-impact visual turning point for {subject}, strong composition"),
            ("Darum bleibt das Ende offen: Verstehen wir das alles wirklich?", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {},
        "default_bias": " Halte den Ton spannend und fesselnd.",
        "strict_note": "Alle sichtbaren Texte müssen strikt auf Deutsch sein.",
    },
    "fr": {
        "title": "{topic} : histoire courte",
        "templates": [
            ("Peu de gens remarquent à quel point le sujet « {subject} » est inhabituel.", "establishing shot of {subject}, atmospheric opening frame"),
            ("Au début, tout semblait clair, mais les détails ont vite changé toute l’image.", "close view of key details connected to {subject}, realistic environment"),
            ("Plus on regarde de près, plus des liens inattendus et des causes cachées apparaissent.", "dramatic moment revealing hidden connections around {subject}"),
            ("C’est ici que surgit la question centrale qui change le sens de toute l’histoire.", "high-impact visual turning point for {subject}, strong composition"),
            ("C’est pourquoi la fin reste ouverte : comprenons-nous vraiment tout cela ?", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {},
        "default_bias": " Gardez un ton tendu et captivant.",
        "strict_note": "Tous les textes visibles doivent être strictement en français.",
    },
    "pt": {
        "title": "{topic}: história curta",
        "templates": [
            ("Pouca gente percebe como o tema «{subject}» é realmente incomum.", "establishing shot of {subject}, atmospheric opening frame"),
            ("No início tudo parecia simples, mas os detalhes mudaram rapidamente toda a imagem.", "close view of key details connected to {subject}, realistic environment"),
            ("Quanto mais fundo você olha, mais conexões inesperadas e causas ocultas aparecem.", "dramatic moment revealing hidden connections around {subject}"),
            ("É aqui que surge a pergunta principal que muda o sentido de toda a história.", "high-impact visual turning point for {subject}, strong composition"),
            ("Por isso o final permanece aberto: será que entendemos tudo isso de verdade?", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {},
        "default_bias": " Mantenha um tom tenso e envolvente.",
        "strict_note": "Todo o texto visível deve estar estritamente em português.",
    },
    "ar": {
        "title": "{topic}: قصة قصيرة",
        "templates": [
            ("قلة فقط تلاحظ مدى غرابة موضوع «{subject}» بالفعل.", "establishing shot of {subject}, atmospheric opening frame"),
            ("في البداية بدا كل شيء واضحاً، لكن التفاصيل غيّرت الصورة بسرعة.", "close view of key details connected to {subject}, realistic environment"),
            ("كلما تعمقت أكثر ظهرت روابط غير متوقعة وأسباب خفية.", "dramatic moment revealing hidden connections around {subject}"),
            ("هنا يظهر السؤال الأساسي الذي يغيّر معنى القصة كلها.", "high-impact visual turning point for {subject}, strong composition"),
            ("ولهذا يبقى النهاية مفتوحة: هل نفهم كل هذا حقاً؟", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {},
        "default_bias": " حافظ على نبرة مشوقة ومتوترة.",
        "strict_note": "يجب أن يكون كل النص الظاهر باللغة العربية فقط.",
    },
    "zh": {
        "title": "{topic}：简短故事",
        "templates": [
            ("很少有人注意到“{subject}”这个主题其实有多么不同寻常。", "establishing shot of {subject}, atmospheric opening frame"),
            ("一开始一切似乎都很清楚，但细节很快改变了整个画面。", "close view of key details connected to {subject}, realistic environment"),
            ("看得越深，越会出现意想不到的联系和隐藏的原因。", "dramatic moment revealing hidden connections around {subject}"),
            ("真正改变整段故事意义的核心问题，就在这里出现。", "high-impact visual turning point for {subject}, strong composition"),
            ("所以结局依然开放：我们真的理解这一切了吗？", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {},
        "default_bias": " 保持紧张且引人入胜的语气。",
        "strict_note": "所有可见文本都必须严格使用中文。",
    },
    "ja": {
        "title": "{topic}：短い物語",
        "templates": [
            ("「{subject}」というテーマがどれほど特別かに気づく人は多くありません。", "establishing shot of {subject}, atmospheric opening frame"),
            ("最初は単純に見えましたが、細部がすぐに全体像を変えました。", "close view of key details connected to {subject}, realistic environment"),
            ("深く見るほど、意外なつながりや隠れた原因が見えてきます。", "dramatic moment revealing hidden connections around {subject}"),
            ("物語全体の意味を変える中心的な問いは、まさにここで生まれます。", "high-impact visual turning point for {subject}, strong composition"),
            ("だからこそ結末は開かれたままです。本当に私たちはすべてを理解しているのでしょうか。", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {},
        "default_bias": " 緊張感のある引き込まれる語り口を保ってください。",
        "strict_note": "表示されるテキストはすべて日本語のみでなければなりません。",
    },
    "ko": {
        "title": "{topic}: 짧은 이야기",
        "templates": [
            ("많은 사람들은 ‘{subject}’라는 주제가 얼마나 특별한지 잘 모릅니다.", "establishing shot of {subject}, atmospheric opening frame"),
            ("처음에는 단순해 보였지만, 세부 사항이 곧 전체 그림을 바꾸었습니다.", "close view of key details connected to {subject}, realistic environment"),
            ("더 깊이 볼수록 예상치 못한 연결과 숨겨진 원인이 드러납니다.", "dramatic moment revealing hidden connections around {subject}"),
            ("이 지점에서 이야기의 의미를 바꾸는 핵심 질문이 등장합니다.", "high-impact visual turning point for {subject}, strong composition"),
            ("그래서 결말은 열려 있습니다. 우리는 정말 이 모든 것을 이해하고 있을까요?", "final cinematic frame about {subject}, unresolved but memorable ending"),
        ],
        "bias": {},
        "default_bias": " 긴장감 있고 몰입되는 톤을 유지하세요.",
        "strict_note": "보이는 모든 텍스트는 반드시 한국어만 사용해야 합니다.",
    },
}

LOCALIZED_HOOKS = {
    "ru": ["Вы когда-нибудь задумывались…", "Мало кто знает…", "То, что вы узнаете дальше, изменит ваш взгляд…"],
    "en": ["Have you ever wondered…", "Very few people know…", "What you learn next may change your view…"],
    "uk": ["Ви коли-небудь замислювалися…", "Мало хто знає…", "Те, що ви дізнаєтесь далі, може змінити ваш погляд…"],
    "es": ["¿Alguna vez te has preguntado…", "Muy poca gente lo sabe…", "Lo que descubrirás ahora puede cambiar tu visión…"],
    "de": ["Haben Sie sich jemals gefragt…", "Nur wenige wissen…", "Was Sie jetzt erfahren, könnte Ihre Sicht verändern…"],
    "fr": ["Vous êtes-vous déjà demandé…", "Très peu de gens le savent…", "Ce que vous allez découvrir peut changer votre regard…"],
    "pt": ["Você já se perguntou…", "Pouca gente sabe…", "O que você vai descobrir agora pode mudar sua visão…"],
    "ar": ["هل فكرت يوماً…", "قلة فقط تعرف…", "ما ستعرفه الآن قد يغيّر نظرتك…"],
    "zh": ["你有没有想过……", "很少有人知道……", "接下来你会知道的事，可能会改变你的看法……"],
    "ja": ["考えたことはありますか……", "知っている人はほとんどいません……", "この先に知ることが、見方を変えるかもしれません……"],
    "ko": ["생각해 본 적 있나요…", "아는 사람은 거의 없습니다…", "지금부터 알게 될 내용이 당신의 시각을 바꿀 수 있습니다…"],
}

LOCALIZED_ENDINGS = {
    "ru": ["Что вы об этом думаете?", "Как думаете вы?", "Совпадение или что-то большее?"],
    "en": ["What do you think about this?", "What do you think?", "Coincidence or something more?"],
    "uk": ["Що ви про це думаєте?", "А як думаєте ви?", "Збіг чи щось більше?"],
    "es": ["¿Qué opinas de esto?", "¿Tú qué piensas?", "¿Coincidencia o algo más?"],
    "de": ["Was denken Sie darüber?", "Wie sehen Sie das?", "Zufall oder etwas Größeres?"],
    "fr": ["Qu’en pensez-vous ?", "Et vous, qu’en pensez-vous ?", "Coïncidence ou quelque chose de plus ?"],
    "pt": ["O que você pensa sobre isso?", "E você, o que acha?", "Coincidência ou algo mais?"],
    "ar": ["ما رأيك في هذا؟", "وأنت ماذا تعتقد؟", "هل هي مصادفة أم شيء أكبر؟"],
    "zh": ["你怎么看？", "你的看法是什么？", "这只是巧合，还是另有原因？"],
    "ja": ["あなたはどう思いますか。", "あなたの考えはどうですか。", "偶然でしょうか、それとも別の何かでしょうか。"],
    "ko": ["여러분은 어떻게 생각하나요?", "당신의 생각은 어떤가요?", "우연일까요, 아니면 더 큰 무언가일까요?"],
}


def _humanize_prompt_part(value: str) -> str:
    text = str(value or "").strip().strip('"').strip("'")
    if not text:
        return ""
    # If an old client accidentally sends ids like ancient_civilizations,
    # make them human-readable instead of leaking raw ids into the script.
    if re.fullmatch(r"[a-zA-Z0-9_\\-]+", text) and "_" in text:
        text = text.replace("_", " ")
    return text.strip()


def build_local_script(topic, lang="en", duration=60, subtopic="", story_style="intrigue", focus=""):
    scene_count = max(3, min(10, round(duration / 8)))
    durations = split_total_duration(duration, scene_count)
    topic = _humanize_prompt_part(topic)
    subtopic = _humanize_prompt_part(subtopic)
    focus = _humanize_prompt_part(focus)

    subject = subtopic or topic or "topic"
    if focus:
        subject = f"{subject}: {focus}" if subject else focus
    copy = LOCALIZED_SCRIPT_COPY.get(lang, LOCALIZED_SCRIPT_COPY["en"])
    title_topic = subtopic or topic
    if focus:
        title_topic = f"{title_topic}: {focus}" if title_topic else focus
    title = copy["title"].format(topic=title_topic or topic)
    style_bias = copy["bias"].get(story_style, copy["default_bias"]).strip()

    if lang == "ru":
        voice_templates = [
            "Тема «{subject}» кажется знакомой только на первый взгляд.",
            "Но если присмотреться к теме «{subject}», сразу начинают всплывать важные детали.",
            "Именно в деталях темы «{subject}» скрывается то, что обычно упускают из виду.",
            "Чем глубже в историю «{subject}» погружаешься, тем заметнее внутренние противоречия.",
            "В какой-то момент тема «{subject}» перестаёт быть простой и начинает выглядеть совсем иначе.",
            "И здесь возникает главный поворот: тема «{subject}» связана с вещами, которые на первый взгляд неочевидны.",
            "После этого на тему «{subject}» уже невозможно смотреть по-старому.",
            "Именно поэтому история «{subject}» оставляет после себя больше вопросов, чем готовых ответов.",
            "Каждая новая деталь вокруг темы «{subject}» только усиливает ощущение, что мы видим не всю картину.",
            "Финальный вопрос остаётся открытым: что в теме «{subject}» мы до сих пор понимаем неправильно?",
        ]
        image_templates = [
            "documentary opening frame about {subject}, clear historical context, specific environment and recognizable details",
            "close-up of artifacts, architecture, documents or symbols directly related to {subject}",
            "visual evidence showing overlooked details connected to {subject}",
            "cinematic reveal of hidden links, causes or contradictions inside {subject}",
            "turning-point frame where the meaning of {subject} visibly changes",
            "high-impact composition showing the most important conflict around {subject}",
            "thoughtful wide shot that reframes the viewer's understanding of {subject}",
            "final memorable frame about {subject}, unresolved question, strong atmosphere",
            "investigative scene with visual clues connected to {subject}",
            "final cinematic frame about {subject}, open ending, no generic symbolism",
        ]
    elif lang == "en":
        voice_templates = [
            "The topic of “{subject}” looks familiar only at first glance.",
            "But the moment you look closer at “{subject}”, important details begin to surface.",
            "The real meaning of “{subject}” hides in the details most people skip.",
            "The deeper you go into “{subject}”, the more contradictions begin to appear.",
            "At some point, “{subject}” stops looking simple and starts to mean something else entirely.",
            "This is the turning point: “{subject}” is connected to things that do not seem related at first.",
            "After that, it becomes impossible to look at “{subject}” in the same way.",
            "That is why the story of “{subject}” leaves behind more questions than ready answers.",
            "Every new detail around “{subject}” strengthens the feeling that we still do not see the full picture.",
            "So the final question remains open: what are we still getting wrong about “{subject}”?",
        ]
        image_templates = [
            "documentary opening frame about {subject}, clear context, specific environment and recognizable details",
            "close-up of artifacts, architecture, documents or symbols directly related to {subject}",
            "visual evidence showing overlooked details connected to {subject}",
            "cinematic reveal of hidden links, causes or contradictions inside {subject}",
            "turning-point frame where the meaning of {subject} visibly changes",
            "high-impact composition showing the most important conflict around {subject}",
            "thoughtful wide shot that reframes the viewer's understanding of {subject}",
            "final memorable frame about {subject}, unresolved question, strong atmosphere",
            "investigative scene with visual clues connected to {subject}",
            "final cinematic frame about {subject}, open ending, no generic symbolism",
        ]
    else:
        voice_templates = [tpl[0] for tpl in copy["templates"]]
        image_templates = [tpl[1] for tpl in copy["templates"]]

    scenes = []
    for i, dur in enumerate(durations):
        voice_template = voice_templates[min(i, len(voice_templates) - 1)]
        image_template = image_templates[min(i, len(image_templates) - 1)]
        voiceover = voice_template.format(subject=subject).strip()
        if style_bias and i in (0, 3, len(durations) - 1):
            voiceover = f"{voiceover} {style_bias}".strip()
        scenes.append(
            {
                "duration": dur,
                "image_description": image_template.format(subject=subject),
                "stock_query": build_stock_query(subject, i),
                "voiceover": voiceover,
            }
        )

    return {"title": title, "scenes": scenes}


def replicate_generate_image(prompt: str, format_type: str, output_path: str):
    import urllib.request
    import urllib.error

    if not REPLICATE_API_TOKEN:
        raise RuntimeError("REPLICATE_API_TOKEN not set")

    aspect_ratio = {"9:16": "9:16", "16:9": "16:9", "1:1": "1:1"}.get(
        format_type, "16:9"
    )
    payload = {
        "input": {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "output_format": "png",
            "output_quality": 100,
        }
    }

    _HDR = {"User-Agent": "curl/7.88.1", "Authorization": f"Bearer {REPLICATE_API_TOKEN}"}
    req = urllib.request.Request(
        f"https://api.replicate.com/v1/models/{REPLICATE_IMAGE_MODEL}/predictions",
        data=json.dumps(payload).encode("utf-8"),
        headers={**_HDR, "Content-Type": "application/json", "Prefer": "wait=60"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            prediction = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        raise RuntimeError(f"Replicate HTTP {e.code}: {body[:300]}")

    get_url = prediction.get("urls", {}).get("get")
    started = time.time()
    while prediction.get("status") not in ("succeeded", "failed", "canceled"):
        if not get_url:
            raise RuntimeError("Replicate prediction polling URL missing")
        poll_req = urllib.request.Request(
            get_url,
            headers=_HDR,
            method="GET",
        )
        try:
            with urllib.request.urlopen(poll_req, timeout=60) as resp:
                prediction = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")
            raise RuntimeError(f"Replicate poll HTTP {e.code}: {body[:300]}")
        if time.time() - started > 180:
            raise RuntimeError("Replicate prediction timeout")
        time.sleep(1.5)

    if prediction.get("status") != "succeeded":
        err = prediction.get("error") or prediction.get("status") or "Replicate failed"
        raise RuntimeError(str(err))

    output = prediction.get("output")
    if isinstance(output, list):
        image_url = output[0] if output else None
    else:
        image_url = output
    if not image_url:
        raise RuntimeError("Replicate did not return image URL")

    img_req = urllib.request.Request(image_url, headers={"User-Agent": "curl/7.88.1"})
    with urllib.request.urlopen(img_req, timeout=90) as resp:
        img_data = resp.read()
    save_and_normalize_image(img_data, output_path, format_type)
    log(f"[Replicate] {REPLICATE_IMAGE_MODEL} → {len(img_data)//1024}KB")
    return output_path


def save_and_normalize_image(data: bytes, output_path: str, format_type: str):
    """
    Save image bytes as a proper PNG at the exact target resolution.
    Handles JPEG/WebP/PNG input regardless of file extension.
    Upscales with Lanczos if provider returned smaller image than requested.
    """
    import io
    target = {
        "9:16": (1080, 1920),
        "16:9": (1920, 1080),
        "1:1": (1080, 1080),
    }.get(format_type, (1920, 1080))
    img = Image.open(io.BytesIO(data)).convert("RGB")
    if img.size != target:
        log(f"[ImageNorm] resize {img.size} → {target}")
        img = img.resize(target, Image.LANCZOS)
    img.save(output_path, "PNG", optimize=False)
    log(f"[ImageNorm] saved {target[0]}×{target[1]} PNG → {output_path}")


def _extract_stock_query(description: str) -> str:
    """
    Extract 4-6 search keywords from a scene image_description.
    Strips AI/photographic jargon, keeps location/era/subject/action.
    """
    # Words to strip — AI prompt filler, not useful for stock search
    noise = {
        "cinematic","photorealistic","photorealism","dramatic","lighting","film","still",
        "shot","close","medium","wide","establishing","chiaroscuro","8k","4k","uhd",
        "not","illustration","anime","fantasy","modern","elements","text","graphic",
        "gore","no","only","must","look","exactly","like","major","hollywood","movie",
        "frame","from","harsh","pale","cold","warm","soft","natural","daylight","torchlight",
        "candlelight","sunlight","moonlight","bright","dark","dim","dimly","lit","backlit",
        "blurry","sharp","depth","field","bokeh","hdr","vivid","saturated","desaturated",
        "monochrome","black","white","sepia","vintage","retro","style","render","rendered",
        "generated","ai","image","photo","picture","scene","background","foreground","midground",
        "composition","framing","angle","perspective","portrait","landscape","vertical","horizontal",
    }
    import re
    words = re.findall(r"[A-Za-zА-Яа-яёЁ\-]+", description)
    seen, result = set(), []
    for w in words:
        wl = w.lower()
        if wl not in noise and len(wl) > 3 and wl not in seen:
            seen.add(wl)
            result.append(w)
        if len(result) >= 6:
            break
    query = " ".join(result[:5])
    log(f"[StockSearch] query: '{query}'")
    return query or "historical dramatic scene"


STOCK_QUERY_TRANSLATIONS = {
    "История": "history documentary",
    "Древние цивилизации": "ancient civilization ruins archaeology",
    "Средневековье": "medieval castle history",
    "Эпоха Возрождения": "renaissance art history",
    "Империи и сверхдержавы": "ancient empire historical monuments",
    "Революции": "revolution crowd historical",
    "Холодная война": "cold war archive",
    "Великие путешественники": "explorers expedition map",
    "Военное": "military history archive",
    "Великая Отечественная война": "world war two eastern front archive",
    "Вторая мировая": "world war two archive",
    "Древние войны": "ancient battle ruins",
    "Наполеоновские войны": "napoleonic war reenactment",
    "Современные конфликты": "modern conflict documentary",
    "Гражданские войны": "civil war historical archive",
    "Морские сражения": "naval battle warship",
    "Воздушная война": "military aircraft archive",
    "Наука": "science laboratory documentary",
    "Физика": "physics laboratory experiment",
    "Биология": "biology laboratory microscope",
    "Космос": "space nasa stars",
    "Технологии": "technology computer data center",
    "Медицина": "medicine hospital laboratory",
    "Искусственный интеллект": "artificial intelligence technology",
    "Наука о Земле": "earth science geology",
    "Природа": "nature documentary wildlife",
    "Животные": "wildlife animals documentary",
    "Океан": "ocean underwater documentary",
    "Джунгли": "jungle rainforest",
    "Финансы": "finance stock market money",
    "Инвестиции": "investment stock market",
    "Аферы и мошенничество": "financial scam fraud",
    "Экономические кризисы": "economic crisis stock market",
}


def build_stock_query(subject: str, scene_index: int = 0) -> str:
    text = _humanize_prompt_part(subject)
    for ru, en in STOCK_QUERY_TRANSLATIONS.items():
        if ru in text:
            return en
    if re.search(r"[А-Яа-яЁё]", text):
        return "documentary history archive"
    return _extract_stock_query(text)


def pexels_search_image(query: str, format_type: str, output_path: str):
    """Search Pexels stock photos. Needs PEXELS_API_KEY (free at pexels.com/api)."""
    import urllib.request, urllib.parse, json, random
    if not PEXELS_API_KEY:
        raise RuntimeError("PEXELS_API_KEY not set")
    orientation = "portrait" if format_type == "9:16" else "landscape" if format_type == "16:9" else "square"
    q = urllib.parse.quote(query)
    url = f"https://api.pexels.com/v1/search?query={q}&per_page=15&orientation={orientation}"
    req = urllib.request.Request(url, headers={"Authorization": PEXELS_API_KEY})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    photos = data.get("photos", [])
    if not photos:
        raise RuntimeError(f"Pexels: no results for '{query}'")
    photo = random.choice(photos[:5])  # pick random from top-5
    img_url = photo["src"].get("large2x") or photo["src"]["large"]
    log(f"[Pexels] found {len(photos)} photos, using: {img_url[:60]}...")
    with urllib.request.urlopen(
        urllib.request.Request(img_url, headers={"User-Agent": "VidRush/1.0"}), timeout=30
    ) as img_resp:
        img_data = img_resp.read()
    if len(img_data) < 10000:
        raise RuntimeError(f"Pexels image too small ({len(img_data)} bytes)")
    save_and_normalize_image(img_data, output_path, format_type)
    return output_path


def pixabay_search_image(query: str, format_type: str, output_path: str):
    """Search Pixabay stock photos. Needs PIXABAY_API_KEY (free at pixabay.com/api)."""
    import urllib.request, urllib.parse, json, random
    if not PIXABAY_API_KEY:
        raise RuntimeError("PIXABAY_API_KEY not set")
    orientation = "vertical" if format_type == "9:16" else "horizontal"
    q = urllib.parse.quote(query)
    url = (
        f"https://pixabay.com/api/?key={PIXABAY_API_KEY}&q={q}"
        f"&image_type=photo&orientation={orientation}&per_page=15&safesearch=false&min_width=768"
    )
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = json.loads(resp.read())
    hits = data.get("hits", [])
    if not hits:
        raise RuntimeError(f"Pixabay: no results for '{query}'")
    hit = random.choice(hits[:5])
    img_url = hit.get("largeImageURL") or hit["webformatURL"]
    log(f"[Pixabay] found {len(hits)} photos, using: {img_url[:60]}...")
    with urllib.request.urlopen(
        urllib.request.Request(img_url, headers={"User-Agent": "VidRush/1.0"}), timeout=30
    ) as img_resp:
        img_data = img_resp.read()
    if len(img_data) < 10000:
        raise RuntimeError(f"Pixabay image too small ({len(img_data)} bytes)")
    save_and_normalize_image(img_data, output_path, format_type)
    return output_path


def wikimedia_search_image(query: str, format_type: str, output_path: str):
    """Search Wikimedia Commons — no API key, public domain, great for historical content."""
    import urllib.request, urllib.parse, json, random
    # Wikimedia requires a real contact email in User-Agent to avoid 403
    UA = "VidRush/1.0 (markmarkik4@gmail.com; https://github.com/vidrush)"
    HEADERS = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }
    # Search for pages with images in File namespace
    params = urllib.parse.urlencode({
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "search", "gsrsearch": f"filetype:bitmap {query}",
        "gsrnamespace": "6",  # File namespace
        "gsrlimit": "20",
        "prop": "imageinfo",
        "iiprop": "url|size|mime",
        "iiurlwidth": "1344",
    })
    api_url = f"https://commons.wikimedia.org/w/api.php?{params}"
    req = urllib.request.Request(api_url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
    pages = (data.get("query") or {}).get("pages", [])
    if isinstance(pages, dict):
        pages = list(pages.values())
    # Filter: only photos (jpeg/png), large enough
    photos = [
        p for p in pages
        if p.get("imageinfo")
        and p["imageinfo"][0].get("mime", "").startswith("image/")
        and p["imageinfo"][0].get("width", 0) >= 600
        and "svg" not in p["imageinfo"][0].get("mime", "")
        and "gif" not in p["imageinfo"][0].get("mime", "")
    ]
    if not photos:
        raise RuntimeError(f"Wikimedia: no results for '{query}'")
    photo = random.choice(photos[:8])
    info = photo["imageinfo"][0]
    img_url = info.get("thumburl") or info["url"]
    log(f"[Wikimedia] '{query}' → {photo.get('title','?')[:50]}")
    img_req = urllib.request.Request(img_url, headers=HEADERS)
    with urllib.request.urlopen(img_req, timeout=30) as img_resp:
        img_data = img_resp.read()
    if len(img_data) < 10000:
        raise RuntimeError(f"Wikimedia image too small ({len(img_data)} bytes)")
    save_and_normalize_image(img_data, output_path, format_type)
    return output_path


def imagen_generate_image(prompt: str, format_type: str, output_path: str):
    """High-quality Google Imagen generation via Gemini API. Needs GEMINI_API_KEY."""
    import urllib.request, json, base64

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    aspect_ratio = {
        "9:16": "9:16",
        "16:9": "16:9",
        "1:1": "1:1",
    }.get(format_type, "16:9")

    payload = json.dumps({
        "instances": [
            {
                "prompt": prompt[:3000],
            }
        ],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": aspect_ratio,
            "personGeneration": "allow_adult",
            "safetyFilterLevel": "block_only_high",
            "includeRaiReason": True,
            "imageSize": IMAGEN_IMAGE_SIZE,
        },
    }).encode()

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{IMAGEN_MODEL}:predict?key={GEMINI_API_KEY}"
    )
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read())

    predictions = result.get("predictions") or []
    if not predictions:
        raise RuntimeError(f"Imagen returned no predictions: {str(result)[:300]}")

    first = predictions[0]
    b64 = (
        first.get("bytesBase64Encoded")
        or first.get("image", {}).get("bytesBase64Encoded")
        or first.get("imageBytes")
    )
    if not b64:
        raise RuntimeError(f"Imagen returned no image bytes: {str(first)[:300]}")

    img_data = base64.b64decode(b64)
    if len(img_data) < 10000:
        raise RuntimeError(f"Imagen image too small ({len(img_data)} bytes)")

    save_and_normalize_image(img_data, output_path, format_type)
    log(f"[Imagen] model={IMAGEN_MODEL} size={IMAGEN_IMAGE_SIZE} raw={len(img_data)//1024}KB")
    return output_path


def together_generate_image(prompt: str, format_type: str, output_path: str):
    """Free image generation via Together AI — FLUX.1-schnell-Free, needs TOGETHER_API_KEY."""
    import urllib.request, json, base64
    if not TOGETHER_API_KEY:
        raise RuntimeError("TOGETHER_API_KEY not set")
    dims = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
    w, h = dims.get(format_type, (1024, 1024))
    payload = json.dumps({
        "model": "black-forest-labs/FLUX.1-schnell-Free",
        "prompt": prompt[:1500],
        "width": w, "height": h,
        "steps": 4, "n": 1,
        "response_format": "b64_json",
    }).encode()
    req = urllib.request.Request(
        "https://api.together.xyz/v1/images/generations",
        data=payload,
        headers={"Authorization": f"Bearer {TOGETHER_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())
    img_data = base64.b64decode(result["data"][0]["b64_json"])
    if len(img_data) < 5000:
        raise RuntimeError(f"Image too small ({len(img_data)} bytes)")
    save_and_normalize_image(img_data, output_path, format_type)


def fal_generate_image(prompt: str, format_type: str, output_path: str):
    """
    Image generation via fal.ai.
    FAL_MODEL env var controls quality/cost:
      schnell  → $0.003/img, fast, good quality  (DEFAULT)
      dev      → $0.025/img, slower, best quality
    Sign up at fal.ai — $15 free credit on signup.
    """
    import urllib.request, json
    if not FAL_KEY:
        raise RuntimeError("FAL_KEY not set")
    dims = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
    w, h = dims.get(format_type, (1024, 1024))
    model = load_env_value("FAL_MODEL", "schnell")  # schnell | dev
    endpoint = f"https://fal.run/fal-ai/flux/{model}"
    steps = 4 if model == "schnell" else 28
    payload = json.dumps({
        "prompt": prompt[:2000],
        "image_size": {"width": w, "height": h},
        "num_inference_steps": steps,
        "num_images": 1,
        "enable_safety_checker": False,
        "output_format": "jpeg",
    }).encode()
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Authorization": f"Key {FAL_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())
    img_url = result["images"][0]["url"]
    with urllib.request.urlopen(
        urllib.request.Request(img_url, headers={"User-Agent": "VidRush/1.0"}), timeout=60
    ) as img_resp:
        data = img_resp.read()
    if len(data) < 5000:
        raise RuntimeError(f"fal.ai image too small ({len(data)} bytes)")
    save_and_normalize_image(data, output_path, format_type)
    log(f"[fal.ai] model={model} raw={len(data)//1024}KB")
    return output_path


def pollinations_generate_image(prompt: str, format_type: str, output_path: str, seed: int = 0):
    """Free image generation via Pollinations.AI — no API key required, FLUX model."""
    import urllib.request, urllib.parse, time
    dims = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
    w, h = dims.get(format_type, (1024, 1024))
    encoded = urllib.parse.quote(prompt[:1000], safe="")
    # flux-realism → best photorealistic model on Pollinations (free)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={w}&height={h}&model=flux-realism&nologo=true&seed={seed}&enhance=true&safe=false"
    )
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "image/jpeg,image/*",
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if len(data) < 5000:
                raise RuntimeError(f"Response too small ({len(data)} bytes)")
            save_and_normalize_image(data, output_path, format_type)
            return output_path
        except Exception as e:
            log(f"[Pollinations] attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(5)
    raise RuntimeError("Pollinations failed after 3 attempts")


def huggingface_generate_image(prompt: str, format_type: str, output_path: str):
    if not hf_client:
        raise RuntimeError("HF_TOKEN not set")

    dims = {
        "9:16": (1080, 1920),
        "16:9": (1920, 1080),
        "1:1": (1080, 1080),
    }.get(format_type, (1920, 1080))
    width, height = dims

    image = hf_client.text_to_image(
        prompt,
        model=HF_IMAGE_MODEL,
        width=width,
        height=height,
        num_inference_steps=6,
    )
    image.save(output_path)
    return output_path


# ─── Subtitle Renderer (PIL → PNG → FFmpeg overlay) ────────────────────────────


def get_font(font_size, bold=False, font_family=None, sample_text=""):
    """Get PIL font from local fonts_cache (uprock.ru cyrillic fonts)."""
    _font_cache = getattr(get_font, "_cache", {})
    font_family = font_family or "Montserrat Bold"

    # ── Local font map (fonts_cache/ — downloaded from fonts.uprock.ru) ─────────
    # All fonts fully support Cyrillic + Latin
    _fonts_dir = SCRIPTS_DIR / "fonts_cache"

    _local_map = {
        # ── Display / TikTok subtitle fonts ──────────────────────────────────
        "Bebas Neue": "BebasNeue-Bold.ttf",
        "Bebas Neue Bold": "BebasNeue-Bold.ttf",
        "Oswald Bold": "Oswald-Bold.ttf",
        "Oswald ExtraBold": "Oswald-Bold.ttf",
        "Russo One": "RussoOne-Regular.ttf",
        "Furore": "Furore.otf",  # если скачан
        "Intro Black": "IntroDemo-BlackCAPS.ttf",
        "Tektur Black": "Tektur-Black.ttf",
        "Tektur Bold": "Tektur-Bold.ttf",
        "Tektur ExtraBold": "Tektur-ExtraBold.ttf",
        "TT Norms Black": "TTNorms-Black.otf",
        # ── Montserrat family ─────────────────────────────────────────────────
        "Montserrat": "Montserrat-Bold.ttf",
        "Montserrat Bold": "Montserrat-Bold.ttf",
        "Montserrat ExtraBold": "Montserrat-ExtraBold.ttf",
        "Montserrat Black": "Montserrat-Black.ttf",
        # ── Raleway family ────────────────────────────────────────────────────
        "Raleway": "Raleway-ExtraBold.ttf",
        "Raleway Heavy": "Raleway-Black.ttf",
        "Raleway Bold": "Raleway-Bold.ttf",
        "Raleway ExtraBold": "Raleway-ExtraBold.ttf",
        "Raleway Black": "Raleway-Black.ttf",
        # ── Nunito family ─────────────────────────────────────────────────────
        "Nunito": "Nunito-ExtraBold.ttf",
        "Nunito ExtraBold": "Nunito-ExtraBold.ttf",
        "Nunito Bold": "Nunito-Bold.ttf",
        "Nunito Black": "Nunito-Black.ttf",
        # ── Rubik family ──────────────────────────────────────────────────────
        "Rubik": "Rubik-ExtraBold.ttf",
        "Rubik Bold": "Rubik-Bold.ttf",
        "Rubik ExtraBold": "Rubik-ExtraBold.ttf",
        "Rubik Black": "Rubik-Black.ttf",
        # ── Manrope family ────────────────────────────────────────────────────
        "Manrope": "Manrope-ExtraBold.ttf",
        "Manrope Bold": "Manrope-Bold.ttf",
        "Manrope ExtraBold": "Manrope-ExtraBold.ttf",
        # ── Jost family ───────────────────────────────────────────────────────
        "Jost": "Jost-ExtraBold.ttf",
        "Jost Bold": "Jost-Bold.ttf",
        "Jost ExtraBold": "Jost-ExtraBold.ttf",
        "Jost Black": "Jost-Black.ttf",
        # ── Exo 2 family ──────────────────────────────────────────────────────
        "Exo 2": "Exo2-ExtraBold.ttf",
        "Exo 2 Bold": "Exo2-Bold.ttf",
        "Exo 2 ExtraBold": "Exo2-ExtraBold.ttf",
        "Exo 2 Black": "Exo2-Black.ttf",
        # ── Fira Sans family ──────────────────────────────────────────────────
        "Fira Sans": "FiraSans-ExtraBold.otf",
        "Fira Sans Heavy": "FiraSans-Heavy.otf",
        "Fira Sans ExtraBold": "FiraSans-ExtraBold.otf",
        # ── Inter family ──────────────────────────────────────────────────────
        "Inter": "Inter-Bold.ttf",
        "Inter Bold": "Inter-Bold.ttf",
        "Inter ExtraBold": "Inter-ExtraBold.ttf",
        "Inter Black": "Inter-Black.ttf",
        # ── Comfortaa ─────────────────────────────────────────────────────────
        "Comfortaa": "Comfortaa-Bold.ttf",
        "Comfortaa Bold": "Comfortaa-Bold.ttf",
        # ── Roboto ────────────────────────────────────────────────────────────
        "Roboto": "Roboto-Bold.ttf",
        "Roboto Bold": "Roboto-Bold.ttf",
        "Roboto Black": "Roboto-Black.ttf",
        # ── Gilroy ────────────────────────────────────────────────────────────
        "Gilroy": "Gilroy-ExtraBold.otf",
        "Gilroy ExtraBold": "Gilroy-ExtraBold.otf",
        # ── Anton (original cached) ───────────────────────────────────────────
        "Anton": "Anton.ttf",
        # ── PT Sans ───────────────────────────────────────────────────────────
        "PT Sans": "PT-Sans_Bold.ttf",
        "PT Sans Bold": "PT-Sans_Bold.ttf",
        # ── Golos Text ────────────────────────────────────────────────────────
        "Golos Text": "Golos-Text-Regular.otf",
    }

    def _font_supports_text(path_str, text):
        text = "".join(ch for ch in str(text or "") if ch.isalnum())
        if not text:
            return True
        try:
            from fontTools.ttLib import TTCollection, TTFont

            def _cmaps(font):
                chars = set()
                for table in font["cmap"].tables:
                    chars.update(table.cmap.keys())
                return chars

            if path_str.lower().endswith(".ttc"):
                collection = TTCollection(path_str)
                return any(all(ord(ch) in _cmaps(font) for ch in text) for font in collection.fonts)

            font = TTFont(path_str)
            chars = _cmaps(font)
            return all(ord(ch) in chars for ch in text)
        except Exception:
            return True

    def _try_font(path_str, text=""):
        try:
            if os.path.exists(path_str):
                if not _font_supports_text(path_str, text):
                    return None
                return ImageFont.truetype(path_str, font_size)
        except Exception:
            pass
        return None

    # 1) Already cached
    key = (font_family, bold, font_size, "cyr" if re.search(r"[А-Яа-яЁё]", str(sample_text or "")) else "default")
    if key in _font_cache:
        return _font_cache[key]

    _fonts_dir.mkdir(exist_ok=True)

    # 2) Try local map
    local_filename = _local_map.get(font_family)
    if local_filename:
        p = _fonts_dir / local_filename
        result = _try_font(str(p), sample_text)
        if result:
            get_font._cache = _font_cache
            _font_cache[key] = result
            return result

    # 3) Try to find any matching file in fonts_cache by name fragment
    name_fragment = font_family.replace(" ", "").lower()
    for f in sorted(_fonts_dir.iterdir()):
        if name_fragment in f.name.lower().replace("-", "").replace("_", ""):
            result = _try_font(str(f), sample_text)
            if result:
                get_font._cache = _font_cache
                _font_cache[key] = result
                return result

    # 4) Fallback to Montserrat-Bold
    fallback = _fonts_dir / "Montserrat-Bold.ttf"
    result = _try_font(str(fallback), sample_text)
    if result:
        get_font._cache = _font_cache
        _font_cache[key] = result
        return result

    # 5) System Arial
    for p in [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ]:
        result = _try_font(p, sample_text)
        if result:
            get_font._cache = _font_cache
            _font_cache[key] = result
            return result

    get_font._cache = _font_cache
    _font_cache[key] = ImageFont.load_default()
    return _font_cache[key]


def parse_srt(srt_path):
    """Parse SRT file. Returns list of {index, start, end, text}."""
    with open(srt_path, encoding="utf-8") as f:
        content = f.read()
    entries = []
    blocks = re.split(r"\n\n+", content.strip())
    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 3:
            continue
        try:
            idx = int(lines[0])
            timing = lines[1]
            text = "\n".join(lines[2:])
            start_str, end_str = timing.split(" --> ")

            # Parse HH:MM:SS,mmm → seconds
            def parse_ts(s):
                s = s.strip().replace(",", ".")
                parts = s.split(":")
                return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])

            start = parse_ts(start_str)
            end = parse_ts(end_str)
            entries.append({"start": start, "end": end, "text": text.strip()})
        except Exception:
            pass
    return entries


def hex_to_rgba(hex_color, alpha=255):
    """Convert #RRGGBB to (R,G,B,A) tuple."""
    h = hex_color.lstrip("#")
    if len(h) == 6:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return (r, g, b, alpha)
    return (255, 255, 255, alpha)


def render_subtitle_overlay(
    scene_img_path, subtitles_in_scene, width, height, output_path, cap=None
):
    """
    Render subtitle text onto a scene image using captionSettings.
    Returns PNG path.
    """
    if cap is None:
        cap = {}

    enabled = cap.get("enabled", True)
    font_family = cap.get("fontFamily", "Montserrat")
    font_size = max(12, min(120, int(cap.get("fontSize", 36))))
    text_color = hex_to_rgba(cap.get("textColor", "#FFFFFF"))
    outline_col = hex_to_rgba(cap.get("outlineColor", "#000000"))
    outline_th = max(0, int(cap.get("outlineThickness", 4)))
    v_pos = cap.get("verticalPosition", "bottom")  # top / middle / bottom
    alignment = cap.get("alignment", "center")  # left / center / right
    words_per_line = max(1, int(cap.get("wordsPerLine", 6)))
    v_margin = max(0, int(cap.get("verticalMargin", 60)))

    try:
        bg = Image.open(scene_img_path).convert("RGBA")
        bg = bg.resize((width, height), Image.LANCZOS)
    except Exception:
        bg = Image.new("RGBA", (width, height), (0, 0, 0, 255))

    if not enabled or not subtitles_in_scene:
        out_png = Path(output_path).with_suffix(".png")
        bg.convert("RGB").save(out_png, "PNG")
        return out_png

    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    fnt = get_font(font_size, font_family=font_family, bold=True, sample_text=text)

    for sub in subtitles_in_scene:
        text = sub["text"]

        # Wrap by words_per_line
        words = text.split()
        wrapped_lines = []
        for i in range(0, len(words), words_per_line):
            wrapped_lines.append(" ".join(words[i : i + words_per_line]))
        if not wrapped_lines:
            continue

        line_h = int(font_size * 1.35)
        total_h = len(wrapped_lines) * line_h
        pad = int(font_size * 0.5)
        bar_h = total_h + pad * 2

        # Vertical position
        if v_pos == "top":
            bar_y = v_margin
        elif v_pos in ("middle", "center"):
            bar_y = (height - bar_h) // 2
        else:  # bottom
            bar_y = height - bar_h - v_margin

        # Semi-transparent background bar
        draw.rectangle([0, bar_y, width, bar_y + bar_h], fill=(0, 0, 0, 150))

        ty = bar_y + pad
        for line_text in wrapped_lines:
            try:
                bbox = draw.textbbox((0, 0), line_text, font=fnt)
                tw = bbox[2] - bbox[0]
            except Exception:
                tw = len(line_text) * font_size * 0.6

            if alignment == "left":
                tx = pad
            elif alignment == "right":
                tx = width - tw - pad
            else:
                tx = (width - tw) // 2

            # Outline
            if outline_th > 0:
                r = min(outline_th, 5)
                for ox in range(-r, r + 1):
                    for oy in range(-r, r + 1):
                        if ox != 0 or oy != 0:
                            try:
                                draw.text(
                                    (tx + ox, ty + oy),
                                    line_text,
                                    font=fnt,
                                    fill=outline_col,
                                )
                            except Exception:
                                pass
            # Main text
            draw.text((tx, ty), line_text, font=fnt, fill=text_color)
            ty += line_h

    bg.alpha_composite(overlay)
    out_png = Path(output_path).with_suffix(".png")
    bg.convert("RGB").save(out_png, "PNG")
    return out_png


# ─── Style visual descriptions for GPT (used in script generation) ──────────────
# These tell GPT exactly what KIND of visual scene to describe for each style
STYLE_VISUAL_HINTS = {
    "fantasy": (
        "highly detailed FANTASY ART scene — this is pure fantasy, NOT photography, NOT realism, NOT anime. "
        "Describe a vivid, specific fantasy world: name the creature or being "
        "(e.g. 'a luminescent forest spirit with flowing robes made of moss and fireflies'), describe the environment "
        "(e.g. 'ancient crystal spires rising from a violet sea beneath twin moons'), describe the lighting "
        "(e.g. 'golden god-rays piercing through amber fog, bioluminescent flora illuminating the scene'). "
        "Use evocative sensory language: textures, colors, atmosphere. Think concept art from AAA fantasy games. "
        "Include magical particles, glowing runes, ethereal mist, dramatic sky."
    ),
    "cinematic": (
        "CINEMATIC MOVIE STILL — this is photorealistic cinema, NOT illustration, NOT anime, NOT fantasy. "
        "Describe a scene as a film director would compose it: "
        "a hero in their environment during a defining moment (e.g. 'a lone astronaut stands on an alien cliff, "
        "looking at a shattered space station burning up in the atmosphere below'). "
        "Include: exact camera angle (low angle / high angle / over-the-shoulder), lens type "
        "(anamorphic lens flare, shallow depth of field with creamy bokeh), lighting direction "
        "(side lighting from a single source creating dramatic shadows, volumetric god-rays). "
        "Describe the color palette and mood precisely. Think: Dune, Blade Runner 2049, Inception cinematography."
    ),
    "standard": (
        "STUNNING EDITORIAL DIGITAL ILLUSTRATION — professional quality, NOT photography, NOT anime. "
        "Describe a visually striking scene "
        "that would win a prestigious design award: bold composition with a clear focal point, "
        "dynamic color palette (e.g. 'deep indigo sky contrasting with warm copper and teal accents'), "
        "professional studio-quality rendering with meticulous attention to texture and detail. "
        "Think National Geographic meets Apple keynote visuals. "
        "Describe surfaces: reflective, matte, translucent, textured. Think V-Ray or Octane render quality."
    ),
    "anime": (
        "ANIME KEY VISUAL — strictly Japanese animation style, NOT photography, NOT realism, NOT western art. "
        "Studio Ghibli or Makoto Shinkai quality. "
        "Describe the scene as a single frame from an anime film: "
        "a specific moment (e.g. 'two characters sitting on a rooftop at dusk, cherry blossoms drifting past, "
        "city lights twinkling below in the purple-orange gradient sky'). "
        "Describe: anime character expressions and poses, the breathtaking background art "
        "(hand-painted watercolor sky, volumetric light rays, lens flare), atmospheric particles "
        "(petals, leaves, dust motes, rain drops). Think Your Name, Spirited Away, Weathering With You."
    ),
    "horror_style": (
        "PRESTIGE HORROR CINEMATIC FRAME — deeply unsettling photorealistic horror, NOT fantasy adventure, NOT campy gore, NOT cartoon. "
        "Describe one terrifying moment with specific sensory dread: "
        "what is barely visible in the shadows, what practical light source reveals too little, "
        "what wrong detail makes the viewer uneasy. Use oppressive environments: abandoned corridors, damp basements, foggy forests, "
        "empty hospital rooms, ritual spaces. Think Hereditary, The Witch, It Follows, True Detective nightmare imagery."
    ),
    "illustration": (
        "FLAT VECTOR ILLUSTRATION — bold graphic design, NOT photography, NOT realism, NOT 3D render. "
        "Describe the scene using simple but powerful shapes: "
        "geometric mountains, stylized sun or moon, simplified human figures with dynamic poses. "
        "Use a strong limited color palette (e.g. 'four colors: deep navy, coral, cream, and gold'). "
        "Describe it as a premium infographic or luxury brand visual. "
        "Think Saul Bass poster art meets Bloomberg infographic. No photorealism — pure graphic design."
    ),
    "monochrome": (
        "BLACK AND WHITE FINE ART PHOTOGRAPHY — strictly grayscale, NO color whatsoever, NOT illustration. "
        "Describe the scene as a timeless B&W photograph: "
        "the exact tonal contrast (e.g. 'silhouette of a lone figure against a bright window, "
        "deep blacks, pure whites, rich mid-tone grays'), the source of light and how it sculpts the subject. "
        "Describe textures: weathered skin, rough stone, smooth metal. "
        "Think Henri Cartier-Bresson street photography, Ansel Adams landscapes, "
        "or Irving Penn studio portraits. Silver gelatin print aesthetic."
    ),
    "moody": (
        "DARK MOODY ATMOSPHERIC SCENE — deeply cinematic darkness, NOT bright or colorful, NOT fantasy. "
        "Describe an oppressive, emotionally charged environment: "
        "e.g. 'an abandoned lighthouse on a jagged cliff, consumed by swirling storm clouds, "
        "a single yellow light cutting through absolute darkness, crashing waves below. "
        "Heavy mist, desaturated teal and slate grey palette, pools of warm amber from the lighthouse beam.' "
        "Describe: fog density, rain intensity, the quality of darkness, how light struggles to penetrate. "
        "Think Blade Runner rain-soaked streets, Dark Souls game art, Nordic noir cinematography."
    ),
    "documentary": (
        "SERIOUS DOCUMENTARY FRAME — authentic, grounded, evidence-driven realism, NOT glossy commercial photography, NOT illustration. "
        "Describe the scene like a real documentary crew captured it on location: "
        "specific period details, accurate clothing and architecture, plausible environmental conditions, "
        "observational framing, and human reality over spectacle. "
        "Think BBC, National Geographic, frontline reportage, archival reconstruction with truthful detail."
    ),
    "photography": (
        "ULTRA-PREMIUM REAL PHOTOGRAPHY — photorealistic, NOT illustration, NOT CGI, NOT painting. "
        "4K resolution, magazine cover quality. "
        "Describe a perfectly executed photograph: "
        "exact lighting setup (e.g. 'golden hour natural light from 45 degrees, reflector fill, "
        "creating catchlights in the eyes and a natural rim light on the hair'), "
        "exact camera settings implied (e.g. 'shallow DOF with bokeh balls from out-of-focus fairy lights'). "
        "Describe: skin texture details, fabric texture, environmental reflections. "
        "Think Vogue, GQ, National Geographic adventure photography. "
        "The subject should feel alive and the lighting should be immaculate."
    ),
    "3d": (
        "HIGH-END 3D CGI RENDER — computer-generated imagery, NOT photography, NOT illustration, NOT anime. "
        "Pixar or AAA game quality. "
        "Describe as a rendered frame from a premium production: "
        "e.g. 'a hyper-detailed robot standing in a destroyed laboratory, volumetric dust motes "
        "floating in shafts of cold blue light from broken skylights, volumetric fog filling the room, "
        "PBR materials: scratched metal, cracked glass, wet floor reflections'. "
        "Describe material properties: subsurface scattering on skin, "
        "displacement maps on terrain, reflection intensity on surfaces. "
        "Think Pixar lighting, Unreal Engine 5 cinematic render, Octane render quality."
    ),
    "comic": (
        "PREMIUM COMIC BOOK PANEL — western graphic novel style, NOT photography, NOT anime, NOT painterly art. "
        "Describe the frame as one unforgettable comic panel: "
        "heroic or dramatic pose, bold silhouette, dramatic perspective, heavy ink contours, punchy shadow shapes, "
        "limited but powerful palette, explosive visual readability. "
        "Think modern DC/Marvel covers mixed with high-end indie graphic novels."
    ),
    "sci-fi": (
        "HIGH-BUDGET SCI-FI FILM FRAME — futuristic, technological, cinematic, NOT fantasy, NOT flat design. "
        "Describe a believable near-future or far-future environment with exact production design: "
        "architecture, interfaces, materials, vehicles, spacesuits, holograms, atmospheric haze, "
        "and the scale of the world. "
        "Think Blade Runner 2049, Arrival, Dune tech realism, Ex Machina, The Creator."
    ),
    "retro": (
        "AUTHENTIC RETRO VINTAGE PHOTOGRAPH — analog film aesthetic, NOT modern, NOT digital, NOT clean. "
        "Describe as a nostalgic moment frozen in time: "
        "e.g. 'a 1970s living room with wood paneling, shag carpet, orange sofa, "
        "a lava lamp glowing on the coffee table, sunlight streaming through venetian blinds "
        "creating striped shadows on the wall. Kodak Portra 400 film look.' "
        "Describe: film grain texture, color casts (e.g. warm orange/amber shift), "
        "light leaks, soft focus from the lens. Think Polaroid, Super 8 film, analog photography aesthetic."
    ),
}

# Style-specific negative constraints — what DALL-E 3 must NOT produce for each style
STYLE_NEGATIVE_CONSTRAINTS = {
    "fantasy": "Do NOT generate photorealistic images, real photographs, anime style, or modern settings.",
    "cinematic": "Do NOT generate illustrations, cartoons, anime, flat design, or fantasy elements.",
    "standard": "Do NOT generate photographs, anime, flat vector art, or fantasy/sci-fi elements.",
    "anime": "Do NOT generate photorealistic images, western cartoons, 3D CGI, or real photographs.",
    "horror_style": "Do NOT generate cheerful, colorful, clean, cartoonish, or fantasy-adventure images. Avoid campy gore and avoid bright daylight.",
    "illustration": "Do NOT generate photorealistic images, photographs, 3D renders, or anime-style art.",
    "monochrome": "Do NOT generate any color — the image must be entirely black, white, and grey tones only. No sepia, no color tints.",
    "moody": "Do NOT generate bright, cheerful, or colorful images. No vibrant colors, no sunny scenes.",
    "documentary": "Do NOT generate glossy commercial beauty shots, fantasy imagery, CGI, or stylized illustration. Keep it grounded and authentic.",
    "photography": "Do NOT generate illustrations, paintings, anime, CGI, or any non-photorealistic art style.",
    "3d": "Do NOT generate photographs, 2D illustrations, flat design, or anime-style art.",
    "comic": "Do NOT generate photorealistic images, anime faces, painterly brushwork, or 3D CGI realism.",
    "sci-fi": "Do NOT generate medieval fantasy imagery, flat illustration, cartoon aesthetics, or present-day mundane environments unless futuristically modified.",
    "retro": "Do NOT generate modern clean digital art, bright colors, or contemporary photography.",
}


def build_structured_prompt(
    scene_description: str,
    topic: str,
    style: str,
    scene_index: int = 0,
    format_type: str = "9:16",
) -> str:
    """
    Two-layer prompt builder (no GPT call — instant, deterministic).

    Layer 1 — CONTENT: what happens in the scene (from scene_description)
    Layer 2 — STYLE:   visual style + lighting + camera + quality tags

    Returns a single structured prompt string ready for DALL-E 3.
    """
    layer = STYLE_LAYER.get(style, STYLE_LAYER["standard"])

    shot = CAMERA_SHOTS[scene_index % len(CAMERA_SHOTS)]

    style_override = layer.get("style_override", "")
    negative_rule = STYLE_NEGATIVE_CONSTRAINTS.get(style, "")
    aspect_rule = {
        "9:16": "VERTICAL 9:16 composition for mobile video, tall framing, subject and key action centered for a vertical canvas.",
        "16:9": "HORIZONTAL 16:9 widescreen composition, cinematic landscape framing, use full width of the frame intentionally.",
        "1:1": "SQUARE 1:1 composition, centered balanced framing, all important action must fit naturally inside a square canvas.",
    }.get(format_type, "HORIZONTAL 16:9 widescreen composition.")

    parts = [style_override]
    parts.append(scene_description.strip().rstrip("."))
    parts.append(aspect_rule)
    parts.append(layer["style_block"])
    parts.append(layer["lighting"])
    parts.append(f"{shot}, {layer['camera'].split(',', 1)[-1].strip()}")
    parts.append(layer["quality_tags"])
    parts.append(UNIVERSAL_QUALITY)

    if negative_rule:
        parts.append(f"IMPORTANT: {negative_rule}")

    return ". ".join(parts) + "."


def generate_prompt_from_categories(
    genre: str, sub_genre: str, style: str, details: str = ""
) -> str:
    """
    Translate raw UI categories (Genre / Sub-genre / Style) into a concrete
    visual prompt for image models via Claude.

    UI sends category *labels* only — no interpretation on the frontend.
    Claude converts them into a real visual scene: scene → atmosphere → style → tech tags.
    Returns English prompt string. Falls back to a simple joined string if Claude unavailable.
    """
    genre = _humanize_prompt_part(genre)
    sub_genre = _humanize_prompt_part(sub_genre)
    style = _humanize_prompt_part(style)
    details = _humanize_prompt_part(details)

    fallback_parts = [p for p in (genre, sub_genre, style, details) if p]
    fallback = ", ".join(fallback_parts) or "cinematic scene"

    if not anthropic_client:
        log("[ClaudePrompt] ANTHROPIC_API_KEY not set — returning fallback")
        return fallback

    system_msg = (
        "You are an image prompt generator. Output ONLY the prompt in English, "
        "nothing else — no preamble, no explanation, no markdown, no quotes.\n\n"
        "Input is UI selections: Genre, Sub-genre, Narrative Style, and optional User Details. "
        "These are ABSTRACT LABELS, not visual descriptions. Your job is to translate "
        "them into one concrete visual scene that an image model (DALL-E / Flux / SD) can render.\n\n"
        "If User Details are provided, they are the HIGHEST priority — "
        "the scene must revolve around that specific detail.\n\n"
        "Follow this exact structure in one paragraph (120–180 words):\n"
        "  1. SCENE — who/what is in frame, specific subject, pose, action\n"
        "  2. ATMOSPHERE — mood, weather, time of day, emotional tone matching the narrative style\n"
        "  3. STYLE — art direction, cinematic references, colour palette\n"
        "  4. TECHNICAL TAGS — camera angle, lens, lighting setup, quality tags "
        "(e.g. 'ultra detailed, sharp focus, 8k, cinematic lighting, shallow depth of field')\n\n"
        "Rules:\n"
        "  • Never output the category labels verbatim.\n"
        "  • Translate every selection into concrete visual content a viewer would SEE.\n"
        "  • English only. One paragraph. No lists, no headings."
    )
    user_msg = (
        f"Genre: {genre or '—'} / "
        f"Sub-genre: {sub_genre or '—'} / "
        f"Narrative Style: {style or '—'}"
    )
    if details:
        user_msg += f" / User Details (highest priority): {details}"

    try:
        resp = anthropic_client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=600,
            system=system_msg,
            messages=[{"role": "user", "content": user_msg}],
        )
        text_parts = []
        for block in getattr(resp, "content", []) or []:
            block_text = getattr(block, "text", None)
            if block_text:
                text_parts.append(block_text)
        prompt = "".join(text_parts).strip()
        prompt = re.sub(r"^```[a-z]*\s*", "", prompt)
        prompt = re.sub(r"```\s*$", "", prompt).strip().strip('"').strip("'")
        if not prompt:
            return fallback
        log(f"[ClaudePrompt] {genre}/{sub_genre}/{style}/details={details[:40]} -> {prompt[:120]}...")
        return prompt
    except Exception as e:
        log(f"[ClaudePrompt] Claude call failed: {e} — using fallback")
        return fallback


def enhance_image_prompt(
    scene_description: str,
    topic: str,
    style: str,
    scene_index: int = 0,
    format_type: str = "9:16",
) -> str:
    """
    Two-layer prompt system:
    1. build_structured_prompt() assembles the base structured prompt instantly (no API)
    2. GPT-4o expands it into a richer, more specific DALL-E 3 prompt (one GPT call)

    If GPT fails → falls back to the structured prompt directly (still much better than raw description).
    """
    layer = STYLE_LAYER.get(style, STYLE_LAYER["standard"])
    style_block = layer["style_block"]
    lighting = layer["lighting"]
    camera = layer["camera"]
    quality = layer["quality_tags"]
    shot = CAMERA_SHOTS[scene_index % len(CAMERA_SHOTS)]
    style_override = layer.get("style_override", "")

    negative_rule = STYLE_NEGATIVE_CONSTRAINTS.get(style, "")

    # Fallback structured prompt (used if GPT call fails)
    fallback_prompt = build_structured_prompt(
        scene_description, topic, style, scene_index, format_type
    )

    if not client:
        return fallback_prompt

    system_msg = (
        f"You are an expert DALL-E 3 prompt engineer. CRITICAL MISSION: preserve the visual style at ALL costs.\n\n"
        f"══════════════════════════════════════════\n"
        f"MANDATORY STYLE LOCK — THIS CANNOT BE CHANGED\n"
        f"══════════════════════════════════════════\n"
        f"EVERY prompt you write MUST start with this EXACT phrase (word for word):\n"
        f'"{style_override}"\n\n'
        f"This style declaration is NON-NEGOTIABLE. If the content conflicts with the style, "
        f"the STYLE WINS. Reinterpret the content to fit the style, never the other way around.\n\n"
        f"══════════════════════════════════════════\n"
        f"TWO-LAYER PROMPT STRUCTURE (after the style lock)\n"
        f"══════════════════════════════════════════\n"
        f"Layer 1 — STYLE ANCHOR: {style_block}\n"
        f"Layer 2 — CONTENT (adapted to the style above):\n"
        f"  [SUBJECT: who/what, exact appearance, pose, expression — described in terms of the style]\n"
        f"  [ENVIRONMENT: location, time of day, architectural/natural details — rendered in this style]\n"
        f"  [ATMOSPHERE: fog, particles, rain, smoke, volumetric effects — appropriate for this style]\n"
        f"  [LIGHTING: {lighting}]\n"
        f"  [CAMERA: {shot}, {camera}]\n"
        f"  [QUALITY: {quality}, {UNIVERSAL_QUALITY}]\n\n"
        f"══════════════════════════════════════════\n"
        f"ABSOLUTE RULES\n"
        f"══════════════════════════════════════════\n"
        f'1. START with: "{style_override}"\n'
        f'2. IMMEDIATELY after: "{style_block.split(",")[0].strip()}."\n'
        f"3. {negative_rule}\n"
        f"4. Be hyper-specific: exact colors, textures, materials — all consistent with the style\n"
        f"5. Forbidden words: 'beautiful', 'amazing', 'stunning', 'gorgeous'\n"
        f"6. Output: 150-220 words, ONE paragraph, English only, no markdown, no JSON\n"
        f"7. End with quality tags: ultra detailed, sharp focus, high resolution, {quality}"
    )

    user_msg = (
        f"Overall video topic: {topic}\n"
        f"Scene concept: {scene_description}\n"
        f"Scene position in video: #{scene_index + 1}\n\n"
        f"CRITICAL: Start your output with EXACTLY this phrase:\n"
        f'"{style_override}"\n\n'
        f"Then immediately continue with '{style_block.split(',')[0].strip()}.' and describe the scene "
        f"entirely through the lens of this style. The style is NON-NEGOTIABLE."
    )

    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=450,
            temperature=0.65,
        )
        enhanced = resp.choices[0].message.content.strip()
        # Strip markdown fences if any
        enhanced = re.sub(r"^```[a-z]*\s*", "", enhanced)
        enhanced = re.sub(r"```\s*$", "", enhanced).strip()

        # Safety: force style_override at the very start
        if style_override and not enhanced.startswith(style_override[:30]):
            enhanced = f"{style_override} {enhanced}"

        # Also force style anchor phrase if not present
        anchor = style_block.split(",")[0].strip().upper()
        if anchor[:20] not in enhanced.upper()[:120]:
            enhanced = (
                f"{style_override} {style_block.split(',')[0].strip()}. {enhanced}"
            )

        log(f"[PromptEnhancer] scene={scene_index} style={style} | {enhanced[:130]}...")
        return enhanced
    except Exception as e:
        log(
            f"[PromptEnhancer] GPT call failed (scene {scene_index}): {e} — using structured fallback"
        )
        return fallback_prompt


def generate_script(
    topic,
    lang="en",
    focus="",
    style="fantasy",
    duration=60,
    subtopic="",
    story_style="intrigue",
    visual_style_hint="",
):
    if not client:
        log("[ScriptGen] OpenAI unavailable — using local fallback script")
        return build_local_script(topic, lang, duration, subtopic, story_style, focus)
    lang_hint = LANG_PROMPTS.get(lang, "in English")
    localized_copy = LOCALIZED_SCRIPT_COPY.get(lang, LOCALIZED_SCRIPT_COPY["en"])
    strict_lang_note = localized_copy["strict_note"]

    # Normalize user-chosen values
    topic_clean = _humanize_prompt_part(topic) if topic else ""
    subtopic_clean = _humanize_prompt_part(subtopic) if subtopic else ""
    focus_clean = _humanize_prompt_part(focus) if focus else ""
    # Legacy voice IDs that might leak into focus — ignore them
    if focus_clean.lower() in ("random", "ava", "andrew"):
        focus_clean = ""

    # Build the single authoritative subject the script MUST be about
    subject_parts = []
    if topic_clean: subject_parts.append(topic_clean)
    if subtopic_clean and subtopic_clean.lower() != topic_clean.lower():
        subject_parts.append(subtopic_clean)
    subject_line = " → ".join(subject_parts) if subject_parts else topic_clean or "topic"
    primary_subject = subtopic_clean or topic_clean or "topic"

    log(
        f"[ScriptGen] Brief: topic='{topic_clean}' subtopic='{subtopic_clean}' "
        f"focus='{focus_clean}' story_style='{story_style}'"
    )

    focus_hint = f" User-specified focus (MANDATORY): {focus_clean}." if focus_clean else ""
    subtopic_hint = f" Narrow the topic to: {subtopic_clean}." if subtopic_clean else ""
    visual_hint = STYLE_VISUAL_HINTS.get(style, STYLE_VISUAL_HINTS["fantasy"])

    # ── Story style definitions ──────────────────────────────────────────────
    STORY_STYLE_PROMPTS = {
        "intrigue": (
            "NARRATIVE STYLE — INTRIGUE: Build tension scene by scene. Each scene must raise the stakes higher "
            "than the previous one. Drop hints but never fully reveal — keep the viewer on the edge. "
            "Use phrases like 'but nobody knew...', 'what happened next shocked everyone...', 'the truth was far darker...'."
        ),
        "mystery": (
            "NARRATIVE STYLE — MYSTERY: Frame the entire story around an unanswered question. Open with a "
            "puzzling fact that defies explanation. Each scene adds a layer of confusion, not clarity. "
            "End every scene with a new question. The final scene must close with an open question to the audience."
        ),
        "shock": (
            "NARRATIVE STYLE — SHOCK: Lead every scene with a fact so surprising it breaks the viewer's mental model. "
            "Use 'Nobody expected...', 'The data showed something impossible...', 'Scientists were speechless...'. "
            "Each revelation must feel more shocking than the last. Maximise cognitive dissonance."
        ),
        "mystic": (
            "NARRATIVE STYLE — MYSTIC: Treat every event as potentially supernatural or beyond rational explanation. "
            "Reference unexplained phenomena, eerie coincidences, patterns that defy logic. "
            "Use atmospheric, foreboding language. Leave room for the viewer to believe in the unknown."
        ),
        "paradox": (
            "NARRATIVE STYLE — PARADOX: Structure the story around a central contradiction that seems impossible. "
            "Show how two opposing truths can both be real. Challenge the viewer's assumptions with each scene. "
            "Use phrases like 'The more they learned, the less they understood...', 'Logic said no, but reality said yes...'."
        ),
        "cliffhanger": (
            "NARRATIVE STYLE — CLIFFHANGER: End every single scene on an unresolved tension that forces the viewer "
            "to keep watching. Never resolve one scene fully before opening the next dilemma. "
            "The voiceover for each scene must feel incomplete — as if something massive is about to happen. "
            "Final scene must end with the most gripping open question of all."
        ),
        "horror": (
            "NARRATIVE STYLE — HORROR: Build a deeply unsettling atmosphere scene by scene. Use darkness, isolation, "
            "and the unknown as your primary tools. Open with something familiar turning wrong. Each scene should "
            "increase dread — use phrases like 'It was then that...', 'Something was wrong with...', 'The silence broke...'. "
            "Reference shadows, sounds in the dark, things moving at the edge of vision. "
            "The final scene must leave the viewer with genuine unease."
        ),
        "adventure": (
            "NARRATIVE STYLE — ADVENTURE: Lead with action and discovery. Every scene should feel like a new challenge "
            "or revelation. Use phrases like 'But the journey wasn't over...', 'What they found next changed everything...', "
            "'Against all odds...'. Open with stakes or a quest. Build momentum through obstacles, narrow escapes, "
            "and moments of triumph. End each scene with the next obstacle revealed."
        ),
    }

    # ── Hook & ending templates ──────────────────────────────────────────────
    HOOK_STARTERS = LOCALIZED_HOOKS.get(lang, LOCALIZED_HOOKS["en"])
    ENDING_QUESTIONS = LOCALIZED_ENDINGS.get(lang, LOCALIZED_ENDINGS["en"])

    # ── Random angles to force topic diversity ───────────────────────────────
    RANDOM_ANGLES = [
        "Explore the most obscure and forgotten aspect of this topic that mainstream sources ignore.",
        "Focus on a single real person whose story encapsulates the whole topic.",
        "Tell the story backwards — start from the shocking conclusion, work back to the origin.",
        "Find the most counterintuitive, paradoxical or ironic angle on this topic.",
        "Zoom in on one specific moment in time that changed everything about this topic.",
        "Explore the dark or hidden side that is rarely discussed publicly.",
        "Tell it through the eyes of someone who witnessed it firsthand.",
        "Compare this topic to something completely unrelated to reveal a surprising parallel.",
        "Focus on what almost happened — the near-miss version of history.",
        "Expose the biggest misconception people have about this topic.",
        "Tell the story of the underdog or the forgotten figure connected to this topic.",
        "Find the most recent surprising development that changes how we see this topic.",
        "Explore the extreme edge case — the most unusual example within this topic.",
        "Tell the story from the perspective of the villain or the sceptic.",
        "Focus on the numbers — one jaw-dropping statistic that reframes everything.",
        "Find the moment everything went wrong — and what it reveals.",
        "Explore what this topic looks like in a completely different culture or country.",
        "Tell the story of the invention, discovery, or accident that started it all.",
        "Zoom in on the strangest unanswered question that experts still debate.",
        "Focus on the chain reaction — one small event that triggered massive consequences.",
    ]

    # ── Unique session seed for GPT diversity ────────────────────────────────
    session_seed = uuid.uuid4().hex[:8]
    rand_angle = random.choice(RANDOM_ANGLES)
    # If the user gave explicit details, their focus IS the angle — don't override
    if focus_clean:
        rand_angle = (
            f"Build the entire story specifically around: {focus_clean}. "
            f"Every scene must directly explore this aspect of {primary_subject}."
        )
    rand_hook = random.choice(HOOK_STARTERS).replace("{topic}", str(primary_subject))
    rand_ending = random.choice(ENDING_QUESTIONS)
    # Pick 3 random non-repeating hooks for the hook examples
    hook_sample = random.sample(HOOK_STARTERS, min(4, len(HOOK_STARTERS)))
    hook_sample[0] = rand_hook  # make sure our chosen hook is first
    ending_sample = random.sample(ENDING_QUESTIONS, min(3, len(ENDING_QUESTIONS)))
    ending_sample[0] = rand_ending

    story_style_instruction = STORY_STYLE_PROMPTS.get(
        story_style, STORY_STYLE_PROMPTS["intrigue"]
    )
    hook_examples = " | ".join(hook_sample[:4])
    ending_examples = " | ".join(ending_sample[:3])

    # Calculate number of scenes: 1 scene per 8-10 seconds of content
    target_scenes = max(3, min(10, round(duration / 8)))

    # OpenAI TTS speaks at ~3.8 words/sec naturally.
    # Target voiceover fills ~90% of the scene duration — no silence gaps.
    words_per_sec = 3.8
    avg_dur = duration / target_scenes
    target_words_per_scene = int(avg_dur * words_per_sec * 0.90)

    # Build example duration distribution
    base = duration // target_scenes
    rem = duration % target_scenes
    dist_example = [base] * (target_scenes - rem) + [base + 1] * rem

    story_style_label = STORY_STYLE_PROMPTS.get(story_style, STORY_STYLE_PROMPTS["intrigue"]).split(":", 1)[0]

    user_brief = (
        f"═══════════════════════════════════════════\n"
        f"USER BRIEF — THE SCRIPT MUST OBEY EVERY LINE BELOW\n"
        f"═══════════════════════════════════════════\n"
        f"  • GENRE (top-level topic): {topic_clean or '—'}\n"
        f"  • SUBTOPIC (narrow focus inside the genre): {subtopic_clean or '—'}\n"
        f"  • USER DETAILS (exact angle user requested): {focus_clean or '—'}\n"
        f"  • NARRATIVE STYLE: {story_style_label}\n"
        f"  • PRIMARY SUBJECT OF THE VIDEO: {primary_subject}"
        f"{(' — specifically: ' + focus_clean) if focus_clean else ''}\n"
        f"  • THE TITLE AND EVERY VOICEOVER MUST BE ABOUT THIS EXACT SUBJECT. "
        f"Do NOT drift to a different topic. Do NOT generalise to the parent genre "
        f"if a subtopic is given. Do NOT ignore user details.\n\n"
    )

    system_msg = (
        f"You are a brilliant creative director and viral script writer for short-form video. "
        f"You understand nuance, context, and temporal perspective.\n\n"
        f"{user_brief}"
        f"TOPIC CHAIN: {subject_line}.{subtopic_hint} Write {lang_hint}.{focus_hint}\n\n"
        f"STRICT LANGUAGE LOCK: {strict_lang_note} "
        f"The fields 'title' and every 'voiceover' line must contain only the selected language. "
        f"Do not mix languages. Do not add English words if the selected language is not English.\n\n"
        f"═══════════════════════════════════════════\n"
        f"TEMPORAL AWARENESS — CRITICAL\n"
        f"═══════════════════════════════════════════\n"
        f"You MUST understand the temporal context of the topic:\n"
        f"  - If the topic is about a FUTURE event (e.g. year 2030, Mars mission 2040, AI in 2050) → "
        f"write as a SPECULATION, PREDICTION, or HYPOTHESIS about what COULD happen. "
        f"Use conditional tense: 'could', 'might', 'is expected to', 'scientists predict', 'if current trends continue'. "
        f"Frame it as a glimpse into a possible future, NOT as something that already happened.\n"
        f"  - If the topic is about a PAST event → write as history, with facts and dates.\n"
        f"  - If the topic is about an ONGOING phenomenon → write in present tense with current data.\n"
        f"  - If the topic is a WHAT-IF → treat it as a thought experiment.\n"
        f"NEVER write about a future year as if it has already passed. "
        f"Year 2030 is in the FUTURE — describe predictions, projections, and possibilities.\n\n"
        f"═══════════════════════════════════════════\n"
        f"UNIQUENESS DIRECTIVE\n"
        f"═══════════════════════════════════════════\n"
        f"Session ID: {session_seed} — this script MUST be completely unique.\n"
        f"CHOSEN ANGLE: {rand_angle}\n"
        f"Follow this angle. Find a specific, surprising entry point. No generic facts.\n\n"
        f"═══════════════════════════════════════════\n"
        f"STORY ARCHITECTURE\n"
        f"═══════════════════════════════════════════\n"
        f"Follow this viral structure:\n"
        f'  Scene 1 — HOOK: Open with this (or a variation): "{rand_hook}"\n'
        f"  Scene 2 — CONTEXT: Establish the situation with concrete, verifiable details\n"
        f"  Scene 3 — TWIST: Introduce the unexpected, the counterintuitive, the paradox\n"
        f"  Scene 4+ — ESCALATION: Each scene raises the stakes. New revelation > previous one\n"
        f"  Last scene — OPEN QUESTION: End with one of: {ending_examples}\n\n"
        f"Every voiceover sentence must contain NEW information. No filler. No repetition.\n\n"
        f"═══════════════════════════════════════════\n"
        f"NARRATIVE STYLE\n"
        f"═══════════════════════════════════════════\n"
        f"{story_style_instruction}\n\n"
        f"═══════════════════════════════════════════\n"
        f"VOICEOVER RULES\n"
        f"═══════════════════════════════════════════\n"
        f"- TTS speaks at ~{words_per_sec} words/sec → write ~{target_words_per_scene} words per scene\n"
        f"- Every sentence must advance the story. Zero fluff.\n"
        f"- Use short punchy sentences for impact. Long sentences for context.\n"
        f"- Emotional pauses: use '...' sparingly for dramatic effect\n"
        f"- Match the narrative tone: tense, gripping, suspenseful\n\n"
        f"Total: {duration} seconds, {target_scenes} scenes. Distribution: {dist_example}\n\n"
        f"═══════════════════════════════════════════\n"
        f"IMAGE DESCRIPTION — EXACT FORMAT REQUIRED\n"
        f"═══════════════════════════════════════════\n"
        f"image_description feeds DIRECTLY into DALL-E 3. Use comma-separated descriptors, English only.\n\n"
        f"MANDATORY FORMAT (copy this structure for every scene):\n"
        f"  [specific location + time period + key props], [CHARACTER: age/gender/hair/eyes/build/clothing, exact pose/action], [shot type], [lighting], cinematic, hyper-detailed, 8k, photorealism. No modern elements, no text, no graphic gore.\n\n"
        f"REAL EXAMPLE — Scene about Rasputin at the palace:\n"
        f"  \"Imperial palace boudoir, winter 1906, velvet drapes, gilt icons, soft candlelight, a 50s male mystic, gaunt face, long unkempt dark hair and beard, blue eyes, tall lean, worn peasant coat, leaning over a sick child in bed, a 30s female empress in ornate black gown standing close, medium shot, warm golden candlelight, cinematic photorealism, 8k. No modern elements, no text, no graphic gore.\"\n\n"
        f"CHARACTER CONSISTENCY — THE MOST IMPORTANT RULE:\n"
        f"  Before writing scenes, define the main character's appearance as one string:\n"
        f"  e.g. \"a 50s male mystic, gaunt face, long unkempt dark hair and beard, blue eyes, tall lean, worn peasant coat\"\n"
        f"  Then paste this EXACT string into EVERY scene where this character appears. Word for word. Never change it.\n\n"
        f"SCENE-VOICEOVER MATCH — CRITICAL:\n"
        f"  If voiceover says 'the general signed the treaty in 1918' → image shows the general signing a document at a table, 1918 setting.\n"
        f"  If voiceover says 'crowds stormed the palace' → image shows crowds storming a palace gate.\n"
        f"  NEVER show a generic background when the voiceover describes a specific action.\n\n"
        + (
            f"VISUAL ATMOSPHERE (apply to all scenes): {visual_style_hint[:300]}\n\n"
            if visual_style_hint else ""
        )
        + f"Past events → historically accurate. Future events → futuristic/speculative imagery.\n\n"
        f"Return ONLY valid JSON:\n"
        '{{"title":"Video title (max 60 chars)","scenes":[{{"duration":X,"stock_query":"3-6 English stock search keywords","image_description":"...","voiceover":"..."}}]}}\n'
        f"Total durations MUST sum exactly to {duration}. "
        f"Each voiceover MUST be ~{target_words_per_scene} words."
    )
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_msg},
                {
                    "role": "user",
                    "content": (
                        f"[Session {session_seed}] Create a UNIQUE viral short-video script.\n"
                        f"EXACT SUBJECT: {primary_subject}"
                        f"{(' — SPECIFICALLY: ' + focus_clean) if focus_clean else ''}.\n"
                        f"Parent genre (context only, do not drift to it): {topic_clean or '—'}.\n"
                        f"Apply this angle: {rand_angle}\n"
                        f"IMPORTANT TEMPORAL CHECK: If this topic involves future dates, predictions, or has not happened yet — "
                        f"write as speculation/prediction, NOT as past tense. Use 'could', 'might', 'is expected to'. "
                        f"If it's about the past — write as history. Present — present tense.\n"
                        f"Write {lang_hint}. Story style: {story_style} — follow the STORY_STYLE rules from the system prompt.\n"
                        f"{strict_lang_note}\n"
                        f"Total: exactly {duration} seconds, {target_scenes} scenes. "
                        f"Each voiceover: ~{target_words_per_scene} words of gripping narrator speech.\n"
                        f'Start scene 1 with this hook: "{rand_hook}". End the last scene with: "{rand_ending}".\n'
                        f"CHARACTER TEMPLATE STEP (do this before writing scenes):\n"
                        f"  1. Identify the 1-3 main characters/subjects that appear visually in this video.\n"
                        f"  2. For EACH: define age range, gender, hair (color+style), eye color, build, exact clothing.\n"
                        f"     Example: 'a 50s male mystic, gaunt face, long unkempt dark hair and beard, blue eyes, tall lean, worn peasant coat'\n"
                        f"  3. Copy this EXACT string into EVERY image_description where that character appears.\n"
                        f"     NEVER describe the same character differently in different scenes.\n\n"
                        f"FINAL REMINDER: Every scene — title, voiceover, image_description — must be about "
                        f"'{primary_subject}'"
                        f"{(' with the angle: ' + focus_clean) if focus_clean else ''}. "
                        f"If the subtopic is '{subtopic_clean}', the video is NOT about the broader genre — it is about '{subtopic_clean}'."
                    ),
                },
            ],
            response_format={"type": "json_object"},
            max_tokens=6000,
            temperature=1.1,
        )
        content = response.choices[0].message.content.strip()
        content = re.sub(r"^```json\s*", "", content)
        content = re.sub(r"```\s*$", "", content)
        return json.loads(content)
    except Exception as e:
        log(f"[ScriptGen] OpenAI failed: {e}")
        if anthropic_client:
            log("[ScriptGen] Falling back to Claude for script generation...")
            return _generate_script_claude(system_msg, primary_subject, topic_clean, subtopic_clean,
                                           focus_clean, rand_angle, rand_hook, rand_ending,
                                           lang_hint, story_style, strict_lang_note,
                                           duration, target_scenes, target_words_per_scene)
        log("[ScriptGen] No Claude key either — using local fallback")
        return build_local_script(topic_clean, lang, duration, subtopic_clean, story_style, focus_clean)


def _generate_script_claude(system_msg, primary_subject, topic_clean, subtopic_clean,
                            focus_clean, rand_angle, rand_hook, rand_ending,
                            lang_hint, story_style, strict_lang_note,
                            duration, target_scenes, target_words_per_scene):
    user_msg = (
        f"Create a UNIQUE viral short-video script.\n"
        f"EXACT SUBJECT: {primary_subject}"
        f"{(' — SPECIFICALLY: ' + focus_clean) if focus_clean else ''}.\n"
        f"Parent genre (context only): {topic_clean or '—'}.\n"
        f"Apply this angle: {rand_angle}\n"
        f"Write {lang_hint}. Story style: {story_style}.\n"
        f"{strict_lang_note}\n"
        f"Total: exactly {duration} seconds, {target_scenes} scenes. "
        f"Each voiceover: ~{target_words_per_scene} words.\n"
        f'Start scene 1 with hook: "{rand_hook}". End last scene with: "{rand_ending}".\n\n'
        f"CHARACTER TEMPLATE: Before writing scenes, define each main character as one string "
        f"(age, gender, hair, eyes, build, clothing) and paste it identically into every scene.\n\n"
        f"FINAL REMINDER: every voiceover and image_description must be about '{primary_subject}'. "
        f"Return ONLY valid JSON matching the schema in the system prompt."
    )
    resp = anthropic_client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=6000,
        system=system_msg,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(getattr(b, "text", "") for b in (getattr(resp, "content", []) or []))
    raw = re.sub(r"^```json\s*", "", raw.strip())
    raw = re.sub(r"```\s*$", "", raw).strip()
    # Claude sometimes wraps JSON in text — extract the first {...}
    m = re.search(r'\{.*\}', raw, re.DOTALL)
    if m:
        raw = m.group(0)
    return json.loads(raw)


# ─── Image Generation ───────────────────────────────────────────────────────────


def generate_image(
    description, style, output_path, format_type, topic="", scene_index=0, n_variants=1, stock_query=""
):
    """
    Generate one image for a scene.

    Pipeline:
    1. enhance_image_prompt() → structured two-layer DALL-E 3 prompt (GPT-4o)
    2. DALL-E 3 generates n_variants images
    3. If n_variants > 1 → GPT-4o picks the best URL (visual quality judge)
    4. Downloads chosen image with timeout=60s
    5. Retries up to 3 times with exponential backoff on transient errors

    Args:
        scene_index:  position in video (0-based) — used for camera shot rotation
        n_variants:   how many DALL-E images to generate; best is picked if > 1
    """
    import urllib.request
    import time

    size = {
        "9:16": "1024x1792",
        "16:9": "1792x1024",
        "1:1": "1024x1024",
    }.get(format_type, "1792x1024")

    # Get per-style DALL-E style parameter:
    # "natural" → respects non-photo styles (anime, fantasy, illustration, monochrome, retro)
    # "vivid"   → more dramatic/saturated, better for cinematic, photography, 3d, moody
    layer = STYLE_LAYER.get(style, STYLE_LAYER["standard"])
    dall_e_style = layer.get("dall_e_style", "vivid")

    dall_e_prompt = build_structured_prompt(
        description, topic or description, style, scene_index, format_type
    )
    log(
        f"[ImageGen] scene={scene_index} style={style} dall_e_style={dall_e_style} variants={n_variants}"
    )
    log(f"[ImageGen] prompt: {dall_e_prompt[:160]}...")

    stock_query = (stock_query or "").strip() or _extract_stock_query(description)

    # 1. Google Imagen 4 Ultra — primary high-quality generator.
    if GEMINI_API_KEY:
        try:
            log(f"[ImageGen] provider=imagen model={IMAGEN_MODEL} format={format_type}")
            imagen_generate_image(dall_e_prompt, format_type, output_path)
            log(f"  [ImageGen] scene={scene_index} saved via Imagen → {output_path}")
            return output_path
        except Exception as e:
            log(f"[ImageGen] Imagen failed, falling back: {e}")

    use_stock = IMAGE_SOURCE_MODE in {"stock", "hybrid"}

    # 2. Pexels — real stock photos, only when IMAGE_SOURCE_MODE=stock|hybrid.
    if use_stock and PEXELS_API_KEY:
        try:
            log(f"[ImageGen] provider=pexels query='{stock_query}'")
            pexels_search_image(stock_query, format_type, output_path)
            log(f"  [ImageGen] scene={scene_index} saved via Pexels → {output_path}")
            return output_path
        except Exception as e:
            log(f"[ImageGen] Pexels failed, falling back: {e}")

    # 3. Pixabay — real stock photos, only when IMAGE_SOURCE_MODE=stock|hybrid.
    if use_stock and PIXABAY_API_KEY:
        try:
            log(f"[ImageGen] provider=pixabay query='{stock_query}'")
            pixabay_search_image(stock_query, format_type, output_path)
            log(f"  [ImageGen] scene={scene_index} saved via Pixabay → {output_path}")
            return output_path
        except Exception as e:
            log(f"[ImageGen] Pixabay failed, falling back: {e}")

    # 4. Wikimedia Commons — free, only when IMAGE_SOURCE_MODE=stock|hybrid.
    if use_stock:
        try:
            log(f"[ImageGen] provider=wikimedia query='{stock_query}'")
            wikimedia_search_image(stock_query, format_type, output_path)
            log(f"  [ImageGen] scene={scene_index} saved via Wikimedia → {output_path}")
            return output_path
        except Exception as e:
            log(f"[ImageGen] Wikimedia failed, falling back: {e}")

    # 5. Together — AI fallback if stock search failed
    if TOGETHER_API_KEY:
        try:
            log(f"[ImageGen] provider=together FLUX.1-schnell-Free format={format_type}")
            together_generate_image(dall_e_prompt, format_type, output_path)
            log(f"  [ImageGen] scene={scene_index} saved via Together → {output_path}")
            return output_path
        except Exception as e:
            log(f"[ImageGen] Together failed, falling back: {e}")

    # 6. fal.ai — FLUX.1 AI generation ($15 free credit, add FAL_KEY to .env)
    if FAL_KEY:
        try:
            log(f"[ImageGen] provider=fal.ai FLUX.1 format={format_type}")
            fal_generate_image(dall_e_prompt, format_type, output_path)
            log(f"  [ImageGen] scene={scene_index} saved via fal.ai → {output_path}")
            return output_path
        except Exception as e:
            log(f"[ImageGen] fal.ai failed, falling back: {e}")

    # 7. Pollinations.AI — free, no key required, flux-realism model
    try:
        log(f"[ImageGen] provider=pollinations flux-realism format={format_type}")
        pollinations_generate_image(dall_e_prompt, format_type, output_path, seed=scene_index * 42 + 7)
        log(f"  [ImageGen] scene={scene_index} saved via Pollinations → {output_path}")
        return output_path
    except Exception as e:
        log(f"[ImageGen] Pollinations failed, falling back: {e}")

    if hf_client:
        try:
            log(
                f"[ImageGen] provider=huggingface model={HF_IMAGE_MODEL} format={format_type}"
            )
            huggingface_generate_image(dall_e_prompt, format_type, output_path)
            log(f"  [ImageGen] scene={scene_index} saved via HuggingFace → {output_path}")
            return output_path
        except Exception as e:
            log(f"[ImageGen] HuggingFace failed, falling back: {e}")

    if REPLICATE_API_TOKEN:
        try:
            log(
                f"[ImageGen] provider=replicate model={REPLICATE_IMAGE_MODEL} format={format_type}"
            )
            replicate_generate_image(dall_e_prompt, format_type, output_path)
            log(f"  [ImageGen] scene={scene_index} saved via Replicate → {output_path}")
            return output_path
        except Exception as e:
            log(f"[ImageGen] Replicate failed, falling back: {e}")

    if not client:
        raise RuntimeError("No image provider available: set REPLICATE_API_TOKEN or valid OPENAI_API_KEY")

    # DALL-E 3 only supports n=1; for multiple variants we call it n times
    n_variants = max(1, min(n_variants, 3))

    last_error = None
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            candidate_urls = []
            for v in range(n_variants):
                # Slightly vary temperature by adding a variation hint for variants 2+
                prompt_v = dall_e_prompt
                if v > 0:
                    variation_hints = [
                        " Slightly different angle and composition.",
                        " Alternative framing and lighting setup.",
                    ]
                    prompt_v = dall_e_prompt + variation_hints[v - 1]
                result = client.images.generate(
                    model="dall-e-3",
                    prompt=prompt_v,
                    size=size,
                    style=dall_e_style,
                    quality="hd",
                    n=1,
                )
                candidate_urls.append(result.data[0].url)
                log(f"  [ImageGen] variant {v + 1}/{n_variants} generated")

            # Pick best image
            if len(candidate_urls) == 1:
                best_url = candidate_urls[0]
            else:
                best_url = _pick_best_image(candidate_urls, description, style)

            # Download with timeout
            req = urllib.request.Request(
                best_url, headers={"User-Agent": "Mozilla/5.0"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                with open(output_path, "wb") as f:
                    f.write(resp.read())

            log(f"  [ImageGen] scene={scene_index} saved → {output_path}")
            return output_path

        except Exception as e:
            last_error = e
            err_str = str(e)

            # Content policy → sanitise prompt and retry once
            if (
                "content_policy" in err_str.lower()
                or "safety" in err_str.lower()
                or "400" in err_str
            ):
                log(
                    f"  [ImageGen] Content policy on attempt {attempt} — sanitising prompt"
                )
                safe_layer = STYLE_LAYER.get(style, STYLE_LAYER["standard"])
                safe_override = safe_layer.get("style_override", "")
                dall_e_prompt = (
                    f"{safe_override} {safe_layer['style_block']}. {description[:150]}. "
                    f"{safe_layer['lighting']}. {safe_layer['camera']}. "
                    f"{safe_layer['quality_tags']}. Safe for all audiences."
                )
                if attempt >= 2:
                    raise RuntimeError(f"Content policy block: {err_str[:200]}") from e
                continue

            log(
                f"  [ImageGen] Attempt {attempt}/{max_attempts} failed: {err_str[:200]}"
            )
            if attempt < max_attempts:
                wait = 2**attempt  # 2s, 4s
                log(f"  [ImageGen] Retrying in {wait}s...")
                time.sleep(wait)

    raise RuntimeError(
        f"Image generation failed after {max_attempts} attempts: {last_error}"
    ) from last_error


def _pick_best_image(urls: list, scene_description: str, style: str) -> str:
    """
    Ask GPT-4o Vision to pick the best image from a list of URLs.
    Returns the URL of the winner. Falls back to urls[0] on any error.
    """
    if not client or len(urls) <= 1:
        return urls[0]
    try:
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"You are a professional visual director. "
                            f'I generated {len(urls)} image variants for this scene: "{scene_description}".\n'
                            f"Target style: {style}.\n\n"
                            f"Pick the BEST image based on:\n"
                            f"1. Cinematic quality and drama\n"
                            f"2. How well it matches the '{style}' style\n"
                            f"3. Composition and visual impact\n"
                            f"4. Detail and sharpness\n\n"
                            f"Reply with ONLY the number: 1, 2, or 3. Nothing else."
                        ),
                    },
                    *[
                        {
                            "type": "image_url",
                            "image_url": {"url": url, "detail": "low"},
                        }
                        for url in urls
                    ],
                ],
            }
        ]
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=5,
        )
        choice = resp.choices[0].message.content.strip()
        idx = int(choice) - 1
        if 0 <= idx < len(urls):
            log(f"  [ImagePicker] chose variant {idx + 1}/{len(urls)}")
            return urls[idx]
    except Exception as e:
        log(f"  [ImagePicker] failed: {e} — using variant 1")
    return urls[0]


# ─── TTS via OpenAI ────────────────────────────────────────────────────────────


def synthesize_speech_tts(
    voice_id, texts, output_dir, lang="en", tts_speed=1.0, tts_instructions=""
):
    audio_paths = []
    OPENAI_VOICES = (
        "alloy",
        "echo",
        "fable",
        "onyx",
        "nova",
        "shimmer",
        "ash",
        "ballad",
        "coral",
        "sage",
        "verse",
    )
    openai_voice = voice_id if voice_id in OPENAI_VOICES else OPENAI_TTS_VOICE

    # ── edge-tts (Microsoft Neural TTS, free) ──────────────────────────────────
    if voice_id.startswith("edge_"):
        # Parse voice ID format: edge_<VoiceName>[|rate=+15%][|pitch=-8Hz]
        raw = voice_id[len("edge_") :]  # strip "edge_" prefix
        edge_rate = "+0%"
        edge_pitch = "+0Hz"
        if "|" in raw:
            parts = raw.split("|")
            edge_voice = parts[0]
            for part in parts[1:]:
                if part.startswith("rate="):
                    edge_rate = part[5:]
                elif part.startswith("pitch="):
                    edge_pitch = part[6:]
        else:
            edge_voice = raw  # e.g. "ru-RU-DmitryNeural"
        log(
            f"[VideoGen] Using edge-tts (voice={edge_voice}, rate={edge_rate}, pitch={edge_pitch})"
        )
        import asyncio
        import edge_tts as _edge_tts

        total_segs = len(texts)
        for i, seg in enumerate(texts):
            out = Path(output_dir) / f"segment_{i:03d}.wav"
            mp3 = out.with_suffix(".mp3")
            pct = 52 + int(i / max(total_segs, 1) * 22)
            progress(pct, f"Озвучиваю сегмент {i + 1}/{total_segs}...")
            try:

                async def _synth(
                    text, path, _voice=edge_voice, _rate=edge_rate, _pitch=edge_pitch
                ):
                    comm = _edge_tts.Communicate(text, _voice, rate=_rate, pitch=_pitch)
                    await comm.save(str(path))

                asyncio.run(_synth(seg["text"], mp3))

                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-i",
                        str(mp3),
                        "-ar",
                        "24000",
                        "-ac",
                        "1",
                        str(out),
                    ],
                    check=True,
                    capture_output=True,
                )
                r = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        str(out),
                    ],
                    capture_output=True,
                    text=True,
                )
                tts_dur = float(r.stdout.strip()) if r.stdout.strip() else 0.0
                log(f"  Segment {i}: edge-tts={tts_dur:.2f}s")
            except Exception as e:
                log(f"edge-tts segment {i} failed: {e}")
                subprocess.run(
                    [
                        "ffmpeg",
                        "-f",
                        "lavfi",
                        "-i",
                        "anullsrc=r=24000:cl=mono",
                        "-t",
                        str(seg.get("duration", 5)),
                        "-ar",
                        "24000",
                        "-ac",
                        "1",
                        "-y",
                        str(out),
                    ],
                    check=True,
                    capture_output=True,
                )
            finally:
                Path(mp3).unlink(missing_ok=True)
            audio_paths.append(str(out))
        return audio_paths

    # ── Google TTS (gTTS) ─────────────────────────────────────────────────────
    if voice_id.startswith("gtts_"):
        # voice_id format: gtts_<lang> or gtts_<lang>_<tld>
        # e.g. gtts_ru, gtts_ru_com, gtts_en, gtts_uk
        parts = voice_id[len("gtts_") :].split("_")
        gtts_lang = parts[0] if parts else "ru"
        gtts_tld = parts[1] if len(parts) > 1 else "com"
        log(f"[VideoGen] Using Google TTS (lang={gtts_lang}, tld={gtts_tld})")

        if not _gtts_available:
            log("[VideoGen] WARNING: gtts not installed, falling through to OpenAI TTS")
        else:
            total_segs = len(texts)
            gtts_failed = False
            for i, seg in enumerate(texts):
                out = Path(output_dir) / f"segment_{i:03d}.wav"
                mp3 = out.with_suffix(".mp3")
                pct = 52 + int(i / max(total_segs, 1) * 22)
                progress(pct, f"Озвучиваю сегмент {i + 1}/{total_segs}...")
                try:
                    tts = _gTTS(seg["text"], lang=gtts_lang, tld=gtts_tld)
                    tts.save(str(mp3))
                    subprocess.run(
                        [
                            "ffmpeg",
                            "-y",
                            "-hide_banner",
                            "-loglevel",
                            "error",
                            "-i",
                            str(mp3),
                            "-ar",
                            "24000",
                            "-ac",
                            "1",
                            str(out),
                        ],
                        check=True,
                        capture_output=True,
                    )
                    r = subprocess.run(
                        [
                            "ffprobe",
                            "-v",
                            "error",
                            "-show_entries",
                            "format=duration",
                            "-of",
                            "default=noprint_wrappers=1:nokey=1",
                            str(out),
                        ],
                        capture_output=True,
                        text=True,
                    )
                    tts_dur = float(r.stdout.strip()) if r.stdout.strip() else 0.0
                    log(f"  Segment {i}: gTTS={tts_dur:.2f}s")
                except Exception as e:
                    log(f"gTTS segment {i} failed: {e}")
                    gtts_failed = True
                    subprocess.run(
                        [
                            "ffmpeg",
                            "-f",
                            "lavfi",
                            "-i",
                            "anullsrc=r=24000:cl=mono",
                            "-t",
                            str(seg.get("duration", 5)),
                            "-ar",
                            "24000",
                            "-ac",
                            "1",
                            "-y",
                            str(out),
                        ],
                        check=True,
                        capture_output=True,
                    )
                finally:
                    Path(mp3).unlink(missing_ok=True)
                audio_paths.append(str(out))
            if not gtts_failed:
                return audio_paths
            log("[VideoGen] gTTS had errors, falling through to OpenAI TTS")
            audio_paths = []

    # Try XTTS first if user has cloned voice file
    if voice_id not in ("random",) + OPENAI_VOICES:
        voice_file = VOICES_DIR / f"{voice_id}.wav"
        if not voice_file.exists():
            candidates = list(VOICES_DIR.glob(f"{voice_id}*.wav"))
            if candidates:
                voice_file = candidates[0]
        if voice_file.exists():
            try:
                from TTS.api import TTS

                tts = TTS(
                    "tts_models/multilingual/multi-speaker/xtts_v2",
                    gpu=False,
                    progress_bar=False,
                )
                for i, seg in enumerate(texts):
                    out = Path(output_dir) / f"segment_{i:03d}.wav"
                    tts.tts_to_file(
                        text=seg["text"],
                        speaker_wav=str(voice_file),
                        language=LANG_VOICE_MAP.get(lang, "en"),
                        file_path=str(out),
                    )
                    audio_paths.append(str(out))
                return audio_paths
            except Exception as e:
                log(f"XTTS failed: {e}, using OpenAI TTS")

    # ── GPT-4o Mini TTS — с поддержкой instructions и speed ──────────────────
    if voice_id.startswith("gpt4o_"):
        gpt4o_voice = voice_id[len("gpt4o_") :]
        GPT4O_VOICES = (
            "alloy",
            "echo",
            "fable",
            "onyx",
            "nova",
            "shimmer",
            "ash",
            "ballad",
            "coral",
            "sage",
            "verse",
        )
        if gpt4o_voice not in GPT4O_VOICES:
            gpt4o_voice = "onyx"
        log(
            f"[VideoGen] Using GPT-4o Mini TTS (voice={gpt4o_voice}, speed={tts_speed}, instructions={bool(tts_instructions)})"
        )
        total_segs = len(texts)
        for i, seg in enumerate(texts):
            out = Path(output_dir) / f"segment_{i:03d}.wav"
            mp3 = out.with_suffix(".mp3")
            pct = 52 + int(i / max(total_segs, 1) * 22)
            progress(pct, f"Озвучиваю сегмент {i + 1}/{total_segs}...")
            try:
                create_kwargs = dict(
                    model="gpt-4o-mini-tts",
                    voice=gpt4o_voice,
                    input=seg["text"],
                    response_format="mp3",
                )
                if tts_speed and tts_speed != 1.0:
                    create_kwargs["speed"] = float(tts_speed)
                if tts_instructions:
                    create_kwargs["instructions"] = tts_instructions
                response = client.audio.speech.create(**create_kwargs)
                mp3.write_bytes(response.read())
                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-i",
                        str(mp3),
                        "-ar",
                        "24000",
                        "-ac",
                        "1",
                        str(out),
                    ],
                    check=True,
                    capture_output=True,
                )
                r = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        str(out),
                    ],
                    capture_output=True,
                    text=True,
                )
                tts_dur = float(r.stdout.strip()) if r.stdout.strip() else 0.0
                log(
                    f"  Segment {i}: GPT4o-TTS={tts_dur:.2f}s (scene target={seg.get('duration', 5)}s)"
                )
                audio_paths.append(str(out))
            except Exception as e:
                log(f"GPT-4o Mini TTS segment {i} failed: {e}")
                target_dur = seg.get("duration", 5)
                subprocess.run(
                    [
                        "ffmpeg",
                        "-f",
                        "lavfi",
                        "-i",
                        f"anullsrc=r=24000:cl=mono",
                        "-t",
                        str(target_dur),
                        "-y",
                        str(out),
                    ],
                    capture_output=True,
                )
                audio_paths.append(str(out))
        return audio_paths

    # OpenAI TTS — simple and reliable: generate audio, normalize, pad/trim to exact duration
    log(f"[VideoGen] Using OpenAI TTS (voice={openai_voice})")
    total_segs = len(texts)
    for i, seg in enumerate(texts):
        out = Path(output_dir) / f"segment_{i:03d}.wav"
        target_dur = seg.get("duration", 5)
        mp3 = out.with_suffix(".mp3")
        # Progress: TTS spans roughly 52..74% of the full pipeline
        pct = 52 + int(i / max(total_segs, 1) * 22)
        progress(pct, f"Озвучиваю сегмент {i + 1}/{total_segs}...")
        try:
            response = client.audio.speech.create(
                model="tts-1-hd",
                voice=openai_voice,
                input=seg["text"],
                response_format="mp3",
                timeout=60.0,
            )
            mp3.write_bytes(response.read())

            # Convert mp3 → wav, keep natural TTS duration (no padding, no trim)
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(mp3),
                    "-ar",
                    "24000",
                    "-ac",
                    "1",
                    str(out),
                ],
                check=True,
                capture_output=True,
            )

            # Log actual vs target for diagnostics
            r = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(out),
                ],
                capture_output=True,
                text=True,
            )
            tts_dur = float(r.stdout.strip()) if r.stdout.strip() else 0.0
            log(f"  Segment {i}: TTS={tts_dur:.2f}s (scene target={target_dur}s)")

        except Exception as e:
            log(f"TTS segment {i} failed: {e}")
            # Fallback: silent segment of target duration
            subprocess.run(
                [
                    "ffmpeg",
                    "-f",
                    "lavfi",
                    "-i",
                    f"anullsrc=r=24000:cl=mono",
                    "-t",
                    str(target_dur),
                    "-ar",
                    "24000",
                    "-ac",
                    "1",
                    "-y",
                    str(out),
                ],
                check=True,
                capture_output=True,
            )
        finally:
            Path(mp3).unlink(missing_ok=True)

        audio_paths.append(str(out))
    return audio_paths


def generate_voice_preview(
    voice_id, lang="en", output_path=None, tts_speed=1.0, tts_instructions=""
):
    preview_dir = tempfile.mkdtemp(prefix="voice_preview_")
    sample = VOICE_PREVIEW_TEXT.get(lang, VOICE_PREVIEW_TEXT["en"])
    audio_paths = synthesize_speech_tts(
        voice_id,
        [{"text": sample, "duration": 4}],
        preview_dir,
        lang,
        tts_speed=tts_speed,
        tts_instructions=tts_instructions,
    )
    if not audio_paths:
        raise RuntimeError("Preview audio was not generated")
    src = Path(audio_paths[0])
    dst = Path(output_path) if output_path else src
    if dst != src:
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(src.read_bytes())
    return str(dst)


# ─── Subtitles from voiceover text (no Whisper) ────────────────────────────────


def generate_srt_from_script(scenes, audio_paths, output_srt, words_per_chunk=3):
    """
    Build an SRT file directly from the voiceover texts and actual audio durations.

    For each scene:
    - Measure the real audio duration via ffprobe.
    - Split the voiceover text into small chunks (≤ words_per_chunk words).
    - Distribute those chunks evenly across the audio duration.
    - Optionally inject emoji at the end of matching chunks.

    words_per_chunk=3 gives TikTok-style word-by-word flash.
    """

    def fmt_ts(t: float) -> str:
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int(round((t % 1) * 1000))
        return f"{h:02}:{m:02}:{s:02},{ms:03}"

    def get_audio_dur(path: str) -> float:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True,
            text=True,
        )
        try:
            return max(0.1, float(r.stdout.strip()))
        except ValueError:
            return 5.0

    def split_chunks(text: str, n: int):
        words = text.split()
        return (
            [" ".join(words[i : i + n]) for i in range(0, len(words), n)]
            if words
            else []
        )

    lines = []
    sub_idx = 1
    cursor = 0.0

    for scene, ap in zip(scenes, audio_paths):
        text = scene.get("voiceover", "").strip()
        dur = get_audio_dur(ap)

        if not text:
            cursor += dur
            continue

        chunks = split_chunks(text, words_per_chunk)
        if not chunks:
            cursor += dur
            continue

        chunk_dur = dur / len(chunks)
        for chunk in chunks:
            t_start = cursor
            t_end = cursor + chunk_dur
            # Auto-inject emoji if a keyword matches
            chunk_with_emoji = add_emojis_to_text(chunk)
            lines.append(
                f"{sub_idx}\n{fmt_ts(t_start)} --> {fmt_ts(t_end)}\n{chunk_with_emoji}\n"
            )
            sub_idx += 1
            cursor = t_end

    if lines:
        with open(output_srt, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        log(f"[SRT] Written {sub_idx - 1} subtitle entries (from voiceover text)")
        return output_srt

    log("[SRT] No subtitle entries generated")
    return None


# ─── Video Composition ────────────────────────────────────────────────────────

# ─── Video Composition ────────────────────────────────────────────────────────


def compose_video(
    image_paths,
    audio_paths,
    srt_path,
    music_track,
    output_path,
    format_type,
    cap=None,
    target_duration=None,
):
    if format_type == "9:16":
        w, h = (1080, 1920)
    elif format_type == "1:1":
        w, h = (1080, 1080)
    else:
        w, h = (1920, 1080)

    def probe_duration(media_path, fallback=0.0):
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                media_path,
            ],
            capture_output=True,
            text=True,
        )
        try:
            return float(r.stdout.strip())
        except ValueError:
            return fallback

    def build_atempo_chain(speed):
        parts = []
        while speed > 2.0:
            parts.append("atempo=2.0")
            speed /= 2.0
        while speed < 0.5:
            parts.append("atempo=0.5")
            speed /= 0.5
        parts.append(f"atempo={speed:.6f}")
        return ",".join(parts)

    # ── 1. Measure real TTS durations via ffprobe ──────────────────────────────
    durations = []
    for ap in audio_paths:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                ap,
            ],
            capture_output=True,
            text=True,
        )
        try:
            durations.append(float(r.stdout.strip()))
        except ValueError:
            durations.append(5.0)

    # ── 2. Build one still-image clip per scene (NO subtitle overlay) ──────────
    clips, cf = [], tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    for i, (img_path, dur) in enumerate(zip(image_paths, durations)):
        # Scale/pad image to target resolution
        clip = tempfile.mktemp(suffix=".mp4")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-loop",
                "1",
                "-i",
                img_path,
                "-vf",
                f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
                "-t",
                str(dur),
                "-r",
                "30",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-an",
                clip,
            ],
            check=True,
            capture_output=True,
        )
        clips.append(clip)
        cf.write(f"file '{clip}'\n")
    cf.close()

    # Concatenate scene clips into a single silent video
    video_only = tempfile.mktemp(suffix=".mp4")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            cf.name,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            video_only,
        ],
        check=True,
        capture_output=True,
    )

    # ── 3. Concatenate voice segments ─────────────────────────────────────────
    af = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    for ap in audio_paths:
        af.write(f"file '{ap}'\n")
    af.close()
    voice_wav = tempfile.mktemp(suffix=".wav")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            af.name,
            "-c:a",
            "pcm_s16le",
            voice_wav,
        ],
        check=True,
        capture_output=True,
    )

    # ── 4. Mix voice + optional background music ───────────────────────────────
    total_dur = sum(durations)
    exact_target_dur = float(target_duration) if target_duration else total_dur

    exact_voice_wav = voice_wav
    if exact_target_dur > 0 and abs(total_dur - exact_target_dur) > 0.05:
        adjusted_voice_wav = tempfile.mktemp(suffix=".wav")
        if total_dur > exact_target_dur:
            speed_ratio = total_dur / exact_target_dur
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    voice_wav,
                    "-filter:a",
                    build_atempo_chain(speed_ratio),
                    "-t",
                    str(exact_target_dur),
                    "-ar",
                    "48000",
                    "-ac",
                    "2",
                    adjusted_voice_wav,
                ],
                check=True,
                capture_output=True,
            )
        else:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    voice_wav,
                    "-af",
                    "apad",
                    "-t",
                    str(exact_target_dur),
                    "-ar",
                    "48000",
                    "-ac",
                    "2",
                    adjusted_voice_wav,
                ],
                check=True,
                capture_output=True,
            )
        exact_voice_wav = adjusted_voice_wav
        total_dur = exact_target_dur

    if music_track and os.path.exists(music_track):
        final_wav = tempfile.mktemp(suffix=".wav")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                exact_voice_wav,
                "-i",
                music_track,
                "-loop",
                "0",
                "-filter_complex",
                f"[1:a]volume=0.10,afade=t=in:st=0:d=1,"
                f"afade=t=out:st={max(0, total_dur - 2)}:d=2[music];"
                f"[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[out]",
                "-map",
                "[out]",
                "-t",
                str(total_dur),
                "-ar",
                "48000",
                "-ac",
                "2",
                final_wav,
            ],
            check=True,
            capture_output=True,
        )
    else:
        final_wav = exact_voice_wav

    # ── 5. Combine video + audio → pre-subtitle video ─────────────────────────
    pre_sub = tempfile.mktemp(suffix=".mp4")
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            video_only,
            "-i",
            final_wav,
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-t",
            str(total_dur),
            pre_sub,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log(f"FFmpeg stderr: {result.stderr[:500]}")
        raise RuntimeError(f"FFmpeg failed: {result.stderr[:200]}")

    # ── 6. Burn SRT subtitles via PIL RGBA overlay (works without libass/freetype) ──
    if cap is None:
        cap = {}
    subtitles_enabled = cap.get("enabled", True)

    def _burn_subtitles_pil(pre_sub, srt_path, cap, output_path, w, h):
        """
        Render subtitles using PIL → per-frame RGBA PNG video → FFmpeg overlay.
        Works on any FFmpeg build (no libass, no drawtext/freetype needed).
        Returns True on success.
        """
        import re as _re

        font_size = max(16, min(120, int(cap.get("fontSize", 52))))
        text_color = hex_to_rgba(cap.get("textColor", "#FFFFFF"))
        outline_col = hex_to_rgba(cap.get("outlineColor", "#000000"))
        outline_th = max(0, int(cap.get("outlineThickness", 6)))
        v_pos = cap.get("verticalPosition", "bottom")
        v_margin = max(0, int(cap.get("verticalMargin", 80)))
        font_family = cap.get("fontFamily", "Montserrat")
        show_bg = cap.get("showBackground", False)
        bg_color_hex = cap.get("bgColor", "#000000")
        bg_opacity = max(0.0, min(1.0, float(cap.get("bgOpacity", 0.55))))
        bg_alpha = int(bg_opacity * 255)
        try:
            _h = bg_color_hex.lstrip("#")
            bg_fill = (int(_h[0:2], 16), int(_h[2:4], 16), int(_h[4:6], 16), bg_alpha)
        except Exception:
            bg_fill = (0, 0, 0, bg_alpha)
        bg_radius_pct = max(0, min(100, int(cap.get("bgRadius", 0))))
        bg_height_pct = max(0, min(100, int(cap.get("bgHeight", 25))))
        bg_width_pct = max(0, min(100, int(cap.get("bgWidth", 14))))
        bg_offset_x_pct = max(0, min(100, int(cap.get("bgOffsetX", 50))))
        bg_offset_y_pct = max(0, min(100, int(cap.get("bgOffsetY", 50))))
        grad_colors = cap.get("gradientColors", None)  # e.g. ["#FFFFFF", "#FFD700"]

        # Parse SRT
        try:
            srt_text = open(srt_path, encoding="utf-8").read()
        except Exception as e:
            log(f"[Subtitles] Cannot read SRT: {e}")
            return False

        blocks = _re.split(r"\n\n+", srt_text.strip())

        def parse_ts(ts):
            ts = ts.replace(",", ".")
            parts = ts.split(":")
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])

        entries = []
        for block in blocks:
            block_lines = block.strip().splitlines()
            if len(block_lines) < 3:
                continue
            ts_line = block_lines[1]
            text = " ".join(block_lines[2:]).strip()
            m = _re.match(r"(\S+)\s+-->\s+(\S+)", ts_line)
            if not m:
                continue
            t_in = parse_ts(m.group(1))
            t_out = parse_ts(m.group(2))
            entries.append((t_in, t_out, text))

        if not entries:
            log("[Subtitles] SRT parsed but no entries found")
            return False

        log(f"[Subtitles] Rendering {len(entries)} subtitle entries via PIL overlay")

        # Get video duration
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                pre_sub,
            ],
            capture_output=True,
            text=True,
        )
        try:
            total_dur = float(r.stdout.strip())
        except ValueError:
            total_dur = (
                sum(d for _, d, _ in [(e[0], e[1] - e[0], e[2]) for e in entries]) + 1
            )

        FPS = 30
        total_frames = int(total_dur * FPS) + 1

        # Unique subtitle images (group consecutive frames with same text)
        # Build subtitle lookup: time → text
        def get_sub_at(t):
            for t_in, t_out, text in entries:
                if t_in <= t < t_out:
                    return text
            return None

        # Render unique subtitle PNG images to a temp dir
        sub_frames_dir = tempfile.mkdtemp(prefix="sub_frames_")
        fnt = get_font(
            font_size,
            font_family=font_family,
            bold=True,
            sample_text=" ".join(text for _, _, text in entries),
        )

        # Horizontal margin: 5% on each side so text never clips
        h_margin = int(w * 0.05)
        max_text_w = w - h_margin * 2

        def measure_text(draw, text):
            try:
                bbox = draw.textbbox((0, 0), text, font=fnt)
                return bbox[2] - bbox[0]
            except Exception:
                return int(len(text) * font_size * 0.55)

        def pixel_wrap(draw, text):
            """Wrap text so each line fits within max_text_w pixels."""
            words = text.split()
            if not words:
                return []
            lines = []
            current = words[0]
            for word in words[1:]:
                candidate = current + " " + word
                if measure_text(draw, candidate) <= max_text_w:
                    current = candidate
                else:
                    lines.append(current)
                    current = word
            lines.append(current)
            return lines

        def _hex_to_rgb(hex_str):
            h = hex_str.lstrip("#")
            return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))

        def render_gradient_text(draw, line_text, tx, ty, tw, fnt):
            """
            Draw text with a horizontal gradient fill (top color → bottom color).
            Falls back to solid text_color if gradientColors not set.
            """
            if not grad_colors or len(grad_colors) < 2:
                draw.text((tx, ty), line_text, font=fnt, fill=text_color)
                return

            try:
                bbox = fnt.getbbox(line_text)
                lw = bbox[2] - bbox[0]
                lh = bbox[3] - bbox[1]
            except Exception:
                lw, lh = tw, font_size

            # Create a small text bitmap with gradient
            txt_img = Image.new(
                "RGBA", (max(1, lw + 4), max(1, lh + font_size)), (0, 0, 0, 0)
            )
            txt_draw = ImageDraw.Draw(txt_img)

            c1 = _hex_to_rgb(grad_colors[0])
            c2 = _hex_to_rgb(grad_colors[1])
            total_h = txt_img.height

            # Draw the text in white first, then apply gradient via mask
            txt_draw.text((2, 0), line_text, font=fnt, fill=(255, 255, 255, 255))

            # Build gradient mask
            grad_img = Image.new("RGBA", txt_img.size, (0, 0, 0, 0))
            grad_pixels = grad_img.load()
            for py in range(total_h):
                t_ratio = py / max(1, total_h - 1)
                r_val = int(c1[0] + (c2[0] - c1[0]) * t_ratio)
                g_val = int(c1[1] + (c2[1] - c1[1]) * t_ratio)
                b_val = int(c1[2] + (c2[2] - c1[2]) * t_ratio)
                for px in range(txt_img.width):
                    orig_alpha = txt_img.getpixel((px, py))[3]
                    grad_pixels[px, py] = (r_val, g_val, b_val, orig_alpha)

            # Composite onto a transparent layer
            composite = Image.new("RGBA", txt_img.size, (0, 0, 0, 0))
            composite.paste(grad_img, (0, 0), grad_img)

            # Paste gradient text onto main draw surface
            draw._image.paste(composite, (tx - 2, ty), composite)

        # Bubble / pill background settings
        use_bubble = cap.get("bubble", False)
        bubble_color_hex = cap.get("bubbleColor", "#1A1A1A")
        bubble_alpha = int(cap.get("bubbleAlpha", 200))
        bubble_r = int(cap.get("bubbleRadius", 24))
        bubble_pad_x = int(cap.get("bubblePadX", 32))
        bubble_pad_y = int(cap.get("bubblePadY", 14))

        def _parse_bubble_color(hex_str, alpha):
            h = hex_str.lstrip("#")
            r_c, g_c, b_c = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            return (r_c, g_c, b_c, alpha)

        bubble_fill = _parse_bubble_color(bubble_color_hex, bubble_alpha)

        def draw_bubble(draw, bx, by, bw, bh, radius):
            """Draw a smooth rounded rectangle (pill) onto draw."""
            radius = min(radius, bh // 2, bw // 2)
            # Use PIL rounded_rectangle if available (PIL >= 8.2)
            try:
                draw.rounded_rectangle(
                    [bx, by, bx + bw, by + bh], radius=radius, fill=bubble_fill
                )
            except AttributeError:
                # Fallback for older PIL: draw rectangle + circles at corners
                draw.rectangle(
                    [bx + radius, by, bx + bw - radius, by + bh], fill=bubble_fill
                )
                draw.rectangle(
                    [bx, by + radius, bx + bw, by + bh - radius], fill=bubble_fill
                )
                draw.ellipse(
                    [bx, by, bx + radius * 2, by + radius * 2], fill=bubble_fill
                )
                draw.ellipse(
                    [bx + bw - radius * 2, by, bx + bw, by + radius * 2],
                    fill=bubble_fill,
                )
                draw.ellipse(
                    [bx, by + bh - radius * 2, bx + radius * 2, by + bh],
                    fill=bubble_fill,
                )
                draw.ellipse(
                    [bx + bw - radius * 2, by + bh - radius * 2, bx + bw, by + bh],
                    fill=bubble_fill,
                )

        def render_sub_image(text, frame_path):
            """
            Render one subtitle chunk onto a transparent RGBA frame.

            Two modes depending on cap settings:
              A) bubble=True  → colored rounded-rectangle pill behind each line,
                                white/styled text on top. TikTok/Reels style.
              B) bubble=False → no background, thick outline + drop shadow (old style).
            """
            img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)

            # Pixel-based word wrap
            wrapped = pixel_wrap(draw, text)
            if not wrapped:
                img.save(frame_path, "PNG")
                return

            line_h = int(font_size * 1.5)
            total_text_h = len(wrapped) * line_h

            # Compute Y starting position of the whole block
            if use_bubble:
                # Each line gets its own bubble; compute overall block height
                per_line_h = line_h + bubble_pad_y * 2
                gap_between = int(font_size * 0.18)
                block_h = (
                    len(wrapped) * per_line_h + max(0, len(wrapped) - 1) * gap_between
                )
            else:
                pad = int(font_size * 0.4)
                block_h = total_text_h + pad * 2

            if v_pos == "top":
                block_y = v_margin
            elif v_pos in ("middle", "center"):
                block_y = (h - block_h) // 2
            else:  # bottom
                block_y = h - block_h - v_margin

            if use_bubble:
                # ── Bubble mode: draw colored pill per line ──────────────────
                cur_y = block_y
                per_line_h = line_h + bubble_pad_y * 2
                gap_between = int(font_size * 0.18)

                for line_text in wrapped:
                    tw = measure_text(draw, line_text)
                    bw = tw + bubble_pad_x * 2
                    bh = per_line_h
                    bx = (w - bw) // 2
                    by = cur_y

                    # Draw bubble
                    draw_bubble(draw, bx, by, bw, bh, bubble_r)

                    # Text position inside bubble (vertically centred)
                    tx = bx + bubble_pad_x
                    # Estimate text height for centering
                    try:
                        bbox = fnt.getbbox(line_text)
                        t_ascent = -bbox[1]
                        t_descent = bbox[3]
                        text_h = t_ascent + t_descent
                    except Exception:
                        text_h = font_size
                        t_ascent = font_size
                    ty = by + (bh - text_h) // 2 - (t_ascent - text_h)

                    # Subtle inner shadow for depth (2px dark offset)
                    draw.text((tx + 2, ty + 2), line_text, font=fnt, fill=(0, 0, 0, 80))

                    # Main text (gradient or solid)
                    render_gradient_text(draw, line_text, tx, ty, tw, fnt)

                    cur_y += bh + gap_between

            else:
                # ── Classic mode: outline + shadow, optional background ───────
                pad = int(font_size * 0.4)
                ty = block_y + pad

                if show_bg:
                    # Extra vertical padding from bgHeight slider
                    extra_v = int(font_size * bg_height_pct * 0.01)
                    # Extra horizontal padding from bgWidth slider
                    extra_h = int(font_size * bg_width_pct * 0.02)
                    # Horizontal offset from bgOffsetX (50 = centered)
                    x_shift = int((bg_offset_x_pct - 50) * w * 0.01)

                    # Draw a separate background rectangle per line,
                    # each sized to match the actual text width of that line
                    cur_by = ty
                    for line_text in wrapped:
                        tw = measure_text(draw, line_text)
                        bw = tw + extra_h * 2
                        bx0 = max(0, (w - bw) // 2 + x_shift)
                        bx1 = min(w, bx0 + bw)
                        by0 = max(0, cur_by - extra_v)
                        by1 = min(h, cur_by + line_h + extra_v)

                        radius = int((by1 - by0) * bg_radius_pct * 0.005)

                        if radius > 0:
                            try:
                                draw.rounded_rectangle(
                                    [bx0, by0, bx1, by1],
                                    radius=radius,
                                    fill=bg_fill,
                                )
                            except AttributeError:
                                draw.rectangle([bx0, by0, bx1, by1], fill=bg_fill)
                        else:
                            draw.rectangle([bx0, by0, bx1, by1], fill=bg_fill)

                        cur_by += line_h

                ty = block_y + pad
                for line_text in wrapped:
                    tw = measure_text(draw, line_text)
                    tx = (w - tw) // 2

                    # Drop shadow
                    shadow_offset = max(2, outline_th // 2)
                    draw.text(
                        (tx + shadow_offset, ty + shadow_offset),
                        line_text,
                        font=fnt,
                        fill=(0, 0, 0, 120),
                    )

                    # Thick outline (multiple passes)
                    if outline_th > 0:
                        r2 = min(outline_th, 8)
                        for ox in range(-r2, r2 + 1):
                            for oy in range(-r2, r2 + 1):
                                if ox != 0 or oy != 0:
                                    draw.text(
                                        (tx + ox, ty + oy),
                                        line_text,
                                        font=fnt,
                                        fill=(*outline_col[:3], 230),
                                    )
                        r_inner = max(1, r2 - 2)
                        for ox in range(-r_inner, r_inner + 1):
                            for oy in range(-r_inner, r_inner + 1):
                                if ox != 0 or oy != 0:
                                    draw.text(
                                        (tx + ox, ty + oy),
                                        line_text,
                                        font=fnt,
                                        fill=outline_col,
                                    )

                    # Main text
                    render_gradient_text(draw, line_text, tx, ty, tw, fnt)

                    ty += line_h

            img.save(frame_path, "PNG")

        # Build subtitle video: write frames as individual PNGs then pipe to ffmpeg
        # Strategy: render unique subtitle frames and use concat demuxer
        # Group frames by subtitle text to avoid rendering same image thousands of times
        empty_frame = os.path.join(sub_frames_dir, "empty.png")
        Image.new("RGBA", (w, h), (0, 0, 0, 0)).save(empty_frame, "PNG")

        # Render one PNG per unique subtitle entry
        rendered = {}  # text → png_path
        for idx, (t_in, t_out, text) in enumerate(entries):
            frame_path = os.path.join(sub_frames_dir, f"sub_{idx:04d}.png")
            render_sub_image(text, frame_path)
            rendered[idx] = frame_path

        # Build concat list for subtitle video (using segment durations)
        concat_file = os.path.join(sub_frames_dir, "concat.txt")
        with open(concat_file, "w") as cf2:
            cursor = 0.0
            for idx, (t_in, t_out, text) in enumerate(entries):
                # Gap before this subtitle (empty frame)
                gap = t_in - cursor
                if gap > 0.001:
                    cf2.write(f"file '{empty_frame}'\n")
                    cf2.write(f"duration {gap:.6f}\n")
                # Subtitle frame
                cf2.write(f"file '{rendered[idx]}'\n")
                cf2.write(f"duration {t_out - t_in:.6f}\n")
                cursor = t_out
            # Tail gap
            tail = total_dur - cursor
            if tail > 0.001:
                cf2.write(f"file '{empty_frame}'\n")
                cf2.write(f"duration {tail:.6f}\n")
            # ffmpeg concat demuxer requires last entry repeated
            cf2.write(f"file '{empty_frame}'\n")

        # Build subtitle video track (RGBA)
        sub_video = tempfile.mktemp(suffix=".mov")
        r3 = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_file,
                "-vf",
                f"scale={w}:{h},format=rgba",
                "-c:v",
                "qtrle",  # QuickTime RLE — lossless RGBA
                "-r",
                str(FPS),
                sub_video,
            ],
            capture_output=True,
            text=True,
        )
        if r3.returncode != 0:
            log(f"[Subtitles] Sub video build failed: {r3.stderr[:300]}")
            # Try png codec as fallback
            r3b = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    concat_file,
                    "-vf",
                    f"scale={w}:{h}",
                    "-c:v",
                    "png",
                    "-pix_fmt",
                    "rgba",
                    "-r",
                    str(FPS),
                    sub_video,
                ],
                capture_output=True,
                text=True,
            )
            if r3b.returncode != 0:
                log(f"[Subtitles] Sub video fallback also failed: {r3b.stderr[:300]}")
                import shutil

                shutil.rmtree(sub_frames_dir, ignore_errors=True)
                return False

        # Overlay subtitle video onto main video
        r4 = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                pre_sub,
                "-i",
                sub_video,
                "-filter_complex",
                "[1:v]format=rgba[sub];[0:v][sub]overlay=x=0:y=0:format=auto",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "20",
                "-c:a",
                "copy",
                output_path,
            ],
            capture_output=True,
            text=True,
        )

        import shutil

        shutil.rmtree(sub_frames_dir, ignore_errors=True)
        try:
            os.unlink(sub_video)
        except OSError:
            pass

        if r4.returncode != 0:
            log(f"[Subtitles] Overlay failed: {r4.stderr[:500]}")
            return False

        log("[Subtitles] PIL overlay subtitles burned successfully")
        return True

    if subtitles_enabled and srt_path and os.path.exists(srt_path):
        log(f"[Subtitles] Burning subtitles via PIL overlay from {srt_path}")
        ok = _burn_subtitles_pil(pre_sub, srt_path, cap, output_path, w, h)
        if ok:
            log("[Subtitles] Burned successfully")
        else:
            log(
                "[Subtitles] PIL overlay failed — falling back to video without subtitles"
            )
            import shutil

            shutil.copy2(pre_sub, output_path)
    else:
        import shutil

        shutil.copy2(pre_sub, output_path)

    if exact_target_dur > 0:
        normalized_output = tempfile.mktemp(suffix=".mp4")
        source_duration = probe_duration(output_path, fallback=exact_target_dur)
        pad_amount = max(0.0, exact_target_dur - source_duration)
        video_filters = []
        if pad_amount > 0.02:
            video_filters.append(f"tpad=stop_mode=clone:stop_duration={pad_amount:.6f}")
        video_filters.append("fps=30")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                output_path,
                "-vf",
                ",".join(video_filters),
                "-af",
                "apad",
                "-t",
                str(exact_target_dur),
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "20",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                normalized_output,
            ],
            check=True,
            capture_output=True,
        )
        os.replace(normalized_output, output_path)

    # ── 7. Cleanup temp files ─────────────────────────────────────────────────
    for f in clips + [video_only, voice_wav, pre_sub, cf.name, af.name]:
        try:
            os.unlink(f)
        except OSError:
            pass
    if exact_voice_wav != voice_wav:
        try:
            os.unlink(exact_voice_wav)
        except OSError:
            pass
    if music_track and final_wav != voice_wav:
        try:
            os.unlink(final_wav)
        except OSError:
            pass

    return output_path


# ─── Full Pipeline ─────────────────────────────────────────────────────────────


def render_video(
    chat_id,
    topic,
    lang,
    format_type,
    duration,
    style,
    music,
    voice_id,
    out_dir,
    focus="",
    cap=None,
    subtopic="",
    story_style="intrigue",
    tts_speed=1.0,
    tts_instructions="",
    image_prompt_base="",
):
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    log(f"[VideoGen] Starting pipeline for chat {chat_id}")
    log(
        f"  topic={topic}, lang={lang}, format={format_type}, duration={duration}s, style={style}, story_style={story_style}"
    )

    # ── Build caption config from story_style if not explicitly provided ──────
    cap_style = CAPTION_STYLES.get(story_style, CAPTION_STYLES["_default"]).copy()
    if cap:
        # External cap overrides style defaults (frontend settings take precedence)
        cap_style.update(cap)
    cap = cap_style
    words_per_chunk = cap.get("wordsPerChunk", 3)
    log(
        f"  Caption style: font={cap['fontFamily']}, size={cap['fontSize']}, "
        f"colors={cap.get('gradientColors')}, words/chunk={words_per_chunk}"
    )

    progress(2, "Генерирую сценарий...")
    log("[VideoGen] Step 1/5: Generating script...")
    script_data = generate_script(
        topic, lang, focus, style, duration, subtopic=subtopic, story_style=story_style,
        visual_style_hint=image_prompt_base[:400] if image_prompt_base else "",
    )
    log(f"[VideoGen] Script: {script_data.get('title', 'Untitled')}")

    scenes = script_data.get("scenes", [])
    actual_total = sum(s.get("duration", 5) for s in scenes)
    log(
        f"  Scenes: {len(scenes)}, total duration: {actual_total}s (target: {duration}s)"
    )
    progress(10, f"Сценарий готов — {len(scenes)} сцен")

    # Fine-tune: if GPT miscounted by ±1 second, redistribute remainder across scenes
    if scenes and actual_total != duration:
        diff = duration - actual_total
        log(f"  Duration correction: adjusting by {diff:+d}s")
        if abs(diff) <= len(scenes):
            for i in range(abs(diff)):
                idx = i if diff > 0 else len(scenes) - 1 - i
                scenes[idx]["duration"] += 1 if diff > 0 else -1
        else:
            # Fallback: scale proportionally
            scale = duration / actual_total
            for s in scenes:
                s["duration"] = max(3, round(s.get("duration", 5) * scale))
        actual_total = sum(s.get("duration", 5) for s in scenes)
        log(f"  After correction: {actual_total}s")

    script_data["lang"] = lang
    script_data["format"] = format_type
    script_data["topic"] = topic
    script_data["style"] = style
    script_data["music"] = music
    script_data["voice"] = voice_id
    script_data["duration"] = duration
    script_data["storyStyle"] = story_style
    script_data["ttsSpeed"] = tts_speed
    script_data["ttsInstructions"] = tts_instructions
    if cap:
        script_data["cap"] = cap
    with open(out_path / "script.json", "w", encoding="utf-8") as f:
        json.dump(script_data, f, ensure_ascii=False, indent=2)

    # Build a rich subject string for image prompts — includes subtopic and focus
    _topic_parts = [p for p in (_humanize_prompt_part(topic), _humanize_prompt_part(subtopic), _humanize_prompt_part(focus)) if p]
    image_topic = ": ".join(_topic_parts) if _topic_parts else (topic or "")

    log("[VideoGen] Step 2/5: Generating images...")
    image_paths = []
    for i, scene in enumerate(scenes):
        img_path = out_path / f"scene_{i:03d}.png"
        pct = 12 + int(i / len(scenes) * 38)  # 12..50
        progress(pct, f"Генерирую картинку {i + 1}/{len(scenes)}...")
        try:
            scene_desc = scene.get("image_description", scene.get("voiceover", ""))
            generate_image(
                scene_desc,
                style,
                str(img_path),
                format_type,
                topic=image_topic,
                scene_index=i,
                n_variants=1,
                stock_query=scene.get("stock_query", ""),
            )
            log(f"  Image {i + 1}/{len(scenes)}: OK")
        except Exception as e:
            log(f"  Image {i + 1} FAILED (will use black frame): {e}")
            fatal_image_error = any(
                marker in str(e).lower()
                for marker in [
                    "payment required",
                    "replicate http 402",
                    "insufficient_quota",
                    "no image provider available",
                ]
            )
            if fatal_image_error:
                raise RuntimeError(f"Image generation failed: {e}")
            progress(
                pct,
                f"Картинка {i + 1}/{len(scenes)}: ошибка, повтор не помог — используется заглушка",
            )
            fallback_size = "1080x1920" if format_type == "9:16" else "1920x1080"
            subprocess.run(
                [
                    "ffmpeg",
                    "-f",
                    "lavfi",
                    "-i",
                    f"color=c=black:s={fallback_size}:d={scene.get('duration', 5)}",
                    "-frames:v",
                    "1",
                    "-y",
                    str(img_path),
                ],
                capture_output=True,
            )
        image_paths.append(str(img_path))
    progress(50, "Все картинки готовы")

    progress(52, "Синтезирую озвучку...")
    log("[VideoGen] Step 3/5: Synthesizing speech...")
    voice_texts = [
        {"text": s.get("voiceover", ""), "duration": s.get("duration", 5)}
        for s in scenes
    ]
    audio_paths = synthesize_speech_tts(
        voice_id,
        voice_texts,
        str(out_path),
        lang,
        tts_speed=tts_speed,
        tts_instructions=tts_instructions,
    )
    progress(75, "Озвучка готова")

    progress(77, "Генерирую субтитры...")
    log("[VideoGen] Step 4/5: Generating subtitles...")
    srt_path = str(out_path / "subtitles.srt")
    generate_srt_from_script(
        scenes, audio_paths, srt_path, words_per_chunk=words_per_chunk
    )
    progress(80, "Субтитры готовы")

    progress(82, "Собираю видео...")
    log("[VideoGen] Step 5/5: Composing video...")
    music_track = None
    if music and music != "none":
        for mp in [
            PROJECT_ROOT / "music" / f"{music}.mp3",
            PROJECT_ROOT / "music" / f"{music}.wav",
            Path(music),
        ]:
            if mp.exists():
                music_track = str(mp)
                break

    output_video = str(out_path / "output.mp4")
    compose_video(
        image_paths,
        audio_paths,
        srt_path,
        music_track,
        output_video,
        format_type,
        cap,
        target_duration=duration,
    )
    progress(95, "Финализирую видео...")
    log(f"[VideoGen] Done! Output: {output_video}")
    return output_video, str(out_path / "script.json")


# ─── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "render"

    if cmd == "render":
        if len(sys.argv) < 10:
            print(
                "Usage: video_gen.py [--api-key KEY] render <chat_id> <topic> <lang> "
                "<format> <duration> <style> <music> <voice_id> <out_dir> [focus]"
            )
            sys.exit(1)
        chat_id, topic, lang, format_type, duration, style, music, voice_id = sys.argv[
            2:10
        ]
        out_dir = sys.argv[10] if len(sys.argv) > 10 else tempfile.mkdtemp()
        focus = sys.argv[11] if len(sys.argv) > 11 else ""
        cap = json.loads(sys.argv[12]) if len(sys.argv) > 12 else {}
        subtopic = sys.argv[13] if len(sys.argv) > 13 else ""
        story_style = sys.argv[14] if len(sys.argv) > 14 else "intrigue"
        tts_speed = float(sys.argv[15]) if len(sys.argv) > 15 else 1.0
        tts_instructions = sys.argv[16] if len(sys.argv) > 16 else ""
        image_prompt_base = sys.argv[17] if len(sys.argv) > 17 else ""
        duration = int(duration)
        try:
            out_video, out_script = render_video(
                chat_id,
                topic,
                lang,
                format_type,
                duration,
                style,
                music,
                voice_id,
                out_dir,
                focus,
                cap,
                subtopic,
                story_style,
                tts_speed,
                tts_instructions,
                image_prompt_base,
            )
            print(f"SUCCESS:{out_video}")  # stdout only - logs go to stderr
        except Exception as e:
            print(f"ERROR:{e}", file=sys.stderr)
            import traceback

            traceback.print_exc()
            sys.exit(1)

    elif cmd == "script":
        topic = sys.argv[2] if len(sys.argv) > 2 else "technology"
        lang = sys.argv[3] if len(sys.argv) > 3 else "en"
        print(json.dumps(generate_script(topic, lang), ensure_ascii=False, indent=2))

    elif cmd == "themes":
        print(json.dumps(THEMES, ensure_ascii=False, indent=2))

    elif cmd == "prompt_from_categories":
        # Usage: video_gen.py prompt_from_categories <genre> <sub_genre> <style> [details]
        g = sys.argv[2] if len(sys.argv) > 2 else ""
        sg = sys.argv[3] if len(sys.argv) > 3 else ""
        st = sys.argv[4] if len(sys.argv) > 4 else ""
        dt = sys.argv[5] if len(sys.argv) > 5 else ""
        result = generate_prompt_from_categories(g, sg, st, dt)
        print(result)

    elif cmd == "preview":
        if len(sys.argv) < 5:
            print(
                "Usage: video_gen.py [--api-key KEY] preview <voice_id> <lang> <output_path> [tts_speed] [tts_instructions]"
            )
            sys.exit(1)
        voice_id = sys.argv[2]
        lang = sys.argv[3]
        output_path = sys.argv[4]
        tts_speed = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
        tts_instructions = sys.argv[6] if len(sys.argv) > 6 else ""
        try:
            out_audio = generate_voice_preview(
                voice_id,
                lang,
                output_path=output_path,
                tts_speed=tts_speed,
                tts_instructions=tts_instructions,
            )
            print(f"SUCCESS:{out_audio}")
        except Exception as e:
            print(f"ERROR:{e}", file=sys.stderr)
            import traceback

            traceback.print_exc()
            sys.exit(1)

    elif cmd == "rebuild":
        # rebuild video from existing script.json
        if len(sys.argv) < 6:
            print(
                "Usage: video_gen.py [--api-key KEY] rebuild <job_id> <script_json> <voice_id> <music> <out_dir> [cap_json]"
            )
            sys.exit(1)
        job_id = sys.argv[2]
        script_json_str = sys.argv[3]
        voice_id = sys.argv[4]
        music = sys.argv[5]
        out_dir = sys.argv[6] if len(sys.argv) > 6 else tempfile.mkdtemp()
        cap_arg = sys.argv[7] if len(sys.argv) > 7 else None

        try:
            script_data = json.loads(script_json_str)
        except Exception:
            with open(sys.argv[3], encoding="utf-8") as f:
                script_data = json.load(f)

        # Resolve cap: from CLI arg → from script.json → default {}
        if cap_arg:
            try:
                cap = json.loads(cap_arg)
            except Exception:
                cap = script_data.get("cap", {})
        else:
            cap = script_data.get("cap", {})

        out_path = Path(out_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        scenes = script_data.get("scenes", [])
        fmt = script_data.get("format", "9:16")
        lang = script_data.get("lang", "en")
        w, h = (1080, 1920) if fmt == "9:16" else (1920, 1080)

        log(f"[Rebuild] {len(scenes)} scenes, format={fmt}, lang={lang}")

        # Persist updated script (with cap/lang/format)
        script_data["cap"] = cap
        with open(out_path / "script.json", "w", encoding="utf-8") as f:
            json.dump(script_data, f, ensure_ascii=False, indent=2)

        # Step 1: Generate speech
        log("[Rebuild] Step 1/3: Generating speech...")
        audio_paths = synthesize_speech_tts(
            voice_id,
            [
                {"text": s.get("voiceover", ""), "duration": s.get("duration", 5)}
                for s in scenes
            ],
            str(out_path),
            lang,
        )

        # Step 2: Generate subtitles from new audio
        log("[Rebuild] Step 2/3: Generating subtitles...")
        srt_path = str(out_path / "subtitles.srt")
        generate_srt(audio_paths, srt_path, lang)

        # Step 3: Compose video — compose_video handles subtitle overlay internally
        log("[Rebuild] Step 3/3: Composing video...")
        image_paths = []
        for i in range(len(scenes)):
            img = out_path / f"scene_{i:03d}.png"
            if img.exists():
                image_paths.append(str(img))
            else:
                # Missing image → generate black frame as fallback
                black = out_path / f"scene_{i:03d}_black.png"
                Image.new("RGB", (w, h), (0, 0, 0)).save(str(black))
                image_paths.append(str(black))

        music_track = None
        if music and music != "none":
            for mp in [
                PROJECT_ROOT / "music" / f"{music}.mp3",
                PROJECT_ROOT / "music" / f"{music}.wav",
                Path(music),
            ]:
                if mp.exists():
                    music_track = str(mp)
                    break

        output_video = str(out_path / "output.mp4")
        rebuild_duration = sum(s.get("duration", 5) for s in scenes)
        compose_video(
            image_paths,
            audio_paths,
            srt_path,
            music_track,
            output_video,
            fmt,
            cap,
            target_duration=rebuild_duration,
        )
        log(f"[Rebuild] Done! Output: {output_video}")
        print(f"SUCCESS:{output_video}")
    elif cmd == "rerender_subs":
        # Usage: video_gen.py [--api-key KEY] rerender_subs <session_dir> <format> <music> <output_video>
        if len(sys.argv) < 6:
            print(
                "Usage: video_gen.py [--api-key KEY] rerender_subs <session_dir> <format> <music> <output_video>"
            )
            sys.exit(1)
        session_dir = Path(sys.argv[2])
        format_type = sys.argv[3]
        music_name = sys.argv[4]
        output_video = sys.argv[5]

        script_file = session_dir / "script.json"
        with open(script_file, encoding="utf-8") as f:
            script_data = json.load(f)
        scenes = script_data.get("scenes", [])
        cap = script_data.get("cap", {})

        image_paths = [
            str((session_dir / f"scene_{i:03d}.png").resolve())
            for i in range(len(scenes))
            if (session_dir / f"scene_{i:03d}.png").exists()
        ]

        audio_paths = sorted([str(p.resolve()) for p in session_dir.glob("segment_*.wav")])
        if not audio_paths:
            print("ERROR: No audio segments found in session dir", file=sys.stderr)
            sys.exit(1)

        srt_path = str(session_dir / "subtitles.srt")

        music_track = None
        if music_name and music_name != "none":
            for mp in [
                PROJECT_ROOT / "music" / f"{music_name}.mp3",
                PROJECT_ROOT / "music" / f"{music_name}.wav",
                Path(music_name),
            ]:
                if mp.exists():
                    music_track = str(mp)
                    break

        log(
            f"[Rerender] images={len(image_paths)}, audio={len(audio_paths)}, srt={os.path.exists(srt_path)}"
        )
        rerender_duration = sum(s.get("duration", 5) for s in scenes)
        compose_video(
            image_paths,
            audio_paths,
            srt_path,
            music_track,
            output_video,
            format_type,
            cap,
            target_duration=rerender_duration,
        )
        log(f"[Rerender] Done! Output: {output_video}")
        print(f"SUCCESS:{output_video}")

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
