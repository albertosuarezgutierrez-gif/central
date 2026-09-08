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
