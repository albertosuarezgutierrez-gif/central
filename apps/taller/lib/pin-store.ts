// Adaptador PinStore (puerto de @central/core-identity/pin). STUB EN MEMORIA.
// TODO(F1): sustituir por la implementación sobre el schema `taller` (credenciales con `taller_id`,
// bloqueo persistente). En serverless la memoria no se comparte entre instancias: esto NO es válido en producción real.
import {
  ESTADO_BLOQUEO_INICIAL,
  hashPin,
  type CredencialPin,
  type EstadoBloqueo,
  type PinStore,
} from '@central/core-identity/pin'

const bloqueos = new Map<string, EstadoBloqueo>()
let semilla: Promise<CredencialPin[]> | null = null

/** Solo desarrollo: un usuario de prueba con el PIN de `TALLER_DEV_PIN` (env). En producción no hay semilla. */
function credencialesDev(): Promise<CredencialPin[]> {
  semilla ??= (async () => {
    const pin = process.env.TALLER_DEV_PIN
    if (!pin || process.env.NODE_ENV === 'production') return []
    return [{ usuarioId: 'dev', pinHash: await hashPin(pin), rol: 'dueno' }]
  })()
  return semilla
}

export const pinStore: PinStore = {
  async buscarCredenciales(_tallerId, usuarioId) {
    const todas = await credencialesDev()
    return usuarioId ? todas.filter(c => c.usuarioId === usuarioId) : todas
  },
  async leerBloqueo(clave) {
    return bloqueos.get(clave) ?? { ...ESTADO_BLOQUEO_INICIAL }
  },
  async guardarBloqueo(clave, estado) {
    bloqueos.set(clave, estado)
  },
  async resetearBloqueo(clave) {
    bloqueos.delete(clave)
  },
}
