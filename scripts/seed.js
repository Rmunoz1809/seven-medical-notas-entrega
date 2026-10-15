// Datos base en el EMULADOR (no toca producción): cliente CONAIB.
// Uso: con "bash scripts/dev.sh" corriendo →  node scripts/seed.js
// Para el inventario: node scripts/cargar-inventario.js "<Excel>"
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, terminate } from 'firebase/firestore';

const db = getFirestore(initializeApp({ apiKey: 'demo-key', projectId: 'demo-seven-ne' }));
connectFirestoreEmulator(db, '127.0.0.1', 8085);
await setDoc(doc(db, 'clientes', 'conaib'), { nombre: 'Congreso de Biomedica CONAIB', contacto: '', telefono: '', email: '', ruc: '',
  direccion: 'Hotel Hilton Panamá, Panamá', notas: '', origen: 'seed' });
console.log('Listo: http://localhost:5055');
await terminate(db);
process.exit(0);
