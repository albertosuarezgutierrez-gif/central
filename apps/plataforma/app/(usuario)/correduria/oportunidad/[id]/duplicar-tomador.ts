// «Duplicar con otro tomador» (07/10/2026): el día a día de los escenarios. Del P1 del Mercedes
// (Ana tomadora y conductora, Rafael propietario) al P2 (Rafael tomador y propietario, Ana conductora) sin
// tocar figura a figura. PURO: decide QUÉ figuras asignar; la pantalla las asigna por el puerto de siempre
// (`/api/correduria/oportunidad/figuras`) y abre la variante con `rutaVariante`.
//
// La regla: el tomador pasa a ser OTRA persona ya cargada en el riesgo (la propietaria primero, luego el
// conductor habitual, luego el ocasional), y quien conduce y de quién es el vehículo NO cambian. Por eso, antes
// de mover el tomador, el conductor y el propietario que hoy son «el mismo que el tomador» se escriben con su
// ficha: si no, al cambiar el tomador cambiarían con él sin que nadie lo pidiera.
// Personas por IDENTIDAD (clienteId): dos fichas con el mismo nombre son dos personas.

import type { RolFigura } from '@central/module-seguros'

type Figura = { rol: RolFigura; clienteId: string; nombre: string; porDefecto: boolean }

export type PlanDuplicar =
  | {
      ok: true
      nuevoTomador: { clienteId: string; nombre: string }
      /** En orden: primero lo que NO cambia de persona (se hace explícito); el tomador, el ÚLTIMO. */
      asignaciones: Array<{ rol: RolFigura; clienteId: string }>
      /** «Tomador: Rafael · Conductor: Ana · Propietario: Rafael», lo que quedará. */
      resultado: string
    }
  | { ok: false; motivo: string }

const ORDEN_CANDIDATOS: readonly RolFigura[] = ['propietario', 'conductor_habitual', 'conductor_ocasional']

export function planDuplicarConOtroTomador(r: { roles: readonly RolFigura[]; figuras: readonly Figura[]; clienteOportunidad: { clienteId: string; nombre: string } }): PlanDuplicar {
  if (!r.roles.includes('conductor_habitual')) {
    return { ok: false, motivo: 'Este ramo solo tiene tomador: cámbialo en «Intervinientes».' }
  }
  const fig = (rol: RolFigura) => r.figuras.find((f) => f.rol === rol && !(rol !== 'tomador' && f.porDefecto)) ?? null
  const t = fig('tomador')
  const tomador = t ? { clienteId: t.clienteId, nombre: t.nombre } : r.clienteOportunidad
  // Quién ocupa de VERDAD cada papel hoy: la figura asignada o, si no la hay, el tomador.
  const efectivo = (rol: RolFigura) => {
    const f = fig(rol)
    return f ? { clienteId: f.clienteId, nombre: f.nombre } : tomador
  }
  const nuevo = ORDEN_CANDIDATOS.map((rol) => fig(rol)).find((f) => f !== null && f.clienteId !== tomador.clienteId) ?? null
  if (!nuevo) {
    return { ok: false, motivo: 'En este riesgo solo figura una persona: añade a la otra en «Intervinientes» (propietario o conductor) y vuelve a pulsar.' }
  }
  const asignaciones: Array<{ rol: RolFigura; clienteId: string }> = []
  for (const rol of ['propietario', 'conductor_habitual'] as const) {
    if (!r.roles.includes(rol)) continue
    const e = efectivo(rol)
    // Ya escrita con esa misma ficha: no hace falta tocarla.
    if (fig(rol)?.clienteId === e.clienteId) continue
    asignaciones.push({ rol, clienteId: e.clienteId })
  }
  asignaciones.push({ rol: 'tomador', clienteId: nuevo.clienteId })

  const nombre = (rol: RolFigura) => (rol === 'tomador' ? nuevo.nombre : efectivo(rol).nombre)
  const partes = [`Tomador: ${nombre('tomador')}`, `Conductor: ${nombre('conductor_habitual')}`]
  if (r.roles.includes('propietario')) partes.push(`Propietario: ${nombre('propietario')}`)
  return { ok: true, nuevoTomador: { clienteId: nuevo.clienteId, nombre: nuevo.nombre }, asignaciones, resultado: partes.join(' · ') }
}
