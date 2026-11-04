// Tope de login POR TALLER (decisión de Alberto, 04/11/2026), además del bloqueo por IP (`taller:ip`).
// Un atacante que rota de IP esquiva el límite por IP: aquí cuentan los fallos de PIN TOTALES del taller. N fallos dentro
// de la ventana → el login de ese taller queda bloqueado `bloqueoMinutos`. N, ventana y bloqueo salen de la
// CONFIGURACIÓN del taller (`configuracion.login_*`, 0003), nunca de un literal. Un acierto NO reinicia la cuenta (si no, un
// acierto legítimo intercalado daría fuerza bruta gratis); la cuenta solo se reinicia al vencer la ventana o el bloqueo.
// Compromiso asumido: quien falle 30 PIN seguidos puede dejar fuera al taller unos minutos (denegación temporal, no acceso).
import type { SeguridadLogin } from '@central/module-taller'

export type FilaTope = { intentos: number; bloqueadoHasta: Date | null; creadoEn: Date }

/** Clave en `bloqueos_pin` (empieza por `<tallerId>:` como exige el PinStore; `#` no puede ser una IP). */
export const claveTope = (tallerId: string) => `${tallerId}:#taller`

const MIN = 60_000

/** ¿Está bloqueado el login del taller? (minutos restantes, redondeo arriba). */
export function topeBloqueado(f: FilaTope | null, ahora: Date): { bloqueado: false } | { bloqueado: true; minutos: number } {
  if (f?.bloqueadoHasta && f.bloqueadoHasta.getTime() > ahora.getTime()) {
    return { bloqueado: true, minutos: Math.ceil((f.bloqueadoHasta.getTime() - ahora.getTime()) / MIN) }
  }
  return { bloqueado: false }
}

export type FalloTope = { intentos: number; bloqueadoHasta: Date | null; reiniciar: boolean }

/** Estado tras UN fallo de PIN. `reiniciar` = empieza ventana nueva (la fila vieja se sustituye). Puro. */
export function registrarFalloTope(f: FilaTope | null, ahora: Date, pol: SeguridadLogin): FalloTope {
  if (f && topeBloqueado(f, ahora).bloqueado) return { intentos: f.intentos, bloqueadoHasta: f.bloqueadoHasta, reiniciar: false }
  const vencida = !f || f.bloqueadoHasta !== null || ahora.getTime() - f.creadoEn.getTime() >= pol.ventanaMinutos * MIN
  const intentos = (vencida ? 0 : f!.intentos) + 1
  return {
    intentos,
    bloqueadoHasta: intentos >= pol.maxFallosTaller ? new Date(ahora.getTime() + pol.bloqueoMinutos * MIN) : null,
    reiniciar: vencida,
  }
}

type K = { tallerId_clave: { tallerId: string; clave: string } }
export type TxTope = {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  bloqueoPin: {
    findUnique(a: { where: K }): Promise<FilaTope | null>
    upsert(a: { where: K; create: FilaTope & { tallerId: string; clave: string }; update: { intentos: number; bloqueadoHasta: Date | null } }): Promise<unknown>
    deleteMany(a: { where: { tallerId: string; clave: string } }): Promise<unknown>
  }
}

/** Candado + lectura. Va ANTES de verificar el PIN, en la misma transacción que el login. */
export async function leerTope(tx: TxTope, tallerId: string): Promise<FilaTope | null> {
  const clave = claveTope(tallerId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`
  return tx.bloqueoPin.findUnique({ where: { tallerId_clave: { tallerId, clave } } })
}

export async function anotarFalloTope(tx: TxTope, tallerId: string, previa: FilaTope | null, ahora: Date, pol: SeguridadLogin) {
  const clave = claveTope(tallerId)
  const n = registrarFalloTope(previa, ahora, pol)
  if (n.reiniciar) await tx.bloqueoPin.deleteMany({ where: { tallerId, clave } })
  await tx.bloqueoPin.upsert({
    where: { tallerId_clave: { tallerId, clave } },
    create: { tallerId, clave, intentos: n.intentos, bloqueadoHasta: n.bloqueadoHasta, creadoEn: ahora },
    update: { intentos: n.intentos, bloqueadoHasta: n.bloqueadoHasta },
  })
  return n
}
