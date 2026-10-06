// Fichas de producto del tarificador — la parte con BD (07/10/2026). SQL en
// prisma/sql/2026-10-07c_tarificador_fichas.sql (sin aplicar: todo degrada con `sin_tabla`).
//
// 🛡️ Todo por `correduria_id`. El PDF sale SIEMPRE de la tarificación de la correduría (nunca de un id del
//    cuerpo). Una ficha VALIDADA no la reescribe ninguna extracción: solo un humano, editando (y vuelve a
//    `pendiente` hasta que la valide otra vez).

import {
  aplicarEdicion,
  claveProducto,
  condicionesDeJson,
  garantiasFicha,
  huellaCondicionado,
  presupuestoDeJson,
  type AvisoExtraccion,
  type CondicionesProducto,
  type EdicionGarantia,
  type ValoresPresupuesto,
} from '@central/module-tarificacion'
import { prisma } from './tenant'
import { extraerFichaCompleta, extraerSoloPresupuesto, textoDeProyecto } from './tarificador-fichas-ia'
import { datosProyecto, elegirFichaValidada, esSinTablaFichas } from './tarificador-fichas-reglas'

export class SinTablaFichasError extends Error {
  constructor() { super('sin_tabla_fichas') }
}

/** Ejecuta y traduce «la tabla no existe» a `SinTablaFichasError` (la ruta responde 503 `sin_tabla`). */
async function conTabla<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f()
  } catch (e) {
    if (esSinTablaFichas(e)) throw new SinTablaFichasError()
    throw e
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export type FichaResumen = {
  id: string; compania: string; ramo: string; producto: string; version: string | null; estado: string
  garantiasLeidas: number; avisos: number; validadaAt: string | null; actualizadaAt: string
}

export async function listarFichas(correduriaId: string, f: { ramo: string | null; limite: number; antesDe: string | null }): Promise<{ fichas: FichaResumen[]; siguiente: string | null }> {
  return conTabla(async () => {
    const filas = await prisma.$queryRaw<{ id: string; compania: string; ramo: string; producto: string; version: string | null; estado: string; n: number; avisos: number; validada_at: Date | null; updated_at: Date }[]>`
      select id::text as id, compania, ramo, producto, version, estado,
             (select count(*)::int from jsonb_object_keys(coalesce(condiciones -> 'garantias', '{}'::jsonb))) as n,
             jsonb_array_length(avisos)::int as avisos, validada_at, updated_at
      from seguros.tarificador_fichas
      where correduria_id = ${correduriaId}::uuid
        and (${f.ramo}::text is null or ramo = ${f.ramo})
        and (${f.antesDe}::timestamptz is null or updated_at < ${f.antesDe}::timestamptz)
      order by updated_at desc
      limit ${f.limite + 1}`
    const fichas = filas.slice(0, f.limite).map((r) => ({
      id: r.id, compania: r.compania, ramo: r.ramo, producto: r.producto, version: r.version, estado: r.estado,
      garantiasLeidas: r.n, avisos: r.avisos, validadaAt: r.validada_at?.toISOString() ?? null, actualizadaAt: r.updated_at.toISOString(),
    }))
    return { fichas, siguiente: filas.length > f.limite ? fichas[fichas.length - 1].actualizadaAt : null }
  })
}

export type FichaDetalle = FichaResumen & {
  condiciones: CondicionesProducto
  avisosDetalle: AvisoExtraccion[]
  validadaPor: string | null
  huella: string | null
  catalogo: { clave: string; etiqueta: string; grupo: string; tipoValor: string }[]
  presupuestos: { tarificacionId: string; creadoEn: string; valores: ValoresPresupuesto; condicionadoCambiado: boolean | null; citasAusentes: string[] }[]
}

function avisosDeJson(v: unknown): AvisoExtraccion[] {
  return Array.isArray(v) ? v.filter((a): a is AvisoExtraccion => !!a && typeof a === 'object' && typeof (a as AvisoExtraccion).donde === 'string').slice(0, 200) : []
}
const cadenas = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export async function leerFicha(correduriaId: string, id: string): Promise<FichaDetalle | null> {
  return conTabla(async () => {
    const f = (await prisma.$queryRaw<{ id: string; compania: string; ramo: string; producto: string; version: string | null; estado: string; condiciones: unknown; avisos: unknown; huella: string | null; validada_por: string | null; validada_at: Date | null; updated_at: Date }[]>`
      select id::text as id, compania, ramo, producto, version, estado, condiciones, avisos, huella, validada_por, validada_at, updated_at
      from seguros.tarificador_fichas where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)[0]
    if (!f) return null
    const pres = await prisma.$queryRaw<{ tarificacion_id: string; created_at: Date; valores: unknown; condicionado_cambiado: boolean | null; citas_ausentes: unknown }[]>`
      select tarificacion_id::text as tarificacion_id, created_at, valores, condicionado_cambiado, citas_ausentes
      from seguros.tarificador_coberturas_presupuesto
      where ficha_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
      order by created_at desc limit 20`
    const condiciones = condicionesDeJson(f.condiciones)
    const avisos = avisosDeJson(f.avisos)
    return {
      id: f.id, compania: f.compania, ramo: f.ramo, producto: f.producto, version: f.version, estado: f.estado,
      garantiasLeidas: Object.keys(condiciones.garantias).length, avisos: avisos.length,
      validadaAt: f.validada_at?.toISOString() ?? null, actualizadaAt: f.updated_at.toISOString(),
      condiciones, avisosDetalle: avisos, validadaPor: f.validada_por, huella: f.huella,
      catalogo: garantiasFicha(f.ramo).map((g) => ({ clave: g.clave, etiqueta: g.etiqueta, grupo: g.grupo, tipoValor: g.tipoValor })),
      presupuestos: pres.map((p) => ({
        tarificacionId: p.tarificacion_id, creadoEn: p.created_at.toISOString(), valores: presupuestoDeJson(p.valores),
        condicionadoCambiado: p.condicionado_cambiado, citasAusentes: cadenas(p.citas_ausentes),
      })),
    }
  })
}

export type TarificacionConPdf = {
  tarificacionId: string; creadaEn: string; compania: string; ramo: string; producto: string | null; primaAnualEur: number | null
  tienePdf: boolean
  /** `null` = aún no se han extraído coberturas (o la tabla no existe todavía: `fichasActivas`). */
  extraccion: { fichaId: string | null; textoLegible: boolean; avisos: number; condicionadoCambiado: boolean | null; actualizadaEn: string } | null
}

/** Tarificaciones RPA recientes con su PDF y el estado de la extracción. Funciona aunque falte la tabla nueva. */
export async function listarTarificacionesConPdf(correduriaId: string, limite: number): Promise<{ tarificaciones: TarificacionConPdf[]; fichasActivas: boolean }> {
  const filas = await prisma.$queryRaw<{ id: string; created_at: Date; ramo: string | null; respuesta: unknown }[]>`
    select id::text as id, created_at, ramo, respuesta
    from seguros.tarificaciones
    where correduria_id = ${correduriaId}::uuid and canal = 'rpa'
    order by created_at desc
    limit ${limite}`
  const base = filas.flatMap((f) => {
    const d = datosProyecto(f.respuesta)
    return d ? [{ f, d }] : []
  })
  let extr = new Map<string, TarificacionConPdf['extraccion']>()
  let fichasActivas = true
  if (base.length > 0) {
    try {
      const ids = base.map((b) => b.f.id)
      const e = await prisma.$queryRaw<{ tarificacion_id: string; ficha_id: string | null; texto_legible: boolean; avisos: number; condicionado_cambiado: boolean | null; updated_at: Date }[]>`
        select tarificacion_id::text as tarificacion_id, ficha_id::text as ficha_id, texto_legible,
               jsonb_array_length(avisos)::int as avisos, condicionado_cambiado, updated_at
        from seguros.tarificador_coberturas_presupuesto
        where correduria_id = ${correduriaId}::uuid and tarificacion_id = any(${ids}::uuid[])`
      extr = new Map(e.map((x) => [x.tarificacion_id, { fichaId: x.ficha_id, textoLegible: x.texto_legible, avisos: x.avisos, condicionadoCambiado: x.condicionado_cambiado, actualizadaEn: x.updated_at.toISOString() }]))
    } catch (err) {
      if (!esSinTablaFichas(err)) throw err
      fichasActivas = false
    }
  }
  return {
    fichasActivas,
    tarificaciones: base.map(({ f, d }) => ({
      tarificacionId: f.id, creadaEn: f.created_at.toISOString(), compania: d.compania, ramo: f.ramo ?? 'comunidades',
      producto: d.producto, primaAnualEur: d.primaAnualEur, tienePdf: d.documentoId !== null, extraccion: extr.get(f.id) ?? null,
    })),
  }
}

// ─── Extracción ──────────────────────────────────────────────────────────────

export type ResultadoExtraccion =
  | { estado: 'no_encontrada' }
  | { estado: 'sin_pdf'; mensaje: string }
  | { estado: 'sin_texto'; mensaje: string }
  | { estado: 'error_ia'; mensaje: string }
  | { estado: 'ok'; modo: 'ficha_y_presupuesto' | 'solo_presupuesto'; fichaId: string | null; fichaEstado: string | null; avisos: AvisoExtraccion[]; condicionadoCambiado: boolean | null; citasAusentes: string[]; valores: ValoresPresupuesto }

const PRESUPUESTO_VACIO: ValoresPresupuesto = { primaTotalEur: null, primaNetaEur: null, capitales: {}, franquiciaGeneral: null }

async function guardarPresupuesto(p: {
  correduriaId: string; tarificacionId: string; documentoId: string | null; fichaId: string | null; valores: ValoresPresupuesto
  avisos: unknown[]; textoLegible: boolean; condicionadoCambiado: boolean | null; citasAusentes: string[]; actor: string
}): Promise<void> {
  await prisma.$executeRaw`
    insert into seguros.tarificador_coberturas_presupuesto
      (correduria_id, tarificacion_id, documento_id, ficha_id, valores, avisos, texto_legible, condicionado_cambiado, citas_ausentes, extraido_por)
    values (${p.correduriaId}::uuid, ${p.tarificacionId}::uuid, ${p.documentoId}::uuid, ${p.fichaId}::uuid, ${JSON.stringify(p.valores)}::jsonb,
            ${JSON.stringify(p.avisos)}::jsonb, ${p.textoLegible}, ${p.condicionadoCambiado}, ${JSON.stringify(p.citasAusentes)}::jsonb, ${p.actor})
    on conflict (tarificacion_id) do update set
      documento_id = excluded.documento_id, ficha_id = excluded.ficha_id, valores = excluded.valores, avisos = excluded.avisos,
      texto_legible = excluded.texto_legible, condicionado_cambiado = excluded.condicionado_cambiado,
      citas_ausentes = excluded.citas_ausentes, extraido_por = excluded.extraido_por, updated_at = now()
    where seguros.tarificador_coberturas_presupuesto.correduria_id = excluded.correduria_id`
}

/**
 * «Extraer coberturas» de una tarificación con PDF. Sin ficha VALIDADA del producto: extrae condiciones +
 * presupuesto y deja la ficha `pendiente` (crea o refresca el borrador). Con ficha validada: solo los valores
 * del presupuesto y la comprobación de que el condicionado no cambió. Nunca escribe en una ficha validada.
 */
export async function extraerCoberturas(correduriaId: string, tarificacionId: string, actor: string): Promise<ResultadoExtraccion> {
  return conTabla(async () => {
    const t = (await prisma.$queryRaw<{ ramo: string | null; respuesta: unknown }[]>`
      select ramo, respuesta from seguros.tarificaciones
      where id = ${tarificacionId}::uuid and correduria_id = ${correduriaId}::uuid and canal = 'rpa'`)[0]
    if (!t) return { estado: 'no_encontrada' as const }
    const d = datosProyecto(t.respuesta)
    if (!d || !d.documentoId) return { estado: 'sin_pdf' as const, mensaje: 'Esta tarificación no tiene el PDF del proyecto guardado.' }
    const ramo = t.ramo ?? 'comunidades'
    const doc = (await prisma.$queryRaw<{ contenido: Buffer | null }[]>`
      select contenido from seguros.documentos
      where id = ${d.documentoId}::uuid and correduria_id = ${correduriaId}::uuid and mime_type = 'application/pdf'`)[0]
    if (!doc?.contenido) return { estado: 'sin_pdf' as const, mensaje: 'El PDF del proyecto no está en los documentos de la correduría.' }

    const texto = await textoDeProyecto(Buffer.from(doc.contenido))
    if (!texto.ok) {
      const mensaje = 'El PDF no tiene texto (parece un escaneo): no se ha leído ninguna cobertura. Quedan sin dato hasta revisarlas a mano.'
      await guardarPresupuesto({
        correduriaId, tarificacionId, documentoId: d.documentoId, fichaId: null, valores: PRESUPUESTO_VACIO,
        avisos: [{ donde: 'pdf', motivo: 'pdf_sin_texto', detalle: null }], textoLegible: false, condicionadoCambiado: null, citasAusentes: [], actor,
      })
      return { estado: 'sin_texto' as const, mensaje }
    }

    // ¿Hay ficha VALIDADA de este producto (cualquier versión)?
    const validadas = d.producto === null ? [] : await prisma.$queryRaw<{ id: string; version: string | null; condiciones: unknown }[]>`
      select id::text as id, version, condiciones from seguros.tarificador_fichas
      where correduria_id = ${correduriaId}::uuid and estado = 'validada'
        and clave_producto like ${`${claveProducto({ compania: d.compania, ramo, producto: d.producto, version: null })}%`}
      order by validada_at desc limit 10`
    const elegida = elegirFichaValidada(validadas.map((v) => ({ id: v.id, version: v.version, condiciones: condicionesDeJson(v.condiciones) })), texto.texto)

    if (elegida) {
      const r = await extraerSoloPresupuesto(texto.texto, { ramo, compania: d.compania })
      if (!r.ok) return { estado: 'error_ia' as const, mensaje: r.motivo }
      await guardarPresupuesto({
        correduriaId, tarificacionId, documentoId: d.documentoId, fichaId: elegida.ficha.id, valores: r.presupuesto, avisos: r.avisos,
        textoLegible: true, condicionadoCambiado: elegida.cambiado, citasAusentes: elegida.citasAusentes, actor,
      })
      return {
        estado: 'ok' as const, modo: 'solo_presupuesto' as const, fichaId: elegida.ficha.id, fichaEstado: 'validada', avisos: r.avisos,
        condicionadoCambiado: elegida.cambiado, citasAusentes: elegida.citasAusentes, valores: r.presupuesto,
      }
    }

    const r = await extraerFichaCompleta(texto.texto, { ramo, compania: d.compania })
    if (!r.ok) return { estado: 'error_ia' as const, mensaje: r.motivo }
    const v = r.resultado
    const producto = d.producto ?? v.producto
    let fichaId: string | null = null
    let fichaEstado: string | null = null
    if (producto) {
      const clave = claveProducto({ compania: d.compania, ramo, producto, version: v.version })
      // Upsert del BORRADOR. Si esa clave ya está validada (otra extracción la validó entretanto), no se toca.
      const filas = await prisma.$queryRaw<{ id: string; estado: string }[]>`
        insert into seguros.tarificador_fichas
          (correduria_id, compania, ramo, producto, version, clave_producto, estado, condiciones, huella, avisos, origen_tarificacion_id, origen_documento_id)
        values (${correduriaId}::uuid, ${d.compania}, ${ramo}, ${producto}, ${v.version}, ${clave}, 'pendiente',
                ${JSON.stringify(v.condiciones)}::jsonb, ${huellaCondicionado(v.condiciones)}, ${JSON.stringify(v.avisos)}::jsonb,
                ${tarificacionId}::uuid, ${d.documentoId}::uuid)
        on conflict (correduria_id, clave_producto) do update set
          condiciones = excluded.condiciones, huella = excluded.huella, avisos = excluded.avisos,
          origen_tarificacion_id = excluded.origen_tarificacion_id, origen_documento_id = excluded.origen_documento_id, updated_at = now()
          where seguros.tarificador_fichas.estado = 'pendiente'
        returning id::text as id, estado`
      if (filas[0]) {
        fichaId = filas[0].id
        fichaEstado = filas[0].estado
      } else {
        const ya = (await prisma.$queryRaw<{ id: string }[]>`
          select id::text as id from seguros.tarificador_fichas where correduria_id = ${correduriaId}::uuid and clave_producto = ${clave}`)[0]
        fichaId = ya?.id ?? null
        fichaEstado = ya ? 'validada' : null
      }
    }
    const avisos: unknown[] = producto ? v.avisos : [...v.avisos, { donde: 'producto', motivo: 'producto_desconocido', detalle: null }]
    await guardarPresupuesto({
      correduriaId, tarificacionId, documentoId: d.documentoId, fichaId, valores: v.presupuesto, avisos,
      textoLegible: true, condicionadoCambiado: null, citasAusentes: [], actor,
    })
    return {
      estado: 'ok' as const, modo: 'ficha_y_presupuesto' as const, fichaId, fichaEstado, avisos: v.avisos,
      condicionadoCambiado: null, citasAusentes: [], valores: v.presupuesto,
    }
  })
}

// ─── Edición y validación humana ─────────────────────────────────────────────

export type ResultadoCambioFicha = { estado: 'ok'; fichaEstado: string } | { estado: 'no_encontrada' }

/** Edita UNA garantía. La ficha vuelve a `pendiente`: un cambio se valida explícitamente. */
export async function editarGarantiaFicha(correduriaId: string, id: string, clave: string, edicion: EdicionGarantia): Promise<ResultadoCambioFicha> {
  return conTabla(() => prisma.$transaction(async (tx) => {
    const f = (await tx.$queryRaw<{ condiciones: unknown }[]>`
      select condiciones from seguros.tarificador_fichas
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid for update`)[0]
    if (!f) return { estado: 'no_encontrada' as const }
    const nuevas = aplicarEdicion(condicionesDeJson(f.condiciones), clave, edicion)
    await tx.$executeRaw`
      update seguros.tarificador_fichas
      set condiciones = ${JSON.stringify(nuevas)}::jsonb, huella = ${huellaCondicionado(nuevas)},
          estado = 'pendiente', validada_por = null, validada_at = null, updated_at = now()
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
    return { estado: 'ok' as const, fichaEstado: 'pendiente' }
  }))
}

export async function validarFicha(correduriaId: string, id: string, actor: string): Promise<ResultadoCambioFicha> {
  return conTabla(async () => {
    const filas = await prisma.$queryRaw<{ estado: string }[]>`
      update seguros.tarificador_fichas
      set estado = 'validada', validada_por = ${actor}, validada_at = now(), updated_at = now()
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
      returning estado`
    return filas[0] ? { estado: 'ok' as const, fichaEstado: filas[0].estado } : { estado: 'no_encontrada' as const }
  })
}
