// Bloqueo POR USUARIO del login (decisión de seguridad, 04/11/2026): N fallos de PIN contra UNA persona → esa persona queda bloqueada
// T minutos (alta: 5 fallos → 5 h; editable en Ajustes). Se suma al bloqueo por IP y al tope por taller. El contador vive en `bloqueos_pin`
// con clave `<taller>:u:<usuario>` (empieza por `<taller>:` como exige el PinStore) y se lee bajo `pg_advisory_xact_lock` en la MISMA
// transacción que verifica el PIN: dos intentos en paralelo se serializan.
import { ESTADO_BLOQUEO_INICIAL, estaBloqueado, minutosRestantes, registrarFallo, type EstadoBloqueo } from '@central/core-identity/pin'
import { configDeAlta } from '@central/module-taller'

export type PoliticaUsuario = { maxFallosUsuario: number; bloqueoUsuarioMinutos: number }

export const claveUsuario = (tallerId: string, usuarioId: string) => `${tallerId}:u:${usuarioId}`

type K = { tallerId_clave: { tallerId: string; clave: string } }
export type TxBloqueoUsuario = {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  bloqueoPin: {
    findUnique(a: { where: K }): Promise<{ intentos: number; bloqueadoHasta: Date | null } | null>
    upsert(a: {
      where: K
      create: { tallerId: string; clave: string; intentos: number; bloqueadoHasta: Date | null }
      update: { intentos: number; bloqueadoHasta: Date | null }
    }): Promise<unknown>
    deleteMany(a: { where: { tallerId: string; clave: string } }): Promise<unknown>
  }
}
export type TxConfigUsuario = {
  configuracion?: { findUnique(a: unknown): Promise<{ loginMaxFallosUsuario?: number; loginBloqueoUsuarioMinutos?: number } | null> }
}

/** Política del taller; sin fila (o sin la columna), la de ALTA: nunca «sin bloqueo». */
export async function politicaUsuario(tx: TxConfigUsuario, tallerId: string): Promise<PoliticaUsuario> {
  const a = configDeAlta().seguridadLogin
  const c = await tx.configuracion?.findUnique({ where: { tallerId } })
  return {
    maxFallosUsuario: c?.loginMaxFallosUsuario ?? a.maxFallosUsuario,
    bloqueoUsuarioMinutos: c?.loginBloqueoUsuarioMinutos ?? a.bloqueoUsuarioMinutos,
  }
}

/** Candado + lectura. */
export async function leerBloqueoUsuario(tx: TxBloqueoUsuario, tallerId: string, usuarioId: string): Promise<EstadoBloqueo> {
  const clave = claveUsuario(tallerId, usuarioId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`
  const f = await tx.bloqueoPin.findUnique({ where: { tallerId_clave: { tallerId, clave } } })
  return f ? { intentos: f.intentos, bloqueadoHasta: f.bloqueadoHasta } : { ...ESTADO_BLOQUEO_INICIAL }
}

export const usuarioBloqueado = (e: EstadoBloqueo, ahora: Date): { bloqueado: false } | { bloqueado: true; minutos: number } =>
  estaBloqueado(e, ahora) ? { bloqueado: true, minutos: minutosRestantes(e, ahora) } : { bloqueado: false }

/** Anota UN fallo (estado leído antes con `leerBloqueoUsuario`, bajo el mismo candado). */
export async function anotarFalloUsuario(
  tx: TxBloqueoUsuario, tallerId: string, usuarioId: string, previo: EstadoBloqueo, ahora: Date, pol: PoliticaUsuario,
): Promise<EstadoBloqueo> {
  const nuevo = registrarFallo(previo, ahora, { maxIntentos: pol.maxFallosUsuario, bloqueoMinutos: pol.bloqueoUsuarioMinutos })
  const clave = claveUsuario(tallerId, usuarioId)
  await tx.bloqueoPin.upsert({
    where: { tallerId_clave: { tallerId, clave } },
    create: { tallerId, clave, intentos: nuevo.intentos, bloqueadoHasta: nuevo.bloqueadoHasta },
    update: { intentos: nuevo.intentos, bloqueadoHasta: nuevo.bloqueadoHasta },
  })
  return nuevo
}

/** Acierto o PIN reseteado por el dueño: la cuenta vuelve a cero. */
export async function limpiarBloqueoUsuario(tx: { bloqueoPin: Pick<TxBloqueoUsuario['bloqueoPin'], 'deleteMany'> }, tallerId: string, usuarioId: string): Promise<void> {
  await tx.bloqueoPin.deleteMany({ where: { tallerId, clave: claveUsuario(tallerId, usuarioId) } })
}
