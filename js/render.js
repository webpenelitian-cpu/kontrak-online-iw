/* Render blok naskah ke HTML (pratinjau/cetak) dan ke .docx (Word) tanpa pustaka luar.
   .docx dirakit sebagai ZIP tanpa kompresi (metode "stored") + CRC-32. */
'use strict';
window.RENDER = (function () {
  const { esc } = U;

  // ---------- HTML ----------
  function inl(s) {
    return esc(s)
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+?)\*/g, '<i>$1</i>')
      .replace(/\n/g, '<br>')
      .replace(/\[•\]/g, '<span class="ph">[•]</span>');
  }
  const adjAttr = b => b.adj ? ` data-adj="1" title="${esc(b.adj)}"` : '';
  function keHTML(blocks) {
    return blocks.map(b => {
      const A = adjAttr(b), ac = b.adj ? ' adj' : '';
      switch (b.t) {
        case 'hc': return `<p class="hc">${inl(b.x)}</p>`;
        case 'pc': return `<p class="c">${inl(b.x)}</p>`;
        case 'h': return `<h3>${inl(b.x)}</h3>`;
        case 'p': return `<p class="j${ac}"${A}>${inl(b.x)}</p>`;
        case 'li': return `<div class="li l${b.lvl || 1}${ac}"${A}><span>${inl(b.n)}</span><span>${inl(b.x)}</span></div>`;
        case 'kv': return `<table class="kv${b.n ? ' n' : ''}">${b.rows.map((r, i) => `<tr>${b.n ? `<td>${i ? '' : inl(b.n)}</td>` : ''}<td>${inl(r[0])}</td><td>:</td><td>${inl(r[1])}</td></tr>`).join('')}</table>`;
        case 'table': return `<table class="grid">${b.rows.map((r, ri) => `<tr>${r.map(c => (b.head && ri === 0) ? `<th>${inl(c)}</th>` : `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</table>`;
        case 'sign': return `<table class="sign"><tr>${b.cols.map(c => `<td>${inl(c[0])}</td>`).join('')}</tr><tr>${b.cols.map(() => '<td class="gap"></td>').join('')}</tr><tr>${b.cols.map(c => `<td><b><u>${inl(c[1])}</u></b>${c[2] ? '<br>' + inl(c[2]) : ''}</td>`).join('')}</tr></table>`;
        case 'paraf': return `<table class="paraf"><tr>${b.cols.map(c => `<th>${inl(c)}</th>`).join('')}</tr><tr>${b.cols.map(() => '<td></td>').join('')}</tr></table>`;
        case 'pb': return '<hr class="pb">';
        default: return '';
      }
    }).join('');
  }

  // ---------- DOCX ----------
  const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // karakter kendali tidak sah di XML 1.0 dibuang (W3C XML 1.0 \u00A72.2 Char): < U+0020 kecuali tab/LF/CR, serta U+FFFE/U+FFFF.
  // Disaring per kode karakter (bukan kelas regex karakter kendali); hasil sama dengan pola lama, diuji di tests/uji.js.
  const takSahXml = c => (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) || c === 0xFFFE || c === 0xFFFF;
  const xmlAman = s => {
    const t = String(s);
    let o = '', awal = 0;
    for (let i = 0; i < t.length; i++) if (takSahXml(t.charCodeAt(i))) { o += t.slice(awal, i); awal = i + 1; }
    return awal ? o + t.slice(awal) : t;
  };
  function runs(s, o = {}) {
    return xmlAman(s).split(/(\*\*.+?\*\*|__.+?__|\*[^*]+?\*)/g).filter(Boolean).map(seg => {
      let t = seg, b = !!o.bold, u = false, it = false;
      if (/^\*\*.+\*\*$/.test(t)) { b = true; t = t.slice(2, -2); }
      if (/^__.+__$/.test(t)) { u = true; t = t.slice(2, -2); }
      if (!b && !u && /^\*[^*]+\*$/.test(t)) { it = true; t = t.slice(1, -1); }
      const dasar = `${b || u ? '<w:b/>' : ''}${it ? '<w:i/>' : ''}${u ? '<w:u w:val="single"/>' : ''}${o.size ? `<w:sz w:val="${o.size}"/>` : ''}`;
      const run = (txt, sorot) => {
        const rpr = dasar + (sorot ? '<w:highlight w:val="yellow"/>' : '');
        return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${xe(txt)}</w:t></w:r>`;
      };
      // hanya penanda [•] yang disorot kuning; tab menjadi <w:tab/>
      return t.split('\n').map((ln, i) => (i ? '<w:r><w:br/></w:r>' : '') +
        ln.split(/(\[•\]|\t)/).filter(Boolean).map(x => x === '\t' ? '<w:r><w:tab/></w:r>' : run(x, o.sorot && x === '[•]')).join('')).join('');
    }).join('');
  }
  function para(s, o = {}) {
    const jc = o.center ? '<w:jc w:val="center"/>' : (o.justify ? '<w:jc w:val="both"/>' : '');
    const ind = o.ind != null ? `<w:ind w:left="${o.ind}" w:hanging="${o.hang || 0}"/>` : '';
    return `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 0}"/>${ind}${jc}</w:pPr>${runs(s, o)}</w:p>`;
  }
  const NIL = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
  const GARIS = '<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>';
  function tbl(rows, o = {}) {
    const w = o.widths;
    return `<w:tbl><w:tblPr><w:tblW w:w="${o.pct ? 5000 : 0}" w:type="${o.pct ? 'pct' : 'auto'}"/>${o.indent ? `<w:tblInd w:w="${o.indent}" w:type="dxa"/>` : ''}${o.garis ? GARIS : NIL}<w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      rows.map((r, ri) => `<w:tr>${r.map((c, ci) => `<w:tc><w:tcPr><w:tcW w:w="${w ? w[ci] : 0}" w:type="${w ? 'dxa' : 'auto'}"/></w:tcPr>${String(c).split('\n').map(line => para(line, { bold: o.head && ri === 0, center: o.center, size: o.size, sorot: o.sorot })).join('') || para('')}</w:tc>`).join('')}</w:tr>`).join('') +
      `</w:tbl>${para('')}`;
  }
  function keDocXML(blocks, k, sorot) {
    const S = { sorot };
    const body = blocks.map(b => {
      switch (b.t) {
        case 'hc': return para(b.x, { ...S, center: true, bold: true, before: /^PASAL /.test(b.x) ? 240 : 0, keep: true });
        case 'pc': return para(b.x, { ...S, center: true });
        case 'h': return para(b.x, { ...S, bold: true, before: 160, keep: true });
        case 'p': return para(b.x, { ...S, justify: true, ind: k.ind || 0, after: 60 });
        case 'li': return para(`${b.n}\t${b.x}`, { ...S, justify: true, ind: (k.ind || 0) + (b.lvl === 2 ? 402 + 284 : 427), hang: b.lvl === 2 ? 284 : 427, after: 40 });
        case 'kv': return b.n ? tbl(b.rows.map((r, i) => [i ? '' : b.n, r[0], ':', r[1]]), { ...S, indent: k.ind || 0 }) : tbl(b.rows.map(r => [r[0], ':', r[1]]), { ...S, indent: 427 });
        case 'table': return tbl(b.rows, { ...S, garis: true, head: b.head, pct: true, size: k.size - 4 });
        case 'sign': return tbl([b.cols.map(c => c[0]), b.cols.map(() => '\n\n\n'), b.cols.map(c => `**__${c[1]}__**${c[2] ? '\n' + c[2] : ''}`)], { ...S, center: true, pct: true });
        case 'pb': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        default: return '';
      }
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="${k.w}" w:h="${k.h}"${k.w > k.h ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${k.top}" w:right="${k.right}" w:bottom="${k.bottom}" w:left="${k.left}" w:header="709" w:footer="${k.footer}" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }
  function keFooterXML(blocks) {
    const pr = blocks.find(b => b.t === 'paraf');
    const nomor = '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    let tabel = '';
    if (pr) {
      const sel = isi => `<w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${isi ? `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="20"/></w:rPr><w:t>${xe(isi)}</w:t></w:r>` : ''}</w:p></w:tc>`;
      tabel = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="right"/>${GARIS}</w:tblPr><w:tr>${pr.cols.map(c => sel(c)).join('')}</w:tr><w:tr><w:trPr><w:trHeight w:val="500"/></w:trPr>${pr.cols.map(() => sel('')).join('')}</w:tr></w:tbl>`;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${tabel}${nomor}</w:ftr>`;
  }

  // ---------- ZIP (stored) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) { // files: [[nama, string]]
    const enc = new TextEncoder(), lokal = [], pusat = [];
    let offset = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    for (const [nama, isi] of files) {
      const n = enc.encode(nama), data = enc.encode(isi), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      lokal.push(new Uint8Array(h.buffer), n, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
      pusat.push(new Uint8Array(c.buffer), n);
      offset += 30 + n.length + data.length;
    }
    const ukPusat = pusat.reduce((s, a) => s + a.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, ukPusat, true); e.setUint32(16, offset, true);
    return new Blob([...lokal, ...pusat, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  const KERTAS_DEFAULT = { w: 11906, h: 16838, top: 1418, right: 1418, bottom: 1418, left: 1701, footer: 709, font: 'Arial', size: 22, ind: 0 };
  function berkasDocx(blocks, kertas, judul, sorot) {
    const k = Object.assign({}, KERTAS_DEFAULT, kertas || {});
    return [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
      ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xe(xmlAman(judul || 'Kontrak'))}</dc:title><dc:language>id-ID</dc:language></cp:coreProperties>`],
      ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'],
      ['word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${k.font}" w:hAnsi="${k.font}" w:cs="${k.font}"/><w:sz w:val="${k.size}"/><w:szCs w:val="${k.size}"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`],
      ['word/document.xml', keDocXML(blocks, k, sorot)],
      ['word/footer1.xml', keFooterXML(blocks)]
    ];
  }
  const docx = (blocks, kertas, judul, sorot) => zip(berkasDocx(blocks, kertas, judul, sorot));
  return { keHTML, docx, berkasDocx, zip, crc32, inl };
})();
