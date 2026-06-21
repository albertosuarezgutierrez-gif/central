// Orquestación del flujo de firma avanzada con OTP (eIDAS art.26), AGNÓSTICA DE VERTICAL.
// Reescritura owner-agnóstica de lo que vivía en apps/rrhh/lib/firma.ts: la lógica (validación
// de estado, control exclusivo reforzado por OTP, llamada al proveedor de firma) es compartida;
// la persistencia/email/storage los inyecta cada vertical vía puertos.

import { createHash, randomInt } from 'crypto'
import {
  nombreCoincide,
  type ProveedorFirma, type ContextoFirma, type MetodoFirma, type Evidencia,
} from '@central/core-firma'
import type { RepoFirma, PuertoEmailFirma, PuertoDescarga } from './tipos.ts'

/** Hash SHA-256 (hex) de un código OTP, para no almacenarlo en claro. */
export const hashCodigo = (c: string) => createHash('sha256').update(c).digest('hex')

/** Enmascara un email para el acuse (j***@dominio.com). */
export function enmascararEmail(email: string): string {
  const [u, d] = email.split('@')
  if (!d) return '***'
  return `${u[0] ?? ''}***@${d}`
}

/** Puertos que la vertical inyecta en cada operación de firma. */
export interface DepsFirma {
  repo: RepoFirma
  /** Remitente del OTP. Si es null (o no hay email del titular), la firma sigue siendo válida por sesión. */
  email: PuertoEmailFirma | null
  storage: PuertoDescarga
  proveedor: ProveedorFirma
}

/**
 * Genera un código OTP de 6 dígitos, lo guarda (hasheado, 10 min) y lo envía al titular.
 * Refuerza el control exclusivo (eIDAS art.26.c). Si no hay email/remitente, devuelve
 * { enviado:false } y la firma sigue siendo válida por sesión (token personal) sin OTP.
 */
export async function solicitarCodigoFirma(
  deps: DepsFirma, docId: string
): Promise<{ enviado: boolean; email_parcial?: string }> {
  const doc = await deps.repo.cargarDoc(docId)
  if (!doc) throw new Error('Documento no encontrado')
  if (doc.estadoFirma !== 'pendiente') throw new Error('Este documento no requiere firma')

  if (!deps.email || !doc.titular.email) return { enviado: false }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expira = new Date(Date.now() + 10 * 60 * 1000)
  await deps.repo.guardarOtp(docId, hashCodigo(codigo), expira)

  const enviado = await deps.email.enviarCodigo({ to: doc.titular.email, nombre: doc.titular.nombre, codigo })
  if (!enviado) return { enviado: false }
  return { enviado: true, email_parcial: enmascararEmail(doc.titular.email) }
}

/** El gestor solicita la firma de un documento (estado → 'pendiente'). */
export async function solicitarFirma(deps: DepsFirma, docId: string) {
  const doc = await deps.repo.cargarDoc(docId)
  if (!doc) throw new Error('Documento no encontrado')
  if (doc.estadoFirma === 'firmado') throw new Error('El documento ya está firmado')
  await deps.repo.marcarPendiente(docId)
}

/** El titular firma el documento (firma avanzada propia, eIDAS art.26). Devuelve la evidencia. */
export async function firmarDocumento(
  deps: DepsFirma, docId: string,
  ctx: { ip?: string | null; user_agent?: string | null; nombre_confirmado: string; codigo?: string | null }
): Promise<Evidencia> {
  const doc = await deps.repo.cargarDoc(docId)
  if (!doc) throw new Error('Documento no encontrado')
  if (doc.estadoFirma === 'firmado') throw new Error('El documento ya está firmado')
  if (doc.estadoFirma !== 'pendiente') throw new Error('Este documento no requiere firma')
  if (!nombreCoincide(ctx.nombre_confirmado, doc.titular.nombre)) {
    throw new Error('El nombre no coincide con el del titular')
  }

  // Si se emitió un OTP para este documento, es OBLIGATORIO validarlo (control exclusivo reforzado).
  let metodo: MetodoFirma = 'sesion_token'
  const otp = await deps.repo.cargarOtp(docId)
  if (otp) {
    if (!ctx.codigo) throw new Error('Falta el código de verificación')
    if (new Date(otp.expiraAt) < new Date()) throw new Error('El código ha caducado, pide uno nuevo')
    if (otp.intentos >= 5) throw new Error('Demasiados intentos, pide un código nuevo')
    if (hashCodigo(String(ctx.codigo)) !== otp.codigoHash) {
      await deps.repo.sumarIntentoOtp(docId)
      throw new Error('Código incorrecto')
    }
    metodo = 'otp_email'
  }

  const bytes = await deps.storage.descargar(doc.storagePath)
  const contexto: ContextoFirma = {
    fecha: new Date().toISOString(), ip: ctx.ip ?? null, user_agent: ctx.user_agent ?? null,
  }
  const evidencia = await deps.proveedor.firmar({
    firmante: doc.titular, documento_id: docId, bytes, contexto, metodo, nombre_confirmado: ctx.nombre_confirmado,
  })

  await deps.repo.registrarFirma(docId, evidencia, contexto)
  return evidencia
}
