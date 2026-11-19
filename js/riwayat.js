/* Jejak audit kontrak: setiap simpan, ubah status, unduh Word, dan cetak dicatat sebagai entri berantai SHA-256.
   Entri = { w: waktu ISO, a: aksi, s: sidik isian (SHA-256 isi kontrak), p: hash entri sebelumnya, h: hash entri ini }.
   h = SHA-256(p + JSON kanonik {w, a, s}). Mengubah, menghapus, atau menyisipkan entri lama memutus rantai dan terdeteksi
   oleh verifikasi(); isian yang diubah di luar aplikasi terdeteksi karena sidik isian terakhir tidak cocok. */
'use strict';
window.RIWAYAT = (function () {
  const NOL = '0'.repeat(64);
  const HEX = /^[0-9a-f]{64}$/;
  // JSON dengan kunci terurut agar sidik tidak bergantung urutan properti
  function kanonik(x) {
    if (Array.isArray(x)) return '[' + x.map(kanonik).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + kanonik(x[k])).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  async function sha256Bytes(bytes) {
    if (!(window.crypto && crypto.subtle)) throw new Error('WebCrypto tidak tersedia; jejak audit tidak dapat dibuat');
    const b = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
  }
  const sha256 = teks => sha256Bytes(new TextEncoder().encode(teks));
  const isi = r => kanonik({ templat: r.templat, data: r.data || {}, lampiran: r.lampiran || null, status: r.status });
  const sidik = r => sha256(isi(r));
  async function tambah(r, aksi) {
    const daftar = Array.isArray(r.riwayat) ? r.riwayat.slice() : [];
    const p = daftar.length ? daftar[daftar.length - 1].h : NOL;
    const e = { w: new Date().toISOString(), a: String(aksi).slice(0, 200), s: await sidik(r), p };
    e.h = await sha256(p + kanonik({ w: e.w, a: e.a, s: e.s }));
    daftar.push(e);
    r.riwayat = daftar;
    return e;
  }
  /** { utuh, cocok, pesan }: utuh = rantai hash benar; cocok = isian sekarang sama dengan sidik entri terakhir. */
  async function verifikasi(r) {
    const d = Array.isArray(r.riwayat) ? r.riwayat : [];
    if (!d.length) return { utuh: false, cocok: false, pesan: 'Belum ada jejak audit (kontrak dibuat sebelum fitur ini).' };
    let p = NOL;
    for (let i = 0; i < d.length; i++) {
      const e = d[i];
      if (e.p !== p || e.h !== await sha256(e.p + kanonik({ w: e.w, a: e.a, s: e.s }))) return { utuh: false, cocok: false, pesan: `Rantai terputus pada entri ${i + 1} (${e.a}). Riwayat telah diubah di luar aplikasi.` };
      p = e.h;
    }
    const cocok = d[d.length - 1].s === await sidik(r);
    return { utuh: true, cocok, pesan: cocok ? `Utuh: ${d.length} entri, isian sesuai sidik terakhir.` : 'Rantai utuh, tetapi isian sekarang berbeda dari sidik terakhir — data diubah tanpa tercatat.' };
  }
  function bersihkan(x) {
    return (Array.isArray(x) ? x : []).slice(0, 5000).filter(e => e && typeof e === 'object' && typeof e.w === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(e.w) &&
      typeof e.a === 'string' && HEX.test(e.s) && HEX.test(e.p) && HEX.test(e.h)).map(e => ({ w: e.w, a: e.a.slice(0, 200), s: e.s, p: e.p, h: e.h }));
  }
  return { tambah, verifikasi, sidik, sha256, sha256Bytes, kanonik, bersihkan, NOL };
})();
