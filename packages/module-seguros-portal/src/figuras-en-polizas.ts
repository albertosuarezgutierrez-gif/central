// Qué pólizas AJENAS abre figurar en ellas (27/09/2026), póliza a póliza. Movida aquí desde
// `apps/asegura-portal/lib/intervinientes.ts` el 04/10/2026 para que la cartera del portal y el puente
// de asegura (`/api/portal/personas-poliza`) usen la MISMA regla. Ver la cabecera de ese fichero.
import { NIVELES, type Nivel } from './acceso.ts'

export type FilaInterviniente = { polizaId: string; clienteId: string | null; rol: string }
/** Una póliza candidata, ya filtrada a cartera VIVA y sin lápida de fusión. */
export type PolizaDeTomador = { id: string; clienteId: string }

export type FiguraEnPoliza = {
  /** El tomador (`polizas.cliente_id`), que nunca es una ficha propia. */
  tomadorId: string
  nivel: Nivel
  /** Papeles de la identidad en esa póliza, sin repetir y en el orden de `ORDEN_ROLES`. */
  roles: string[]
}

/** Del papel que más dice al que menos: es el orden en que se nombran en la ficha. */
const ORDEN_ROLES = ['tomador', 'propietario', 'asegurado', 'conductor_habitual', 'conductor_ocasional', 'pagador', 'beneficiario', 'contacto']

function rangoNivel(n: Nivel): number {
  return (NIVELES as readonly string[]).indexOf(n)
}

export function nivelMasAlto(niveles: readonly Nivel[]): Nivel {
  let mejor: Nivel = 'tarjeta'
  for (const n of niveles) if (rangoNivel(n) > rangoNivel(mejor)) mejor = n
  return mejor
}

/**
 * Qué pólizas ajenas abre figurar en ellas, póliza a póliza.
 *
 * 🚨 `propiosIds` se vuelve a comprobar aquí aunque la consulta ya filtre por
 * ellos: una fila de interviniente de OTRO cliente que se colara (un `where`
 * reescrito, un `OR` mal puesto) no abre nada.
 */
export function figurasEnPolizas(args: {
  filas: readonly FilaInterviniente[]
  polizas: readonly PolizaDeTomador[]
  propiosIds: readonly string[]
  nivelPorCliente: ReadonlyMap<string, Nivel>
  /** Pólizas que esta identidad ya ve por otro camino (autorizadas, empresas del dueño). */
  yaVisibles: ReadonlySet<string>
}): Map<string, FiguraEnPoliza> {
  const propios = new Set(args.propiosIds)
  const tomadorDe = new Map(args.polizas.map((p) => [p.id, p.clienteId]))
  const acumulado = new Map<string, { tomadorId: string; niveles: Nivel[]; roles: Set<string> }>()

  for (const f of args.filas) {
    if (f.clienteId === null || !propios.has(f.clienteId)) continue
    const tomadorId = tomadorDe.get(f.polizaId)
    // Sin póliza candidata (no viva, fusionada o inexistente) no hay nada que abrir.
    if (tomadorId === undefined) continue
    if (propios.has(tomadorId)) continue
    if (args.yaVisibles.has(f.polizaId)) continue
    const nivel = args.nivelPorCliente.get(f.clienteId) ?? 'tarjeta'
    const g = acumulado.get(f.polizaId)
    if (g) {
      g.niveles.push(nivel)
      g.roles.add(f.rol)
    } else {
      acumulado.set(f.polizaId, { tomadorId, niveles: [nivel], roles: new Set([f.rol]) })
    }
  }

  const out = new Map<string, FiguraEnPoliza>()
  for (const [polizaId, g] of acumulado) {
    out.set(polizaId, {
      tomadorId: g.tomadorId,
      nivel: nivelMasAlto(g.niveles),
      roles: ordenarRoles([...g.roles]),
    })
  }
  return out
}

export function ordenarRoles(roles: readonly string[]): string[] {
  const r = (x: string) => {
    const i = ORDEN_ROLES.indexOf(x)
    return i === -1 ? ORDEN_ROLES.length : i
  }
  return [...new Set(roles)].sort((a, b) => r(a) - r(b) || a.localeCompare(b))
}
