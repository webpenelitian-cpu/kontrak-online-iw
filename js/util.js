/* Utilitas bersama: format tanggal, rupiah, terbilang, dan pembentuk blok naskah.
   Blok naskah: {t:'hc'|'h'|'p'|'pc'|'li'|'kv'|'table'|'sign'|'paraf'|'gap', ...}
   Teks memakai **tebal**, *miring*, dan [•] untuk isian kosong (tampil kuning, tercetak [•]). */
'use strict';
window.U = (function () {
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const PH = '[•]';

  // ---- tanggal (string "YYYY-MM-DD", tanpa zona waktu) ----
  function pd(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number), t = new Date(y, m - 1, d);
    return (t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d) ? t : null;
  }
  const iso = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
  const tglD = d => d ? `${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}` : PH;
  const hariTglD = d => d ? `${HARI[d.getDay()]}, ${tglD(d)}` : PH;
  const angkaD = d => d ? `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}` : PH;
  function addM(d, m) { const r = new Date(d); const day = r.getDate(); r.setDate(1); r.setMonth(r.getMonth() + m); const maks = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate(); r.setDate(Math.min(day, maks)); return r; }
  function addD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  // selisih a..b dalam bulan + hari (b eksklusif)
  function diffMD(a, b) {
    if (!a || !b || b < a) return null;
    let m = 0; while (addM(a, m + 1) <= b) m++;
    const d = Math.round((b - addM(a, m)) / 864e5);
    return { m, d, dec: m + d / 30 };
  }
  // masa kerja inklusif (mulai s.d. akhir termasuk hari terakhir)
  const masaInklusif = (a, b) => (a && b && b >= a) ? diffMD(a, addD(b, 1)) : null;
  // akhir = mulai + n satuan − 1 hari (Ps 1570 KUHPerdata; skill kontrak-sewa-rumah)
  function akhirMasa(mulai, n, satuan) {
    if (!mulai || !(n > 0)) return null;
    return addD(addM(mulai, satuan === 'tahun' ? n * 12 : n), -1);
  }
  function hariKerjaSetelah(d, n) { // tanpa memperhitungkan hari libur nasional
    let r = new Date(d), k = 0;
    while (k < n) { r = addD(r, 1); if (r.getDay() !== 0 && r.getDay() !== 6) k++; }
    return r;
  }

  // ---- angka ----
  const S = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  // satuan besar: [batas atas (eksklusif), pembagi, nama]; nilai ≥ 1e15 (atau bukan angka) ditulis apa adanya
  const SKALA_TB = [[1e6, 1000, ' ribu'], [1e9, 1e6, ' juta'], [1e12, 1e9, ' miliar'], [1e15, 1e12, ' triliun']];
  const sisaTb = x => (x ? ' ' + tb(x) : '');
  function tb(n) {
    n = Math.floor(n);
    if (n < 12) return S[n];
    if (n < 20) return tb(n - 10) + ' belas';
    if (n < 100) return tb(n / 10) + ' puluh' + sisaTb(n % 10);
    if (n < 200) return 'seratus' + sisaTb(n - 100);
    if (n < 1000) return tb(n / 100) + ' ratus' + sisaTb(n % 100);
    if (n < 2000) return 'seribu' + sisaTb(n - 1000);
    const s = SKALA_TB.find(x => n < x[0]);
    return s ? tb(n / s[1]) + s[2] + sisaTb(n % s[1]) : String(n);
  }
  const terbilangAngka = n => { n = Math.round(Number(n) || 0); return n ? tb(n).trim() : 'nol'; };
  const kapital = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const judulKata = s => String(s).split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  const terbilangRp = n => kapital(terbilangAngka(n)) + ' rupiah';
  // Satu pemformat dipakai ulang: toLocaleString membuat ulang data lokal di setiap panggilan (500 baris Database: 133 ms).
  // Hasilnya identik (opsi bawaan sama). Rujukan: mdn/content files/en-us/web/javascript/reference/global_objects/number/tolocalestring/index.md (Performance).
  const ANGKA_ID = new Intl.NumberFormat('id-ID');
  const rp = n => 'Rp' + ANGKA_ID.format(Math.round(Number(n) || 0));
  const ribuan = n => ANGKA_ID.format(Math.round(Number(n) || 0));
  const angkaTb = n => `${n} (${terbilangAngka(n)})`;
  function num(v) { const x = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; }

  // ---- teks ----
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  // isian pengguna tidak boleh membawa penanda format (**, *) agar tidak mengubah tampilan naskah
  // (termasuk __garis bawah__: "__" disisipi spasi nol-lebar agar tidak menjadi penanda)
  const bersih = s => String(s ?? '').replace(/\*/g, '∗').replace(/_(?=_)/g, '_​').trim();
  // Penanda versi untuk aset yang dimuat belakangan (situs online: <meta name="versi-aset"> = hash isi JS/CSS dari alat/bangun_online.js),
  // agar setelah terbit peramban tidak memakai salinan lama dari cache GitHub Pages (max-age 600). Lokal (file://): tanpa meta, tanpa ?v=.
  const urlAset = src => {
    const m = typeof document !== 'undefined' && document.querySelector('meta[name="versi-aset"]');
    return m && m.content ? `${src}?v=${encodeURIComponent(m.content)}` : src;
  };

  // ---- blok ----
  const B = {
    HC: x => ({ t: 'hc', x }), H: x => ({ t: 'h', x }), P: (x, adj) => ({ t: 'p', x, adj }), PC: x => ({ t: 'pc', x }),
    LI: (n, x, lvl = 1, adj) => ({ t: 'li', n, x, lvl, adj }), KV: (rows, n) => ({ t: 'kv', rows, n }), TB: (rows, head = true) => ({ t: 'table', rows, head }),
    SG: cols => ({ t: 'sign', cols }), GAP: () => ({ t: 'gap' }), PARAF: cols => ({ t: 'paraf', cols }), PB: () => ({ t: 'pb' })
  };

  return { BLN, HARI, ROMAWI, PH, pd, iso, tglD, hariTglD, angkaD, addM, addD, diffMD, masaInklusif, akhirMasa, hariKerjaSetelah,
    tb, terbilangAngka, terbilangRp, kapital, judulKata, rp, ribuan, angkaTb, num, esc, bersih, urlAset, B };
})();
