// Idea Wizard's side of the GP Song Tools song spec (format: gp-songtools/toolsmenu songspec/SPEC.md).
// Idea Wizard owns Idea and Idea structure. It only reads GP Blueprint's Style and Structure and
// Earprint's Analysis, and works the same without them. No DOM code here.
import "./songspec.js"; // copy of gp-songtools/toolsmenu songspec/songspec.js; sets globalThis.SongSpec
import { ideaText, structureText } from "./prompts.js";

export const SongSpec = globalThis.SongSpec;
export const TOOL = "ideawizard";
const S = SongSpec;

// Spec section → Idea Wizard input box.
export const BOXES = { style: "style", structure: "structure", analysis: "earprint" };
export const LABELS = { style: "Style", structure: "Structure", analysis: "Analysis" };

/** What the song spec offers for each box: { style|structure|analysis: {text, by} | null }. */
export function specInputs(doc) {
  const out = {};
  for (const id of Object.keys(BOXES)) {
    const s = S.section(doc, id);
    out[id] = s ? { text: s.body, by: s.by } : null;
  }
  return out;
}

/** Spec sections whose text is what the boxes hold now: ["style", "analysis", …]. */
export function usedSections(inputs, boxes) {
  return Object.entries(BOXES)
    .filter(([id, box]) => inputs[id] && S.normalize(boxes[box] || "") && S.normalize(boxes[box]) === S.normalize(inputs[id].text))
    .map(([id]) => id);
}

/** "Style (GP Blueprint), Analysis (Earprint)" */
export function usedText(inputs, used) {
  return used.map((id) => `${LABELS[id]} (${S.toolName(inputs[id]?.by)})`).join(", ");
}

/** The Idea section: Idea Wizard's labelled lines, plus the plan's when it was expanded. */
export function ideaBody(idea, plan) {
  const lines = [ideaText(idea)];
  if (idea.why_it_fits) lines.push(`Why it fits: ${idea.why_it_fits}`);
  if (plan) {
    const list = (label, items, sep = ", ") => items?.length && lines.push(`${label}: ${items.join(sep)}`);
    if (plan.logline) lines.push(`Logline: ${plan.logline}`);
    if (plan.perspective) lines.push(`Perspective: ${plan.perspective}`);
    if (plan.tone) lines.push(`Tone: ${plan.tone}`);
    list("Hook ideas", plan.hook_ideas, " · ");
    list("Word bank", plan.word_bank);
    list("Other titles", plan.title_options, " · ");
    list("Avoid", plan.avoid, " · ");
  }
  return lines.join("\n").replace(/[ \t]*\n[ \t]*/g, "\n");
}

/** Why to ask before saving over the Idea sections ('' entries removed). */
export function overwriteNotes(doc) {
  return ["idea", "idea-structure"].map((id) => S.confirmReason(doc, id, TOOL)).filter(Boolean);
}

/**
 * Save one idea (and its plan, if expanded) to the spec. Idea structure is written from the plan;
 * with no plan it is emptied, so a structure from another idea never sits next to this one.
 * `used` = spec sections the idea/plan was made from; `structure` = parsed structure box (or null);
 * `inputs` = the input boxes; `deeper` = {sectionIndex: line-by-line} for the plan.
 */
export function specWriteIdea(doc, { idea, plan = null, deeper = {}, structure = null, inputs = {}, used = [], at }) {
  S.setSection(doc, "idea", ideaBody(idea, plan), { by: TOOL, from: used, at });
  S.setSection(doc, "idea-structure", plan ? structureText(plan, structure, inputs, deeper) : "", { by: TOOL, from: used, at });
  return doc;
}
