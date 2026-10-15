# Notas de Entrega · Seven Medical

Inventario de equipos de demostración (Mindray) y Notas de Entrega / Retiro con PDF.

- **Página:** publicada con GitHub Pages desde la rama `gh-pages` (contenido de `public/`).
- **Datos:** Firestore del proyecto `seven-medical-st` (plan gratuito). Sin login: quien tiene el enlace de la página puede usarla.
- `public/js/operaciones.js`: todo lo que mueve inventario, dentro de transacciones de Firestore (si dos personas emiten a la vez con el mismo ítem, solo una pasa).
- `public/js/comun.js`: reglas de validación compartidas.
- `firestore.rules`: no permiten borrar documentos y exigen la forma básica de cada registro. Deben ser IGUALES a `../Seven Medical/firestore.rules`.

## Funciones
- Inventario por número de serie (equipos y accesorios/transductores con sus modelos compatibles) e historial por ítem.
- Nota de Entrega: borrador → emitir (número correlativo; los ítems pasan a "En demostración") → PDF → se sube el PDF firmado.
- Retiro dentro de la misma NE: qué se retira y en qué condición (OK vuelve a oficina, Dañado a servicio técnico, Faltante queda señalado). La NE queda Abierta mientras haya algo afuera y Cerrada al retirarse todo.
- Inventario → ítem → "Marcar como vendido": se eligen los transductores que se venden con el equipo (o se agregan los que no estaban) y quedan todos como vendidos, con cliente y fecha.
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
- Página: `bash scripts/publicar.sh` (actualiza la rama `gh-pages`; versiona los JS/CSS para que nadie quede con una copia vieja).
- Inventario: `node scripts/cargar-inventario.js "<Excel>" --produccion`
