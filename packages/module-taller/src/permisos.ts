// Permisos por CAPACIDAD (07/11/2026, encargo de Alberto): lógica PURA, sin BD.
//
// Modelo:
//   · Cada persona tiene UNO O VARIOS roles (`usuarios_taller.roles`) y, si hace falta, capacidades sueltas extra
//     (`usuarios_taller.capacidades_extra`). En G2 (un solo mecánico) esa persona es mecánico + recepción.
//   · Cada taller decide qué capacidades lleva cada rol (`configuracion.capacidades_por_rol`, jsonb). NULL o rol ausente
//     = los valores por defecto de aquí (la decisión de Alberto del 04/11/2026). El dueño lo edita en Ajustes.
//   · El rol `dueno` lleva SIEMPRE todas las capacidades y no se edita: así nadie deja el taller sin quien entre en Ajustes.
//   · Hay capacidades RESERVADAS al dueño que no se pueden dar a otro rol ni como extra: gestionar Ajustes, gestionar
//     personas/roles (si no, quien la tuviera se haría dueño a sí mismo) y enviar pedidos a proveedores (regla del
//     monorepo: nada sale a terceros sin el botón del dueño).
//   · Nunca queda el taller sin un dueño activo (`errorUltimoDueno`).
//
// La comprobación de verdad es en SERVIDOR (apps/taller/lib/permisos.ts `exigir`, que re-lee roles y configuración en BD);
// la UI solo esconde botones.

export const ROLES_TALLER = ['dueno', 'admin', 'recepcion', 'mecanico'] as const
export type RolTaller = (typeof ROLES_TALLER)[number]
/** Roles cuyas capacidades edita el dueño (el dueño mismo no: lo tiene todo). */
export const ROLES_EDITABLES = ['admin', 'recepcion', 'mecanico'] as const
export type RolEditable = (typeof ROLES_EDITABLES)[number]

export const NOMBRE_ROL: Readonly<Record<RolTaller, string>> = {
  dueno: 'Dueño', admin: 'Administración', recepcion: 'Recepción', mecanico: 'Mecánico',
}

export const CAPACIDADES = [
  'recepcion', // recepcionar vehículos (alta de recepción, resguardo, ficha de cliente/vehículo)
  'ordenes_ver', // listar/ver OT (sin `ordenes_todas`: solo las abiertas, «mis OT»)
  'ordenes_todas', // ver TODAS las OT (también cerradas) y los partes de todos
  'ordenes_gestionar', // cambiar el estado de una OT a mano (cualquier transición)
  'ordenes_avanzar', // terminar y ENTREGAR (en_curso→terminado, terminado→entregado con la firma de retirada)
  'ot_trabajo', // notas, fotos y propuestas de ampliación en la OT
  'ampliaciones', // poner precio a una propuesta y mandarla al cliente; añadir recambios a la OT
  'partes', // fichar en la OT: abrir/cerrar SU parte de horas
  'presupuestos', // crear/enviar presupuestos
  'precios_ver', // precios de venta, totales, IVA
  'contacto_cliente_ver', // teléfono, correo, NIF del cliente
  'margenes_ver', // baremo vs horas reales y margen (panel)
  'citas', // agenda: invitar, aceptar/rechazar/mover, convertir en recepción
  'facturar', // emitir la factura de una OT terminada, ver facturas y cobrar
  'facturas_rectificar', // anular o rectificar una factura emitida
  'almacen', // artículos, inventario, pedidos en borrador y albaranes (con costes de compra)
  'pedidos_enviar', // marcar un pedido como enviado / generar el enlace al proveedor (RESERVADA)
  'ajustes', // Ajustes del taller: precios, IVA, textos, marca, código, horarios (RESERVADA)
  'usuarios', // personas, PIN, roles y capacidades por rol (RESERVADA)
] as const
export type Capacidad = (typeof CAPACIDADES)[number]

export const NOMBRE_CAPACIDAD: Readonly<Record<Capacidad, string>> = {
  recepcion: 'Recepcionar vehículos',
  ordenes_ver: 'Ver órdenes de trabajo (las abiertas)',
  ordenes_todas: 'Ver todas las órdenes y los partes de todos',
  ordenes_gestionar: 'Cambiar el estado de una orden a mano',
  ordenes_avanzar: 'Terminar y entregar el vehículo',
  ot_trabajo: 'Notas, fotos y propuestas en la orden',
  ampliaciones: 'Poner precio a ampliaciones y añadir recambios',
  partes: 'Fichar en la orden (parte de horas)',
  presupuestos: 'Presupuestos',
  precios_ver: 'Ver precios de venta',
  contacto_cliente_ver: 'Ver teléfono, correo y NIF del cliente',
  margenes_ver: 'Ver márgenes y panel',
  citas: 'Agenda y citas',
  facturar: 'Facturar y cobrar',
  facturas_rectificar: 'Anular o rectificar facturas',
  almacen: 'Stock, artículos, pedidos y albaranes',
  pedidos_enviar: 'Enviar pedidos al proveedor',
  ajustes: 'Ajustes del taller',
  usuarios: 'Personas, PIN y roles',
}

/** Solo el dueño, siempre. No se pueden dar a otro rol ni como capacidad extra. */
export const CAPACIDADES_RESERVADAS_DUENO: readonly Capacidad[] = ['pedidos_enviar', 'ajustes', 'usuarios']

export type CapacidadesPorRol = Readonly<Record<RolEditable, readonly Capacidad[]>>

/** Valores por defecto = matriz decidida por Alberto el 04/11/2026 (+ `ordenes_todas`, que antes era «no ser mecánico»). */
export const CAPACIDADES_POR_ROL_DEFECTO: CapacidadesPorRol = {
  admin: ['recepcion', 'ordenes_ver', 'ordenes_todas', 'ampliaciones', 'presupuestos', 'precios_ver', 'contacto_cliente_ver', 'citas', 'facturar', 'almacen'],
  recepcion: ['recepcion', 'ordenes_ver', 'ordenes_todas', 'ordenes_avanzar', 'ampliaciones', 'presupuestos', 'precios_ver', 'contacto_cliente_ver', 'citas', 'facturar'],
  mecanico: ['ordenes_ver', 'ot_trabajo', 'partes'],
}

const esCapacidad = (x: unknown): x is Capacidad => typeof x === 'string' && (CAPACIDADES as readonly string[]).includes(x)
const esRol = (x: unknown): x is RolTaller => typeof x === 'string' && (ROLES_TALLER as readonly string[]).includes(x)
const delegable = (c: Capacidad) => !CAPACIDADES_RESERVADAS_DUENO.includes(c)
/** Orden canónico (el de CAPACIDADES) y sin repetidos. */
const ordenar = (cs: Iterable<Capacidad>): Capacidad[] => {
  const s = new Set(cs)
  return CAPACIDADES.filter((c) => s.has(c))
}

export type ResultadoPermisos<T> = { ok: true; valor: T } | { ok: false; errores: string[] }

/**
 * Valida lo que el dueño guarda en Ajustes (y lo que hay en BD). Objeto { rol editable: [capacidades] }; roles que falten
 * = por defecto. Rechaza: no objeto, rol desconocido o `dueno`, capacidad desconocida, capacidad reservada al dueño.
 */
export function validarCapacidadesPorRol(x: unknown): ResultadoPermisos<Partial<Record<RolEditable, Capacidad[]>>> {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return { ok: false, errores: ['Formato de capacidades por rol inválido'] }
  const errores: string[] = []
  const valor: Partial<Record<RolEditable, Capacidad[]>> = {}
  for (const [rol, caps] of Object.entries(x as Record<string, unknown>)) {
    if (rol === 'dueno') { errores.push('El dueño tiene siempre todas las capacidades: no se edita'); continue }
    if (!(ROLES_EDITABLES as readonly string[]).includes(rol)) { errores.push(`Rol desconocido: ${rol}`); continue }
    if (!Array.isArray(caps)) { errores.push(`${rol}: lista de capacidades inválida`); continue }
    const malas = caps.filter((c) => !esCapacidad(c))
    if (malas.length) { errores.push(`${rol}: capacidad desconocida (${malas.map(String).join(', ')})`); continue }
    const reservadas = (caps as Capacidad[]).filter((c) => !delegable(c))
    if (reservadas.length) { errores.push(`${rol}: «${reservadas.map((c) => NOMBRE_CAPACIDAD[c]).join('», «')}» es solo del dueño`); continue }
    valor[rol as RolEditable] = ordenar(caps as Capacidad[])
  }
  return errores.length ? { ok: false, errores } : { ok: true, valor }
}

/**
 * Matriz EFECTIVA del taller a partir de lo guardado (NULL = todo por defecto). Tolerante con datos viejos: un rol mal
 * guardado vuelve a su valor por defecto; una capacidad desconocida o reservada se descarta (nunca suma permisos).
 */
export function capacidadesPorRolEfectivas(guardado: unknown): CapacidadesPorRol {
  const g = guardado !== null && typeof guardado === 'object' && !Array.isArray(guardado) ? (guardado as Record<string, unknown>) : {}
  const r = {} as Record<RolEditable, readonly Capacidad[]>
  for (const rol of ROLES_EDITABLES) {
    const v = g[rol]
    r[rol] = Array.isArray(v) ? ordenar(v.filter(esCapacidad).filter(delegable)) : CAPACIDADES_POR_ROL_DEFECTO[rol]
  }
  return r
}

/** Normaliza los roles de una persona: solo roles conocidos, sin repetidos, en orden canónico. Vacío = error. */
export function validarRoles(x: unknown): ResultadoPermisos<RolTaller[]> {
  if (!Array.isArray(x)) return { ok: false, errores: ['Roles inválidos'] }
  const malos = x.filter((r) => !esRol(r))
  if (malos.length) return { ok: false, errores: [`Rol desconocido: ${malos.map(String).join(', ')}`] }
  const s = new Set(x as RolTaller[])
  const roles = ROLES_TALLER.filter((r) => s.has(r))
  if (!roles.length) return { ok: false, errores: ['Cada persona necesita al menos un rol'] }
  return { ok: true, valor: roles }
}

/** Capacidades extra de una persona: conocidas, sin repetidos, nunca reservadas al dueño. */
export function validarCapacidadesExtra(x: unknown): ResultadoPermisos<Capacidad[]> {
  if (!Array.isArray(x)) return { ok: false, errores: ['Capacidades extra inválidas'] }
  const malas = x.filter((c) => !esCapacidad(c))
  if (malas.length) return { ok: false, errores: [`Capacidad desconocida: ${malas.map(String).join(', ')}`] }
  const reservadas = (x as Capacidad[]).filter((c) => !delegable(c))
  if (reservadas.length) return { ok: false, errores: [`«${reservadas.map((c) => NOMBRE_CAPACIDAD[c]).join('», «')}» es solo del dueño: dale el rol Dueño`] }
  return { ok: true, valor: ordenar(x as Capacidad[]) }
}

/**
 * Rol «principal» (columna `usuarios_taller.rol`, que se conserva por compatibilidad y para el login): el de más alcance.
 * Orden dueño > admin > recepción > mecánico. Sin roles válidos → null (el llamante no escribe).
 */
export function rolPrincipal(roles: readonly string[]): RolTaller | null {
  return ROLES_TALLER.find((r) => roles.includes(r)) ?? null
}

/**
 * Roles de una fila de BD. `roles` vacío/ausente (fila anterior a 0014 o código viejo) → `[rol]`. Lo desconocido se ignora.
 */
export function rolesDeFila(f: { rol?: unknown; roles?: unknown }): RolTaller[] {
  const lista = Array.isArray(f.roles) && f.roles.length ? f.roles : [f.rol]
  return ROLES_TALLER.filter((r) => lista.includes(r))
}

export type PersonaPermisos = { roles: readonly string[]; capacidadesExtra?: readonly string[] | null }

/** Capacidades EFECTIVAS de una persona en un taller: unión de sus roles (según la config del taller) + sus extras. */
export function capacidadesDe(p: PersonaPermisos, guardado: unknown): ReadonlySet<Capacidad> {
  if (p.roles.includes('dueno')) return new Set(CAPACIDADES)
  const m = capacidadesPorRolEfectivas(guardado)
  const s = new Set<Capacidad>()
  for (const r of p.roles) if ((ROLES_EDITABLES as readonly string[]).includes(r)) for (const c of m[r as RolEditable]) s.add(c)
  for (const c of p.capacidadesExtra ?? []) if (esCapacidad(c) && delegable(c)) s.add(c)
  return s
}

export const tieneCapacidad = (p: PersonaPermisos, cap: Capacidad, guardado: unknown = null): boolean => capacidadesDe(p, guardado).has(cap)

/**
 * ¿El cambio deja el taller sin ningún dueño activo? `duenosActivos` = ids de los dueños activos ANTES del cambio.
 * Devuelve el mensaje de error o null. Sirve para quitar el rol, dar de baja, o ambas cosas.
 */
export function errorUltimoDueno(o: {
  duenosActivos: readonly string[]; usuarioId: string; rolesNuevos: readonly string[]; activoNuevo: boolean
}): string | null {
  const sigueDueno = o.activoNuevo && o.rolesNuevos.includes('dueno')
  const quedan = o.duenosActivos.filter((id) => id !== o.usuarioId).length + (sigueDueno ? 1 : 0)
  return quedan === 0 ? 'El taller necesita al menos un dueño activo: dale antes el rol Dueño a otra persona' : null
}
