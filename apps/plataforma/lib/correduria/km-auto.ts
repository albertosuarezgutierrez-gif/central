// Los KILÓMETROS AL AÑO de la pantalla de presupuesto de auto (10/10/2026). PURO; lo cubre `km-auto.test.ts`.
//
// La pantalla nace en 10.000 km (Alberto, 25/09/2026) para que el precio no salga sobre la media de 15.000. Pero
// esos 10.000 NO los ha dicho el cliente: hasta hoy viajaban como `correcciones.kmAnuales`, y una corrección es
// «una persona diciendo el dato de verdad» (`supuestosVigentes` retiraba el supuesto), así que la tarificación los
// guardaba como dato y la emisión no pedía verificarlos. Regla del repo: dato que NO hay ≠ dato que no se ha mirado.
//
// Desde hoy hay dos caminos y solo dos:
//   - DECLARADOS (los trae el riesgo, el corredor ha tocado el campo o la cifra no es la de por defecto): van como
//     corrección y se anotan en el riesgo (`info_riesgo.datosVehiculo.kmAnuales`).
//   - SUPUESTOS (los 10.000 de la pantalla tal cual): van en `resueltos.kmAnualesSupuestos`; el vendor recibe la
//     misma cifra, pero asegura la declara como supuesto y NO se anotan en el riesgo.

import { KM_ANUALES_SUPUESTOS, kilometrosDesdeTexto } from '@central/module-seguros'

/**
 * Los km/año con los que NACE la pantalla de coche (Alberto, 25/09/2026). UNA sola constante para toda la app: la
 * usan `AutoNuevo` (pantalla completa y cotizador embebido en la oportunidad) y el asistente de Telegram
 * (`correduria-tarificacion-tg.ts`). Es un SUPUESTO, nunca un dato del cliente (ver `kmParaCotizar`).
 */
export const KM_AUTO_POR_DEFECTO = 10000

export type KmParaCotizar = {
  /** `correcciones.kmAnuales`: dato del cliente. */
  correccion: number | null
  /** `resueltos.kmAnualesSupuestos`: lo que propone la pantalla, marcado como supuesto. */
  supuesto: number | null
  /** `vehiculoRiesgo.kmAnuales`: lo que se anota en el riesgo. Nunca un supuesto. */
  paraRiesgo: number | null
}

/**
 * ¿Los km del campo son un dato del cliente? Sí si los trae el riesgo, si el corredor ha tocado el campo, o si la
 * cifra tecleada no es la de por defecto. Los 10.000 de partida, sin tocar, NO lo son.
 */
export function kmEsDeclarado(e: { texto: string; porDefecto: number; delRiesgo: boolean; tocado: boolean }): boolean {
  if (e.delRiesgo || e.tocado) return true
  return e.texto.trim() !== String(e.porDefecto)
}

/** Qué viaja y por dónde. Un texto que no se entiende como kilometraje no viaja (la pantalla ya bloquea el botón). */
export function kmParaCotizar(e: { texto: string; porDefecto: number; delRiesgo: boolean; tocado: boolean }): KmParaCotizar {
  const n = kilometrosDesdeTexto(e.texto)
  if (n === null) return { correccion: null, supuesto: null, paraRiesgo: null }
  return kmEsDeclarado(e) ? { correccion: n, supuesto: null, paraRiesgo: n } : { correccion: null, supuesto: n, paraRiesgo: null }
}

/**
 * Los km de una tarificación GUARDADA (`risk.kilometersPerYear` de su petición) que pueden precargarse como dato
 * declarado. La petición no dice si eran supuestos: la media (15.000) y el defecto de la pantalla (10.000) se tratan
 * como «no consta» (las tarificaciones anteriores al 10/10/2026 mandaban los 10.000 como corrección). Conservador:
 * un 10.000 de verdad se vuelve a preguntar, nunca se afirma uno que nadie dijo.
 */
export function kmDeclaradoDeGuardada(km: number | null, porDefecto: number): number | null {
  if (km === null || !Number.isFinite(km)) return null
  if (km === KM_ANUALES_SUPUESTOS || km === porDefecto) return null
  return km
}
