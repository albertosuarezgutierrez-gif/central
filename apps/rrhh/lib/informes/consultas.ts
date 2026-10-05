// Consultas de BD de cada entidad del catálogo de informes. SERVIDOR.
//
// 🚨 Aislamiento multi-tenant: el rol `rrhh_app` tiene BYPASSRLS, así que el ÚNICO aislamiento
// es el `WHERE <tabla>.empresa_id = ${empresaId}` de cada consulta (y en cada JOIN). `empresaId`
// llega SIEMPRE de la sesión (getSesion), nunca del cliente.
//
// Seguridad SQL: todo va por `Prisma.sql` con parámetros. Lo único que decide el cliente son
// claves ya validadas contra el catálogo (validador.ts); aquí solo se eligen fragmentos FIJOS.
// Cada SELECT devuelve TODAS las claves de columna de su entidad + los campos internos de
// agrupación (`empleado_id`, `empleado_etiqueta`, `obra_id`).

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { TIPOS_SOLICITUD, GRUPOS_SOLICITUD } from '@/lib/solicitudes-tipos'
import { entidad as buscarEntidad, LIMITE_FILAS } from './catalogo'
import type { FiltrosInforme, PeticionInforme } from './validador'

type Rango = { desde?: string; hasta?: string }
type Consulta = (empresaId: string, f: FiltrosInforme, limite: number) => Prisma.Sql

const rango = (v: unknown): Rango => (v && typeof v === 'object' ? (v as Rango) : {})
const txt = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Condición de rango de fechas sobre una expresión SQL fija (de este archivo, nunca del cliente). */
function condRangoFecha(expr: Prisma.Sql, r: Rango): Prisma.Sql {
  return Prisma.sql`${r.desde ? Prisma.sql`AND ${expr} >= ${r.desde}::date` : Prisma.empty}
    ${r.hasta ? Prisma.sql`AND ${expr} <= ${r.hasta}::date` : Prisma.empty}`
}

const EMP_NOMBRE = Prisma.sql`TRIM(CONCAT_WS(' ', e.nombre, e.apellidos))`
const EMP_ETIQUETA = Prisma.sql`TRIM(CONCAT_WS(' ', e.nombre, e.apellidos)) || COALESCE(' · ' || NULLIF(e.dni, ''), '')`
const LOCAL = (col: Prisma.Sql) => Prisma.sql`(${col} AT TIME ZONE 'Europe/Madrid')::date`
const LOCAL_TXT = (col: Prisma.Sql) => Prisma.sql`(${col} AT TIME ZONE 'Europe/Madrid')::date::text`
/** Horas de un fichaje: null si no hay salida (en curso). Nunca 0 por defecto. */
const HORAS_FICHAJE = Prisma.sql`(CASE WHEN f.salida_at IS NULL THEN NULL
  ELSE COALESCE(f.horas_totales, ROUND((EXTRACT(EPOCH FROM (f.salida_at - f.entrada_at)) / 3600.0)::numeric, 2)) END)`
const NUM_JSON = (ruta: string) => Prisma.sql`NULLIF(n.datos_calculo #>> ${`{${ruta}}`}::text[], '')::float8`

const CONSULTAS: Record<string, Consulta> = {
  fichajes: (empresaId, f, limite) => Prisma.sql`
    SELECT f.empleado_id::text AS empleado_id, ${EMP_ETIQUETA} AS empleado_etiqueta,
           f.obra_id::text AS obra_id,
           ${EMP_NOMBRE} AS empleado, e.dni,
           ${LOCAL_TXT(Prisma.sql`f.entrada_at`)} AS fecha,
           f.entrada_at AS entrada, f.salida_at AS salida,
           ${HORAS_FICHAJE}::float8 AS horas,
           o.nombre AS obra,
           CASE f.estado WHEN 'activo' THEN 'En curso' WHEN 'cerrado' THEN 'Cerrado' ELSE f.estado END AS estado,
           f.observaciones
    FROM rrhh.fichajes f
    JOIN rrhh.empleados e ON e.id = f.empleado_id AND e.empresa_id = f.empresa_id
    LEFT JOIN rrhh.obras o ON o.id = f.obra_id AND o.empresa_id = f.empresa_id
    WHERE f.empresa_id = ${empresaId}::uuid
      ${condRangoFecha(LOCAL(Prisma.sql`f.entrada_at`), rango(f.fecha))}
      ${txt(f.empleado_id) ? Prisma.sql`AND f.empleado_id = ${txt(f.empleado_id)}::uuid` : Prisma.empty}
      ${txt(f.obra_id) ? Prisma.sql`AND f.obra_id = ${txt(f.obra_id)}::uuid` : Prisma.empty}
      ${txt(f.estado) ? Prisma.sql`AND f.estado = ${txt(f.estado)}` : Prisma.empty}
    ORDER BY f.entrada_at DESC
    LIMIT ${limite}`,

  solicitudes: (empresaId, f, limite) => {
    const r = rango(f.fecha)
    const grupo = txt(f.grupo)
    const tiposGrupo = grupo ? TIPOS_SOLICITUD.filter(t => t.grupo === grupo).map(t => t.id) : []
    return Prisma.sql`
    SELECT s.empleado_id::text AS empleado_id, ${EMP_ETIQUETA} AS empleado_etiqueta,
           ${EMP_NOMBRE} AS empleado, e.dni,
           s.tipo AS tipo, s.fecha_inicio::text AS fecha_inicio, s.fecha_fin::text AS fecha_fin,
           (CASE WHEN s.fecha_inicio IS NULL OR s.fecha_fin IS NULL OR s.fecha_fin < s.fecha_inicio THEN NULL
                 ELSE (s.fecha_fin - s.fecha_inicio + 1) END)::int AS dias,
           s.estado, s.motivo, (s.justificante_path IS NOT NULL) AS justificante,
           ${LOCAL_TXT(Prisma.sql`s.creada_at`)} AS creada,
           ${LOCAL_TXT(Prisma.sql`s.resuelta_at`)} AS resuelta
    FROM rrhh.solicitudes s
    JOIN rrhh.empleados e ON e.id = s.empleado_id AND e.empresa_id = s.empresa_id
    WHERE s.empresa_id = ${empresaId}::uuid
      ${r.hasta ? Prisma.sql`AND s.fecha_inicio <= ${r.hasta}::date` : Prisma.empty}
      ${r.desde ? Prisma.sql`AND COALESCE(s.fecha_fin, s.fecha_inicio) >= ${r.desde}::date` : Prisma.empty}
      ${txt(f.empleado_id) ? Prisma.sql`AND s.empleado_id = ${txt(f.empleado_id)}::uuid` : Prisma.empty}
      ${txt(f.tipo) ? Prisma.sql`AND s.tipo = ${txt(f.tipo)}` : Prisma.empty}
      ${grupo ? Prisma.sql`AND s.tipo IN (${Prisma.join(tiposGrupo.length ? tiposGrupo : ['__ninguno__'])})` : Prisma.empty}
      ${txt(f.estado) ? Prisma.sql`AND s.estado = ${txt(f.estado)}` : Prisma.empty}
    ORDER BY s.fecha_inicio DESC NULLS LAST, s.creada_at DESC
    LIMIT ${limite}`
  },

  empleados: (empresaId, f, limite) => Prisma.sql`
    SELECT e.id::text AS empleado_id, ${EMP_ETIQUETA} AS empleado_etiqueta,
           ${EMP_NOMBRE} AS empleado, e.dni, e.nss, e.email, e.telefono, e.puesto, e.categoria,
           e.grupo_cotizacion, e.tipo_contrato, e.tipo_jornada, e.centro_trabajo, e.localidad,
           e.provincia, e.estado_civil, e.fecha_nacimiento::text AS fecha_nacimiento,
           e.fecha_alta::text AS fecha_alta,
           -- Antigüedad hasta hoy solo para activos: de una baja no sabemos la fecha de salida → null.
           (CASE WHEN e.fecha_alta IS NULL OR e.estado = 'baja' THEN NULL
                 ELSE ROUND(((CURRENT_DATE - e.fecha_alta) / 365.25)::numeric, 2) END)::float8 AS antiguedad,
           e.fecha_reconocimiento_medico::text AS fecha_reconocimiento_medico,
           CASE e.estado WHEN 'activo' THEN 'Activo' WHEN 'baja' THEN 'Baja' ELSE e.estado END AS estado
    FROM rrhh.empleados e
    WHERE e.empresa_id = ${empresaId}::uuid
      ${condRangoFecha(Prisma.sql`e.fecha_alta`, rango(f.fecha))}
      ${txt(f.empleado_id) ? Prisma.sql`AND e.id = ${txt(f.empleado_id)}::uuid` : Prisma.empty}
      ${txt(f.estado) ? Prisma.sql`AND e.estado = ${txt(f.estado)}` : Prisma.empty}
    ORDER BY COALESCE(e.apellidos, e.nombre) ASC, e.nombre ASC
    LIMIT ${limite}`,

  nominas: (empresaId, f, limite) => {
    const r = rango(f.periodo)
    return Prisma.sql`
    SELECT n.empleado_id::text AS empleado_id, ${EMP_ETIQUETA} AS empleado_etiqueta,
           ${EMP_NOMBRE} AS empleado, e.dni, n.periodo,
           CASE n.estado WHEN 'borrador' THEN 'Borrador' WHEN 'confirmada' THEN 'Confirmada' ELSE n.estado END AS estado,
           ${NUM_JSON('devengos,total')} AS bruto,
           ${NUM_JSON('devengos,salarioBase')} AS salario_base,
           ${NUM_JSON('devengos,horasExtra')} AS horas_extra_importe,
           (${NUM_JSON('deducciones,total')} - ${NUM_JSON('deducciones,irpf')}) AS ss_trabajador,
           ${NUM_JSON('deducciones,irpf')} AS irpf,
           ${NUM_JSON('deducciones,total')} AS deducciones,
           ${NUM_JSON('netoAPagar')} AS neto,
           ${NUM_JSON('cuotaPatronal,total')} AS cuota_patronal,
           ${NUM_JSON('costeTotalEmpresa')} AS coste_empresa,
           ${LOCAL_TXT(Prisma.sql`n.confirmada_at`)} AS confirmada,
           ${LOCAL_TXT(Prisma.sql`n.enviada_at`)} AS enviada
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id AND e.empresa_id = n.empresa_id
    WHERE n.empresa_id = ${empresaId}::uuid
      ${r.desde ? Prisma.sql`AND n.periodo >= ${r.desde}` : Prisma.empty}
      ${r.hasta ? Prisma.sql`AND n.periodo <= ${r.hasta}` : Prisma.empty}
      ${txt(f.empleado_id) ? Prisma.sql`AND n.empleado_id = ${txt(f.empleado_id)}::uuid` : Prisma.empty}
      ${txt(f.estado) ? Prisma.sql`AND n.estado = ${txt(f.estado)}` : Prisma.empty}
    ORDER BY n.periodo DESC, COALESCE(e.apellidos, e.nombre) ASC
    LIMIT ${limite}`
  },

  incidencias: (empresaId, f, limite) => {
    const r = rango(f.periodo)
    return Prisma.sql`
    SELECT n.empleado_id::text AS empleado_id, ${EMP_ETIQUETA} AS empleado_etiqueta,
           ${EMP_NOMBRE} AS empleado, n.periodo, i.tipo, i.concepto,
           i.importe::float8 AS importe, i.horas::float8 AS horas, i.dias
    FROM rrhh.incidencias_mes i
    JOIN rrhh.nominas n ON n.id = i.nomina_id AND n.empresa_id = i.empresa_id
    JOIN rrhh.empleados e ON e.id = n.empleado_id AND e.empresa_id = n.empresa_id
    WHERE i.empresa_id = ${empresaId}::uuid
      ${r.desde ? Prisma.sql`AND n.periodo >= ${r.desde}` : Prisma.empty}
      ${r.hasta ? Prisma.sql`AND n.periodo <= ${r.hasta}` : Prisma.empty}
      ${txt(f.empleado_id) ? Prisma.sql`AND n.empleado_id = ${txt(f.empleado_id)}::uuid` : Prisma.empty}
      ${txt(f.tipo) ? Prisma.sql`AND i.tipo = ${txt(f.tipo)}` : Prisma.empty}
    ORDER BY n.periodo DESC, i.creada_at ASC
    LIMIT ${limite}`
  },

  contratos: (empresaId, f, limite) => Prisma.sql`
    SELECT c.empleado_id::text AS empleado_id, ${EMP_ETIQUETA} AS empleado_etiqueta,
           ${EMP_NOMBRE} AS empleado, c.tipo_contrato, c.categoria_convenio AS categoria,
           c.grupo_cotizacion::int AS grupo_cotizacion, c.salario_base::float8 AS salario_base,
           c.jornada_pct::float8 AS jornada_pct, c.irpf_retencion_pct::float8 AS irpf_pct,
           c.vigente_desde::text AS vigente_desde, c.activo
    FROM rrhh.contratos_laborales c
    JOIN rrhh.empleados e ON e.id = c.empleado_id AND e.empresa_id = c.empresa_id
    WHERE c.empresa_id = ${empresaId}::uuid
      ${condRangoFecha(Prisma.sql`c.vigente_desde`, rango(f.fecha))}
      ${txt(f.empleado_id) ? Prisma.sql`AND c.empleado_id = ${txt(f.empleado_id)}::uuid` : Prisma.empty}
      ${typeof f.activo === 'boolean' ? Prisma.sql`AND c.activo = ${f.activo}` : Prisma.empty}
      ${txt(f.tipo_contrato) ? Prisma.sql`AND c.tipo_contrato = ${txt(f.tipo_contrato)}` : Prisma.empty}
    ORDER BY COALESCE(e.apellidos, e.nombre) ASC, c.vigente_desde DESC
    LIMIT ${limite}`,

  documentos: (empresaId, f, limite) => Prisma.sql`
    SELECT d.empleado_id::text AS empleado_id, ${EMP_ETIQUETA} AS empleado_etiqueta,
           ${EMP_NOMBRE} AS empleado, d.carpeta, d.nombre, d.tipo,
           ROUND((d.tamano / 1024.0)::numeric, 1)::float8 AS tamano_kb,
           d.subido_por, ${LOCAL_TXT(Prisma.sql`d.creada_at`)} AS subido,
           d.caducidad::text AS caducidad,
           (CASE WHEN d.caducidad IS NULL THEN NULL ELSE d.caducidad < CURRENT_DATE END) AS caducado,
           CASE d.estado_firma WHEN 'no_requiere' THEN 'No requiere firma' WHEN 'pendiente' THEN 'Pendiente de firma'
                WHEN 'firmado' THEN 'Firmado' ELSE d.estado_firma END AS estado_firma,
           d.requiere_firma_empresa,
           ${LOCAL_TXT(Prisma.sql`d.firmado_empresa_at`)} AS firmado_empresa
    FROM rrhh.documentos d
    JOIN rrhh.empleados e ON e.id = d.empleado_id AND e.empresa_id = d.empresa_id
    WHERE d.empresa_id = ${empresaId}::uuid
      ${condRangoFecha(LOCAL(Prisma.sql`d.creada_at`), rango(f.fecha))}
      ${txt(f.empleado_id) ? Prisma.sql`AND d.empleado_id = ${txt(f.empleado_id)}::uuid` : Prisma.empty}
      ${txt(f.estado_firma) ? Prisma.sql`AND d.estado_firma = ${txt(f.estado_firma)}` : Prisma.empty}
    ORDER BY d.creada_at DESC
    LIMIT ${limite}`,

  obras: (empresaId, f, limite) => {
    const r = rango(f.fecha)
    const condFichaje = Prisma.sql`fx.obra_id = o.id AND fx.empresa_id = o.empresa_id
      ${r.desde ? Prisma.sql`AND (fx.entrada_at AT TIME ZONE 'Europe/Madrid')::date >= ${r.desde}::date` : Prisma.empty}
      ${r.hasta ? Prisma.sql`AND (fx.entrada_at AT TIME ZONE 'Europe/Madrid')::date <= ${r.hasta}::date` : Prisma.empty}`
    return Prisma.sql`
    SELECT o.id::text AS obra_id, o.nombre, o.direccion, o.radio_m, o.activa,
           (SELECT COUNT(*) FROM rrhh.fichajes fx WHERE ${condFichaje})::int AS fichajes,
           -- Suma sobre el conjunto COMPLETO de fichajes cerrados de la obra: sin ninguno, 0 h es un
           -- dato revisado (no un «no se sabe»). Los fichajes en curso no suman.
           (SELECT COALESCE(SUM(CASE WHEN fx.salida_at IS NULL THEN NULL
                     ELSE COALESCE(fx.horas_totales, ROUND((EXTRACT(EPOCH FROM (fx.salida_at - fx.entrada_at)) / 3600.0)::numeric, 2)) END), 0)
              FROM rrhh.fichajes fx WHERE ${condFichaje})::float8 AS horas,
           ${LOCAL_TXT(Prisma.sql`o.creada_at`)} AS creada
    FROM rrhh.obras o
    WHERE o.empresa_id = ${empresaId}::uuid
      ${typeof f.activa === 'boolean' ? Prisma.sql`AND o.activa = ${f.activa}` : Prisma.empty}
    ORDER BY o.nombre ASC
    LIMIT ${limite}`
  },
}

/** Rotula valores codificados que se traducen en TS (no en SQL). */
const ETIQUETA_TIPO_SOLICITUD = new Map(TIPOS_SOLICITUD.map(t => [t.id, t.etiqueta]))
const GRUPO_DE_TIPO = new Map(TIPOS_SOLICITUD.map(t => [t.id, GRUPOS_SOLICITUD.find(g => g.id === t.grupo)?.etiqueta ?? t.grupo]))

function postProcesar(entidad: string, filas: Record<string, unknown>[]): Record<string, unknown>[] {
  if (entidad === 'solicitudes') {
    return filas.map(f => {
      const id = String(f.tipo ?? '')
      return { ...f, tipo: ETIQUETA_TIPO_SOLICITUD.get(id) ?? id, grupo: GRUPO_DE_TIPO.get(id) ?? null,
        estado: f.estado === 'solicitada' ? 'Solicitada' : f.estado === 'aprobada' ? 'Aprobada' : f.estado === 'rechazada' ? 'Rechazada' : f.estado }
    })
  }
  if (entidad === 'incidencias') {
    const op = buscarEntidad('incidencias')!.filtros.find(x => x.clave === 'tipo')
    const mapa = new Map(op && op.tipo === 'opcion' ? op.opciones.map(o => [o.valor, o.etiqueta]) : [])
    return filas.map(f => ({ ...f, tipo: mapa.get(String(f.tipo)) ?? f.tipo }))
  }
  return filas
}

/** Construye el SQL (exportado para test: comprobar que SIEMPRE filtra por la empresa de sesión). */
export function construirConsulta(empresaId: string, pet: PeticionInforme, limite: number): Prisma.Sql {
  const c = CONSULTAS[pet.entidad]
  if (!c) throw new Error(`Entidad sin consulta: ${pet.entidad}`)
  return c(empresaId, pet.filtros, limite)
}

export const ENTIDADES_CON_CONSULTA = Object.keys(CONSULTAS)

/** Lee de BD las filas crudas (hasta limite+1 para detectar truncado). */
export async function leerFilas(empresaId: string, pet: PeticionInforme, limite = LIMITE_FILAS): Promise<Record<string, unknown>[]> {
  const filas = await prisma.$queryRaw<Record<string, unknown>[]>(construirConsulta(empresaId, pet, limite + 1))
  return postProcesar(pet.entidad, filas)
}

/** Nombre de la empresa + nombres de empleado/obra de los filtros (para la cabecera del informe). */
export async function contextoCabecera(empresaId: string, pet: PeticionInforme): Promise<{ empresa: string; nombres: Record<string, string> }> {
  const [emp] = await prisma.$queryRaw<{ nombre: string }[]>(Prisma.sql`SELECT nombre FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  const nombres: Record<string, string> = {}
  const empleadoId = txt(pet.filtros.empleado_id)
  if (empleadoId) {
    const [r] = await prisma.$queryRaw<{ n: string }[]>(Prisma.sql`
      SELECT TRIM(CONCAT_WS(' ', nombre, apellidos)) AS n FROM rrhh.empleados WHERE id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid`)
    if (r) nombres.empleado_id = r.n
  }
  const obraId = txt(pet.filtros.obra_id)
  if (obraId) {
    const [r] = await prisma.$queryRaw<{ n: string }[]>(Prisma.sql`SELECT nombre AS n FROM rrhh.obras WHERE id = ${obraId}::uuid AND empresa_id = ${empresaId}::uuid`)
    if (r) nombres.obra_id = r.n
  }
  return { empresa: emp?.nombre ?? '', nombres }
}
