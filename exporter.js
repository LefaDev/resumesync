/* ============================================================
   ResumeSync — ATS-safe export (pure logic, no DOM except download)

   Produces recruiter- and ATS-friendly files with zero dependencies:
     - .txt  — structured plain text
     - .docx — a real Word file (minimal OOXML package, hand-rolled zip)
     - .pdf  — a real PDF (minimal PDF 1.4 writer, WinAnsi text)

   ATS compliance guarantees, by construction:
     - strictly single-column layout (no columns, tables, text boxes,
       or graphical elements anywhere in the output)
     - standard semantic section headings (WORK EXPERIENCE, SKILLS,
       EDUCATION, ...)
     - real, extractable text — no images of text
   Exposed as `ResumeExporter` in the browser and via
   module.exports in Node (for testing).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ResumeExporter = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const MIME = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain;charset=utf-8',
    pdf: 'application/pdf'
  };

  /* ---------- assemble the export document ---------- */

  // parsed: output of ResumeAnalyzer.parseResume()
  // applied: Map of "sectionIndex:bulletIndex" -> rewritten bullet text
  function buildDocument(parsed, applied) {
    const sections = (parsed.sections || []).map((s, si) => ({
      heading: s.heading,
      lines: (s.lines || []).slice(),
      bullets: (s.bullets || []).map((b, bi) => {
        const key = si + ':' + bi;
        return applied && applied.has(key) ? applied.get(key) : b;
      })
    }));
    return {
      name: parsed.name || 'Your Name',
      contact: (parsed.contact || []).join(' | '),
      sections
    };
  }

  /* ---------- plain text (.txt) ---------- */

  function toPlainText(doc) {
    const out = [doc.name];
    if (doc.contact) out.push(doc.contact);
    for (const s of doc.sections) {
      if (!s.lines.length && !s.bullets.length) continue;
      out.push('');
      out.push(s.heading);
      for (const l of s.lines) out.push(l);
      for (const b of s.bullets) out.push('- ' + b);
    }
    return out.join('\n') + '\n';
  }

  /* ---------- minimal zip writer (STORE method, no compression) ---------- */

  function crc32(bytes) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
      }
    }
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
  }

  // entries: [{ name: string, data: Uint8Array }] -> Uint8Array (zip file)
  function zipStore(entries) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const push = (u8) => { chunks.push(u8); offset += u8.length; };

    for (const e of entries) {
      const nameBytes = encoder.encode(e.name);
      const crc = crc32(e.data);
      const localOffset = offset;

      const local = new Uint8Array(30);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);  // local file header signature
      lv.setUint16(4, 20, true);          // version needed
      lv.setUint16(6, 0, true);           // flags
      lv.setUint16(8, 0, true);           // method: store (no compression)
      lv.setUint16(10, 0, true);          // mod time
      lv.setUint16(12, 0x21, true);       // mod date (1980-01-01)
      lv.setUint32(14, crc, true);
      lv.setUint32(18, e.data.length, true);
      lv.setUint32(22, e.data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);          // extra field length
      push(local);
      push(nameBytes);
      push(e.data);

      const cen = new Uint8Array(46);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);  // central directory signature
      cv.setUint16(4, 20, true);          // version made by
      cv.setUint16(6, 20, true);          // version needed
      cv.setUint16(8, 0, true);           // flags
      cv.setUint16(10, 0, true);          // method
      cv.setUint16(12, 0, true);          // mod time
      cv.setUint16(14, 0x21, true);       // mod date
      cv.setUint32(16, crc, true);
      cv.setUint32(20, e.data.length, true);
      cv.setUint32(24, e.data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, localOffset, true);// offset of local header
      central.push(cen);
      central.push(nameBytes);
    }

    const centralStart = offset;
    for (const c of central) push(c);
    const centralSize = offset - centralStart;

    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);    // end of central directory
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralStart, true);
    push(end);

    const out = new Uint8Array(offset);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }

  /* ---------- Word .docx (minimal OOXML package) ---------- */

  function xmlEscape(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
    ));
  }

  function docxParagraph(text, style) {
    const pPr = style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '';
    return '<w:p>' + pPr + '<w:r><w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r></w:p>';
  }

  function buildDocumentXml(doc) {
    let body = docxParagraph(doc.name, 'Title');
    if (doc.contact) body += docxParagraph(doc.contact);
    for (const s of doc.sections) {
      if (!s.lines.length && !s.bullets.length) continue;
      body += docxParagraph(s.heading, 'Heading1');
      for (const l of s.lines) body += docxParagraph(l);
      // Bullets are plain paragraphs with a bullet character — real text,
      // no numbering definitions, no tables, strictly single-column.
      for (const b of s.bullets) body += docxParagraph('\u2022 ' + b);
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body +
      // No <w:cols> element: the section is single-column by default.
      '<w:sectPr><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
  }

  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
    '<w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
    '<w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/>' +
    '<w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>' +
    '</w:styles>';

  const CONTENT_TYPES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';

  const ROOT_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  const DOC_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  function buildDocx(doc) {
    const encoder = new TextEncoder();
    const entries = [
      { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES_XML) },
      { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
      { name: 'word/document.xml', data: encoder.encode(buildDocumentXml(doc)) },
      { name: 'word/_rels/document.xml.rels', data: encoder.encode(DOC_RELS_XML) },
      { name: 'word/styles.xml', data: encoder.encode(STYLES_XML) }
    ];
    return zipStore(entries);
  }

  /* ---------- minimal PDF writer (PDF 1.4, WinAnsi text) ---------- */

  const WINANSI = {
    '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94,
    '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u2026': 0x85,
    '\u00B7': 0xB7, '\u2192': 0xAE, '\u00A0': 0xA0, '\u2022': 0x95
  };

  function winAnsiBytes(str) {
    const out = [];
    for (const ch of String(str)) {
      const code = ch.codePointAt(0);
      if (code < 128) out.push(code);
      else if (WINANSI[ch] !== undefined) out.push(WINANSI[ch]);
      else if (code >= 0xA0 && code <= 0xFF) out.push(code);
      else out.push(0x3F); // unknown -> '?'
    }
    return out;
  }

  function flattenDoc(doc) {
    const lines = [];
    if (doc.name) lines.push({ text: doc.name, size: 16, bold: true, spaceBefore: 0, spaceAfter: 2 });
    if (doc.contact) lines.push({ text: doc.contact, size: 10, spaceAfter: 8 });
    for (const s of doc.sections) {
      if (!s.lines.length && !s.bullets.length) continue;
      lines.push({ text: '', size: 6, spaceBefore: 4, spaceAfter: 0 }); // spacer
      lines.push({ text: s.heading, size: 11.5, bold: true, spaceBefore: 4, spaceAfter: 3 });
      for (const l of s.lines) lines.push({ text: l, size: 10, spaceAfter: 2 });
      for (const b of s.bullets) lines.push({ text: '\u2022 ' + b, size: 10, spaceAfter: 2, indent: 12 });
    }
    return lines;
  }

  function paginate(lines) {
    const pages = [];
    let cur = [];
    let y = 738; // 792 - 54 top margin
    for (const ln of lines) {
      const leading = ln.size * 1.35;
      const needed = ln.spaceBefore + leading + ln.spaceAfter;
      if (y - needed < 54 && cur.length) {
        pages.push(cur);
        cur = [];
        y = 738;
      }
      y -= ln.spaceBefore;
      y -= leading;
      cur.push({ text: ln.text, size: ln.size, bold: ln.bold, indent: ln.indent || 0, y: y });
      y -= ln.spaceAfter;
    }
    if (cur.length) pages.push(cur);
    return pages.length ? pages : [[]];
  }

  function contentStreamBytes(lines) {
    const chunks = [];
    const pushStr = (s) => { for (const b of winAnsiBytes(s)) chunks.push(b); };
    for (const ln of lines) {
      if (!ln.text) continue; // spacer lines only affect layout
      const font = ln.bold ? '/F2' : '/F1';
      const x = 54 + (ln.indent || 0);
      pushStr('BT ' + font + ' ' + ln.size + ' Tf ' + x + ' ' + ln.y.toFixed(1) + ' Td (');
      const esc = ln.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      for (const b of winAnsiBytes(esc)) chunks.push(b);
      pushStr(') Tj ET\n');
    }
    return Uint8Array.from(chunks);
  }

  function buildPdf(doc) {
    const pages = paginate(flattenDoc(doc));
    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const kids = pages.map((_, i) => (5 + i * 2) + ' 0 R').join(' ');
    objects[2] = '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    pages.forEach((lines, i) => {
      const pageObj = 5 + i * 2;
      const contentObj = pageObj + 1;
      objects[pageObj] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentObj + ' 0 R >>';
      objects[contentObj] = { stream: contentStreamBytes(lines) };
    });

    const parts = [];
    let offset = 0;
    const pushBytes = (arr) => {
      const u8 = arr instanceof Uint8Array ? arr : Uint8Array.from(arr);
      parts.push(u8);
      offset += u8.length;
    };

    pushBytes(winAnsiBytes('%PDF-1.4\n'));
    const xrefOffsets = [0];
    for (let n = 1; n < objects.length; n++) {
      xrefOffsets[n] = offset;
      pushBytes(winAnsiBytes(n + ' 0 obj\n'));
      const body = objects[n];
      if (body && body.stream) {
        pushBytes(winAnsiBytes('<< /Length ' + body.stream.length + ' >>\nstream\n'));
        pushBytes(body.stream);
        pushBytes(winAnsiBytes('\nendstream\n'));
      } else {
        pushBytes(winAnsiBytes(body + '\n'));
      }
      pushBytes(winAnsiBytes('endobj\n'));
    }
    const xrefStart = offset;
    let xref = 'xref\n0 ' + objects.length + '\n';
    xref += '0000000000 65535 f \n';
    for (let n = 1; n < objects.length; n++) {
      xref += String(xrefOffsets[n]).padStart(10, '0') + ' 00000 n \n';
    }
    pushBytes(winAnsiBytes(xref));
    pushBytes(winAnsiBytes(
      'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\n' +
      'startxref\n' + xrefStart + '\n%%EOF\n'
    ));

    const out = new Uint8Array(offset);
    let p = 0;
    for (const part of parts) {
      out.set(part, p);
      p += part.length;
    }
    return out;
  }

  /* ---------- ATS compliance checklist (computed from the document) ---------- */

  const REQUIRED_HEADINGS = ['WORK EXPERIENCE', 'SKILLS', 'EDUCATION'];

  function atsChecklist(doc, analysis) {
    const has = (h) => doc.sections.some((s) => s.heading === h);
    const items = [
      { ok: true, text: 'Single-column layout — no columns, tables, text boxes, or graphics anywhere in the file.' },
      { ok: true, text: 'Real, extractable text throughout — no images of text, so ATS parsers read every word.' }
    ];
    const missingHeads = REQUIRED_HEADINGS.filter((h) => !has(h));
    items.push(missingHeads.length === 0
      ? { ok: true, text: 'Standard section headings present: WORK EXPERIENCE, SKILLS, EDUCATION.' }
      : { ok: false, text: 'Add missing standard sections: ' + missingHeads.join(', ') + '.' });
    items.push((doc.name && doc.contact)
      ? { ok: true, text: 'Name and contact details in the header.' }
      : { ok: false, text: 'Add your name and contact details at the top of the resume.' });
    const pct = analysis ? analysis.score : null;
    items.push(pct === null
      ? { ok: true, text: 'Keyword alignment — run the analysis to check your match score.' }
      : pct >= 60
        ? { ok: true, text: 'Keyword alignment — ' + pct + '% match with the job description.' }
        : { ok: false, text: 'Keyword alignment — only ' + pct + '% match. Add the missing keywords before exporting.' });
    return items;
  }

  /* ---------- browser download helper ---------- */

  function download(filename, bytes, mime) {
    const data = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function slugify(name) {
    const s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'resume';
  }

  return {
    MIME,
    buildDocument,
    toPlainText,
    buildDocx,
    buildPdf,
    atsChecklist,
    download,
    slugify
  };
});
