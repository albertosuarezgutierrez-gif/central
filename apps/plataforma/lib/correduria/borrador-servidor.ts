// Borrador de presupuesto EN SERVIDOR (05/10/2026, decisión de Alberto: «todo lo que se teclea en un
// presupuesto se conserva aunque la página falle, se cierre el navegador o se cambie de dispositivo»).
//
// Dos líneas, y el orden importa:
//   1. `localStorage` (`borrador-local.ts`): inmediata, sobrevive a una caída de red. Sigue igual.
//   2. Servidor (`seguros.borradores_presupuesto`, vía `/api/correduria/borrador-presupuesto` →
//      puerto de asegura): sobrevive a cerrar el navegador, al modo privado y a cambiar de equipo.
// Al abrir la pantalla se queda la MÁS RECIENTE de las dos por su sello (`elegirMasReciente`).
//
// No es una oportunidad ni una cotización: la oportunidad sigue naciendo al pagar.
//
// Este fichero tiene dos partes: lo PURO (sin red, lo prueba `borrador-servidor.test.ts`) y tres
// llamadas `fetch` a la ruta de plataforma, solo para el client component. Ninguna lanza: perder el
// guardado en servidor deja la copia local, y la pantalla lo dice («Sin conexión: guardado en este
// equipo»), no se rompe.

export const RAMOS_BORRADOR_SERVIDOR = ['auto', 'moto', 'hogar', 'salud', 'vida', 'decesos'] as const
export type RamoBorradorServidor = (typeof RAMOS_BORRADOR_SERVIDOR)[number]

/** Espera tras el último cambio antes de mandarlo al servidor (el local va a los 400 ms). */
export const DEBOUNCE_SERVIDOR_MS = 2_000
/** Tope del JSON tecleado; el mismo que aplica asegura (`MAX_DATOS_BORRADOR`). */
export const MAX_DATOS_BORRADOR = 64_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ConSello<T> = { datos: T; guardadoEn: number }
export type FilaServidor<T = Record<string, unknown>> = { oportunidadId: string | null; datos: T | null; guardadoEn: number }

function claveEstable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(claveEstable).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${claveEstable(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'undefined'
}

/**
 * ¿Es el formulario tal cual se abre (valores por defecto)? Un borrador así no tiene nada que
 * conservar: guardarlo (local o servidor) con sello nuevo pisaría un borrador bueno de otro equipo.
 * Compara por contenido, sin importar el orden de las claves. Sin `inicial` nada es «vacío».
 */
export function esBorradorVacio(datos: unknown, inicial: unknown): boolean {
  if (datos == null || inicial == null) return false
  return claveEstable(datos) === claveEstable(inicial)
}

/**
 * El más reciente de los dos. Empate → el LOCAL (es lo que este equipo acaba de teclear y ya está
 * pintado). `null` en un lado = ese lado no tiene nada utilizable. Un local VACÍO (`esVacio`: los
 * valores por defecto, con sello nuevo) no cuenta: nunca gana al servidor.
 */
export function elegirMasReciente<T>(
  local: ConSello<T> | null,
  servidor: ConSello<T> | null,
  esVacio?: (datos: T) => boolean,
): { origen: 'local' | 'servidor'; borrador: ConSello<T> } | null {
  if (local && esVacio?.(local.datos)) local = null
  if (!local && !servidor) return null
  if (!servidor) return { origen: 'local', borrador: local! }
  if (!local) return { origen: 'servidor', borrador: servidor }
  return servidor.guardadoEn > local.guardadoEn ? { origen: 'servidor', borrador: servidor } : { origen: 'local', borrador: local }
}

/**
 * De las filas del servidor (todas las del cliente en ese ramo), la que corresponde a la pantalla,
 * con la MISMA regla de hermanos que el local (`leerBorradorAutoNuevo`): la propia; si no hay, con
 * oportunidad → la «sin oportunidad»; sin oportunidad → la más reciente de sus variantes. Una fila
 * ilegible (`datos: null`) no cuenta: no hay nada que restaurar de ella.
 */
export function borradorServidorPara<T>(filas: FilaServidor<T>[], oportunidadId: string | null | undefined): ConSello<T> | null {
  const op = oportunidadId ? oportunidadId.toLowerCase() : null
  const legibles = filas.filter((f): f is FilaServidor<T> & { datos: T } => f.datos !== null)
  const conSello = (f: { datos: T; guardadoEn: number } | undefined) => (f ? { datos: f.datos, guardadoEn: f.guardadoEn } : null)
  const propia = legibles.find((f) => (f.oportunidadId?.toLowerCase() ?? null) === op)
  if (propia) return conSello(propia)
  if (op) return conSello(legibles.find((f) => f.oportunidadId === null))
  const variantes = legibles.filter((f) => f.oportunidadId !== null).sort((a, b) => b.guardadoEn - a.guardadoEn)
  return conSello(variantes[0])
}

/**
 * Lo que devuelve la ruta al leer. `null` = no se ha podido leer (≠ `[]`, «no hay ninguno»): con
 * `null` la pantalla se queda con lo local y dice que solo está en este equipo.
 */
export function interpretarLecturaServidor(status: number, json: unknown): FilaServidor[] | null {
  if (status !== 200 || !json || typeof json !== 'object') return null
  const lista = (json as { borradores?: unknown }).borradores
  if (!Array.isArray(lista)) return null
  const filas: FilaServidor[] = []
  for (const f of lista) {
    if (!f || typeof f !== 'object') continue
    const { oportunidadId, datos, guardadoEn } = f as Record<string, unknown>
    if (typeof guardadoEn !== 'number' || !Number.isFinite(guardadoEn)) continue
    if (oportunidadId !== null && typeof oportunidadId !== 'string') continue
    const d = datos && typeof datos === 'object' && !Array.isArray(datos) ? (datos as Record<string, unknown>) : null
    filas.push({ oportunidadId, datos: d, guardadoEn })
  }
  return filas
}

export type CuerpoBorrador = {
  clienteId: string
  oportunidadId: string | null
  ramo: RamoBorradorServidor
  datos: Record<string, unknown>
  guardadoEn: number
}

/** Valida el cuerpo que llega a la ruta de plataforma (asegura lo vuelve a validar: manda el suyo). */
export function revisarCuerpoBorrador(b: unknown): { ok: true; valor: CuerpoBorrador } | { ok: false; motivo: string } {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, motivo: 'cuerpo no es un objeto' }
  const o = b as Record<string, unknown>
  if (typeof o.clienteId !== 'string' || !UUID.test(o.clienteId)) return { ok: false, motivo: 'clienteId no es un uuid' }
  const op = o.oportunidadId === undefined || o.oportunidadId === null || o.oportunidadId === '' ? null : o.oportunidadId
  if (op !== null && (typeof op !== 'string' || !UUID.test(op))) return { ok: false, motivo: 'oportunidadId no es un uuid' }
  if (typeof o.ramo !== 'string' || !(RAMOS_BORRADOR_SERVIDOR as readonly string[]).includes(o.ramo)) return { ok: false, motivo: 'ramo desconocido' }
  if (!o.datos || typeof o.datos !== 'object' || Array.isArray(o.datos)) return { ok: false, motivo: 'datos no es un objeto' }
  let tam = 0
  try {
    tam = JSON.stringify(o.datos).length
  } catch {
    return { ok: false, motivo: 'datos no serializables' }
  }
  if (tam > MAX_DATOS_BORRADOR) return { ok: false, motivo: 'datos demasiado grandes' }
  if (typeof o.guardadoEn !== 'number' || !Number.isInteger(o.guardadoEn) || o.guardadoEn <= 0) return { ok: false, motivo: 'guardadoEn no es una marca de tiempo' }
  return {
    ok: true,
    valor: { clienteId: o.clienteId, oportunidadId: op as string | null, ramo: o.ramo as RamoBorradorServidor, datos: o.datos as Record<string, unknown>, guardadoEn: o.guardadoEn },
  }
}

export type EstadoNube = { tipo: 'guardado'; en: number } | { tipo: 'guardando' } | { tipo: 'solo_local' } | null

/** El indicador discreto de la pantalla. `null` = no se pinta nada (aún no se ha intentado). */
export function textoIndicador(e: EstadoNube): string | null {
  if (!e) return null
  if (e.tipo === 'guardando') return 'Guardando…'
  if (e.tipo === 'solo_local') return 'Sin conexión: guardado en este equipo'
  const hhmm = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(e.en))
  return `Guardado ✓ ${hhmm}`
}

// ─── Red (solo client component) ──────────────────────────────────────────────

const RUTA = '/api/correduria/borrador-presupuesto'

export async function leerBorradoresServidor(clienteId: string, ramo: RamoBorradorServidor): Promise<FilaServidor[] | null> {
  try {
    const r = await fetch(`${RUTA}?clienteId=${encodeURIComponent(clienteId)}&ramo=${ramo}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    return interpretarLecturaServidor(r.status, await r.json().catch(() => null))
  } catch {
    return null
  }
}

/**
 * Guarda en servidor. `keepalive` para `pagehide`/`visibilitychange`: el navegador termina la
 * petición aunque la página se cierre (tope de 64 KB de cuerpo, por eso el límite de arriba).
 * Devuelve el sello guardado o `null` si no se pudo (la copia local sigue).
 */
export async function guardarBorradorServidor(cuerpo: CuerpoBorrador, opciones: { keepalive?: boolean; signal?: AbortSignal } = {}): Promise<number | null> {
  try {
    const r = await fetch(RUTA, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      keepalive: opciones.keepalive === true,
      signal: opciones.signal,
    })
    if (!r.ok) return null
    const j = (await r.json().catch(() => null)) as { guardadoEn?: unknown } | null
    return typeof j?.guardadoEn === 'number' ? j.guardadoEn : null
  } catch {
    return null
  }
}

/** Al pagar con éxito (igual que el local). Un fallo no hace nada: lo purga el cron a los 60 días. */
export async function borrarBorradorServidor(clienteId: string, ramo: RamoBorradorServidor, oportunidadId: string | null): Promise<void> {
  try {
    const q = `clienteId=${encodeURIComponent(clienteId)}&ramo=${ramo}${oportunidadId ? `&oportunidadId=${encodeURIComponent(oportunidadId)}` : ''}`
    await fetch(`${RUTA}?${q}`, { method: 'DELETE' })
  } catch {
    // Ver la cabecera.
  }
}
