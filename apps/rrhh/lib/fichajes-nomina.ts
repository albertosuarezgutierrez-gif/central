/**
 * N2 — Puerto de BD de «fichajes → incidencias de nómina». Lee, llama a la función PURA del módulo y (solo con la aprobación del
 * responsable) escribe incidencias. rrhh_app tiene BYPASSRLS: TODA consulta lleva `empresa_id` de la SESIÓN (cepo
 * `lib/regression-fichajes-nomina.test.ts` y `lib/aislamiento-nominas.test.ts`). Las propuestas se RECALCULAN en el servidor al
 * aprobar: del cliente solo llegan las claves, nunca importes ni horas.
 */
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { addIncidencia, parsePeriodo } from './nominas'
import { hoyMadrid } from './fecha-madrid'
import {
  incidenciasDesdeFichajes, parseConvenioHorario, diasPrevistosDelMes,
  type FichajeNomina, type PropuestaIncidencia, type ResultadoFichajes,
} from '@central/module-nominas'
import type { ContratoHorario } from '@central/module-nominas'

function limitesMes(periodo: string): { desde: string; hasta: string } {
  const { year, month } = parsePeriodo(periodo)
  // Margen de un día a cada lado: la pertenencia al mes se decide por la fecha LOCAL (Madrid) dentro de la función pura.
  const ini = new Date(Date.UTC(year, month - 1, 1) - 86_400_000)
  const fin = new Date(Date.UTC(year, month, 1) + 86_400_000)
  return { desde: ini.toISOString(), hasta: fin.toISOString() }
}

const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string | number | Date).toISOString())

export type PropuestasMes = {
  nominaId: string
  empleadoId: string
  periodo: string
  nominaEstado: string
  resultado: ResultadoFichajes
  /** Claves ya aprobadas (ya son incidencias de esta nómina). */
  aplicadas: string[]
}

export class SinContratoError extends Error { constructor() { super('Sin contrato activo: no se pueden proponer incidencias'); this.name = 'SinContratoError' } }

export async function proponerDesdeFichajes(empresaId: string, nominaId: string, hoy: string = hoyMadrid()): Promise<PropuestasMes | null> {
  const nomina = await prisma.nominas.findFirst({ where: { id: nominaId, empresa_id: empresaId } })
  if (!nomina) return null
  const empleadoId = nomina.empleado_id
  const periodo = nomina.periodo
  const { desde, hasta } = limitesMes(periodo)
  const año = periodo.slice(0, 4)

  const contratoRow = await prisma.contratos_laborales.findFirst({ where: { empresa_id: empresaId, empleado_id: empleadoId, activo: true } })
  if (!contratoRow) throw new SinContratoError()
  const contrato: ContratoHorario = {
    empresaId, empleadoId,
    tipoContrato: contratoRow.tipo_contrato as ContratoHorario['tipoContrato'],
    jornadaPct: Number(contratoRow.jornada_pct),
  }

  const [emp] = await prisma.$queryRaw<{ convenio_datos: unknown }[]>(Prisma.sql`
    SELECT convenio_datos FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  const convenio = parseConvenioHorario(emp?.convenio_datos)

  const filas = await prisma.$queryRaw<{ id: string; empresa_id: string; empleado_id: string; entrada_at: Date; salida_at: Date | null; aprobado_at: Date | null }[]>(Prisma.sql`
    SELECT f.id::text AS id, f.empresa_id::text AS empresa_id, f.empleado_id::text AS empleado_id, f.entrada_at, f.salida_at, f.aprobado_at
    FROM rrhh.fichajes f
    WHERE f.empresa_id = ${empresaId}::uuid AND f.empleado_id = ${empleadoId}::uuid
      AND f.entrada_at >= ${desde}::timestamptz AND f.entrada_at < ${hasta}::timestamptz
    ORDER BY f.entrada_at ASC`)
  const fichajes: FichajeNomina[] = filas.map(f => ({
    id: f.id, empresaId: f.empresa_id, empleadoId: f.empleado_id,
    entradaAt: iso(f.entrada_at)!, salidaAt: iso(f.salida_at), aprobado: f.aprobado_at != null,
  }))

  // Ausencias justificadas: solicitudes APROBADAS (vacaciones, permisos…) que cubren días del mes.
  const sols = await prisma.$queryRaw<{ ini: string; fin: string }[]>(Prisma.sql`
    SELECT fecha_inicio::text AS ini, fecha_fin::text AS fin FROM rrhh.solicitudes
    WHERE empresa_id = ${empresaId}::uuid AND empleado_id = ${empleadoId}::uuid AND estado = 'aprobada'
      AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL
      AND fecha_inicio::date <= ${hasta}::date AND fecha_fin::date >= ${desde}::date`)
  const justificados: string[] = []
  for (const s of sols) {
    for (let t = Date.parse(`${s.ini.slice(0, 10)}T00:00:00Z`); t <= Date.parse(`${s.fin.slice(0, 10)}T00:00:00Z`); t += 86_400_000) justificados.push(new Date(t).toISOString().slice(0, 10))
  }

  // Horas extra ya pagadas en el año (meses anteriores). Si no se puede leer = null («no comprobado»), nunca 0.
  let previas: number | null = null
  try {
    const [r] = await prisma.$queryRaw<{ h: unknown }[]>(Prisma.sql`
      SELECT COALESCE(SUM(i.horas), 0) AS h
      FROM rrhh.incidencias_mes i
      JOIN rrhh.nominas n ON n.id = i.nomina_id AND n.empresa_id = i.empresa_id
      WHERE i.empresa_id = ${empresaId}::uuid AND n.empresa_id = ${empresaId}::uuid AND n.empleado_id = ${empleadoId}::uuid
        AND i.tipo = 'horas_extra' AND n.periodo >= ${`${año}-01`} AND n.periodo < ${periodo}`)
    previas = Number(r?.h ?? 0)
    if (!Number.isFinite(previas)) previas = null
  } catch { previas = null }

  const resultado = incidenciasDesdeFichajes(fichajes, contrato, convenio, {
    periodo, hoy, diasPrevistos: diasPrevistosDelMes(periodo, convenio), diasJustificados: justificados, horasExtraAnioPrevias: previas,
  })

  const ya = await prisma.$queryRaw<{ clave: string }[]>(Prisma.sql`
    SELECT origen_clave AS clave FROM rrhh.incidencias_mes
    WHERE empresa_id = ${empresaId}::uuid AND nomina_id = ${nominaId}::uuid AND origen_clave IS NOT NULL`)

  return { nominaId, empleadoId, periodo, nominaEstado: nomina.estado, resultado, aplicadas: ya.map(r => r.clave) }
}

export type ResultadoAprobacion = { aprobadas: string[]; rechazadas: { clave: string; motivo: string }[] }

/**
 * El responsable aprueba propuestas por CLAVE. Solo entran las que existen ahora mismo (recalculadas), tienen incidencia propia
 * (las informativas —retrasos— y las compensadas con descanso no), no superan el tope de 80 h y la nómina sigue en borrador.
 */
export async function aprobarPropuestas(empresaId: string, nominaId: string, claves: string[], hoy: string = hoyMadrid()): Promise<ResultadoAprobacion | null> {
  const p = await proponerDesdeFichajes(empresaId, nominaId, hoy)
  if (!p) return null
  const out: ResultadoAprobacion = { aprobadas: [], rechazadas: [] }
  if (p.nominaEstado !== 'borrador') throw new Error('Nómina ya confirmada')
  const porClave = new Map<string, PropuestaIncidencia>(p.resultado.propuestas.map(x => [x.clave, x]))
  for (const clave of [...new Set(claves)]) {
    const x = porClave.get(clave)
    if (!x) { out.rechazadas.push({ clave, motivo: 'La propuesta ya no existe (cambiaron los fichajes)' }); continue }
    if (!x.incidencia) { out.rechazadas.push({ clave, motivo: 'Es informativa o compensada con descanso: no entra en la nómina' }); continue }
    if (x.superaTope) { out.rechazadas.push({ clave, motivo: 'Supera el tope anual de horas extra (art. 35.2 ET)' }); continue }
    await addIncidencia(empresaId, nominaId, { ...x.incidencia, origen: { clave: x.clave, fichajeIds: x.fichajeIds } })
    out.aprobadas.push(clave)
  }
  return out
}

/** Aprueba los fichajes CERRADOS y aún sin aprobar de ese empleado en el mes de la nómina. Devuelve cuántos. */
export async function aprobarFichajesDeLaNomina(empresaId: string, nominaId: string, usuario: string): Promise<number | null> {
  const nomina = await prisma.nominas.findFirst({ where: { id: nominaId, empresa_id: empresaId } })
  if (!nomina) return null
  const { desde, hasta } = limitesMes(nomina.periodo)
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.fichajes SET aprobado_at = now(), aprobado_por = ${usuario}
    WHERE empresa_id = ${empresaId}::uuid AND empleado_id = ${nomina.empleado_id}::uuid
      AND estado = 'cerrado' AND salida_at IS NOT NULL AND aprobado_at IS NULL
      AND entrada_at >= ${desde}::timestamptz AND entrada_at < ${hasta}::timestamptz
      AND TO_CHAR(entrada_at AT TIME ZONE 'Europe/Madrid', 'YYYY-MM') = ${nomina.periodo}`)
  return n
}
