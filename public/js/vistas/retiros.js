import { llamar, db } from '../fb.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { datos, nota, retiro } from '../datos.js';
import { pendienteLinea, CONDICIONES } from '../comun.js';
import { $, $$, esc, fecha, fechaHora, chip, toast, confirmar, conBoton, coincide, hoyISO } from '../ui.js';
import { ABIERTAS } from './dashboard.js';
import { pdfNR } from '../pdf.js';

export function vistaFormNR(neId, vista) {
  const n = nota(neId);
  if (!n || !ABIERTAS.includes(n.estado)) {
    $('#titulo').textContent = 'Nota de Retiro';
    vista.innerHTML = '<div class="vacio">Solo se registran retiros de notas Entregadas o Devueltas parcialmente.</div>';
    return;
  }
  $('#titulo').textContent = `Nota de Retiro · ${n.numero}`;
  const lineas = n.lineas.filter(l => pendienteLinea(l) > 0);
  vista.innerHTML = `
    <div class="card card-cuerpo"><div class="form">
      <label>Fecha de retiro *<input type="date" id="nr-fecha" value="${hoyISO()}"></label>
      <label>Persona que retira / recibe *<input id="nr-persona" placeholder="Nombre"></label>
      <label class="full">Notas<textarea id="nr-notas"></textarea></label>
    </div></div>
    <div class="card">
      <div class="card-cab"><h2>¿Qué regresa?</h2><span class="muted small">${esc(n.cliente?.nombre)}</span>
        <button class="btn btn-sm" id="nr-todo">Marcar todo OK</button></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Artículo</th><th>Serial</th><th class="num">Pendiente</th><th class="num">Regresa</th><th>Condición</th><th>Observación</th></tr></thead>
        <tbody>${lineas.map(l => `<tr data-linea="${esc(l.linea_id)}">
          <td><b>${esc(l.modelo || l.descripcion)}</b><div class="sub-linea">${esc(l.descripcion)}</div></td>
          <td class="nowrap">${esc(l.numero_serie || '—')}</td>
          <td class="num">${pendienteLinea(l)}</td>
          <td class="num"><input type="number" min="0" max="${pendienteLinea(l)}" value="0" class="nr-cant" style="width:70px"></td>
          <td><select class="nr-cond" style="min-width:110px">${CONDICIONES.map(c => `<option>${c}</option>`).join('')}</select></td>
          <td><input class="nr-obs" placeholder="Opcional"></td></tr>`).join('')
          || '<tr><td colspan="6" class="vacio">No quedan ítems pendientes de retorno. Los faltantes se resuelven desde la nota de entrega.</td></tr>'}</tbody>
      </table></div>
    </div>
    <p class="muted small">OK vuelve a "En oficina" · Dañado pasa a "En servicio técnico" · Faltante queda señalado para revisión y no vuelve al inventario disponible.</p>
    <div class="acciones-form">
      <a class="btn" href="#/ne/${n.id}">Cancelar</a>
      <button class="btn btn-primary" id="nr-emitir">Emitir Nota de Retiro</button>
    </div>`;
  $('#nr-todo').onclick = () => $$('tr[data-linea]').forEach(tr => {
    const max = $('.nr-cant', tr).max;
    $('.nr-cant', tr).value = max;
    $('.nr-cond', tr).value = 'OK';
  });
  $('#nr-emitir').onclick = e => conBoton(e.target, async () => {
    const sel = $$('tr[data-linea]').map(tr => ({
      linea_id: tr.dataset.linea, cantidad: Number($('.nr-cant', tr).value) || 0,
      condicion: $('.nr-cond', tr).value, observacion: $('.nr-obs', tr).value,
    })).filter(x => x.cantidad > 0);
    if (!sel.length) throw new Error('Indica cuántas unidades regresan de al menos un ítem.');
    if (!$('#nr-persona').value.trim()) throw new Error('Indica quién retira o recibe.');
    const resumen = CONDICIONES.map(c => [c, sel.filter(x => x.condicion === c).reduce((s, x) => s + x.cantidad, 0)])
      .filter(([, k]) => k).map(([c, k]) => `${k} ${c}`).join(', ');
    const ok = await confirmar('Emitir Nota de Retiro', `Se registrará el retorno de: <b>${esc(resumen)}</b>. ¿Emitir?`, { boton: 'Emitir' });
    if (!ok) return;
    const r = await llamar('emitirNR', { ne_id: n.id, fecha_retiro: $('#nr-fecha').value, persona: $('#nr-persona').value,
      notas: $('#nr-notas').value, lineas: sel });
    toast(`Nota de retiro ${r.numero} emitida`, 'ok');
    location.hash = '#/nr/' + r.id;
  });
  return { conForm: true };
}

let q = '';
export function vistaRetiros(_, vista) {
  $('#titulo').textContent = 'Notas de Retiro';
  vista.innerHTML = `<div class="card">
    <div class="filtros"><input type="search" id="f-q" placeholder="Buscar número, NE, cliente o serial" value="${esc(q)}"></div>
    <div class="tabla-wrap"><table><thead><tr><th>Número</th><th>Nota de entrega</th><th>Cliente</th><th>Fecha</th><th>Recibe</th><th>Condición</th><th>Firmada</th></tr></thead>
    <tbody id="nr-filas"></tbody></table></div></div>
    <p class="muted small">Para registrar un retiro, abre la nota de entrega y usa "Registrar retiro".</p>`;
  const pintar = () => {
    const lista = datos.retiros.filter(r => !q || coincide(`${r.numero} ${r.ne_numero} ${r.cliente?.nombre} ${r.lineas.map(l => l.numero_serie).join(' ')}`, q));
    $('#nr-filas').innerHTML = lista.map(r => `<tr class="click" onclick="location.hash='#/nr/${r.id}'">
      <td><b>${esc(r.numero)}</b></td><td>${esc(r.ne_numero)}</td><td>${esc(r.cliente?.nombre)}</td>
      <td class="nowrap">${fecha(r.fecha_retiro)}</td><td>${esc(r.persona)}</td>
      <td>${resumenCond(r)}</td><td>${r.firma_pdf ? chip('Sí', 'verde') : chip('Pendiente', 'amarillo')}</td></tr>`).join('') || '<tr><td colspan="7" class="vacio">Aún no hay notas de retiro.</td></tr>';
  };
  $('#f-q').oninput = e => { q = e.target.value; pintar(); };
  pintar();
}

const resumenCond = r => CONDICIONES.map(c => [c, r.lineas.filter(l => l.condicion === c).reduce((s, l) => s + l.cantidad, 0)])
  .filter(([, k]) => k).map(([c, k]) => chip(`${k} ${c}`, { OK: 'verde', 'Dañado': 'naranja', Faltante: 'rojo' }[c])).join(' ');

export function vistaNR(id, vista) {
  const r = retiro(id);
  if (!r) { $('#titulo').textContent = 'Nota de Retiro'; vista.innerHTML = '<div class="vacio">Nota no encontrada.</div>'; return; }
  $('#titulo').textContent = `Nota de Retiro ${r.numero}`;
  $('#acciones').innerHTML = `<a class="btn" href="#/ne/${r.ne_id}">Ver ${esc(r.ne_numero)}</a><button class="btn" id="btn-pdf">Ver PDF</button><button class="btn btn-primary" id="btn-pdf-d">Descargar PDF</button>`;
  $('#btn-pdf').onclick = () => pdfNR(r).catch(e => toast(e.message, 'error'));
  $('#btn-pdf-d').onclick = () => pdfNR(r, 'descargar').catch(e => toast(e.message, 'error'));
  const dato = (e, v) => `<div class="dato"><div class="etq">${e}</div><div class="val">${v || '—'}</div></div>`;
  vista.innerHTML = `<div class="card card-cuerpo"><div class="datos">
      ${dato('Referencia', `<a href="#/ne/${r.ne_id}">${esc(r.ne_numero)}</a>`)}
      ${dato('Cliente', esc(r.cliente?.nombre))}
      ${dato('Fecha de retiro', fecha(r.fecha_retiro))}
      ${dato('Retira / recibe', esc(r.persona))}
      ${dato('Registrada por', esc(r.creado_por))}
      ${r.notas ? dato('Notas', esc(r.notas)) : ''}
    </div></div>
    <div class="card"><div class="card-cab"><h2>PDF firmado</h2>${r.firma_pdf ? chip('Firmada', 'verde') : chip('Pendiente de firma', 'amarillo')}</div>
      <div class="card-cuerpo">
        ${r.firma_pdf ? `<p style="margin-top:0">${esc(r.firma_pdf.nombre)} · ${(r.firma_pdf.tamano / 1048576).toFixed(1)} MB · subido por ${esc(r.firma_pdf.subido_por)} ${fechaHora(r.firma_pdf.subido_en)}</p>`
          : '<p style="margin-top:0" class="muted">Descarga el PDF, hazlo firmar y súbelo aquí escaneado (máximo 6 MB).</p>'}
        <div class="fila-flex">
          ${r.firma_pdf ? '<button class="btn" id="firma-ver">Ver PDF firmado</button><button class="btn" id="firma-bajar">Descargar</button>' : ''}
          <label class="btn ${r.firma_pdf ? '' : 'btn-primary'}" style="flex-direction:row">${r.firma_pdf ? 'Reemplazar PDF firmado' : 'Subir PDF firmado'}
            <input type="file" id="firma-archivo" accept="application/pdf,.pdf" hidden></label>
        </div>
      </div></div>
    <div class="card"><div class="tabla-wrap"><table>
      <thead><tr><th>#</th><th>Artículo</th><th>Serial</th><th class="num">Cant.</th><th>Condición</th><th>Observación</th></tr></thead>
      <tbody>${r.lineas.map((l, i) => `<tr><td>${i + 1}</td>
        <td><a href="#/item/${l.item_id}">${esc(l.modelo || l.descripcion)}</a><div class="sub-linea">${esc(l.descripcion)}</div></td>
        <td>${esc(l.numero_serie || '—')}</td><td class="num">${l.cantidad}</td><td>${chip(l.condicion)}</td><td>${esc(l.observacion)}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
  $('#firma-archivo').onchange = e => subirFirma(r, e.target);
  if ($('#firma-ver')) $('#firma-ver').onclick = e => conBoton(e.target, () => abrirFirma(r, false));
  if ($('#firma-bajar')) $('#firma-bajar').onclick = e => conBoton(e.target, () => abrirFirma(r, true));
}

const MAX_MB = 6;
function subirFirma(r, input) {
  const archivo = input.files[0];
  input.value = '';
  if (!archivo) return;
  if (!(archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name))) { toast('El archivo debe ser un PDF', 'error'); return; }
  if (archivo.size > MAX_MB * 1048576) { toast(`El PDF pesa ${(archivo.size / 1048576).toFixed(1)} MB; máximo ${MAX_MB} MB.`, 'error'); return; }
  toast('Subiendo PDF firmado…');
  conBoton(null, () => new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onerror = () => mal(new Error('No se pudo leer el archivo'));
    lector.onload = () => llamar('subirFirmaNR', { nr_id: r.id, nombre: archivo.name, pdf_b64: lector.result })
      .then(() => { toast('PDF firmado guardado', 'ok'); ok(); }, mal);
    lector.readAsDataURL(archivo);
  }));
}

// Une los trozos guardados en Firestore y abre o descarga el PDF
async function abrirFirma(r, descargar) {
  const clave = `nr_${r.id}`;
  const meta = await getDoc(doc(db, 'archivos', clave));
  if (!meta.exists()) throw new Error('No se encontró el PDF firmado');
  const partes = await Promise.all(Array.from({ length: meta.data().n }, (_, i) => getDoc(doc(db, 'archivos', `${clave}__${i}`))));
  const bin = atob(partes.map(p => p.data().d).join(''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const nombre = `${r.numero} firmada.pdf`;
  if (descargar || !window.open(url, '_blank')) {
    const a = document.createElement('a'); a.href = url; a.download = nombre; a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
