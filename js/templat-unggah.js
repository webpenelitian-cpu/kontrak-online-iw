/* Template unggahan pengguna per menu (perjanjian kerja, sewa rumah/kos/kendaraan/alat, addendum, pengadaan, …).
   - Format: .docx (dibaca pustaka mammoth di vendor/, dimuat saat dibutuhkan) atau .txt (UTF-8).
   - Isi diubah menjadi BLOK NASKAH aplikasi (judul, paragraf, butir, tabel) — bukan HTML. Naskah lalu dirender lewat jalur yang
     sama dengan naskah bawaan (RENDER.keHTML dengan U.esc, RENDER.docx), jadi HTML/skrip dari berkas tidak pernah ikut ditampilkan.
   - Placeholder: {{kunci}} atau {{Label isian}} (tanpa beda huruf besar/kecil) dipetakan ke isian formulir menu itu; tanggal ditulis
     "1 Desember 2026", angka "40.000.000", isian kosong "[•]". Placeholder yang tidak dikenal dibiarkan apa adanya dan diperingatkan.
   - Keamanan berkas: ukuran dibatasi, ekstensi + tanda tangan berkas diperiksa, DOCX bermakro (vbaProject) ditolak, gambar/objek
     sematan diabaikan; struktur tersimpan disahkan ulang setiap kali database dibaca (sahkan). */
'use strict';
window.TEMPLAT_UNGGAH = (function () {
  const { B, PH } = U;
  const MAKS_DOCX = 5 * 1048576, MAKS_TXT = 512 * 1024, MAKS_BLOK = 2000, MAKS_TEKS = 20000, MAKS_BARIS = 500, MAKS_KOLOM = 20, MAKS_SIMPAN = 1048576;
  const POLA = /\{\{\s*([^{}\n]{1,80}?)\s*\}\}/g;
  const normal = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // teks statis template: penanda format naskah (* dan __) dinetralkan seperti isian pengguna (U.bersih), tanpa memangkas spasi
  const netral = s => String(s).replace(/\*/g, '∗').replace(/_(?=_)/g, '_​');

  // ---------- isian formulir yang dapat dipakai sebagai placeholder ----------
  function isian(tpl) {
    return tpl.form.flatMap(sec => sec.fields).filter(f => !['lampiran', 'jd'].includes(f[2])).map(f => ({ k: f[0], label: f[1], jenis: f[2] || 'text' }));
  }
  // label yang dipakai lebih dari satu isian (mis. "Nama" di sewa rumah, isian penawar 1–5) TIDAK ditebak: dianggap ganda, pakai kunci
  const labelGanda = tpl => { const n = isian(tpl).map(f => normal(f.label)); return new Set(n.filter((x, i) => n.indexOf(x) !== i)); };
  function cariIsian(tpl, nama) {
    const d = isian(tpl), n = normal(nama);
    const kunci = d.find(f => f.k.toLowerCase() === String(nama).toLowerCase());
    if (kunci) return kunci;
    return labelGanda(tpl).has(n) ? null : d.find(f => normal(f.label) === n) || null;
  }
  const placeholderDi = blok => {
    const out = [];
    const teks = s => { for (const m of String(s).matchAll(POLA)) out.push(m[1]); };
    for (const b of blok) { if (b.x != null) teks(b.x); if (b.n != null) teks(b.n); if (b.rows) b.rows.forEach(r => r.forEach(teks)); }
    return out;
  };
  function ringkasPlaceholder(tpl, u) {
    const semua = [...new Set(placeholderDi(u.blok))], ganda = labelGanda(tpl);
    return { dikenal: semua.filter(p => cariIsian(tpl, p)), asing: semua.filter(p => !cariIsian(tpl, p)), ganda: semua.filter(p => !cariIsian(tpl, p) && ganda.has(normal(p))) };
  }

  // ---------- membaca berkas ----------
  const muatSkrip = (() => { const sudah = {}; return src => sudah[src] || (sudah[src] = new Promise((ok, gagal) => {
    const s = document.createElement('script'); s.src = U.urlAset(src);
    s.onload = ok; s.onerror = () => { delete sudah[src]; gagal(new Error('gagal memuat ' + src)); };
    document.head.appendChild(s);
  })); })();
  const ada = (buf, teks) => { // cari teks ASCII di bytes (nama entri ZIP tersimpan apa adanya)
    const t = new TextEncoder().encode(teks), b = new Uint8Array(buf);
    outer: for (let i = 0; i <= b.length - t.length; i++) { for (let j = 0; j < t.length; j++) if (b[i + j] !== t[j]) continue outer; return true; }
    return false;
  };
  // Bom ZIP: batas 5 MB berlaku untuk berkas terkompresi. Direktori pusat ZIP (APPNOTE 4.3.12/4.3.16) dibaca dulu; ukuran
  // terurai total > 50 MB atau > 2.000 entri ditolak sebelum mammoth mengurai apa pun di utas utama.
  function cekZip(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('struktur ZIP .docx rusak');
    const n = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true), total = 0;
    if (n > 2000) throw new Error('berkas .docx berisi terlalu banyak bagian');
    for (let i = 0; i < n; i++) {
      if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('struktur ZIP .docx rusak');
      total += v.getUint32(p + 24, true);
      p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    if (total > 50 * 1048576) throw new Error('isi .docx terurai terlalu besar (maks. 50 MB)');
  }
  async function sha256(buf) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join(''); }

  // HTML hasil mammoth diurai DOMParser (dokumen lembam: tidak menjalankan skrip, tidak memuat gambar) lalu diubah ke blok.
  const DIBUANG = new Set(['IMG', 'SCRIPT', 'STYLE', 'TEMPLATE']), PENANDA_GAYA = { STRONG: '**', B: '**', EM: '*', I: '*' };
  function teksSimpul(n) {
    if (n.nodeType === Node.TEXT_NODE) return netral(n.data);
    if (n.nodeType !== Node.ELEMENT_NODE || DIBUANG.has(n.tagName)) return '';
    if (n.tagName === 'BR') return '\n';
    const isi = teksInline(n), p = PENANDA_GAYA[n.tagName];
    return p && isi.trim() ? p + isi + p : isi;
  }
  function teksInline(el) { return [...el.childNodes].map(teksSimpul).join(''); }
  const teksSel = c => c.children.length ? [...c.children].map(teksInline).join('\n').trim() : teksInline(c).trim();
  function tabelDocx(el) {
    const tr = [...el.querySelectorAll('tr')].filter(r => r.closest('table') === el);
    const rows = tr.map(r => [...r.children].filter(c => c.tagName === 'TD' || c.tagName === 'TH').map(teksSel));
    return rows.length ? B.TB(rows, !!(tr[0] && tr[0].querySelector('th'))) : null;
  }
  function daftarDocx(el, lvl, blok) {
    [...el.children].filter(li => li.tagName === 'LI').forEach((li, i) => {
      const sub = [...li.children].filter(x => x.tagName === 'UL' || x.tagName === 'OL');
      sub.forEach(x => x.remove());
      const x = teksInline(li).trim();
      if (x) blok.push(B.LI(el.tagName === 'OL' ? `${i + 1}.` : '•', x, lvl));
      sub.forEach(x2 => daftarDocx(x2, Math.min(2, lvl + 1), blok));
    });
  }
  function blokDocx(el, blok) {
    const tag = el.tagName;
    if (tag === 'UL' || tag === 'OL') return daftarDocx(el, 1, blok);
    if (tag === 'TABLE') { const t = tabelDocx(el); if (t) blok.push(t); return; }
    const x = /^H[1-6]$/.test(tag) || tag === 'P' ? teksInline(el).trim() : '';
    if (x) blok.push(tag === 'P' ? B.P(x) : tag === 'H1' ? B.HC(x) : B.H(x));
  }
  function dariHtmlDocx(html) {
    const blok = [];
    for (const el of new DOMParser().parseFromString(html, 'text/html').body.children) blokDocx(el, blok);
    return blok;
  }
  // .txt: baris "# " = judul tengah, "## " = subjudul, "- " = butir, baris kosong memisahkan paragraf.
  function dariTeks(t) {
    const blok = [];
    for (const par of t.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
      const baris = par.split('\n').filter(x => x.trim());
      if (!baris.length) continue;
      if (baris.every(x => /^\s*-\s+/.test(x))) { baris.forEach(x => blok.push(B.LI('•', netral(x.replace(/^\s*-\s+/, '').trim())))); continue; }
      const judul = baris[0].match(/^(#{1,2})\s+(.+)$/); // judul hanya baris pertama; sisanya paragraf
      if (judul) { blok.push((judul[1] === '#' ? B.HC : B.H)(netral(judul[2].trim()))); baris.shift(); }
      const p = baris.join('\n').trim();
      if (p) blok.push(B.P(netral(p)));
    }
    return blok;
  }
  async function blokDariDocx(buf) {
    const b = new Uint8Array(buf);
    if (!(b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04) || !ada(buf, 'word/document.xml')) throw new Error('bukan berkas Word .docx yang sah');
    if (ada(buf, 'vbaProject')) throw new Error('berkas memuat makro (vbaProject) — tidak diterima'); // nama entri ZIP tidak terkompresi
    cekZip(b);
    if (!window.mammoth) await muatSkrip('vendor/mammoth.browser.min.js');
    const r = await window.mammoth.convertToHtml({ arrayBuffer: buf }, { convertImage: window.mammoth.images.imgElement(() => ({ src: '' })) });
    return dariHtmlDocx(r.value);
  }
  function blokDariTxt(buf) {
    let t;
    try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { throw new Error('berkas .txt harus UTF-8', { cause: e }); }
    if (/\0/.test(t)) throw new Error('berkas .txt berisi data biner');
    return dariTeks(t);
  }
  function jenisBerkas(berkas) {
    const ext = (String(berkas.name || '').match(/\.([a-z0-9]+)$/i) || [])[1];
    const jenis = ext && ext.toLowerCase();
    if (jenis !== 'docx' && jenis !== 'txt') throw new Error('pakai berkas .docx atau .txt (.docm/.doc/makro tidak diterima)');
    if (berkas.size > (jenis === 'docx' ? MAKS_DOCX : MAKS_TXT)) throw new Error(`berkas terlalu besar (maks. ${jenis === 'docx' ? '5 MB' : '512 KB'})`);
    return jenis;
  }
  async function baca(berkas) {
    const nama = String(berkas.name || ''), jenis = jenisBerkas(berkas), docx = jenis === 'docx';
    const buf = await berkas.arrayBuffer();
    const blok = docx ? await blokDariDocx(buf) : blokDariTxt(buf);
    const u = sahkan({ nama: nama.slice(0, 200), jenis: docx ? 'docx' : 'txt', sha256: await sha256(buf), ukuran: berkas.size, diunggah: new Date().toISOString(), blok });
    if (!u || !u.blok.length) throw new Error('template kosong atau tidak terbaca');
    if (JSON.stringify(u).length > MAKS_SIMPAN) throw new Error('isi template terlalu besar untuk disimpan (maks. ±1 MB teks)');
    return u;
  }

  // ---------- pengesahan struktur (saat unggah dan setiap database dibaca/dipulihkan) ----------
  const str = (v, maks) => typeof v === 'string' ? v.slice(0, maks) : null;
  const SAHKAN_BLOK = {
    hc: b => { const x = str(b.x, MAKS_TEKS); return x ? { t: b.t, x } : null; },
    li: b => { const x = str(b.x, MAKS_TEKS), n = str(b.n, 20); return x && n !== null ? { t: 'li', n, x, lvl: b.lvl === 2 ? 2 : 1 } : null; },
    table: b => {
      if (!Array.isArray(b.rows)) return null;
      const rows = b.rows.slice(0, MAKS_BARIS).filter(Array.isArray).map(r => r.slice(0, MAKS_KOLOM).map(c => str(c, 5000) ?? ''));
      return rows.length ? { t: 'table', rows, head: b.head === true } : null;
    }
  };
  SAHKAN_BLOK.h = SAHKAN_BLOK.p = SAHKAN_BLOK.hc;
  function sahkanBlok(b) {
    const f = b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(SAHKAN_BLOK, b.t) ? SAHKAN_BLOK[b.t] : null;
    return f ? f(b) : null;
  }
  const RE_SHA = /^[0-9a-f]{64}$/, RE_WAKTU = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
  const ukuranSah = v => Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  const waktuSah = v => typeof v === 'string' && RE_WAKTU.test(v) ? v : '';
  function sahkan(u) {
    if (!u || typeof u !== 'object' || !Array.isArray(u.blok) || typeof u.sha256 !== 'string' || !RE_SHA.test(u.sha256)) return null;
    const blok = u.blok.slice(0, MAKS_BLOK).map(sahkanBlok).filter(Boolean);
    if (!blok.length) return null;
    return { nama: str(u.nama, 200) || 'template', jenis: u.jenis === 'docx' ? 'docx' : 'txt', sha256: u.sha256,
      ukuran: ukuranSah(u.ukuran), diunggah: waktuSah(u.diunggah), blok };
  }
  function sahkanSemua(x, templatSah) {
    const o = {};
    if (x && typeof x === 'object' && !Array.isArray(x)) for (const [k, v] of Object.entries(x)) {
      if (!/^[a-z][a-z0-9-]{0,30}$/.test(k) || (templatSah && !templatSah.includes(k))) continue;
      const u = sahkan(v); if (u) o[k] = u;
    }
    return o;
  }

  // ---------- naskah dari template ----------
  function nilai(c, f) {
    if (f.jenis === 'date') { const d = c.d(f.k); return d ? U.tglD(d) : PH; }
    if (f.jenis === 'num') return c.has(f.k) ? U.ribuan(c.n(f.k)) : PH;
    return c.v(f.k);
  }
  function bangun(tpl, u, c) {
    const isi = s => String(s).replace(POLA, (m, p) => { const f = cariIsian(tpl, p); return f ? nilai(c, f) : m; });
    return u.blok.map(b => b.t === 'table' ? Object.assign({}, b, { rows: b.rows.map(r => r.map(isi)) })
      : Object.assign({}, b, b.n != null ? { n: isi(b.n) } : {}, { x: isi(b.x) }));
  }
  function periksa(tpl, u) {
    const { dikenal, asing } = ringkasPlaceholder(tpl, u), out = [];
    out.push(['warn', `Naskah memakai template unggahan "${u.nama}" (SHA-256 ${u.sha256.slice(0, 16)}…), bukan naskah bawaan aplikasi. Pastikan redaksinya sudah direviu Legal sebelum dipakai.`]);
    if (asing.length) out.push(['err', `Placeholder tidak dikenal di template (dibiarkan apa adanya): ${asing.map(p => '{{' + p + '}}').join(', ')}. Pakai kunci atau label isian menu ini${ringkasPlaceholder(tpl, u).ganda.length ? '; label yang dipakai lebih dari satu isian harus ditulis dengan kuncinya' : ''}.`]);
    out.push(['info', 'Nilai turunan (terbilang, tanggal berakhir, pajak, jumlah bersih) tidak tersedia sebagai placeholder; tulis dalam template bila perlu.']);
    if (!dikenal.length) out.push(['warn', 'Template tidak memuat placeholder isian sama sekali — isi formulir tidak akan masuk ke naskah.']);
    if (tpl.lampiran) out.push(['info', 'Lampiran KTP/foto tidak ikut tercetak pada template unggahan.']);
    return out;
  }
  /** Templat efektif: bawaan, atau bawaan dengan naskah dari template unggahan (pemeriksaan isian bawaan tetap berjalan). */
  function efektif(tpl, u) {
    if (!u) return tpl;
    return Object.assign({}, tpl, { html: undefined, htmlBagian: undefined, unggahan: u,
      // pemeriksaan isian bawaan tetap jalan; butir "ok" dibuang karena menyatakan sifat redaksi bawaan yang tidak dipakai di sini
      build: c => bangun(tpl, u, c), periksa: c => [...periksa(tpl, u), ...tpl.periksa(c).filter(x => x[0] !== 'ok')] });
  }
  return { baca, sahkan, sahkanSemua, efektif, isian, labelGanda, normal, ringkasPlaceholder, bangun, dariTeks, dariHtmlDocx, MAKS_DOCX, MAKS_TXT };
})();
