// Cuándo un lead de recaptación por email se considera "silencioso": varios
// envíos, ni una apertura ni un clic. Lógica PURA, sin BD — mismo motivo que
// `recaptacion-lote.ts`: que `node --test` la corra sin `prisma generate`.
//
// ─── Por qué existe (21/09/2026) ────────────────────────────────────────────
// Alberto: "hay que hacer seguimiento de todo, para desechar los que no abran
// el mail porque lo mismo ya ni lo usan o esos mail ya ni existen". El cooldown
// de 14 días (`cartera-recaptacion.ts`) evita ESCRIBIR seguido, pero no evita
// REINTENTAR para siempre: un email muerto sin bounce (buzón lleno, dominio
// que sigue aceptando SMTP pero nadie lo lee) pasa las 25 pasadas del lote
// cada 14 días, año tras año, sin que ningún filtro existente lo saque.

/** Desde cuándo Resend MIDE aperturas y clics en `envios.grupoasegura.es`
 *  (activado el 25/09/2026). Hasta ese día el tracking del dominio estaba
 *  apagado: ningún envío anterior podía pasar a `abierto`/`pinchado`, así que
 *  su «sin abrir» es «no medido», no «no abierto». Ni la regla de silencio ni
 *  la tasa de apertura del panel cuentan envíos anteriores a esta fecha (UTC,
 *  mismo formato que `recaptacion_envios.created_at`, `timestamp` sin zona). */
export const SEGUIMIENTO_EMAIL_DESDE = '2026-09-25 00:00:00'

/** Envíos de email sin ninguna apertura/clic a partir de los cuales se da por
 *  perdido el lead. 3 intentos × cooldown de 14 días = ~6 semanas de margen
 *  real antes de descartar — no es la primera pasada muda, es la tercera. */
export const UMBRAL_SILENCIO = 3

/**
 * `true` si el lead lleva `UMBRAL_SILENCIO` o más envíos de email y ninguno
 * llegó a `abierto`/`pinchado`. No mira rebotes/quejas: esos ya se resuelven
 * aparte (opt-out inmediato, `aplicarBajaPorRebote`) y no deberían llegar
 * hasta aquí — pero si llegan (rebote sin webhook, p. ej.), cuentan igual como
 * "sin apertura": la conclusión es la misma, el email no sirve.
 */
export function esLeadSilencioso(enviosEmail: number, tuvoAperturaOClic: boolean): boolean {
  return enviosEmail >= UMBRAL_SILENCIO && !tuvoAperturaOClic
}
