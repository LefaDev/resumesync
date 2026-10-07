# ResumeSync

A clean, minimalist, fully client-side web app that helps you adapt your resume for a
specific job description — before you apply.

**Headline:** *Fix your resume before you apply.*

## Features

- **Two-column layout** — paste your current resume on the left, the desired job
  description on the right.
- **Analyze Match** — one prominent button runs the analysis instantly (no page reload).
- **Match Score** — a weighted keyword-overlap percentage, shown with an animated
  circular progress indicator.
- **Job Description Coverage** — a line-by-line gap analysis: every requirement line
  in the JD is checked against your resume and marked covered / partial / gap, with
  the specific missing terms called out per line.
- **Missing Critical Keywords** — a checklist of the most important terms found in the
  job description but absent from your resume, grouped by category (Hard Skills,
  Tools & Platforms, Soft Skills, Methods & Practices, Other) and tickable as you
  add them.
- **What to Change** — concrete, bulleted advice on exactly where to inject those
  keywords (skills section, summary, achievement bullets, ATS wording).
- **Optimize Bullets — X-Y-Z Formula** — passive task bullets are rewritten as
  metric-driven achievements: *Accomplished X, measured by Y, by doing Z*. Each
  rewrite shows the before/after, the X-Y-Z breakdown, highlighted metrics, and
  strike-throughs on removed filler words. Tick the rewrites you want in your export.
- **Export ATS-Safe Resume** — download your optimized resume as a clean Word
  `.docx`, a structured `.pdf`, or plain `.txt`, with a computed ATS-compliance
  checklist.
- **Light & dark mode** — a header toggle switches between the dark slate/indigo
  theme and a light slate/indigo theme. Your choice is saved, the OS preference is
  respected on first visit, and the theme is applied before first paint (no flash
  of the wrong theme).
- **Private by design** — everything runs locally in your browser; no uploads, no
  tracking, no sign-up.

## How the matching works

`analyzer.js` is a dependency-free engine that:

1. Tokenizes both texts (lowercase, punctuation-stripped, stopwords removed).
2. Extracts the most important terms from the job description: multi-word phrases
   ("machine learning", "CI/CD", "design system"…), known tools/technologies, soft
   skills, and methodologies — weighted by frequency and term type.
3. Checks each keyword against the resume (exact, plural/verb-form variants, stems,
   prefix/suffix containment so `MySQL` matches `SQL`, **and synonym awareness** —
   "Kubernetes" satisfies "k8s", "PostgreSQL" satisfies "postgres", etc.).
4. Computes a weighted match score and the missing-keyword list, then generates
   targeted advice grouped by keyword category.
5. Performs a **line-by-line JD gap analysis** (`analyzeRequirements`): requirement
   lines (boilerplate filtered) are classified as covered / partial / gap based on
   which of their keywords the resume contains.
6. Parses the resume (`parseResume`) into a header, standard sections (heading
   aliases like "Core Skills" → SKILLS are normalized), and bullet points.

## X-Y-Z bullet rewriting

`rewriter.js` converts passive task bullets into achievement statements using the
X-Y-Z formula — *"Accomplished [X], as measured by [Y], by doing [Z]"* — with strict
guardrails:

- **Filler guardrail** — robotic AI clichés ("pivotal role", "testament to",
  "synergistic", "leveraged", "spearheaded", "passionate about", "results-driven",
  "detail-oriented", "think outside the box", …) are stripped or replaced with plain
  wording; removed words are shown struck-through in the UI.
- **Passive-to-active conversion** — "Responsible for…", "Duties included…",
  "Was tasked with…", "Helped with…" are removed, and weak verbs are upgraded
  (helped → supported, handled → managed, worked on → developed).
- **Metric elevation** — numbers with units, currency, ranges ("from 4.1s to 1.8s"),
  and multipliers ("2x", "$1.2M") are extracted and placed in the "measured by [Y]"
  slot, highlighted in the UI.
- **No-invention guardrail** — the rewriter never fabricates metrics, numbers, or
  achievements. When a bullet has no metric, a bracketed placeholder
  (`[add a metric — e.g., % faster, $ saved, hours per week]`) marks where you must
  supply a real number; placeholders are removed on export.
- **Content preservation** — when a bullet contains several outcomes, the full
  original text is kept rather than dropping any of them.

The rewrite rules are deterministic and auditable (no AI backend, no network calls) —
the same "prompt instructions" a human coach would apply, encoded as data.

## ATS-compliant export

`exporter.js` builds recruiter- and ATS-friendly files with zero dependencies:

- **`.docx`** — a real Word file: a minimal OOXML package (hand-rolled zip writer),
  with true `Heading 1` styles for section headings.
- **`.pdf`** — a real PDF: a minimal PDF 1.4 writer (text is fully extractable).
- **`.txt`** — structured plain text with standard headings.

ATS compliance is guaranteed **by construction**: strictly single-column layout (no
columns, tables, text boxes, or graphics anywhere), standard semantic section
headings (WORK EXPERIENCE, SKILLS, EDUCATION, …), and real extractable text (no
images of text). A computed checklist in the export card verifies the layout
guarantees, required headings, header contact info, and keyword alignment before
you download.

## Accessibility & design

- Semantic slate/indigo theming driven entirely by CSS custom-property tokens,
  defined per theme (`[data-theme='dark']` / `[data-theme='light']`) — no raw hex
  values anywhere in component styles.
- Both themes are audited at a strict contrast ratio ≥ 4.5:1 (58 automated checks
  covering every text/background pair, including translucent washes blended over
  their real surfaces — see `../contrast-check.py` in the dev environment).
- 16px base type with 1.5 line-height; no text below 12px.
- Minimum 44×44px touch targets on the analyze button, every checklist item, every
  optimizer checkbox, and every export button.
- Visible text labels on all inputs, explicit focus rings, skip link, ARIA live
  regions, and `prefers-reduced-motion` support.
- SVG icons only — no emoji.
- Fully responsive across mobile, tablet, and desktop: fluid hero type via
  `clamp()`, two-column layouts that stack below 900px, two-column keyword chips
  down to 640px, full-width actions and compact chrome on phones, a smaller
  score ring below 380px, and 16px inputs to prevent iOS focus zoom.

## Run it

No build step and no dependencies. Either open `index.html` directly in a browser, or
serve the folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Project structure

```
index.html     — page structure (hero, inputs, results, export)
styles.css     — design system (semantic tokens, dark slate/indigo theme)
analyzer.js    — matching engine: scoring, gap analysis, requirements, parsing
rewriter.js    — X-Y-Z bullet rewriter with filler/no-invention guardrails
exporter.js    — ATS-safe .docx / .pdf / .txt export (dependency-free writers)
app.js         — UI wiring: events, loading states, animations, rendering
```

## Test the engines

```bash
# Matching + gap analysis
node -e "const a=require('./analyzer.js'); \
  const r=a.analyze('React developer with 5 years of TypeScript and Node.js experience','Senior React role requiring TypeScript, Node.js, GraphQL and AWS'); \
  console.log(r.score, r.missing.map(k=>k.display))"

# X-Y-Z rewriting
node -e "const r=require('./rewriter.js'); \
  console.log(r.rewriteBullet('Responsible for managing a team, reducing defects by 30%').rewritten)"

# Export round-trip (write files, then validate)
node -e "const e=require('./exporter.js'),a=require('./analyzer.js'),fs=require('fs'); \
  const p=a.parseResume('JANE DOE\njane@mail.com\n\nWORK EXPERIENCE\n- Built X, cutting load time by 40%\n\nSKILLS\nReact, TypeScript\n\nEDUCATION\nBSc'); \
  const d=e.buildDocument(p,new Map([['0:0',e.buildDocument(p).sections[0].bullets[0]]])); \
  fs.writeFileSync('/tmp/r.docx',Buffer.from(e.buildDocx(d))); \
  fs.writeFileSync('/tmp/r.pdf',Buffer.from(e.buildPdf(d))); \
  console.log('written')"
# then: python3 -c "import zipfile; zipfile.ZipFile('/tmp/r.docx').testzip()" etc.
```
