// Login por PIN de un taller: TODO (bloqueo, verificación, registro) en UNA transacción con RLS del taller.
import { loginConPin, type ResultadoLoginPin } from '@central/core-identity/pin'
import { esTallerId, type ConTaller } from './rls.ts'
import { claveBloqueoPin, crearPinStoreBd, type TxPin } from './pin-store-bd.ts'

/** PBKDF2 × mecánicos del taller dentro de la transacción: margen sobre los 5 s por defecto de Prisma. */
const TIMEOUT_LOGIN_MS = 15_000

export function loginTaller<Tx extends TxPin>(
  conTaller: ConTaller<Tx>,
  o: { tallerId: string; ip: string; pin: unknown; ahora: Date },
): Promise<ResultadoLoginPin> {
  return conTaller(
    o.tallerId,
    (tx) =>
      loginConPin(crearPinStoreBd(tx, o.tallerId), {
        tenantId: o.tallerId,
        claveBloqueo: claveBloqueoPin(o.tallerId, o.ip),
        pin: o.pin,
        ahora: o.ahora,
      }),
    { timeout: TIMEOUT_LOGIN_MS },
  )
}

/** Taller de ESTE despliegue/dispositivo (F1: uno, por configuración). null si falta o no es uuid: sin login. */
export function tallerDelDespliegue(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.TALLER_PILOTO_ID?.trim()
  return esTallerId(v) ? v : null
}
