/**
 * A qué dirección se le escribe a una ficha de la cartera. UNA regla, un sitio.
 *
 * 🚨 Se extrajo el 05/09/2026 de `aviso-acceso.ts`, cuando la invitación al
 * portal necesitó exactamente lo mismo. Dos copias de «cuál es el correo de este
 * cliente» divergen sin que nada falle: un correo saldría a la dirección vieja y
 * el otro a la nueva, los dos con un 200, y desde fuera se verían iguales. Es la
 * misma razón por la que este repo tiene UN clasificador de errores de cartera y
 * no dos (`lib/error-cartera.ts`).
 *
 * Las tres reglas que aplica, y ninguna es cosmética:
 *
 *  1. **La baja de correo (`email_opt_out_at`) manda sobre cualquier dirección
 *     que quede en la ficha.** Es la voluntad del interesado, no un estado del
 *     dato: si se dio de baja, no hay correo al que escribir aunque haya tres
 *     guardados.
 *  2. **Gana el principal**, y solo si no hay ninguno se cae a la columna
 *     `clientes.email` — que es el espejo, no la fuente.
 *  3. 🚨 **Ilegible ≠ inexistente.** Un valor que la clave PII no abre se SALTA y
 *     se sigue buscando, en vez de dar la ficha por «sin correo». Colapsar los
 *     dos casos diría «este cliente no tiene email» de uno que lo tiene guardado
 *     y cifrado, que es el fallo que esta app persigue por todas partes.
 */
import { prismaAsegura } from './asegura-db'
import { campoIlegible, descifrarCampo } from './cartera-edicion'

export type EmailDeFicha =
  /** Hay dirección legible a la que escribir. */
  | { estado: 'ok'; email: string }
  /** La ficha no existe en esta correduría. */
  | { estado: 'no_encontrado' }
  /** El interesado se dio de baja de correo. No es lo mismo que no tener. */
  | { estado: 'baja_de_correo' }
  /** No hay ninguna dirección guardada. Se ha mirado. */
  | { estado: 'sin_email' }
  /**
   * Hay direcciones guardadas y NINGUNA se puede descifrar (falta
   * `PII_ENCRYPTION_KEY` o es otra). Se arregla en Vercel, no llamando al
   * cliente — por eso no se colapsa con `sin_email`.
   */
  | { estado: 'ilegible' }

/**
 * El correo al que se escribiría a esta ficha, con los cinco desenlaces
 * separados. Quien solo necesite la dirección puede usar `emailDeFicha`.
 */
export async function estadoEmailDeFicha(correduriaId: string, clienteId: string): Promise<EmailDeFicha> {
  const db = prismaAsegura()
  const c = await db.cliente.findFirst({
    where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
    select: {
      email: true,
      emailOptOutAt: true,
      emails: { orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }], select: { email: true } },
    },
  })
  if (!c) return { estado: 'no_encontrado' }
  if (c.emailOptOutAt) return { estado: 'baja_de_correo' }

  const guardados = [...c.emails.map((e) => e.email), c.email].filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  )
  if (guardados.length === 0) return { estado: 'sin_email' }

  for (const cifrado of guardados) {
    if (campoIlegible(cifrado)) continue
    const claro = descifrarCampo(cifrado)
    if (claro && claro.trim() !== '') return { estado: 'ok', email: claro.trim() }
  }
  // Había direcciones y ninguna se pudo abrir: eso es un problema de clave.
  return { estado: 'ilegible' }
}

/** La dirección a secas. `null` = no hay ninguna utilizable, por el motivo que sea. */
export async function emailDeFicha(correduriaId: string, clienteId: string): Promise<string | null> {
  const r = await estadoEmailDeFicha(correduriaId, clienteId)
  return r.estado === 'ok' ? r.email : null
}
