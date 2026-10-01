// Tiny dependency-free PDF writer (text, rules, simple tables) using the
// built-in Helvetica fonts. Enough for a clean accountant summary.

// Helvetica glyph widths for ASCII 32..126 (1/1000 em).
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

const clean = s => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/→/g, '->').replace(/÷/g, '/').replace(/·/g, '-')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
const pdfStr = s => `(${clean(s).replace(/([\\()])/g, '\\$1')})`;

export function textWidth(s, size, bold) {
  let w = 0;
  for (const ch of clean(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? W[c - 32] : 556; }
  return (w * size / 1000) * (bold ? 1.06 : 1);
}

export class Pdf {
  constructor({ footer = '' } = {}) {
    this.pw = 612; this.ph = 792; this.m = 54;
    this.pages = []; this.footer = footer;
    this.newPage();
  }
  get width() { return this.pw - this.m * 2; }
  newPage() { this.ops = []; this.pages.push(this.ops); this.y = this.ph - this.m; }
  need(h) { if (this.y - h < this.m + 24) this.newPage(); }
  gap(h = 8) { this.y -= h; }

  text(s, x, y, { size = 10, bold = false, align = 'left', gray = 0 } = {}) {
    if (align === 'right') x -= textWidth(s, size, bold);
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfStr(s)} Tj ET`);
  }
  rule(gray = 0.75, weight = 0.5) {
    this.ops.push(`${gray} G ${weight} w ${this.m} ${this.y.toFixed(2)} m ${this.pw - this.m} ${this.y.toFixed(2)} l S`);
  }

  wrap(s, size, maxW, bold) {
    const lines = [];
    for (const para of clean(s).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (textWidth(next, size, bold) > maxW && line) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  title(s, sub) {
    this.need(50);
    this.y -= 16; this.text(s, this.m, this.y, { size: 18, bold: true });
    if (sub) { this.y -= 16; this.text(sub, this.m, this.y, { size: 10, gray: 0.35 }); }
    this.y -= 10; this.rule(0.2, 1); this.y -= 6;
  }
  h2(s) {
    this.need(46);
    this.y -= 20; this.text(s, this.m, this.y, { size: 12, bold: true });
    this.y -= 5; this.rule(); this.y -= 4;
  }
  para(s, { size = 9, gray = 0.25 } = {}) {
    for (const line of this.wrap(s, size, this.width)) { this.need(size + 4); this.y -= size + 3; this.text(line, this.m, this.y, { size, gray }); }
    this.y -= 3;
  }
  // label ...... value (value right-aligned)
  kv(label, value, { bold = false, indent = 0 } = {}) {
    this.need(16);
    this.y -= 14;
    this.text(label, this.m + indent, this.y, { bold });
    this.text(value, this.pw - this.m, this.y, { bold, align: 'right' });
  }
  // cols: [{ label, width (fraction), align }]
  table(cols, rows, { size = 8.5 } = {}) {
    const xs = []; let x = this.m;
    for (const c of cols) { xs.push(x); x += c.width * this.width; }
    const drawRow = (cells, bold, gray) => {
      const wrapped = cells.map((c, i) => this.wrap(c, size, cols[i].width * this.width - 6, bold));
      const h = Math.max(...wrapped.map(w => w.length)) * (size + 2.5) + 3;
      this.need(h);
      wrapped.forEach((lines, i) => lines.forEach((ln, j) => {
        const right = cols[i].align === 'right';
        this.text(ln, right ? xs[i] + cols[i].width * this.width - 3 : xs[i], this.y - (j + 1) * (size + 2.5), { size, bold, gray, align: right ? 'right' : 'left' });
      }));
      this.y -= h;
    };
    const head = () => { drawRow(cols.map(c => c.label), true, 0); this.y -= 2; this.rule(); };
    this.need(40);
    head();
    for (const r of rows) {
      const before = this.pages.length;
      drawRow(r.map(v => v ?? ''), false, 0.1);
      if (this.pages.length !== before) { /* row moved to a new page - nothing else to do */ }
    }
    this.y -= 4;
  }

  build() {
    const total = this.pages.length;
    this.pages.forEach((ops, i) => {
      const foot = `${this.footer}${this.footer ? '   |   ' : ''}Page ${i + 1} of ${total}`;
      ops.push(`BT /F1 8 Tf 0.4 g ${this.m} 30 Td ${pdfStr(foot)} Tj ET`);
    });
    const objs = [];
    const add = body => { objs.push(body); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // pages placeholder
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.pages) {
      const stream = ops.join('\n');
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pw} ${this.ph}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
    return new Blob([bytes], { type: 'application/pdf' });
  }
}
