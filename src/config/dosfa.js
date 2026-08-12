/**
 * 2FA (FASE 8.3) — verificación de segundo factor para acciones críticas.
 * Fail-closed: sin configuración o sin código correcto, la acción crítica
 * queda bloqueada.
 *
 * Modo actual: código compartido vía env `RSP_2FA_CODE` (definido por la
 * Administración). Se puede ampliar a TOTP/PlacetaID en FASE 12.
 */
import crypto from 'crypto';

const VENTANA_MS = 10 * 60 * 1000; // 10 minutos tras verificar

const ACCIONES_CRITICAS = ['aprobar', 'autorizar', 'rechazar', 'emitir_firma', 'emitir_pago', 'ejecutar', 'confirmar'];

export function exigir2FA(accion) {
  return ACCIONES_CRITICAS.includes(accion);
}

/** La sesión del admin tiene una verificación 2FA reciente. */
export function verificarSesion2FA(req) {
  const at = req.session?.usuario?._2faAt;
  if (!at) return false;
  return (Date.now() - Number(at)) < VENTANA_MS;
}

/** Valida un código 2FA (fail-closed: sin RSP_2FA_CODE configurado → false). */
export async function verificarCodigo(req, codigo) {
  const esperado = process.env.RSP_2FA_CODE;
  if (!esperado || !codigo) return false;
  const a = Buffer.from(String(esperado));
  const b = Buffer.from(String(codigo));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Marca la sesión como verificada por 2FA. */
export function marcarVerificada(req) {
  if (!req.session?.usuario) return;
  req.session.usuario._2faAt = Date.now();
}
