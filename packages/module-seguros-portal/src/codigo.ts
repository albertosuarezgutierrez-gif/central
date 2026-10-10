// El código de un solo uso vive en `@central/core-identity/codigo-otp` desde el 05/10/2026
// (lo comparte el Portal del Empleado de rrhh). Este fichero solo lo re-exporta para que la
// API del paquete —y del portal de la correduría— no cambie.
export {
  VALIDEZ_MINUTOS, MAX_INTENTOS, generarCodigo, esHashCodigo, igualEnTiempoConstante, estadoCodigo,
} from '@central/core-identity/codigo-otp'
export type { EstadoCodigo, CodigoGuardado } from '@central/core-identity/codigo-otp'
