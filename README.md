# Notas de Entrega · Seven Medical

Inventario de equipos de demostración (Mindray) y Notas de Entrega / Retiro con PDF.

- **Página:** publicada con GitHub Pages desde la rama `gh-pages` (contenido de `public/`).
- **Datos:** Firestore del proyecto `seven-medical-st` (plan gratuito). Sin login: quien tiene el enlace de la página puede usarla.
- `public/js/operaciones.js`: todo lo que mueve inventario, dentro de transacciones de Firestore (si dos personas emiten a la vez con el mismo ítem, solo una pasa).
- `public/js/comun.js`: reglas de validación compartidas.
- `firestore.rules`: no permiten borrar documentos y exigen la forma básica de cada registro. Deben ser IGUALES a `../Seven Medical/firestore.rules`.

## Funciones
- Inventario por número de serie (equipos y accesorios/transductores con sus modelos compatibles) e historial por ítem.
- Nota de Entrega: borrador → emitir (número correlativo; los ítems pasan a "En demostración") → PDF.
- Nota de Retiro: OK vuelve a oficina, Dañado a servicio técnico, Faltante queda señalado. Se sube el PDF firmado.
- Anular una NE solo si no tiene retiros. Nada se borra.

## Probar en local (emulador, sin tocar producción)
```bash
bash scripts/dev.sh                                    # emulador + http://localhost:5055
node scripts/seed.js                                   # cliente de prueba
node scripts/cargar-inventario.js "<Excel inventario>" # carga el Excel de inventario (formato oct 2026)
bash scripts/test.sh                                   # tests de operaciones y reglas
```

## Publicar
- Reglas: `bash -c 'source scripts/env.sh && $FIREBASE deploy --project seven-medical-st --only firestore:rules'`
- Página: `bash scripts/publicar.sh` (actualiza la rama `gh-pages`).
- Inventario: `node scripts/cargar-inventario.js "<Excel>" --produccion`
