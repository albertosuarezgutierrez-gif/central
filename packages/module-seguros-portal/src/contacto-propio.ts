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

/**
 * Los campos de contacto que el cliente puede tocar: su dirección de contacto
 * y sus dos canales (teléfono y correo). Desde el 09/09/2026 —Alberto: «una
 * pestaña "Mis datos" donde el cliente pueda ver sus datos de contacto (tlf,
 * mail y dirección) pudiendo modificarlos»— ya no es solo la calle.
 *
 * Se parten en DOS listas porque en la ficha viven en dos sitios distintos: la
 * dirección son columnas de `clientes` (van por `editarCliente`), y el
 * teléfono y el correo son filas de `cliente_telefonos` / `cliente_emails` con
 * su principal espejado en la ficha (van por `anadirContacto`, que es lo que
 * detecta que ese número ya está en OTRA ficha).
 */
export const CAMPOS_DIRECCION_PROPIA = ['direccion', 'codigoPostal', 'ciudad', 'provincia'] as const
export const CAMPOS_CANAL_PROPIO = ['telefono', 'email'] as const
export const CAMPOS_CONTACTO_PROPIO = [...CAMPOS_DIRECCION_PROPIA, ...CAMPOS_CANAL_PROPIO] as const
export type CampoDireccionPropia = (typeof CAMPOS_DIRECCION_PROPIA)[number]
export type CampoCanalPropio = (typeof CAMPOS_CANAL_PROPIO)[number]
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
    `${PREFIJO_HISTORIAL_CONTACTO_PROPIO} ${que}. ` +
    'No se ha comunicado a ninguna compañía: son sus datos de contacto con nosotros, no los de sus pólizas.'
  )
}

// ─── «Comprueba tus datos de contacto» (08/09/2026, adaptado 09/09/2026) ─────
//
// Nace pensado como aviso con datos ENMASCARADOS (el portal no descifraba
// PII). Desde el 09/09/2026 la pestaña «Mis datos» ya lee y enseña el dato en
// claro por su propio puente (`leerContactoPropio`/`leerMisDatos`), así que el
// enmascarado sobra: lo que queda de esta pieza es solo el RECORDATORIO
// periódico — la confirmación tiene tres estados, no dos: `nunca` (NULL: todo
// el volcado nace así) NO es `caducada` — un «no se sabe» no se disfraza de
// «se supo y ya es viejo».

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

/**
 * Con qué empieza esa línea, como CONSTANTE y no como una cadena escrita dos
 * veces.
 *
 * 🚨 Existe porque el muro de actividad de `/correduria` tiene que distinguir
 * lo que hizo el cliente de lo que anotó la casa, y `historial_interno` **no
 * guarda el autor como dato**: la columna `actor_user_id` no la escribe nadie y
 * el autor viaja dentro del texto. Con el prefijo compartido, esa clasificación
 * es un acuerdo entre dos sitios del repo; escrito a mano en la consulta sería
 * una adivinanza sobre texto libre que se rompe en silencio el día que alguien
 * retoque la frase — y entonces el cambio de dirección de un cliente dejaría de
 * salir como suyo sin que fallara nada.
 */
export const PREFIJO_HISTORIAL_CONTACTO_PROPIO = 'El cliente actualizó desde el portal:'

/**
 * Y el de la sugerencia, por la misma razón. Lo compone quien la recibe
 * (`apps/asegura-portal/lib/sugerencia.ts`) antes de mandarla por el puente.
 */
export const PREFIJO_HISTORIAL_SUGERENCIA = '💡 Sugerencia del cliente desde el portal:'
