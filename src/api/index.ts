/* Selección del proveedor según configuración. */
import type { Provider } from './provider';
import { mockProvider } from './mock';
import { httpProvider } from './http';

// Por defecto se usa el proveedor local con DATOS REALES (snapshot del banco
// + lectura en vivo cuando hay backend). Solo muestra datos reales, sin demo.
// Con VITE_USE_MOCK=false se habla directamente con el backend (BFF) en VITE_API_URL.
const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') === 'true';

export const provider: Provider = USE_MOCK ? mockProvider : httpProvider;
