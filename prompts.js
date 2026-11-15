// Prompts, schemas and input parsing for Idea Wizard. No DOM code here.

// ---------- inputs ----------

// GP Blueprint's Song Structure copy text (spec: gp-songtools/gp-blueprint docs/structure-format.md).
export function parseStructure(text) {
  const blocks = String(text || "").trim().split(/\n\s*\n/).filter((b) => b.trim());
  if (!blocks.length) return null;
  const first = blocks[0].trim().startsWith("[") ? "" : blocks.shift().trim();
  const head = /^(?:(\d+(?:\.\d+)?)\s*BPM)?(?:,?\s*(.+))?$/i.exec(first) || [];
  const sections = blocks.map((b) => {
    const [tagLine = "", details = ""] = b.trim().split("\n");
    const tag = tagLine.trim();
    if (!/^\[.+\]$/.test(tag)) return null;
    const lines = Number(/(\d+) lines\./.exec(details)?.[1] || 0);
    return {
      tag,
      name: /^\[([^:\]]+)/.exec(tag)?.[1].trim() || tag,
      lines,
      instrumental: /instrumental/i.test(details) && !lines,
      rhyme: /Rhyme: ([A-Z]+)\./.exec(details)?.[1] || "",
      syllables: (/Syllables: (\d+(?:\.\d+)*)\./.exec(details)?.[1] || "").split(".").filter(Boolean).map(Number),
      description: details.trim()
        .replace(/^(?:\d+ bars?,?\s*)?(?:\d+ secs?,?\s*)?(?:instrumental|\d+ lines)?\.?\s*/i, "")
        .replace(/^Rhyme: [A-Z]+\.\s*/, "").replace(/^Syllables: [\d.]+\.\s*/, "").trim(),
    };
  }).filter(Boolean);
  if (!sections.length) return null;
  return { bpm: head[1] || "", key: (head[2] || "").trim(), sections };
}

export function describeStructure(st) {
  if (!st) return "";
  const sung = st.sections.filter((s) => s.lines > 0);
  const lines = sung.reduce((n, s) => n + s.lines, 0);
  const bits = [`${st.sections.length} section${st.sections.length === 1 ? "" : "s"}`];
  if (lines) bits.push(`${lines} lyric lines`);
  const tk = [st.bpm && `${st.bpm} BPM`, st.key].filter(Boolean).join(", ");
  if (tk) bits.push(tk);
  return bits.join(" · ");
}

export function looksLikeEarprint(text) {
  return /^\s*Earprint analysis/i.test(text || "") || /(^|\n)(Genres|Moods|Lyric themes|Measured mood):/i.test(text || "");
}

// ---------- prompts ----------

export const SYSTEM = `You are Idea Wizard, a songwriting partner who turns a song's sound into strong, original song concepts.
You get some or all of: a style prompt for an AI music generator, a section-by-section song structure, and an analysis of a track (tempo, key, moods, instruments, lyric themes).
Match the ideas to that sound: its mood, energy, tempo, era and instrumentation should feel like they belong with the story.
Rules:
- Write in US English, plainly and vividly. Be specific: concrete people, places, objects and moments beat abstractions.
- Never name real artists, bands or songs, and never quote or imitate existing lyrics.
- Give concepts, beats and imagery, not finished verses, unless a field asks for short hook phrases.
- Avoid stock clichés (heart of gold, fire and desire, chasing dreams) unless you twist them.`;

function inputBlock({ style, structure, earprint, steer }) {
  const parts = [];
  if (style.trim()) parts.push(`<style_prompt>\n${style.trim()}\n</style_prompt>`);
  if (structure.trim()) parts.push(`<song_structure>\n${structure.trim()}\n</song_structure>`);
  if (earprint.trim()) parts.push(`<track_analysis>\n${earprint.trim()}\n</track_analysis>`);
  if (steer.trim()) parts.push(`<songwriter_direction>\n${steer.trim()}\n</songwriter_direction>`);
  return parts.join("\n\n");
}

export function ideasPrompt(inputs, avoidTitles = []) {
  return `${inputBlock(inputs)}

Come up with exactly 3 song ideas for this sound. Make them genuinely different from each other: for example one literal and personal, one told as a story about someone else, and one built on a metaphor or unusual point of view.
For each idea give:
- title: a short working title
- topic: what the song is about, in one sentence
- theme: the deeper idea or feeling underneath, in a few words
- subject: who or what the song centres on
- angle: the point of view and approach (who is singing, to whom, from when)
- hook: the central hook concept for the chorus, as a short phrase
- imagery: 4 to 6 concrete images or settings
- why_it_fits: one sentence on why it suits this sound${avoidTitles.length ? `\nDon't repeat these earlier ideas: ${avoidTitles.join("; ")}.` : ""}`;
}

export function expandPrompt(inputs, idea, structure) {
  const sections = structure?.sections?.length
    ? `Map the story onto these sections, one entry per section, using the exact tags: ${structure.sections.map((s) => s.tag + (s.lines ? ` (${s.lines} lines)` : " (instrumental)")).join(", ")}.`
    : "Map the story onto a typical structure: [INTRO], [VERSE 1], [PRE-CHORUS], [CHORUS], [VERSE 2], [CHORUS], [BRIDGE], [CHORUS], [OUTRO].";
  return `${inputBlock(inputs)}

<chosen_idea>
${ideaText(idea)}
</chosen_idea>

Develop this idea into a full song plan.
- logline: the whole song in one or two sentences
- perspective: who sings it, to whom, and when
- tone: how it should feel, in a few words
- sections: ${sections} For each give the tag, the beat (what happens or is revealed there, in one or two sentences) and 2 to 4 images to use. For instrumental sections, describe what the music should carry emotionally.
- hook_ideas: 3 short chorus hook phrases (a few words each)
- word_bank: 12 to 16 vivid words and short phrases that fit
- title_options: 4 alternative titles
- avoid: 3 clichés or obvious moves to stay away from`;
}

export function deeperPrompt(inputs, idea, plan, section, structSection) {
  const n = structSection?.lines || 4;
  const rhyme = structSection?.rhyme ? ` Rhyme scheme: ${structSection.rhyme}, one letter per line; lines with the same letter should end on rhyming sounds.` : "";
  const syll = structSection?.syllables?.length ? ` Target syllables per line: ${structSection.syllables.join(".")}.` : "";
  return `${inputBlock(inputs)}

<chosen_idea>
${ideaText(idea)}
</chosen_idea>

<song_plan>
Logline: ${plan.logline}
Perspective: ${plan.perspective}
Tone: ${plan.tone}
${plan.sections.map((s) => `${s.tag}: ${s.beat}`).join("\n")}
</song_plan>

Zoom in on ${section.tag}: ${section.beat}
It has ${n} lyric lines.${rhyme}${syll}
For each line give:
- beat: what the line should say or show, in one sentence (a direction, not the finished lyric)
- image: one concrete image or detail it could use
- end_word_ideas: 2 or 3 possible words to end the line on that fit the rhyme scheme
Return exactly ${n} lines, in order. Also give a short note on how the section should move from its first line to its last.`;
}

export function ideaText(i) {
  return [
    `Title: ${i.title}`, `Topic: ${i.topic}`, `Theme: ${i.theme}`, `Subject: ${i.subject}`,
    `Angle: ${i.angle}`, `Hook: ${i.hook}`, `Imagery: ${(i.imagery || []).join(", ")}`,
  ].join("\n");
}

// ---------- schemas (JSON Schema; converted for Gemini, described in-prompt for Groq) ----------

const str = { type: "string" };
const strs = { type: "array", items: { type: "string" } };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export const IDEAS_SCHEMA = obj({
  ideas: { type: "array", items: obj({ title: str, topic: str, theme: str, subject: str, angle: str, hook: str, imagery: strs, why_it_fits: str }) },
});

export const EXPAND_SCHEMA = obj({
  logline: str, perspective: str, tone: str,
  sections: { type: "array", items: obj({ tag: str, beat: str, images: strs }) },
  hook_ideas: strs, word_bank: strs, title_options: strs, avoid: strs,
});

export const DEEPER_SCHEMA = obj({
  note: str,
  lines: { type: "array", items: obj({ beat: str, image: str, end_word_ideas: strs }) },
});

// ---------- cleaning model output ----------

const s = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : v == null ? "" : String(v).slice(0, max));
const list = (v, n = 20, max = 120) => (Array.isArray(v) ? v.map((x) => s(x, max)).filter(Boolean).slice(0, n) : []);

export function cleanIdeas(j) {
  const ideas = (Array.isArray(j?.ideas) ? j.ideas : []).map((i) => ({
    title: s(i?.title, 80), topic: s(i?.topic), theme: s(i?.theme, 160), subject: s(i?.subject, 200),
    angle: s(i?.angle), hook: s(i?.hook, 160), imagery: list(i?.imagery, 8), why_it_fits: s(i?.why_it_fits),
  })).filter((i) => i.title && i.topic).slice(0, 3);
  if (!ideas.length) throw new Error("The AI didn't return any usable ideas. Try again.");
  return ideas;
}

export function cleanPlan(j, structure) {
  const sections = (Array.isArray(j?.sections) ? j.sections : []).map((x) => ({ tag: s(x?.tag, 80), beat: s(x?.beat, 600), images: list(x?.images, 6) }))
    .filter((x) => x.tag && x.beat).slice(0, 16);
  if (!sections.length) throw new Error("The AI didn't return a usable song plan. Try again.");
  // Line counts and instrumental flags come from the pasted structure, matched by tag (in order).
  const pool = structure?.sections ? [...structure.sections] : [];
  for (const sec of sections) {
    const i = pool.findIndex((p) => p.tag.toUpperCase() === sec.tag.toUpperCase() || p.name.toUpperCase() === (/^\[([^:\]]+)/.exec(sec.tag)?.[1] || "").trim().toUpperCase());
    sec.struct = i >= 0 ? pool.splice(i, 1)[0] : null;
    sec.instrumental = sec.struct ? sec.struct.instrumental : /intro|outro|instrumental|solo|break/i.test(sec.tag) && !/verse|chorus|bridge|hook/i.test(sec.tag);
  }
  return {
    logline: s(j?.logline, 600), perspective: s(j?.perspective), tone: s(j?.tone, 200), sections,
    hook_ideas: list(j?.hook_ideas, 6), word_bank: list(j?.word_bank, 24, 60), title_options: list(j?.title_options, 6, 80), avoid: list(j?.avoid, 6, 200),
  };
}

export function cleanDeeper(j, n) {
  const lines = (Array.isArray(j?.lines) ? j.lines : []).map((l) => ({ beat: s(l?.beat), image: s(l?.image, 200), end_word_ideas: list(l?.end_word_ideas, 4, 40) }))
    .filter((l) => l.beat).slice(0, Math.max(n || 0, 1) + 4);
  if (!lines.length) throw new Error("The AI didn't return any line ideas. Try again.");
  return { note: s(j?.note, 400), lines };
}

// ---------- hand-off text ----------

// One line for Lyricpad's "Topic / feel" field.
export function lyricpadTopic(idea, plan) {
  const bits = [`${idea.title}: ${idea.topic}`, idea.angle && `Angle: ${idea.angle}`, idea.hook && `Hook: ${idea.hook}`,
    plan?.tone ? `Tone: ${plan.tone}` : idea.theme && `Theme: ${idea.theme}`];
  return bits.filter(Boolean).join(". ").replace(/\.\./g, ".");
}

export function fullIdeaText(idea, plan, deeper = {}) {
  const out = [`# ${idea.title}`, "", ideaText(idea), `Why it fits: ${idea.why_it_fits}`];
  if (plan) {
    out.push("", "## Song plan", `Logline: ${plan.logline}`, `Perspective: ${plan.perspective}`, `Tone: ${plan.tone}`, "");
    plan.sections.forEach((sec, i) => {
      out.push(`${sec.tag}`, `  ${sec.beat}`);
      if (sec.images.length) out.push(`  Images: ${sec.images.join(", ")}`);
      const d = deeper[i];
      if (d) d.lines.forEach((l, n) => out.push(`  ${n + 1}. ${l.beat}${l.image ? ` (${l.image})` : ""}${l.end_word_ideas.length ? ` → ${l.end_word_ideas.join(" / ")}` : ""}`));
    });
    out.push("", `Hook ideas: ${plan.hook_ideas.join(" · ")}`, `Word bank: ${plan.word_bank.join(", ")}`, `Other titles: ${plan.title_options.join(" · ")}`, `Avoid: ${plan.avoid.join(" · ")}`);
  }
  return out.join("\n");
}
