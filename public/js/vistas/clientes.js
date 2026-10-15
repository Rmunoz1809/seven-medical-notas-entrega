import { db, nombreUsuario } from '../fb.js';
import { collection, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { datos } from '../datos.js';
import { normTxt } from '../comun.js';
import { $, esc, abrirModal, toast, coincide } from '../ui.js';

let q = '';
const CAMPOS = [['nombre', 'Nombre / empresa *'], ['contacto', 'Contacto'], ['telefono', 'Teléfono'], ['email', 'Email'], ['ruc', 'RUC'], ['direccion', 'Dirección']];

export function vistaClientes(_, vista) {
  $('#titulo').textContent = 'Clientes';
  $('#acciones').innerHTML = '<button class="btn btn-primary" id="btn-nuevo-cli">+ Nuevo cliente</button>';
  $('#btn-nuevo-cli').onclick = () => formCliente(null);
  vista.innerHTML = `<div class="card">
    <div class="filtros"><input type="search" id="f-q" placeholder="Buscar cliente, contacto o RUC" value="${esc(q)}"></div>
    <div class="tabla-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th class="ocultar-movil">Teléfono</th><th class="ocultar-movil">Dirección</th><th class="num">NE</th></tr></thead>
    <tbody id="cli-filas"></tbody></table></div></div>
`;
  const usos = new Map();
  datos.notas.forEach(n => usos.set(n.cliente_id, (usos.get(n.cliente_id) || 0) + 1));
  const pintar = () => {
    const lista = datos.clientes.filter(c => !q || coincide(`${c.nombre} ${c.contacto} ${c.ruc} ${c.email}`, q));
    $('#cli-filas').innerHTML = lista.slice(0, 300).map(c => `<tr class="click" data-id="${c.id}">
      <td><b>${esc(c.nombre)}</b>${c.email ? `<div class="sub-linea">${esc(c.email)}</div>` : ''}</td>
      <td>${esc(c.contacto)}</td><td class="ocultar-movil">${esc(c.telefono)}</td><td class="ocultar-movil">${esc(c.direccion)}</td>
      <td class="num">${usos.get(c.id) || ''}</td></tr>`).join('')
      + (lista.length > 300 ? `<tr><td colspan="5" class="muted small">Mostrando 300 de ${lista.length}; usa el buscador.</td></tr>` : '')
      || '<tr><td colspan="5" class="vacio">Sin clientes.</td></tr>';
    vista.querySelectorAll('tr[data-id]').forEach(tr => { tr.onclick = () => formCliente(datos.clientes.find(c => c.id === tr.dataset.id)); });
  };
  $('#f-q').oninput = e => { q = e.target.value; pintar(); };
  pintar();
}

export function formCliente(c, alGuardar) {
  abrirModal(c ? 'Editar cliente' : 'Nuevo cliente', `<div class="form">
    ${CAMPOS.map(([k, t]) => `<label class="${k === 'nombre' || k === 'direccion' ? 'full' : ''}">${t}<input id="cl-${k}" value="${esc(c?.[k])}"></label>`).join('')}
    <label class="full">Notas<textarea id="cl-notas">${esc(c?.notas)}</textarea></label></div>`, [
    { texto: 'Cancelar' },
    { texto: 'Guardar', clase: 'btn-primary', accion: async () => {
      const d = Object.fromEntries([...CAMPOS.map(([k]) => k), 'notas'].map(k => [k, $('#cl-' + k).value.trim()]));
      if (!d.nombre) throw new Error('El nombre es obligatorio');
      const dup = datos.clientes.find(x => x.id !== c?.id && normTxt(x.nombre) === normTxt(d.nombre));
      if (dup) throw new Error('Ya existe un cliente con ese nombre');
      const ref = c ? doc(db, 'clientes', c.id) : doc(collection(db, 'clientes'));
      await setDoc(ref, { ...d, actualizado_en: serverTimestamp(), actualizado_por: (nombreUsuario() || 'Sin nombre'),
        ...(c ? {} : { creado_en: serverTimestamp(), creado_por: (nombreUsuario() || 'Sin nombre'), origen: 'manual' }) }, { merge: true });
      toast('Cliente guardado', 'ok');
      alGuardar?.({ id: ref.id, ...d });
      return true;
    } },
  ]);
}
