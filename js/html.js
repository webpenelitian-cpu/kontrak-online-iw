/* Templat HTML aman TANPA pengurai HTML (gaya htm/hyperscript; rujukan: developit/htm, lit/lit packages/lit-html; mdn/content
   "Element: innerHTML" bagian Security considerations).
   html`...` memisahkan bagian STATIS (kode sumber aplikasi) dari NILAI:
   - Bagian statis templat bertanda (array string beku bermilik .raw — teks dinamis tidak bisa menyamar) dibaca SEKALI oleh penyusun
     pohon kecil yang ketat (tag harus ditutup, atribut berkutip ganda, tanpa entitas) menjadi cetakan; salah tulis = galat saat uji.
   - Setiap pemasangan membangun DOM langsung dengan createElement/setAttribute/simpul teks. NILAI selalu menjadi Text.data atau
     nilai atribut — tidak pernah diurai sebagai HTML. Tidak ada innerHTML/insertAdjacentHTML di sini.
   - Hasilnya sama dengan yang dibuat pengurai peramban untuk templat yang sama (teks bersebelahan digabung, <tr> langsung di
     <table> mendapat <tbody>) — dibuktikan dengan potret DOM semua wadah UI (lama vs baru) dan uji tests/uji.js.
   Bentuk nilai:
   - isi elemen      : ${teks} → teks; ${html`…`} / ${[html`…`, …]} → disisipkan; '' / null / undefined → tidak ada apa-apa
   - nilai atribut   : <input value="${v}"> → teks apa adanya
   - atribut boolean : <option ?selected="${kondisi}"> → atribut "selected" ada/tidak */
'use strict';
window.H = (function () {
  // templat diberi merek (WeakSet): objek data berbentuk {s, v} dari JSON/cadangan tidak bisa menyamar sebagai templat
  const MEREK = new WeakSet();
  const html = (s, ...v) => { const t = { s, v }; MEREK.add(t); return t; };
  const templat = v => MEREK.has(v);
  // array = daftar templat (hasil .map) bila semua anggotanya templat/daftar/kosong; array data lain ditulis seperti String() ("a,b")
  const daftar = v => Array.isArray(v) && v.every(y => templat(y) || daftar(y) || y === '' || y == null);
  const A = '', Z = '', RE_LUBANG = /(\d+)/g;
  const KOSONG_TAG = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'link', 'meta', 'wbr']);
  const KONTEKS_TABEL = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);

  // ---------- cetakan (sekali per lokasi templat) ----------
  const cetakan = new WeakMap();
  // potongan teks/atribut berpenanda → [string | nomor-lubang, …]
  function bagian(t) {
    const out = []; let akhir = 0;
    for (const m of t.matchAll(RE_LUBANG)) { if (m.index > akhir) out.push(t.slice(akhir, m.index)); out.push(+m[1]); akhir = m.index + m[0].length; }
    if (akhir < t.length) out.push(t.slice(akhir));
    return out;
  }
  // atribut boolean ?nama="${x}" → penanda berdiri sendiri di dalam tag (dibaca sebagai {bool})
  function gabung(s) {
    let teks = s[0];
    for (let i = 1; i < s.length; i++) {
      const b = teks.match(/\s\?([a-z-]+)="$/);
      if (b && s[i][0] === '"') teks = teks.slice(0, -b[0].length) + ` ${A}${i - 1}${Z}?${b[1]}` + s[i].slice(1);
      else teks += A + (i - 1) + Z + s[i];
    }
    return teks;
  }
  function bacaAtribut(teks, p, atribut) {
    const m = /^\s+(?:(\d+)\?([a-z-]+)|([^\s=>/]+)(?:="([^"]*)")?)/.exec(teks.slice(p));
    if (!m) return -1;
    if (m[1] !== undefined) atribut.push({ bool: +m[1], nama: m[2] });
    else if (/[?]/.test(m[3])) throw new SyntaxError('html``: nilai di posisi nama atribut (pakai name="${…}" atau ?name="${…}")');
    else atribut.push({ nama: m[3], nilai: bagian(m[4] === undefined ? '' : m[4]) });
    return p + m[0].length;
  }
  function bacaTag(teks, p, tumpuk) {
    const tutup = /^<\/([a-z][a-z0-9]*)\s*>/.exec(teks.slice(p));
    if (tutup) {
      const atas = tumpuk.pop();
      if (!atas || atas.tag !== tutup[1]) throw new SyntaxError(`html\`\`: </${tutup[1]}> tidak cocok`);
      return p + tutup[0].length;
    }
    const buka = /^<([a-z][a-z0-9]*)/.exec(teks.slice(p));
    if (!buka) throw new SyntaxError('html``: tag tidak sah di bagian statis');
    const el = { tag: buka[1], atribut: [], anak: [] };
    let q = p + buka[0].length;
    for (let r = bacaAtribut(teks, q, el.atribut); r >= 0; r = bacaAtribut(teks, q, el.atribut)) q = r;
    const ujung = /^\s*\/?>/.exec(teks.slice(q));
    if (!ujung) throw new SyntaxError(`html\`\`: tag <${el.tag}> tidak ditutup dengan >`);
    tumpuk[tumpuk.length - 1].anak.push(el);
    if (!KOSONG_TAG.has(el.tag)) tumpuk.push(el);
    return q + ujung[0].length;
  }
  function susun(s) {
    let c = cetakan.get(s);
    if (c) return c;
    if (!Object.isFrozen(s) || !Array.isArray(s.raw)) throw new TypeError('html`` hanya untuk templat bertanda');
    if (s.some(t => t.includes(A) || t.includes(Z) || /&[A-Za-z#]/.test(t))) throw new TypeError('html``: penanda cadangan atau entitas di bagian statis');
    const teks = gabung(s), akar = { anak: [] }, tumpuk = [akar];
    for (let p = 0; p < teks.length;) {
      if (teks[p] === '<') { p = bacaTag(teks, p, tumpuk); continue; }
      const q = teks.indexOf('<', p), akhir = q < 0 ? teks.length : q;
      const induk = tumpuk[tumpuk.length - 1];
      // teks langsung di dalam tabel diperlakukan khusus oleh pengurai HTML (dipindah/ditaruh di tbody) — tidak didukung: tolak
      const potong = bagian(teks.slice(p, akhir));
      if (KONTEKS_TABEL.has(induk.tag) && potong.some(b => typeof b === 'string')) throw new SyntaxError(`html\`\`: teks langsung di dalam <${induk.tag}>`);
      induk.anak.push({ teks: potong });
      p = akhir;
    }
    if (tumpuk.length !== 1) throw new SyntaxError(`html\`\`: <${tumpuk[tumpuk.length - 1].tag}> tidak ditutup`);
    cetakan.set(s, c = akar.anak);
    return c;
  }

  // ---------- pembangunan DOM ----------
  function tambahTeks(induk, t) { // teks bersebelahan digabung seperti hasil pengurai
    if (!t) return;
    if (KONTEKS_TABEL.has(induk.nodeName.toLowerCase())) throw new TypeError('html``: nilai teks langsung di dalam tabel');
    const akhir = induk.lastChild;
    if (akhir && akhir.nodeType === Node.TEXT_NODE) akhir.appendData(t); else induk.appendChild(document.createTextNode(t));
  }
  function tambahElemen(induk, el) { // <tr> langsung di <table> → di dalam <tbody> (aturan "in table" pengurai HTML)
    if (el.tagName === 'TR' && induk.nodeName === 'TABLE') {
      let tb = induk.lastChild;
      if (!tb || tb.nodeName !== 'TBODY') tb = induk.appendChild(document.createElement('tbody'));
      tb.appendChild(el);
    } else induk.appendChild(el);
  }
  function nilaiIsi(induk, x) {
    if (typeof x === 'string') tambahTeks(induk, x); // jalur tersering
    else if (templat(x)) bangun(induk, x);
    else if (daftar(x)) for (const y of x) nilaiIsi(induk, y);
    else tambahTeks(induk, String(x ?? ''));
  }
  function teksAtribut(bg, v) {
    if (bg.length === 1) return typeof bg[0] === 'number' ? String(v[bg[0]] ?? '') : bg[0];
    let s = '';
    for (const b of bg) s += typeof b === 'number' ? String(v[b] ?? '') : b;
    return s;
  }
  function elemen(n, v) {
    const el = document.createElement(n.tag);
    for (const a of n.atribut) {
      if (a.bool === undefined) el.setAttribute(a.nama, a.nilai.length ? teksAtribut(a.nilai, v) : '');
      else if (v[a.bool]) el.setAttribute(a.nama, '');
    }
    return el;
  }
  function bangunSimpul(induk, n, v) {
    if (n.teks) {
      if (n.teks.length === 1 && typeof n.teks[0] === 'string') { tambahTeks(induk, n.teks[0]); return; }
      for (const b of n.teks) { if (typeof b === 'number') nilaiIsi(induk, v[b]); else tambahTeks(induk, b); }
      return;
    }
    const el = elemen(n, v);
    for (const a of n.anak) bangunSimpul(el, a, v);
    tambahElemen(induk, el);
  }
  function bangun(induk, tp) { const v = tp.v; for (const n of susun(tp.s)) bangunSimpul(induk, n, v); }
  /** Pasang templat sebagai isi elemen (isi lama diganti). */
  function pasang(el, tp) {
    if (el.nodeName === 'TABLE') { const t = document.createElement('table'); nilaiIsi(t, tp); el.replaceChildren(...t.childNodes); return; }
    const f = document.createDocumentFragment(); // fragmen dipindah sekaligus (lebih murah daripada menyebar simpulnya)
    nilaiIsi(f, tp);
    el.replaceChildren(f);
  }
  /** Bangun templat menjadi DocumentFragment (tanpa memasangnya). */
  function fragmen(tp) { const f = document.createDocumentFragment(); nilaiIsi(f, tp); return f; }

  // ---------- serialisasi ke teks HTML (untuk sidik/ekspor; nilai di-escape seperti U.esc) ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  function strNilai(x) {
    if (templat(x)) return keString(x);
    if (daftar(x)) return x.map(strNilai).join('');
    return esc(String(x ?? ''));
  }
  function strAtribut(a, v) {
    if (a.bool !== undefined) return v[a.bool] ? ' ' + a.nama : '';
    return ` ${a.nama}="${esc(teksAtribut(a.nilai, v))}"`;
  }
  function strSimpul(n, v) {
    if (n.teks) return n.teks.map(b => typeof b === 'number' ? strNilai(v[b]) : b).join('');
    const buka = `<${n.tag}${n.atribut.map(a => strAtribut(a, v)).join('')}>`;
    return KOSONG_TAG.has(n.tag) ? buka : `${buka}${n.anak.map(a => strSimpul(a, v)).join('')}</${n.tag}>`;
  }
  /** Teks HTML dari templat (atau daftar templat): bagian statis apa adanya, nilai di-escape. */
  function keString(tp) {
    if (!templat(tp)) return strNilai(tp);
    return susun(tp.s).map(n => strSimpul(n, tp.v)).join('');
  }
  return { html, pasang, fragmen, keString, templat };
})();
