# API Setup

SystemDesign.ai needs two API keys. Both can be used for free.

---

## OpenRouter

Powers the AI judge, question generator, and interviewer chatbot.

1. Go to [openrouter.ai](https://openrouter.ai) and create an account
2. Go to [openrouter.ai/keys](https://openrouter.ai/keys) → **Create Key**
3. Copy the key (starts with `sk-or-v1-...`)
4. Paste it into **Settings → OpenRouter API Key** in the app

### Using Free Models

Many models on OpenRouter are **completely free**. To use them:

1. Go to [openrouter.ai/models](https://openrouter.ai/models)
2. Filter by **"Free"** to see available models
3. Copy the model ID (e.g. `meta-llama/llama-...`)
4. Paste it into **Settings → Smart Model** or **Fast Model** in the app

> No credits needed for free models. For paid models, add credits at [openrouter.ai/credits](https://openrouter.ai/credits) — $5 lasts hundreds of sessions.

---

## Google AI Studio (Gemini)

Powers audio transcription (speech → text). Free tier is generous (1,500 requests/day).

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with Google
2. Click **Create API Key** → select or create a project
3. Copy the key (starts with `AIza...`)
4. Paste it into **Settings → Gemini API Key** in the app

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Judge or chatbot errors | Check OpenRouter has credits (or use a free model) |
| Transcription fails | Check Gemini key is valid, try again in a minute (rate limit: 15 req/min) |
| No audio recorded | Enable "Audio Recording" in Settings, grant mic permissions |
