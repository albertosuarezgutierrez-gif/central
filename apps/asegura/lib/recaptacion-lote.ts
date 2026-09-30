// Selección de candidatos del envío en LOTE de recaptación por email — lógica
// PURA, sin BD (`import type` se borra al compilar, así que este fichero no
// arrastra el cliente Prisma de `cartera-recaptacion.ts` y `node --test` lo
// puede correr sin `prisma generate`, igual que el resto de `lib/*.test.ts`
// de esta app).
//
// Solo entran los leads SOLO-EMAIL (sin teléfono usable): a quien tiene
// teléfono se le sigue trabajando a mano por WhatsApp desde la cola normal —
// el lote es para el resto, que si no se queda sin ningún contacto
// automático nunca.

import type { LeadRecaptacion } from './cartera-recaptacion'

export const LIMITE_LOTE_POR_DEFECTO = 25

/** Criterio ÚNICO de «solo correo»: con email disponible y sin teléfono usable. */
function esSoloCorreo(l: LeadRecaptacion): boolean {
  return l.email !== null && l.telefono === null
}

/**
 * Como mucho UN lead por cliente (el primero en el orden de la cola): la cola
 * trae una fila por póliza y, sin esto, un cliente con dos pólizas del volcado
 * recibiría dos correos en la misma pasada. El `limite` cuenta PERSONAS.
 */
export function candidatosLoteEmail(
  leads: readonly LeadRecaptacion[],
  limite: number = LIMITE_LOTE_POR_DEFECTO,
): LeadRecaptacion[] {
  const tope = Math.max(0, limite)
  const vistos = new Set<string>()
  const elegidos: LeadRecaptacion[] = []
  for (const l of leads) {
    if (elegidos.length >= tope) break
    if (!esSoloCorreo(l) || l.enCooldown) continue
    if (vistos.has(l.clienteId)) continue
    vistos.add(l.clienteId)
    elegidos.push(l)
  }
  return elegidos
}

/**
 * Cuántas PERSONAS solo-correo de la cola siguen sin haber recibido NUNCA un
 * primer envío (`ultimoContactoEn === null`) y NO se han intentado en esta
 * pasada (`intentadosAhora`, ids de cliente: los enviados Y los fallidos). La
 * cola se lee ANTES de enviar y todos ellos aún figuran sin contactar en ella.
 * Es lo que permite decir «ya se ha escrito a todos» (0) sin confundirlo con
 * «no se ha podido mirar» — eso es `null` en `ResumenLoteEmail`, nunca este 0.
 *
 * Quien FALLÓ tampoco cuenta: una dirección que Resend rechaza siempre dejaría
 * el contador en ≥1 para siempre y la campaña no se daría nunca por terminada.
 * El fallo ya se dice aparte (`fallidos`/`detalleFallos` de la pasada).
 *
 * Cuenta por cliente, no por fila: la cola trae una fila por póliza y un
 * cliente con varias pólizas del volcado es UNA persona pendiente. Un lead sin
 * contactar nunca está en cooldown (el cooldown sale de ese mismo contacto), así
 * que no hace falta mirarlo aquí.
 */
export function contarPendientesPrimerEnvio(
  leads: readonly LeadRecaptacion[],
  intentadosAhora: Iterable<string> = [],
): number {
  const intentados = new Set(intentadosAhora)
  const pendientes = new Set<string>()
  for (const l of leads) {
    if (!esSoloCorreo(l)) continue
    if (l.ultimoContactoEn !== null) continue
    if (intentados.has(l.clienteId)) continue
    pendientes.add(l.clienteId)
  }
  return pendientes.size
}

/**
 * De los enviados DE VERDAD en esta pasada, cuántas PERSONAS recibían su PRIMER
 * correo: `ultimoContactoEn === null` en la cola leída antes de enviar. El resto
 * de `enviados` son recordatorios a quien ya se había escrito.
 */
export function contarPrimerosEnviados(enviadosAhora: readonly LeadRecaptacion[]): number {
  const primeros = new Set<string>()
  for (const l of enviadosAhora) {
    if (l.ultimoContactoEn === null) primeros.add(l.clienteId)
  }
  return primeros.size
}

/**
 * Cuántas PERSONAS solo-correo esperan a que se abra su ventana: tienen alguna
 * póliza en espera (`enEspera`) y NINGUNA dentro de la ventana (`enVentana`).
 * Quien ya tiene una póliza en ventana está en la cola de hoy: contarle aquí
 * sería contarle dos veces. A diferencia de `enEsperaVentana` (PÓLIZAS, todos
 * los canales), esto es lo que queda por escribir al lote cuando la cola se vacía.
 */
export function contarEnEsperaVentanaSoloCorreo(
  enEspera: readonly LeadRecaptacion[],
  enVentana: readonly LeadRecaptacion[],
): number {
  const yaEnCola = new Set(enVentana.map((l) => l.clienteId))
  const esperando = new Set<string>()
  for (const l of enEspera) {
    if (!esSoloCorreo(l)) continue
    if (yaEnCola.has(l.clienteId)) continue
    esperando.add(l.clienteId)
  }
  return esperando.size
}
