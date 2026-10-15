// Traspasa los clientes de Seven Medical ST (la lista que trae su index.html) a la colección "clientes".
// Omite los que ya existen por nombre. Uso: node scripts/importar-clientes-st.js [--produccion]
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, doc, writeBatch, serverTimestamp, terminate } from 'firebase/firestore';

const PROD = process.argv.includes('--produccion');
const html = readFileSync(new URL('../../Seven Medical/index.html', import.meta.url), 'utf8');
const m = html.match(/ZOHO_CLIENTS_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!m) throw new Error('No encontré la lista de clientes en Seven Medical ST');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const app = initializeApp(PROD ? { apiKey: 'AIzaSyBuNzvjgde79BJwEa9lRneP7oqeipYi324', projectId: 'seven-medical-st' }
  : { apiKey: 'demo-key', projectId: 'demo-seven-ne' });
const db = getFirestore(app);
if (!PROD) connectFirestoreEmulator(db, '127.0.0.1', 8085);

const existentes = new Set((await getDocs(collection(db, 'clientes'))).docs.map(d => norm(d.data().nombre)));
const nuevos = [];
for (const c of JSON.parse(m[1])) {
  const nombre = String(c.empresa || c.nombre || '').trim();
  if (!nombre || existentes.has(norm(nombre))) continue;
  existentes.add(norm(nombre));
  nuevos.push({
    nombre, contacto: String(c.contacto || (c.nombre && c.nombre !== nombre ? c.nombre : '')).trim(),
    telefono: String(c.tel || c.telefono || '').trim(), email: String(c.email || '').trim(),
    ruc: String(c.rfc || '').trim(), direccion: String(c.dir || '').trim(), notas: '', origen: `seven-st:${c.id}`,
  });
}
for (let i = 0; i < nuevos.length; i += 400) {
  const lote = writeBatch(db);
  for (const c of nuevos.slice(i, i + 400)) {
    lote.set(doc(collection(db, 'clientes')), { ...c, creado_en: serverTimestamp(), creado_por: 'Traspaso Seven Medical ST' });
  }
  await lote.commit();
}
console.log(`${nuevos.length} clientes traspasados (${existentes.size} en total)`);
await terminate(db);
process.exit(0);
