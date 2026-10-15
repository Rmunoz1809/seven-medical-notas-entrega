// Conexión con Firebase (solo la base de datos Firestore; la página se publica en GitHub Pages).
// En localhost usa el emulador (proyecto demo, sin tocar producción).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import * as fs from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { crearOperaciones } from './operaciones.js?v=9cf195a';

export const EMULADOR = ['localhost', '127.0.0.1'].includes(location.hostname);

const config = EMULADOR
  ? { apiKey: 'demo-key', projectId: 'demo-seven-ne' }
  : {
      apiKey: 'AIzaSyBuNzvjgde79BJwEa9lRneP7oqeipYi324',
      authDomain: 'seven-medical-st.firebaseapp.com',
      projectId: 'seven-medical-st',
      storageBucket: 'seven-medical-st.firebasestorage.app',
      messagingSenderId: '698632675338',
      appId: '1:698632675338:web:b0b1509dd2daffb672bff3',
    };

export const app = initializeApp(config);
export const db = fs.getFirestore(app);
if (EMULADOR) fs.connectFirestoreEmulator(db, location.hostname, 8085);

const ops = crearOperaciones(fs, db);

// Nombre de quien usa este dispositivo (solo para el historial)
export const nombreUsuario = () => { try { return localStorage.getItem('ne_nombre') || ''; } catch { return ''; } };

// Ejecuta una operación de inventario/notas con el nombre de quien opera
export async function llamar(nombre, datos = {}) {
  try {
    return await ops[nombre]({ ...datos, quien: nombreUsuario() });
  } catch (e) {
    const msg = String(e.message || e);
    throw new Error(/offline|unavailable|network/i.test(msg) ? 'Sin conexión. Revisa internet e inténtalo de nuevo.' : msg);
  }
}
