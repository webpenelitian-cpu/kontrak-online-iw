/* Templat HTML aman ala lit-html (rujukan: lit/lit packages/lit-html "template-result" + penanda; mdn/content
   "Element: innerHTML" bagian Security considerations; contoh lain di repo ini: autotrade web/app.js 6f8c169).
   html`...` memisahkan bagian STATIS (kode sumber aplikasi) dari NILAI:
   - Yang diurai pengurai HTML hanya gabungan potongan statis templat bertanda + penanda angka (\uE000n\uE001).
   - NILAI tidak pernah diurai: setelah penguraian, penanda diganti dengan nilainya lewat Text.data / Attr.value.
   Jadi keamanan tidak bergantung pada U.esc() yang bisa terlupa, dan tetap satu kali penguraian per pemasangan
   (secepat innerHTML lama; pohon DOM hasilnya sama — dibuktikan dengan membandingkan potret DOM semua wadah UI).
   Bentuk nilai:
   - isi elemen      : ${teks} → teks; ${html`…`} / ${[html`…`, …]} → disisipkan; '' / null / undefined → tidak ada apa-apa
   - nilai atribut   : <input value="${v}"> → teks apa adanya
   - atribut boolean : <option ?selected="${kondisi}"> → atribut statis "selected" ada/tidak
   Bukan pembersih HTML: HTML dari data tidak pernah diurai sama sekali. */
'use strict';
window.H = (function () {
  // templat diberi merek (WeakSet): objek data berbentuk {s, v} dari JSON/cadangan tidak bisa menyamar sebagai templat
  const MEREK = new WeakSet();
  const html = (s, ...v) => { const t = { s, v }; MEREK.add(t); return t; };
  const A = '\uE000', Z = '\uE001', RE = /\uE000(\d+)\uE001/g;
  const ISI = 0, ATR = 1, BOOL = 2;
  const susunan = new WeakMap();
  const templat = v => MEREK.has(v);
  // array = daftar templat (hasil .map) bila semua anggotanya templat/daftar/kosong; array data lain ditulis seperti String() lama ("a,b")
  const daftar = v => Array.isArray(v) && v.every(y => templat(y) || daftar(y) || y === '' || y == null);
  // Susunan per lokasi templat (sekali): jenis tiap nilai, potongan statis (atribut boolean dipangkas), nama atribut boolean.
  function susun(s) {
    let c = susunan.get(s);
    if (c) return c;
    // hanya array string templat bertanda asli (beku, punya .raw): teks dinamis tidak bisa menyamar sebagai bagian statis
    if (!Object.isFrozen(s) || !Array.isArray(s.raw)) throw new TypeError('html`` hanya untuk templat bertanda');
    c = { statis: [...s], jenis: [], nama: [] };
    let lalu = '';
    for (let i = 0; i < s.length - 1; i++) { lalu += c.statis[i]; golongkan(c, i, lalu); }
    if (c.statis.some(t => t.includes(A) || t.includes(Z))) throw new TypeError('penanda cadangan di bagian statis');
    susunan.set(s, c);
    return c;
  }
  // jenis nilai ke-i: atribut boolean (?nama="${}": potongan statis di sekitarnya dipangkas), nilai atribut, atau isi elemen
  function golongkan(c, i, lalu) {
    const b = c.statis[i].match(/\s\?([a-z-]+)="$/);
    if (b && c.statis[i + 1][0] === '"') {
      c.jenis.push(BOOL); c.nama.push(b[1]);
      c.statis[i] = c.statis[i].slice(0, -b[0].length); c.statis[i + 1] = c.statis[i + 1].slice(1);
    } else { c.jenis.push(lalu.lastIndexOf('<') > lalu.lastIndexOf('>') ? ATR : ISI); c.nama.push(''); }
  }
  function tulis(tp, o) {
    const c = susun(tp.s);
    for (let i = 0; i < c.statis.length; i++) {
      o.teks.push(c.statis[i]);
      if (i === c.jenis.length) break;
      const x = tp.v[i];
      if (c.jenis[i] === BOOL) { if (x) o.teks.push(' ' + c.nama[i]); }
      else if (c.jenis[i] === ATR) nilai(String(x ?? ''), o, 1);
      else isi(x, o);
    }
  }
  /* Teks yang tidak memuat satu pun karakter bermakna bagi tokenizer HTML terurai menjadi teks/nilai atribut yang
     persis sama dengan dirinya, jadi boleh langsung ikut kerangka (hemat: tanpa penanda). WHATWG HTML §13.2.5:
     data/RCDATA state hanya bereaksi pada < & NUL; atribut berkutip ganda pada " & NUL; "&" yang diikuti karakter
     selain [A-Za-z0-9#] tetap "&" harfiah (character reference state langsung mengembalikannya); prapemrosesan
     menormalkan CR; LF tepat setelah <textarea> dibuang. Yang lain — termasuk semua yang berbau HTML — dipasang lewat
     penanda → Text.data / Attr.value (diuji acak: tests/uji.js "html``: jalur langsung = jalur DOM"). */
  const LANGSUNG = [
    /^(?!\n)(?:[^<&\r\0\uE000\uE001]|&(?=[^A-Za-z0-9#]))*$/, // isi elemen
    /^(?:[^"&\r\0\uE000\uE001]|&(?=[^A-Za-z0-9#]))*$/ // nilai atribut berkutip ganda
  ];
  function nilai(t, o, atr) {
    if (LANGSUNG[atr].test(t)) o.teks.push(t);
    else { o.teks.push(A + o.nilai.length + Z); o.nilai.push(t); }
  }
  function isi(x, o) {
    if (templat(x)) tulis(x, o);
    else if (daftar(x)) for (const y of x) isi(y, o);
    else { const t = String(x ?? ''); if (t) nilai(t, o, 0); }
  }
  /* Pasang templat sebagai isi elemen: kerangka statis diurai langsung di el (konteks pengurai sama dengan innerHTML
     lama: <tr> di <table> mendapat <tbody>, dst.), lalu setiap penanda diganti nilainya sebagai teks/atribut —
     sinkron, sebelum peramban sempat menggambar atau memuat apa pun. Penelusuran berhenti begitu semua penanda terisi. */
  function pasang(el, tp) {
    const o = { teks: [], nilai: [] };
    isi(tp, o);
    el.innerHTML = o.teks.join(''); // potongan statis kode sumber + penanda angka + teks tanpa karakter HTML (LANGSUNG)
    let sisa = o.nilai.length;
    const terpakai = new Set();
    const ganti = s => s.replace(RE, (_, k) => {
      if (+k >= o.nilai.length || terpakai.has(k)) throw new Error('penanda templat tidak sah');
      terpakai.add(k); sisa--; return o.nilai[+k];
    });
    const w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n && sisa > 0; n = w.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) { if (n.data.includes(A)) n.data = ganti(n.data); }
      else if (n.hasAttributes()) for (const at of n.attributes) if (at.value.includes(A)) at.value = ganti(at.value);
    }
    if (sisa) throw new Error('penanda templat tidak terisi'); // mis. nilai di konteks yang dibuang pengurai — salah pakai templat
  }
  /* Naskah perjanjian: HTML lengkap dari RENDER.keHTML / lembar sewa, yang setiap isiannya sudah lewat U.esc() dan juga
     dipakai apa adanya untuk berkas HTML/cetak. Satu-satunya pengurai untuk HTML dinamis; dipakai hanya untuk #sheet. */
  function fragmenNaskah(s) { const t = document.createElement('template'); t.innerHTML = s; return t.content; }
  return { html, pasang, fragmenNaskah, LANGSUNG };
})();
