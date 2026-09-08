/**
 * «Esta es mi dirección» — el portal manda a asegura lo que el cliente escribió.
 *
 * ─── Por qué el portal NO lo escribe él mismo ────────────────────────────────
 * `clientes.direccion` va cifrada con `PII_ENCRYPTION_KEY` y el rol de esta app
 * (`prisma_asegura_portal`, sin BYPASSRLS) ni declara esa columna: su modelo
 * `Cliente` no la tiene. Se podría conceder el grant y traer la clave, y sería
 * el peor cambio posible — la app pública pasaría a poder descifrar la PII de
 * 32.600 fichas para que una persona pueda corregir su calle. Así que sale por
 * un puerto estrecho a `apps/asegura`, que ya tiene la clave.
 *
 * ─── Lo que NUNCA se lee de vuelta ───────────────────────────────────────────
 * 🚨 Este módulo solo ESCRIBE. No hay una función que pregunte «¿qué dirección
 * tenéis mía?», y no es un olvido: el portal no puede enseñar lo que hay
 * guardado (no lo puede descifrar) y un puerto que lo contara sería una lectura
 * de la cartera desde la app pública. La pantalla lo dice con todas las letras
 * en vez de dejar un campo vacío que parezca «no consta».
 *
 * ─── Y los fallos NO se colapsan ─────────────────────────────────────────────
 * `sin_puente` («esto no está montado») ≠ `error` («no ha salido»). Es la misma
 * distinción que el portal ya hace entre `canal_no_disponible` y
 * `envio_fallido`: uno se arregla en Vercel y el otro reintentando. Y ninguno
 * de los dos se le enseña a la persona como «guardado».
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config'

export type ResultadoMisDatos =
  | { estado: 'ok'; campos: string[] }
  | { estado: 'sin_cambios' }
  /** Lo que escribió no pasa las reglas (una calle larguísima, un CP raro). */
  | { estado: 'invalido'; motivo: string; campo: string | null }
  /** Su acceso no está enlazado con ninguna ficha: no hay dónde guardarlo. */
  | { estado: 'sin_ficha' }
  /** Su acceso está enlazado con varias fichas: lo resuelve el corredor. */
  | { estado: 'varias_fichas' }
  /** El puente no está configurado en este despliegue. NO es «falló el envío». */
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

type Libre = { direccion?: string | null; codigoPostal?: string | null; ciudad?: string | null; provincia?: string | null }

export async function guardarMiDireccion(identidadId: string, libre: Libre): Promise<ResultadoMisDatos> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  // Cerrado por defecto y DICHO: sin las dos envs no se inventa un destino ni
  // se cae a un «guardado» optimista.
  if (!base || !secret) return { estado: 'sin_puente' }

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/contacto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
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
