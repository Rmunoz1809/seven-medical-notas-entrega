import { datos } from '../datos.js';
import { $, esc, cant, fecha, chip, diasEntre, hoyISO } from '../ui.js';

export const ABIERTAS = ['Entregada', 'Devuelta parcial'];
export const vencida = ne => ABIERTAS.includes(ne.estado) && ne.fecha_retorno_estimada < hoyISO();

export function vistaDashboard(_, vista) {
  $('#titulo').textContent = 'Dashboard';
  $('#acciones').innerHTML = '<a class="btn btn-primary" href="#/ne/nueva">+ Nueva NE</a>';

  // Unidades por estado, separando equipos y accesorios
  const cuenta = () => ({ Equipo: 0, Accesorio: 0 });
  const uni = { oficina: cuenta(), demostracion: cuenta(), servicio: cuenta(), faltante: cuenta() };
  for (const it of datos.items) {
    const cat = it.categoria === 'Equipo' ? 'Equipo' : 'Accesorio';
    for (const k of ['oficina', 'demostracion', 'servicio']) uni[k][cat] += it.stock?.[k] || 0;
    if (it.faltante?.cantidad) uni.faltante[cat] += it.faltante.cantidad;
  }
  const abiertas = datos.notas.filter(n => ABIERTAS.includes(n.estado))
    .map(n => ({ ...n, dias: diasEntre(n.fecha_entrega), vencida: vencida(n), atraso: diasEntre(n.fecha_retorno_estimada) }))
    .sort((a, b) => (b.vencida - a.vencida) || b.dias - a.dias);
  const vencidas = abiertas.filter(n => n.vencida);
  const faltantes = datos.items.filter(it => it.faltante?.cantidad);
  const borradores = datos.notas.filter(n => n.estado === 'Borrador');

  const kpi = (clase, etq, c, extra = '') => `<div class="card kpi ${clase}"><div class="etq">${etq}</div>
    <div class="valor">${cant(c.Equipo)} <span class="small muted">equipo${c.Equipo === 1 ? '' : 's'}</span></div>
    <div class="sub">${cant(c.Accesorio)} accesorio${c.Accesorio === 1 ? '' : 's'}${extra}</div></div>`;
  vista.innerHTML = `
    <div class="grid kpis">
      ${kpi('', 'En oficina', uni.oficina)}
      ${kpi('afuera', 'Afuera (demostración)', uni.demostracion, ` · ${abiertas.length} NE abierta${abiertas.length === 1 ? '' : 's'}`)}
      ${kpi('servicio', 'En servicio técnico', uni.servicio)}
      ${kpi('faltante', 'Faltantes por revisar', uni.faltante)}
    </div>
    ${vencidas.length ? `<div class="aviso aviso-rojo" style="margin-top:16px"><b>${vencidas.length} NE vencida${vencidas.length > 1 ? 's' : ''}</b>: pasó la fecha estimada de retorno.</div>` : ''}
    <div class="card" style="margin-top:16px">
      <div class="card-cab"><h2>NE abiertas</h2><span class="muted small">${abiertas.length} nota(s)</span></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Número</th><th>Cliente / lugar</th><th>Entrega</th><th class="num">Días afuera</th><th>Retorno estimado</th><th class="num ocultar-movil">Ítems</th><th>Estado</th></tr></thead>
        <tbody>${abiertas.map(n => `
          <tr class="click ${n.vencida ? 'vencida' : ''}" onclick="location.hash='#/ne/${n.id}'">
            <td class="nowrap"><b>${esc(n.numero)}</b></td>
            <td>${esc(n.cliente?.nombre)}<div class="sub-linea">${esc(n.direccion)}</div></td>
            <td class="nowrap">${fecha(n.fecha_entrega)}</td>
            <td class="num"><b>${n.dias}</b></td>
            <td class="nowrap">${fecha(n.fecha_retorno_estimada)}${n.vencida ? `<div>${chip(`Vencida hace ${n.atraso} día${n.atraso === 1 ? '' : 's'}`, 'rojo')}</div>` : ''}</td>
            <td class="num ocultar-movil">${n.lineas.reduce((t, l) => t + l.cantidad, 0)}</td>
            <td>${chip(n.estado)}</td>
          </tr>`).join('') || '<tr><td colspan="7" class="vacio">No hay equipos afuera.</td></tr>'}
        </tbody>
      </table></div>
    </div>
    ${faltantes.length ? `<div class="card">
      <div class="card-cab"><h2>Faltantes por revisar</h2></div>
      <div class="tabla-wrap"><table><thead><tr><th>Ítem</th><th>Serial</th><th class="num">Cant.</th><th>Nota de entrega</th><th>Desde</th></tr></thead><tbody>
      ${faltantes.map(it => `<tr class="click" onclick="location.hash='#/item/${it.id}'">
        <td>${esc(it.modelo || it.descripcion)}<div class="sub-linea">${esc(it.descripcion)}</div></td>
        <td>${esc(it.numero_serie || '—')}</td><td class="num">${it.faltante.cantidad}</td>
        <td>${esc(it.faltante.ne_numero)}</td><td>${fecha(it.faltante.desde)}</td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
    ${borradores.length ? `<div class="card">
      <div class="card-cab"><h2>Borradores sin emitir</h2></div>
      <div class="tabla-wrap"><table><tbody>${borradores.map(n => `<tr class="click" onclick="location.hash='#/ne/${n.id}'">
        <td>${chip('Borrador')}</td><td>${esc(n.cliente?.nombre)}</td><td>${fecha(n.fecha_entrega)}</td><td class="num">${n.lineas.length} ítems</td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
  `;
}
