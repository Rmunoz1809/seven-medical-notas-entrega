// Genera "Clientes Seven Medical ST.xlsx" desde la lista de clientes que trae Seven Medical ST
// (para importarlos en Notas de Entrega → Clientes → Importar Excel). No sube nada.
import fs from 'node:fs';
import XLSX from 'xlsx';
const html = fs.readFileSync(new URL('../../Seven Medical/index.html', import.meta.url), 'utf8');
const m = html.match(/ZOHO_CLIENTS_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!m) throw new Error('No encontré ZOHO_CLIENTS_SEED');
const lista = JSON.parse(m[1]);
const vistos = new Set();
const filas = [['Nombre', 'Contacto', 'Teléfono', 'Email', 'RUC', 'Dirección', 'Origen']];
for (const c of lista) {
  const nombre = (c.empresa || c.nombre || '').trim();
  const k = nombre.toLowerCase();
  if (!nombre || vistos.has(k)) continue;
  vistos.add(k);
  filas.push([nombre, c.contacto || (c.nombre && c.nombre !== nombre ? c.nombre : ''), c.tel || c.telefono || '', c.email || '', c.rfc || '', c.dir || '', c.id]);
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Clientes');
fs.writeFileSync('Clientes Seven Medical ST.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log(`${filas.length - 1} clientes → Clientes Seven Medical ST.xlsx`);
