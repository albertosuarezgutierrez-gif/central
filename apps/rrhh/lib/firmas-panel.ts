// Panel global de firmas pendientes (`/admin/firmas`) y recordatorio automático (cron).
// Todo con el empresa_id de la SESIÓN (panel) o el de cada documento (cron).
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { diasEntre, tocaRecordatorioHoy, ultimoContactoEfectivo } from '@/lib/recordatorios-firma'
import { avisarDocumento, marcarFirmaSolicitada, type ResultadoAviso } from '@/lib/avisos'

export type FiltrosPanel = {
  estado: 'pendiente' | 'pendiente_empresa' | 'todos'
  q: string
  visto: 'si' | 'no' | 'todos'
  demoraMin: number
  offset: number
  limit: number
}

export function leerFiltros(sp: URLSearchParams): FiltrosPanel {
  const estado = sp.get('estado')
  const visto = sp.get('visto')
  const n = (k: string, def: number, max: number) => {
    const v = Number.parseInt(sp.get(k) ?? '', 10)
    return Number.isFinite(v) && v >= 0 ? Math.min(v, max) : def
  }
  return {
    estado: estado === 'pendiente_empresa' || estado === 'todos' ? estado : 'pendiente',
    q: (sp.get('q') ?? '').trim().slice(0, 80),
    visto: visto === 'si' || visto === 'no' ? visto : 'todos',
    demoraMin: n('demora', 0, 3650),
    offset: n('offset', 0, 100_000),
    limit: Math.max(1, n('limit', 50, 100)),
  }
}

export type FilaPanel = {
  documento_id: string; documento: string; carpeta: string; categoria_doc: string | null; estado_firma: string
  empleado_id: string; empleado: string; empleado_estado: string; email: string | null; telefono: string | null
  creada_at: string; firma_solicitada_at: string | null
  /** Días desde la solicitud; si no se sabe la fecha de solicitud, desde la subida (`demora_aprox`). */
  dias_demora: number; demora_aprox: boolean
  /** null = no consta que lo haya abierto (documentos previos a 0023: no se sabe). */
  visto_empleado_at: string | null
  ultimo_aviso_at: string | null; ultimo_aviso_tipo: string | null
  ultimo_email_estado: string | null; ultimo_push_estado: string | null
  n_recordatorios: number
}

export async function listarPendientes(empresaId: string, f: FiltrosPanel): Promise<{ filas: FilaPanel[]; hay_mas: boolean; total: number }> {
  const estados = f.estado === 'todos' ? ['pendiente', 'pendiente_empresa'] : [f.estado]
  const like = `%${f.q.replace(/[\\%_]/g, m => `\\${m}`)}%`
  const where = Prisma.sql`
    d.empresa_id = ${empresaId}::uuid AND d.estado_firma = ANY(${estados}::text[])
    ${f.q ? Prisma.sql`AND (d.nombre ILIKE ${like} OR CONCAT(e.nombre, ' ', COALESCE(e.apellidos, '')) ILIKE ${like} OR COALESCE(e.dni, '') ILIKE ${like})` : Prisma.empty}
    ${f.visto === 'si' ? Prisma.sql`AND d.visto_empleado_at IS NOT NULL` : f.visto === 'no' ? Prisma.sql`AND d.visto_empleado_at IS NULL` : Prisma.empty}
    ${f.demoraMin > 0 ? Prisma.sql`AND COALESCE(d.firma_solicitada_at, d.creada_at) <= now() - make_interval(days => ${f.demoraMin}::int)` : Prisma.empty}`
  const [rows, cnt] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT d.id AS documento_id, d.nombre AS documento, d.carpeta, d.categoria_doc, d.estado_firma,
             d.creada_at, d.firma_solicitada_at, d.visto_empleado_at,
             e.id AS empleado_id, TRIM(CONCAT(e.nombre, ' ', COALESCE(e.apellidos, ''))) AS empleado,
             e.estado AS empleado_estado, e.email, e.telefono,
             ua.creado_at AS ultimo_aviso_at, ua.tipo AS ultimo_aviso_tipo,
             ua.email_estado AS ultimo_email_estado, ua.push_estado AS ultimo_push_estado,
             (SELECT count(*) FROM rrhh.avisos a
               WHERE a.documento_id = d.id AND a.empresa_id = d.empresa_id
                 AND a.tipo IN ('recordatorio_firma', 'reclamacion_firma'))::int AS n_recordatorios
      FROM rrhh.documentos d
      JOIN rrhh.empleados e ON e.id = d.empleado_id AND e.empresa_id = d.empresa_id
      LEFT JOIN LATERAL (
        SELECT a.creado_at, a.tipo, a.email_estado, a.push_estado FROM rrhh.avisos a
        WHERE a.documento_id = d.id AND a.empresa_id = d.empresa_id
        ORDER BY a.creado_at DESC LIMIT 1
      ) ua ON true
      WHERE ${where}
      -- Orden por claves INMUTABLES: «Reclamar» rellena firma_solicitada_at y, si ordenáramos por
      -- ella, la fila saltaría de página entre dos «Ver más» (duplicada u omitida).
      ORDER BY d.creada_at ASC, d.id ASC
      LIMIT ${f.limit + 1} OFFSET ${f.offset}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM rrhh.documentos d
      JOIN rrhh.empleados e ON e.id = d.empleado_id AND e.empresa_id = d.empresa_id
      WHERE ${where}`),
  ])
  const ahora = new Date()
  const filas: FilaPanel[] = rows.slice(0, f.limit).map(r => {
    const base = r.firma_solicitada_at ?? r.creada_at
    return { ...r, dias_demora: diasEntre(new Date(base), ahora), demora_aprox: !r.firma_solicitada_at }
  })
  return { filas, hay_mas: rows.length > f.limit, total: cnt[0]?.n ?? 0 }
}

/**
 * «Reclamar»: reenvía email + push y lo registra. Solo documentos pendientes de firma del EMPLEADO
 * y de la empresa de la sesión. Si la fecha de solicitud no constaba, desde ahora sí (entra en el cron).
 */
export async function reclamarFirma(empresaId: string, usuarioId: string, docId: string, origen?: string | null): Promise<ResultadoAviso | null> {
  const rows = await prisma.$queryRaw<{ empleado_id: string }[]>(Prisma.sql`
    SELECT empleado_id FROM rrhh.documentos
    WHERE id = ${docId}::uuid AND empresa_id = ${empresaId}::uuid AND estado_firma = 'pendiente' LIMIT 1`)
  if (!rows[0]) throw new Error('Documento no encontrado o no pendiente de firma del empleado')
  await marcarFirmaSolicitada(empresaId, docId)
  return avisarDocumento({ empresaId, empleadoId: rows[0].empleado_id, documentoId: docId, tipo: 'reclamacion_firma', creadoPor: usuarioId, origen })
}

/**
 * «Quitar de pendientes»: ANULA la solicitud de firma (borrado lógico). NUNCA toca el documento ni su
 * fichero: vuelve a 'no_requiere' (sale del panel, del cron y de «Reclamar», y el portal deja de pedir
 * firma; si ya lo veía, sigue viéndolo) y deja la huella en firma_anulada_*. Solo afecta a solicitudes
 * aún pendientes (no firmadas) de la empresa de la sesión. Devuelve cuántas ha anulado.
 */
export async function anularFirmas(empresaId: string, usuarioId: string, ids: string[]): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.documentos
    SET estado_firma = 'no_requiere', requiere_firma_empresa = false, firma_solicitada_at = NULL,
        firma_anulada_at = now(), firma_anulada_por = ${usuarioId}
    WHERE empresa_id = ${empresaId}::uuid AND id = ANY(${ids}::uuid[])
      AND estado_firma IN ('pendiente', 'pendiente_empresa')`)
}

/** Cron: recordatorio automático a 3, 7 y luego cada 7 días. Idempotente por día (índice único). */
export async function ejecutarRecordatorios(hoy = new Date()): Promise<{ revisados: number; enviados: number; ya_hoy: number; errores: number }> {
  const rows = await prisma.$queryRaw<{ id: string; empresa_id: string; empleado_id: string; firma_solicitada_at: Date; ultimo_ok: Date | null; ultimo_sin: Date | null }[]>(Prisma.sql`
    SELECT d.id, d.empresa_id, d.empleado_id, d.firma_solicitada_at, ua.ultimo_ok, ua.ultimo_sin
    FROM rrhh.documentos d
    JOIN rrhh.empleados e ON e.id = d.empleado_id AND e.empresa_id = d.empresa_id
    LEFT JOIN LATERAL (
      SELECT max(a.creado_at) FILTER (WHERE a.email_estado IS NOT NULL) AS ultimo_ok,
             max(a.creado_at) FILTER (WHERE a.email_estado IS NULL)     AS ultimo_sin
      FROM rrhh.avisos a
      WHERE a.documento_id = d.id AND a.empleado_id = d.empleado_id AND a.empresa_id = d.empresa_id
    ) ua ON true
    WHERE d.estado_firma = 'pendiente' AND d.firma_solicitada_at IS NOT NULL AND e.estado = 'activo'
    ORDER BY d.firma_solicitada_at
    LIMIT 2000`)
  let enviados = 0, ya_hoy = 0, errores = 0
  for (const r of rows) {
    // Un aviso que se quedó sin resultado de email (> 1 h) no cuenta como contacto.
    const ultimo = ultimoContactoEfectivo({
      ultimoConResultado: r.ultimo_ok ? new Date(r.ultimo_ok) : null,
      ultimoSinResultado: r.ultimo_sin ? new Date(r.ultimo_sin) : null,
      ahora: hoy,
    })
    if (!tocaRecordatorioHoy({ solicitadaAt: new Date(r.firma_solicitada_at), ultimoContactoAt: ultimo, hoy })) continue
    try {
      const res = await avisarDocumento({ empresaId: r.empresa_id, empleadoId: r.empleado_id, documentoId: r.id, tipo: 'recordatorio_firma', creadoPor: 'cron' })
      if (res) enviados++; else ya_hoy++
    } catch (e) {
      errores++
      console.error('recordatorio-firmas', r.id, e instanceof Error ? e.message : e)
    }
  }
  return { revisados: rows.length, enviados, ya_hoy, errores }
}
