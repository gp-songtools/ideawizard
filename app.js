import { PROVIDERS, listModels, defaultModel, ask } from "./providers.js";
import {
  SYSTEM, parseStructure, describeStructure, looksLikeEarprint,
  ideasPrompt, expandPrompt, deeperPrompt, IDEAS_SCHEMA, EXPAND_SCHEMA, DEEPER_SCHEMA,
  cleanIdeas, cleanPlan, cleanDeeper, lyricpadTopic, structureText, fullIdeaText,
} from "./prompts.js";
import { SongSpec, specInputs, usedSections, usedText, specWriteIdea, overwriteNotes, BOXES, LABELS } from "./spec.js";

const $ = (id) => document.getElementById(id);
const UI_KEY = "ideawizard.ui.v1";
const keyStoreName = (p) => `ideawizard.key.${p}.v1`;

// Browser storage can be blocked (private windows, strict settings); the page works without it.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } },
};

const ui = (() => { try { return JSON.parse(store.get(UI_KEY) || "{}") || {}; } catch { return {}; } })();
ui.provider = PROVIDERS[ui.provider] ? ui.provider : "claude";
ui.models ||= {};
ui.inputs ||= {};
const saveUI = () => store.set(UI_KEY, JSON.stringify(ui));

const keys = {}; // provider → key, held in memory
for (const p of Object.keys(PROVIDERS)) { const k = store.get(keyStoreName(p)); if (k) keys[p] = k; }

const state = { ideas: [], plans: {}, deeper: {}, open: null, busy: false, usedIdeas: [], usedPlans: {} };
const modelCache = {}; // provider → [{id,label}]
const INPUTS = ["style", "structure", "earprint", "steer"];

// ---------- inputs ----------

function inputs() { return Object.fromEntries(INPUTS.map((id) => [id, $(id).value])); }
function structure() { return parseStructure($("structure").value); }

function refreshInputHints() {
  const st = structure();
  const sTxt = $("structure").value.trim();
  const si = $("structInfo");
  if (st) { si.textContent = `Read as GP Blueprint's structure: ${describeStructure(st)}.`; si.className = "hint ok"; }
  else if (sTxt) { si.textContent = "This doesn't look like GP Blueprint's Song Structure, but it will still be used as notes."; si.className = "hint"; }
  else { si.innerHTML = "Refines the plan to your exact sections and line counts. In GP Blueprint, press <b>Copy</b> on the Song Structure &amp; Meter card."; si.className = "hint"; }
  const e = $("earprint").value;
  const ei = $("epInfo");
  if (e.trim() && looksLikeEarprint(e)) { ei.textContent = "Read as Earprint's analysis."; ei.className = "hint ok"; }
  else if (e.trim()) { ei.textContent = "Will be used as notes about the track."; ei.className = "hint"; }
  else { ei.innerHTML = 'Refines the ideas to the track\'s mood, tempo and themes. In <a href="https://gp-songtools.github.io/earprint/" target="_blank" rel="noopener">Earprint</a>, write an AI review, then press <b>Copy for Idea Wizard</b>.'; ei.className = "hint"; }
}

for (const id of INPUTS) {
  $(id).value = typeof ui.inputs[id] === "string" ? ui.inputs[id] : "";
  $(id).addEventListener("input", () => { ui.inputs[id] = $(id).value; saveUI(); refreshInputHints(); renderSpecIn(); });
}
$("clearInputs").onclick = () => {
  for (const id of INPUTS) { $(id).value = ""; ui.inputs[id] = ""; }
  saveUI(); refreshInputHints(); renderSpecIn(); $("style").focus();
};

// ---------- the song spec (shared by the GP Song Tools in this browser; see spec.js) ----------
// Everything read from it is optional: Use fills a box, and the boxes work the same without it.

let specIn = specInputs(SongSpec.parse(SongSpec.store.load() || SongSpec.create()));
const specPanel = SongSpec.mountPanel($("specPanel"), { onChange: (d) => { specIn = specInputs(d); renderSpecIn(); } });

function fillBox(box, text) {
  $(box).value = text;
  $(box).dispatchEvent(new Event("input", { bubbles: true }));
}

function renderSpecIn() {
  const box = $("specIn");
  const avail = Object.keys(BOXES).filter((id) => specIn[id]);
  box.hidden = !avail.length;
  if (!avail.length) return;
  const used = usedSections(specIn, inputs());
  const rows = [el("p", "spec-in-head", "From the song spec"), el("p", "hint", "Optional: fill a box from what the other GP Song Tools saved, or ignore it.")];
  for (const id of avail) {
    const row = el("div", "spec-in-row");
    row.append(el("span", "spec-in-text", `${LABELS[id]} from ${SongSpec.toolName(specIn[id].by)} · ${[...specIn[id].text].length} characters`));
    if (used.includes(id)) row.append(el("span", "spec-ok", "In use"));
    else { const b = el("button", "ghost small", "Use"); b.type = "button"; b.onclick = () => fillBox(BOXES[id], specIn[id].text); row.append(b); }
    rows.push(row);
  }
  const rest = avail.filter((id) => !used.includes(id));
  if (rest.length > 1) {
    const b = el("button", "ghost small", "Use all"); b.type = "button";
    b.onclick = () => { for (const id of rest) fillBox(BOXES[id], specIn[id].text); };
    const row = el("div", "spec-in-row"); row.append(b); rows.push(row);
  }
  if (used.length) rows.push(el("p", "hint ok", `The ideas will use from the song spec: ${usedText(specIn, used)}.`));
  box.replaceChildren(...rows);
}

// Save one idea (and its plan, if expanded) as the song spec's Idea and Idea structure.
function saveToSpec(i, msgEl) {
  const idea = state.ideas[i], plan = state.plans[i] || null;
  const fresh = SongSpec.parse(SongSpec.store.load() || SongSpec.create());
  const notes = overwriteNotes(fresh);
  if (notes.length && !confirm(`${notes.join("\n")}\n\nReplace them with “${idea.title}”?`)) return;
  const deep = plan ? Object.fromEntries(plan.sections.map((_, n) => [n, state.deeper[`${i}:${n}`]]).filter(([, v]) => v)) : {};
  const used = plan ? state.usedPlans[i] || [] : state.usedIdeas;
  const doc = SongSpec.store.update((d) => specWriteIdea(d, { idea, plan, deeper: deep, structure: structure(), inputs: inputs(), used }));
  if (SongSpec.store.load() !== SongSpec.serialize(doc)) { msgEl.textContent = "This browser blocked saving the song spec (private mode or storage full)."; return; }
  msgEl.textContent = plan
    ? "Saved to the song spec: the idea and its song structure (Idea structure), which Lyricpad can use."
    : "Saved the idea to the song spec. Expand it and save again to add its song structure.";
}


// ---------- provider, key, model ----------

function provider() { return ui.provider; }

function renderProvider() {
  const p = provider(), info = PROVIDERS[p];
  for (const r of document.querySelectorAll('input[name="provider"]')) r.checked = r.value === p;
  $("keyLabel").textContent = `${info.name} API key`;
  $("key").placeholder = `Paste your ${info.name} key (${info.keyHint})`;
  $("key").value = keys[p] || "";
  $("key").type = "password"; $("keyShow").textContent = "Show";
  $("keyRemember").checked = !!store.get(keyStoreName(p));
  const note = $("keyNote");
  note.textContent = `${info.keyNote} The key goes only to ${info.name}, straight from your browser. Unless you tick Remember, it's forgotten when you close the tab. `;
  const a = document.createElement("a"); a.href = info.keyUrl; a.target = "_blank"; a.rel = "noopener"; a.textContent = `Get a ${info.name} key`;
  note.append(a, ".");
  renderModels();
}

for (const r of document.querySelectorAll('input[name="provider"]')) {
  r.addEventListener("change", () => { if (r.checked) { ui.provider = r.value; saveUI(); renderProvider(); maybeLoadModels(); } });
}

function syncKey() {
  const p = provider(), k = $("key").value.trim();
  keys[p] = k;
  store.set(keyStoreName(p), $("keyRemember").checked && k ? k : null);
}
let keyTimer = null;
$("key").addEventListener("input", () => { syncKey(); clearTimeout(keyTimer); keyTimer = setTimeout(maybeLoadModels, 700); });
$("keyRemember").addEventListener("change", syncKey);
$("keyShow").onclick = () => { const k = $("key"); k.type = k.type === "password" ? "text" : "password"; $("keyShow").textContent = k.type === "password" ? "Show" : "Hide"; };
$("keyForget").onclick = () => {
  const p = provider(); keys[p] = ""; $("key").value = ""; $("keyRemember").checked = false;
  store.set(keyStoreName(p), null); delete modelCache[p]; renderModels(); setStatus(`${PROVIDERS[p].name} key removed from this page.`);
};

function renderModels() {
  const p = provider(), sel = $("model"), note = $("modelNote");
  const models = modelCache[p] || (p === "claude" ? null : []);
  sel.innerHTML = "";
  const list = models || [];
  if (!list.length) {
    const o = document.createElement("option"); o.value = ""; o.textContent = keys[p] ? "Loading models…" : "Paste a key to list models"; sel.append(o);
    sel.disabled = true;
    note.textContent = p === "claude" ? "" : `Idea Wizard lists the ${PROVIDERS[p].name} models your key can use.`;
    return;
  }
  sel.disabled = false;
  for (const m of list) { const o = document.createElement("option"); o.value = m.id; o.textContent = m.label; sel.append(o); }
  const want = ui.models[p];
  sel.value = list.some((m) => m.id === want) ? want : defaultModel(p, list);
  note.textContent = "Your choice is remembered.";
}
$("model").addEventListener("change", () => { ui.models[provider()] = $("model").value; saveUI(); });

async function maybeLoadModels() {
  const p = provider();
  if (modelCache[p]?.length) { renderModels(); return; }
  if (p === "claude") { modelCache.claude = await listModels("claude"); renderModels(); return; }
  if (!keys[p] || keys[p].length < 10) { renderModels(); return; }
  renderModels();
  try {
    const models = await listModels(p, keys[p]);
    if (provider() !== p) return;
    modelCache[p] = models;
    renderModels();
    if (!models.length) $("modelNote").textContent = "No suitable models were found for this key.";
  } catch (err) {
    if (provider() !== p) return;
    $("modelNote").textContent = err.message;
    setStatus(err.message, true);
  }
}

// ---------- status ----------

function setStatus(msg, isErr = false, busy = false) {
  const s = $("status"); s.textContent = msg || ""; s.className = "status" + (isErr ? " err" : "") + (busy ? " busy" : "");
}
function setBusy(b) {
  state.busy = b;
  for (const el of document.querySelectorAll("#go, #more, .idea button, #detail button")) el.disabled = b;
}

async function run(label, fn) {
  if (state.busy) return null;
  setBusy(true); setStatus(label, false, true);
  try { const r = await fn(); setStatus(""); return r; }
  catch (err) { setStatus(err.message || String(err), true); return null; }
  finally { setBusy(false); }
}

function request(user, schema) {
  const p = provider();
  return ask({ provider: p, key: keys[p], model: $("model").value, system: SYSTEM, user, schema });
}

// The structure only refines the ideas; a style prompt, an Earprint analysis or a direction is enough to start.
function hasInput() { return ["style", "earprint", "steer"].some((id) => $(id).value.trim()); }

// ---------- level 1: three ideas ----------

async function conjure(more = false) {
  if (!hasInput()) { setStatus("Paste a style prompt or an Earprint analysis, or type a direction in Steer it, first. The song structure is optional.", true); $("style").focus(); return; }
  if (!keys[provider()]) { setStatus(`Paste your ${PROVIDERS[provider()].name} API key first.`, true); $("key").focus(); return; }
  if (!$("model").value) { await maybeLoadModels(); if (!$("model").value) { setStatus("Choose a model first.", true); return; } }
  const avoid = more ? state.ideas.map((i) => i.title) : [];
  const used = usedSections(specIn, inputs());
  const j = await run(more ? "Conjuring 3 more ideas…" : "Conjuring 3 ideas…", () => request(ideasPrompt(inputs(), avoid), IDEAS_SCHEMA));
  if (!j) return;
  try { state.ideas = cleanIdeas(j); } catch (err) { setStatus(err.message, true); return; }
  state.plans = {}; state.deeper = {}; state.open = null; state.usedIdeas = used; state.usedPlans = {};
  if (used.length) setStatus(`Used from the song spec: ${usedText(specIn, used)}.`);
  renderIdeas(); $("detail").hidden = true;
  $("results").hidden = false;
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}
$("go").onclick = () => conjure(false);
$("more").onclick = () => conjure(true);

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function kv(label, value) { const p = el("p", "kv"); p.append(el("b", null, label + ": "), document.createTextNode(value)); return p; }
function chips(items) { const ul = el("ul", "chips"); for (const it of items) ul.append(el("li", null, it)); return ul; }

function renderIdeas() {
  const ol = $("ideas"); ol.innerHTML = "";
  state.ideas.forEach((idea, i) => {
    const li = el("li", "idea" + (state.open === i ? " on" : ""));
    li.append(el("h3", null, idea.title), el("p", "topic", idea.topic));
    if (idea.theme) li.append(kv("Theme", idea.theme));
    if (idea.subject) li.append(kv("Subject", idea.subject));
    if (idea.angle) li.append(kv("Angle", idea.angle));
    if (idea.hook) li.append(kv("Hook", idea.hook));
    if (idea.imagery.length) li.append(chips(idea.imagery));
    if (idea.why_it_fits) li.append(el("p", "why", idea.why_it_fits));
    const act = el("div", "actions");
    const ex = el("button", null, state.plans[i] ? "Open plan" : "Expand ▸"); ex.type = "button"; ex.onclick = () => expand(i);
    const cp = el("button", "ghost", "Copy for Lyricpad"); cp.type = "button";
    const msg = el("span", "copied"); msg.setAttribute("role", "status");
    cp.onclick = () => copy(lyricpadTopic(idea, state.plans[i]), msg, "Copied. Paste it into Lyricpad's Topic / feel box.");
    const sv = el("button", "ghost", "Save to song spec"); sv.type = "button";
    sv.title = "Save this idea (and its plan, if expanded) to the song spec the GP Song Tools share";
    sv.onclick = () => saveToSpec(i, msg);
    act.append(ex, cp, sv, msg); li.append(act);
    ol.append(li);
  });
}

// ---------- level 2: the song plan ----------

async function expand(i) {
  if (!state.plans[i]) {
    const idea = state.ideas[i], st = structure();
    const used = usedSections(specIn, inputs());
    const j = await run(`Expanding “${idea.title}”…`, () => request(expandPrompt(inputs(), idea, st), EXPAND_SCHEMA));
    if (!j) return;
    try { state.plans[i] = cleanPlan(j, st); } catch (err) { setStatus(err.message, true); return; }
    state.usedPlans[i] = used;
    if (used.length) setStatus(`Used from the song spec: ${usedText(specIn, used)}.`);
  }
  state.open = i; renderIdeas(); renderDetail();
  $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDetail() {
  const i = state.open, idea = state.ideas[i], plan = state.plans[i], box = $("detail");
  box.innerHTML = ""; box.hidden = false;
  const head = el("div", "card-head");
  head.append(el("h3", null, idea.title));
  const back = el("button", "ghost small", "Back to ideas"); back.type = "button";
  back.onclick = () => { $("results").scrollIntoView({ behavior: "smooth", block: "start" }); };
  head.append(back); box.append(head);
  box.append(el("p", null, plan.logline));
  const meta = el("div", "plan-meta");
  for (const [k, v] of [["Topic", idea.topic], ["Perspective", plan.perspective], ["Tone", plan.tone]]) { const d = el("div"); d.append(el("b", null, k), document.createTextNode(v)); meta.append(d); }
  box.append(meta);

  box.append(el("h4", null, "Section by section"));
  if (plan.sections.every((s) => s.struct?.suggested)) box.append(el("p", "hint", "A typical song layout, with suggested line counts and rhymes. Paste GP Blueprint's song structure and Expand again to plan your exact sections."));
  const secs = el("ol", "secs");
  plan.sections.forEach((sec, n) => {
    const li = el("li", "sec" + (sec.instrumental ? " inst" : ""));
    const lines = (sec.struct?.lines ? ` · ${sec.struct.lines} lines${sec.struct.rhyme ? " · " + sec.struct.rhyme : ""}` : sec.instrumental ? " · instrumental" : "") + (sec.struct?.suggested ? " (suggested)" : "");
    li.append(el("div", "tag", sec.tag + lines), el("p", null, sec.beat));
    if (sec.images.length) li.append(chips(sec.images));
    const d = state.deeper[`${i}:${n}`];
    if (d) {
      if (d.note) li.append(el("p", "why", d.note));
      const ol = el("ol", "lines");
      for (const l of d.lines) {
        const it = el("li"); it.append(document.createTextNode(l.beat));
        if (l.image) it.append(document.createTextNode(" "), el("span", "img", `(${l.image})`));
        if (l.end_word_ideas.length) it.append(document.createTextNode(" "), el("span", "ends", "→ " + l.end_word_ideas.join(" / ")));
        ol.append(it);
      }
      li.append(ol);
    } else if (!sec.instrumental) {
      const b = el("button", "ghost small", "Go deeper: line by line"); b.type = "button"; b.onclick = () => deeper(i, n);
      const act = el("div", "actions"); act.append(b); li.append(act);
    }
    secs.append(li);
  });
  box.append(secs);

  const ex = el("div", "extras");
  const block = (title, node) => { const d = el("div"); d.append(el("h4", null, title), node); return d; };
  const plain = (items) => { const ul = el("ul", "plain"); for (const t of items) ul.append(el("li", null, t)); return ul; };
  if (plan.hook_ideas.length) ex.append(block("Hook ideas", plain(plan.hook_ideas)));
  if (plan.title_options.length) ex.append(block("Other titles", plain(plan.title_options)));
  if (plan.word_bank.length) ex.append(block("Word bank", chips(plan.word_bank)));
  if (plan.avoid.length) ex.append(block("Steer clear of", plain(plan.avoid)));
  box.append(ex);

  const act = el("div", "actions");
  const msg = el("span", "copied"); msg.setAttribute("role", "status");
  const cl = el("button", null, "Copy for Lyricpad"); cl.type = "button";
  cl.onclick = () => copy(lyricpadTopic(idea, plan), msg, "Copied. In Lyricpad, paste it into Suggest lines › Topic / feel.");
  const cs = el("button", null, "Copy song structure"); cs.type = "button";
  cs.onclick = () => copy(structureText(plan, structure(), inputs(), Object.fromEntries(plan.sections.map((_, n) => [n, state.deeper[`${i}:${n}`]]).filter(([, v]) => v))), msg,
    "Copied in GP Blueprint's structure format. In Lyricpad, paste it into Suggest lines › Write a whole song from a structure.");
  const cf = el("button", "ghost", "Copy the whole plan"); cf.type = "button";
  cf.onclick = () => copy(fullIdeaText(idea, plan, Object.fromEntries(plan.sections.map((_, n) => [n, state.deeper[`${i}:${n}`]]).filter(([, v]) => v))), msg, "Copied the whole plan as text.");
  const lp = el("a", null, "Open Lyricpad"); lp.href = "https://gp-songtools.github.io/lyricpad/"; lp.target = "_blank"; lp.rel = "noopener";
  const sv = el("button", null, "Save to song spec"); sv.type = "button";
  sv.title = "Save the idea and this plan's song structure to the song spec, where Lyricpad can use it";
  sv.onclick = () => saveToSpec(i, msg);
  act.append(cl, cs, sv, cf, lp, msg); box.append(act);
}

// ---------- level 3: line by line ----------

async function deeper(i, n) {
  const plan = state.plans[i], sec = plan.sections[n];
  const j = await run(`Working out ${sec.tag} line by line…`, () => request(deeperPrompt(inputs(), state.ideas[i], plan, sec, sec.struct), DEEPER_SCHEMA));
  if (!j) return;
  try { state.deeper[`${i}:${n}`] = cleanDeeper(j, sec.struct?.lines); } catch (err) { setStatus(err.message, true); return; }
  renderDetail();
}

// ---------- copying ----------

async function copy(text, msgEl, okMsg) {
  try { await navigator.clipboard.writeText(text); msgEl.textContent = okMsg; }
  catch {
    let ta = msgEl.parentElement.querySelector("textarea");
    if (!ta) { ta = document.createElement("textarea"); ta.readOnly = true; ta.rows = 5; msgEl.parentElement.append(ta); }
    ta.value = text; ta.select(); msgEl.textContent = "Copying was blocked. The text is selected: press Ctrl or Cmd + C.";
  }
}

// ---------- start ----------

refreshInputHints();
renderSpecIn();
renderProvider();
maybeLoadModels();
