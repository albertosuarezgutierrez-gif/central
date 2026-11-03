/**
 * Tramo «correo → confirmar» del ✅ de la regularización de RC, aislado para poder probarlo sin BD (inyecta las
 * dependencias). La fila ya está reclamada (`enviando`) cuando se llama. Regla: ante la duda NO se reenvía al cliente.
 *   · el envío LANZA (antes de confirmarse) → la fila vuelve a `borrador` (sin token) y se informa `envio_fallido`;
 *   · el correo SALIÓ pero el UPDATE a `pendiente` falla → se reintenta una vez; si sigue fallando, `confirmacion_fallida`
 *     y la fila queda en `enviando` SIN volver a borrador (otro ✅ mandaría un segundo correo); `crear` la anula pasado
 *     el plazo (`MINUTOS_ENVIANDO_ATASCADA`) para no dejar «ya_existe» eterno.
 */
export const MINUTOS_ENVIANDO_ATASCADA = 15

export type ResultadoEnvio = 'enviada' | 'canal_no_disponible' | 'envio_fallido' | 'confirmacion_fallida' | 'sin_cambios'

export async function enviarYConfirmar(d: {
  enviar: () => Promise<string>
  confirmar: () => Promise<number>
  volverABorrador: () => Promise<unknown>
  log: (m: string) => void
}): Promise<ResultadoEnvio> {
  const deshacer = async () => { try { await d.volverABorrador() } catch (e) { d.log(`no se pudo devolver a borrador: ${e instanceof Error ? e.message : e}`) } }
  let res: string
  try {
    res = await d.enviar()
  } catch (e) {
    d.log(`el envío lanzó: ${e instanceof Error ? e.message : e}`)
    await deshacer()
    return 'envio_fallido'
  }
  if (res === 'sin_proveedor') { await deshacer(); return 'canal_no_disponible' }
  if (res !== 'enviado') { await deshacer(); return 'envio_fallido' }
  for (let intento = 1; intento <= 2; intento++) {
    try {
      return (await d.confirmar()) === 1 ? 'enviada' : 'sin_cambios'
    } catch (e) {
      d.log(`correo enviado pero no se pudo pasar a pendiente (intento ${intento}): ${e instanceof Error ? e.message : e}`)
    }
  }
  return 'confirmacion_fallida'
}
