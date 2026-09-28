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

import { clasificarCoberturas, ramoDeCatalogo, type GarantiasClasificadas } from '@central/module-seguros'
import { casarPrecio, type SobreCoberturas } from './coberturas-presupuesto.ts'
import type { ResumenCoberturasTarificacion } from './coberturas-tarificacion.ts'
import type { Precio } from './respuesta.ts'
import { sobreOpciones, type SobreOpciones } from './coberturas.ts'

/** Una fila pendiente (`coberturas is null`) SIN `oferta_id`, con lo necesario para casarla. */
export type FilaSinOferta = {
  id: string
  compania: string
  producto: string
  modalidad: string | null
  primaEur: number
  referenciaVendor: string | null
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
 * Las opciones de cada fila sin leer, a partir del proyecto releído. PURO. `precios === null` (la
 * relectura falló) → `fallo`; sin precio casado → `sin_precio`. Nunca `leidas` con `[]` inventado.
 */
export function planOpciones(
  filas: readonly FilaSinOferta[],
  precios: readonly Precio[] | null,
  leidasAt: string,
): { id: string; sobre: SobreOpciones }[] {
  return filas.map((f) => {
    if (precios === null) return { id: f.id, sobre: { estado: 'fallo', lista: null, leidasAt } }
    const p = precioDeFila(f, precios)
    return { id: f.id, sobre: p ? sobreOpciones(p.opciones, leidasAt) : { estado: 'sin_precio', lista: null, leidasAt } }
  })
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
  /** `update … set opciones where id = … and opciones is null`. Filas escritas. */
  escribirOpciones?: (id: string, sobre: SobreOpciones) => Promise<number>
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
    const filasOpciones = d.sinOpciones && d.escribirOpciones ? await d.sinOpciones() : []
    // UNA relectura del proyecto por tarificación, para las dos cosas.
    let precios: Precio[] | null = null
    if (filas.length > 0 || filasOpciones.length > 0) {
      try {
        precios = await d.refrescar(cab.projectId)
      } catch (e) {
        console.warn(`[backfill-coberturas] ${ids.tarificacionId}: no se pudo releer el proyecto:`, mensaje(e))
      }
    }
    if (filas.length > 0) {
      if (precios === null) {
        // 🚨 `lista: null`, NUNCA `[]`: un fallo pintado como lista vacía diría «no cubre nada».
        r.falloProyecto += await d.marcar(filas.map((f) => f.id), { estado: 'fallo', lista: null, leidasAt: ahora().toISOString() }, garantiasSinLista)
      } else {
        const plan = planOfertas(filas, precios)
        for (const a of plan.asignar) r.ofertasRecuperadas += await d.asignarOferta(a.id, a.ofertaId)
        if (plan.sinOferta.length > 0) {
          r.sinOferta += await d.marcar(plan.sinOferta, { estado: 'sin_oferta', lista: null, leidasAt: ahora().toISOString() }, garantiasSinLista)
        }
      }
    }

    if (filasOpciones.length > 0 && d.escribirOpciones) {
      r.opciones = 0
      for (const o of planOpciones(filasOpciones, precios, ahora().toISOString())) {
        r.opciones += await d.escribirOpciones(o.id, o.sobre)
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

// ─── BD y vendor de verdad ───────────────────────────────────────────────────

async function candidatasReales(correduriaId: string, limite: number): Promise<string[]> {
  const { prisma } = await import('../tenant.ts')
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    select t.id::text as id
    from tarificaciones t
    where t.correduria_id = ${correduriaId}::uuid
      and t.simulado = false
      and t.project_id_codeoscopic is not null
      and exists (select 1 from tarificacion_precios p where p.tarificacion_id = t.id and (p.coberturas is null or p.opciones is null))
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

  let refrescar: DepsBackfill['refrescar'] = null
  if (!simulacionActiva(process.env)) {
    const r = resolverConfig(process.env, { ignorarInterruptor: true })
    if (r.estado === 'lista') {
      const config = r.config
      refrescar = async (projectId) => (await refrescarProyecto(config, projectId)).precios
    }
  }

  return {
    refrescar,
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
          and p.coberturas is null
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
          and p.coberturas is null
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
          and p.coberturas is null
      `
    },
    async sinOpciones() {
      const filas = await prisma.$queryRaw<{
        id: string; compania: string; producto: string; modalidad: string | null; prima_eur: unknown; referencia_vendor: string | null
      }[]>`
        select p.id::text as id, p.compania, p.producto, p.modalidad, p.prima_eur, p.referencia_vendor
        from tarificacion_precios p
        join tarificaciones t on t.id = p.tarificacion_id
        where p.tarificacion_id = ${ids.tarificacionId}::uuid
          and t.correduria_id = ${ids.correduriaId}::uuid
          and p.opciones is null
      `
      return filas.map((f) => ({
        id: f.id, compania: f.compania, producto: f.producto, modalidad: f.modalidad,
        primaEur: Number(String(f.prima_eur)), referenciaVendor: f.referencia_vendor,
      }))
    },
    async escribirOpciones(id, sobre) {
      return prisma.$executeRaw`
        update tarificacion_precios p
        set opciones = ${JSON.stringify(sobre)}::jsonb
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
