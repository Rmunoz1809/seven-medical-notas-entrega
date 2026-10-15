#!/bin/bash
# Tests de las operaciones y de las reglas contra un emulador de Firestore efímero
cd "$(dirname "$0")/.." && source scripts/env.sh
exec $FIREBASE emulators:exec --project demo-seven-ne --only firestore "node --test --test-timeout=90000 --test-concurrency=1 tests/flujo.test.js"
