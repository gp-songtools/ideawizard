# Changelog

All notable changes to Idea Wizard, newest first. The app has no version numbers, so entries are grouped by date.

## 2026-11-18 — Song spec

### Added

- **Song spec**: the song file shared by the GP Song Tools in this browser. A panel at the top shows which tool filled each part and when, and lets you clear a part, start a new song, open a `.songspec.md` file or download one to hand to Claude.
- **From the song spec** under Your sound: when GP Blueprint saved its style prompt and song structure, or Earprint its analysis, fill each box with **Use** (or **Use all**). The status line says what the ideas and plan used. All optional: with nothing saved, Idea Wizard works as before.
- **Save to song spec** on each idea and on its plan saves the idea, and once expanded its song structure, for Lyricpad to use. Saving an idea that isn't expanded clears the previous plan's structure, so it never sits next to a different idea.

## 2026-11-17 — Full section tags

### Fixed

- Long section tags (with style hints, like `[CHORUS|anthemic gang vocals|full band]`) are no longer cut short or missing their closing bracket in the song plan and the copied text, so they paste cleanly into Suno and Lyricpad. Tags from your pasted GP Blueprint structure are now kept exactly as written.

## 2026-11-16 — Copy song structure

### Added

- **Copy song structure** on every song plan: copies the plan in GP Blueprint's song structure format, with each section's story, images and any line-by-line directions. Paste it into Lyricpad's *Write a whole song from a structure* and the lyrics follow your plan. It still works anywhere a GP Blueprint structure does, including back in Idea Wizard.
- Without a pasted structure, the plan now suggests line counts, bars and a rhyme scheme for each section (marked "suggested"), and **Go deeper** follows them.

## 2026-11-15 — First release

### Added

- **Three song ideas from your sound.** Paste GP Blueprint's style prompt or Earprint's track analysis (or just type a direction) and get three different ideas, each with a title, topic, theme, subject, angle, hook concept, imagery and a note on why it fits. Add both, plus GP Blueprint's song structure (optional), to refine the ideas to the track's sound and your song's sections.
- **Expand** any idea into a song plan: a logline, perspective and tone, a beat and images for every section of your GP Blueprint structure (or a typical song layout without one), hook ideas, a word bank, other titles and clichés to steer clear of.
- **Go deeper** on any sung section for line-by-line directions that follow its line count, rhyme scheme and syllable targets, with end-word ideas that fit the rhyme.
- **More ideas** gives three fresh ones without repeating the last set.
- **Copy for Lyricpad** copies an idea as one line for Lyricpad's Topic / feel box, and **Copy the whole plan** copies everything as text.
- Works with **Claude**, **Gemini** or **Groq**, using your own API key. Idea Wizard lists the models your key can use and remembers your choice. The key is forgotten when you close the tab unless you tick **Remember key on this device**.
- Recognises GP Blueprint's song structure and Earprint's analysis as you paste them.
