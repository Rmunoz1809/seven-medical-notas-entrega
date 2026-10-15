// Datos en tiempo real (solo lectura; las escrituras de inventario van por Cloud Functions)
import { db } from './fb.js';
import {
  collection, doc, onSnapshot, query, where, getDocs,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const datos = {
  items: [], notas: [], retiros: [], clientes: [],
  config: null, listo: false, error: null,
};
const porId = { items: new Map(), notas: new Map(), retiros: new Map(), clientes: new Map() };
export const item = id => porId.items.get(id);
export const nota = id => porId.notas.get(id);
export const retiro = id => porId.retiros.get(id);
export const cliente = id => porId.clientes.get(id);

const oyentes = new Set();
export const alCambiar = fn => oyentes.add(fn);
let aviso = null;
function avisar() {
  clearTimeout(aviso);
  aviso = setTimeout(() => oyentes.forEach(fn => fn()), 40);
}

let bajas = [];
export function suscribir(onError) {
  desuscribir();
  const pendientes = new Set(['items', 'notas', 'retiros', 'clientes', 'config']);
  const cargado = k => { pendientes.delete(k); if (!pendientes.size) datos.listo = true; avisar(); };
  const fallo = e => { datos.error = e; onError?.(e); };
  const lista = (nombre, coleccion, ordenar) => onSnapshot(collection(db, coleccion), snap => {
    const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (ordenar) arr.sort(ordenar);
    datos[nombre] = arr;
    porId[nombre] = new Map(arr.map(x => [x.id, x]));
    cargado(nombre);
  }, fallo);
  const porFecha = (a, b) => (b.numero_seq || 1e9) - (a.numero_seq || 1e9) || String(b.fecha_entrega || '').localeCompare(a.fecha_entrega || '');
  bajas = [
    lista('items', 'items', (a, b) => (a.categoria || '').localeCompare(b.categoria || '') || (a.modelo || a.descripcion || '').localeCompare(b.modelo || b.descripcion || '')),
    lista('notas', 'notas_entrega', porFecha),
    lista('retiros', 'notas_retiro', (a, b) => (b.numero_seq || 0) - (a.numero_seq || 0)),
    lista('clientes', 'clientes', (a, b) => (a.nombre || '').localeCompare(b.nombre || '')),
    onSnapshot(doc(db, 'config', 'general'), s => { datos.config = s.exists() ? s.data() : null; cargado('config'); }, fallo),
  ];
}
export function desuscribir() {
  bajas.forEach(b => b());
  bajas = [];
  Object.assign(datos, { items: [], notas: [], retiros: [], clientes: [], config: null, listo: false, error: null });
}

export async function movimientosDe(itemId) {
  const s = await getDocs(query(collection(db, 'movimientos'), where('item_id', '==', itemId)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.fecha?.toMillis?.() || 0) - (a.fecha?.toMillis?.() || 0));
}
