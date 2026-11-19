/* Gerbang versi online Aplikasi Kontrak (GitHub Pages). WAJIB LOGIN.
   Situs publik hanya memuat mesin umum (tanpa isi turunan dokumen internal). Setelah login Google dan akun ada di daftar izin
   (Firestore izin/{email}), kode & naskah rahasia dibaca dari Firestore konten/{nama}, DIVERIFIKASI SHA-256-nya terhadap manifest
   yang ikut diterbitkan (konfigurasi-online.js), lalu dijalankan berurutan sebagai skrip/stylesheet blob. Isi yang tidak cocok
   tidak pernah dijalankan. Data kontrak tetap lokal di peramban (IndexedDB + enkripsi aplikasi).
   Admin (pemilik proyek) dapat mengunggah konten (berkas harus cocok dengan manifest) dan mengelola daftar izin. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const K = window.KONTRAK_ONLINE; // { firebase, konten: [{id, jenis, sha256, awal}] } dibentuk alat/bangun_online.js — tanpa nama berkas & tanpa email
const app = initializeApp(window.KONTRAK_FIREBASE), auth = getAuth(app), db = getFirestore(app);
const $ = s => document.querySelector(s);
const el = (tag, sifat = {}, ...anak) => { const e = document.createElement(tag); Object.assign(e, sifat); e.append(...anak); return e; };
const gerbang = $('#gerbang'), pesan = t => { $('#gerbangPesan').textContent = t; };

const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async teks => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(teks)));
// ID konten buram = 20 hex pertama SHA-256 dari nama berkas (situs publik tidak memuat nama berkas rahasia)
const idKonten = async nama => (await sha256('kontrak:' + nama.replace(/^.*\//, '').toLowerCase())).slice(0, 20);

// ---------- membaca & menjalankan konten ----------
async function bacaKonten(k) {
  const meta = await getDoc(doc(db, 'konten', k.id));
  if (!meta.exists()) return null;
  const n = meta.data().bagian, bagian = [];
  for (let i = 0; i < n; i++) {
    const b = await getDoc(doc(db, 'konten', k.id, 'bagian', String(i)));
    if (!b.exists()) return null;
    bagian.push(b.data().isi);
  }
  const teks = bagian.join('');
  return (await sha256(teks)) === k.sha256 ? teks : null; // tidak cocok manifest = tidak dijalankan
}
function pasangBlob(k, teks) {
  return new Promise((ok, gagal) => {
    const url = URL.createObjectURL(new Blob([teks], { type: k.jenis === 'css' ? 'text/css' : 'text/javascript' }));
    const e = k.jenis === 'css' ? el('link', { rel: 'stylesheet', href: url }) : el('script', { src: url });
    e.onload = () => { URL.revokeObjectURL(url); ok(); };
    e.onerror = () => gagal(new Error('konten ' + k.id + ' gagal dijalankan'));
    document.head.append(e);
  });
}
const terpasang = new Map();
function muatK(k) {
  if (!terpasang.has(k.id)) terpasang.set(k.id, bacaKonten(k).then(t => {
    if (t === null) { terpasang.delete(k.id); throw new Error('konten ' + k.id + ' belum diunggah atau tidak cocok dengan versi terbit'); }
    return pasangBlob(k, t);
  }));
  return terpasang.get(k.id);
}
async function muat(nama) {
  const id = await idKonten(nama), k = K.konten.find(x => x.id === id);
  if (!k) throw new Error('konten tidak dikenal: ' + nama);
  return muatK(k);
}
window.KONTRAK_MUAT_SKRIP = nama => muat(nama); // data besar yang dimuat malas oleh aplikasi

// ---------- panel admin ----------
async function panelAdmin(user, kurang) {
  const daftar = el('ul', { className: 'ph-daftar' }), surel = el('input', { type: 'email', id: 'izinBaru', placeholder: 'nama@domain', autocomplete: 'off' });
  const muatIzin = async () => {
    const s = await getDocs(collection(db, 'izin'));
    daftar.replaceChildren(...s.docs.map(d => el('li', {}, d.id + ' ', d.id === user.email ? '' : el('button', {
      type: 'button', className: 'small danger', textContent: 'Cabut', onclick: async () => { if (confirm('Cabut izin ' + d.id + '?')) { await deleteDoc(doc(db, 'izin', d.id)); muatIzin(); } } }))));
  };
  const berkas = el('input', { type: 'file', multiple: true, accept: '.js,.css', id: 'kontenBerkas' });
  const status = el('p', { className: 'note', id: 'kontenStatus' });
  berkas.onchange = async () => {
    let n = 0;
    for (const f of berkas.files) {
      const id = await idKonten(f.name), k = K.konten.find(x => x.id === id), teks = await f.text();
      if (!k) continue;
      if ((await sha256(teks)) !== k.sha256) { status.textContent = `${f.name}: isi berbeda dengan versi terbit (commit & terbitkan dulu) — dilewati.`; continue; }
      const enc = new TextEncoder(), bagian = []; // pecah ≤ 900 KB UTF-8 per dokumen (batas dokumen Firestore 1 MiB)
      for (let i = 0; i < teks.length;) { let j = Math.min(teks.length, i + 300000); while (enc.encode(teks.slice(i, j)).length > 900000) j = i + Math.floor((j - i) / 2); bagian.push(teks.slice(i, j)); i = j; }
      for (let i = 0; i < bagian.length; i++) await setDoc(doc(db, 'konten', k.id, 'bagian', String(i)), { isi: bagian[i] });
      await setDoc(doc(db, 'konten', k.id), { bagian: bagian.length, sha256: k.sha256, diunggah: serverTimestamp() });
      n++; status.textContent = `${n} berkas konten diunggah…`;
    }
    status.textContent = `${n} berkas konten diunggah. Muat ulang halaman untuk memakai aplikasi.`;
  };
  const tambah = el('button', { type: 'button', textContent: 'Izinkan email', onclick: async () => {
    const e = surel.value.trim().toLowerCase();
    if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(e)) { alert('Email tidak sah.'); return; }
    await setDoc(doc(db, 'izin', e), { ditambahkan: serverTimestamp(), oleh: user.email }); surel.value = ''; muatIzin();
  } });
  gerbang.append(el('section', { className: 'panel admin-online' },
    el('h2', { textContent: 'Admin' }),
    el('p', { className: 'note', textContent: kurang ? `${kurang} berkas konten belum diunggah untuk versi terbit ini. Pilih semua berkas .js dan .css aplikasi dari repo privat di komputer pemilik; hanya yang cocok dengan manifest yang diunggah.` : 'Semua konten sesuai versi terbit.' }),
    el('label', { className: 'f', textContent: 'Unggah konten (.js/.css dari repo privat) ' }, berkas), status,
    el('h3', { textContent: 'Daftar email yang diizinkan' }), daftar,
    el('div', { className: 'actions' }, el('label', { className: 'f', textContent: 'Email ' }, surel), tambah)));
  muatIzin();
}

// ---------- alur masuk ----------
// izin akun: admin (dikenali dari aturan Firestore — hanya admin boleh melihat daftar izin; tak ada email admin di situs publik)
// otomatis dimasukkan ke daftar izin; akun lain harus sudah ada di daftar
async function periksaIzin(user) {
  const admin = await getDocs(collection(db, 'izin')).then(() => true, () => false);
  const ada = () => getDoc(doc(db, 'izin', user.email)).then(d => d.exists(), () => false);
  let izin = await ada();
  if (admin && !izin) { await setDoc(doc(db, 'izin', user.email), { ditambahkan: serverTimestamp(), oleh: user.email }); izin = await ada(); }
  return { admin, izin };
}
async function muatAwal() { // jumlah konten awal yang gagal dimuat/diverifikasi
  let kurang = 0;
  for (const k of K.konten.filter(x => x.awal)) {
    try { await muatK(k); } catch { kurang++; }
  }
  return kurang;
}
async function setelahMasuk(user) {
  pesan(`Masuk sebagai ${user.email}. Memeriksa izin…`);
  const { admin, izin } = await periksaIzin(user);
  if (!izin) { pesan(`Akun ${user.email} belum diizinkan memakai aplikasi ini. Hubungi pemilik aplikasi.`); return; }
  pesan('Memuat aplikasi…');
  const kurang = await muatAwal();
  if (kurang) {
    pesan(admin ? 'Konten aplikasi belum diunggah untuk versi ini.' : 'Aplikasi sedang diperbarui pemiliknya. Coba lagi nanti.');
    if (admin) panelAdmin(user, kurang);
    return;
  }
  document.body.classList.remove('online-terkunci');
  gerbang.hidden = true;
  if (admin) { // pintasan admin tetap tersedia lewat tombol kecil di kepala halaman
    $('#onlineAkun').append(el('button', { type: 'button', className: 'small', textContent: 'Admin', onclick: () => { gerbang.hidden = false; document.body.classList.add('online-terkunci'); if (!$('.admin-online')) panelAdmin(user, 0); } }));
  }
}
$('#gerbangMasuk').onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { pesan('Gagal masuk: ' + (e.code || e.message)); }
};
$('#gerbangKeluar').onclick = () => signOut(auth).then(() => location.reload());
onAuthStateChanged(auth, user => {
  $('#gerbangMasuk').hidden = !!user; $('#gerbangKeluar').hidden = !user;
  $('#onlineAkun').textContent = user ? user.email + ' ' : '';
  if (user) $('#onlineAkun').append(el('button', { type: 'button', className: 'small', textContent: 'Keluar', onclick: () => signOut(auth).then(() => location.reload()) }));
  if (user) setelahMasuk(user).catch(e => pesan('Gagal memuat: ' + e.message)); else pesan('Silakan masuk dengan akun Google yang sudah diizinkan.');
});
