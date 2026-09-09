/**
 * «Mis datos» — el portal manda a asegura lo que el cliente escribió, y le
 * pide lo que la ficha tiene para que pueda verlo.
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
 * que se lee viene YA descifrado del puerto, y son SOLO esos seis campos.
 *
 * ─── Y los fallos NO se colapsan ─────────────────────────────────────────────
 * `sin_puente` («esto no está montado») ≠ `error` («no ha salido»). Es la misma
 * distinción que el portal ya hace entre `canal_no_disponible` y
 * `envio_fallido`: uno se arregla en Vercel y el otro reintentando. Y ninguno
 * de los dos se le enseña a la persona como «guardado», ni una lectura fallida
 * como «no consta».
 */
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
  | { estado: 'ok'; contacto: Record<CampoMisDatos, string | null>; ilegibles: string[] }
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
      return { estado: 'ok', contacto, ilegibles }
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
