// Reglas compartidas entre la app (navegador) y las Cloud Functions.
// Fuente única: public/js/comun.js. functions/comun.js es una copia (scripts/sync-comun.sh).

export const CATEGORIAS = ['Equipo', 'Accesorio'];
export const CONDICIONES = ['OK', 'Dañado', 'Faltante'];
export const ESTADOS = {
  oficina: 'En oficina',
  demostracion: 'En demostración',
  servicio: 'En servicio técnico',
  vendido: 'Vendido',
  baja: 'Baja',
};
export const CLAVES_STOCK = Object.keys(ESTADOS);
// Cómo se muestra el estado de una NE: abierta mientras haya algo afuera, cerrada al retirarse todo
export const ESTADO_VISIBLE = { Borrador: 'Borrador', Entregada: 'Abierta', 'Devuelta parcial': 'Abierta', Devuelta: 'Cerrada', Anulada: 'Anulada' };

export function stockVacio() {
  return { oficina: 0, demostracion: 0, servicio: 0, vendido: 0, baja: 0 };
}

export function estadoDe(stock) {
  const con = CLAVES_STOCK.filter(k => (stock?.[k] || 0) > 0);
  if (con.length === 1) return ESTADOS[con[0]];
  if (con.length === 0) return ESTADOS.baja;
  return 'Mixto';
}

export function normTxt(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
export function normSerie(s) {
  return String(s ?? '').toUpperCase().replace(/\s+/g, '').trim();
}
export const claveModelo = modelo => normTxt(modelo);

export function normCategoria(v) {
  const t = normTxt(v);
  if (t === 'equipo' || t === 'equipos') return 'Equipo';
  if (t === 'accesorio' || t === 'accesorios') return 'Accesorio';
  return null;
}

// Valida los datos de un ítem. Devuelve { errores: [], item }
export function validarItem(d) {
  const errores = [];
  const categoria = normCategoria(d.categoria);
  if (!categoria) errores.push(`Categoría inválida ("${d.categoria ?? ''}"): debe ser Equipo o Accesorio`);
  const marca = String(d.marca ?? '').trim();
  const modelo = String(d.modelo ?? '').trim();
  const descripcion = String(d.descripcion ?? '').trim();
  if (!modelo && !descripcion) errores.push('Falta modelo o descripción');
  const serieTxt = String(d.numero_serie ?? '').trim();
  const numero_serie = serieTxt || null;
  let cantidad = d.cantidad === '' || d.cantidad == null ? 1 : Number(d.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1) errores.push(`Cantidad inválida ("${d.cantidad}")`);
  else if (numero_serie && cantidad !== 1) errores.push('Un ítem con número de serie debe tener cantidad 1');
  else if (cantidad > 1 && categoria === 'Equipo') errores.push('Los equipos van uno por registro (cantidad 1)');
  let compatibles = [];
  if (categoria === 'Accesorio') {
    const lista = Array.isArray(d.compatibles) ? d.compatibles : String(d.compatibles ?? '').split(/[,;\n/]+/);
    compatibles = [...new Set(lista.map(claveModelo).filter(Boolean))];
  }
  const item = {
    categoria, marca, modelo, descripcion, numero_serie,
    serie_norm: numero_serie ? normSerie(numero_serie) : null,
    modelo_clave: categoria === 'Equipo' ? claveModelo(modelo) : null,
    compatibles,
    cantidad,
    notas: String(d.notas ?? '').trim(),
  };
  return { errores, item };
}

export function textoItem(it) {
  return [it.descripcion, it.marca && it.modelo ? `${it.marca} ${it.modelo}` : it.modelo].filter(Boolean).join(' · ');
}

// ---- Notas de entrega ----
export function pendienteLinea(l) {
  return l.cantidad - (l.devuelto_ok || 0) - (l.devuelto_danado || 0) - (l.faltante || 0) - (l.cerrado_sin_retorno || 0);
}
export function cerradoLinea(l) {
  return (l.devuelto_ok || 0) + (l.devuelto_danado || 0) + (l.cerrado_sin_retorno || 0);
}
// Estado de una NE emitida según sus líneas
export function estadoNE(lineas) {
  const total = lineas.reduce((s, l) => s + l.cantidad, 0);
  const cerrado = lineas.reduce((s, l) => s + cerradoLinea(l), 0);
  const tocado = lineas.reduce((s, l) => s + cerradoLinea(l) + (l.faltante || 0), 0);
  if (cerrado >= total) return 'Devuelta';
  if (tocado > 0) return 'Devuelta parcial';
  return 'Entregada';
}
export const numeroDoc = (prefijo, n, digitos = 5) => `${prefijo}${String(n).padStart(digitos, '0')}`;

export function fechaValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
