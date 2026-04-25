# OpenClaude

A beautiful AI chat interface styled after Claude's design system, powered by **Groq** and **OpenRouter** with streaming support.

## Stack

- **Frontend**: Vanilla HTML + CSS + JS (zero dependencies)
- **Backend**: `api/chat.js` — Vercel Edge Function
- **Providers**: Groq (10+ models) · OpenRouter (14+ models)

## Deploy to Vercel (1 minute)

### 1. Clone / fork the repo

```bash
git clone https://github.com/yourname/openclaude
cd openclaude
```

### 2. Install Vercel CLI and deploy

```bash
npm i -g vercel
vercel
```

### 3. Set environment variables in Vercel Dashboard

Go to **Project → Settings → Environment Variables** and add:

| Key | Value | Where to get |
|-----|-------|--------------|
| `GROQ_API_KEY` | `gsk_...` | [console.groq.com/keys](https://console.groq.com/keys) |
| `OPENROUTER_API_KEY` | `sk-or-...` | [openrouter.ai/keys](https://openrouter.ai/keys) |

### 4. Redeploy

```bash
vercel --prod
```

## Local Development

```bash
vercel dev
```

Runs the static frontend + edge API locally on `http://localhost:3000`.

> **Note:** `vercel dev` is required (not just `npx serve`) because the `api/` edge functions need the Vercel runtime.

## Models

### ⚡ Groq (11 models)
- Llama 3.3 70B Versatile (128k)
- Llama 3.1 8B Instant (128k)
- Llama 3.2 90B Vision (8k)
- Llama 3.2 11B Vision (8k)
- Llama 3.2 3B Preview (8k)
- Mixtral 8x7B MoE (32k)
- Gemma 2 9B IT (8k)
- Gemma 7B IT (8k)
- Llama 3 70B Tool Use (8k)
- Llama 3 8B Tool Use (8k)
- DeepSeek R1 Distill 70B (128k)

### 🌐 OpenRouter (14 models)
- GPT-4o / GPT-4o Mini
- OpenAI o1 Mini
- Claude 3.5 Sonnet / Claude 3 Haiku
- Gemini Pro 1.5 / Gemini Flash 1.5 (1M ctx)
- Llama 3.1 405B / 70B Instruct
- Mistral Large
- Mixtral 8x22B Instruct
- Cohere Command R+
- DeepSeek R1
- xAI Grok 2

## Project Structure

```
openclaude/
├── index.html      # Main chat UI
├── style.css       # Claude design system styles
├── app.js          # Chat logic, streaming, markdown
├── api/
│   └── chat.js     # Vercel Edge Function — Groq + OpenRouter
├── vercel.json     # Vercel routing config
└── README.md
```

## Features

- 🎨 Faithful Claude design system (parchment, terracotta, warm serif)
- ⚡ Real-time SSE streaming for all models
- 💬 Multiple conversations with sidebar history
- 🔧 Settings panel (system prompt, temperature, max tokens)
- 📝 Lightweight markdown renderer (code blocks, tables, lists)
- 📱 Fully responsive / mobile-friendly
- 🌙 Welcome chips for quick-start prompts
