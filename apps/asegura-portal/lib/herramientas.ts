// «Herramientas» del portal (26/10/2026): cómo se reparten las tarjetas del catálogo en la pantalla. PURO (sin BD).
//
// Menú de cinco: «Herramientas» recoge Patrimonio, Flota, el calendario, Mi resumen y el catálogo solicitable. El
// estado de cada módulo (¿lo tiene activo? ¿lo ha pedido?) sale de `tarjetasModulos` (`lib/modulos.ts`), que ya respeta
// lo que cada cliente tiene; aquí solo se decide DÓNDE se pinta: lo que ya se abre arriba y lo que se puede pedir abajo.
import type { TarjetaModulo } from '@central/module-seguros-portal'

/** El Portal del Empleado (RRHH) es OTRA aplicación, con su propio dominio y su propio acceso (no hay SSO). */
export const URL_PORTAL_EMPLEADO = 'https://empleados.grupoasegura.es'

/** El módulo cuya tarjeta es la del Portal del Empleado: se pinta aparte (lleva el enlace externo). */
export const MODULO_RRHH = 'rrhh' as const

export type GrupoHerramientas = {
  /** Las que se abren o ya están activadas: Patrimonio, Flota… */
  propias: TarjetaModulo[]
  /** Las que se piden (o ya están pedidas, o no se ha podido comprobar). */
  solicitables: TarjetaModulo[]
  /** La del Portal del Empleado, con su estado de solicitud. `null` si el catálogo no la trae. */
  rrhh: TarjetaModulo | null
}

export function agruparHerramientas(tarjetas: readonly TarjetaModulo[]): GrupoHerramientas {
  const propias: TarjetaModulo[] = []
  const solicitables: TarjetaModulo[] = []
  let rrhh: TarjetaModulo | null = null
  for (const t of tarjetas) {
    if (t.id === MODULO_RRHH) {
      rrhh = t
      continue
    }
    if (t.accion.tipo === 'abrir' || t.accion.tipo === 'activo') propias.push(t)
    else solicitables.push(t)
  }
  return { propias, solicitables, rrhh }
}
