// PinStore REAL sobre el schema `taller` (sustituye al stub de lib/pin-store.ts, que queda solo para tests).
//
// Va LIGADO a una transacción ya abierta con `conTaller` (RLS del taller) y a ese taller: cualquier petición
// de otro taller (tenantId o clave de bloqueo con otro prefijo) lanza en vez de leer.
//
// Atomicidad del bloqueo: `leerBloqueo` toma `pg_advisory_xact_lock(hashtext(clave))`, que dura hasta el final
// de la transacción. Como `loginConPin` lee → verifica → guarda dentro de la MISMA transacción (lib/login.ts),
// dos intentos simultáneos desde la misma IP se serializan: sin esto, N peticiones en paralelo leerían todas
// «0 fallos» y el bloqueo tras 5 nunca saltaría (fuerza bruta de un PIN de 4 dígitos).
import {
  ESTADO_BLOQUEO_INICIAL,
  type CredencialPin,
  type EstadoBloqueo,
  type PinStore,
} from '@central/core-identity/pin'

type FilaUsuario = { id: string; pinHash: string; rol: string; nombre: string; sesionVersion: number }
type FilaBloqueo = { intentos: number; bloqueadoHasta: Date | null }

/** Lo que el adaptador usa de la transacción Prisma (subconjunto de Prisma.TransactionClient). */
export type TxPin = {
  $executeRaw(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<unknown>
  usuarioTaller: {
    findMany(a: { where: { tallerId: string; activo: true; id?: string }; select: { id: true; pinHash: true; rol: true; nombre: true; sesionVersion: true } }): Promise<FilaUsuario[]>
  }
  bloqueoPin: {
    findUnique(a: { where: { tallerId_clave: { tallerId: string; clave: string } } }): Promise<FilaBloqueo | null>
    upsert(a: {
      where: { tallerId_clave: { tallerId: string; clave: string } }
      create: { tallerId: string; clave: string; intentos: number; bloqueadoHasta: Date | null }
      update: { intentos: number; bloqueadoHasta: Date | null }
    }): Promise<unknown>
    deleteMany(a: { where: { tallerId: string; clave: string } }): Promise<unknown>
  }
}

export const claveBloqueoPin = (tallerId: string, ip: string) => `${tallerId}:${ip}`

export function crearPinStoreBd(tx: TxPin, tallerId: string): PinStore {
  const comprobarClave = (clave: string) => {
    if (!clave.startsWith(`${tallerId}:`)) throw new Error('clave de bloqueo de otro taller')
  }
  const k = (clave: string) => ({ tallerId_clave: { tallerId, clave } })

  return {
    async buscarCredenciales(tenantId, usuarioId): Promise<CredencialPin[]> {
      if (tenantId !== tallerId) throw new Error('credenciales de otro taller')
      const filas = await tx.usuarioTaller.findMany({
        where: { tallerId, activo: true, ...(usuarioId ? { id: usuarioId } : {}) },
        select: { id: true, pinHash: true, rol: true, nombre: true, sesionVersion: true },
      })
      return filas.map((f) => ({ usuarioId: f.id, pinHash: f.pinHash, rol: f.rol, nombre: f.nombre, sesionVersion: f.sesionVersion ?? 0 }))
    },
    async leerBloqueo(clave): Promise<EstadoBloqueo> {
      comprobarClave(clave)
      // $executeRaw (no $queryRaw): pg_advisory_xact_lock devuelve `void`, que Prisma no deserializa.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`
      const f = await tx.bloqueoPin.findUnique({ where: k(clave) })
      return f ? { intentos: f.intentos, bloqueadoHasta: f.bloqueadoHasta } : { ...ESTADO_BLOQUEO_INICIAL }
    },
    async guardarBloqueo(clave, estado) {
      comprobarClave(clave)
      await tx.bloqueoPin.upsert({
        where: k(clave),
        create: { tallerId, clave, intentos: estado.intentos, bloqueadoHasta: estado.bloqueadoHasta },
        update: { intentos: estado.intentos, bloqueadoHasta: estado.bloqueadoHasta },
      })
    },
    async resetearBloqueo(clave) {
      comprobarClave(clave)
      await tx.bloqueoPin.deleteMany({ where: { tallerId, clave } })
    },
  }
}
