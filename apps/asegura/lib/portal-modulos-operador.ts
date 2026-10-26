// Activar/retirar los «módulos del portal» (Herramientas) de UN cliente desde la ficha de /correduria.
// Lógica PURA (sin BD ni red); el SQL vive en `portal-modulos-cartera.ts` y la ruta en
// `app/api/operador/cliente/portal-modulos/route.ts`. Catálogo: `@central/module-seguros-portal`.
//
// 🚨 La activación es por IDENTIDAD del portal (`seguros.portal_modulo.identidad_id`), no por ficha. La ficha
// llega a sus identidades por `portal_vinculo`. Una ficha SIN identidad (nunca ha entrado al portal) no tiene
// sobre qué colgar la fila: no se activa nada en el aire, se dice que primero hay que invitarla.
//
// Tres estados (regla global): `null` en `identidades`/`polizasEnVigor` = «no se ha podido mirar», NUNCA «no
// tiene». Con `null` no se ofrece activar (podría ser justo lo que no cumple la regla).
//
// Fase 1 (24/10/2026, Alberto): «Patrimonio y alquileres» (`alquileres`) solo para clientes con una póliza EN
// VIGOR de CIMA (`esCarteraEnVigor`). Lo decide el SERVIDOR al escribir; el botón solo lo refleja.
import { CATALOGO_MODULOS, MODULOS_PORTAL, esModuloPortal, type ModuloPortal } from '@central/module-seguros-portal'

export { esModuloPortal }
export type { ModuloPortal }

/** Módulos que, en Fase 1, exigen póliza en vigor de CIMA. */
export const MODULOS_CON_POLIZA_EN_VIGOR: readonly ModuloPortal[] = ['alquileres']

export type FilaModuloCliente = { id: string; identidadId: string; modulo: string; estado: string }
export type EstadoModuloFicha = 'activo' | 'solicitado' | 'inactivo'

export type ContextoActivacion = {
  /** Identidades del portal vinculadas a la ficha. `null` = no se ha podido contar. */
  identidades: number | null
  /** Pólizas EN VIGOR (`sqlCarteraEnVigor`) de la ficha. `null` = no se ha podido contar. */
  polizasEnVigor: number | null
}

/** Estado agregado de un módulo para la ficha: activo si alguna identidad lo tiene activo, y así. */
export function estadoDelModulo(filas: readonly FilaModuloCliente[], modulo: ModuloPortal): EstadoModuloFicha {
  const vigentes = filas.filter((f) => f.modulo === modulo && f.estado !== 'retirado')
  if (vigentes.some((f) => f.estado === 'activo')) return 'activo'
  if (vigentes.some((f) => f.estado === 'solicitado')) return 'solicitado'
  return 'inactivo'
}

export type DecisionActivacion = { puede: true } | { puede: false; motivo: string }

/** ¿Se puede ACTIVAR este módulo a esta ficha? El motivo es la frase para Alberto. */
export function puedeActivar(modulo: ModuloPortal, ctx: ContextoActivacion): DecisionActivacion {
  if (ctx.identidades === null) return { puede: false, motivo: 'No se ha podido comprobar si este cliente ha entrado al portal. Vuelve a intentarlo.' }
  if (ctx.identidades === 0) {
    return { puede: false, motivo: 'Este cliente aún no ha entrado al portal: los módulos se activan sobre su acceso. Invítale primero (bloque «Portal del cliente»).' }
  }
  if (MODULOS_CON_POLIZA_EN_VIGOR.includes(modulo)) {
    if (ctx.polizasEnVigor === null) return { puede: false, motivo: 'No se han podido comprobar sus pólizas. Vuelve a intentarlo.' }
    if (ctx.polizasEnVigor === 0) {
      return {
        puede: false,
        motivo: `«${CATALOGO_MODULOS[modulo].nombre}» es, por ahora, solo para clientes con una póliza en vigor en CIMA. Esta ficha no tiene ninguna (las canceladas, las sustituidas y el volcado histórico no cuentan).`,
      }
    }
  }
  return { puede: true }
}

export type OperacionModulo =
  | { tipo: 'insertar_activo'; identidadId: string }
  | { tipo: 'activar'; filaId: string }
  | { tipo: 'retirar'; filaId: string }

/**
 * Qué escribir. Activar: por identidad, la `solicitado` pasa a `activo`, la inexistente se crea ya `activo`
 * (origen `corredor`), la `activo` no se toca. Retirar: toda fila vigente (activa o solicitada) pasa a `retirado`.
 * Las filas retiradas no cuentan (el índice único parcial de la BD solo cubre las no retiradas).
 */
export function planDeEscritura(
  accion: 'activar' | 'retirar',
  modulo: ModuloPortal,
  identidades: readonly string[],
  filas: readonly FilaModuloCliente[],
): OperacionModulo[] {
  const vigentes = filas.filter((f) => f.modulo === modulo && f.estado !== 'retirado' && identidades.includes(f.identidadId))
  if (accion === 'retirar') return vigentes.map((f) => ({ tipo: 'retirar', filaId: f.id }))
  const ops: OperacionModulo[] = []
  for (const identidadId of identidades) {
    const f = vigentes.find((v) => v.identidadId === identidadId)
    if (!f) ops.push({ tipo: 'insertar_activo', identidadId })
    else if (f.estado === 'solicitado') ops.push({ tipo: 'activar', filaId: f.id })
  }
  return ops
}

export type FichaModuloOperador = {
  id: ModuloPortal
  nombre: string
  descripcion: string
  estado: EstadoModuloFicha
  puedeActivar: boolean
  /** Por qué no se puede activar (`null` si se puede o si ya está activo). */
  motivoNoActivar: string | null
  puedeRetirar: boolean
}

/** Lo que pinta la pantalla: el catálogo entero, en su orden, con estado y botón por módulo. */
export function fichasModulos(filas: readonly FilaModuloCliente[] | null, ctx: ContextoActivacion): FichaModuloOperador[] | null {
  if (filas === null) return null
  return MODULOS_PORTAL.map((id) => {
    const estado = estadoDelModulo(filas, id)
    const d = puedeActivar(id, ctx)
    return {
      id,
      nombre: CATALOGO_MODULOS[id].nombre,
      descripcion: CATALOGO_MODULOS[id].descripcion,
      estado,
      puedeActivar: estado !== 'activo' && d.puede,
      motivoNoActivar: estado !== 'activo' && !d.puede ? d.motivo : null,
      puedeRetirar: estado !== 'inactivo',
    }
  })
}

/** La línea de `historial_interno` (tipo `gestion`) que deja una activación o retirada. */
export function textoHistorialModulo(modulo: ModuloPortal, accion: 'activar' | 'retirar', actor: string): string {
  const nombre = CATALOGO_MODULOS[modulo].nombre
  return `${accion === 'activar' ? 'Módulo del portal activado' : 'Módulo del portal retirado'}: ${nombre} (${actor})`
}

export type VistaSolicitud = { moduloNombre: string; puedeActivar: boolean; motivoNoActivar: string | null }

/**
 * Cola «Solicitudes del portal» de /correduria → Hoy: lo que cada fila `solicitado` enseña. Misma regla que la ficha
 * (`puedeActivar`), con una identidad ya conocida (la fila existe). `clienteId` null = identidad sin ficha vinculada:
 * no hay a quién activar (`escribirModulo` trabaja por ficha). `polizasEnVigor` null = no se ha podido mirar (≠ 0).
 * El servidor vuelve a decidir al escribir; esto solo pinta el botón.
 */
export function vistaSolicitud(modulo: string, clienteId: string | null, polizasEnVigor: number | null): VistaSolicitud {
  if (!esModuloPortal(modulo)) {
    return { moduloNombre: modulo, puedeActivar: false, motivoNoActivar: 'Módulo que ya no está en el catálogo del portal.' }
  }
  const moduloNombre = CATALOGO_MODULOS[modulo].nombre
  if (clienteId === null) {
    return { moduloNombre, puedeActivar: false, motivoNoActivar: 'Esta petición no está vinculada a ninguna ficha de cliente: vincúlala antes de activar.' }
  }
  const d = puedeActivar(modulo, { identidades: 1, polizasEnVigor })
  return d.puede ? { moduloNombre, puedeActivar: true, motivoNoActivar: null } : { moduloNombre, puedeActivar: false, motivoNoActivar: d.motivo }
}
