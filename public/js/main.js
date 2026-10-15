// Arranque: router por hash y repintado en tiempo real
import { db, nombreUsuario, EMULADOR } from './fb.js';
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { normTxt } from './comun.js';
import { datos, suscribir, desuscribir, alCambiar } from './datos.js';
import { $, $$, esc, toast, abrirModal, cerrarModal } from './ui.js';
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

// ---- Arranque (sin código de acceso). Los nombres quedan guardados en la base de datos (usuarios/):
// quien entra elige su nombre de la lista con un toque; este dispositivo además lo recuerda.
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };
const claveUsuario = n => normTxt(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sin-nombre';
function pintarUsuario() {
  $('#usuario-nombre').textContent = nombreUsuario() || 'Poner mi nombre';
}
// Registra (o actualiza) el nombre en la base de datos y lo recuerda en este dispositivo
async function usarNombre(nombre) {
  const n = nombre.trim().slice(0, 60);
  guardar('ne_nombre', n);
  pintarUsuario();
  const ref = doc(db, 'usuarios', claveUsuario(n));
  const previo = await getDoc(ref).catch(() => null);
  await setDoc(ref, { nombre: n, ultimo_ingreso: serverTimestamp(), ...(previo?.exists() ? {} : { creado_en: serverTimestamp() }) }, { merge: true })
    .catch(e => console.warn('No se pudo guardar el usuario', e));
}
async function pedirNombre(titulo = '¿Quién eres?') {
  const lista = await getDocs(collection(db, 'usuarios'))
    .then(s => s.docs.map(d => d.data().nombre).filter(Boolean).sort((a, b) => a.localeCompare(b)))
    .catch(() => []);
  const cuerpo = abrirModal(titulo, `
    ${lista.length ? `<p style="margin-top:0">Elige tu nombre:</p>
      <div class="sugerencias" style="margin-bottom:16px">${lista.map((n, i) => `<button class="btn" data-usuario="${i}">${esc(n)}</button>`).join('')}</div>` : ''}
    <label>${lista.length ? '¿No estás en la lista? Escribe tu nombre' : 'Tu nombre'} <span class="ayuda">(queda guardado para la próxima vez)</span>
      <input id="nombre-usuario" maxlength="60" autocomplete="name"></label>`, [
    { texto: 'Guardar', clase: 'btn-primary', accion: async () => {
      const n = $('#nombre-usuario').value.trim();
      if (!n) throw new Error(lista.length ? 'Elige tu nombre o escríbelo' : 'Escribe tu nombre');
      await usarNombre(n);
      return true;
    } },
  ]);
  $$('[data-usuario]', cuerpo).forEach(b => {
    b.onclick = async () => { await usarNombre(lista[Number(b.dataset.usuario)]); cerrarModal(); };
  });
}
$('#usuario-nombre').onclick = e => { e.preventDefault(); pedirNombre('Cambiar de usuario'); };

$('#app').hidden = false;
$('#modo-emulador').hidden = !EMULADOR;
pintarUsuario();
suscribir(() => render(true));
render(true);
if (!nombreUsuario()) pedirNombre('Bienvenido: ¿quién eres?');
else usarNombre(nombreUsuario()); // lo registra en la base de datos si venía solo de este dispositivo
