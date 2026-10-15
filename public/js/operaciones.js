// Operaciones de inventario y notas. Todo lo que mueve stock corre dentro de una transacción de
// Firestore: si dos personas emiten a la vez con el mismo ítem, solo una pasa.
// Funciona igual en el navegador y en Node (scripts y tests): recibe el módulo de Firestore.
import {
  CONDICIONES, ESTADOS, stockVacio, estadoDe, validarItem, pendienteLinea, estadoNE, numeroDoc, fechaValida,
} from './comun.js';

const CONFIG_DEFECTO = { prefijo_ne: 'NE-', prefijo_nr: 'NR-', digitos: 5 };
const MAX_PDF_MB = 6;
const TROZO = 900000; // caracteres base64 por documento (< 1 MB)

export const fallo = msg => new Error(msg);
const etiquetaItem = it => [it.modelo || it.descripcion, it.numero_serie ? `SN ${it.numero_serie}` : null].filter(Boolean).join(' ');
const quienEs = d => String(d?.quien || '').trim().slice(0, 60) || 'Sin nombre';

function moverStock(item, de, a, n) {
  if ((item.stock[de] || 0) < n) {
    throw fallo(`${etiquetaItem(item)}: solo hay ${item.stock[de] || 0} ${ESTADOS[de].toLowerCase()} (se pidieron ${n}).`);
  }
  item.stock[de] -= n;
  item.stock[a] = (item.stock[a] || 0) + n;
  item.estado = estadoDe(item.stock);
}

// Une líneas repetidas del mismo ítem y valida cantidades
function lineasPedidas(lineas) {
  const porItem = new Map();
  for (const l of lineas) {
    const n = Number(l.cantidad || 1);
    if (!l.item_id || !Number.isInteger(n) || n < 1) throw fallo('Línea inválida.');
    porItem.set(l.item_id, (porItem.get(l.item_id) || 0) + n);
  }
  return [...porItem].map(([item_id, cantidad]) => ({ item_id: String(item_id), cantidad }));
}

// Regla: solo se puede sacar lo que está en oficina
function revisarDisponibles(pedidas, items) {
  const err = [];
  for (const p of pedidas) {
    const it = items[p.item_id];
    const enOficina = it.stock?.oficina || 0;
    if (enOficina < p.cantidad) {
      err.push(enOficina === 0 ? `${etiquetaItem(it)} no está en oficina (${it.estado})` : `${etiquetaItem(it)}: solo hay ${enOficina} en oficina`);
    }
  }
  if (err.length) throw fallo(err.join('. '));
}

function lineaDesdeItem(it, cantidad, lineaId) {
  return {
    linea_id: lineaId, item_id: it.id, categoria: it.categoria, marca: it.marca || '', modelo: it.modelo || '',
    descripcion: it.descripcion || '', numero_serie: it.numero_serie || null, cantidad,
    devuelto_ok: 0, devuelto_danado: 0, faltante: 0, cerrado_sin_retorno: 0,
  };
}
const copiaCliente = c => ({ nombre: c.nombre || '', contacto: c.contacto || '', telefono: c.telefono || '' });

// Saca la NE de ne_abiertas del ítem cuando ya no le queda nada pendiente ni faltante en esa NE
function actualizarAbiertas(item, neId, lineas) {
  const queda = lineas.some(l => l.item_id === item.id && (pendienteLinea(l) > 0 || (l.faltante || 0) > 0));
  if (!queda) item.ne_abiertas = (item.ne_abiertas || []).filter(x => x !== neId);
}

function validarCabeceraNE(d) {
  const err = [];
  if (!d.cliente_id) err.push('Elige un cliente');
  if (!fechaValida(d.fecha_entrega)) err.push('Fecha de entrega inválida');
  if (!fechaValida(d.fecha_retorno_estimada)) err.push('Fecha estimada de retorno inválida');
  else if (fechaValida(d.fecha_entrega) && d.fecha_retorno_estimada < d.fecha_entrega) err.push('El retorno no puede ser antes de la entrega');
  if (!String(d.vendedor?.nombre || '').trim()) err.push('Indica el vendedor/responsable');
  if (!Array.isArray(d.lineas) || !d.lineas.length) err.push('Agrega al menos un ítem');
  if (err.length) throw fallo(err.join('. '));
}

export function crearOperaciones(fs, db) {
  const { collection, doc, runTransaction, writeBatch, getDoc, serverTimestamp, arrayUnion } = fs;
  const ref = (c, id) => (id ? doc(db, c, id) : doc(collection(db, c)));
  const refSerial = s => doc(db, 'seriales', encodeURIComponent(s));
  const refGeneral = doc(db, 'config', 'general');
  const refContadores = doc(db, 'config', 'contadores');

  const movimiento = (tx, datos) => tx.set(ref('movimientos'), {
    fecha: serverTimestamp(), nota: '', condicion: null, doc_tipo: null, doc_id: null, doc_numero: null, ...datos,
  });
  async function leerItems(tx, ids) {
    const unicos = [...new Set(ids)];
    const snaps = await Promise.all(unicos.map(id => tx.get(ref('items', id))));
    const out = {};
    for (const s of snaps) {
      if (!s.exists()) throw fallo(`El ítem ${s.id} no existe.`);
      out[s.id] = { id: s.id, ...s.data(), stock: { ...stockVacio(), ...s.data().stock } };
    }
    return out;
  }
  const escribirItem = (tx, item, quien) => {
    const { id, ...resto } = item;
    tx.set(ref('items', id), { ...resto, actualizado_en: serverTimestamp(), actualizado_por: quien });
  };
  const leerConfig = async tx => {
    const [g, c] = await Promise.all([tx.get(refGeneral), tx.get(refContadores)]);
    return { cfg: { ...CONFIG_DEFECTO, ...(g.exists() ? g.data() : {}) }, cont: c.exists() ? c.data() : { ne: 0, nr: 0 } };
  };

  // ------------------------------------------------------------ Ítems
  async function guardarItem(d) {
    const quien = quienEs(d);
    const { errores, item: datos } = validarItem(d);
    if (errores.length) throw fallo(errores.join('. '));
    return runTransaction(db, async tx => {
      const r = d.id ? ref('items', String(d.id)) : ref('items');
      let previo = null;
      if (d.id) {
        const s = await tx.get(r);
        if (!s.exists()) throw fallo('El ítem no existe.');
        previo = s.data();
      }
      const serialCambia = datos.serie_norm && datos.serie_norm !== previo?.serie_norm;
      if (serialCambia) {
        const s = await tx.get(refSerial(datos.serie_norm));
        if (s.exists() && s.data().item_id !== r.id) throw fallo(`Ya existe otro ítem con el número de serie ${datos.numero_serie}.`);
      }
      let stock;
      if (previo) {
        stock = { ...stockVacio(), ...previo.stock };
        const delta = datos.cantidad - previo.cantidad;
        if (stock.oficina + delta < 0) {
          throw fallo(`No puedes bajar la cantidad a ${datos.cantidad}: hay ${previo.cantidad - stock.oficina} unidades fuera de oficina.`);
        }
        stock.oficina += delta;
      } else {
        stock = { ...stockVacio(), oficina: datos.cantidad };
      }
      if (serialCambia) tx.set(refSerial(datos.serie_norm), { item_id: r.id });
      if (previo?.serie_norm && previo.serie_norm !== datos.serie_norm) tx.delete(refSerial(previo.serie_norm));
      const docItem = {
        ...datos, stock, estado: estadoDe(stock), faltante: previo?.faltante || null, ne_abiertas: previo?.ne_abiertas || [],
        actualizado_en: serverTimestamp(), actualizado_por: quien,
      };
      if (!previo) Object.assign(docItem, { creado_en: serverTimestamp(), creado_por: quien });
      tx.set(r, docItem, { merge: true });
      if (previo) {
        const cambios = ['categoria', 'marca', 'modelo', 'descripcion', 'numero_serie', 'cantidad', 'notas']
          .filter(k => String(previo[k] ?? '') !== String(datos[k] ?? ''));
        if (JSON.stringify(previo.compatibles || []) !== JSON.stringify(datos.compatibles)) cambios.push('compatibles');
        if (cambios.length) {
          movimiento(tx, { item_id: r.id, tipo: 'Edición', usuario: quien, cantidad: 0,
            estado_anterior: previo.estado, estado_nuevo: docItem.estado, nota: 'Cambió: ' + cambios.join(', ') });
        }
      } else {
        movimiento(tx, { item_id: r.id, tipo: 'Alta', usuario: quien, cantidad: datos.cantidad, estado_anterior: null, estado_nuevo: ESTADOS.oficina });
      }
      return { id: r.id };
    });
  }

  // Importación masiva (scripts): todo o nada por lotes de 100 ítems
  async function importarItems(d) {
    const quien = quienEs(d);
    const filas = Array.isArray(d.filas) ? d.filas : [];
    if (!filas.length) throw fallo('No hay filas para importar.');
    const errores = [];
    const validos = [];
    const vistos = new Map();
    filas.forEach((f, i) => {
      const fila = f.fila || i + 2;
      const { errores: e, item } = validarItem(f);
      if (item.serie_norm) {
        if (vistos.has(item.serie_norm)) e.push(`Serial ${item.numero_serie} repetido en el archivo (fila ${vistos.get(item.serie_norm)})`);
        else vistos.set(item.serie_norm, fila);
      }
      if (e.length) errores.push({ fila, errores: e });
      validos.push({ fila, item });
    });
    const conSerial = validos.filter(v => v.item.serie_norm);
    const existentes = await Promise.all(conSerial.map(v => getDoc(refSerial(v.item.serie_norm))));
    existentes.forEach((s, j) => {
      if (s.exists()) errores.push({ fila: conSerial[j].fila, errores: [`El serial ${conSerial[j].item.numero_serie} ya existe en el inventario`] });
    });
    if (errores.length) return { ok: false, errores: errores.sort((x, y) => x.fila - y.fila) };
    let creados = 0;
    for (let i = 0; i < validos.length; i += 100) {
      const lote = validos.slice(i, i + 100);
      await runTransaction(db, async tx => {
        const conSerial = lote.filter(v => v.item.serie_norm);
        const snaps = await Promise.all(conSerial.map(v => tx.get(refSerial(v.item.serie_norm))));
        const dup = snaps.map((s, j) => (s.exists() ? conSerial[j] : null)).filter(Boolean);
        if (dup.length) throw fallo('Ya existen en el inventario: ' + dup.map(v => `fila ${v.fila} (${v.item.numero_serie})`).join(', '));
        for (const { item } of lote) {
          const r = ref('items');
          const stock = { ...stockVacio(), oficina: item.cantidad };
          tx.set(r, { ...item, stock, estado: ESTADOS.oficina, faltante: null, ne_abiertas: [],
            creado_en: serverTimestamp(), creado_por: quien, actualizado_en: serverTimestamp(), actualizado_por: quien });
          if (item.serie_norm) tx.set(refSerial(item.serie_norm), { item_id: r.id });
          movimiento(tx, { item_id: r.id, tipo: 'Importación', usuario: quien, cantidad: item.cantidad,
            estado_anterior: null, estado_nuevo: ESTADOS.oficina, nota: 'Carga inicial desde Excel' });
        }
      });
      creados += lote.length;
    }
    return { ok: true, creados };
  }

  // ------------------------------------------------------------ Notas de Entrega
  async function guardarNE(d) {
    const quien = quienEs(d);
    validarCabeceraNE(d);
    const pedidas = lineasPedidas(d.lineas);
    return runTransaction(db, async tx => {
      const r = d.id ? ref('notas_entrega', String(d.id)) : ref('notas_entrega');
      const refCli = ref('clientes', String(d.cliente_id));
      const [neSnap, cliSnap] = await Promise.all([tx.get(r), tx.get(refCli)]);
      if (d.id && !neSnap.exists()) throw fallo('La nota no existe.');
      if (d.id && neSnap.data().estado !== 'Borrador') throw fallo('Solo se puede editar una nota en Borrador.');
      if (!cliSnap.exists()) throw fallo('El cliente no existe.');
      const items = await leerItems(tx, pedidas.map(p => p.item_id));
      revisarDisponibles(pedidas, items);
      const lineas = pedidas.map((p, i) => lineaDesdeItem(items[p.item_id], p.cantidad, `L${i + 1}`));
      const docNE = {
        numero: null, numero_seq: null, estado: 'Borrador',
        cliente_id: refCli.id, cliente: copiaCliente(cliSnap.data()),
        direccion: String(d.direccion || '').trim(),
        fecha_entrega: d.fecha_entrega, fecha_retorno_estimada: d.fecha_retorno_estimada,
        vendedor: { nombre: String(d.vendedor.nombre).trim(), telefono: String(d.vendedor.telefono || '').trim() },
        motivo: String(d.motivo || '').trim(),
        lineas, item_ids: lineas.map(l => l.item_id), nr_ids: [], anulacion: null,
        actualizado_en: serverTimestamp(), actualizado_por: quien,
      };
      if (!d.id) Object.assign(docNE, { creado_en: serverTimestamp(), creado_por: quien });
      tx.set(r, docNE, { merge: true });
      return { id: r.id };
    });
  }

  async function emitirNE(d) {
    const quien = quienEs(d);
    const id = String(d.id || '');
    return runTransaction(db, async tx => {
      const r = ref('notas_entrega', id);
      const neSnap = await tx.get(r);
      if (!neSnap.exists()) throw fallo('La nota no existe.');
      const ne = neSnap.data();
      if (ne.estado !== 'Borrador') throw fallo(`La nota ya está ${ne.estado}.`);
      const { cfg, cont } = await leerConfig(tx);
      const cliSnap = await tx.get(ref('clientes', ne.cliente_id));
      const pedidas = ne.lineas.map(l => ({ item_id: l.item_id, cantidad: l.cantidad }));
      const items = await leerItems(tx, pedidas.map(p => p.item_id));
      revisarDisponibles(pedidas, items);
      const seq = (cont.ne || 0) + 1;
      const numero = numeroDoc(cfg.prefijo_ne, seq, cfg.digitos);
      const lineas = pedidas.map((p, i) => lineaDesdeItem(items[p.item_id], p.cantidad, `L${i + 1}`));
      for (const l of lineas) {
        const it = items[l.item_id];
        const antes = it.estado;
        moverStock(it, 'oficina', 'demostracion', l.cantidad);
        it.ne_abiertas = [...new Set([...(it.ne_abiertas || []), id])];
        escribirItem(tx, it, quien);
        movimiento(tx, { item_id: it.id, tipo: 'Salida NE', usuario: quien, cantidad: l.cantidad, estado_anterior: antes,
          estado_nuevo: it.estado, doc_tipo: 'NE', doc_id: id, doc_numero: numero, nota: ne.cliente?.nombre || '' });
      }
      tx.update(r, {
        numero, numero_seq: seq, estado: 'Entregada', lineas,
        cliente: cliSnap.exists() ? copiaCliente(cliSnap.data()) : ne.cliente,
        emitido_en: serverTimestamp(), emitido_por: quien, actualizado_en: serverTimestamp(), actualizado_por: quien,
      });
      tx.set(refContadores, { ne: seq }, { merge: true });
      return { numero };
    });
  }

  async function emitirNR(d) {
    const quien = quienEs(d);
    const neId = String(d.ne_id || '');
    const persona = String(d.persona || '').trim();
    if (!fechaValida(d.fecha_retiro)) throw fallo('Fecha de retiro inválida.');
    if (!persona) throw fallo('Indica quién retira o recibe.');
    const pedidas = (Array.isArray(d.lineas) ? d.lineas : []).filter(l => Number(l.cantidad) > 0);
    if (!pedidas.length) throw fallo('Marca al menos un ítem que regresa.');
    const repetidas = new Set();
    for (const l of pedidas) {
      if (!CONDICIONES.includes(l.condicion)) throw fallo(`Condición inválida: ${l.condicion}`);
      if (!Number.isInteger(Number(l.cantidad))) throw fallo('Cantidad inválida.');
      if (repetidas.has(l.linea_id)) throw fallo('Una línea aparece dos veces en el retiro.');
      repetidas.add(l.linea_id);
    }
    return runTransaction(db, async tx => {
      const refNE = ref('notas_entrega', neId);
      const neSnap = await tx.get(refNE);
      if (!neSnap.exists()) throw fallo('La nota de entrega no existe.');
      const ne = neSnap.data();
      if (!['Entregada', 'Devuelta parcial'].includes(ne.estado)) throw fallo(`La nota de entrega está ${ne.estado}; no admite retiros.`);
      const { cfg, cont } = await leerConfig(tx);
      const lineasNE = ne.lineas.map(l => ({ ...l }));
      const porLinea = Object.fromEntries(lineasNE.map(l => [l.linea_id, l]));
      for (const p of pedidas) {
        const l = porLinea[p.linea_id];
        if (!l) throw fallo('Una línea del retiro no pertenece a esta nota de entrega.');
        const max = p.condicion === 'Faltante' ? pendienteLinea(l) : pendienteLinea(l) + (l.faltante || 0);
        if (Number(p.cantidad) > max) throw fallo(`${etiquetaItem(l)}: solo quedan ${max} afuera.`);
      }
      const items = await leerItems(tx, pedidas.map(p => porLinea[p.linea_id].item_id));
      const seq = (cont.nr || 0) + 1;
      const numero = numeroDoc(cfg.prefijo_nr, seq, cfg.digitos);
      const refNR = ref('notas_retiro');
      const lineasNR = [];
      for (const p of pedidas) {
        const l = porLinea[p.linea_id];
        const it = items[l.item_id];
        const antes = it.estado;
        const n = Number(p.cantidad);
        if (p.condicion !== 'Faltante') {
          // primero lo pendiente; si regresa algo marcado como faltante, deja de estarlo
          const deFaltante = Math.max(0, n - pendienteLinea(l));
          if (deFaltante) {
            l.faltante -= deFaltante;
            if (it.faltante?.ne_id === neId) it.faltante = it.faltante.cantidad - deFaltante > 0 ? { ...it.faltante, cantidad: it.faltante.cantidad - deFaltante } : null;
          }
        }
        if (p.condicion === 'OK') { moverStock(it, 'demostracion', 'oficina', n); l.devuelto_ok += n; }
        else if (p.condicion === 'Dañado') { moverStock(it, 'demostracion', 'servicio', n); l.devuelto_danado += n; }
        else {
          l.faltante = (l.faltante || 0) + n;
          it.faltante = {
            cantidad: (it.faltante?.ne_id === neId ? it.faltante.cantidad : 0) + n,
            ne_id: neId, ne_numero: ne.numero, nr_id: refNR.id, nr_numero: numero, desde: d.fecha_retiro,
          };
        }
        const observacion = String(p.observacion || '').trim();
        lineasNR.push({
          linea_id: l.linea_id, item_id: l.item_id, categoria: l.categoria, marca: l.marca, modelo: l.modelo,
          descripcion: l.descripcion, numero_serie: l.numero_serie, cantidad: n, condicion: p.condicion, observacion,
        });
        movimiento(tx, { item_id: it.id, tipo: 'Retiro', usuario: quien, cantidad: n, condicion: p.condicion,
          estado_anterior: antes, estado_nuevo: it.estado, doc_tipo: 'NR', doc_id: refNR.id, doc_numero: numero,
          nota: [ne.numero, observacion].filter(Boolean).join(' · ') });
      }
      for (const it of Object.values(items)) {
        actualizarAbiertas(it, neId, lineasNE);
        escribirItem(tx, it, quien);
      }
      tx.set(refNR, {
        numero, numero_seq: seq, ne_id: neId, ne_numero: ne.numero, cliente_id: ne.cliente_id, cliente: ne.cliente,
        direccion: ne.direccion || '', fecha_retiro: d.fecha_retiro, persona, notas: String(d.notas || '').trim(),
        lineas: lineasNR, estado: 'Emitida', firma_pdf: null, creado_en: serverTimestamp(), creado_por: quien,
      });
      tx.update(refNE, { lineas: lineasNE, estado: estadoNE(lineasNE), nr_ids: arrayUnion(refNR.id),
        actualizado_en: serverTimestamp(), actualizado_por: quien });
      tx.set(refContadores, { nr: seq }, { merge: true });
      return { id: refNR.id, numero };
    });
  }

  async function anularNE(d) {
    const quien = quienEs(d);
    const id = String(d.id || '');
    const motivo = String(d.motivo || '').trim();
    if (!motivo) throw fallo('Indica el motivo de la anulación.');
    return runTransaction(db, async tx => {
      const r = ref('notas_entrega', id);
      const s = await tx.get(r);
      if (!s.exists()) throw fallo('La nota no existe.');
      const ne = s.data();
      if (ne.estado === 'Anulada') throw fallo('La nota ya está anulada.');
      if ((ne.nr_ids || []).length) throw fallo('No se puede anular: la nota ya tiene retiros registrados.');
      if (!['Borrador', 'Entregada'].includes(ne.estado)) throw fallo(`No se puede anular una nota ${ne.estado}.`);
      if (ne.lineas.some(l => (l.cerrado_sin_retorno || 0) > 0 || (l.faltante || 0) > 0)) {
        throw fallo('No se puede anular: hay ítems ya resueltos (vendidos, de baja o faltantes).');
      }
      if (ne.estado === 'Entregada') {
        const items = await leerItems(tx, ne.lineas.map(l => l.item_id));
        for (const l of ne.lineas) {
          const it = items[l.item_id];
          const antes = it.estado;
          moverStock(it, 'demostracion', 'oficina', l.cantidad);
          it.ne_abiertas = (it.ne_abiertas || []).filter(x => x !== id);
          movimiento(tx, { item_id: it.id, tipo: 'Anulación NE', usuario: quien, cantidad: l.cantidad,
            estado_anterior: antes, estado_nuevo: it.estado, doc_tipo: 'NE', doc_id: id, doc_numero: ne.numero, nota: motivo });
        }
        for (const it of Object.values(items)) escribirItem(tx, it, quien);
      }
      tx.update(r, { estado: 'Anulada', anulacion: { motivo, por: quien, en: new Date().toISOString() },
        actualizado_en: serverTimestamp(), actualizado_por: quien });
      return { ok: true };
    });
  }

  // ------------------------------------------------------------ Venta
  // Marca un equipo (o accesorio) como vendido, junto con los transductores que se venden con él.
  // Sale de donde esté: si está afuera en una NE, cierra esa línea de la NE; si no, de oficina o servicio técnico.
  // "nuevos": accesorios que no estaban en el inventario; se crean ya como vendidos para que quede el registro.
  async function marcarVendido(d) {
    const quien = quienEs(d);
    const principal = String(d.item_id || '');
    const fechaVenta = d.fecha || new Date().toISOString().slice(0, 10);
    if (!fechaValida(fechaVenta)) throw fallo('Fecha de venta inválida.');
    const cliente = String(d.cliente || '').trim().slice(0, 200);
    const nota = String(d.nota || '').trim().slice(0, 500);
    const cantPrincipal = Number(d.cantidad || 1);
    if (!Number.isInteger(cantPrincipal) || cantPrincipal < 1) throw fallo('Cantidad inválida.');
    const acc = [...new Set((d.accesorios || []).map(String))].filter(id => id !== principal);
    const nuevos = (d.nuevos || []).map(x => validarItem({ categoria: 'Accesorio', marca: x.marca, modelo: x.modelo,
      descripcion: x.descripcion || 'Transductor', numero_serie: x.numero_serie, cantidad: 1 }));
    const errNuevos = nuevos.flatMap(v => v.errores);
    if (errNuevos.length) throw fallo('Transductor nuevo: ' + errNuevos.join('. '));
    return runTransaction(db, async tx => {
      const items = await leerItems(tx, [principal, ...acc]);
      const serialesNuevos = await Promise.all(nuevos.filter(v => v.item.serie_norm).map(v => tx.get(refSerial(v.item.serie_norm))));
      const dup = serialesNuevos.find(sn => sn.exists());
      if (dup) throw fallo(`Ya existe en el inventario un ítem con el serial ${decodeURIComponent(dup.id)}: márcalo desde la lista.`);
      // NE donde están afuera los ítems que se venden
      const neIds = [...new Set(Object.values(items).filter(it => it.stock.demostracion > 0).flatMap(it => it.ne_abiertas || []))];
      const nes = {};
      for (const id of neIds) {
        const sn = await tx.get(ref('notas_entrega', id));
        if (sn.exists()) nes[id] = { ...sn.data(), lineas: sn.data().lineas.map(l => ({ ...l })) };
      }
      const pc = items[principal];
      const docEquipo = `${pc.modelo || pc.descripcion}${pc.numero_serie ? ' SN ' + pc.numero_serie : ''}`;
      const venta = (extra = {}) => ({ fecha: fechaVenta, cliente, nota, por: quien, ...extra });
      const nombresAcc = [];

      const vender = (it, n, esAccesorio) => {
        const antes = it.estado;
        let restante = n;
        let neNumero = null;
        // 1) afuera en una NE: se cierra la línea como vendida al cliente
        for (const neId of it.ne_abiertas || []) {
          const ne = nes[neId];
          if (!ne || !restante) continue;
          for (const l of ne.lineas.filter(x => x.item_id === it.id)) {
            const afuera = pendienteLinea(l) + (l.faltante || 0);
            const k = Math.min(afuera, restante, it.stock.demostracion);
            if (!k) continue;
            const deFaltante = Math.max(0, k - pendienteLinea(l));
            l.faltante -= deFaltante;
            l.cerrado_sin_retorno = (l.cerrado_sin_retorno || 0) + k;
            moverStock(it, 'demostracion', 'vendido', k);
            if (it.faltante?.ne_id === neId) it.faltante = it.faltante.cantidad - deFaltante > 0 ? { ...it.faltante, cantidad: it.faltante.cantidad - deFaltante } : null;
            restante -= k;
            neNumero = ne.numero;
            ne.tocada = true;
          }
          actualizarAbiertas(it, neId, ne.lineas);
        }
        // 2) en oficina o en servicio técnico
        for (const de of ['oficina', 'servicio']) {
          const k = Math.min(restante, it.stock[de]);
          if (k) { moverStock(it, de, 'vendido', k); restante -= k; }
        }
        if (restante > 0) throw fallo(`${etiquetaItem(it)}: no hay ${n} unidad(es) disponibles para vender (${it.estado}).`);
        it.venta = venta(esAccesorio ? { con_equipo: principal, con_equipo_texto: docEquipo } : {});
        escribirItem(tx, it, quien);
        movimiento(tx, { item_id: it.id, tipo: 'Venta', usuario: quien, cantidad: n, estado_anterior: antes, estado_nuevo: it.estado,
          doc_tipo: neNumero ? 'NE' : null, doc_id: null, doc_numero: neNumero,
          nota: [cliente && `Cliente: ${cliente}`, esAccesorio && `Con ${docEquipo}`, nota].filter(Boolean).join(' · ') });
      };

      for (const id of acc) { vender(items[id], 1, true); nombresAcc.push(etiquetaItem(items[id])); }
      for (const { item } of nuevos) {
        const r = ref('items');
        const stock = { ...stockVacio(), vendido: 1 };
        tx.set(r, { ...item, stock, estado: ESTADOS.vendido, faltante: null, ne_abiertas: [],
          venta: venta({ con_equipo: principal, con_equipo_texto: docEquipo }),
          creado_en: serverTimestamp(), creado_por: quien, actualizado_en: serverTimestamp(), actualizado_por: quien });
        if (item.serie_norm) tx.set(refSerial(item.serie_norm), { item_id: r.id });
        movimiento(tx, { item_id: r.id, tipo: 'Venta', usuario: quien, cantidad: 1, estado_anterior: null, estado_nuevo: ESTADOS.vendido,
          nota: ['Agregado al vender', cliente && `Cliente: ${cliente}`, `Con ${docEquipo}`].filter(Boolean).join(' · ') });
        nombresAcc.push(etiquetaItem(item));
      }
      // el equipo principal guarda con qué se vendió
      pc.venta_accesorios = nombresAcc;
      vender(pc, cantPrincipal, false);
      for (const [id, ne] of Object.entries(nes)) {
        if (!ne.tocada) continue;
        tx.update(ref('notas_entrega', id), { lineas: ne.lineas, estado: estadoNE(ne.lineas), actualizado_en: serverTimestamp(), actualizado_por: quien });
      }
      return { ok: true, vendidos: 1 + acc.length + nuevos.length };
    });
  }

  // ------------------------------------------------------------ PDF firmado de la Nota de Entrega
  // Se guarda en Firestore en trozos (cada documento < 1 MB), igual que en Seven Medical ST.
  async function subirFirmaNE(d) {
    const quien = quienEs(d);
    const neId = String(d.ne_id || '');
    const b64 = String(d.pdf_b64 || '').replace(/^data:[^,]*,/, '');
    const nombre = String(d.nombre || 'firmado.pdf').slice(0, 120);
    if (!b64) throw fallo('Falta el archivo.');
    if (atob(b64.slice(0, 8)).slice(0, 5) !== '%PDF-') throw fallo('El archivo debe ser un PDF.');
    const tamano = Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
    if (tamano > MAX_PDF_MB * 1024 * 1024) throw fallo(`El PDF pesa más de ${MAX_PDF_MB} MB.`);
    const refNE = ref('notas_entrega', neId);
    const ne = await getDoc(refNE);
    if (!ne.exists()) throw fallo('La nota de entrega no existe.');
    if (!ne.data().numero || ne.data().estado === 'Anulada') throw fallo('Solo se adjunta el PDF firmado a una nota emitida.');
    const clave = `ne_${neId}`;
    const previo = await getDoc(ref('archivos', clave));
    const n = Math.ceil(b64.length / TROZO);
    const lote = writeBatch(db);
    for (let i = 0; i < n; i++) lote.set(ref('archivos', `${clave}__${i}`), { d: b64.slice(i * TROZO, (i + 1) * TROZO) });
    for (let i = n; i < (previo.exists() ? previo.data().n : 0); i++) lote.delete(ref('archivos', `${clave}__${i}`));
    const info = { nombre, tamano, subido_en: serverTimestamp(), subido_por: quien };
    lote.set(ref('archivos', clave), { n, ...info });
    lote.update(refNE, { firma_pdf: info });
    await lote.commit();
    return { ok: true };
  }

  return { guardarItem, importarItems, guardarNE, emitirNE, emitirNR, anularNE, marcarVendido, subirFirmaNE };
}
