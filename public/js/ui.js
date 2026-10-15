// Utilidades de interfaz compartidas por las vistas
import { ESTADOS } from './comun.js';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const cant = n => (Number(n) || 0).toLocaleString('en-US');

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// "2026-10-09" -> "09 oct 2026"
export function fecha(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return a && m && d ? `${d} ${MESES[Number(m) - 1]} ${a}` : String(iso);
}
export function fechaHora(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${fecha(hoyISO(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function sumarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return hoyISO(d);
}
export function diasEntre(desde, hasta = hoyISO()) {
  return Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 86400000);
}

const CHIP_ESTADO = {
  [ESTADOS.oficina]: 'verde', [ESTADOS.demostracion]: 'azul', [ESTADOS.servicio]: 'naranja',
  [ESTADOS.vendido]: 'gris', [ESTADOS.baja]: 'gris', Mixto: 'amarillo',
  Borrador: 'gris', Entregada: 'azul', 'Devuelta parcial': 'amarillo', Devuelta: 'verde', Anulada: 'rojo', Emitida: 'verde',
  OK: 'verde', 'Dañado': 'naranja', Faltante: 'rojo',
};
export const chip = (texto, color) => `<span class="chip chip-${color || CHIP_ESTADO[texto] || 'gris'}">${esc(texto)}</span>`;

export function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 7000 : 3500);
}

// Modal genérico. botones: [{texto, clase, accion: async () => bool (true = cerrar)}]
let alCerrar = null;
export function abrirModal(titulo, cuerpoHTML, botones = [], { ancho } = {}) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-cuerpo').innerHTML = cuerpoHTML;
  const pie = $('#modal-pie');
  pie.innerHTML = '';
  $('#modal .modal').style.maxWidth = ancho || '';
  for (const b of botones) {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.clase || '');
    el.textContent = b.texto;
    el.onclick = async () => {
      if (!b.accion) return cerrarModal();
      el.disabled = true;
      try { if (await b.accion()) cerrarModal(); }
      catch (e) { toast(e.message, 'error'); }
      finally { el.disabled = false; }
    };
    pie.appendChild(el);
  }
  $('#modal').hidden = false;
  setTimeout(() => $('#modal-cuerpo input:not([type=hidden]), #modal-cuerpo select, #modal-cuerpo textarea')?.focus(), 30);
  return $('#modal-cuerpo');
}
export function cerrarModal() {
  $('#modal').hidden = true;
  if (alCerrar) { const f = alCerrar; alCerrar = null; f(); }
}

// Pide confirmación (y opcionalmente un texto obligatorio). Devuelve false o el texto/true.
export function confirmar(titulo, mensajeHTML, { boton = 'Confirmar', clase = 'btn-primary', pedirTexto = null } = {}) {
  return new Promise(resolve => {
    let resuelto = false;
    const fin = v => { if (!resuelto) { resuelto = true; resolve(v); } };
    alCerrar = () => fin(false);
    abrirModal(titulo, `<p style="margin-top:0">${mensajeHTML}</p>${pedirTexto ? `<label>${esc(pedirTexto)}<textarea id="conf-texto"></textarea></label>` : ''}`, [
      { texto: 'Cancelar' },
      { texto: boton, clase, accion: () => {
        const t = pedirTexto ? $('#conf-texto').value.trim() : true;
        if (pedirTexto && !t) throw new Error('Escribe el ' + pedirTexto.toLowerCase());
        alCerrar = null; fin(t); return true;
      } },
    ]);
  });
}

// Ejecuta una acción con el botón deshabilitado y muestra el error si falla
export async function conBoton(boton, fn) {
  const txt = boton?.textContent;
  if (boton) { boton.disabled = true; boton.textContent = 'Procesando…'; }
  try { return await fn(); }
  catch (e) { toast(e.message, 'error'); return undefined; }
  finally { if (boton) { boton.disabled = false; boton.textContent = txt; } }
}

// Autocompletar sobre una lista en memoria
export function autocompletar(input, { buscar, render, elegir }) {
  const caja = document.createElement('div');
  caja.className = 'ac-lista';
  caja.hidden = true;
  input.parentElement.classList.add('ac');
  input.parentElement.appendChild(caja);
  let ops = [], sel = -1;
  const pintar = () => {
    ops = buscar(input.value).slice(0, 40);
    sel = -1;
    caja.innerHTML = ops.length ? ops.map((o, i) => `<div class="ac-op" data-i="${i}">${render(o)}</div>`).join('')
      : '<div class="ac-op muted">Sin resultados</div>';
    caja.hidden = false;
  };
  input.addEventListener('input', pintar);
  input.addEventListener('focus', pintar);
  input.addEventListener('blur', () => setTimeout(() => { caja.hidden = true; }, 150));
  input.addEventListener('keydown', e => {
    if (caja.hidden || !ops.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length;
      $$('.ac-op', caja).forEach((el, i) => el.classList.toggle('sel', i === sel));
    } else if (e.key === 'Enter' && sel >= 0) {
      e.preventDefault(); elegir(ops[sel]); caja.hidden = true;
    }
  });
  caja.addEventListener('mousedown', e => {
    const op = e.target.closest('.ac-op[data-i]');
    if (op) { e.preventDefault(); elegir(ops[Number(op.dataset.i)]); caja.hidden = true; }
  });
}

export const coincide = (texto, q) => {
  const n = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = n(texto);
  return n(q).split(/\s+/).filter(Boolean).every(p => t.includes(p));
};
