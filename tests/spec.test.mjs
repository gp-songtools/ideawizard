// Idea Wizard and the song spec: works with and without other tools' sections, and a save never
// changes anything Idea Wizard doesn't own. Run: node --test tests/ (no dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SongSpec as S, specInputs, usedSections, usedText, specWriteIdea, ideaBody, overwriteNotes } from "../spec.js";
import { cleanIdeas, cleanPlan, parseStructure } from "../prompts.js";

const [IDEA] = cleanIdeas({ ideas: [{ title: "Paper Lanterns", topic: "Letting go of a friendship", theme: "Quiet grief", subject: "Two friends", angle: "One lantern per unsaid thing", hook: "I let the light go up", imagery: ["lanterns", "river"], why_it_fits: "Wistful folk suits it." }] });
const PLAN_JSON = { logline: "A goodbye without a fight.", perspective: "First person", tone: "Tender", sections: [
  { tag: "[VERSE 1|wistful]", beat: "The unanswered message.", images: ["phone glow"], lines: 2, bars: 8, rhyme: "AB" },
  { tag: "[CHORUS]", beat: "Letting the lanterns go.", images: ["river"], lines: 2, bars: 8, rhyme: "AA" },
], hook_ideas: ["I let the light go up"], word_bank: ["ember", "drift"], title_options: ["Lanterns"], avoid: ["breakup clichés"] };

const STRUCTURE = "89 BPM, Ab minor\n\n[VERSE 1|wistful]\n8 bars, 22 secs, 2 lines. Rhyme: AB. Syllables: 8.6.\n\n[CHORUS]\n8 bars, 22 secs, 2 lines. Rhyme: AA. Syllables: 6.6.";

const UPSTREAM = `---
schema_version: 1
title: Paper Lanterns
model: v6
bpm: 89
key: Ab minor
bpm_key_by: gp-blueprint
x_custom: keep me
---

# Song spec

## Reference (never send to Suno)
<!-- song-spec: by=gp-blueprint at=2026-11-17T13:55Z hash=00000000 -->
Artist: Some Artist

## Analysis
<!-- song-spec: by=earprint at=2026-11-17T13:40Z hash=00000000 -->
Earprint analysis
Tempo: 89 BPM
Key: Ab minor (1A)

## Style
<!-- song-spec: by=gp-blueprint at=2026-11-17T13:55Z hash=00000000 -->
Indie folk, 89 BPM, Ab minor, soft breathy vocals.

## Structure
<!-- song-spec: by=gp-blueprint at=2026-11-17T13:55Z hash=00000000 -->
${STRUCTURE}

## Lyrics
<!-- song-spec: by=lyricpad at=2026-11-17T14:20Z hash=00000000 -->
[VERSE 1]
Your name still glows

## My extra section
Hand-written, unknown to every tool.
`;

// Everything Idea Wizard doesn't own, from the document in memory.
function notOwned(doc) {
  return {
    sections: doc.sections.filter((s) => !["idea", "idea-structure"].includes(s.id)).map((s) => s.head + s.lines.join("")),
    settings: (doc.fm?.items || []).filter((x) => x.key !== "schema_version").map((x) => x.line),
  };
}

test("no song spec: nothing offered; saving an idea creates a valid spec", () => {
  const doc = S.parse("");
  const inp = specInputs(doc);
  assert.deepEqual(inp, { style: null, structure: null, analysis: null });
  assert.deepEqual(usedSections(inp, { style: "my style", structure: "", earprint: "" }), []);
  specWriteIdea(doc, { idea: IDEA });
  const back = S.parse(S.serialize(doc));
  assert.match(S.section(back, "idea").body, /^Title: Paper Lanterns\nTopic: Letting go of a friendship\n/);
  assert.equal(S.section(back, "idea-structure"), null, "no plan, no structure");
  assert.equal(S.validate(back).filter((i) => i.level === "error").length, 0);
});

test("a plan made without any song spec (suggested shapes) still saves a parseable structure", () => {
  const doc = S.parse("");
  const plan = cleanPlan(PLAN_JSON, null);
  specWriteIdea(doc, { idea: IDEA, plan, structure: null, inputs: { style: "", structure: "", earprint: "", steer: "hopeful" } });
  const st = S.section(S.parse(S.serialize(doc)), "idea-structure").body;
  const parsed = parseStructure(st);
  assert.ok(parsed, "Idea structure must parse as the structure format");
  assert.deepEqual(parsed.sections.map((x) => x.lines), [2, 2]);
});

test("with upstream sections: offers them, records what was used, keeps everything else", () => {
  const doc = S.parse(UPSTREAM);
  const inp = specInputs(doc);
  assert.equal(inp.style.by, "gp-blueprint");
  assert.equal(inp.structure.text, STRUCTURE);
  assert.match(inp.analysis.text, /^Earprint analysis/);

  const boxes = { style: inp.style.text, structure: inp.structure.text + "\n", earprint: inp.analysis.text, steer: "" };
  const used = usedSections(inp, boxes);
  assert.deepEqual(used, ["style", "structure", "analysis"]);
  assert.equal(usedText(inp, used), "Style (GP Blueprint), Structure (GP Blueprint), Analysis (Earprint)");
  assert.deepEqual(usedSections(inp, { ...boxes, style: "edited" }), ["structure", "analysis"]);

  const before = notOwned(doc);
  const st = parseStructure(boxes.structure);
  const plan = cleanPlan(PLAN_JSON, st);
  specWriteIdea(doc, { idea: IDEA, plan, structure: st, inputs: boxes, used });
  assert.deepEqual(notOwned(doc), before, "saving an idea changed something Idea Wizard doesn't own");
  const back = S.parse(S.serialize(doc));
  const ist = S.section(back, "idea-structure");
  assert.deepEqual(Object.keys(ist.marker.from), ["style", "structure", "analysis"]);
  assert.match(ist.body, /^89 BPM, Ab minor\n\n\[VERSE 1\|wistful\]\n8 bars, 22 secs, 2 lines\. Rhyme: AB\. Syllables: 8\.6\. Story: The unanswered message\./);
  assert.match(S.section(back, "idea").body, /Logline: A goodbye without a fight\.\nPerspective: First person\nTone: Tender/);
  // Canonical order: Idea and Idea structure go first.
  assert.deepEqual(back.sections.map((x) => x.id || x.heading), ["idea", "idea-structure", "reference", "analysis", "style", "structure", "lyrics", "My extra section"]);
});

test("saving an idea without a plan empties Idea structure, so no other idea's structure is left behind", () => {
  const doc = S.parse(UPSTREAM);
  specWriteIdea(doc, { idea: IDEA, plan: cleanPlan(PLAN_JSON, null) });
  assert.ok(S.section(doc, "idea-structure"));
  specWriteIdea(doc, { idea: { ...IDEA, title: "Another" } });
  assert.equal(S.section(doc, "idea-structure"), null);
});

test("a later Blueprint run marks Idea structure as based on an older structure", () => {
  const doc = S.parse(UPSTREAM);
  const st = parseStructure(STRUCTURE);
  specWriteIdea(doc, { idea: IDEA, plan: cleanPlan(PLAN_JSON, st), structure: st, used: ["structure"], at: "2026-11-17T14:05Z" });
  S.setSection(doc, "structure", "92 BPM, A minor\n\n[CHORUS]\n8 bars, 20 secs, 4 lines.", { by: "gp-blueprint", at: "2026-11-18T09:00Z" });
  assert.match(S.staleNotes(doc, "idea-structure").join(" "), /Idea structure is based on an older Structure/);
  assert.equal(S.pickStructure(doc).id, "structure");
});

test("asks before overwriting hand edits", () => {
  const doc = S.parse(UPSTREAM);
  specWriteIdea(doc, { idea: IDEA });
  assert.deepEqual(overwriteNotes(doc), []);
  const edited = S.parse(S.serialize(doc).replace("Theme: Quiet grief", "Theme: Loud grief"));
  assert.match(overwriteNotes(edited)[0], /changed by hand/);
});

test("Idea Wizard cannot write sections it doesn't own", () => {
  const doc = S.parse(UPSTREAM);
  assert.throws(() => S.setSection(doc, "structure", "x", { by: "ideawizard" }));
  assert.throws(() => S.setSetting(doc, "title", "x", { by: "ideawizard" }));
});

test("ideaBody keeps the labelled lines other tools read", () => {
  const body = ideaBody(IDEA, null);
  assert.match(body, /^Title: Paper Lanterns$/m);
  assert.match(body, /^Topic: Letting go of a friendship$/m);
  assert.match(body, /^Imagery: lanterns, river$/m);
});
