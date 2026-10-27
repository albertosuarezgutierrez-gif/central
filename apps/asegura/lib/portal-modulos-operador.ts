// Activar/retirar los «módulos del portal» (Herramientas) de UN cliente desde la ficha de /correduria.
// Lógica PURA (sin BD ni red); el SQL vive en `portal-modulos-cartera.ts` y la ruta en
// `app/api/operador/cliente/portal-modulos/route.ts`. Catálogo: `@central/module-seguros-portal`.
//
// 🚨 La activación es por IDENTIDAD del portal (`seguros.portal_modulo.identidad_id`), no por ficha. La ficha
// llega a sus identidades por `portal_vinculo`. Una ficha SIN identidad (nunca ha entrado al portal) no tiene
// sobre qué colgar la fila: no se activa nada en el aire, se dice que primero hay que invitarla.
//
// Tres estados (regla global): `null` en `identidades` = «no se ha podido mirar», NUNCA «no tiene». Con `null` no se
// ofrece activar.
//
// 27/10/2026 (Alberto): el acceso a un módulo es la AUTORIZACIÓN de la correduría, tenga o no la persona póliza con
// nosotros. Se quita la regla de fase 1 «Patrimonio solo con póliza en vigor de CIMA». Y una identidad que pide un módulo
// SIN ficha se puede activar desde la cola: el servidor crea una ficha de PROSPECTO (lead, sin póliza, fuente portal) y el
// vínculo `gestionar` con origen `autorizacion_corredor` (`portal-modulos-cartera.ts`, `escribirModuloPorIdentidad`).
// Esa ficha NO es cliente: sin póliza en vigor no entra en ningún recuento de cartera (`esCarteraEnVigor`).
import {
  CATALOGO_MODULOS,
  MODULOS_PORTAL,
  ORIGEN_VINCULO_CORREDOR,
  esModuloPortal,
  nivelPuedeOperar,
  type ModuloPortal,
} from '@central/module-seguros-portal'

export { esModuloPortal }
export type { ModuloPortal }

export type VinculoDeFicha = { identidadId: string; nivel: string; origen: string }

/**
 * Las identidades del portal sobre las que se cuelga (y se lee) un módulo de ESTA ficha (27/10/2026). La MISMA
 * regla con la que el portal decide si esa identidad ES la persona de la ficha (`accesosPatrimonio`, reglas 1 y 2):
 *  - Fuera el vínculo `origen='corredor'`: es la vista TEMPORAL de Alberto mirando como el cliente. Antes contaba,
 *    así que con la vista abierta sobre una ficha cuyo cliente aún no había entrado, «Activar» escribía la fila en la
 *    identidad del CORREDOR, la ficha salía «Activado» y el cliente nunca veía `/patrimonio`.
 *  - Solo niveles que operan (`gestionar`/`administrar`): un vínculo `tarjeta`/`completo` no abre el patrimonio.
 */
export function identidadesQueActivan(vinculos: readonly VinculoDeFicha[]): string[] {
  return [...new Set(vinculos.filter((v) => v.origen !== ORIGEN_VINCULO_CORREDOR && nivelPuedeOperar(v.nivel)).map((v) => v.identidadId))]
}

export type FilaModuloCliente = { id: string; identidadId: string; modulo: string; estado: string }
export type EstadoModuloFicha = 'activo' | 'solicitado' | 'inactivo'

export type ContextoActivacion = {
  /** Identidades del portal vinculadas a la ficha (las que operan, sin la vista de corredor). `null` = no se ha podido contar. */
  identidades: number | null
}

/** Estado agregado de un módulo para la ficha: activo si alguna identidad lo tiene activo, y así. */
export function estadoDelModulo(filas: readonly FilaModuloCliente[], modulo: ModuloPortal): EstadoModuloFicha {
  const vigentes = filas.filter((f) => f.modulo === modulo && f.estado !== 'retirado')
  if (vigentes.some((f) => f.estado === 'activo')) return 'activo'
  if (vigentes.some((f) => f.estado === 'solicitado')) return 'solicitado'
  return 'inactivo'
}

export type DecisionActivacion = { puede: true } | { puede: false; motivo: string }

/**
 * ¿Se puede ACTIVAR un módulo a esta ficha? El motivo es la frase para Alberto. Desde el 27/10/2026 no mira pólizas: la
 * activación ES la autorización. Solo hace falta una identidad del portal sobre la que colgar la fila.
 */
export function puedeActivar(ctx: ContextoActivacion): DecisionActivacion {
  if (ctx.identidades === null) return { puede: false, motivo: 'No se ha podido comprobar si este cliente ha entrado al portal. Vuelve a intentarlo.' }
  if (ctx.identidades === 0) {
    return { puede: false, motivo: 'Este cliente aún no ha entrado al portal: los módulos se activan sobre su acceso. Invítale primero (bloque «Portal del cliente»).' }
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
    const d = puedeActivar(ctx)
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

export type VistaSolicitud = {
  moduloNombre: string
  puedeActivar: boolean
  motivoNoActivar: string | null
  /** `true` = la identidad no tiene ficha: activar CREA una ficha de prospecto (27/10/2026). La pantalla lo avisa. */
  creaProspecto: boolean
}

/**
 * Cola «Solicitudes del portal» de /correduria → Hoy: lo que cada fila `solicitado` enseña. Misma regla que la ficha
 * (`puedeActivar`), con una identidad ya conocida (la fila existe). `clienteId` null = identidad sin ficha vinculada: desde
 * el 27/10/2026 SÍ se puede activar (por `identidadId`): el servidor crea la ficha de prospecto. El servidor vuelve a decidir
 * al escribir; esto solo pinta el botón.
 */
export function vistaSolicitud(modulo: string, clienteId: string | null): VistaSolicitud {
  if (!esModuloPortal(modulo)) {
    return { moduloNombre: modulo, puedeActivar: false, motivoNoActivar: 'Módulo que ya no está en el catálogo del portal.', creaProspecto: false }
  }
  const moduloNombre = CATALOGO_MODULOS[modulo].nombre
  if (clienteId === null) return { moduloNombre, puedeActivar: true, motivoNoActivar: null, creaProspecto: true }
  const d = puedeActivar({ identidades: 1 })
  return d.puede
    ? { moduloNombre, puedeActivar: true, motivoNoActivar: null, creaProspecto: false }
    : { moduloNombre, puedeActivar: false, motivoNoActivar: d.motivo, creaProspecto: false }
}

// ── Activar a una identidad SIN ficha (27/10/2026): ficha de prospecto + vínculo por autorización ──────────────────

/** Lo que el servidor sabe de la identidad antes de crear nada. `null` en un campo = no se ha podido leer (no se crea). */
export type EstadoIdentidadSinFicha = {
  /** Estado de la fila VIGENTE (no retirada) de ESE módulo para ESA identidad; `null` = no hay ninguna. */
  filaVigente: 'solicitado' | 'activo' | null
  /** Vínculos de la identidad con alguna ficha (cualquier correduría), sin contar la vista temporal del corredor. */
  vinculosPropios: number
  /** Es la identidad dedicada de la vista de corredor (nunca es una persona). */
  esCorredor: boolean
  /**
   * `portal_identidad.ultimo_vinculo` (el sello del último intento de vincular al entrar). `ambiguo` = su email casa con
   * VARIAS fichas: la persona ya está en la cartera y no se sabe en cuál; un prospecto sería una tercera ficha. `null` = no consta.
   */
  ultimoVinculo: string | null
}

export type DecisionProspecto =
  | { crear: true }
  | { crear: false; status: 409; motivo: string }

/**
 * ¿Se crea la ficha de prospecto y se activa? Solo para una identidad que ha PEDIDO ese módulo (no se activa a cualquier
 * identidad por id), que no es la del corredor, que no tiene ya ficha (con ficha se activa desde su ficha: no se duplica) y
 * cuyo email no casa con varias fichas (`ambiguo`: ya está en la cartera, se vincula a mano).
 */
export function decidirProspecto(e: EstadoIdentidadSinFicha): DecisionProspecto {
  if (e.esCorredor) return { crear: false, status: 409, motivo: 'Esa es la identidad de la vista de corredor: no es un cliente.' }
  if (e.ultimoVinculo === 'ambiguo') {
    return {
      crear: false,
      status: 409,
      motivo: 'Su email casa con varias fichas de la cartera: vincúlala a mano a la ficha buena y activa desde ella (no se crea otra ficha).',
    }
  }
  if (e.vinculosPropios > 0) {
    return { crear: false, status: 409, motivo: 'Esta persona ya tiene una ficha vinculada: actívalo desde su ficha.' }
  }
  if (e.filaVigente === null) return { crear: false, status: 409, motivo: 'Esta persona no ha pedido ese módulo desde el portal (o ya se retiró).' }
  if (e.filaVigente === 'activo') return { crear: false, status: 409, motivo: 'Ese módulo ya está activado para esta persona.' }
  return { crear: true }
}

/**
 * La ficha de PROSPECTO (27/10/2026). Lead, segmento prospecto, fuente portal, activa y SIN póliza: no es cliente
 * (cliente = póliza en vigor de CIMA, `esCarteraEnVigor`; nunca `clientes.tipo`). El nombre es lo que la persona tecleó
 * al entrar al portal, SIN comprobar: la nota lo dice.
 */
export function fichaProspecto(nombreTecleado: string | null): {
  nombre: string
  apellidos: string
  tipo: 'lead'
  segmento: 'prospecto'
  fuente: 'portal'
  activo: true
  notas: string
} {
  const limpio = (nombreTecleado ?? '').replace(/\s+/g, ' ').trim().slice(0, 255)
  return {
    nombre: limpio === '' ? 'Prospecto del portal' : limpio,
    apellidos: '',
    tipo: 'lead',
    segmento: 'prospecto',
    fuente: 'portal',
    activo: true,
    notas:
      'Ficha de prospecto creada al autorizar un módulo del portal a una persona sin ficha. Sin póliza con nosotros: NO es cliente. ' +
      'El nombre es el que tecleó al entrar al portal, sin comprobar.',
  }
}

/** La línea de `historial_interno` (tipo `gestion`) que deja la creación de la ficha de prospecto. */
export function textoHistorialProspecto(modulo: ModuloPortal, actor: string): string {
  return `Ficha de prospecto creada al autorizar «${CATALOGO_MODULOS[modulo].nombre}» desde el portal, sin póliza con nosotros (${actor})`
}
