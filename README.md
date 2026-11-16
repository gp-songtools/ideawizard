# Idea Wizard

Song ideas that fit your sound. Idea Wizard takes what [GP Blueprint](https://gp-songtools.github.io/gp-blueprint/) and [Earprint](https://gp-songtools.github.io/earprint/) give you, asks an AI for three different song ideas, and lets you drill into the one you like, down to line-by-line directions. Part of the [GP Song Tools](https://gp-songtools.github.io/toolsmenu/).

Live at https://gp-songtools.github.io/ideawizard/

## How it works

1. **Your sound.** A style prompt or a track analysis is enough (or just a direction); the rest are optional and refine the ideas:
   - **Style prompt**: GP Blueprint › Suno Style Prompt › **Copy** (any style description works too).
   - **Song structure** (optional): GP Blueprint › Song Structure & Meter › **Copy**. Idea Wizard reads its sections, line counts, rhyme schemes and syllables.
   - **Track analysis** (optional): Earprint › AI review › **Copy for Idea Wizard** (tempo, key, mood, genres, instruments, lyric themes).
   - **Steer it** (optional): a direction such as "about my hometown, hopeful".
2. **AI.** Choose Claude, Gemini or Groq and paste your own API key. Idea Wizard lists the models the key can use.
3. **Conjure 3 ideas.** Each has a title, topic, theme, subject, angle, hook concept, imagery and why it fits.
4. **Expand** an idea into a song plan: logline, perspective, tone, a beat and images per section (using your structure's sections), hook ideas, a word bank, other titles and clichés to avoid.
5. **Go deeper** on a sung section for one direction per lyric line, following its rhyme scheme and syllable targets, with end-word ideas.
6. **Copy for Lyricpad** puts the idea in one line for [Lyricpad](https://gp-songtools.github.io/lyricpad/)'s Suggest lines › Topic / feel box, where it can write the lyrics (with GP Blueprint's structure, via *Write a whole song from a structure*). **Copy song structure** copies the plan in GP Blueprint's structure format: each section's bars, line count and rhyme scheme (from your pasted structure, or suggested), with its story, images and any line-by-line directions. Paste it into Lyricpad's *Write a whole song from a structure* to have the lyrics follow the plan. **Copy the whole plan** copies everything as text.

## Privacy & credits

No server or account of its own. Your inputs and the chosen idea go from your browser straight to the AI provider you pick, under your own key, and only when you press a button that asks for ideas. The key is held in memory and forgotten when you close the tab unless you tick **Remember key on this device** (off by default). Your inputs, provider and model choice are kept in this browser so they survive a reload. Pages load Cloudflare Web Analytics, shared by all GP Song Tools, for anonymous visit counts (no cookies; it never sees your inputs, ideas or key). Details: [Privacy & credits](https://gp-songtools.github.io/toolsmenu/privacy.html).

Credits: Claude requests use the official [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (MIT), bundled at `vendor/anthropic-sdk-1.3.0.js` so the site doesn't depend on a CDN. Gemini requests use Google's REST API, and Groq requests use its OpenAI-compatible API.

## Running locally

No build step. Serve the folder with any static server and open it:

```bash
python3 -m http.server 8092
```

Then open http://localhost:8092/. Opening `index.html` straight from disk doesn't work, because browsers block module scripts on `file://`.

## Files

```
ideawizard/
├── index.html      page markup
├── styles.css      styles (light and dark)
├── app.js          UI: inputs, provider and key, ideas, plan, line-by-line, copying
├── prompts.js      prompts, JSON schemas, structure parsing, cleaning model output (no DOM)
├── providers.js    Claude (bundled SDK), Gemini and Groq clients
├── vendor/         anthropic-sdk-1.3.0.js (unmodified)
├── changelog.html  renders CHANGELOG.md in the browser
├── CHANGELOG.md    user-facing changes by date
├── CLAUDE.md       notes for Claude Code sessions
└── .nojekyll       serve files as-is on GitHub Pages
```
