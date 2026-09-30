// BACKFILL de coberturas de los precios VIEJOS de `tarificacion_precios` (29/09/2026).
//
// `completarCoberturasTarificacion` solo sabe leer filas CON `oferta_id`, y las guardadas antes del
// 29/09/2026 no lo tienen (se guardaban sin él): 264 filas con `coberturas is null`, casi todas sin
// oferta. Aquí, por tarificación:
//   1. Si alguna fila pendiente no tiene `oferta_id`, se relee el proyecto UNA vez
//      (`GET /insurances/{id}`, gratis) y cada fila se casa con su precio con el MISMO criterio
//      que el presupuesto (`casarPrecio`: `referencia_vendor` y, si no, compañía + producto +
//      prima al céntimo; con modalidad como desempate). Donde casa, se escribe `oferta_id`
//      (solo sobre `oferta_id is null`).
//   2. Lo que NO casa (o casa con un precio sin oferta) se escribe como sobre `sin_oferta`, y si la
//      relectura del proyecto falla, como `fallo` — el mismo contrato que `leerCoberturasDeOpciones`.
//      Así la fila deja de estar «pendiente» y el cron no la vuelve a pedir cada hora para siempre;
//      y como `sobreReutilizable` no reutiliza ni `fallo` ni `sin_oferta`, al preparar un
//      presupuesto se vuelve a intentar por el camino de siempre. Nada se da por «no cubre».
//   3. Después, `completarCoberturasTarificacion` lee las coberturas de las que ya tienen oferta.
//
// 🚨 Son LECTURAS: no mira el interruptor de gasto (mismo criterio que `coberturas-tarificacion.ts`).
// 🚨 Nunca lanza: corre en un cron, y una tarificación rota no puede tumbar a las demás.
// 🔒 `correduria_id` en toda lectura y escritura: con BYPASSRLS, olvidarlo no da error.

import { clasificarCoberturas, ramoDeCatalogo, VERSION_CATALOGO, type CoberturaParaClasificar, type GarantiasClasificadas } from '@central/module-seguros'
import { casarPrecio, type SobreCoberturas } from './coberturas-presupuesto.ts'
import type { ResumenCoberturasTarificacion } from './coberturas-tarificacion.ts'
import type { Precio } from './respuesta.ts'
import { leerOpcionesLegibles, sobreOpciones, type OpcionLegible, type SobreOpciones } from './coberturas.ts'

/** Una fila pendiente (`coberturas is null`) SIN `oferta_id`, con lo necesario para casarla. */
export type FilaSinOferta = {
  id: string
  compania: string
  producto: string
  modalidad: string | null
  primaEur: number
  referenciaVendor: string | null
  /** La oferta ya guardada de la fila (solo la trae `sinOpciones`). */
  ofertaId?: string | null
}

export type PlanOfertas = {
  /** Filas que casan con un precio que SÍ tiene oferta. */
  asignar: { id: string; ofertaId: string }[]
  /** Filas sin precio casado (o casado con uno sin oferta): no hay oferta que leer. */
  sinOferta: string[]
}

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * La oferta de una fila vieja. Primero `casarPrecio` tal cual (el criterio del presupuesto); si
 * empata, se vuelve a intentar SOLO entre los precios de la misma modalidad. Con empate también ahí
 * no se elige: leer las coberturas de otra oferta sería peor que no leerlas.
 */
export function ofertaDeFila(f: FilaSinOferta, precios: readonly Precio[]): string | null {
  return precioDeFila(f, precios)?.ofertaId ?? null
}

/** El precio del proyecto releído que corresponde a una fila guardada (mismo criterio que la oferta). */
export function precioDeFila(f: FilaSinOferta, precios: readonly Precio[]): Precio | null {
  const o = { compania: f.compania, producto: f.producto, primaEur: f.primaEur, referenciaVendor: f.referenciaVendor }
  return casarPrecio(o, precios) ?? casarPrecio(o, precios.filter((p) => norm(p.modalidad) === norm(f.modalidad)))
}

/**
 * De qué oferta se leen las opciones de una fila. PURO. La guardada manda; si no hay, la del precio
 * casado en el proyecto releído. `'fallo'` = hacía falta releer el proyecto y la relectura falló;
 * `null` = no hay oferta (→ `sin_precio`).
 */
export function ofertaParaOpciones(f: FilaSinOferta, precios: readonly Precio[] | null): string | null | 'fallo' {
  if (f.ofertaId) return f.ofertaId
  if (precios === null) return 'fallo'
  return precioDeFila(f, precios)?.ofertaId ?? null
}

/**
 * Las opciones del producto de `GET /insurances/{id}/offers/{offerId}` (28/09/2026). MEDIDO: ni la
 * cotización ni `GET /insurances/{id}` las traen (280 de 280 precios sin ellas); el portal dice que
 * es la oferta la que se devuelve «with its product options». Se prueban las formas razonables.
 */
export function opcionesDeOferta(raw: unknown): OpcionLegible[] | null {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const candidatos = [o, o.mainQuote, o.quote, (o.offer as Record<string, unknown> | undefined)?.mainQuote]
  for (const c of candidatos) {
    const r = leerOpcionesLegibles(c)
    if (r !== null) return r
  }
  return null
}

/** Reparte las filas sin oferta entre «ya tiene oferta» y «no hay oferta que leer». PURO. */
export function planOfertas(filas: readonly FilaSinOferta[], precios: readonly Precio[]): PlanOfertas {
  const plan: PlanOfertas = { asignar: [], sinOferta: [] }
  for (const f of filas) {
    const ofertaId = ofertaDeFila(f, precios)
    if (ofertaId) plan.asignar.push({ id: f.id, ofertaId })
    else plan.sinOferta.push(f.id)
  }
  return plan
}

// ─── Una tarificación ────────────────────────────────────────────────────────

export type CabeceraBackfill = { simulado: boolean; projectId: string | null; ramo: string }

export type DepsBackfill = {
  /** Cabecera filtrada por correduría. `null` = no existe en esta correduría. */
  cabecera: () => Promise<CabeceraBackfill | null>
  /** Filas con `coberturas is null` y `oferta_id is null`. */
  sinOferta: () => Promise<FilaSinOferta[]>
  /** `GET /insurances/{id}` → sus precios. `null` = no se puede leer del vendor (simulación, sin credenciales). */
  refrescar: ((projectId: string) => Promise<Precio[]>) | null
  /** `update … set oferta_id where id = … and oferta_id is null and coberturas is null`. Filas escritas. */
  asignarOferta: (id: string, ofertaId: string) => Promise<number>
  /** `update … set coberturas, garantias where id = any(ids) and coberturas is null`. Filas escritas. */
  marcar: (ids: string[], sobre: SobreCoberturas, garantias: GarantiasClasificadas | null) => Promise<number>
  /** Filas con `opciones is null` (28/09/2026). Opcional: sin ella no se leen opciones. */
  sinOpciones?: () => Promise<FilaSinOferta[]>
  /** `GET /insurances/{id}/offers/{offerId}` (gratis). `null`/ausente = no se leen opciones. */
  leerOferta?: ((projectId: string, ofertaId: string) => Promise<unknown>) | null
  /**
   * `update … set opciones where id = … and opciones is null`, y si la fila ya tiene coberturas
   * leídas, recalcula su `garantias` con ellas + estas opciones (asistencia ampliada). Filas escritas.
   */
  escribirOpciones?: (id: string, sobre: SobreOpciones, ramo: string) => Promise<number>
  /** La pasada normal sobre las filas que ya tienen oferta. */
  completar: (topeMs: number) => Promise<ResumenCoberturasTarificacion>
  ahora?: () => Date
  topeMs?: number
}

export type ResumenBackfill = {
  /** Filas a las que se les ha escrito el `oferta_id` recuperado. */
  ofertasRecuperadas: number
  /** Filas sin oferta que casar → sobre `sin_oferta`. */
  sinOferta: number
  /** Filas sin oferta cuya relectura del proyecto falló → sobre `fallo`. */
  falloProyecto: number
  /** Filas a las que se les han escrito las opciones del producto (cualquier estado). */
  opciones?: number
  /** Lo que devolvió `completarCoberturasTarificacion` (null si no se llegó a llamar). */
  completar: ResumenCoberturasTarificacion | null
  omitido?: 'no_existe' | 'simulada' | 'sin_proyecto' | 'sin_vendor' | 'error'
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Solo NOMBRES de claves (nivel 1 y `mainQuote.product`), para diagnosticar la forma sin volcar datos. */
function clavesDe(raw: unknown): { raiz: string[]; producto: string[] } {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const mq = o.mainQuote && typeof o.mainQuote === 'object' ? (o.mainQuote as Record<string, unknown>) : {}
  const pr = mq.product && typeof mq.product === 'object' ? (mq.product as Record<string, unknown>) : {}
  return { raiz: Object.keys(o), producto: Object.keys(pr) }
}

/** Rellena `oferta_id` donde se puede y luego las coberturas. Nunca lanza. */
export async function backfillCoberturasTarificacion(
  ids: { correduriaId: string; tarificacionId: string },
  deps: Partial<DepsBackfill> = {},
): Promise<ResumenBackfill> {
  const r: ResumenBackfill = { ofertasRecuperadas: 0, sinOferta: 0, falloProyecto: 0, completar: null }
  try {
    const completo = deps.cabecera && deps.sinOferta && deps.asignarOferta && deps.marcar && deps.completar && deps.refrescar !== undefined
    const d: DepsBackfill = completo ? (deps as DepsBackfill) : { ...(await depsReales(ids)), ...deps }
    const ahora = d.ahora ?? (() => new Date())
    const topeMs = d.topeMs ?? 30_000
    const inicio = Date.now()

    const cab = await d.cabecera()
    if (!cab) return { ...r, omitido: 'no_existe' }
    // Una simulada no tiene proyecto en el vendor: preguntarle sería leer otro proyecto o un 404.
    if (cab.simulado) return { ...r, omitido: 'simulada' }
    if (!cab.projectId) return { ...r, omitido: 'sin_proyecto' }
    // Sin vendor no se toca NADA: las filas siguen a NULL («no intentado»), no pasan a `fallo`.
    if (!d.refrescar) return { ...r, omitido: 'sin_vendor' }
    const ramo = ramoDeCatalogo(cab.ramo)
    const garantiasSinLista = ramo ? clasificarCoberturas(ramo, null) : null

    const filas = await d.sinOferta()
    const filasOpciones = d.sinOpciones && d.escribirOpciones && d.leerOferta ? await d.sinOpciones() : []
    // UNA relectura del proyecto por tarificación, y solo si hace falta: ofertas que recuperar.
    let precios: Precio[] | null = null
    if (filas.length > 0 || filasOpciones.some((f) => !f.ofertaId)) {
      try {
        precios = await d.refrescar(cab.projectId)
      } catch (e) {
        console.warn(`[backfill-coberturas] ${ids.tarificacionId}: no se pudo releer el proyecto:`, mensaje(e))
      }
    }
    if (filas.length > 0) {
      if (precios === null) {
        // 🚨 `lista: null`, NUNCA `[]`: un fallo pintado como lista vacía diría «no cubre nada».
        // Garantías NULL = «aún sin leer» (30/09/2026): con todo `no_consta` la parrilla las daba por
        // leídas («no dice si incluye grúa»). La fila en `fallo` se reintenta en la pasada siguiente.
        r.falloProyecto += await d.marcar(filas.map((f) => f.id), { estado: 'fallo', lista: null, leidasAt: ahora().toISOString() }, null)
      } else {
        const plan = planOfertas(filas, precios)
        for (const a of plan.asignar) r.ofertasRecuperadas += await d.asignarOferta(a.id, a.ofertaId)
        if (plan.sinOferta.length > 0) {
          r.sinOferta += await d.marcar(plan.sinOferta, { estado: 'sin_oferta', lista: null, leidasAt: ahora().toISOString() }, garantiasSinLista)
        }
      }
    }

    if (filasOpciones.length > 0 && d.escribirOpciones && d.leerOferta) {
      r.opciones = 0
      const leidas = new Map<string, OpcionLegible[] | null | 'fallo'>()
      for (const f of filasOpciones) {
        if (Date.now() - inicio > topeMs) break
        const leidasAt = ahora().toISOString()
        const oferta = ofertaParaOpciones(f, precios)
        let sobre: SobreOpciones
        if (oferta === 'fallo') sobre = { estado: 'fallo', lista: null, leidasAt }
        else if (oferta === null) sobre = { estado: 'sin_precio', lista: null, leidasAt }
        else {
          if (!leidas.has(oferta)) {
            try {
              const raw = await d.leerOferta(cab.projectId, oferta)
              const ops = opcionesDeOferta(raw)
              if (ops === null) console.info(`[backfill-coberturas] oferta sin opciones legibles; claves:`, clavesDe(raw))
              leidas.set(oferta, ops)
            } catch (e) {
              console.warn(`[backfill-coberturas] ${ids.tarificacionId}: no se pudo leer la oferta:`, mensaje(e))
              leidas.set(oferta, 'fallo')
            }
          }
          const ops = leidas.get(oferta)!
          sobre = ops === 'fallo' ? { estado: 'fallo', lista: null, leidasAt } : sobreOpciones(ops, leidasAt)
        }
        r.opciones += await d.escribirOpciones(f.id, sobre, cab.ramo)
      }
    }

    const queda = topeMs - (Date.now() - inicio)
    if (queda > 0) r.completar = await d.completar(queda)
    return r
  } catch (e) {
    console.warn(`[backfill-coberturas] ${ids.tarificacionId}: abortado:`, mensaje(e))
    return { ...r, omitido: 'error' }
  }
}

// ─── La pasada del cron ──────────────────────────────────────────────────────

export type ResumenPasada = {
  tarificaciones: number
  ofertasRecuperadas: number
  sinOferta: number
  falloProyecto: number
  opciones: number
  coberturasLeidas: number
  coberturasFallo: number
  /** Tarificaciones que se quedaron sin tocar porque se agotó el presupuesto de tiempo. */
  sinTiempo: number
  omitidas: Record<string, number>
}

/**
 * Coge hasta `limite` tarificaciones con filas pendientes (la más reciente primero) y las
 * procesa DE UNA EN UNA dentro de `presupuestoMs`. Una sin tiempo no se empieza.
 */
export async function pasadaBackfillCoberturas(
  correduriaId: string,
  opts: { limite?: number; presupuestoMs?: number; porTarificacionMs?: number } = {},
  deps: {
    candidatas?: (correduriaId: string, limite: number) => Promise<string[]>
    backfill?: (ids: { correduriaId: string; tarificacionId: string }, topeMs: number) => Promise<ResumenBackfill>
  } = {},
): Promise<ResumenPasada> {
  const limite = Math.max(1, Math.min(opts.limite ?? 20, 200))
  const presupuestoMs = opts.presupuestoMs ?? 240_000
  const porTarificacionMs = opts.porTarificacionMs ?? 30_000
  const candidatas = deps.candidatas ?? candidatasReales
  const backfill = deps.backfill ?? ((ids, topeMs) => backfillCoberturasTarificacion(ids, { topeMs }))
  const inicio = Date.now()

  const total: ResumenPasada = {
    tarificaciones: 0, ofertasRecuperadas: 0, sinOferta: 0, falloProyecto: 0, opciones: 0,
    coberturasLeidas: 0, coberturasFallo: 0, sinTiempo: 0, omitidas: {},
  }
  const ids = await candidatas(correduriaId, limite)
  for (const [i, tarificacionId] of ids.entries()) {
    const queda = presupuestoMs - (Date.now() - inicio)
    if (queda < 5_000) { total.sinTiempo = ids.length - i; break }
    const r = await backfill({ correduriaId, tarificacionId }, Math.min(porTarificacionMs, queda))
    total.tarificaciones += 1
    total.ofertasRecuperadas += r.ofertasRecuperadas
    total.sinOferta += r.sinOferta
    total.falloProyecto += r.falloProyecto
    total.opciones += r.opciones ?? 0
    total.coberturasLeidas += r.completar?.leidas ?? 0
    total.coberturasFallo += r.completar?.fallos ?? 0
    if (r.omitido) total.omitidas[r.omitido] = (total.omitidas[r.omitido] ?? 0) + 1
    // Sin vendor, las siguientes tampoco lo tendrán: no se sigue gastando la pasada.
    if (r.omitido === 'sin_vendor') { total.sinTiempo = ids.length - i - 1; break }
  }
  return total
}

// ─── Reclasificar con el catálogo nuevo (29/09/2026) ─────────────────────────
// Subir `VERSION_CATALOGO` no cambia lo ya guardado: nadie comparaba la versión. Esto recalcula las
// `garantias` de las filas con versión vieja desde lo que YA está en la fila (coberturas + opciones),
// sin llamar al vendor. Una fila sin coberturas escritas no se toca: la completa el backfill.

export type FilaReclasificar = {
  id: string; ramo: string; coberturas: unknown; opciones: unknown
  /** Categoría y modalidad del precio (30/09/2026): un todo riesgo no sale «sin daños propios». */
  categoria?: string | null; modalidad?: string | null
}

const listaDe = (sobre: unknown): unknown[] | null => {
  const o = sobre && typeof sobre === 'object' ? (sobre as { lista?: unknown }) : null
  return o && Array.isArray(o.lista) ? o.lista : null
}

/** Las garantías de una fila con el catálogo actual. PURO. `null` = ramo sin catálogo (no se toca). */
export function garantiasActuales(f: FilaReclasificar): GarantiasClasificadas | null {
  const ramo = ramoDeCatalogo(f.ramo)
  if (!ramo) return null
  return clasificarCoberturas(ramo, listaDe(f.coberturas) as CoberturaParaClasificar[] | null, listaDe(f.opciones) as OpcionLegible[] | null, {
    categoria: f.categoria ?? null, modalidad: f.modalidad ?? null,
  })
}

export async function reclasificarGarantiasViejas(
  correduriaId: string,
  opts: { limite?: number } = {},
  deps: {
    viejas?: (correduriaId: string, limite: number) => Promise<FilaReclasificar[]>
    escribir?: (correduriaId: string, id: string, g: GarantiasClasificadas) => Promise<number>
  } = {},
): Promise<{ revisadas: number; reclasificadas: number; errores: number; error?: string }> {
  // 🚨 Nunca lanza: corre en el mismo cron que el backfill de coberturas, y un fallo aquí no puede
  // dejar sin hacer la pasada que sí llama al vendor (la lectura de coberturas de las cotizaciones).
  const viejas = deps.viejas ?? viejasReales
  const escribir = deps.escribir ?? escribirReal
  let filas: FilaReclasificar[]
  try {
    filas = await viejas(correduriaId, Math.max(1, Math.min(opts.limite ?? 500, 2000)))
  } catch (e) {
    console.warn('[backfill-coberturas] no se pudieron leer las garantías viejas:', mensaje(e))
    return { revisadas: 0, reclasificadas: 0, errores: 1, error: mensaje(e) }
  }
  let reclasificadas = 0
  let errores = 0
  for (const f of filas) {
    try {
      const g = garantiasActuales(f)
      if (g) reclasificadas += await escribir(correduriaId, f.id, g)
    } catch (e) {
      errores += 1
      console.warn(`[backfill-coberturas] no se pudo reclasificar ${f.id}:`, mensaje(e))
    }
  }
  return { revisadas: filas.length, reclasificadas, errores }
}

async function viejasReales(correduriaId: string, limite: number): Promise<FilaReclasificar[]> {
  const { prisma } = await import('../tenant.ts')
  return prisma.$queryRaw<FilaReclasificar[]>`
    select p.id::text as id, t.ramo, p.coberturas, p.opciones, p.categoria, p.modalidad
    from tarificacion_precios p
    join tarificaciones t on t.id = p.tarificacion_id
    where t.correduria_id = ${correduriaId}::uuid
      and p.coberturas is not null
      and p.garantias is not null
      and coalesce((p.garantias->>'version')::int, 0) < ${VERSION_CATALOGO}::int
    order by t.creado_at desc
    limit ${limite}::int
  `
}

async function escribirReal(correduriaId: string, id: string, g: GarantiasClasificadas): Promise<number> {
  const { prisma } = await import('../tenant.ts')
  return prisma.$executeRaw`
    update tarificacion_precios p
    set garantias = ${JSON.stringify(g)}::jsonb
    from tarificaciones t
    where t.id = p.tarificacion_id
      and t.correduria_id = ${correduriaId}::uuid
      and p.id = ${id}::uuid
      and coalesce((p.garantias->>'version')::int, 0) < ${g.version}::int
  `
}

// ─── BD y vendor de verdad ───────────────────────────────────────────────────

async function candidatasReales(correduriaId: string, limite: number): Promise<string[]> {
  const { prisma } = await import('../tenant.ts')
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    select t.id::text as id
    from tarificaciones t
    where t.correduria_id = ${correduriaId}::uuid
      and t.simulado = false
      and t.project_id_codeoscopic is not null
      and exists (select 1 from tarificacion_precios p where p.tarificacion_id = t.id and (
        p.coberturas is null or p.opciones is null
        -- Un fallo de lectura se reintenta, pero no para siempre: una semana (30/09/2026).
        or (p.coberturas->>'estado' = 'fallo' and t.creado_at > now() - interval '7 days')))
    order by t.creado_at desc
    limit ${limite}
  `
  return filas.map((f) => f.id)
}

async function depsReales(ids: { correduriaId: string; tarificacionId: string }): Promise<DepsBackfill> {
  const { prisma } = await import('../tenant.ts')
  const { resolverConfig, simulacionActiva } = await import('./config.ts')
  const { refrescarProyecto } = await import('./emitir.ts')
  const { completarCoberturasTarificacion } = await import('./coberturas-tarificacion.ts')
  const { peticion } = await import('./cliente.ts')

  let refrescar: DepsBackfill['refrescar'] = null
  let leerOferta: DepsBackfill['leerOferta'] = null
  if (!simulacionActiva(process.env)) {
    const r = resolverConfig(process.env, { ignorarInterruptor: true })
    if (r.estado === 'lista') {
      const config = r.config
      refrescar = async (projectId) => (await refrescarProyecto(config, projectId)).precios
      leerOferta = (projectId, ofertaId) =>
        peticion(config, {
          metodo: 'GET',
          path: `/insurances/${encodeURIComponent(projectId)}/offers/${encodeURIComponent(ofertaId)}`,
          timeoutMs: config.timeoutGenericoMs,
        })
    }
  }

  return {
    refrescar,
    leerOferta,
    async cabecera() {
      const filas = await prisma.$queryRaw<{ simulado: boolean; project_id_codeoscopic: string | null; ramo: string }[]>`
        select simulado, project_id_codeoscopic::text as project_id_codeoscopic, ramo
        from tarificaciones
        where id = ${ids.tarificacionId}::uuid and correduria_id = ${ids.correduriaId}::uuid
      `
      const f = filas[0]
      return f ? { simulado: f.simulado, projectId: f.project_id_codeoscopic, ramo: f.ramo } : null
    },
    async sinOferta() {
      const filas = await prisma.$queryRaw<{
        id: string; compania: string; producto: string; modalidad: string | null; prima_eur: unknown; referencia_vendor: string | null
      }[]>`
        select p.id::text as id, p.compania, p.producto, p.modalidad, p.prima_eur, p.referencia_vendor
        from tarificacion_precios p
        join tarificaciones t on t.id = p.tarificacion_id
        where p.tarificacion_id = ${ids.tarificacionId}::uuid
          and t.correduria_id = ${ids.correduriaId}::uuid
          and (p.coberturas is null or p.coberturas->>'estado' = 'fallo')
          and p.oferta_id is null
      `
      return filas.map((f) => ({
        id: f.id, compania: f.compania, producto: f.producto, modalidad: f.modalidad,
        primaEur: Number(String(f.prima_eur)), referenciaVendor: f.referencia_vendor,
      }))
    },
    async asignarOferta(id, ofertaId) {
      return prisma.$executeRaw`
        update tarificacion_precios p
        set oferta_id = ${ofertaId}
        from tarificaciones t
        where t.id = p.tarificacion_id
          and t.correduria_id = ${ids.correduriaId}::uuid
          and p.tarificacion_id = ${ids.tarificacionId}::uuid
          and p.id = ${id}::uuid
          and p.oferta_id is null
          and (p.coberturas is null or p.coberturas->>'estado' = 'fallo')
      `
    },
    async marcar(filas, sobre, garantias) {
      return prisma.$executeRaw`
        update tarificacion_precios p
        set coberturas = ${JSON.stringify(sobre)}::jsonb,
            garantias = ${garantias === null ? null : JSON.stringify(garantias)}::jsonb
        from tarificaciones t
        where t.id = p.tarificacion_id
          and t.correduria_id = ${ids.correduriaId}::uuid
          and p.tarificacion_id = ${ids.tarificacionId}::uuid
          and p.id = any(${filas}::uuid[])
          and (p.coberturas is null or p.coberturas->>'estado' = 'fallo')
      `
    },
    async sinOpciones() {
      const filas = await prisma.$queryRaw<{
        id: string; compania: string; producto: string; modalidad: string | null; prima_eur: unknown; referencia_vendor: string | null; oferta_id: string | null
      }[]>`
        select p.id::text as id, p.compania, p.producto, p.modalidad, p.prima_eur, p.referencia_vendor, p.oferta_id
        from tarificacion_precios p
        join tarificaciones t on t.id = p.tarificacion_id
        where p.tarificacion_id = ${ids.tarificacionId}::uuid
          and t.correduria_id = ${ids.correduriaId}::uuid
          and p.opciones is null
      `
      return filas.map((f) => ({
        id: f.id, compania: f.compania, producto: f.producto, modalidad: f.modalidad,
        primaEur: Number(String(f.prima_eur)), referenciaVendor: f.referencia_vendor, ofertaId: f.oferta_id,
      }))
    },
    async escribirOpciones(id, sobre, ramo) {
      // Las garantías se recalculan con las coberturas ya guardadas de ESA fila + las opciones nuevas:
      // la asistencia ampliada depende de las dos. Sin coberturas leídas, `garantias` no se toca.
      const ramoCat = ramoDeCatalogo(ramo)
      const filas = await prisma.$queryRaw<{ coberturas: unknown; categoria: string | null; modalidad: string | null }[]>`
        select p.coberturas, p.categoria, p.modalidad from tarificacion_precios p
        join tarificaciones t on t.id = p.tarificacion_id
        where p.id = ${id}::uuid and t.correduria_id = ${ids.correduriaId}::uuid
      `
      const cob = filas[0]?.coberturas as { estado?: string; lista?: unknown } | null | undefined
      const lista = cob && Array.isArray(cob.lista) ? (cob.lista as CoberturaParaClasificar[]) : null
      const garantias = ramoCat && cob && cob.estado !== 'fallo' && cob.estado !== 'sin_oferta'
        ? clasificarCoberturas(ramoCat, lista, sobre.lista, { categoria: filas[0]?.categoria ?? null, modalidad: filas[0]?.modalidad ?? null })
        : null
      return prisma.$executeRaw`
        update tarificacion_precios p
        set opciones = ${JSON.stringify(sobre)}::jsonb,
            garantias = coalesce(${garantias === null ? null : JSON.stringify(garantias)}::jsonb, p.garantias)
        from tarificaciones t
        where t.id = p.tarificacion_id
          and t.correduria_id = ${ids.correduriaId}::uuid
          and p.tarificacion_id = ${ids.tarificacionId}::uuid
          and p.id = ${id}::uuid
          and p.opciones is null
      `
    },
    completar: (topeMs) => completarCoberturasTarificacion(ids, { topeMs }),
  }
}
