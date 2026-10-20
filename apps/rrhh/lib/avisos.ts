// Avisos al empleado (`rrhh.avisos`, migración 0023): intranet + email + push, con el resultado de
// cada canal REGISTRADO. Un fallo de email/push nunca tumba la operación que avisa (solicitar firma,
// asignar documento…): queda en `email_estado`/`push_estado` y se ve en el panel `/admin/firmas`.
//
// Aislamiento: todo va con (empresa_id, empleado_id, documento_id) en el WHERE.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { pushEmpleadoResultado, type ResultadoPush } from '@/lib/push'
import { solicitarFirma } from '@/lib/firma'
import { textoAviso, basePortal, enlacePortal, estadoEmailPrevio, type TipoAviso } from '@/lib/avisos-reglas'
import { diasEntre } from '@/lib/recordatorios-firma'

export type EstadoEmail = 'enviado' | 'sin_email' | 'sin_transporte' | 'error'
export type ResultadoAviso = { aviso_id: string; email_estado: EstadoEmail; push_estado: ResultadoPush }

type Params = {
  empresaId: string
  empleadoId: string
  documentoId: string
  tipo: TipoAviso
  /** usuario_id del responsable, o 'cron'. */
  creadoPor: string
  /** Origen de la petición (para el enlace del email si no hay `RRHH_PUBLIC_URL`). */
  origen?: string | null
}

/**
 * Crea el aviso y lo envía por email y push. Devuelve null SOLO en el recordatorio automático
 * cuando ya hubo uno hoy para ese documento (idempotencia por índice único: la fila se reserva
 * ANTES de enviar, así dos ejecuciones simultáneas del cron no mandan dos correos).
 * Lanza si el documento no es de ese empleado/empresa.
 */
export async function avisarDocumento(p: Params): Promise<ResultadoAviso | null> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT d.nombre AS doc_nombre, d.resumen, d.firma_solicitada_at,
           e.nombre, e.email, em.nombre AS empresa
    FROM rrhh.documentos d
    JOIN rrhh.empleados e ON e.id = d.empleado_id AND e.empresa_id = d.empresa_id
    JOIN rrhh.empresas em ON em.id = d.empresa_id
    WHERE d.id = ${p.documentoId}::uuid AND d.empleado_id = ${p.empleadoId}::uuid AND d.empresa_id = ${p.empresaId}::uuid
    LIMIT 1`)
  const r = rows[0]
  if (!r) throw new Error('Documento no encontrado')

  const url = enlacePortal(basePortal(process.env.RRHH_PUBLIC_URL, p.origen))
  const dias = r.firma_solicitada_at ? diasEntre(new Date(r.firma_solicitada_at), new Date()) : null
  const t = textoAviso(p.tipo, {
    empleadoNombre: r.nombre, documento: r.doc_nombre, empresa: r.empresa ?? null, resumen: r.resumen ?? null, dias, url,
  })

  const ins = p.tipo === 'recordatorio_firma'
    ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO rrhh.avisos (empresa_id, empleado_id, documento_id, tipo, titulo, cuerpo, creado_por)
        VALUES (${p.empresaId}::uuid, ${p.empleadoId}::uuid, ${p.documentoId}::uuid, ${p.tipo}, ${t.titulo}, ${t.cuerpo}, ${p.creadoPor})
        ON CONFLICT (documento_id, fecha_local) WHERE tipo = 'recordatorio_firma' DO NOTHING
        RETURNING id`)
    : await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO rrhh.avisos (empresa_id, empleado_id, documento_id, tipo, titulo, cuerpo, creado_por)
        VALUES (${p.empresaId}::uuid, ${p.empleadoId}::uuid, ${p.documentoId}::uuid, ${p.tipo}, ${t.titulo}, ${t.cuerpo}, ${p.creadoPor})
        RETURNING id`)
  const avisoId = ins[0]?.id
  if (!avisoId) return null

  // Email (best-effort, registrado).
  const transporte = getTransporter()
  let email_estado: EstadoEmail = estadoEmailPrevio(r.email, !!transporte) ?? 'enviado'
  let email_error: string | null = null
  if (email_estado === 'enviado' && transporte) {
    try {
      await transporte.sendMail({ from: MAIL_FROM, to: r.email, subject: t.asunto, text: t.texto })
    } catch (e) {
      email_estado = 'error'
      email_error = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    }
  }
  // Push (best-effort, registrado).
  const push_estado = await pushEmpleadoResultado(p.empresaId, p.empleadoId, t.titulo, t.cuerpo, '/e')

  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.avisos
    SET email_estado = ${email_estado}, email_error = ${email_error}, email_at = now(),
        push_estado = ${push_estado}, push_at = now()
    WHERE id = ${avisoId}::uuid AND empresa_id = ${p.empresaId}::uuid`)
  return { aviso_id: avisoId, email_estado, push_estado }
}

/** Marca desde cuándo se reclama la firma (si no estaba ya). Es la base del recordatorio automático. */
export async function marcarFirmaSolicitada(empresaId: string, docId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.documentos SET firma_solicitada_at = COALESCE(firma_solicitada_at, now())
    WHERE id = ${docId}::uuid AND empresa_id = ${empresaId}::uuid AND estado_firma = 'pendiente'`)
}

/**
 * Avisa de una solicitud de firma YA en estado 'pendiente' (tras solicitarla, subirla con «solo firma
 * el empleado» o tras firmar la empresa). Nunca lanza: si el aviso falla, devuelve null y lo loguea.
 */
export async function avisarSolicitudFirma(
  empresaId: string, empleadoId: string, docId: string, creadoPor: string, origen?: string | null,
): Promise<ResultadoAviso | null> {
  try {
    await marcarFirmaSolicitada(empresaId, docId)
    return await avisarDocumento({ empresaId, empleadoId, documentoId: docId, tipo: 'solicitud_firma', creadoPor, origen })
  } catch (e) {
    console.error('avisarSolicitudFirma', e instanceof Error ? e.message : e)
    return null
  }
}

/** Solicita la firma (flujo existente de `lib/firma.ts`) y avisa al empleado. Lanza solo si la solicitud falla. */
export async function solicitarFirmaYAvisar(
  empresaId: string, empleadoId: string, docId: string, creadoPor: string, origen?: string | null,
): Promise<ResultadoAviso | null> {
  await solicitarFirma(empresaId, empleadoId, docId)
  return avisarSolicitudFirma(empresaId, empleadoId, docId, creadoPor, origen)
}

// ── Lado del empleado ────────────────────────────────────────────────────────

export type AvisoEmpleado = {
  id: string; tipo: TipoAviso; titulo: string; cuerpo: string | null; creado_at: string; visto_en: string | null
  documento_id: string | null; documento_nombre: string | null; estado_firma: string | null
}

/** Avisos del empleado (los 30 últimos) y cuántos documentos tienen avisos sin ver. Solo los SUYOS. */
export async function listarAvisosEmpleado(empresaId: string, empleadoId: string): Promise<{ avisos: AvisoEmpleado[]; sin_ver: number }> {
  const [avisos, cnt] = await Promise.all([
    prisma.$queryRaw<AvisoEmpleado[]>(Prisma.sql`
      SELECT a.id, a.tipo, a.titulo, a.cuerpo, a.creado_at, a.visto_en, a.documento_id,
             d.nombre AS documento_nombre, d.estado_firma
      FROM rrhh.avisos a
      LEFT JOIN rrhh.documentos d ON d.id = a.documento_id AND d.empresa_id = a.empresa_id AND d.empleado_id = a.empleado_id
      WHERE a.empresa_id = ${empresaId}::uuid AND a.empleado_id = ${empleadoId}::uuid
      ORDER BY a.creado_at DESC
      LIMIT 30`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(DISTINCT COALESCE(a.documento_id, a.id))::int AS n
      FROM rrhh.avisos a
      WHERE a.empresa_id = ${empresaId}::uuid AND a.empleado_id = ${empleadoId}::uuid AND a.visto_en IS NULL`),
  ])
  return { avisos, sin_ver: cnt[0]?.n ?? 0 }
}

/** El empleado abre un documento SUYO: marca sus avisos como vistos y la primera apertura del documento. */
export async function marcarDocumentoVisto(empresaId: string, empleadoId: string, docId: string): Promise<boolean> {
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.documentos SET visto_empleado_at = COALESCE(visto_empleado_at, now())
    WHERE id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid`)
  if (!n) return false
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.avisos SET visto_en = now()
    WHERE documento_id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid
      AND visto_en IS NULL`)
  return true
}
