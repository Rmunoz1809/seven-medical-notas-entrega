// Tests de las operaciones (transacciones) y de las reglas contra el emulador de Firestore.
// Ejecutar: bash scripts/test.sh
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import * as fs from 'firebase/firestore';
import { crearOperaciones } from '../public/js/operaciones.js';

const { getFirestore, terminate, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, getDocs, collection, query, where } = fs;
const PROYECTO = 'demo-seven-ne';
const app = initializeApp({ apiKey: 'fake', projectId: PROYECTO });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8085);
const ops = crearOperaciones(fs, db);
const f = nombre => data => ops[nombre]({ ...data, quien: 'Test' });
const fallaCon = async (p, re) => assert.rejects(p, e => { assert.match(e.message, re); return true; });

async function limpiarFirestore() {
  await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
}
const item = async id => (await getDoc(doc(db, 'items', id))).data();
const ne = async id => (await getDoc(doc(db, 'notas_entrega', id))).data();

after(async () => { await terminate(db); await deleteApp(app); setTimeout(() => process.exit(process.exitCode || 0), 200).unref(); });

let cliente;
const base = {
  categoria: 'Equipo', marca: 'Mindray', modelo: 'MX6 3P', descripcion: 'Equipo de Ultrasonido',
};
before(async () => {
  await limpiarFirestore();
  cliente = 'cli1';
  await setDoc(doc(db, 'clientes', cliente), { nombre: 'Congreso CONAIB', direccion: 'Hotel Hilton Panamá' });
});

const datosNE = lineas => ({
  cliente_id: cliente, direccion: 'Hotel Hilton', fecha_entrega: '2026-10-09', fecha_retorno_estimada: '2026-10-10',
  vendedor: { nombre: 'Vendedor Prueba', telefono: '6000-0000' }, motivo: 'Demo', lineas,
});

test('alta de ítems: serial único y validaciones', async () => {
  const { id } = await f('guardarItem')({ ...base, numero_serie: 'SF6-66000470' });
  assert.equal((await item(id)).estado, 'En oficina');
  await fallaCon(f('guardarItem')({ ...base, numero_serie: 'sf6-66000470 ' }), /Ya existe otro ítem/);
  await fallaCon(f('guardarItem')({ ...base, modelo: '', descripcion: '', numero_serie: 'X1' }), /modelo o descripción/);
  await fallaCon(f('guardarItem')({ ...base, categoria: 'Repuesto', numero_serie: 'X1' }), /Categoría inválida/);
  await fallaCon(f('guardarItem')({ ...base, categoria: 'Accesorio', numero_serie: 'X1', cantidad: 3 }), /cantidad 1/);
});

test('emisión concurrente: el mismo ítem solo sale en una NE', async () => {
  const { id: eq } = await f('guardarItem')({ ...base, modelo: 'MX7', numero_serie: 'HQ1-66010222' });
  const a = await f('guardarNE')(datosNE([{ item_id: eq, cantidad: 1 }]));
  const b = await f('guardarNE')(datosNE([{ item_id: eq, cantidad: 1 }]));
  const r = await Promise.allSettled([f('emitirNE')({ id: a.id }), f('emitirNE')({ id: b.id })]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1, 'solo una emisión debe pasar');
  assert.match(r.find(x => x.status === 'rejected').reason.message, /no está en oficina/);
  assert.equal((await item(eq)).estado, 'En demostración');
  // y no se puede agregar a otra NE
  await fallaCon(f('guardarNE')(datosNE([{ item_id: eq, cantidad: 1 }])), /no está en oficina/);
});

test('NR parcial → Devuelta parcial; Dañado → servicio; Faltante marcado; final → Devuelta', async () => {
  const ids = [];
  for (const [modelo, sn] of [['L13-3m', 'BR8S53084303'], ['C5-2m', 'BR7R53139827'], ['Air Capsule', 'NA7C58002754']]) {
    ids.push((await f('guardarItem')({ ...base, categoria: 'Accesorio', modelo, numero_serie: sn, compatibles: 'MX6 3P' })).id);
  }
  const tablet = (await f('guardarItem')({ categoria: 'Accesorio', descripcion: 'Tablet HONOR y cargador', cantidad: 3 })).id;
  const { id } = await f('guardarNE')(datosNE([...ids.map(item_id => ({ item_id, cantidad: 1 })), { item_id: tablet, cantidad: 2 }]));
  const { numero } = await f('emitirNE')({ id });
  assert.match(numero, /^NE-\d{5}$/);
  let t = await item(tablet);
  assert.deepEqual([t.stock.oficina, t.stock.demostracion, t.estado], [1, 2, 'Mixto']);

  const L = (await ne(id)).lineas;
  const nr1 = await f('emitirNR')({ ne_id: id, fecha_retiro: '2026-10-11', persona: 'Jorge', lineas: [
    { linea_id: L[0].linea_id, cantidad: 1, condicion: 'OK' },
    { linea_id: L[1].linea_id, cantidad: 1, condicion: 'Dañado', observacion: 'cable roto' },
    { linea_id: L[3].linea_id, cantidad: 1, condicion: 'OK' },
  ] });
  assert.match(nr1.numero, /^NR-\d{5}$/);
  assert.equal((await ne(id)).estado, 'Devuelta parcial');
  assert.equal((await item(ids[0])).estado, 'En oficina');
  assert.equal((await item(ids[1])).estado, 'En servicio técnico');
  t = await item(tablet);
  assert.deepEqual([t.stock.oficina, t.stock.demostracion], [2, 1]);
  // no se puede devolver más de lo pendiente
  await fallaCon(f('emitirNR')({ ne_id: id, fecha_retiro: '2026-10-11', persona: 'J', lineas: [
    { linea_id: L[0].linea_id, cantidad: 1, condicion: 'OK' }] }), /pendientes/);

  await f('emitirNR')({ ne_id: id, fecha_retiro: '2026-10-12', persona: 'Jorge', lineas: [
    { linea_id: L[2].linea_id, cantidad: 1, condicion: 'Faltante' },
    { linea_id: L[3].linea_id, cantidad: 1, condicion: 'OK' },
  ] });
  const cap = await item(ids[2]);
  assert.equal(cap.estado, 'En demostración');
  assert.equal(cap.faltante.cantidad, 1);
  assert.equal((await ne(id)).estado, 'Devuelta parcial', 'con faltante la NE sigue abierta');
  // con NR no se puede anular
  await fallaCon(f('anularNE')({ id, motivo: 'error' }), /notas de retiro/);
  await f('resolverAfuera')({ ne_id: id, linea_id: L[2].linea_id, accion: 'aparecio', cantidad: 1 });
  assert.equal((await ne(id)).estado, 'Devuelta');
  const capFin = await item(ids[2]);
  assert.equal(capFin.estado, 'En oficina');
  assert.equal(capFin.faltante, null);
  assert.deepEqual(capFin.ne_abiertas, []);
  const movs = await getDocs(query(collection(db, 'movimientos'), where('item_id', '==', ids[2])));
  assert.deepEqual(movs.docs.map(d => d.data().tipo).sort(), ['Alta', 'Resolución', 'Retorno NR', 'Salida NE']);
});

test('PDF firmado de la NR: solo PDF y queda registrado', async () => {
  const { id: eq } = await f('guardarItem')({ ...base, modelo: 'MX3', numero_serie: 'SQ6-66002716' });
  const { id } = await f('guardarNE')(datosNE([{ item_id: eq, cantidad: 1 }]));
  await f('emitirNE')({ id });
  const L = (await ne(id)).lineas;
  const nr = await f('emitirNR')({ ne_id: id, fecha_retiro: '2026-10-15', persona: 'Jorge', lineas: [{ linea_id: L[0].linea_id, cantidad: 1, condicion: 'OK' }] });
  await fallaCon(f('subirFirmaNR')({ nr_id: nr.id, nombre: 'x.pdf', pdf_b64: Buffer.from('hola').toString('base64') }), /debe ser un PDF/);
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1_500_000, 65)]).toString('base64'); // > 1 trozo
  await f('subirFirmaNR')({ nr_id: nr.id, nombre: 'NR firmada.pdf', pdf_b64: pdf });
  const doc1 = (await getDoc(doc(db, 'notas_retiro', nr.id))).data();
  assert.equal(doc1.firma_pdf.nombre, 'NR firmada.pdf');
  const meta = (await getDoc(doc(db, 'archivos', `nr_${nr.id}`))).data();
  const partes = await Promise.all(Array.from({ length: meta.n }, (_, i) => getDoc(doc(db, 'archivos', `nr_${nr.id}__${i}`))));
  assert.equal(partes.map(p => p.data().d).join(''), pdf);
});

test('anular NE sin NR devuelve el stock; borrador anulado no numera', async () => {
  const { id: eq } = await f('guardarItem')({ ...base, modelo: 'TE Air e5M', numero_serie: 'DX2A5B015929' });
  const { id } = await f('guardarNE')(datosNE([{ item_id: eq, cantidad: 1 }]));
  await f('emitirNE')({ id });
  await fallaCon(f('anularNE')({ id, motivo: '' }), /motivo/);
  await f('anularNE')({ id, motivo: 'Hecha por error' });
  assert.equal((await ne(id)).estado, 'Anulada');
  assert.equal((await item(eq)).estado, 'En oficina');
  await fallaCon(f('emitirNE')({ id }), /Anulada/);
  const borr = await f('guardarNE')(datosNE([{ item_id: eq, cantidad: 1 }]));
  await f('anularNE')({ id: borr.id, motivo: 'no va' });
  assert.equal((await ne(borr.id)).numero, null);
});

test('importación: rechaza seriales duplicados, filas vacías y categorías inválidas', async () => {
  const r = await f('importarItems')({ filas: [
    { fila: 2, categoria: 'Equipo', modelo: 'Resona N9', numero_serie: 'RN9-1' },
    { fila: 3, categoria: 'Accesorio', modelo: 'L9-3U', numero_serie: 'RN9-1' },
    { fila: 4, categoria: 'Accesorio', modelo: '', descripcion: '', numero_serie: 'X9' },
    { fila: 5, categoria: 'Consumible', modelo: 'Gel' },
    { fila: 6, categoria: 'Equipo', modelo: 'MX6 3P', numero_serie: 'SF6-66000470' },
  ] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errores.map(e => e.fila), [3, 4, 5, 6]);
  const ok = await f('importarItems')({ filas: [
    { categoria: 'Equipo', marca: 'Mindray', modelo: 'Resona N9', numero_serie: 'RN9-1' },
    { categoria: 'accesorio', marca: 'Mindray', modelo: 'L9-3U', numero_serie: 'L93U-1', compatibles: 'Resona N9' },
  ] });
  assert.deepEqual(ok, { ok: true, creados: 2 });
});

test('reglas: no se borra nada y los registros deben tener forma válida', async () => {
  const algunItem = (await getDocs(collection(db, 'items'))).docs[0];
  await assert.rejects(deleteDoc(algunItem.ref), /PERMISSION_DENIED|permission/i);
  const algunaNE = (await getDocs(collection(db, 'notas_entrega'))).docs[0];
  await assert.rejects(deleteDoc(algunaNE.ref), /PERMISSION_DENIED|permission/i);
  await assert.rejects(setDoc(doc(db, 'items', 'raro'), { estado: 'X' }), /PERMISSION_DENIED|permission/i);
  await assert.rejects(setDoc(doc(db, 'config', 'general'), { prefijo_ne: 'X' }), /PERMISSION_DENIED|permission/i);
  const nr = (await getDocs(collection(db, 'notas_retiro'))).docs[0];
  await assert.rejects(setDoc(nr.ref, { persona: 'otro' }, { merge: true }), /PERMISSION_DENIED|permission/i);
});
