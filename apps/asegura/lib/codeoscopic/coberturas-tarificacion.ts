// Coberturas y garantías de CADA precio de una tarificación, leídas GRATIS de Codeoscopic
// (29/09/2026, entrega 1 de docs/superpowers/plans/2026-09-28-presupuesto-filtro-garantias.md).
//
// Tras tarificar, cada fila de `seguros.tarificacion_precios` trae su `oferta_id`. Aquí se hace
// `GET /insurances/{project}/offers/{oferta}/coverages` UNA vez por oferta distinta (varias filas
// comparten oferta) y se escribe en cada fila:
//   · `coberturas` → el sobre `{ estado, lista, leidasAt }` (mismo contrato que el del presupuesto).
//   · `garantias`  → `clasificarCoberturas(ramo, lista)` del catálogo; NULL si el ramo no tiene.
//
// 🚨 Son LECTURAS: solo el POST de tarificar cuesta dinero. Por eso esto no mira el interruptor
// de gasto (mismo criterio que `presupuesto.ts` y la sonda del token).
//
// 🚨 Tres reglas que no se negocian:
//   1. Un fallo de red se guarda como `fallo` con `lista: null` — NUNCA `[]`: una lista vacía
//      diría «no cubre nada», y eso es afirmar una ausencia que nadie ha mirado. Sus garantías se
//      quedan a NULL (30/09/2026): con todo `no_consta` la parrilla la contaba como LEÍDA y decía
//      «no dice si incluye grúa»; NULL es «aún sin leer», que es la verdad. Y se REINTENTA: una fila
//      en `fallo` vuelve a ser pendiente (antes quedaba así para siempre).
//   2. Idempotente: se escribe con `where coberturas is null` (o en `fallo`). Una fila ya leída no
//      se toca, y dos ejecuciones a la vez (la de `after()` y la red de seguridad) no se pisan.
//   3. Nunca lanza. Corre en `after()` y al preparar un presupuesto: ninguno de los dos puede
//      caerse por un extra. Devuelve un resumen.
//
// Lo que se queda SIN intentar (el tope de 15 s se agotó antes de empezar esa oferta, o no hay
// credenciales) sigue a NULL = «no se ha intentado», y la red de seguridad lo retoma.

import { clasificarCoberturas, ramoDeCatalogo, type ContextoGarantias, type GarantiasClasificadas, type OpcionProductoLegible } from '@central/module-seguros'
import { prisma } from '../tenant.ts'
import { leerCoberturas } from './coberturas.ts'
import type { SobreCoberturas } from './coberturas-presupuesto.ts'
import type { ResultadoCotizacion } from './cotizar.ts'

/** Concurrencia máxima de GET contra el vendor. */
export const CONCURRENCIA_COBERTURAS = 5
/** Tope de tiempo TOTAL de una pasada. */
export const TOPE_COBERTURAS_MS = 15_000

export type CabeceraParaCoberturas = { simulado: boolean; projectId: string | null; ramo: string }
/** Una fila de `tarificacion_precios` con `coberturas is null`. `ofertaId: null` = sin oferta. */
export type FilaSinCoberturas = {
  id: string
  ofertaId: string | null
  /** Opciones de producto ya leídas (`opciones.lista`), para la asistencia ampliada. `null` = no se sabe. */
  opciones?: OpcionProductoLegible[] | null
  /** Categoría y modalidad del precio: un todo riesgo no puede salir «sin daños propios» (30/09/2026). */
  contexto?: ContextoGarantias | null
}

export type DepsCoberturasTarificacion = {
  /** La cabecera, filtrada por correduría. `null` = no existe en esta correduría. */
  cabecera: () => Promise<CabeceraParaCoberturas | null>
  /** Las filas de esa tarificación con `coberturas is null`. */
  pendientes: () => Promise<FilaSinCoberturas[]>
  /**
   * El GET de coberturas de una oferta. `null` = no se puede leer del vendor (modo simulación,
   * sin credenciales): no se llama a nada y las filas se quedan a NULL («no intentado»).
   */
  coberturas: ((projectId: string, ofertaId: string) => Promise<unknown>) | null
  /** `update … where id = any(ids) and coberturas is null`. Devuelve las filas escritas. */
  guardar: (ids: string[], sobre: SobreCoberturas, garantias: GarantiasClasificadas | null) => Promise<number>
  ahora?: () => Date
  concurrencia?: number
  topeMs?: number
}

export type ResumenCoberturasTarificacion = {
  /** Filas escritas con `leidas` o `vacias` (la compañía respondió). */
  leidas: number
  /** Filas escritas con `fallo`. */
  fallos: number
  /** Filas pendientes sin `oferta_id`: no se leen ni se escriben (las viejas van por el camino de siempre). */
  sinOferta: number
  /** Filas que se quedan a NULL porque el tope se agotó antes de empezar su oferta. */
  sinIntentar: number
  /** Por qué no se hizo nada, si no se hizo nada. */
  omitido?: 'no_existe' | 'simulada' | 'sin_proyecto' | 'sin_vendor' | 'error'
}

/** `opciones.lista` del sobre guardado, validada. Cualquier otra forma → `null` («no se sabe»). */
export function listaOpciones(sobre: unknown): OpcionProductoLegible[] | null {
  const l = sobre && typeof sobre === 'object' ? (sobre as { lista?: unknown }).lista : null
  if (!Array.isArray(l)) return null
  return l.filter((o): o is OpcionProductoLegible =>
    !!o && typeof (o as OpcionProductoLegible).etiqueta === 'string' && typeof (o as OpcionProductoLegible).valor === 'string')
}

const vacio = (): ResumenCoberturasTarificacion => ({ leidas: 0, fallos: 0, sinOferta: 0, sinIntentar: 0 })

/** Una promesa con tope de tiempo. Pasado el tope, rechaza (y cuenta como `fallo`). */
function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tope_de_tiempo_agotado')), Math.max(0, ms))
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Lee y guarda las coberturas (y sus garantías) de los precios de una tarificación que aún no
 * las tienen. Nunca lanza.
 */
export async function completarCoberturasTarificacion(
  ids: { correduriaId: string; tarificacionId: string },
  deps: Partial<DepsCoberturasTarificacion> = {},
): Promise<ResumenCoberturasTarificacion> {
  const resumen = vacio()
  try {
    // Lo que no venga doblado sale de la BD y el vendor de verdad (p. ej. `presupuesto.ts` solo
    // pasa un `topeMs` más corto: Alberto está esperando en pantalla).
    const completo = deps.cabecera && deps.pendientes && deps.guardar && deps.coberturas !== undefined
    const d: DepsCoberturasTarificacion = completo
      ? (deps as DepsCoberturasTarificacion)
      : { ...(await depsReales(ids)), ...deps }
    const ahora = d.ahora ?? (() => new Date())
    const topeMs = d.topeMs ?? TOPE_COBERTURAS_MS
    const concurrencia = Math.max(1, d.concurrencia ?? CONCURRENCIA_COBERTURAS)
    const inicio = Date.now()
    const queda = () => topeMs - (Date.now() - inicio)

    const cab = await d.cabecera()
    if (!cab) return { ...resumen, omitido: 'no_existe' }
    // Una simulada no tiene proyecto en el vendor: preguntarle sería leer de otro proyecto o un 404.
    if (cab.simulado) return { ...resumen, omitido: 'simulada' }
    if (!cab.projectId) return { ...resumen, omitido: 'sin_proyecto' }
    const leer = d.coberturas
    if (!leer) return { ...resumen, omitido: 'sin_vendor' }
    const projectId = cab.projectId
    const ramoCatalogo = ramoDeCatalogo(cab.ramo)

    // Agrupar por oferta: varias filas (modalidades, fraccionamientos) comparten oferta → 1 GET.
    const porOferta = new Map<string, FilaSinCoberturas[]>()
    // Misma oferta = mismas opciones de producto: se toman de la primera fila que las tenga.
    const opcionesDeOferta = new Map<string, OpcionProductoLegible[]>()
    for (const f of await d.pendientes()) {
      if (!f.ofertaId) { resumen.sinOferta += 1; continue }
      if (f.opciones && !opcionesDeOferta.has(f.ofertaId)) opcionesDeOferta.set(f.ofertaId, f.opciones)
      const lista = porOferta.get(f.ofertaId)
      if (lista) lista.push(f)
      else porOferta.set(f.ofertaId, [f])
    }

    const cola = [...porOferta.entries()]
    const trabajar = async () => {
      for (let item = cola.shift(); item; item = cola.shift()) {
        const [ofertaId, filas] = item
        // Sin tiempo no se EMPIEZA: la fila se queda a NULL («no intentado») y la retoma la red
        // de seguridad. Marcarla `fallo` sin haber llamado sería inventarse un fallo.
        if (queda() <= 0) { resumen.sinIntentar += filas.length; continue }
        let sobre: SobreCoberturas
        try {
          const lista = leerCoberturas(await conTope(leer(projectId, ofertaId), queda()))
          sobre = { estado: lista.length > 0 ? 'leidas' : 'vacias', lista, leidasAt: ahora().toISOString() }
        } catch (e) {
          console.warn(`[coberturas-tarificacion] oferta ${ofertaId}: no se pudieron leer:`, mensaje(e))
          // 🚨 `lista: null`, NUNCA `[]`: un fallo pintado como lista vacía diría «no cubre nada».
          sobre = { estado: 'fallo', lista: null, leidasAt: ahora().toISOString() }
        }
        // Las garantías son de CADA fila: comparten oferta, pero no categoría (un todo riesgo y un
        // terceros pueden salir de la misma). Sin lista leída, NULL = «aún sin leer», no «no dice».
        const grupos = new Map<string, { ids: string[]; garantias: GarantiasClasificadas | null }>()
        for (const f of filas) {
          const garantias = ramoCatalogo && sobre.estado !== 'fallo'
            ? clasificarCoberturas(ramoCatalogo, sobre.lista, opcionesDeOferta.get(ofertaId) ?? null, f.contexto ?? null)
            : null
          const clave = JSON.stringify(garantias)
          const g = grupos.get(clave)
          if (g) g.ids.push(f.id)
          else grupos.set(clave, { ids: [f.id], garantias })
        }
        for (const g of grupos.values()) {
          try {
            await d.guardar(g.ids, sobre, g.garantias)
            if (sobre.estado === 'fallo') resumen.fallos += g.ids.length
            else resumen.leidas += g.ids.length
          } catch (e) {
            // No se escribió: las filas siguen como estaban, que es la verdad («no intentado»).
            console.warn(`[coberturas-tarificacion] oferta ${ofertaId}: no se pudo guardar:`, mensaje(e))
            resumen.sinIntentar += g.ids.length
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrencia, cola.length) }, trabajar))
    return resumen
  } catch (e) {
    console.warn('[coberturas-tarificacion] pasada abortada:', mensaje(e))
    return { ...resumen, omitido: 'error' }
  }
}

/**
 * Qué tarificación hay que completar tras un `cotizar()`: solo una REAL que se guardó. Una
 * simulada o una que no quedó guardada no tiene filas que completar.
 */
export function tarificacionACompletar(
  r: ResultadoCotizacion,
  correduriaId: string,
): { correduriaId: string; tarificacionId: string } | null {
  if (!r.ok || r.simulado || r.guardado.estado !== 'guardada') return null
  return { correduriaId, tarificacionId: r.guardado.cotizacionId }
}

// ─── Las dependencias de verdad (BD + vendor) ────────────────────────────────
// 🔒 `correduria_id` en toda lectura y escritura: con BYPASSRLS, olvidarlo no da error.

async function depsReales(ids: { correduriaId: string; tarificacionId: string }): Promise<DepsCoberturasTarificacion> {
  const { resolverConfig, simulacionActiva } = await import('./config.ts')
  const { peticion } = await import('./cliente.ts')
  let coberturas: DepsCoberturasTarificacion['coberturas'] = null
  if (!simulacionActiva(process.env)) {
    const r = resolverConfig(process.env, { ignorarInterruptor: true })
    if (r.estado === 'lista') {
      const config = r.config
      coberturas = (projectId, ofertaId) =>
        peticion(config, {
          metodo: 'GET',
          path: `/insurances/${encodeURIComponent(projectId)}/offers/${encodeURIComponent(ofertaId)}/coverages`,
          timeoutMs: config.timeoutGenericoMs,
        })
    }
  }

  return {
    coberturas,
    async cabecera() {
      const filas = await prisma.$queryRaw<{ simulado: boolean; project_id_codeoscopic: string | null; ramo: string }[]>`
        select simulado, project_id_codeoscopic, ramo
        from seguros.tarificaciones
        where id = ${ids.tarificacionId}::uuid and correduria_id = ${ids.correduriaId}::uuid
      `
      const f = filas[0]
      return f ? { simulado: f.simulado, projectId: f.project_id_codeoscopic, ramo: f.ramo } : null
    },
    async pendientes() {
      const filas = await prisma.$queryRaw<{ id: string; oferta_id: string | null; opciones: unknown; categoria: string | null; modalidad: string | null }[]>`
        select p.id::text as id, p.oferta_id, p.opciones, p.categoria, p.modalidad
        from seguros.tarificacion_precios p
        join seguros.tarificaciones t on t.id = p.tarificacion_id
        where p.tarificacion_id = ${ids.tarificacionId}::uuid
          and t.correduria_id = ${ids.correduriaId}::uuid
          and (p.coberturas is null or p.coberturas->>'estado' = 'fallo')
      `
      return filas.map((f) => ({
        id: f.id, ofertaId: f.oferta_id, opciones: listaOpciones(f.opciones),
        contexto: { categoria: f.categoria, modalidad: f.modalidad },
      }))
    },
    async guardar(filas, sobre, garantias) {
      return prisma.$executeRaw`
        update seguros.tarificacion_precios p
        set coberturas = ${JSON.stringify(sobre)}::jsonb,
            garantias = ${garantias === null ? null : JSON.stringify(garantias)}::jsonb
        from seguros.tarificaciones t
        where t.id = p.tarificacion_id
          and t.correduria_id = ${ids.correduriaId}::uuid
          and p.tarificacion_id = ${ids.tarificacionId}::uuid
          and p.id = any(${filas}::uuid[])
          and (p.coberturas is null or p.coberturas->>'estado' = 'fallo')
      `
    },
  }
}
