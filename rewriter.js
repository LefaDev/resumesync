/* ============================================================
   ResumeSync — X-Y-Z bullet rewriter (pure logic, no DOM)

   Converts passive task bullets into achievement statements using
   the X-Y-Z formula:

     "Accomplished [X], as measured by [Y], by doing [Z]."

   The rewrite guidelines below are enforced as auditable rules:
     1. Strip robotic AI filler words and cliches ("pivotal role",
        "testament to", "synergistic", "leveraged", ...).
     2. Remove passive openers ("Responsible for...", "Duties
        included...") and upgrade weak verbs (helped -> supported).
     3. Elevate metrics already present in the text (%, $, time,
        counts, ranges) into the "measured by [Y]" slot.
     4. NEVER invent metrics, numbers, or achievements. When a bullet
        has no metric, a bracketed placeholder is appended so the user
        fills in a real number.
   Exposed as `ResumeRewriter` in the browser and via
   module.exports in Node (for testing).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ResumeRewriter = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const METRIC_PLACEHOLDER = '[add a metric — e.g., % faster, $ saved, hours per week]';

  /* ---------- guardrail: robotic filler, replaced with plain wording ---------- */

  const FILLER_REPLACEMENTS = [
    [/\bleverag(e|ed|ing|es)\b/gi, 'used'],
    [/\butiliz(e|ed|ing|es)\b/gi, 'used'],
    [/\butilis(e|ed|ing|es)\b/gi, 'used'],
    [/\bfacilitat(e|ed|ing|es)\b/gi, 'coordinated'],
    [/\bimpactful\b/gi, 'effective'],
    [/\bspearhead(ed|ing|s)\b/gi, 'led'],
    [/\bspearheading\b/gi, 'leading'],
    [/\bcircle(ing)? back\b/gi, 'followed up'],
    [/\bdeep[- ]dive\b/gi, 'analysis'],
    [/\bmoving? the needle\b/gi, 'making progress'],
    [/\blow[- ]hanging fruit\b/gi, 'quick wins']
  ];

  /* ---------- guardrail: robotic filler, deleted outright ---------- */

  const FILLER_DELETES = [
    'pivotal role', 'pivotal', 'testament to', 'a testament', 'testament',
    'synergistic', 'synergies', 'synergy', 'passionate about', 'passion for',
    'guru', 'ninja', 'rockstar', 'rock star', 'go-getter', 'self-starter',
    'results-driven', 'result driven', 'proven track record', 'track record of success',
    'detail-oriented', 'detail oriented', 'hard worker', 'hard-working', 'team player',
    'think outside the box', 'outside the box', 'bandwidth', 'cutting-edge', 'cutting edge',
    'best-in-class', 'best in class', 'world-class', 'world class', 'game-changer',
    'game changer', 'disruptive', 'innovative', 'dynamic', 'proactive', 'motivated',
    'self-motivated', 'quick learner', 'fast learner', 'think big', 'driven by passion',
    'results oriented', 'result oriented', 'highly motivated', 'highly skilled',
    'seasoned professional', 'strategic thinker', 'thought leader', 'change maker',
    'forward-thinking', 'forward thinking', 'detail oriented professional'
  ];

  /* ---------- passive openers -> strong action ---------- */

  const PASSIVE_OPENERS = [
    [/^was responsible for\s+/i, ''],
    [/^responsible for\s+/i, ''],
    [/^duties included\s*/i, ''],
    [/^duties involved\s*/i, ''],
    [/^duties entailed\s*/i, ''],
    [/^was tasked with\s+/i, ''],
    [/^tasked with\s+/i, ''],
    [/^in charge of\s+/i, 'owned '],
    [/^took care of\s+/i, 'managed '],
    [/^was involved in\s+/i, 'contributed to '],
    [/^involved in\s+/i, 'contributed to '],
    [/^participated in\s+/i, 'contributed to '],
    [/^assisted with\s+/i, 'contributed to '],
    [/^assisted in\s+/i, 'contributed to '],
    [/^helped with\s+/i, 'supported '],
    [/^help with\s+/i, 'supported '],
    [/^helped to\s+/i, ''],
    [/^help to\s+/i, ''],
    [/^helped\s+/i, 'supported '],
    [/^help\s+/i, ''],
    [/^assisted\s+/i, 'supported '],
    [/^worked on\s+/i, 'developed '],
    [/^handled\s+/i, 'managed '],
    [/^made\s+/i, 'created ']
  ];

  // gerund -> past tense, so a bullet never starts with "Managing ..."
  const DEGERUND = {
    managing: 'managed', leading: 'led', building: 'built', developing: 'developed',
    designing: 'designed', creating: 'created', shipping: 'shipped', launching: 'launched',
    improving: 'improved', reducing: 'reduced', cutting: 'cut', saving: 'saved',
    growing: 'grew', implementing: 'implemented', writing: 'wrote', delivering: 'delivered',
    establishing: 'established', collaborating: 'collaborated', partnering: 'partnered',
    mentoring: 'mentored', introducing: 'introduced', automating: 'automated',
    migrating: 'migrated', optimizing: 'optimized', optimising: 'optimized', owning: 'owned',
    supporting: 'supported', contributing: 'contributed', coordinating: 'coordinated',
    using: 'used', driving: 'drove', expanding: 'expanded', running: 'ran',
    overseeing: 'oversaw', maintaining: 'maintained', coding: 'coded',
    testing: 'tested', reviewing: 'reviewed', planning: 'planned',
    documenting: 'documented', training: 'trained', hiring: 'hired', onboarding: 'onboarded'
  };

  // After an opener is stripped, tidy what remains:
  // "managing X" -> "Managed X"; "the CI pipeline" -> "Managed the CI pipeline".
  function fixOpenerResult(text) {
    const t = text.trim();
    const m = t.match(/^([A-Za-z]+)([ ,;].*)?$/);
    if (m && DEGERUND[m[1].toLowerCase()]) {
      return DEGERUND[m[1].toLowerCase()] + (m[2] || '');
    }
    if (/^(the|a|an)\s/i.test(t)) return 'Managed ' + t;
    return t;
  }

  /* ---------- weak leading verbs -> strong action verbs ---------- */

  const VERB_UPGRADES = [
    [/^worked closely with\s+/i, 'partnered with '],
    [/^worked with\s+/i, 'partnered with '],
    [/^worked on\s+/i, 'developed '],
    [/^helped\s+/i, 'supported '],
    [/^assisted\s+/i, 'supported '],
    [/^handled\s+/i, 'managed '],
    [/^was involved in\s+/i, 'contributed to '],
    [/^involved in\s+/i, 'contributed to '],
    [/^participated in\s+/i, 'contributed to '],
    [/^made\s+/i, 'created '],
    [/^did\s+/i, ''],
    [/^responsible for\s+/i, 'owned '],
    [/^in charge of\s+/i, 'owned ']
  ];

  /* ---------- metric extraction (numbers with units, ranges, multipliers) ---------- */

  const METRIC_UNITS = 'ms|s|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|' +
    'week|weeks|weekly|month|months|monthly|year|years|yearly|quarter|quarters|quarterly|user|users|' +
    'customer|customers|client|clients|people|person|member|members|subscriber|subscribers|employee|' +
    'employees|engineer|engineers|developer|developers|designer|designers|analyst|analysts|manager|' +
    'managers|team|teams|lead|leads|sale|sales|deal|deals|transaction|transactions|order|orders|' +
    'request|requests|query|queries|hit|hits|view|views|download|downloads|signup|signups|sign-up|' +
    'feature|features|project|projects|release|releases|deploy|deploys|deployment|' +
    'deployments|commit|commits|ticket|tickets|bug|bugs|issue|issues|incident|incidents|story|stories|' +
    'task|tasks|sprint|sprints|page|pages|site|sites|app|apps|application|applications|system|systems|' +
    'service|services|server|servers|database|databases|cluster|clusters|node|nodes|container|' +
    'containers|api|apis|endpoint|endpoints|integration|integrations|report|reports|dashboard|' +
    'dashboards|document|documents|file|files|record|records|entry|entries|candidate|candidates|' +
    'interview|interviews|hire|hires|student|students|trainee|trainees|mentee|mentees|gb|mb|kb|tb|pb|' +
    '%|percent|x|k|m|b|bn|mm';

  const METRIC_RE = new RegExp(
    '(' +
      '\\$\\s?\\d[\\d,.]*\\s?[kmbKMB]?' +                 // $1.2M, $500
    '|' +
      // 42%, 2M users, 4.1s, 5 engineers — the lookahead (not \b) closes the
      // match, because units like "%" or "x" are non-word characters.
      '\\b\\d+(?:[.,]\\d+)?\\s?(?:' + METRIC_UNITS + ')(?![a-z])' +
    '|' +
      '\\b\\d+(?:\\.\\d+)?x\\b' +                         // 2x, 1.5x
    '|' +
      '\\bfrom\\s+\\d+(?:[.,]\\d+)?\\s*\\w{0,6}\\s*to\\s*\\d+(?:[.,]\\d+)?\\s*\\w{0,6}\\b' + // from 4.1s to 1.8s
    '|' +
      '\\b(?:doubled|tripled|quadrupled|halved)\\b' +     // doubled, halved
    ')',
    'gi'
  );

  function extractMetrics(text) {
    const out = [];
    const seen = new Set();
    for (const m of String(text).matchAll(METRIC_RE)) {
      const v = m[0].trim();
      const key = v.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(v);
      }
    }
    return out;
  }

  /* ---------- outcome verbs (the "X" of X-Y-Z) ---------- */

  const OUTCOME_VERB_RE = /\b(reduced|reduce|reducing|reduction|increased|increase|increasing|improved|improving|improvement|cut|cuts|cutting|saved|save|saving|grew|grow|growing|growth|boosted|boost|boosting|accelerated|accelerate|accelerating|streamlined|streamlining|eliminated|eliminate|eliminating|launched|launch|launching|shipped|ship|shipping|delivered|deliver|delivering|scaled|scale|scaling|optimized|optimised|optimizing|automated|automate|automating|migrated|migrate|migrating|designed|design|designing|built|build|building|led|lead|leading|won|exceeded|exceeding|reached|reaching|expanded|expanding|doubled|doubling|tripled|tripling|halved|halving|raised|raising|generated|producing|produced|created|creating|established|establishing|strengthened|strengthening|enhanced|enhancing|upgraded|upgrading|consolidated|consolidating|simplified|simplifying|standardized|standardizing|modernized|modernizing|lifted|lift|lifting)\b/gi;

  // outcome verb -> noun phrase, so "Achieved a reduction in ..." reads naturally
  const OUTCOME_NOUN = {
    reduced: 'a reduction in', reduce: 'a reduction in', reducing: 'a reduction in',
    reduction: 'a reduction in', cut: 'a reduction in', cutting: 'a reduction in', cuts: 'a reduction in',
    saved: 'savings of', save: 'savings of', saving: 'savings of', increased: 'an increase in',
    increase: 'an increase in', increasing: 'an increase in', grew: 'growth in', grow: 'growth in',
    growing: 'growth in', growth: 'growth in', expanded: 'growth in', expanding: 'growth in',
    improved: 'an improvement in', improving: 'an improvement in', improvement: 'an improvement in',
    boosted: 'a boost in', boost: 'a boost in', boosting: 'a boost in', accelerated: 'faster',
    accelerate: 'faster', accelerating: 'faster', streamlined: 'a streamlined', streamlining: 'a streamlined',
    simplified: 'a simplified', simplifying: 'a simplified', standardized: 'a standardized',
    standardizing: 'a standardized', consolidated: 'a consolidated', consolidating: 'a consolidated',
    modernized: 'a modernized', modernizing: 'a modernized', upgraded: 'an upgraded',
    upgrading: 'an upgraded', eliminated: 'the elimination of', eliminate: 'the elimination of',
    eliminating: 'the elimination of', launched: 'the launch of', launch: 'the launch of',
    launching: 'the launch of', shipped: 'the delivery of', ship: 'the delivery of',
    shipping: 'the delivery of', delivered: 'the delivery of', deliver: 'the delivery of',
    delivering: 'the delivery of', built: 'the build of', build: 'the build of', building: 'the build of',
    created: 'the creation of', creating: 'the creation of', designed: 'the design of',
    designing: 'the design of', developed: 'the development of', developing: 'the development of',
    led: 'the leadership of', leading: 'the leadership of', won: 'a win in', reached: 'the achievement of',
    reaching: 'the achievement of', achieved: 'the achievement of', exceeded: 'results exceeding',
    exceeding: 'results exceeding', generated: 'the generation of', producing: 'the generation of',
    produced: 'the production of', established: 'the establishment of', establishing: 'the establishment of',
    scaled: 'the scaling of', scale: 'the scaling of', scaling: 'the scaling of',
    automated: 'the automation of', automate: 'the automation of', automating: 'the automation of',
    migrated: 'the migration of', migrate: 'the migration of', migrating: 'the migration of',
    enhanced: 'an improvement in', enhancing: 'an improvement in', strengthened: 'a strengthened',
    strengthening: 'a strengthened', raised: 'an increase in', raising: 'an increase in',
    doubled: 'a doubling of', doubling: 'a doubling of', tripled: 'a tripling of',
    tripling: 'a tripling of', halved: 'a halving of', halving: 'a halving of',
    lifted: 'an increase in', lifting: 'an increase in'
  };

  // action verb -> gerund, for the "by doing [Z]" slot
  const GERUND = {
    led: 'leading', lead: 'leading', built: 'building', build: 'building', developed: 'developing',
    develop: 'developing', designed: 'designing', design: 'designing', created: 'creating', create: 'creating',
    managed: 'managing', manage: 'managing', shipped: 'shipping', ship: 'shipping', launched: 'launching',
    launch: 'launching', improved: 'improving', improve: 'improving', reduced: 'reducing', reduce: 'reducing',
    cut: 'cutting', saved: 'saving', save: 'saving', grew: 'growing', grow: 'growing', implemented: 'implementing',
    implement: 'implementing', wrote: 'writing', write: 'writing', made: 'making', make: 'making',
    conducted: 'conducting', conduct: 'conducting', delivered: 'delivering', deliver: 'delivering',
    established: 'establishing', establish: 'establishing', collaborated: 'collaborating',
    partnered: 'partnering', mentored: 'mentoring', mentor: 'mentoring',
    introduced: 'introducing', introduce: 'introducing', automated: 'automating', automate: 'automating',
    migrated: 'migrating', migrate: 'migrating', optimized: 'optimizing', optimised: 'optimizing',
    owned: 'owning', own: 'owning', supported: 'supporting', support: 'supporting',
    contributed: 'contributing', coordinated: 'coordinating', used: 'using',
    use: 'using', drove: 'driving', drive: 'driving', expanded: 'expanding',
    spearheaded: 'leading', oversaw: 'overseeing', oversee: 'overseeing', ran: 'running', run: 'running'
  };

  /* ---------- filler stripping ---------- */

  function stripFillers(text) {
    let out = String(text);
    const removed = [];

    for (const [re, replacement] of FILLER_REPLACEMENTS) {
      out = out.replace(re, (m) => {
        removed.push(m);
        return replacement;
      });
    }
    for (const phrase of FILLER_DELETES) {
      const re = new RegExp('\\b' + phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'gi');
      out = out.replace(re, (m) => {
        removed.push(m);
        return ' ';
      });
    }
    // tidy whitespace and orphaned connectors left behind by deletions
    out = out
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/([,;])\s*([,;])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.!?])/g, '$1')
      .trim();
    return { text: out, removed };
  }

  /* ---------- passive -> active conversion ---------- */

  function convertPassive(text) {
    let out = String(text).trim();
    const openersRemoved = [];
    const verbSwaps = [];

    let changed = true;
    let passes = 0;
    while (changed && passes < 4) {
      changed = false;
      passes += 1;
      for (const [re, replacement] of PASSIVE_OPENERS) {
        if (re.test(out)) {
          const before = out;
          out = out.replace(re, replacement).trim();
          if (before !== out) {
            changed = true;
            openersRemoved.push(re.source.replace(/[\\^$*+?]/g, '').replace(/\\s\+/, ' ').trim());
            if (!replacement) out = fixOpenerResult(out);
          }
          break;
        }
      }
      if (changed) continue;
      for (const [re, replacement] of VERB_UPGRADES) {
        if (re.test(out)) {
          const m = out.match(re);
          out = out.replace(re, replacement).trim();
          verbSwaps.push({ from: m[0].trim(), to: replacement.trim() });
          changed = true;
          break;
        }
      }
    }

    // Mid-sentence weak-verb cleanup: "to help reduce" -> "to reduce",
    // "was able to" -> "", "in order to" -> "to".
    const HELP_VERBS = 'reduce|reduces|build|builds|create|creates|develop|develops|design|designs|' +
      'ship|ships|launch|improve|improves|increase|increases|grow|grows|save|saves|cut|cuts|' +
      'deliver|delivers|implement|write|writes|migrate|automate|support|supports|manage|manages|' +
      'lead|leads|mentor|onboard|hire|test|tests|review|reviews|document|train|fix|fixes|resolve|' +
      'streamline|optimize|optimise|scale|expand|drive|own|run|coordinate|partner|collaborate|' +
      'contribute|maintain|monitor|deploy|integrate|refactor|debug|analyze|analyse|research|plan|' +
      'organize|organise|standardize|present|communicate|troubleshoot|install';
    out = out.replace(new RegExp('\\s*\\b(helped|helps|helping)\\s+(to\\s+)?', 'gi'), ' ');
    out = out.replace(new RegExp('\\s+help\\s+(to\\s+)?(?=' + HELP_VERBS + '\\b)', 'gi'), ' ');
    out = out.replace(/\s*\bwas able to\s+/gi, ' ');
    out = out.replace(/\s*\bin order to\s+/gi, ' to ');
    out = out.replace(/\s{2,}/g, ' ').trim();

    return { text: out, openersRemoved, verbSwaps };
  }

  /* ---------- X-Y-Z decomposition ---------- */

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function gerundify(clause) {
    const m = clause.match(/^([A-Za-z]+)([\s,;].*)?$/);
    if (!m) return clause;
    const gerund = GERUND[m[1].toLowerCase()];
    if (!gerund) return clause;
    return gerund + (m[2] || '');
  }

  // Split a cleaned bullet into X (outcome), Y (metric), Z (method).
  // Returns null slots when the text doesn't decompose cleanly —
  // the caller then falls back to the cleaned text rather than guessing.
  function buildXyz(clean, metrics) {
    if (!metrics.length) {
      return { x: clean, y: null, z: null };
    }
    const metric = metrics[0];
    const pos = clean.toLowerCase().indexOf(metric.toLowerCase());
    if (pos === -1) return { x: clean, y: metric, z: null };

    const before = clean.slice(0, pos);
    const after = clean.slice(pos + metric.length);

    // Find the last outcome verb before the metric (the start of the X span).
    let outcomeStart = -1;
    for (const m of before.matchAll(OUTCOME_VERB_RE)) {
      outcomeStart = m.index;
    }
    const wordsBefore = outcomeStart === -1 ? 99 : before.slice(outcomeStart).split(/\s+/).length;

    let x = clean;
    let z = null;

    if (outcomeStart >= 0 && wordsBefore <= 12) {
      // Outcome span: from the outcome verb through the metric.
      x = clean.slice(outcomeStart, pos + metric.length).replace(/\s+/g, ' ').trim();
      if (outcomeStart > 0) {
        // Action clause before the outcome verb: "Led X, cutting Y by 42%"
        let zClause = before.slice(0, outcomeStart).trim();
        // Cut trailing list separators ("Led X, cutting Y" -> "Led X")
        const cut = Math.max(zClause.lastIndexOf(','), zClause.lastIndexOf(';'));
        if (cut > 4) zClause = zClause.slice(0, cut);
        z = gerundify(zClause.replace(/[,;]+$/, '').trim()) || null;
      }
      if (!z) {
        // Method clause after the metric: "...by 40% by introducing Redis"
        const afterStripped = after.replace(/^[\s,;:-]+/, '').replace(/^(and|or|then|while|which)\s+/i, '');
        const methodMatch = afterStripped.match(/^(by|using|with|through|via|across|in)\s+(.+)$/i);
        if (methodMatch) z = methodMatch[2].replace(/[.,;:!?]+$/, '').trim() || null;
      }
    } else {
      // No outcome verb before the metric: keep the whole clause as X and
      // only look for a method clause after the metric.
      const afterStripped = after.replace(/^[\s,;:-]+/, '').replace(/^(and|or|then|while|which)\s+/i, '');
      const methodMatch = afterStripped.match(/^(by|using|with|through|via|across|in)\s+(.+)$/i);
      if (methodMatch) z = methodMatch[2].replace(/[.,;:!?]+$/, '').trim() || null;
    }
    if (z) z = z.replace(/\s+(to|with|and|or|in|for|of|on|at|by)$/i, '').trim() || null;

    return { x, y: metric, z };
  }

  // "cutting page load time by 42%" -> "a reduction in page load time"
  function nounifyOutcome(xSpan, metric) {
    let core = xSpan;
    if (metric) {
      core = core.replace(new RegExp('\\s*\\bby\\s+' + metric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '');
      core = core.replace(new RegExp(metric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'), '');
    }
    core = core.replace(/[,;:\s]+$/, '').trim();
    const m = core.match(/^([a-z]+)(?:\s+(.*))?$/i);
    if (m) {
      const noun = OUTCOME_NOUN[m[1].toLowerCase()];
      if (noun) {
        // "an improvement in" with nothing after it -> "an improvement"
        const rest = m[2] ? ' ' + m[2] : '';
        return (noun + rest).replace(/\s+(in|of|to)$/i, '').trim();
      }
    }
    return core;
  }

  /* ---------- main entry ---------- */

  function rewriteBullet(text) {
    const original = String(text || '').trim();
    if (!original) {
      return {
        original, cleaned: '', rewritten: '', xyz: null,
        metrics: [], fillersRemoved: [], openersRemoved: [], verbSwaps: [],
        hasMetric: false, needsMetric: false, changed: false
      };
    }

    // 1. Guardrail: strip robotic filler / cliches.
    const stripped = stripFillers(original);

    // 2. Convert passive task descriptions into active achievements.
    const active = convertPassive(stripped.text);

    // 3. Tidy: capitalize, single trailing period.
    let cleaned = active.text.replace(/\s+/g, ' ').trim();
    cleaned = capitalize(cleaned);
    if (!/[.!?]$/.test(cleaned)) cleaned += '.';

    // 4. Elevate metrics into the X-Y-Z slots.
    const metrics = extractMetrics(cleaned);
    const hasMetric = metrics.length > 0;
    const xyz = buildXyz(cleaned, metrics);

    // 5. Build the rewritten bullet. Prefer the canonical X-Y-Z sentence
    //    when the decomposition is complete; otherwise use the cleaned
    //    text. Never invent a metric — append a bracketed placeholder.
    let rewritten;
    let useSentence = hasMetric && xyz.z && xyz.y;
    if (useSentence) {
      // If more outcome clauses follow the first metric, keep the full
      // cleaned text so no real content is dropped. The check runs on the
      // text AFTER the first metric with the extracted method clause (Z)
      // removed, so method verbs like "migrating" don't trigger it.
      const after = cleaned.slice(cleaned.toLowerCase().indexOf(xyz.y.toLowerCase()) + xyz.y.length);
      let rest = after;
      const zi = rest.toLowerCase().indexOf(String(xyz.z).toLowerCase());
      if (zi !== -1) rest = rest.slice(0, zi) + rest.slice(zi + String(xyz.z).length);
      if (rest.match(OUTCOME_VERB_RE) || [...rest.matchAll(METRIC_RE)].length) useSentence = false;
    }
    if (useSentence) {
      const xCore = nounifyOutcome(xyz.x, xyz.y);
      const yClean = xyz.y.replace(/^from\s+/i, '');
      rewritten = 'Achieved ' + xCore + ', measured by ' + yClean + ', by ' + xyz.z + '.';
      rewritten = rewritten.replace(/\s+/g, ' ').trim();
      rewritten = capitalize(rewritten);
    } else {
      rewritten = cleaned + (hasMetric ? '' : ' ' + METRIC_PLACEHOLDER);
    }

    return {
      original,
      cleaned,
      rewritten,
      xyz: { x: xyz.x, y: xyz.y, z: xyz.z },
      metrics,
      fillersRemoved: stripped.removed,
      openersRemoved: active.openersRemoved,
      verbSwaps: active.verbSwaps,
      hasMetric,
      needsMetric: !hasMetric,
      changed: rewritten !== original
    };
  }

  return {
    rewriteBullet,
    stripFillers,
    extractMetrics,
    METRIC_PLACEHOLDER
  };
});
