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

// ─── Aviso en la APP del portal (03/11/2026) ─────────────────────────────────
// El ✅ de Alberto cubre los dos canales: correo + push en la app (si la tiene). El push es ACCESORIO: va DESPUÉS de que
// el correo haya salido y la fila esté en `pendiente` (si no, el enlace estaría muerto), y su fallo NUNCA cambia el
// resultado del correo ni revierte nada: solo se informa en el Telegram de confirmación.

/** Lo que pinta plataforma bajo «Correo enviado». `null` = no se intentó (el correo no salió). */
export type ResultadoAvisoApp =
  | { estado: 'enviado'; dispositivos: number }
  | { estado: 'sin_app' }
  | { estado: 'preferencia' }
  | { estado: 'no_se_pudo'; causa: string }

export async function avisarEnAppTrasCorreo(
  correo: ResultadoEnvio,
  avisar: () => Promise<ResultadoAvisoApp>,
  log: (m: string) => void,
): Promise<ResultadoAvisoApp | null> {
  if (correo !== 'enviada') return null
  try {
    return await avisar()
  } catch (e) {
    log(`aviso en la app: ${e instanceof Error ? e.message : e}`)
    return { estado: 'no_se_pudo', causa: 'excepcion' }
  }
}

/**
 * `POST <ASEGURA_PORTAL_URL>/api/operador/push-cliente` con `Bearer <ASEGURA_PORTAL_PUENTE_SECRET>` (el secreto que ya
 * comparten asegura y el portal). Solo viajan el `clienteId`, el MOTIVO y la ruta `/datos/<token>`: el texto lo fija el
 * portal (sin cifras ni nº de póliza). Sin secreto → `no_se_pudo` sin llamar. Nunca lanza.
 */
export async function pedirPushRegularizacion(
  a: { clienteId: string; token: string },
  e: { base: string | undefined; secreto: string | undefined; fetch: typeof fetch; timeoutMs?: number },
): Promise<ResultadoAvisoApp> {
  if (!e.secreto) return { estado: 'no_se_pudo', causa: 'sin_secreto' }
  let base: URL
  try {
    base = new URL((e.base ?? 'https://clientes.grupoasegura.es').replace(/\/+$/, '') + '/api/operador/push-cliente')
  } catch {
    return { estado: 'no_se_pudo', causa: 'url_portal_invalida' }
  }
  if (base.protocol !== 'https:') return { estado: 'no_se_pudo', causa: 'url_portal_no_https' }
  try {
    const res = await e.fetch(base.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.secreto}` },
      body: JSON.stringify({ clienteId: a.clienteId, motivo: 'regularizacion_rc', url: `/datos/${a.token}` }),
      cache: 'no-store',
      signal: AbortSignal.timeout(e.timeoutMs ?? 8_000),
    })
    if (!res.ok) return { estado: 'no_se_pudo', causa: `HTTP ${res.status}` }
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!j || j.estado !== 'ok') return { estado: 'no_se_pudo', causa: 'respuesta_ilegible' }
    const enviados = typeof j.enviados === 'number' ? j.enviados : 0
    if (enviados > 0) return { estado: 'enviado', dispositivos: enviados }
    if (j.sinSuscripcion === true) return { estado: 'sin_app' }
    if (typeof j.omitidasPorPreferencia === 'number' && j.omitidasPorPreferencia > 0 && !(typeof j.fallidos === 'number' && j.fallidos > 0)) {
      return { estado: 'preferencia' }
    }
    return { estado: 'no_se_pudo', causa: 'ningun_dispositivo_lo_acepto' }
  } catch (err) {
    return { estado: 'no_se_pudo', causa: err instanceof Error ? err.name : 'error' }
  }
}
