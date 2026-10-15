// Carga el inventario del Excel "Equipos en Inventario" (formato de Seven Medical, oct 2026).
// - Equipos en stock + sus transductores con serial (P/D y N/A se omiten).
// - "NOTAS DE ENTREGA ABIERTAS" no se cargan (no traen serial ni fechas): se listan al final.
// Uso: node scripts/cargar-inventario.js <archivo.xlsx> [--produccion]   (por defecto: emuladores)
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { initializeApp } from 'firebase/app';
import * as fs from 'firebase/firestore';
import { crearOperaciones } from '../public/js/operaciones.js';

const [archivo] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const PROD = process.argv.includes('--produccion');
if (!archivo) throw new Error('Falta el archivo .xlsx');

// ---------- Leer el Excel
const filas = XLSX.utils.sheet_to_json(XLSX.read(readFileSync(archivo)).Sheets.Hoja1 ?? Object.values(XLSX.read(readFileSync(archivo)).Sheets)[0], { header: 1, defval: '' })
  .map(r => r.map(c => String(c).trim()));
const iAbiertas = filas.findIndex(r => /notas de entrega abiertas/i.test(r[0]));
const iCab = filas.findIndex(r => r[0].toLowerCase() === 'modelo');
const stock = filas.slice(iCab + 1, iAbiertas < 0 ? undefined : iAbiertas).filter(r => r[0]);
const abiertas = iAbiertas < 0 ? [] : filas.slice(iAbiertas + 1).filter(r => r[0] && r[1]);

const MARCA = 'Mindray';
const descEquipo = m => /te air/i.test(m) ? 'Equipo de Ultrasonido tipo pocket' : 'Equipo de Ultrasonido';
const items = [];
const omitidos = [];
for (const [modelo, sn, ...transd] of stock) {
  items.push({ categoria: 'Equipo', marca: MARCA, modelo, descripcion: descEquipo(modelo), numero_serie: sn, cantidad: 1 });
  for (const t of transd.slice(0, 3)) {
    if (!t || /^(p\/d|n\/a)$/i.test(t)) { if (t) omitidos.push(`${modelo} ${sn || ''}: transductor ${t}`); continue; }
    const m = t.match(/^(.+?)\s+SN:?\s*(\S+)$/i);
    if (!m) { omitidos.push(`${modelo}: no entendí "${t}"`); continue; }
    items.push({ categoria: 'Accesorio', marca: MARCA, modelo: m[1].trim(), descripcion: 'Transductor', numero_serie: m[2], cantidad: 1, compatibles: modelo });
  }
}
const afuera = abiertas.map(([modelo, cliente]) => ({ modelo: modelo.trim(), cliente: cliente.replace(/^Dr\.(?=\S)/, 'Dr. ').trim() }));

console.log(`${stock.length} equipos en stock, ${items.filter(i => i.categoria === 'Accesorio').length} transductores con serial`);
afuera.forEach(a => console.log(`  no cargado (NE abierta sin serial): ${a.modelo} → ${a.cliente}`));
omitidos.forEach(o => console.log('  omitido:', o));

// ---------- Subir
const app = initializeApp(PROD ? { apiKey: 'AIzaSyBuNzvjgde79BJwEa9lRneP7oqeipYi324', projectId: 'seven-medical-st' }
  : { apiKey: 'demo-key', projectId: 'demo-seven-ne' });
const db = fs.getFirestore(app);
if (!PROD) fs.connectFirestoreEmulator(db, '127.0.0.1', 8085);
const ops = crearOperaciones(fs, db);
const r = await ops.importarItems({ quien: 'Carga inicial (Excel oct 2026)', filas: items.map((it, i) => ({ ...it, fila: i + 1 })) });
if (!r.ok) { console.error('Rechazado:', JSON.stringify(r.errores, null, 1)); process.exit(1); }
console.log(`importados: ${r.creados}`);

await fs.terminate(db);
process.exit(0);
