// AI providers for Idea Wizard. Each one takes the user's own key, sends it only to its
// own API, and returns parsed JSON that matches the schema it was given.
//   Claude: official Anthropic SDK (bundled in vendor/), structured outputs.
//   Gemini: REST generateContent with a response schema.
//   Groq:   OpenAI-compatible chat completions in JSON mode.

const SDK_URL = new URL("./vendor/anthropic-sdk-1.3.0.js", import.meta.url).href;
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_API = "https://api.groq.com/openai/v1";
const TIMEOUT_MS = 120000;

export const PROVIDERS = {
  claude: { name: "Claude", keyHint: "sk-ant-…", keyUrl: "https://console.anthropic.com/settings/keys", keyNote: "Anthropic API keys are pay-as-you-go." },
  gemini: { name: "Gemini", keyHint: "AIza…", keyUrl: "https://aistudio.google.com/apikey", keyNote: "Gemini has a free tier." },
  groq: { name: "Groq", keyHint: "gsk_…", keyUrl: "https://console.groq.com/keys", keyNote: "Groq has a free tier." },
};

// Claude models are offered as a fixed list; Claude Opus 5.5 is the default.
const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (best ideas)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (good, cheaper)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)" },
];

export class AIError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// ---------- model lists ----------

export async function listModels(provider, key) {
  if (provider === "claude") return CLAUDE_MODELS;
  if (provider === "gemini") return listGeminiModels(key);
  if (provider === "groq") return listGroqModels(key);
  throw new AIError("Unknown provider.");
}

export function defaultModel(provider, models) {
  const ids = models.map((m) => m.id);
  if (provider === "claude") return "claude-opus-5-5";
  if (provider === "gemini") {
    // Newest stable general-purpose Flash model, e.g. gemini-3.6-flash.
    const ver = (id) => Number(/gemini-(\d+(?:\.\d+)?)-flash$/.exec(id)?.[1] || 0);
    const stable = ids.filter((id) => ver(id) > 0).sort((a, b) => ver(b) - ver(a));
    return stable[0] || ids.find((id) => /flash/.test(id)) || ids[0] || "";
  }
  if (provider === "groq") {
    const prefer = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct", "qwen/qwen3-32b"];
    return prefer.find((id) => ids.includes(id)) || ids.find((id) => /70b|120b/.test(id)) || ids[0] || "";
  }
  return ids[0] || "";
}

async function listGeminiModels(key) {
  const res = await timedFetch(`${GEMINI_API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(geminiError(res.status, data), res.status);
  return (data.models || [])
    .filter((m) => /^models\/gemini/.test(m.name) && (m.supportedGenerationMethods || []).includes("generateContent"))
    .filter((m) => !/(embedding|tts|image|audio|live|vision|robotics|computer)/i.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName || m.name.replace(/^models\//, "") }));
}

async function listGroqModels(key) {
  const res = await timedFetch(`${GROQ_API}/models`, { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(groqError(res.status, data), res.status);
  return (data.data || [])
    .filter((m) => m.active !== false && !/(whisper|guard|tts|playai|distil|orpheus|prompt-guard|compound)/i.test(m.id))
    .map((m) => ({ id: m.id, label: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------- one request ----------

// ask({provider, key, model, system, user, schema}) → parsed JSON object.
export async function ask({ provider, key, model, system, user, schema }) {
  if (!key) throw new AIError(`Paste your ${PROVIDERS[provider]?.name || ""} API key first.`);
  if (!model) throw new AIError("Choose a model first.");
  if (provider === "claude") return askClaude({ key, model, system, user, schema });
  if (provider === "gemini") return askGemini({ key, model, system, user, schema });
  if (provider === "groq") return askGroq({ key, model, system, user, schema });
  throw new AIError("Unknown provider.");
}

let anthropicModule = null;

async function askClaude({ key, model, system, user, schema }) {
  anthropicModule ||= await import(SDK_URL);
  const Anthropic = anthropicModule.default;
  // The key belongs to the person using this page and goes only to api.anthropic.com.
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: TIMEOUT_MS });
  const params = {
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
  };
  // On a safety decline, let the API retry on its recommended fallback model (not offered for Haiku).
  if (model !== "claude-haiku-5-5") {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  let response;
  try {
    response = await client.beta.messages.create(params);
  } catch (err) {
    throw new AIError(claudeError(err), err?.status);
  }
  if (response.stop_reason === "refusal") {
    throw new AIError("Claude declined this request." + (response.stop_details?.explanation ? " " + response.stop_details.explanation : ""));
  }
  if (response.stop_reason === "max_tokens") throw new AIError("The answer was cut off. Try again.");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJSON(text, "Claude");
}

function claudeError(err) {
  const A = anthropicModule?.default;
  if (A && err instanceof A.AuthenticationError) return "Claude rejected the API key. Check it under AI settings.";
  if (A && err instanceof A.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (A && err instanceof A.NotFoundError) return "That Claude model wasn't found. Pick another one.";
  if (A && err instanceof A.RateLimitError) return "Claude's rate limit was reached. Wait a moment and try again.";
  if (A && err instanceof A.BadRequestError) {
    const msg = err.error?.error?.message || err.message;
    if (/credit balance/i.test(msg)) return "Your Anthropic account is out of credit. Add some at console.anthropic.com.";
    return "Claude couldn't process the request: " + msg;
  }
  if (A && err instanceof A.InternalServerError) return "Claude is having trouble right now. Try again shortly.";
  if (A && err instanceof A.APIConnectionError) return "Couldn't reach Claude. Check your connection.";
  if (A && err instanceof A.APIError) return "Claude error: " + err.message;
  return err?.message || String(err);
}

async function askGemini({ key, model, system, user, schema }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: toGeminiSchema(schema) },
  };
  const res = await timedFetch(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(geminiError(res.status, data), res.status);
  const cand = data.candidates?.[0];
  if (!cand) throw new AIError("Gemini blocked this request" + (data.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : "") + ".");
  if (cand.finishReason === "MAX_TOKENS") throw new AIError("The answer was cut off. Try again.");
  if (cand.finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(cand.finishReason)) {
    throw new AIError(`Gemini stopped early (${cand.finishReason}). Try again or adjust the inputs.`);
  }
  const text = (cand.content?.parts || []).map((p) => p.text || "").join("");
  return parseJSON(text, "Gemini");
}

function geminiError(status, data) {
  const msg = data?.error?.message || "";
  if (status === 400 && /api key/i.test(msg)) return "Gemini rejected the API key. Check it under AI settings.";
  if (status === 403) return "This Gemini key isn't allowed to do that. Check it under AI settings.";
  if (status === 404) return "That Gemini model wasn't found. Pick another one.";
  if (status === 429) return "Gemini's rate limit or quota was reached. Wait a moment and try again.";
  if (status >= 500) return `Gemini is having trouble right now (HTTP ${status}). Try again shortly.`;
  return `Gemini error (HTTP ${status})` + (msg ? ": " + msg : ".");
}

async function askGroq({ key, model, system, user, schema }) {
  const body = {
    model,
    messages: [
      { role: "system", content: system + "\n\nReply with one JSON object that matches this JSON schema, and nothing else:\n" + JSON.stringify(schema) },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  };
  const res = await timedFetch(`${GROQ_API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(groqError(res.status, data), res.status);
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new AIError("The answer was cut off. Try again.");
  return parseJSON(choice?.message?.content || "", "Groq");
}

function groqError(status, data) {
  const msg = data?.error?.message || "";
  if (status === 401) return "Groq rejected the API key. Check it under AI settings.";
  if (status === 404) return "That Groq model wasn't found. Pick another one.";
  if (status === 429) return "Groq's rate limit was reached. Wait a moment and try again.";
  if (status === 400 && /json/i.test(msg)) return "The Groq model didn't return valid JSON. Try again, or pick another model.";
  if (status >= 500) return `Groq is having trouble right now (HTTP ${status}). Try again shortly.`;
  return `Groq error (HTTP ${status})` + (msg ? ": " + msg : ".");
}

// ---------- helpers ----------

async function timedFetch(url, opts) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } catch (err) {
    if (err?.name === "AbortError") throw new AIError("The request took too long and was stopped. Try again.");
    throw new AIError("Couldn't reach the AI service. Check your connection.");
  } finally {
    clearTimeout(t);
  }
}

function parseJSON(text, who) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{[\s\S]*\}/.exec(t);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    throw new AIError(`${who} didn't return valid JSON. Try again.`);
  }
}

// JSON Schema (as used for Claude) → Gemini's OpenAPI-style schema.
export function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties") continue;
    if (k === "type") out.type = String(v).toUpperCase();
    else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v).map(([n, d]) => [n, toGeminiSchema(d)]));
    else if (k === "items") out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}
