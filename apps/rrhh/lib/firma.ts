import { createHash, randomInt } from 'crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { FirmaPropia, nombreCoincide, type ContextoFirma, type Firmante, type MetodoFirma } from '@central/core-firma'
import { descargarObjeto } from '@/lib/storage'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

const proveedor = new FirmaPropia()

const hashCodigo = (c: string) => createHash('sha256').update(c).digest('hex')

/** Enmascara un email para el acuse (j***@dominio.com). */
function enmascarar(email: string): string {
  const [u, d] = email.split('@')
  if (!d) return '***'
  return `${u[0] ?? ''}***@${d}`
}

/**
 * Genera un código OTP de 6 dígitos, lo envía al email del empleado y lo guarda (hasheado, 10 min).
 * Refuerza el control exclusivo (eIDAS art. 26.c). Si no hay email/SMTP, devuelve { enviado:false }
 * y la firma sigue siendo válida por sesión (token personal) sin OTP.
 */
export async function solicitarCodigoFirma(
  empresaId: string, empleadoId: string, docId: string
): Promise<{ enviado: boolean; email_parcial?: string }> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT d.estado_firma, e.email, e.nombre
    FROM rrhh.documentos d JOIN rrhh.empleados e ON e.id = d.empleado_id
    WHERE d.id = ${docId}::uuid AND d.empleado_id = ${empleadoId}::uuid AND d.empresa_id = ${empresaId}::uuid LIMIT 1`)
  const doc = rows[0]
  if (!doc) throw new Error('Documento no encontrado')
  if (doc.estado_firma !== 'pendiente') throw new Error('Este documento no requiere firma')

  const t = getTransporter()
  if (!t || !doc.email) return { enviado: false }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expira = new Date(Date.now() + 10 * 60 * 1000)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO rrhh.firma_otps (empresa_id, empleado_id, documento_id, codigo_hash, expira_at)
    VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${docId}::uuid, ${hashCodigo(codigo)}, ${expira.toISOString()}::timestamptz)
    ON CONFLICT (documento_id, empleado_id)
    DO UPDATE SET codigo_hash = EXCLUDED.codigo_hash, expira_at = EXCLUDED.expira_at, intentos = 0, creada_at = now()`)

  try {
    await t.sendMail({
      from: MAIL_FROM, to: doc.email,
      subject: 'Tu código para firmar el documento',
      text: `Hola ${doc.nombre},\n\nTu código para firmar electrónicamente el documento es: ${codigo}\n\nCaduca en 10 minutos. Si no has solicitado firmar, ignora este mensaje.`,
    })
  } catch {
    return { enviado: false }
  }
  return { enviado: true, email_parcial: enmascarar(doc.email) }
}

/** El gestor solicita la firma de un documento (estado_firma → 'pendiente'). Scope por empresa. */
export async function solicitarFirma(empresaId: string, empleadoId: string, docId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT estado_firma FROM rrhh.documentos
    WHERE id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid AND empresa_id = ${empresaId}::uuid LIMIT 1`)
  const doc = rows[0]
  if (!doc) throw new Error('Documento no encontrado')
  if (doc.estado_firma === 'firmado') throw new Error('El documento ya está firmado')
  await prisma.$executeRaw(Prisma.sql`UPDATE rrhh.documentos SET estado_firma = 'pendiente' WHERE id = ${docId}::uuid`)
}

/** El empleado firma el documento (firma avanzada propia, eIDAS art. 26). Devuelve la evidencia. */
export async function firmarDocumento(
  empresaId: string, empleadoId: string, docId: string,
  ctx: { ip?: string | null; user_agent?: string | null; nombre_confirmado: string; codigo?: string | null }
) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT d.storage_path, d.estado_firma, e.nombre, e.email, e.dni
    FROM rrhh.documentos d JOIN rrhh.empleados e ON e.id = d.empleado_id
    WHERE d.id = ${docId}::uuid AND d.empleado_id = ${empleadoId}::uuid AND d.empresa_id = ${empresaId}::uuid LIMIT 1`)
  const doc = rows[0]
  if (!doc) throw new Error('Documento no encontrado')
  if (doc.estado_firma === 'firmado') throw new Error('El documento ya está firmado')
  if (doc.estado_firma !== 'pendiente') throw new Error('Este documento no requiere firma')
  if (!nombreCoincide(ctx.nombre_confirmado, doc.nombre)) throw new Error('El nombre no coincide con el del titular')

  // Si se emitió un OTP para este documento, es OBLIGATORIO validarlo (control exclusivo reforzado).
  let metodo: MetodoFirma = 'sesion_token'
  const otpRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT codigo_hash, expira_at, intentos FROM rrhh.firma_otps
    WHERE documento_id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid LIMIT 1`)
  if (otpRows[0]) {
    const o = otpRows[0]
    if (!ctx.codigo) throw new Error('Falta el código de verificación')
    if (new Date(o.expira_at) < new Date()) throw new Error('El código ha caducado, pide uno nuevo')
    if (o.intentos >= 5) throw new Error('Demasiados intentos, pide un código nuevo')
    if (hashCodigo(String(ctx.codigo)) !== o.codigo_hash) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE rrhh.firma_otps SET intentos = intentos + 1
        WHERE documento_id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid`)
      throw new Error('Código incorrecto')
    }
    metodo = 'otp_email'
  }

  const bytes = await descargarObjeto(doc.storage_path)
  const firmante: Firmante = { id: empleadoId, nombre: doc.nombre, email: doc.email, dni: doc.dni }
  const contexto: ContextoFirma = { fecha: new Date().toISOString(), ip: ctx.ip ?? null, user_agent: ctx.user_agent ?? null }
  const evidencia = await proveedor.firmar({
    firmante, documento_id: docId, bytes, contexto, metodo, nombre_confirmado: ctx.nombre_confirmado,
  })

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.firmas (empresa_id, empleado_id, documento_id, doc_hash, algoritmo, metodo,
        firmante_nombre, firmante_email, firmante_dni, ip, user_agent, sello_tiempo, evidencia)
      VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${docId}::uuid, ${evidencia.doc_hash}, ${evidencia.algoritmo}, ${evidencia.metodo},
        ${firmante.nombre}, ${firmante.email}, ${firmante.dni}, ${contexto.ip}, ${contexto.user_agent},
        ${contexto.fecha}::timestamptz, ${JSON.stringify(evidencia)}::jsonb)`),
    prisma.$executeRaw(Prisma.sql`UPDATE rrhh.documentos SET estado_firma = 'firmado' WHERE id = ${docId}::uuid`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.firma_otps WHERE documento_id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid`),
  ])
  return evidencia
}
