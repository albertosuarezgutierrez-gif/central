/**
 * «Mis datos» — el portal manda a asegura lo que el cliente escribió, y le
 * pide lo que la ficha tiene para que pueda verlo; y «Comprueba tus datos de
 * contacto» — el aviso automático que le pregunta si sigue siendo lo mismo.
 *
 * ─── Por qué el portal NO lo escribe (ni lo lee) él mismo ───────────────────
 * `clientes.direccion`, el teléfono y el correo van cifrados con
 * `PII_ENCRYPTION_KEY`, y el rol de esta app (`prisma_asegura_portal`, sin
 * BYPASSRLS) ni declara esas columnas. Se podría conceder el grant y traer la
 * clave, y sería el peor cambio posible — la app pública pasaría a poder
 * descifrar la PII de 32.600 fichas para que una persona pueda corregir su
 * calle. Así que sale por un puerto estrecho a `apps/asegura`, que ya tiene la
 * clave, y ESE puerto resuelve la ficha por `portal_vinculo`: ni con el secreto
 * en la mano se llega a otra ficha que la propia.
 *
 * ─── La lectura (09/09/2026) ─────────────────────────────────────────────────
 * Hasta hoy este módulo solo ESCRIBÍA, y la pantalla salía en blanco diciendo
 * que no podía enseñar lo guardado. Alberto: «el cliente puede ver sus datos de
 * contacto (tlf, mail y dirección) pudiendo modificarlos». Lo que se conserva
 * de la decisión anterior es lo que importaba: aquí sigue sin haber clave; lo
 * que se lee viene YA descifrado del puerto, y son esos seis campos MÁS si el
 * cliente ha confirmado que siguen siendo correctos (`confirmadoEn`,
 * `confirmacion`) — ese estado lo calcula asegura (`estadoConfirmacion` de
 * `@central/module-seguros-portal`), nunca el navegador: un «hoy» de aquí y
 * otro del servidor darían dos respuestas distintas para la misma fecha.
 *
 * ─── El aviso automático (08/09/2026) ────────────────────────────────────────
 * Dictado de Alberto: «tiene que ser automático, un aviso en la intranet; yo
 * no intervengo». La cartera viene de un volcado de jun/2026 y quien tiene que
 * validar que sus datos siguen siendo los suyos es el propio cliente, sin que
 * el corredor haga nada. `confirmarMisDatos` es el «siguen igual» de un solo
 * toque; corregir algo desde «Mis datos» (`guardarMisDatos`) cuenta también
 * como confirmación — lo sella asegura, no esta app.
 *
 * ─── Y los fallos NO se colapsan ─────────────────────────────────────────────
 * `sin_puente` («esto no está montado») ≠ `error` («no ha salido»). Es la misma
 * distinción que el portal ya hace entre `canal_no_disponible` y
 * `envio_fallido`: uno se arregla en Vercel y el otro reintentando. Y ninguno
 * de los dos se le enseña a la persona como «guardado», ni una lectura fallida
 * como «no consta».
 */
import type { EstadoConfirmacionContacto } from '@central/module-seguros-portal'

import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config'

export type ResultadoMisDatos =
  | { estado: 'ok'; campos: string[] }
  | { estado: 'sin_cambios' }
  /** Lo que escribió no pasa las reglas (una calle larguísima, un CP raro, un correo sin @). */
  | { estado: 'invalido'; motivo: string; campo: string | null }
  /** Ese teléfono o correo ya está en OTRA ficha de la correduría: lo resuelve el corredor. */
  | { estado: 'en_otra_ficha'; campo: string | null }
  /** Su acceso no está enlazado con ninguna ficha: no hay dónde guardarlo. */
  | { estado: 'sin_ficha' }
  /** Su acceso está enlazado con varias fichas: lo resuelve el corredor. */
  | { estado: 'varias_fichas' }
  /** El puente no está configurado en este despliegue. NO es «falló el envío». */
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

export type CampoMisDatos = 'direccion' | 'codigoPostal' | 'ciudad' | 'provincia' | 'telefono' | 'email'

/** Lo que manda la persona: solo los campos que tocó. `null` = lo dejó en blanco a propósito. */
export type EntradaMisDatos = Partial<Record<CampoMisDatos, string | null>>

export type LecturaMisDatos =
  | {
      estado: 'ok'
      contacto: Record<CampoMisDatos, string | null>
      ilegibles: string[]
      confirmadoEn: string | null
      confirmacion: EstadoConfirmacionContacto
    }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

export type ResultadoConfirmarMisDatos =
  | { estado: 'ok'; confirmadoEn: string }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  // Cerrado por defecto y DICHO: sin las dos envs no se inventa un destino ni
  // se cae a un «guardado» optimista.
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

export async function guardarMisDatos(identidadId: string, libre: EntradaMisDatos): Promise<ResultadoMisDatos> {
  const p = puente()
  if (!p) return { estado: 'sin_puente' }

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}/api/portal/contacto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      body: JSON.stringify({ identidadId, libre }),
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : null

    if (res.ok && estado === 'ok') {
      const campos = Array.isArray(j?.campos) ? j!.campos.filter((c): c is string => typeof c === 'string') : []
      return { estado: 'ok', campos }
    }
    if (estado === 'sin_cambios') return { estado: 'sin_cambios' }
    if (estado === 'invalido') {
      return {
        estado: 'invalido',
        motivo: typeof j?.motivo === 'string' ? j.motivo : 'dato no válido',
        campo: typeof j?.campo === 'string' ? j.campo : null,
      }
    }
    if (estado === 'en_otra_ficha') return { estado: 'en_otra_ficha', campo: typeof j?.campo === 'string' ? j.campo : null }
    if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
    if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
    if (estado === 'sin_configurar') return { estado: 'sin_puente' }
    // 🚨 Cualquier otra cosa —incluido un 401 por un secreto mal puesto— es un
    // fallo, no un guardado. El motivo va al log del servidor y a la persona se
    // le dice que no se ha guardado, que es lo único cierto.
    console.error(`[portal/mis-datos] respuesta inesperada del puente: ${res.status} ${estado ?? 'sin estado'}`)
    return { estado: 'error', causa: `puente_${res.status}` }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    console.error('[portal/mis-datos] el puente no respondió:', abortado ? 'timeout' : e instanceof Error ? e.message : e)
    return { estado: 'error', causa: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}

const CAMPOS: readonly CampoMisDatos[] = ['direccion', 'codigoPostal', 'ciudad', 'provincia', 'telefono', 'email']
const CONFIRMACIONES: readonly EstadoConfirmacionContacto[] = ['nunca', 'vigente', 'caducada']

/**
 * Lo que la ficha tiene de contacto de esta identidad. `ilegibles` son campos
 * que EXISTEN pero asegura no pudo descifrar: la pantalla los dice como «no
 * hemos podido leerlo», nunca como «no consta».
 */
export async function leerMisDatos(identidadId: string): Promise<LecturaMisDatos> {
  const p = puente()
  if (!p) return { estado: 'sin_puente' }

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}/api/portal/contacto?identidadId=${encodeURIComponent(identidadId)}`, {
      headers: { authorization: `Bearer ${p.secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : null
    if (res.ok && estado === 'ok') {
      const crudo = (j?.contacto ?? {}) as Record<string, unknown>
      const contacto = {} as Record<CampoMisDatos, string | null>
      for (const k of CAMPOS) contacto[k] = typeof crudo[k] === 'string' ? (crudo[k] as string) : null
      const ilegibles = Array.isArray(j?.ilegibles) ? j!.ilegibles.filter((c): c is string => typeof c === 'string') : []
      const confirmacionCruda = typeof j?.confirmacion === 'string' ? j.confirmacion : null
      // 🚨 Un valor que no es ninguno de los tres estados NO se enseña como
      // «nunca»: eso sería inventarle a la persona un aviso que quizá no toca.
      const confirmacion: EstadoConfirmacionContacto = (CONFIRMACIONES as readonly string[]).includes(
        confirmacionCruda ?? '',
      )
        ? (confirmacionCruda as EstadoConfirmacionContacto)
        : 'nunca'
      return {
        estado: 'ok',
        contacto,
        ilegibles,
        confirmadoEn: typeof j?.confirmadoEn === 'string' ? j.confirmadoEn : null,
        confirmacion,
      }
    }
    if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
    if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
    if (estado === 'sin_configurar') return { estado: 'sin_puente' }
    console.error(`[portal/mis-datos] lectura inesperada del puente: ${res.status} ${estado ?? 'sin estado'}`)
    return { estado: 'error', causa: `puente_${res.status}` }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    console.error('[portal/mis-datos] el puente no respondió a la lectura:', abortado ? 'timeout' : e instanceof Error ? e.message : e)
    return { estado: 'error', causa: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * «Siguen igual»: confirma sin cambiar nada. Es el gesto de UN toque que hace
 * que el aviso automático no dependa de que la persona entre a corregir algo.
 */
export async function confirmarMisDatos(identidadId: string): Promise<ResultadoConfirmarMisDatos> {
  const p = puente()
  if (!p) return { estado: 'sin_puente' }

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}/api/portal/contacto-confirmar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      body: JSON.stringify({ identidadId }),
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : null
    // 🚨 Solo `ok` CON fecha cuenta como confirmado: un `ok` sin `confirmadoEn`
    // no es de fiar y se trata como fallo, no como «guardado a medias».
    if (res.ok && estado === 'ok' && typeof j?.confirmadoEn === 'string') {
      return { estado: 'ok', confirmadoEn: j.confirmadoEn }
    }
    if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
    if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
    if (estado === 'sin_configurar') return { estado: 'sin_puente' }
    console.error(`[portal/mis-datos] confirmación inesperada del puente: ${res.status} ${estado ?? 'sin estado'}`)
    return { estado: 'error', causa: `puente_${res.status}` }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    console.error('[portal/mis-datos] el puente no respondió a la confirmación:', abortado ? 'timeout' : e instanceof Error ? e.message : e)
    return { estado: 'error', causa: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}
