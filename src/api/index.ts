/* Selección del proveedor según configuración. */
import type { Provider } from './provider';
import { mockProvider } from './mock';
import { httpProvider } from './http';

// Por defecto se usa el backend REAL (httpProvider). El mock solo se activa
// de forma explícita (VITE_USE_MOCK=true), p. ej. en los tests.
const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'false') === 'true';

export const provider: Provider = USE_MOCK ? mockProvider : httpProvider;
