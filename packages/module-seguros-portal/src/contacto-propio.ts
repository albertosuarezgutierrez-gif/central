/**
 * El cliente corrige SU dirección de contacto desde el portal.
 *
 * ─── Por qué esto no es una «solicitud» ──────────────────────────────────────
 * Dictado de Alberto (08/09/2026): «me refiero a la dirección de contacto, no
 * la del seguro». Y tiene razón: dónde vive es SUYO. Poner una cola de
 * aprobación entre una persona y su propio domicilio no protege nada y encima
 * es peor postura legal — el art. 16 RGPD le da derecho a que se rectifique
 * «sin dilación indebida», y una cola que quizá nadie mira es exactamente la
 * dilación que el artículo prohíbe. Así que se aplica, y punto.
 *
 * ─── Lo que esto NO cambia, y hay que decirlo en la pantalla ─────────────────
 * 🚨 La dirección de CONTACTO no es la dirección de la PÓLIZA. Cambiarla aquí
 * NO se lo comunica a ninguna compañía: la ingesta de CIMA es de una sola
 * dirección (compañía → nosotros; medido el 08/09/2026 sobre
 * `src/lib/integrations/cima/` del CRM: descarga y acuse de descarga, ningún
 * endpoint de envío) y además no toca la dirección en ningún caso. Si además se
 * ha MUDADO, su seguro de hogar sigue cubriendo la casa vieja y eso solo lo
 * arregla un suplemento con la aseguradora. Una pantalla que dijera «dirección
 * actualizada» a secas le deja creer lo contrario — es el mismo modo de fallo
 * que «parte enviado ≠ siniestro comunicado».
 *
 * ─── Y la decisión que de verdad tiene chicha: a QUÉ ficha se aplica ─────────
 * Una identidad del portal puede estar vinculada a varias fichas (una persona y
 * su sociedad, o una fusión pendiente). Para LEER, `vinculosPorIdentidad` de
 * asegura resuelve el empate quedándose con el vínculo más antiguo. **Aquí eso
 * no vale.** Escribir el domicilio nuevo de una persona en la ficha de su
 * empresa porque es la más vieja es un dato falso escrito en silencio, y el
 * silencio es el problema: nada falla, nadie se entera, y el error queda con
 * cara de dato bueno. Con varias fichas NO se adivina — se dice.
 */

/** A qué ficha se le aplica el cambio. `varias` y `ninguna` NO se colapsan. */
export type FichaPropia =
  | { estado: 'ok'; clienteId: string }
  /** La identidad no está casada con ninguna ficha de la cartera (p. ej. un lead). */
  | { estado: 'sin_ficha' }
  /** Está casada con más de una: el corredor decide, aquí no se elige. */
  | { estado: 'varias_fichas'; clienteIds: string[] }

/**
 * Decide sobre qué ficha escribe el cliente.
 *
 * Se le pasan los `cliente_id` de sus vínculos ya deduplicados. Nótese que
 * `[a, a]` es UNA ficha (dos vínculos a la misma) y sí se aplica: lo que
 * bloquea es que haya dos fichas DISTINTAS.
 */
export function decidirFichaPropia(clienteIds: readonly string[]): FichaPropia {
  const unicos = [...new Set(clienteIds.filter((id) => id.trim() !== ''))]
  if (unicos.length === 0) return { estado: 'sin_ficha' }
  if (unicos.length > 1) return { estado: 'varias_fichas', clienteIds: unicos.sort() }
  return { estado: 'ok', clienteId: unicos[0]! }
}

/** Los campos de contacto que el cliente puede tocar. La calle y su sitio, nada más. */
export const CAMPOS_CONTACTO_PROPIO = ['direccion', 'codigoPostal', 'ciudad', 'provincia'] as const
export type CampoContactoPropio = (typeof CAMPOS_CONTACTO_PROPIO)[number]

/**
 * 🚨 Los campos que el cliente NO puede tocar desde el portal, y por qué cada
 * uno. La lista existe para que el guardián pueda comprobarla: sin ella, añadir
 * un campo al formulario del portal sería un descuido de una línea.
 *
 *  · `nombre`, `apellidos`, `dni`, `fechaNacimiento` → identidad. La regla de la
 *    correduría es que la identidad se cambia **documentada** (con un DNI
 *    recibido en la ficha), y quien entra al portal lo hace con un código a su
 *    correo, que acredita el correo y no a la persona.
 *  · `notas` → son las notas del CORREDOR sobre el cliente. No son suyas.
 */
export const CAMPOS_VETADOS_AL_CLIENTE = [
  'nombre',
  'apellidos',
  'dni',
  'fechaNacimiento',
  'notas',
] as const

/**
 * La línea que se escribe en `historial_interno` de la ficha.
 *
 * 🚨 Dice QUIÉN lo hizo y QUÉ campos, y **no dice los valores**. El historial lo
 * lee el corredor en una pantalla y no es sitio para repetir el domicilio de
 * nadie: el dato nuevo ya está en la ficha, arriba, que es donde se mira.
 *
 * Y nombra al cliente como autor a propósito: en la bitácora, «dirección
 * actualizada» sin sujeto se lee como que lo hizo Alberto, y entonces el día
 * que el dato esté mal nadie sabe a quién preguntar.
 */
export function textoHistorialContactoPropio(campos: readonly string[]): string {
  const lista = [...campos].sort()
  const que = lista.length === 0 ? 'sus datos de contacto' : lista.join(', ')
  return (
    `El cliente actualizó desde el portal: ${que}. ` +
    'No se ha comunicado a ninguna compañía: esto es su dirección de contacto, no la de sus pólizas.'
  )
}

// ─── «Comprueba tus datos de contacto» (08/09/2026) ──────────────────────────
//
// El portal NO descifra PII: lo que enseña son MÁSCARAS que calcula asegura con
// estas funciones y manda por el puente. Lo justo para que la persona reconozca
// el dato («¿sigue siendo el que acaba en 512?») sin que el valor entero cruce
// hacia la app pública. Y una confirmación tiene tres estados, no dos: `nunca`
// (NULL: todo el volcado nace así) NO es `caducada` — un «no se sabe» no se
// disfraza de «se supo y ya es viejo».

/** Solo los 3 últimos dígitos: `··· ··· 512`. Con menos de 5 dígitos, nada. */
export function enmascararTelefono(t: string): string {
  const digitos = t.replace(/\D/g, '')
  if (digitos.length < 5) return '···'
  return `··· ··· ${digitos.slice(-3)}`
}

/** Primera letra + `···` + dominio: `m···@gmail.com`. Sin `@`, nada. */
export function enmascararEmail(e: string): string {
  const s = e.trim()
  const arroba = s.indexOf('@')
  if (arroba < 1 || arroba === s.length - 1) return '···'
  return `${s[0]}···@${s.slice(arroba + 1)}`
}

/**
 * Primeras 6 letras de la calle + `···`, y «CP ciudad» cuando existan:
 * `Calle ···, 41003 Sevilla`. Todo vacío → `null` (no hay nada que reconocer).
 */
export function enmascararDireccion(
  direccion: string | null,
  cp: string | null,
  ciudad: string | null,
): string | null {
  const calle = (direccion ?? '').trim()
  const sitio = [cp, ciudad]
    .map((v) => (v ?? '').trim())
    .filter((v) => v !== '')
    .join(' ')
  const partes: string[] = []
  if (calle !== '') partes.push(`${calle.slice(0, 6)}···`)
  if (sitio !== '') partes.push(sitio)
  return partes.length === 0 ? null : partes.join(', ')
}

/** Cada cuánto se le vuelve a preguntar. */
export const DIAS_VIGENCIA_CONFIRMACION_CONTACTO = 365

export type EstadoConfirmacionContacto = 'nunca' | 'vigente' | 'caducada'

/**
 * `nunca` = NULL (no consta que lo haya mirado jamás) · `vigente` = sello de
 * hace menos de 365 días · `caducada` = sello más viejo. Un sello en el FUTURO
 * (reloj mal puesto) se trata como vigente: no se le pide confirmar dos veces
 * por un fallo nuestro.
 */
export function estadoConfirmacion(confirmadoEn: Date | null, hoy: Date): EstadoConfirmacionContacto {
  if (!confirmadoEn || Number.isNaN(confirmadoEn.getTime())) return 'nunca'
  const dias = (hoy.getTime() - confirmadoEn.getTime()) / 86_400_000
  return dias < DIAS_VIGENCIA_CONFIRMACION_CONTACTO ? 'vigente' : 'caducada'
}

/** `true` solo si hay sello y tiene menos de 365 días. NULL → `false`. */
export function confirmacionContactoVigente(confirmadoEn: Date | null, hoy: Date): boolean {
  return estadoConfirmacion(confirmadoEn, hoy) === 'vigente'
}

/**
 * La línea de `historial_interno` cuando el cliente dice «siguen igual». Sin
 * valores, por la misma razón que `textoHistorialContactoPropio`: el historial
 * no es sitio para repetir el teléfono de nadie.
 */
export function textoHistorialConfirmacionContacto(): string {
  return 'El cliente confirmó desde el portal que sus datos de contacto siguen siendo correctos.'
}
