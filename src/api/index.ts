/* Selección del proveedor según configuración. */
import type { Provider } from './provider';
import { mockProvider } from './mock';
import { httpProvider } from './http';

// Por defecto se habla con el backend REAL (BFF) en VITE_API_URL (misma
// máquina en producción). El proveedor mock (datos reales en snapshot) solo
// se activa si se fija VITE_USE_MOCK=true de forma explícita (dev local).
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export const provider: Provider = USE_MOCK ? mockProvider : httpProvider;
