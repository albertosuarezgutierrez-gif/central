// Adaptador Prisma del seguro obligatorio por convenio (migración 0036). TODA sentencia filtra por el `empresa_id` de la
// SESIÓN (rrhh_app tiene BYPASSRLS: el aislamiento es del código; cepo lib/aislamiento-nominas.test.ts). Reglas en
// `seguro-convenio.ts` (puro).
import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import type { Afectados, Cobertura, Contingencia, ObligacionConCobertura, ObligacionSeguro, TipoSeguroConvenio } from './seguro-convenio'

type FilaBd = {
  id: string; convenio: string; tipo: string; contingencias: string[]; capital_cent: bigint | number
  ambito: string; categorias: string[] | null; articulo: string; fuente_url: string
  vigente_desde: string; vigente_hasta: string | null
  seguro_estado: string | null; seguro_aseguradora: string | null; seguro_poliza: string | null; seguro_vencimiento: string | null
}

function mapear(r: FilaBd): ObligacionConCobertura {
  return {
    id: r.id,
    convenio: r.convenio,
    tipo: r.tipo as TipoSeguroConvenio,
    contingencias: r.contingencias as Contingencia[],
    capitalCent: Number(r.capital_cent),
    ambito: r.ambito === 'algunas' ? 'algunas' : 'todas',
    categorias: r.categorias,
    articulo: r.articulo,
    fuenteUrl: r.fuente_url,
    vigenteDesde: r.vigente_desde,
    vigenteHasta: r.vigente_hasta,
    cobertura: {
      estado: r.seguro_estado === 'cubierto' || r.seguro_estado === 'no_cubierto' ? r.seguro_estado : null,
      aseguradora: r.seguro_aseguradora, poliza: r.seguro_poliza, vencimiento: r.seguro_vencimiento,
    },
  }
}

export async function listarObligaciones(empresaId: string): Promise<ObligacionConCobertura[]> {
  const rows = await prisma.$queryRaw<FilaBd[]>(Prisma.sql`
    SELECT id::text AS id, convenio, tipo, contingencias, capital_cent, ambito, categorias, articulo, fuente_url,
           vigente_desde::text AS vigente_desde, vigente_hasta::text AS vigente_hasta,
           seguro_estado, seguro_aseguradora, seguro_poliza, seguro_vencimiento::text AS seguro_vencimiento
    FROM rrhh.convenio_seguros_obligatorios
    WHERE empresa_id = ${empresaId}::uuid
    ORDER BY vigente_desde DESC, creada_at DESC
    LIMIT 50`)
  return rows.map(mapear)
}

export async function obligacionDe(empresaId: string, id: string): Promise<ObligacionConCobertura | null> {
  const rows = await prisma.$queryRaw<FilaBd[]>(Prisma.sql`
    SELECT id::text AS id, convenio, tipo, contingencias, capital_cent, ambito, categorias, articulo, fuente_url,
           vigente_desde::text AS vigente_desde, vigente_hasta::text AS vigente_hasta,
           seguro_estado, seguro_aseguradora, seguro_poliza, seguro_vencimiento::text AS seguro_vencimiento
    FROM rrhh.convenio_seguros_obligatorios
    WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  return rows[0] ? mapear(rows[0]) : null
}

/** Alta (id null) o corrección. Si cambia lo que se exige (tipo, contingencias, capital, ámbito), la cobertura vuelve a
 *  «no se sabe»: un «sí, lo tengo» de 20.000€ no vale para una obligación de 40.000€. Devuelve filas afectadas. */
export async function guardarObligacion(empresaId: string, id: string | null, o: ObligacionSeguro, por: string): Promise<number> {
  const cont = o.contingencias as string[]
  if (id === null) {
    return prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.convenio_seguros_obligatorios
        (empresa_id, convenio, tipo, contingencias, capital_cent, ambito, categorias, articulo, fuente_url,
         vigente_desde, vigente_hasta, creada_por)
      VALUES (${empresaId}::uuid, ${o.convenio}, ${o.tipo}, ${cont}::text[], ${BigInt(o.capitalCent)}, ${o.ambito},
              ${o.categorias}::text[], ${o.articulo}, ${o.fuenteUrl}, ${o.vigenteDesde}::date, ${o.vigenteHasta}::date, ${por})`)
  }
  return prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.convenio_seguros_obligatorios SET
      seguro_estado      = CASE WHEN material_igual THEN seguro_estado ELSE NULL END,
      seguro_aseguradora = CASE WHEN material_igual THEN seguro_aseguradora ELSE NULL END,
      seguro_poliza      = CASE WHEN material_igual THEN seguro_poliza ELSE NULL END,
      seguro_vencimiento = CASE WHEN material_igual THEN seguro_vencimiento ELSE NULL END,
      seguro_estado_at   = CASE WHEN material_igual THEN seguro_estado_at ELSE NULL END,
      seguro_estado_por  = CASE WHEN material_igual THEN seguro_estado_por ELSE NULL END,
      convenio = ${o.convenio}, tipo = ${o.tipo}, contingencias = ${cont}::text[], capital_cent = ${BigInt(o.capitalCent)},
      ambito = ${o.ambito}, categorias = ${o.categorias}::text[], articulo = ${o.articulo}, fuente_url = ${o.fuenteUrl},
      vigente_desde = ${o.vigenteDesde}::date, vigente_hasta = ${o.vigenteHasta}::date, actualizada_at = now()
    FROM (
      SELECT x.id AS xid,
             (x.tipo, x.contingencias, x.capital_cent, x.ambito, x.categorias)
               IS NOT DISTINCT FROM (${o.tipo}::text, ${cont}::text[], ${BigInt(o.capitalCent)}::bigint, ${o.ambito}::text, ${o.categorias}::text[])
               AS material_igual
      FROM rrhh.convenio_seguros_obligatorios x
      WHERE x.id = ${id}::uuid AND x.empresa_id = ${empresaId}::uuid
    ) prev
    WHERE convenio_seguros_obligatorios.id = prev.xid AND convenio_seguros_obligatorios.empresa_id = ${empresaId}::uuid`)
}

export async function borrarObligacion(empresaId: string, id: string): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    DELETE FROM rrhh.convenio_seguros_obligatorios WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid`)
}

export async function guardarCobertura(empresaId: string, id: string, c: Cobertura, por: string): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.convenio_seguros_obligatorios SET
      seguro_estado = ${c.estado}, seguro_aseguradora = ${c.aseguradora}, seguro_poliza = ${c.poliza},
      seguro_vencimiento = ${c.vencimiento}::date,
      seguro_estado_at = CASE WHEN ${c.estado}::text IS NULL THEN NULL ELSE now() END,
      seguro_estado_por = CASE WHEN ${c.estado}::text IS NULL THEN NULL ELSE ${por} END,
      actualizada_at = now()
    WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid`)
}

/**
 * Trabajadores ACTIVOS a los que afecta la obligación. Con ámbito 'algunas', por la categoría de su contrato activo
 * (mismo criterio que el índice de tablas: sin espacios sobrantes ni mayúsculas); los activos sin contrato activo con
 * categoría van a `sinCategoria` («no se sabe»), nunca a «no afectados».
 */
export async function contarAfectados(empresaId: string, o: Pick<ObligacionSeguro, 'ambito' | 'categorias'>): Promise<Afectados> {
  if (o.ambito === 'todas') {
    const r = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM rrhh.empleados e WHERE e.empresa_id = ${empresaId}::uuid AND e.estado = 'activo'`)
    return { afectados: r[0]?.n ?? 0, sinCategoria: 0 }
  }
  const cats = (o.categorias ?? []).map(c => c.trim().replace(/\s+/g, ' ').toLowerCase())
  const r = await prisma.$queryRaw<{ afectados: number; sin_categoria: number }[]>(Prisma.sql`
    SELECT count(*) FILTER (WHERE cat IS NOT NULL AND cat = ANY(${cats}::text[]))::int AS afectados,
           count(*) FILTER (WHERE cat IS NULL)::int AS sin_categoria
    FROM (
      SELECT e.id, (
        SELECT NULLIF(lower(regexp_replace(btrim(c.categoria_convenio), '\\s+', ' ', 'g')), '')
        FROM rrhh.contratos_laborales c
        WHERE c.empleado_id = e.id AND c.empresa_id = ${empresaId}::uuid AND c.activo
        ORDER BY c.vigente_desde DESC LIMIT 1
      ) AS cat
      FROM rrhh.empleados e WHERE e.empresa_id = ${empresaId}::uuid AND e.estado = 'activo'
    ) t`)
  return { afectados: r[0]?.afectados ?? 0, sinCategoria: r[0]?.sin_categoria ?? 0 }
}

/** Datos de la empresa y del responsable que pulsa (prerrelleno del formulario del lead). */
export async function datosParaLead(empresaId: string, usuarioId: string): Promise<{ empresa: string; nif: string | null; nombre: string; email: string } | null> {
  const r = await prisma.$queryRaw<{ empresa: string; nif: string | null; nombre: string; email: string }[]>(Prisma.sql`
    SELECT em.nombre AS empresa, em.nif, u.nombre, u.email
    FROM rrhh.empresas em
    JOIN rrhh.usuario_empresas ue ON ue.empresa_id = em.id AND ue.usuario_id = ${usuarioId}::uuid
    JOIN rrhh.usuarios_rrhh u ON u.id = ue.usuario_id
    WHERE em.id = ${empresaId}::uuid LIMIT 1`)
  return r[0] ?? null
}

export type ReservaLead = { id: string } | { ya: 'enviado' | 'enviando'; at: string }

/**
 * Reserva la petición ANTES de llamar a plataforma (contra el doble clic / dos pestañas): índice único parcial de un solo
 * 'enviando'/'enviado' por obligación. Un 'enviando' de > 2 min (proceso muerto a medias) pasa a 'error' y deja reintentar.
 */
export async function reservarLead(
  empresaId: string, obligacionId: string, usuarioId: string, version: string, resumen: string,
): Promise<ReservaLead> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.leads_correduria SET estado = 'error', detalle = 'interrumpido', actualizada_at = now()
    WHERE empresa_id = ${empresaId}::uuid AND obligacion_id = ${obligacionId}::uuid AND estado = 'enviando'
      AND creada_at < now() - interval '2 minutes'`)
  const ins = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO rrhh.leads_correduria (empresa_id, obligacion_id, usuario_id, consentimiento_version, consentimiento_at, resumen, estado)
    VALUES (${empresaId}::uuid, ${obligacionId}::uuid, ${usuarioId}::uuid, ${version}, now(), ${resumen}, 'enviando')
    ON CONFLICT DO NOTHING
    RETURNING id::text AS id`)
  if (ins[0]) return { id: ins[0].id }
  const ya = await prisma.$queryRaw<{ estado: 'enviado' | 'enviando'; at: string }[]>(Prisma.sql`
    SELECT estado, creada_at::text AS at FROM rrhh.leads_correduria
    WHERE empresa_id = ${empresaId}::uuid AND obligacion_id = ${obligacionId}::uuid AND estado IN ('enviando', 'enviado')
    ORDER BY creada_at DESC LIMIT 1`)
  return ya[0] ? { ya: ya[0].estado, at: ya[0].at } : { ya: 'enviando', at: new Date().toISOString() }
}

export async function cerrarLead(empresaId: string, id: string, estado: 'enviado' | 'error' | 'rechazado', detalle: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.leads_correduria SET estado = ${estado}, detalle = ${detalle.slice(0, 300)}, actualizada_at = now()
    WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid`)
}

/** Última petición viva por obligación (para pintar «Ya lo pediste el …»). */
export async function leadsVivos(empresaId: string): Promise<Record<string, { estado: string; at: string }>> {
  const r = await prisma.$queryRaw<{ obligacion_id: string; estado: string; at: string }[]>(Prisma.sql`
    SELECT DISTINCT ON (l.obligacion_id) l.obligacion_id::text AS obligacion_id, l.estado, l.creada_at::text AS at
    FROM rrhh.leads_correduria l
    WHERE l.empresa_id = ${empresaId}::uuid AND l.obligacion_id IS NOT NULL AND l.estado IN ('enviando', 'enviado')
    ORDER BY l.obligacion_id, l.creada_at DESC`)
  return Object.fromEntries(r.map(x => [x.obligacion_id, { estado: x.estado, at: x.at }]))
}

/** «Revisado: el convenio no obliga a ningún seguro». null = no se sabe. */
export async function leerSinObligacion(empresaId: string): Promise<string | null> {
  const r = await prisma.$queryRaw<{ at: string | null }[]>(Prisma.sql`
    SELECT convenio_sin_seguro_at::text AS at FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  return r[0]?.at ?? null
}

export async function marcarSinObligacion(empresaId: string, marcar: boolean, por: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.empresas SET
      convenio_sin_seguro_at  = CASE WHEN ${marcar} THEN now() ELSE NULL END,
      convenio_sin_seguro_por = CASE WHEN ${marcar} THEN ${por} ELSE NULL END
    WHERE id = ${empresaId}::uuid`)
}
