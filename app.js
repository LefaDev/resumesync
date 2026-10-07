/* ============================================================
   ResumeSync — UI wiring (DOM, animations, events)
   Depends on:
     analyzer.js  -> window.ResumeAnalyzer  (matching, gap analysis, parsing)
     rewriter.js  -> window.ResumeRewriter  (X-Y-Z bullet rewrites)
     exporter.js  -> window.ResumeExporter  (ATS-safe .docx/.pdf/.txt export)
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const analyzer = window.ResumeAnalyzer;
  const rewriter = window.ResumeRewriter;
  const exporter = window.ResumeExporter;

  /* ---------- inline SVG icons (stroke style, currentColor) ---------- */

  const svg = (inner) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    inner + '</svg>';

  const ICONS = {
    arrow: svg('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>'),
    arrowDown: svg('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>'),
    checkCircle: svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    alertTriangle: svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    alertCircle: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
    minus: svg('<line x1="5" y1="12" x2="19" y2="12"/>'),
    x: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    trending: svg('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
    wrench: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
    loop: svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
    users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    target: svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
    copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    list: svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>')
  };

  const CATEGORY_LABELS = {
    'hard-skill': 'Hard skill',
    tool: 'Tool',
    soft: 'Soft skill',
    method: 'Method',
    core: 'Keyword'
  };

  const GROUP_ORDER = ['hard-skill', 'tool', 'soft', 'method', 'core'];
  const GROUP_LABELS = {
    'hard-skill': 'Hard Skills',
    tool: 'Tools & Platforms',
    soft: 'Soft Skills',
    method: 'Methods & Practices',
    core: 'Other Keywords'
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ---------- sample data ---------- */

  const SAMPLE_RESUME = `JORDAN LEE
Senior Frontend Engineer — San Francisco, CA
jordan.lee@email.com · (555) 012-3456 · linkedin.com/in/jordanlee · github.com/jordanlee

PROFESSIONAL SUMMARY
Frontend engineer with 6+ years building accessible, high-performance web applications for fintech and e-commerce products. Deep experience with React and modern JavaScript, with a strong focus on user experience and measurable business impact.

CORE SKILLS
JavaScript (ES2023), TypeScript, React, Redux, HTML5, CSS3, Sass, Webpack, Vite, Next.js, Node.js, REST APIs, Git, GitHub, Figma, Storybook, Jest, React Testing Library, Cypress, Agile, Scrum

PROFESSIONAL EXPERIENCE

Senior Frontend Engineer — NovaBank (2021 – Present)
- Led the rebuild of the customer dashboard in React and TypeScript, cutting page load time by 42% and lifting conversion by 12%.
- Built a shared component library adopted by 4 product teams, reducing UI defects by 30%.
- Mentored 3 junior engineers through code review and pair programming.
- Partnered with product and design in two-week Agile sprints with daily stand-ups.

Frontend Engineer — ShopLoop (2018 – 2021)
- Developed responsive e-commerce features used by 2M+ monthly customers.
- Improved Core Web Vitals across the checkout flow; LCP improved from 4.1s to 1.8s.
- Introduced automated testing with Jest and Cypress, raising coverage from 35% to 81%.

EDUCATION
B.S. Computer Science — University of Washington, 2018`;

  const SAMPLE_JOB = `Senior Frontend Engineer — Relay (Remote, US)

About the role
We are looking for a Senior Frontend Engineer to own our design system and ship features used by millions. You will work in Agile sprints with a cross-functional team of product managers, designers, and backend engineers.

What you will do
- Build and scale our React + TypeScript design system and component library.
- Design GraphQL APIs and integrate them with our frontend using Apollo Client.
- Own CI/CD pipelines for our web platform using GitHub Actions and Docker.
- Deploy and monitor services on AWS (ECS, CloudFront, S3).
- Drive a culture of automated testing: Jest, React Testing Library, Cypress, and end-to-end quality gates.
- Mentor junior engineers and lead code reviews.
- Collaborate with UX researchers on usability studies and A/B experiments.

What you bring
- 5+ years of professional software development experience.
- Expert-level React and TypeScript; deep understanding of modern JavaScript.
- Hands-on experience with GraphQL and Apollo.
- Experience with AWS and containerization (Docker, Kubernetes).
- Track record of CI/CD, infrastructure as code (Terraform), and DevOps practices.
- Strong communication skills and experience mentoring engineers.
- Familiarity with design systems, accessibility (WCAG), and performance optimization.

Nice to have
- Contributions to open source.
- Experience with Next.js, Tailwind CSS, or data visualization (D3.js).

Apply now — Relay is an equal opportunity employer.`;

  /* ---------- element refs ---------- */

  const resumeInput = $('resumeInput');
  const jobInput = $('jobInput');
  const analyzeBtn = $('analyzeBtn');
  const sampleBtn = $('sampleBtn');
  const errorMsg = $('errorMsg');
  const resultsSection = $('results');
  const skeletonBox = $('skeletonBox');
  const resultsContent = $('resultsContent');
  const btnSpinner = $('btnSpinner');
  const btnLabel = $('btnLabel');
  const btnArrow = $('btnArrow');

  const RING_LENGTH = 2 * Math.PI * 52; // r = 52 in the score ring SVG
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Guard against a stale mix of cached files: if a required module API is
  // missing, the page is running outdated JavaScript — fail loudly with an
  // actionable message instead of a generic analysis error.
  const missingDeps = [];
  if (!analyzer || typeof analyzer.analyze !== 'function' ||
      typeof analyzer.analyzeRequirements !== 'function' ||
      typeof analyzer.parseResume !== 'function') missingDeps.push('analyzer.js');
  if (!rewriter || typeof rewriter.rewriteBullet !== 'function') missingDeps.push('rewriter.js');
  if (!exporter || typeof exporter.buildDocx !== 'function' ||
      typeof exporter.buildPdf !== 'function' ||
      typeof exporter.toPlainText !== 'function') missingDeps.push('exporter.js');

  if (missingDeps.length) {
    analyzeBtn.disabled = true;
    errorMsg.textContent = 'ResumeSync could not load completely (missing or outdated: ' +
      missingDeps.join(', ') + '). A cached older version is probably loaded — ' +
      'hard-refresh the page (Ctrl/Cmd+Shift+R) and try again.';
    errorMsg.hidden = false;
  }

  /* ---------- theme toggle (light / dark) ---------- */

  const rootEl = document.documentElement;
  const themeToggle = $('themeToggle');
  const THEME_KEY = 'resumesync-theme';

  function getStoredTheme() {
    try { return window.localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function storeTheme(theme) {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
  }

  function currentTheme() {
    return rootEl.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function syncThemeToggle() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    themeToggle.setAttribute('aria-label', 'Switch to ' + next + ' mode');
    themeToggle.setAttribute('title', 'Switch to ' + next + ' mode');
  }

  function applyTheme(theme) {
    rootEl.setAttribute('data-theme', theme);
    syncThemeToggle();
    // Brief cross-fade across the page (disabled under reduced motion).
    if (!prefersReducedMotion) {
      rootEl.classList.add('theme-animating');
      setTimeout(() => rootEl.classList.remove('theme-animating'), 300);
    }
  }

  // Sync the toggle label with the theme the inline head script already chose.
  syncThemeToggle();

  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    storeTheme(next);
  });

  // Follow OS theme changes until the user explicitly picks one.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (!getStoredTheme()) applyTheme(e.matches ? 'light' : 'dark');
    });
  }

  // Analysis state (used by the export handlers).
  let currentParsed = null;   // analyzer.parseResume() output
  let rewriteState = [];      // [{ applied: bool, rewrite: rewriteBullet() output }]

  /* ---------- character counters ---------- */

  function bindCounter(input, countEl) {
    const update = () => {
      const n = input.value.length;
      countEl.textContent = n.toLocaleString('en-US') + (n === 1 ? ' character' : ' characters');
    };
    input.addEventListener('input', () => {
      update();
      errorMsg.hidden = true;
    });
    update();
    return update;
  }

  const updateResumeCount = bindCounter(resumeInput, $('resumeCount'));
  const updateJobCount = bindCounter(jobInput, $('jobCount'));

  /* ---------- loading state ---------- */

  function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    analyzeBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    btnSpinner.hidden = !isLoading;
    btnArrow.hidden = isLoading;
    btnLabel.textContent = isLoading ? 'Analyzing…' : 'Analyze Match';
  }

  /* ---------- score ring animation ---------- */

  function ringColor(score) {
    if (score >= 80) return 'var(--color-success)';
    if (score >= 60) return 'var(--color-primary-light)';
    if (score >= 40) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }

  function animateScore(score) {
    const fg = $('ringFg');
    const valueEl = $('scoreValue');
    fg.style.stroke = ringColor(score);
    fg.style.strokeDasharray = RING_LENGTH;
    fg.style.strokeDashoffset = RING_LENGTH;

    if (prefersReducedMotion) {
      fg.style.strokeDashoffset = RING_LENGTH * (1 - score / 100);
      valueEl.textContent = String(score);
      return;
    }

    // Force reflow so the transition runs from 0 every time.
    void fg.getBoundingClientRect();
    fg.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.22, 0.61, 0.36, 1)';
    fg.style.strokeDashoffset = RING_LENGTH * (1 - score / 100);

    const start = performance.now();
    const duration = 1000;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      valueEl.textContent = String(Math.round(score * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- JD coverage: line-by-line gap analysis ---------- */

  const STATUS_LABELS = { covered: 'Covered', partial: 'Partially covered', gap: 'Gap' };

  function renderCoverage(coverage) {
    const summary = $('coverageSummary');
    summary.innerHTML =
      '<span class="cov-chip ok">' + ICONS.check + coverage.summary.covered + ' covered</span>' +
      '<span class="cov-chip partial">' + ICONS.minus + coverage.summary.partial + ' partial</span>' +
      '<span class="cov-chip gap">' + ICONS.x + coverage.summary.gap + ' gaps</span>';

    const list = $('coverageList');
    list.innerHTML = '';
    for (const req of coverage.requirements) {
      const li = document.createElement('li');
      li.className = 'cov-row';
      const icon = req.status === 'covered' ? ICONS.checkCircle
        : (req.status === 'partial' ? ICONS.minus : ICONS.x);
      let chips = '';
      if (req.missing.length) {
        chips = '<div class="cov-missing">';
        const shown = req.missing.slice(0, 5);
        for (const k of shown) chips += '<span class="cov-kw"></span>';
        if (req.missing.length > shown.length) {
          chips += '<span class="cov-kw">+' + (req.missing.length - shown.length) + ' more</span>';
        }
        chips += '</div>';
      }
      li.innerHTML =
        '<span class="cov-icon ' + req.status + '" aria-hidden="true">' + icon + '</span>' +
        '<div><span class="sr-only">' + STATUS_LABELS[req.status] + ': </span>' +
        '<p class="cov-line"></p>' + chips + '</div>';
      li.querySelector('.cov-line').textContent = req.line;
      const chipEls = li.querySelectorAll('.cov-kw');
      req.missing.slice(0, 5).forEach((k, i) => { chipEls[i].textContent = k.display; });
      list.appendChild(li);
    }
  }

  /* ---------- missing keywords, grouped by category ---------- */

  function renderMissingKeywords(missing) {
    const badge = $('missingCount');
    const empty = $('kwEmpty');
    const groupsEl = $('missingGroups');
    groupsEl.innerHTML = '';

    badge.textContent = String(missing.length);
    badge.classList.toggle('zero', missing.length === 0);

    if (missing.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const shown = missing.slice(0, 12);
    const byGroup = new Map();
    for (const kw of shown) {
      const cat = analyzer.categorize(kw);
      if (!byGroup.has(cat)) byGroup.set(cat, []);
      byGroup.get(cat).push(kw);
    }

    for (const cat of GROUP_ORDER) {
      const kws = byGroup.get(cat);
      if (!kws) continue;
      const group = document.createElement('div');
      group.className = 'kw-group';
      group.innerHTML =
        '<div class="kw-group-head"><span></span><span class="count-badge"></span></div>' +
        '<ul class="kw-list"></ul>';
      group.querySelector('.kw-group-head span').textContent = GROUP_LABELS[cat];
      group.querySelector('.count-badge').textContent = String(kws.length);
      const ul = group.querySelector('.kw-list');
      for (const kw of kws) {
        const li = document.createElement('li');
        li.innerHTML =
          '<label class="kw-item">' +
            '<input type="checkbox" class="kw-toggle">' +
            '<span class="kw-box" aria-hidden="true">' + ICONS.check + '</span>' +
            '<span class="kw-text"></span>' +
            '<span class="kw-tag"></span>' +
          '</label>';
        li.querySelector('.kw-text').textContent = kw.display;
        li.querySelector('.kw-tag').textContent = CATEGORY_LABELS[cat] || 'Keyword';
        ul.appendChild(li);
      }
      groupsEl.appendChild(group);
    }

    if (missing.length > shown.length) {
      const more = document.createElement('p');
      more.className = 'bullet-meta';
      more.textContent = '+ ' + (missing.length - shown.length) +
        ' more keywords not shown — add the highest-value ones first.';
      groupsEl.appendChild(more);
    }
  }

  /* ---------- advice ---------- */

  function renderAdvice(missing, hasBullets) {
    const list = $('adviceList');
    list.innerHTML = '';
    const bullets = analyzer.buildAdvice(missing);
    if (hasBullets) {
      bullets.push({
        icon: 'target',
        html: 'Rewrite weak bullets as <strong>metric-driven achievements</strong> — the optimizer ' +
          'below converts each task into <em>Accomplished X, measured by Y, by doing Z</em>.'
      });
    }
    for (const bullet of bullets) {
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="advice-icon" aria-hidden="true">' + (ICONS[bullet.icon] || ICONS.check) + '</span>' +
        '<span class="advice-text">' + bullet.html + '</span>';
      list.appendChild(li);
    }
  }

  /* ---------- X-Y-Z bullet optimizer ---------- */

  // Wrap removed filler words in a strike-through so the edit is visible.
  function markFillers(original, fillers) {
    const escaped = escapeHtml(original);
    if (!fillers || !fillers.length) return escaped;
    try {
      const re = new RegExp(fillers.map((f) => escapeRegExp(escapeHtml(f))).join('|'), 'gi');
      return escaped.replace(re, (m) => '<s class="filler">' + m + '</s>');
    } catch (e) {
      return escaped;
    }
  }

  // Highlight metrics and the "add a metric" placeholder in rewritten text.
  function markMetrics(text) {
    let out = escapeHtml(text);
    try {
      // Function replacers: metrics like "$1.2M" contain "$", which is
      // special in string replacement patterns.
      out = out.replace(new RegExp(escapeRegExp(escapeHtml(rewriter.METRIC_PLACEHOLDER)), 'g'),
        () => '<mark class="ph">' + escapeHtml(rewriter.METRIC_PLACEHOLDER) + '</mark>');
      for (const m of rewriter.extractMetrics(text)) {
        out = out.replace(new RegExp(escapeRegExp(escapeHtml(m)), 'g'),
          () => '<mark class="metric">' + escapeHtml(m) + '</mark>');
      }
    } catch (e) { /* leave escaped text as-is */ }
    return out;
  }

  function renderBullets(parsed, state) {
    const card = $('bulletsCard');
    const list = $('bulletList');
    const badge = $('bulletsCount');
    list.innerHTML = '';

    if (!parsed.bullets.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    badge.textContent = String(parsed.bullets.length);

    parsed.bullets.forEach((b, i) => {
      const rw = state[i].rewrite;
      const tag = !rw.changed
        ? { cls: 'strong', text: 'Already strong' }
        : (rw.needsMetric ? { cls: 'metric', text: 'Add a metric' } : { cls: 'rewritten', text: 'Rewritten' });

      const metaParts = [];
      if (rw.fillersRemoved.length) {
        metaParts.push('Filler removed: ' + rw.fillersRemoved.map((f) => '\u201C' + f + '\u201D').join(', '));
      }
      if (rw.verbSwaps.length) {
        metaParts.push('Verb: ' + rw.verbSwaps.map((s) => s.from + ' \u2192 ' + s.to).join(', '));
      }
      if (rw.openersRemoved.length) metaParts.push('Passive opener removed');
      const meta = escapeHtml(metaParts.join(' \u00B7 '));

      const li = document.createElement('li');
      li.className = 'bullet-item';
      li.innerHTML =
        '<div class="bullet-top">' +
          '<label class="bi-check">' +
            '<input type="checkbox" class="kw-toggle bi-toggle"' + (state[i].applied ? ' checked' : '') + '>' +
            '<span class="kw-box" aria-hidden="true">' + ICONS.check + '</span>' +
            '<span class="bi-check-label">Apply rewrite to export</span>' +
          '</label>' +
          '<span class="bullet-tag ' + tag.cls + '">' + tag.text + '</span>' +
        '</div>' +
        '<p class="bullet-original"><span class="bo-label">Before</span>' +
          '<span class="bo-text">' + markFillers(rw.original, rw.fillersRemoved) + '</span></p>' +
        '<div class="bullet-arrow" aria-hidden="true">' + ICONS.arrowDown + '</div>' +
        '<p class="bullet-rewritten"><span class="bo-label">After</span>' +
          '<span class="br-text">' + markMetrics(rw.rewritten) + '</span></p>' +
        '<div class="xyz-chips">' +
          '<span class="xyz-chip"><b>X</b>Accomplished: <span class="val">' + escapeHtml(rw.xyz.x || rw.original) + '</span></span>' +
          '<span class="xyz-chip"><b>Y</b>Measured by: <span class="val">' + (rw.xyz.y ? escapeHtml(rw.xyz.y) : 'add a metric') + '</span></span>' +
          '<span class="xyz-chip"><b>Z</b>By doing: <span class="val">' + (rw.xyz.z ? escapeHtml(rw.xyz.z) : '\u2014') + '</span></span>' +
        '</div>' +
        (meta ? '<p class="bullet-meta">' + meta + '</p>' : '');

      li.querySelector('.bi-toggle').addEventListener('change', (e) => {
        state[i].applied = e.target.checked;
      });
      list.appendChild(li);
    });
  }

  /* ---------- ATS compliance checklist ---------- */

  function renderAtsList(doc, analysis) {
    const list = $('atsList');
    list.innerHTML = '';
    for (const item of exporter.atsChecklist(doc, analysis)) {
      const li = document.createElement('li');
      li.className = 'ats-item ' + (item.ok ? 'ok' : 'warn');
      li.innerHTML =
        '<span aria-hidden="true">' + (item.ok ? ICONS.checkCircle : ICONS.alertTriangle) + '</span>' +
        '<span></span>';
      li.querySelector('span:last-child').textContent = item.text;
      list.appendChild(li);
    }
  }

  /* ---------- export ---------- */

  function buildAppliedMap() {
    const applied = new Map();
    rewriteState.forEach((st, i) => {
      if (!st.applied || !st.rewrite.changed) return;
      const b = currentParsed.bullets[i];
      // Never export the bracketed "add a metric" placeholder — the user
      // fills in a real number; the cleaned bullet is exported instead.
      const text = st.rewrite.rewritten.replace(' ' + rewriter.METRIC_PLACEHOLDER, '');
      applied.set(b.sectionIndex + ':' + b.bulletIndex, text);
    });
    return applied;
  }

  function exportFile(kind) {
    if (!currentParsed) return;
    const doc = exporter.buildDocument(currentParsed, buildAppliedMap());
    const base = exporter.slugify(doc.name) + '-resume';
    if (kind === 'docx') {
      exporter.download(base + '.docx', exporter.buildDocx(doc), exporter.MIME.docx);
    } else if (kind === 'pdf') {
      exporter.download(base + '.pdf', exporter.buildPdf(doc), exporter.MIME.pdf);
    } else {
      exporter.download(base + '.txt', exporter.toPlainText(doc), exporter.MIME.txt);
    }
  }

  $('exportDocxBtn').addEventListener('click', () => exportFile('docx'));
  $('exportPdfBtn').addEventListener('click', () => exportFile('pdf'));
  $('exportTxtBtn').addEventListener('click', () => exportFile('txt'));

  /* ---------- results rendering ---------- */

  function renderResults(result, coverage, parsed) {
    const label = analyzer.scoreLabel(result.score);

    $('scoreLabel').textContent = label.text;
    $('scoreLabel').dataset.tone = label.tone;
    $('scoreDesc').textContent = label.desc;
    $('scoreDetail').textContent =
      'Your resume covers ' + result.matchedCount + ' of the ' + result.totalKeywords +
      ' most important terms found in the job description.';

    renderCoverage(coverage);
    renderMissingKeywords(result.missing);
    renderAdvice(result.missing, parsed.bullets.length > 0);
    renderBullets(parsed, rewriteState);

    const doc = exporter.buildDocument(parsed, buildAppliedMap());
    renderAtsList(doc, result);

    skeletonBox.hidden = true;
    resultsContent.hidden = false;
    resultsSection.setAttribute('aria-busy', 'false');

    // Restart entrance animations.
    resultsSection.classList.remove('animate');
    void resultsSection.offsetWidth;
    resultsSection.classList.add('animate');

    animateScore(result.score);

    resultsSection.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- analyze action ---------- */

  function runAnalysis() {
    const resume = resumeInput.value.trim();
    const job = jobInput.value.trim();

    if (!resume || !job) {
      errorMsg.textContent = !resume && !job
        ? 'Paste both your resume and the job description to see your match.'
        : (!resume
          ? 'Add your resume in the left column to see your match.'
          : 'Add the job description in the right column to see your match.');
      errorMsg.hidden = false;
      (!resume ? resumeInput : jobInput).focus();
      return;
    }
    errorMsg.hidden = true;

    // Immediate visual loading feedback: button processing state + skeleton pulse.
    setLoading(true);
    resultsSection.hidden = false;
    resultsSection.setAttribute('aria-busy', 'true');
    resultsContent.hidden = true;
    skeletonBox.hidden = false;
    resultsSection.classList.remove('animate');
    resultsSection.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });

    // Defer so the loading UI paints before the (fast) computation runs.
    setTimeout(() => {
      try {
        const result = analyzer.analyze(resume, job);
        if (!result.totalKeywords) {
          errorMsg.textContent = 'The job description looks too short to analyze — paste the full posting, including responsibilities and requirements.';
          errorMsg.hidden = false;
          skeletonBox.hidden = true;
          resultsSection.hidden = true;
          setLoading(false);
          return;
        }
        const coverage = analyzer.analyzeRequirements(job, resume);
        currentParsed = analyzer.parseResume(resume);
        rewriteState = currentParsed.bullets.map((b) => ({
          applied: true,
          rewrite: rewriter.rewriteBullet(b.text)
        }));
        renderResults(result, coverage, currentParsed);
      } catch (err) {
        // Log the real error for debugging, and surface an actionable message.
        console.error('ResumeSync analysis error:', err);
        errorMsg.textContent = 'Something went wrong while analyzing' +
          (err && err.message ? ' (' + err.message + ')' : '') +
          '. Please try again — if it keeps happening, hard-refresh the page (Ctrl/Cmd+Shift+R).';
        errorMsg.hidden = false;
        skeletonBox.hidden = true;
        resultsSection.hidden = true;
      } finally {
        setLoading(false);
      }
    }, 650);
  }

  analyzeBtn.addEventListener('click', runAnalysis);

  /* ---------- sample data ---------- */

  sampleBtn.addEventListener('click', () => {
    resumeInput.value = SAMPLE_RESUME;
    jobInput.value = SAMPLE_JOB;
    updateResumeCount();
    updateJobCount();
    errorMsg.hidden = true;
    resumeInput.focus();
  });

  /* ---------- keyboard shortcut: Ctrl/Cmd + Enter runs the analysis ---------- */

  [resumeInput, jobInput].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runAnalysis();
      }
    });
  });
})();
