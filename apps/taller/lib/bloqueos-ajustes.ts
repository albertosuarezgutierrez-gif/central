// Lo que el dueño ve en Ajustes sobre los bloqueos del login (aviso + «Desbloquear») y el código del taller.
import { claveTope } from './tope-taller.ts'
import { claveUsuario } from './bloqueo-usuario.ts'
import { generarCodigoTaller, normalizarCodigoTaller } from './codigo-taller.ts'
import { ErrorPersonal } from './personal.ts'

type FilaBloqueo = { clave: string; bloqueadoHasta: Date | null }
type TxBloqueos = {
  bloqueoPin: { findMany(a: unknown): Promise<FilaBloqueo[]>; deleteMany(a: { where: { tallerId: string; clave: string } }): Promise<unknown> }
}

export type EstadoBloqueosLogin = { topeMinutos: number | null; usuariosBloqueados: string[] }

export async function estadoBloqueosLogin(tx: TxBloqueos, tallerId: string, ahora: Date): Promise<EstadoBloqueosLogin> {
  const filas = await tx.bloqueoPin.findMany({ where: { tallerId, bloqueadoHasta: { gt: ahora } } })
  const vivas = filas.filter((f) => f.bloqueadoHasta && f.bloqueadoHasta.getTime() > ahora.getTime())
  const tope = vivas.find((f) => f.clave === claveTope(tallerId))
  const prefijo = claveUsuario(tallerId, '')
  return {
    topeMinutos: tope?.bloqueadoHasta ? Math.ceil((tope.bloqueadoHasta.getTime() - ahora.getTime()) / 60_000) : null,
    usuariosBloqueados: vivas.filter((f) => f.clave.startsWith(prefijo)).map((f) => f.clave.slice(prefijo.length)),
  }
}

/** «Desbloquear» el taller (tope por taller). Solo borra la fila del tope; los bloqueos por persona/IP siguen. */
export async function desbloquearTaller(tx: Pick<TxBloqueos, 'bloqueoPin'>, tallerId: string): Promise<void> {
  await tx.bloqueoPin.deleteMany({ where: { tallerId, clave: claveTope(tallerId) } })
}

type TxCodigo = { taller: { update(a: unknown): Promise<unknown> } }

/** Nuevo código del taller: el que escribe el dueño (validado) o uno aleatorio. Los dispositivos con el código viejo dejan de entrar. */
export async function fijarCodigoTaller(tx: TxCodigo, tallerId: string, deseado: string | null, aleatorio?: () => number): Promise<string> {
  let codigo: string
  if (deseado === null || deseado.trim() === '') codigo = generarCodigoTaller(aleatorio)
  else {
    const n = normalizarCodigoTaller(deseado)
    if (!n) throw new ErrorPersonal('El código son de 6 a 12 letras o números')
    codigo = n
  }
  await tx.taller.update({ where: { id: tallerId }, data: { codigoAcceso: codigo } })
  return codigo
}
