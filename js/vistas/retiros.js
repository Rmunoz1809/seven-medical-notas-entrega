// Registrar el retiro de una Nota de Entrega: qué regresa y en qué condición.
// El retiro queda anotado dentro de la misma Nota de Entrega (no hay notas de retiro aparte).
import { llamar } from '../fb.js?v=9cf195a';
import { nota } from '../datos.js?v=9cf195a';
import { pendienteLinea, CONDICIONES } from '../comun.js?v=9cf195a';
import { $, $$, esc, toast, confirmar, conBoton, hoyISO } from '../ui.js?v=9cf195a';
import { ABIERTAS } from './dashboard.js?v=9cf195a';

export function vistaFormNR(neId, vista) {
  const n = nota(neId);
  if (!n || !ABIERTAS.includes(n.estado)) {
    $('#titulo').textContent = 'Registrar retiro';
    vista.innerHTML = '<div class="vacio">Solo se registran retiros de notas de entrega abiertas.</div>';
    return;
  }
  $('#titulo').textContent = `Registrar retiro · ${n.numero}`;
  // también las faltantes: si aparecen después, se retiran aquí
  const afuera = l => pendienteLinea(l) + (l.faltante || 0);
  const lineas = n.lineas.filter(l => afuera(l) > 0);
  vista.innerHTML = `
    <div class="card card-cuerpo"><div class="form">
      <label>Fecha de retiro *<input type="date" id="nr-fecha" value="${hoyISO()}"></label>
      <label>Persona que retira / recibe *<input id="nr-persona" placeholder="Nombre"></label>
      <label class="full">Notas<textarea id="nr-notas"></textarea></label>
    </div></div>
    <div class="card">
      <div class="card-cab"><h2>¿Qué se retira?</h2><span class="muted small">${esc(n.cliente?.nombre)}</span>
        <button class="btn btn-sm" id="nr-todo">Marcar todo OK</button></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Artículo</th><th>Serial</th><th class="num">Afuera</th><th class="num">Se retira</th><th>Condición</th><th>Observación</th></tr></thead>
        <tbody>${lineas.map(l => `<tr data-linea="${esc(l.linea_id)}">
          <td><b>${esc(l.modelo || l.descripcion)}</b><div class="sub-linea">${esc(l.descripcion)}</div></td>
          <td class="nowrap">${esc(l.numero_serie || '—')}</td>
          <td class="num">${afuera(l)}${l.faltante ? `<div class="sub-linea">${l.faltante} faltante</div>` : ''}</td>
          <td class="num"><input type="number" min="0" max="${afuera(l)}" value="0" class="nr-cant" style="width:70px"></td>
          <td><select class="nr-cond" style="min-width:110px">${CONDICIONES.map(c => `<option>${c}</option>`).join('')}</select></td>
          <td><input class="nr-obs" placeholder="Opcional"></td></tr>`).join('')
          || '<tr><td colspan="6" class="vacio">No quedan ítems afuera.</td></tr>'}</tbody>
      </table></div>
    </div>
    <p class="muted small">OK vuelve a "En oficina" · Dañado pasa a "En servicio técnico" · Faltante queda señalado para revisión y no vuelve al inventario disponible. Cuando se retira todo, la nota queda Cerrada.</p>
    <div class="acciones-form">
      <a class="btn" href="#/ne/${n.id}">Cancelar</a>
      <button class="btn btn-primary" id="nr-emitir">Registrar retiro</button>
    </div>`;
  $('#nr-todo').onclick = () => $$('tr[data-linea]').forEach(tr => {
    $('.nr-cant', tr).value = $('.nr-cant', tr).max;
    $('.nr-cond', tr).value = 'OK';
  });
  $('#nr-emitir').onclick = e => conBoton(e.target, async () => {
    const sel = $$('tr[data-linea]').map(tr => ({
      linea_id: tr.dataset.linea, cantidad: Number($('.nr-cant', tr).value) || 0,
      condicion: $('.nr-cond', tr).value, observacion: $('.nr-obs', tr).value,
    })).filter(x => x.cantidad > 0);
    if (!sel.length) throw new Error('Indica cuántas unidades se retiran de al menos un ítem.');
    if (!$('#nr-persona').value.trim()) throw new Error('Indica quién retira o recibe.');
    const resumen = CONDICIONES.map(c => [c, sel.filter(x => x.condicion === c).reduce((s, x) => s + x.cantidad, 0)])
      .filter(([, k]) => k).map(([c, k]) => `${k} ${c}`).join(', ');
    const ok = await confirmar('Registrar retiro', `Se marcará como retirado: <b>${esc(resumen)}</b>. ¿Continuar?`, { boton: 'Registrar' });
    if (!ok) return;
    await llamar('emitirNR', { ne_id: n.id, fecha_retiro: $('#nr-fecha').value, persona: $('#nr-persona').value,
      notas: $('#nr-notas').value, lineas: sel });
    toast(`Retiro registrado en ${n.numero}`, 'ok');
    location.hash = '#/ne/' + n.id;
  });
  return { conForm: true };
}
