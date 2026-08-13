/* Función serverless de Vercel: monta la API del BFF en /api/*.
   Las rutas de la app empiezan por /api, y Vercel reenvía la ruta completa. */
import { createApp } from '../server/app.js';

export default createApp();
