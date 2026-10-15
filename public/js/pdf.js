// PDF de Nota de Entrega y Nota de Retiro (pdfmake), réplica del formato OV00279
import { fecha } from './ui.js';

let recursos = null;
async function base64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo cargar ' + url);
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function cargarRecursos() {
  recursos ||= (async () => {
    if (!window.pdfMake) throw new Error('El generador de PDF no cargó; recarga la página.');
    const [light, regular, semibold, logo] = await Promise.all(
      ['fonts/OpenSans-Light.ttf', 'fonts/OpenSans-Regular.ttf', 'fonts/OpenSans-SemiBold.ttf', 'img/logo.png'].map(base64));
    return {
      vfs: { 'OS-L.ttf': light, 'OS-R.ttf': regular, 'OS-SB.ttf': semibold },
      fonts: {
        OpenSans: { normal: 'OS-R.ttf', bold: 'OS-SB.ttf', italics: 'OS-R.ttf', bolditalics: 'OS-SB.ttf' },
        OpenSansLight: { normal: 'OS-L.ttf', bold: 'OS-R.ttf', italics: 'OS-L.ttf', bolditalics: 'OS-R.ttf' },
      },
      logo: 'data:image/png;base64,' + logo,
    };
  })().catch(e => { recursos = null; throw e; });
  return recursos;
}

const GRIS = '#333333';
const GRIS2 = '#6b6b6b';
const LINEA = '#9a9a9a';
const dec = n => (Number(n) || 0).toFixed(2);

function cabecera(r, titulo, numero) {
  return {
    columns: [
      { image: r.logo, width: 150, margin: [0, 2, 0, 0] },
      { stack: [
        { text: titulo, font: 'OpenSansLight', fontSize: 26, alignment: 'right', color: GRIS },
        { text: numero ? `N° ${numero}` : 'BORRADOR — sin número', bold: true, fontSize: 9, alignment: 'right', margin: [0, 2, 0, 0] },
      ] },
    ],
  };
}

function bloqueCliente(cliente, direccion, filasDerecha) {
  const dir = String(direccion || '').split(/\n|,\s*(?=[^,]*$)/).map(s => s.trim()).filter(Boolean);
  return {
    margin: [0, 34, 0, 0],
    columns: [
      { width: '*', stack: [
        { text: 'Cliente:', fontSize: 9.5, color: GRIS, margin: [0, 0, 0, 4] },
        { text: cliente?.nombre || '', bold: true, fontSize: 9 },
        ...dir.map(t => ({ text: t, fontSize: 11, color: GRIS })),
      ] },
      { width: 'auto', table: { body: filasDerecha.map(([e, v]) => [
        { text: e, fontSize: 9.5, color: GRIS2, alignment: 'right', margin: [0, 2, 8, 0] },
        { text: v, fontSize: 11, alignment: 'right', color: GRIS },
      ]) }, layout: 'noBorders', margin: [0, 14, 0, 0] },
    ],
  };
}

function tablaArticulos(lineas, { extraCol } = {}) {
  const cabeza = ['#', 'Artículo & Descripción'];
  if (extraCol) cabeza.push(extraCol.titulo);
  cabeza.push('Cant.');
  const widths = [24, '*', ...(extraCol ? [62] : []), 42];
  const body = [cabeza.map((t, i) => ({ text: t, color: '#ffffff', fontSize: 9, margin: [i === 1 ? 4 : 0, 5, 0, 5],
    alignment: i === 0 ? 'center' : i >= 2 ? 'right' : 'left', fillColor: '#5b5b5b' }))];
  lineas.forEach((l, i) => {
    const detalle = [
      { text: l.descripcion || l.modelo, fontSize: 9.5, color: GRIS },
      l.modelo ? { text: [l.marca ? `Marca ${l.marca} ` : '', `Modelo ${l.modelo}`].join(''), fontSize: 8, color: GRIS } : null,
      l.numero_serie ? { text: `SN: ${l.numero_serie}`, fontSize: 8, color: GRIS } : null,
      l.observacion ? { text: `Obs.: ${l.observacion}`, fontSize: 8, italics: true, color: GRIS2 } : null,
    ].filter(Boolean);
    const fila = [
      { text: String(i + 1), alignment: 'center', fontSize: 9.5, color: GRIS2 },
      { stack: detalle, margin: [4, 0, 0, 0] },
    ];
    if (extraCol) fila.push({ text: extraCol.valor(l), alignment: 'right', fontSize: 9.5, color: GRIS });
    fila.push({ text: dec(l.cantidad), alignment: 'right', fontSize: 9.5, color: GRIS });
    body.push(fila.map(c => ({ ...c, margin: [c.margin?.[0] || 0, 9, 0, 9] })));
  });
  return {
    margin: [0, 16, 0, 0],
    table: { headerRows: 1, widths, body, dontBreakRows: true },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === 1 ? 0 : 0.8),
      vLineWidth: () => 0,
      hLineColor: () => LINEA,
      paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 0, paddingBottom: () => 0,
    },
  };
}

function firmas(izq, der) {
  const firma = t => ({ stack: [
    { text: ' ', margin: [0, 26, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.8 }] },
    { text: t, fontSize: 9.5, color: GRIS, margin: [0, 4, 0, 0] },
  ] });
  return {
    margin: [0, 30, 0, 0], unbreakable: true,
    columns: [
      firma(izq),
      { stack: [firma(der), { text: 'Nombre y cédula: ______________________________', fontSize: 8.5, color: GRIS2, margin: [0, 10, 0, 0] }] },
    ],
  };
}

function documento(r, contenido, { borrador }) {
  return {
    pageSize: 'A4', pageMargins: [48, 48, 48, 60],
    defaultStyle: { font: 'OpenSans', fontSize: 10, color: GRIS, lineHeight: 1.15 },
    watermark: borrador ? { text: 'BORRADOR', color: '#c0392b', opacity: 0.08, bold: true } : undefined,
    footer: (pag) => ({ margin: [44, 18, 44, 0], stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 507, y2: 0, lineWidth: 0.8, lineColor: LINEA }] },
      { text: String(pag), alignment: 'right', fontSize: 7.5, color: GRIS2, margin: [0, 8, 0, 0] },
    ] }),
    content: contenido,
  };
}

function entregar(dd, r, nombre, modo) {
  const pdf = window.pdfMake.createPdf(dd, null, r.fonts, r.vfs);
  if (modo === 'descargar') return pdf.download(nombre);
  // Abre una pestaña nueva (o descarga si el navegador la bloquea)
  return new Promise(ok => pdf.getBlob(blob => {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    ok();
  }));
}

// Registro de retiros dentro de la NE: qué se retiró, cuándo, quién y en qué condición
function bloqueRetiros(retiros) {
  if (!retiros.length) return [];
  const filas = retiros.flatMap(r => r.lineas.map(l => [
    { text: fecha(r.fecha_retiro), fontSize: 9 },
    { stack: [{ text: l.descripcion || l.modelo, fontSize: 9 }, l.numero_serie ? { text: `SN: ${l.numero_serie}`, fontSize: 8, color: GRIS2 } : null,
      l.observacion ? { text: `Obs.: ${l.observacion}`, fontSize: 8, italics: true, color: GRIS2 } : null].filter(Boolean) },
    { text: dec(l.cantidad), fontSize: 9, alignment: 'right' },
    { text: l.condicion, fontSize: 9 },
    { text: r.persona, fontSize: 9 },
  ]));
  return [
    { text: 'Retiro', fontSize: 10, margin: [0, 26, 0, 6] },
    { table: { headerRows: 1, widths: [62, '*', 34, 52, 100],
      body: [['Fecha', 'Artículo', 'Cant.', 'Condición', 'Retiró / recibió'].map((t, i) => ({ text: t, color: '#ffffff', fillColor: '#5b5b5b', fontSize: 8.5, alignment: i === 2 ? 'right' : 'left' })), ...filas] },
      layout: { hLineWidth: (i) => (i < 2 ? 0 : 0.6), vLineWidth: () => 0, hLineColor: () => LINEA, paddingTop: () => 4, paddingBottom: () => 4 } },
  ];
}

const archivo = s => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';

export async function pdfNE(n, modo = 'ver', retiros = []) {
  const r = await cargarRecursos();
  const total = n.lineas.reduce((s, l) => s + l.cantidad, 0);
  const contenido = [
    cabecera(r, 'NOTA DE ENTREGA', n.numero),
    bloqueCliente(n.cliente, n.direccion, [
      ['Fecha :', fecha(n.fecha_entrega)],
      ['Vendedor :', [n.vendedor?.nombre, n.vendedor?.telefono].filter(Boolean).join('\n')],
      ['Retorno estimado :', fecha(n.fecha_retorno_estimada)],
    ]),
    { text: 'Por medio del presente documento hacemos constar la entrega de un equipo de Ultrasonido, en calidad de demostración con la siguiente configuración:',
      fontSize: 11, margin: [0, 22, 0, 0] },
    tablaArticulos(n.lineas),
    { columns: [
      { text: [{ text: 'Artículos en total ', color: '#000' }, { text: dec(total), color: GRIS2 }], fontSize: 9, margin: [2, 6, 0, 0] },
    ] },
    { text: 'Notas', fontSize: 10, margin: [0, 30, 0, 6] },
    { text: n.motivo || ' ', fontSize: 9, color: GRIS },
    ...bloqueRetiros(retiros),
    firmas('Firma autorizada', 'Recibido por'),
  ];
  const dd = documento(r, contenido, { borrador: !n.numero });
  return entregar(dd, r, archivo(`${n.numero || 'Borrador'} Nota de Entrega ${n.cliente?.nombre || ''}`), modo);
}
