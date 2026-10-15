import { llamar } from '../fb.js';
import { datos, item, nota, retiro, movimientosDe } from '../datos.js';
import { ESTADOS, CLAVES_STOCK, validarItem } from '../comun.js';
import { $, $$, esc, cant, fecha, fechaHora, hoyISO, chip, abrirModal, toast, coincide } from '../ui.js';

const filtro = { categoria: 'Equipo', estado: '', modelo: '', q: '' }; // por defecto se ven los equipos

export function textoUbicacion(it) {
  return (it.ne_abiertas || []).map(id => nota(id)?.numero).filter(Boolean).join(', ');
}

export function vistaInventario(_, vista) {
  $('#titulo').textContent = 'Inventario';
  $('#acciones').innerHTML = '<button class="btn btn-primary" id="btn-nuevo-item">+ Nuevo ítem</button>';
  $('#btn-nuevo-item').onclick = () => formItem(null);
  const modelos = [...new Set(datos.items.map(i => i.modelo).filter(Boolean))].sort();
  const opt = (v, t, actual) => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(t)}</option>`;
  vista.innerHTML = `<div class="card">
    <div class="filtros">
      <input type="search" id="f-q" placeholder="Buscar serial, modelo o descripción" value="${esc(filtro.q)}">
      <select id="f-cat">${opt('', 'Todas las categorías', filtro.categoria)}${opt('Equipo', 'Equipos', filtro.categoria)}${opt('Accesorio', 'Accesorios', filtro.categoria)}</select>
      <select id="f-est">${opt('', 'Todos los estados', filtro.estado)}${Object.values(ESTADOS).map(e => opt(e, e, filtro.estado)).join('')}${opt('Faltante', 'Faltante (revisión)', filtro.estado)}</select>
      <select id="f-mod">${opt('', 'Todos los modelos', filtro.modelo)}${modelos.map(m => opt(m, m, filtro.modelo)).join('')}</select>
    </div>
    <div class="tabla-wrap"><table>
      <thead><tr><th>Ítem</th><th>Serial</th><th class="num">Cant.</th><th>Estado</th></tr></thead>
      <tbody id="inv-filas"></tbody><tfoot id="inv-pie"></tfoot>
    </table></div></div>`;
  const pintar = () => {
    const claveEstado = Object.entries(ESTADOS).find(([, v]) => v === filtro.estado)?.[0];
    const lista = datos.items.filter(it =>
      (!filtro.categoria || it.categoria === filtro.categoria)
      && (!filtro.modelo || it.modelo === filtro.modelo)
      && (!filtro.estado || (filtro.estado === 'Faltante' ? it.faltante?.cantidad : (it.stock?.[claveEstado] || 0) > 0))
      && (!filtro.q || coincide(`${it.numero_serie} ${it.serie_norm} ${it.marca} ${it.modelo} ${it.descripcion}`, filtro.q)));
    $('#inv-filas').innerHTML = lista.map(it => {
      const ubic = textoUbicacion(it);
      const reparto = it.cantidad > 1 ? CLAVES_STOCK.filter(k => it.stock?.[k]).map(k => `${it.stock[k]} ${ESTADOS[k].toLowerCase()}`).join(' · ') : '';
      return `<tr class="click" onclick="location.hash='#/item/${it.id}'">
        <td><b>${esc(it.modelo || it.descripcion)}</b> <span class="muted small">${esc(it.categoria)}${it.marca ? ' · ' + esc(it.marca) : ''}</span>
          <div class="sub-linea">${esc(it.descripcion)}</div></td>
        <td class="nowrap">${esc(it.numero_serie || '—')}</td>
        <td class="num">${it.cantidad}</td>
        <td>${chip(it.estado)}${it.faltante?.cantidad ? ' ' + chip('Faltante', 'rojo') : ''}
          ${ubic ? `<div class="sub-linea">${esc(ubic)}</div>` : ''}${reparto ? `<div class="sub-linea">${esc(reparto)}</div>` : ''}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" class="vacio">${datos.items.length ? 'Ningún ítem coincide con el filtro.' : 'Inventario vacío. Crea ítems o impórtalos desde Excel.'}</td></tr>`;
    $('#inv-pie').innerHTML = lista.length ? `<tr><td colspan="2">${lista.length} registro(s)</td><td class="num">${cant(lista.reduce((s, i) => s + i.cantidad, 0))}</td><td></td></tr>` : '';
  };
  $('#f-q').oninput = e => { filtro.q = e.target.value; pintar(); };
  $('#f-cat').onchange = e => { filtro.categoria = e.target.value; pintar(); };
  $('#f-est').onchange = e => { filtro.estado = e.target.value; pintar(); };
  $('#f-mod').onchange = e => { filtro.modelo = e.target.value; pintar(); };
  pintar();
}

// ------------------------------------------------------------ Formulario de ítem
export function formItem(it, alGuardar) {
  const marcas = [...new Set(datos.items.map(i => i.marca).filter(Boolean))];
  const modelos = [...new Set(datos.items.map(i => i.modelo).filter(Boolean))];
  const cuerpo = abrirModal(it ? 'Editar ítem' : 'Nuevo ítem', `
    <div class="form">
      <label>Categoría *<select id="it-cat"><option>Equipo</option><option ${it?.categoria === 'Accesorio' ? 'selected' : ''}>Accesorio</option></select></label>
      <label>Marca<input id="it-marca" list="dl-marcas" value="${esc(it?.marca ?? 'Mindray')}"></label>
      <label>Modelo<input id="it-modelo" list="dl-modelos" value="${esc(it?.modelo)}"></label>
      <label>Número de serie<input id="it-serie" value="${esc(it?.numero_serie)}" placeholder="Vacío si no tiene"></label>
      <label class="full">Descripción<input id="it-desc" value="${esc(it?.descripcion)}" placeholder="Ej. Equipo de Ultrasonido portátil / Transductor lineal"></label>
      <label>Cantidad<input id="it-cant" type="number" min="1" step="1" value="${it?.cantidad ?? 1}"><span class="ayuda">Siempre 1 si tiene serial</span></label>
      <label class="full">Notas<textarea id="it-notas">${esc(it?.notas)}</textarea></label>
    </div>
    <datalist id="dl-marcas">${marcas.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <datalist id="dl-modelos">${modelos.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${it && it.cantidad - (it.stock?.oficina || 0) > 0 ? `<p class="aviso aviso-amarillo small" style="margin:14px 0 0">${it.cantidad - it.stock.oficina} unidad(es) están fuera de oficina; la cantidad no puede bajar de eso.</p>` : ''}`,
  [
    { texto: 'Cancelar' },
    { texto: 'Guardar', clase: 'btn-primary', accion: async () => {
      const d = leer();
      const { errores } = validarItem(d);
      if (errores.length) throw new Error(errores.join('. '));
      const r = await llamar('guardarItem', { ...d, id: it?.id });
      toast('Ítem guardado', 'ok');
      alGuardar?.(r.id);
      return true;
    } },
  ]);
  const leer = () => ({
    categoria: $('#it-cat').value, marca: $('#it-marca').value, modelo: $('#it-modelo').value,
    numero_serie: $('#it-serie').value, descripcion: $('#it-desc').value,
    cantidad: Number($('#it-cant').value || 1), notas: $('#it-notas').value,
    compatibles: it?.compatibles || [],
  });
  const ajustar = () => {
    const acc = $('#it-cat').value === 'Accesorio';
    const conSerie = !!$('#it-serie').value.trim() || !acc;
    $('#it-cant').disabled = conSerie;
    if (conSerie) $('#it-cant').value = 1;
  };
  $('#it-cat', cuerpo).onchange = ajustar;
  $('#it-serie', cuerpo).oninput = ajustar;
  ajustar();
}

// ------------------------------------------------------------ Detalle de ítem
export function vistaItem(id, vista) {
  const it = item(id);
  if (!it) { $('#titulo').textContent = 'Ítem'; vista.innerHTML = '<div class="vacio">Ítem no encontrado.</div>'; return; }
  $('#titulo').textContent = `${it.modelo || it.descripcion}${it.numero_serie ? ' · ' + it.numero_serie : ''}`;
  const vendible = ['oficina', 'demostracion', 'servicio'].some(k => (it.stock?.[k] || 0) > 0);
  $('#acciones').innerHTML = `${vendible ? '<button class="btn" id="btn-vender">Marcar como vendido</button>' : ''}<button class="btn btn-primary" id="btn-editar">Editar</button>`;
  $('#btn-editar').onclick = () => formItem(it);
  if ($('#btn-vender')) $('#btn-vender').onclick = () => formVenta(it);
  const dato = (e, v) => `<div class="dato"><div class="etq">${e}</div><div class="val">${v || '—'}</div></div>`;
  const abiertas = (it.ne_abiertas || []).map(nota).filter(Boolean);
  vista.innerHTML = `
    ${it.faltante?.cantidad ? `<div class="aviso aviso-rojo"><b>Faltante:</b> ${it.faltante.cantidad} unidad(es) no regresaron en el retiro de ${esc(it.faltante.ne_numero)}, desde ${fecha(it.faltante.desde)}. Si aparece, regístralo en el retiro de <a href="#/ne/${it.faltante.ne_id}">la nota de entrega</a>.</div>` : ''}
    ${it.venta ? `<div class="aviso aviso-verde"><b>Vendido</b> el ${fecha(it.venta.fecha)}${it.venta.cliente ? ` a <b>${esc(it.venta.cliente)}</b>` : ''}${it.venta.con_equipo ? ` junto con <a href="#/item/${it.venta.con_equipo}">${esc(it.venta.con_equipo_texto)}</a>` : ''}${it.venta_accesorios?.length ? `, con: ${esc(it.venta_accesorios.join(', '))}` : ''}.${it.venta.nota ? ` ${esc(it.venta.nota)}` : ''} <span class="muted small">(${esc(it.venta.por)})</span></div>` : ''}
    <div class="card card-cuerpo"><div class="datos">
      ${dato('Estado', chip(it.estado))}
      ${dato('Categoría', esc(it.categoria))}
      ${dato('Marca / modelo', esc([it.marca, it.modelo].filter(Boolean).join(' ')))}
      ${dato('Número de serie', esc(it.numero_serie))}
      ${dato('Descripción', esc(it.descripcion))}
      ${dato('Cantidad', it.cantidad)}
      ${it.cantidad > 1 ? dato('Reparto', CLAVES_STOCK.filter(k => it.stock?.[k]).map(k => `${it.stock[k]} ${esc(ESTADOS[k].toLowerCase())}`).join('<br>')) : ''}
      ${dato('Afuera en', abiertas.map(n => `<a href="#/ne/${n.id}">${esc(n.numero)}</a> · ${esc(n.cliente?.nombre)}`).join('<br>'))}
      ${it.notas ? dato('Notas', esc(it.notas)) : ''}
    </div></div>
    <div class="card"><div class="card-cab"><h2>Historial de movimientos</h2></div>
      <div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th class="num">Cant.</th><th>Estado</th><th class="ocultar-movil">Usuario</th></tr></thead>
      <tbody id="movs"><tr><td colspan="6" class="vacio">Cargando…</td></tr></tbody></table></div></div>`;
  movimientosDe(id).then(movs => {
    const cuerpo = $('#movs');
    if (!cuerpo) return;
    const enlace = mv => mv.doc_tipo === 'NE' && mv.doc_id ? `<a href="#/ne/${mv.doc_id}">${esc(mv.doc_numero || 'NE')}</a>`
      : mv.doc_numero && !mv.doc_id ? esc(mv.doc_numero)
      : mv.doc_tipo === 'NR' && retiro(mv.doc_id) ? `<a href="#/ne/${retiro(mv.doc_id).ne_id}">${esc(retiro(mv.doc_id).ne_numero)}</a>` : '';
    cuerpo.innerHTML = movs.map(mv => `<tr>
      <td class="nowrap">${fechaHora(mv.fecha)}</td>
      <td>${esc(mv.tipo === 'Retorno NR' ? 'Retiro' : mv.tipo)}${mv.condicion ? ' ' + chip(mv.condicion) : ''}${mv.nota ? `<div class="sub-linea">${esc(mv.nota)}</div>` : ''}</td>
      <td class="nowrap">${enlace(mv)}</td>
      <td class="num">${mv.cantidad || ''}</td>
      <td class="small">${mv.estado_anterior ? esc(mv.estado_anterior) + ' → ' : ''}${esc(mv.estado_nuevo)}</td>
      <td class="small ocultar-movil">${esc(mv.usuario)}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin movimientos.</td></tr>';
  }).catch(e => toast(e.message, 'error'));
}

// ------------------------------------------------------------ Venta
// Marca el ítem como vendido. Si es un equipo, se eligen los transductores/accesorios que se venden con él
// (cualquiera del inventario, con filtro) o se agregan los que no estaban registrados.
function formVenta(it) {
  const esEquipo = it.categoria === 'Equipo';
  const candidatos = datos.items.filter(x => x.id !== it.id && x.categoria === 'Accesorio'
    && ['oficina', 'demostracion', 'servicio'].some(k => (x.stock?.[k] || 0) > 0));
  const elegidos = new Set();
  const nuevos = [];
  const cuerpo = abrirModal(`Marcar como vendido: ${it.modelo || it.descripcion}${it.numero_serie ? ' · ' + it.numero_serie : ''}`, `
    <div class="form">
      <label>Fecha de venta<input type="date" id="vt-fecha" value="${hoyISO()}"></label>
      <label>Cliente<input id="vt-cliente" list="dl-vt-cli" placeholder="A quién se vendió" autocomplete="off">
        <datalist id="dl-vt-cli">${datos.clientes.map(c => `<option value="${esc(c.nombre)}">`).join('')}</datalist></label>
      ${it.cantidad > 1 ? `<label>Cantidad<input id="vt-cant" type="number" min="1" max="${it.cantidad - (it.stock?.vendido || 0) - (it.stock?.baja || 0)}" value="1"></label>` : ''}
      <label class="full">Nota / factura<input id="vt-nota" placeholder="Opcional"></label>
    </div>
    ${esEquipo ? `<h3 style="font-size:14px;margin:18px 0 6px">Transductores y accesorios que se venden con el equipo</h3>
      <p class="muted small" style="margin:0 0 8px">Marca los del inventario que van incluidos: quedarán como vendidos. Los demás no cambian.</p>
      <input id="vt-filtro" type="search" placeholder="Filtrar por modelo o serial…" autocomplete="off">
      <div id="vt-lista" class="lista-simple" style="max-height:240px;overflow-y:auto;margin-top:8px"></div>
      <h3 style="font-size:14px;margin:16px 0 6px">¿Va uno que no está en el inventario?</h3>
      <div class="fila-flex"><input id="vt-n-modelo" placeholder="Modelo (ej. L12-4s)"><input id="vt-n-serie" placeholder="Serial (opcional)">
        <button class="btn btn-sm" id="vt-n-add">+ Agregar</button></div>
      <div id="vt-nuevos" class="sugerencias"></div>` : ''}`, [
    { texto: 'Cancelar' },
    { texto: 'Marcar como vendido', clase: 'btn-primary', accion: async () => {
      const r = await llamar('marcarVendido', {
        item_id: it.id, fecha: $('#vt-fecha').value, cliente: $('#vt-cliente').value, nota: $('#vt-nota').value,
        cantidad: Number($('#vt-cant')?.value || 1), accesorios: [...elegidos], nuevos,
      });
      toast(r.vendidos > 1 ? `Vendidos: el equipo y ${r.vendidos - 1} accesorio(s)` : 'Marcado como vendido', 'ok');
      return true;
    } },
  ], { ancho: '720px' });
  if (!esEquipo) return;
  const pintar = () => {
    const q = $('#vt-filtro').value;
    const lista = candidatos.filter(x => elegidos.has(x.id) || !q || coincide(`${x.modelo} ${x.descripcion} ${x.numero_serie} ${x.serie_norm}`, q));
    $('#vt-lista').innerHTML = lista.map(x => `<label class="check" style="font-weight:400">
      <input type="checkbox" data-acc="${x.id}" ${elegidos.has(x.id) ? 'checked' : ''}>
      <span><b>${esc(x.modelo || x.descripcion)}</b> <span class="muted small">${esc(x.numero_serie || '')} · ${esc(x.estado)}${(x.ne_abiertas || []).length ? ' · ' + esc((x.ne_abiertas || []).map(n => nota(n)?.numero).filter(Boolean).join(', ')) : ''}</span></span></label>`).join('')
      || '<span class="muted small">No hay transductores disponibles con ese filtro.</span>';
    $$('[data-acc]', cuerpo).forEach(c => { c.onchange = () => { c.checked ? elegidos.add(c.dataset.acc) : elegidos.delete(c.dataset.acc); }; });
  };
  const pintarNuevos = () => {
    $('#vt-nuevos').innerHTML = nuevos.map((x, i) => `<span class="sug">${esc(x.modelo)} ${x.numero_serie ? `<span class="muted small">${esc(x.numero_serie)}</span>` : ''}
      <button class="btn btn-sm btn-danger" data-qn="${i}">✕</button></span>`).join('');
    $$('[data-qn]', cuerpo).forEach(b => { b.onclick = () => { nuevos.splice(Number(b.dataset.qn), 1); pintarNuevos(); }; });
  };
  $('#vt-filtro').oninput = pintar;
  $('#vt-n-add').onclick = () => {
    const modelo = $('#vt-n-modelo').value.trim();
    if (!modelo) { toast('Escribe el modelo del transductor', 'error'); return; }
    nuevos.push({ modelo, numero_serie: $('#vt-n-serie').value.trim(), marca: it.marca || '', descripcion: 'Transductor' });
    $('#vt-n-modelo').value = ''; $('#vt-n-serie').value = '';
    pintarNuevos();
  };
  pintar();
}
