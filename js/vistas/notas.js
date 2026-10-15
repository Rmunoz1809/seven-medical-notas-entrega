import { llamar, db } from '../fb.js?v=9cf195a';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { datos, item, nota, cliente, retiro } from '../datos.js?v=9cf195a';
import { pendienteLinea, ESTADO_VISIBLE } from '../comun.js?v=9cf195a';
import { $, $$, esc, fecha, fechaHora, chip, abrirModal, toast, confirmar, conBoton, autocompletar, coincide, hoyISO, sumarDias, diasEntre } from '../ui.js?v=9cf195a';
import { vencida, ABIERTAS } from './dashboard.js?v=9cf195a';
import { formCliente } from './clientes.js?v=9cf195a';
import { pdfNE } from '../pdf.js?v=9cf195a';

const filtro = { estado: 'Abiertas', q: '' };

export function vistaNotas(_, vista) {
  $('#titulo').textContent = 'Notas de Entrega';
  $('#acciones').innerHTML = '<a class="btn btn-primary" href="#/ne/nueva">+ Nueva NE</a>';
  const estados = ['Abiertas', 'Cerradas', 'Borradores', 'Anuladas', 'Todas'];
  vista.innerHTML = `<div class="card">
    <div class="filtros">
      <input type="search" id="f-q" placeholder="Buscar número, cliente o serial" value="${esc(filtro.q)}">
      <select id="f-est">${estados.map(e => `<option ${e === filtro.estado ? 'selected' : ''}>${e}</option>`).join('')}</select>
    </div>
    <div class="tabla-wrap"><table>
      <thead><tr><th>Número</th><th>Cliente / lugar</th><th>Entrega</th><th>Retorno est.</th><th class="num ocultar-movil">Ítems</th><th>Estado</th></tr></thead>
      <tbody id="ne-filas"></tbody></table></div></div>`;
  const pintar = () => {
    const lista = datos.notas.filter(n =>
      (filtro.estado === 'Todas' || filtro.estado.slice(0, -1) === ESTADO_VISIBLE[n.estado] || (filtro.estado === 'Borradores' && n.estado === 'Borrador'))
      && (!filtro.q || coincide(`${n.numero} ${n.cliente?.nombre} ${n.direccion} ${n.lineas.map(l => l.numero_serie).join(' ')}`, filtro.q)));
    $('#ne-filas').innerHTML = lista.map(n => `<tr class="click ${vencida(n) ? 'vencida' : ''}" onclick="location.hash='#/ne/${n.id}'">
      <td class="nowrap"><b>${esc(n.numero || 'Borrador')}</b></td>
      <td>${esc(n.cliente?.nombre)}<div class="sub-linea">${esc(n.direccion)}</div></td>
      <td class="nowrap">${fecha(n.fecha_entrega)}</td>
      <td class="nowrap">${fecha(n.fecha_retorno_estimada)}${vencida(n) ? '<div>' + chip('Vencida', 'rojo') + '</div>' : ''}</td>
      <td class="num ocultar-movil">${n.lineas.reduce((t, l) => t + l.cantidad, 0)}</td>
      <td>${chip(ESTADO_VISIBLE[n.estado])}${n.firma_pdf ? ' <span class="muted small">✓ firmada</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">No hay notas con ese filtro.</td></tr>';
  };
  $('#f-q').oninput = e => { filtro.q = e.target.value; pintar(); };
  $('#f-est').onchange = e => { filtro.estado = e.target.value; pintar(); };
  pintar();
}

// ------------------------------------------------------------ Detalle
export function vistaNE(id, vista) {
  const n = nota(id);
  if (!n) { $('#titulo').textContent = 'Nota de Entrega'; vista.innerHTML = '<div class="vacio">Nota no encontrada.</div>'; return; }
  $('#titulo').textContent = n.numero ? `Nota de Entrega ${n.numero}` : 'Nota de Entrega (borrador)';
  const abierta = ABIERTAS.includes(n.estado);
  const anulable = n.estado === 'Borrador' || (n.estado === 'Entregada' && !(n.nr_ids || []).length);
  const acc = [];
  if (n.estado === 'Borrador') acc.push('<a class="btn" href="#/ne/' + id + '/editar">Editar</a>', '<button class="btn btn-primary" id="btn-emitir">Emitir</button>');
  if (abierta) acc.push(`<a class="btn btn-primary" href="#/ne/${id}/retiro">Registrar retiro</a>`);
  acc.push('<button class="btn" id="btn-pdf">Ver PDF</button><button class="btn" id="btn-pdf-d">Descargar PDF</button>');
  if (anulable) acc.push('<button class="btn btn-danger" id="btn-anular">Anular</button>');
  $('#acciones').innerHTML = acc.join('');

  const retiros = (n.nr_ids || []).map(retiro).filter(Boolean);
  const dato = (e, v) => `<div class="dato"><div class="etq">${e}</div><div class="val">${v || '—'}</div></div>`;
  const totalUnidades = n.lineas.reduce((s, l) => s + l.cantidad, 0);
  const atraso = diasEntre(n.fecha_retorno_estimada);
  vista.innerHTML = `
    ${vencida(n) ? `<div class="aviso aviso-rojo"><b>Vencida:</b> debía regresar el ${fecha(n.fecha_retorno_estimada)} (hace ${atraso} día${atraso === 1 ? '' : 's'}).</div>` : ''}
    ${n.estado === 'Anulada' ? `<div class="aviso aviso-rojo"><b>Anulada</b> por ${esc(n.anulacion?.por)}: ${esc(n.anulacion?.motivo)}</div>` : ''}
    ${n.estado === 'Borrador' ? '<div class="aviso aviso-azul">Borrador: todavía no descuenta inventario ni tiene número. Al emitirla, los ítems pasan a "En demostración".</div>' : ''}
    <div class="card card-cuerpo"><div class="datos">
      ${dato('Estado', chip(ESTADO_VISIBLE[n.estado]) + (n.estado === 'Devuelta parcial' ? '<div class="sub-linea">Retiro parcial: quedan ítems afuera</div>' : ''))}
      ${dato('Cliente', `${esc(n.cliente?.nombre)}${n.cliente?.contacto ? `<div class="sub-linea">${esc(n.cliente.contacto)} ${esc(n.cliente.telefono)}</div>` : ''}`)}
      ${dato('Dirección / lugar', esc(n.direccion))}
      ${dato('Entrega', fecha(n.fecha_entrega))}
      ${dato('Retorno estimado', fecha(n.fecha_retorno_estimada))}
      ${dato('Vendedor', `${esc(n.vendedor?.nombre)} ${esc(n.vendedor?.telefono)}`)}
      ${n.emitido_por ? dato('Emitida por', esc(n.emitido_por)) : ''}
      ${n.motivo ? `<div class="dato" style="grid-column:1/-1"><div class="etq">Motivo / notas</div><div class="val">${esc(n.motivo)}</div></div>` : ''}
    </div></div>
    ${n.numero && n.estado !== 'Anulada' ? `<div class="card"><div class="card-cab"><h2>PDF firmado</h2>${n.firma_pdf ? chip('Firmada', 'verde') : chip('Pendiente de firma', 'amarillo')}</div>
      <div class="card-cuerpo">
        ${n.firma_pdf ? `<p style="margin-top:0">${esc(n.firma_pdf.nombre)} · ${(n.firma_pdf.tamano / 1048576).toFixed(1)} MB · subido por ${esc(n.firma_pdf.subido_por)} ${fechaHora(n.firma_pdf.subido_en)}</p>`
          : '<p style="margin-top:0" class="muted">Descarga el PDF, hazlo firmar y súbelo aquí escaneado (máximo 6 MB).</p>'}
        <div class="fila-flex">
          ${n.firma_pdf ? '<button class="btn" id="firma-ver">Ver PDF firmado</button><button class="btn" id="firma-bajar">Descargar</button>' : ''}
          <label class="btn ${n.firma_pdf ? '' : 'btn-primary'}" style="flex-direction:row">${n.firma_pdf ? 'Reemplazar PDF firmado' : 'Subir PDF firmado'}
            <input type="file" id="firma-archivo" accept="application/pdf,.pdf" hidden></label>
        </div>
      </div></div>` : ''}
    <div class="card"><div class="card-cab"><h2>Artículos</h2><span class="muted small">${totalUnidades} unidad(es)</span></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>#</th><th>Artículo</th><th>Serial</th><th class="num">Cant.</th>${n.numero ? '<th>Situación</th>' : ''}</tr></thead>
        <tbody>${n.lineas.map((l, i) => `<tr>
          <td>${i + 1}</td>
          <td><a href="#/item/${l.item_id}">${esc(l.modelo || l.descripcion)}</a><div class="sub-linea">${esc(l.descripcion)}</div></td>
          <td class="nowrap">${esc(l.numero_serie || '—')}</td>
          <td class="num">${l.cantidad}</td>
          ${n.numero ? `<td>${situacion(n, l)}</td>` : ''}</tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="num">${totalUnidades}</td>${n.numero ? '<td></td>' : ''}</tr></tfoot>
      </table></div></div>
    ${retiros.length ? `<div class="card"><div class="card-cab"><h2>Retiros</h2></div><div class="tabla-wrap"><table>
      <thead><tr><th>Fecha</th><th>Retiró / recibió</th><th>Qué se retiró y en qué condición</th></tr></thead><tbody>
      ${retiros.map(r => `<tr><td class="nowrap">${fecha(r.fecha_retiro)}</td><td>${esc(r.persona)}</td>
        <td>${r.lineas.map(l => `<div>${chip(l.condicion)} ${esc(l.modelo || l.descripcion)}${l.numero_serie ? ` <span class="muted small">SN ${esc(l.numero_serie)}</span>` : ''}${l.cantidad > 1 ? ` ×${l.cantidad}` : ''}${l.observacion ? ` <span class="muted small">— ${esc(l.observacion)}</span>` : ''}</div>`).join('')}
          ${r.notas ? `<div class="sub-linea">${esc(r.notas)}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div></div>` : ''}`;

  $('#btn-pdf').onclick = () => pdfNE(n, 'ver', retiros).catch(e => toast(e.message, 'error'));
  $('#btn-pdf-d').onclick = () => pdfNE(n, 'descargar', retiros).catch(e => toast(e.message, 'error'));
  if ($('#firma-archivo')) $('#firma-archivo').onchange = e => subirFirma(n, e.target);
  if ($('#firma-ver')) $('#firma-ver').onclick = e => conBoton(e.target, () => abrirFirma(n, false));
  if ($('#firma-bajar')) $('#firma-bajar').onclick = e => conBoton(e.target, () => abrirFirma(n, true));
  if ($('#btn-emitir')) $('#btn-emitir').onclick = e => emitir(n, e.target);
  if ($('#btn-anular')) $('#btn-anular').onclick = async () => {
    const motivo = await confirmar('Anular nota de entrega',
      `Solo para notas hechas por error. ${n.estado === 'Entregada' ? 'Los ítems vuelven a "En oficina".' : ''} La nota no se borra: queda como Anulada.`,
      { boton: 'Anular', clase: 'btn-danger', pedirTexto: 'Motivo de la anulación' });
    if (!motivo) return;
    await conBoton(null, async () => { await llamar('anularNE', { id: n.id, motivo }); toast('Nota anulada', 'ok'); });
  };
}

function situacion(n, l) {
  const partes = [];
  const pend = pendienteLinea(l);
  if (l.devuelto_ok) partes.push(chip(`${l.cantidad > 1 ? l.devuelto_ok + ' ' : ''}Retirado OK`, 'verde'));
  if (l.devuelto_danado) partes.push(chip(`${l.cantidad > 1 ? l.devuelto_danado + ' ' : ''}Retirado dañado`, 'naranja'));
  if (l.faltante) partes.push(chip(`${l.cantidad > 1 ? l.faltante + ' ' : ''}Faltante`, 'rojo'));
  if (l.cerrado_sin_retorno) partes.push(chip(`${l.cantidad > 1 ? l.cerrado_sin_retorno + ' ' : ''}Vendido`, 'gris'));
  if (pend && n.estado !== 'Anulada') partes.push(chip(`${l.cantidad > 1 ? pend + ' ' : ''}Afuera`, 'azul'));
  return partes.join(' ');
}

// ------------------------------------------------------------ PDF firmado de la NE
const MAX_MB = 6;
function subirFirma(n, input) {
  const archivo = input.files[0];
  input.value = '';
  if (!archivo) return;
  if (!(archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name))) { toast('El archivo debe ser un PDF', 'error'); return; }
  if (archivo.size > MAX_MB * 1048576) { toast(`El PDF pesa ${(archivo.size / 1048576).toFixed(1)} MB; máximo ${MAX_MB} MB.`, 'error'); return; }
  toast('Subiendo PDF firmado…');
  conBoton(null, () => new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onerror = () => mal(new Error('No se pudo leer el archivo'));
    lector.onload = () => llamar('subirFirmaNE', { ne_id: n.id, nombre: archivo.name, pdf_b64: lector.result })
      .then(() => { toast('PDF firmado guardado', 'ok'); ok(); }, mal);
    lector.readAsDataURL(archivo);
  }));
}

// Une los trozos guardados en Firestore y abre o descarga el PDF firmado
async function abrirFirma(n, descargar) {
  const clave = `ne_${n.id}`;
  const meta = await getDoc(doc(db, 'archivos', clave));
  if (!meta.exists()) throw new Error('No se encontró el PDF firmado');
  const partes = await Promise.all(Array.from({ length: meta.data().n }, (_, i) => getDoc(doc(db, 'archivos', `${clave}__${i}`))));
  const bin = atob(partes.map(p => p.data().d).join(''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  if (descargar || !window.open(url, '_blank')) {
    const a = document.createElement('a'); a.href = url; a.download = `${n.numero} firmada.pdf`; a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

async function emitir(n, boton) {
  const ok = await confirmar('Emitir nota de entrega',
    `Se asignará el número correlativo y ${n.lineas.length} ítem(s) pasarán a "En demostración". ¿Emitir?`, { boton: 'Emitir' });
  if (!ok) return;
  await conBoton(boton, async () => {
    const r = await llamar('emitirNE', { id: n.id });
    toast(`Nota ${r.numero} emitida`, 'ok');
  });
}

// ------------------------------------------------------------ Formulario (borrador)
export function vistaFormNE(id, vista) {
  const previa = id ? nota(id) : null;
  if (id && (!previa || previa.estado !== 'Borrador')) {
    $('#titulo').textContent = 'Nota de Entrega';
    vista.innerHTML = '<div class="vacio">Solo se pueden editar notas en Borrador.</div>';
    return;
  }
  $('#titulo').textContent = previa ? 'Editar borrador' : 'Nueva Nota de Entrega';
  // Vendedores ya usados en notas anteriores (el más reciente primero)
  const vendedores = [];
  for (const n of [...datos.notas].sort((a, b) => String(b.fecha_entrega).localeCompare(a.fecha_entrega))) {
    if (n.vendedor?.nombre && !vendedores.some(v => v.nombre === n.vendedor.nombre)) vendedores.push(n.vendedor);
  }
  const f = {
    cliente_id: previa?.cliente_id || '',
    direccion: previa?.direccion || '',
    fecha_entrega: previa?.fecha_entrega || hoyISO(),
    fecha_retorno_estimada: previa?.fecha_retorno_estimada || sumarDias(hoyISO(), 2),
    vendedor: previa?.vendedor || vendedores[0] || { nombre: '', telefono: '' },
    motivo: previa?.motivo || '',
    lineas: (previa?.lineas || []).map(l => ({ item_id: l.item_id, cantidad: l.cantidad })),
  };
  const cli = cliente(f.cliente_id);
  vista.innerHTML = `
    <div class="card card-cuerpo"><div class="form">
      <label class="full">Cliente *
        <div class="fila-flex"><input id="ne-cli" placeholder="Buscar cliente…" value="${esc(cli?.nombre || previa?.cliente?.nombre || '')}" autocomplete="off">
        <button type="button" class="btn" id="ne-cli-nuevo">+ Nuevo cliente</button></div></label>
      <label class="full">Dirección o lugar del evento<input id="ne-dir" value="${esc(f.direccion)}" placeholder="Ej. Hotel Hilton Panamá, Panamá"></label>
      <label>Fecha de entrega *<input type="date" id="ne-fe" value="${f.fecha_entrega}"></label>
      <label>Fecha estimada de retorno *<input type="date" id="ne-fr" value="${f.fecha_retorno_estimada}"></label>
      <label>Vendedor / responsable *
        <input id="ne-vend" list="dl-vend" value="${esc(f.vendedor.nombre)}" autocomplete="off">
        <datalist id="dl-vend">${vendedores.map(v => `<option value="${esc(v.nombre)}">`).join('')}</datalist></label>
      <label>Teléfono del vendedor<input id="ne-tel" value="${esc(f.vendedor.telefono)}"></label>
      <label class="full">Motivo / notas<textarea id="ne-mot" placeholder="Ej. Demostración en stand del Congreso CONAIB los días 9 y 10 de octubre">${esc(f.motivo)}</textarea></label>
    </div></div>
    <div class="card">
      <div class="card-cab"><h2>Artículos</h2><span class="muted small" id="ne-total"></span></div>
      <div class="card-cuerpo">
        <h3 style="font-size:13px;margin:0 0 8px">Disponibles en oficina <span class="muted small">— agrega cualquier equipo o transductor</span></h3>
        <div class="fila-flex">
          <input id="ne-buscar" type="search" placeholder="Filtrar por modelo, serial o descripción…" autocomplete="off">
          <select id="ne-cat" style="flex:0 1 170px"><option value="">Todo</option><option>Equipo</option><option value="Accesorio">Accesorios / transductores</option></select>
        </div>
      </div>
      <div class="tabla-wrap" style="max-height:340px;overflow-y:auto;border-bottom:1px solid var(--border)"><table>
        <thead><tr><th>Disponible</th><th>Serial</th><th></th></tr></thead><tbody id="ne-disp"></tbody></table></div>
      <div class="card-cuerpo" style="padding-bottom:4px"><h3 style="font-size:13px;margin:0">En esta nota</h3></div>
      <div class="tabla-wrap"><table><thead><tr><th>Artículo</th><th>Serial</th><th class="num">Cant.</th><th></th></tr></thead>
        <tbody id="ne-lineas"></tbody></table></div>
    </div>
    <div class="acciones-form">
      <a class="btn" href="${previa ? '#/ne/' + previa.id : '#/notas'}">Cancelar</a>
      <button class="btn" id="ne-guardar">Guardar borrador</button>
      <button class="btn btn-primary" id="ne-emitir">Guardar y emitir</button>
    </div>`;

  const disponibles = () => datos.items.filter(it => (it.stock?.oficina || 0) > 0);
  const enNota = id2 => f.lineas.find(l => l.item_id === id2);
  let visibles = [];

  const pintarLineas = () => {
    $('#ne-lineas').innerHTML = f.lineas.map((l, i) => {
      const it = item(l.item_id);
      if (!it) return '';
      const sinStock = (it.stock?.oficina || 0) < l.cantidad;
      return `<tr class="${sinStock ? 'err-fila' : ''}">
        <td><b>${esc(it.modelo || it.descripcion)}</b> <span class="muted small">${esc(it.categoria)}</span><div class="sub-linea">${esc(it.descripcion)}</div>
          ${sinStock ? `<div class="err-texto">Ya no está disponible en oficina (${esc(it.estado)})</div>` : ''}</td>
        <td class="nowrap">${esc(it.numero_serie || '—')}</td>
        <td class="num">${it.numero_serie ? 1 : `<input type="number" min="1" max="${it.stock?.oficina || 1}" value="${l.cantidad}" data-cant="${i}" style="width:70px">`}</td>
        <td><button class="btn btn-sm btn-danger" data-quitar="${i}" aria-label="Quitar">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="vacio">Agrega los equipos y accesorios que salen.</td></tr>';
    $('#ne-total').textContent = `${f.lineas.reduce((s, l) => s + l.cantidad, 0)} unidad(es)`;
    $$('[data-quitar]').forEach(b => { b.onclick = () => { f.lineas.splice(Number(b.dataset.quitar), 1); pintarLineas(); pintarDisponibles(); }; });
    $$('[data-cant]').forEach(inp => { inp.onchange = () => { f.lineas[Number(inp.dataset.cant)].cantidad = Math.max(1, Number(inp.value) || 1); pintarLineas(); }; });
  };

  // Todos los ítems en oficina, filtrables; cualquier transductor puede ir con cualquier equipo
  const pintarDisponibles = () => {
    const q = $('#ne-buscar').value;
    const cat = $('#ne-cat').value;
    visibles = disponibles().filter(it => (!enNota(it.id) || (!it.numero_serie && enNota(it.id).cantidad < it.stock.oficina))
      && (!cat || it.categoria === cat)
      && (!q || coincide(`${it.modelo} ${it.descripcion} ${it.numero_serie} ${it.serie_norm} ${it.marca}`, q)))
      .sort((x, y) => (x.categoria === y.categoria ? 0 : x.categoria === 'Equipo' ? -1 : 1));
    $('#ne-disp').innerHTML = visibles.map((it, i) => `<tr>
      <td><b>${esc(it.modelo || it.descripcion)}</b> <span class="muted small">${esc(it.categoria)}</span><div class="sub-linea">${esc(it.descripcion)}</div></td>
      <td class="nowrap">${esc(it.numero_serie || `${it.stock.oficina} en oficina`)}</td>
      <td class="num"><button class="btn btn-sm" data-add="${i}">+ Agregar</button></td></tr>`).join('')
      || '<tr><td colspan="3" class="vacio">No hay ítems disponibles con ese filtro.</td></tr>';
    $$('[data-add]').forEach(b => { b.onclick = () => agregar(visibles[Number(b.dataset.add)]); });
  };

  const agregar = it => {
    if (!it) return;
    const ya = enNota(it.id);
    if (ya) { if (!it.numero_serie && ya.cantidad < it.stock.oficina) ya.cantidad++; }
    else f.lineas.push({ item_id: it.id, cantidad: 1 });
    pintarLineas(); pintarDisponibles();
  };

  $('#ne-buscar').addEventListener('input', pintarDisponibles);
  $('#ne-cat').addEventListener('change', pintarDisponibles);

  autocompletar($('#ne-cli'), {
    buscar: q => datos.clientes.filter(c => coincide(`${c.nombre} ${c.contacto} ${c.ruc}`, q)),
    render: c => `<b>${esc(c.nombre)}</b>${c.contacto ? ` <span class="muted small">${esc(c.contacto)}</span>` : ''}`,
    elegir: c => elegirCliente(c),
  });
  const elegirCliente = c => {
    f.cliente_id = c.id;
    $('#ne-cli').value = c.nombre;
    if (!$('#ne-dir').value.trim() && c.direccion) $('#ne-dir').value = c.direccion;
  };
  $('#ne-cli').addEventListener('input', () => { f.cliente_id = ''; });
  $('#ne-cli-nuevo').onclick = () => formCliente(null, nuevo => elegirCliente(nuevo));
  $('#ne-vend').addEventListener('change', () => {
    const v = vendedores.find(x => x.nombre === $('#ne-vend').value);
    if (v) $('#ne-tel').value = v.telefono || '';
  });

  const guardar = async () => {
    if (!f.cliente_id) {
      const exacto = datos.clientes.find(c => c.nombre.toLowerCase() === $('#ne-cli').value.trim().toLowerCase());
      if (exacto) f.cliente_id = exacto.id;
      else throw new Error('Elige un cliente de la lista (o créalo con "+ Nuevo cliente").');
    }
    const r = await llamar('guardarNE', {
      id: previa?.id, cliente_id: f.cliente_id, direccion: $('#ne-dir').value,
      fecha_entrega: $('#ne-fe').value, fecha_retorno_estimada: $('#ne-fr').value,
      vendedor: { nombre: $('#ne-vend').value, telefono: $('#ne-tel').value },
      motivo: $('#ne-mot').value, lineas: f.lineas,
    });
    return r.id;
  };
  $('#ne-guardar').onclick = e => conBoton(e.target, async () => {
    const nid = await guardar();
    toast('Borrador guardado', 'ok');
    location.hash = '#/ne/' + nid;
  });
  $('#ne-emitir').onclick = e => conBoton(e.target, async () => {
    const nid = await guardar();
    const ok = await confirmar('Emitir nota de entrega',
      `Se asignará el número correlativo y ${f.lineas.length} ítem(s) pasarán a "En demostración". ¿Emitir?`, { boton: 'Emitir' });
    location.hash = '#/ne/' + nid;
    if (!ok) { toast('Quedó guardada como borrador'); return; }
    const r = await llamar('emitirNE', { id: nid });
    toast(`Nota ${r.numero} emitida`, 'ok');
  });

  pintarLineas();
  pintarDisponibles();
  return { conForm: true };
}
