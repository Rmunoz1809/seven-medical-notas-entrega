// Arranque: router por hash y repintado en tiempo real
import { nombreUsuario, EMULADOR } from './fb.js';
import { datos, suscribir, desuscribir, alCambiar } from './datos.js';
import { $, $$, esc, toast, abrirModal } from './ui.js';
import { vistaDashboard } from './vistas/dashboard.js';
import { vistaInventario, vistaItem } from './vistas/inventario.js';
import { vistaNotas, vistaNE, vistaFormNE } from './vistas/notas.js';
import { vistaFormNR, vistaRetiros, vistaNR } from './vistas/retiros.js';
import { vistaClientes } from './vistas/clientes.js';

const RUTAS = [
  [/^dashboard$/, vistaDashboard, 'dashboard'],
  [/^inventario$/, vistaInventario, 'inventario'],
  [/^item\/([\w-]+)$/, vistaItem, 'inventario'],
  [/^notas$/, vistaNotas, 'notas'],
  [/^ne\/(nueva)$/, (_, v) => vistaFormNE(null, v), 'notas'],
  [/^ne\/([\w-]+)\/editar$/, vistaFormNE, 'notas'],
  [/^ne\/([\w-]+)\/retiro$/, vistaFormNR, 'notas'],
  [/^ne\/([\w-]+)$/, vistaNE, 'notas'],
  [/^retiros$/, vistaRetiros, 'retiros'],
  [/^nr\/([\w-]+)$/, vistaNR, 'retiros'],
  [/^clientes$/, vistaClientes, 'clientes'],
];

// Las vistas con formulario no se repintan solas para no perder lo escrito
let vistaActual = null;
function render(forzar = true) {
  const ruta = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const vista = $('#vista');
  if (datos.error && !datos.listo) {
    $('#titulo').textContent = 'Error';
    $('#acciones').innerHTML = '';
    vista.innerHTML = `<div class="card card-cuerpo">No se pudo cargar la información: ${esc(datos.error.message)}</div>`;
    return;
  }
  if (!datos.listo) { vista.innerHTML = '<div class="vacio">Cargando…</div>'; return; }
  for (const [re, fn, nav] of RUTAS) {
    const m = ruta.match(re);
    if (!m) continue;
    $$('.sidebar nav a').forEach(a => a.classList.toggle('activo', a.dataset.nav === nav));
    const clave = ruta;
    if (!forzar && vistaActual?.clave === clave && vistaActual.conForm) return;
    $('#acciones').innerHTML = '';
    const r = fn(m[1], vista) || {};
    vistaActual = { clave, conForm: !!r.conForm };
    document.title = `${$('#titulo').textContent} · Notas de Entrega`;
    return;
  }
  location.hash = '#/dashboard';
}

window.addEventListener('hashchange', () => {
  $('#sidebar').classList.remove('abierto');
  window.scrollTo(0, 0);
  render(true);
});
alCambiar(() => render(false));

$('#btn-menu').onclick = () => $('#sidebar').classList.toggle('abierto');
$('#modal').addEventListener('click', e => {
  if (e.target.id === 'modal' || e.target.closest('[data-cerrar]')) import('./ui.js').then(u => u.cerrarModal());
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').hidden) import('./ui.js').then(u => u.cerrarModal());
});

// ---- Arranque (sin código de acceso). El nombre solo se usa en el historial.
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };
function pintarUsuario() {
  $('#usuario-nombre').textContent = nombreUsuario() || 'Poner mi nombre';
}
function pedirNombre(titulo = 'Tu nombre') {
  abrirModal(titulo, `<label>Nombre <span class="ayuda">(queda en el historial de movimientos de este dispositivo)</span>
    <input id="nombre-usuario" value="${esc(nombreUsuario())}" maxlength="60"></label>`, [
    { texto: 'Guardar', clase: 'btn-primary', accion: () => {
      const n = $('#nombre-usuario').value.trim();
      if (!n) throw new Error('Escribe tu nombre');
      guardar('ne_nombre', n.slice(0, 60)); pintarUsuario(); return true;
    } },
  ]);
}
$('#usuario-nombre').onclick = e => { e.preventDefault(); pedirNombre(); };

$('#app').hidden = false;
$('#modo-emulador').hidden = !EMULADOR;
pintarUsuario();
suscribir(() => render(true));
render(true);
if (!nombreUsuario()) pedirNombre('Bienvenido: ¿cómo te llamas?');
