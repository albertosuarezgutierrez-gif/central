import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { FirmaPropia, type Firmante } from '@central/core-firma'
import {
  solicitarCodigoFirma as orquestarCodigo,
  solicitarFirma as orquestarSolicitud,
  firmarDocumento as orquestarFirma,
  type DepsFirma, type RepoFirma, type DocFirmable,
} from '@central/module-rrhh'
import { descargarObjeto } from '@/lib/storage'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

const proveedor = new FirmaPropia()

/**
 * Construye los puertos de firma con el SQL de rrhh (tablas `rrhh.documentos/firmas/firma_otps`),
 * scopeados a (empresa, empleado). La orquestación owner-agnóstica vive en `@central/module-rrhh`.
 */
function deps(empresaId: string, empleadoId: string): DepsFirma {
  const repo: RepoFirma = {
    async cargarDoc(docId): Promise<DocFirmable | null> {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT d.estado_firma, d.storage_path,
               TRIM(CONCAT(e.nombre, ' ', COALESCE(e.apellidos, ''))) AS nombre,
               e.email, e.dni
        FROM rrhh.documentos d JOIN rrhh.empleados e ON e.id = d.empleado_id
        WHERE d.id = ${docId}::uuid AND d.empleado_id = ${empleadoId}::uuid AND d.empresa_id = ${empresaId}::uuid LIMIT 1`)
      const doc = rows[0]
      if (!doc) return null
      const titular: Firmante = { id: empleadoId, nombre: doc.nombre, email: doc.email, dni: doc.dni }
      return { estadoFirma: doc.estado_firma, storagePath: doc.storage_path, titular }
    },
    async guardarOtp(docId, codigoHash, expiraAt) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO rrhh.firma_otps (empresa_id, empleado_id, documento_id, codigo_hash, expira_at)
        VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${docId}::uuid, ${codigoHash}, ${expiraAt.toISOString()}::timestamptz)
        ON CONFLICT (documento_id, empleado_id)
        DO UPDATE SET codigo_hash = EXCLUDED.codigo_hash, expira_at = EXCLUDED.expira_at, intentos = 0, creada_at = now()`)
    },
    async cargarOtp(docId) {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT codigo_hash, expira_at, intentos FROM rrhh.firma_otps
        WHERE documento_id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid LIMIT 1`)
      const o = rows[0]
      return o ? { codigoHash: o.codigo_hash, expiraAt: o.expira_at, intentos: o.intentos } : null
    },
    async sumarIntentoOtp(docId) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE rrhh.firma_otps SET intentos = intentos + 1
        WHERE documento_id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid`)
    },
    async marcarPendiente(docId) {
      await prisma.$executeRaw(Prisma.sql`UPDATE rrhh.documentos SET estado_firma = 'pendiente' WHERE id = ${docId}::uuid`)
    },
    async registrarFirma(docId, evidencia, contexto) {
      const f = evidencia.firmante
      await prisma.$transaction([
        prisma.$executeRaw(Prisma.sql`
          INSERT INTO rrhh.firmas (empresa_id, empleado_id, documento_id, doc_hash, algoritmo, metodo,
            firmante_nombre, firmante_email, firmante_dni, ip, user_agent, sello_tiempo, evidencia)
          VALUES (${empresaId}::uuid, ${empleadoId}::uuid, ${docId}::uuid, ${evidencia.doc_hash}, ${evidencia.algoritmo}, ${evidencia.metodo},
            ${f.nombre}, ${f.email}, ${f.dni}, ${contexto.ip}, ${contexto.user_agent},
            ${contexto.fecha}::timestamptz, ${JSON.stringify(evidencia)}::jsonb)`),
        prisma.$executeRaw(Prisma.sql`UPDATE rrhh.documentos SET estado_firma = 'firmado' WHERE id = ${docId}::uuid`),
        prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.firma_otps WHERE documento_id = ${docId}::uuid AND empleado_id = ${empleadoId}::uuid`),
      ])
    },
  }

  const t = getTransporter()
  const email = t
    ? {
        async enviarCodigo({ to, nombre, codigo }: { to: string; nombre: string; codigo: string }) {
          try {
            await t.sendMail({
              from: MAIL_FROM, to,
              subject: 'Tu código para firmar el documento',
              text: `Hola ${nombre},\n\nTu código para firmar electrónicamente el documento es: ${codigo}\n\nCaduca en 10 minutos. Si no has solicitado firmar, ignora este mensaje.`,
            })
            return true
          } catch {
            return false
          }
        },
      }
    : null

  return { repo, email, storage: { descargar: descargarObjeto }, proveedor }
}

/** Genera y envía el código OTP de firma (10 min). Ver `@central/module-rrhh`. */
export async function solicitarCodigoFirma(empresaId: string, empleadoId: string, docId: string) {
  return orquestarCodigo(deps(empresaId, empleadoId), docId)
}

/** El gestor solicita la firma de un documento (estado_firma → 'pendiente'). Scope por empresa. */
export async function solicitarFirma(empresaId: string, empleadoId: string, docId: string) {
  return orquestarSolicitud(deps(empresaId, empleadoId), docId)
}

/** El empleado firma el documento (firma avanzada propia, eIDAS art.26). Devuelve la evidencia. */
export async function firmarDocumento(
  empresaId: string, empleadoId: string, docId: string,
  ctx: { ip?: string | null; user_agent?: string | null; nombre_confirmado: string; codigo?: string | null }
) {
  return orquestarFirma(deps(empresaId, empleadoId), docId, ctx)
}
