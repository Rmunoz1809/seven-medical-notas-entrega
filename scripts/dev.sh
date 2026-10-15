#!/bin/bash
# Emulador de Firestore + la página en http://localhost:5055 (datos de prueba en emulador-datos/)
cd "$(dirname "$0")/.." && source scripts/env.sh
mkdir -p emulador-datos
IMPORT=""; [ -f emulador-datos/firebase-export-metadata.json ] && IMPORT="--import emulador-datos"
python3 -m http.server 5055 --bind 127.0.0.1 --directory public > /dev/null 2>&1 &
WEB=$!; trap 'kill $WEB' EXIT
$FIREBASE emulators:start --only firestore --project demo-seven-ne $IMPORT --export-on-exit emulador-datos
