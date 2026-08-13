/* Selección del proveedor según configuración. */
import type { Provider } from './provider';
import { mockProvider } from './mock';
import { httpProvider } from './http';

const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

export const provider: Provider = USE_MOCK ? mockProvider : httpProvider;
