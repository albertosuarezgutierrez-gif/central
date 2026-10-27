// «Herramientas» del portal (Fase 0, 22/10/2026): el catálogo CERRADO de módulos que Grupo ASegura
// ofrece gratis a sus clientes, y qué botón enseña cada tarjeta. Lógica pura, sin BD ni red.
// Hoja de ruta y riesgos: `docs/ASEGURA-PORTAL-MODULOS.md`.
//
// 🚨 La lista `MODULOS_PORTAL` es la MISMA que el CHECK de `seguros.portal_modulo.modulo`
// (`apps/asegura-portal/prisma/sql/2026-10-22_portal_modulos.sql`). Añadir un módulo aquí sin
// ampliar el CHECK hace que «Solicitar» reviente en la BD; el test lo vigila leyendo el SQL.
//
// 🚨 Tres estados también aquí: `null` = «no se ha podido mirar» (la lectura falló), NUNCA «no tiene».
// Una tarjeta sin comprobar no ofrece «Solicitar» (podría estar ya pedido o activo) ni «Abrir».

export const MODULOS_PORTAL = ['flota', 'rrhh', 'alquileres'] as const
export type ModuloPortal = (typeof MODULOS_PORTAL)[number]

export const ESTADOS_MODULO = ['solicitado', 'activo', 'retirado'] as const
export type EstadoModulo = (typeof ESTADOS_MODULO)[number]

export type DisponibilidadModulo = 'disponible' | 'bajo_solicitud' | 'proximamente'

/**
 * Versión del texto que la persona ve al pulsar «Solicitar»/«Apuntarme» (`TEXTO_SOLICITUD_MODULO`).
 * Se sella en `portal_modulo.version_condiciones`. Sube con cada cambio del texto: las filas viejas
 * conservan la versión que aceptaron (no se reescriben).
 */
export const VERSION_CONDICIONES_MODULOS = '2026-10-22'

export const TEXTO_SOLICITUD_MODULO =
  'Al pedirlo, avisamos a tu corredor de Grupo ASegura para que se ponga en contacto contigo y te lo active. ' +
  'Es gratis para nuestros clientes y no te compromete a nada. No se activa solo: lo activamos a mano.'

export const TEXTO_ACTIVO_SIN_ACCESO_PATRIMONIO =
  'Activado, pero aún no se abre: tienes que entrar con el email que consta en tu ficha de cliente de Grupo ASegura ' +
  'y esa ficha tiene que estar activa. Si has cambiado de email, avísanos.'

export type FichaModulo = {
  id: ModuloPortal
  nombre: string
  /** El rótulo pequeño sobre el nombre en la tarjeta (27/10/2026): sale de AQUÍ, no de un `if (id === …)` en la pantalla. */
  antetitulo: string
  descripcion: string
  /** Con qué seguros tiene que ver (texto para la tarjeta, no una regla). */
  seguros: string
  /** Dónde se abre DENTRO del portal, o `null` si no se abre aquí. */
  hrefPortal: string | null
  /** Qué dice la tarjeta cuando el corredor ya lo ha activado y no se abre en el portal. */
  textoActivo: string
}

export const CATALOGO_MODULOS: Record<ModuloPortal, FichaModulo> = {
  flota: {
    id: 'flota',
    nombre: 'Flota de vehículos',
    antetitulo: 'Empresa',
    descripcion:
      'Los vehículos de tu empresa en una lista: seguro de cada uno, cuándo vence y cuándo le toca la ITV. ' +
      'Puedes nombrar a un jefe de flota que los lleve sin ver el resto de seguros de la sociedad.',
    seguros: 'Seguros de automóvil y de flota de la empresa.',
    hrefPortal: '/flota',
    textoActivo: 'Activada. Si no ves tu empresa en «Flota», escríbenos: puede que no conste que eres el dueño.',
  },
  rrhh: {
    id: 'rrhh',
    nombre: 'Portal del Empleado',
    antetitulo: 'Para tu plantilla',
    descripcion:
      'Fichaje, vacaciones, nóminas y documentos para tu plantilla, cada empleado con su acceso.',
    seguros: 'Accidentes de convenio, responsabilidad civil y salud de los empleados.',
    hrefPortal: null,
    textoActivo: 'Activado. Se usa en el Portal del Empleado, con el acceso que te hemos enviado.',
  },
  // 24/10/2026 (Alberto): «Gestión de alquileres» y Patrimonio son LA MISMA herramienta. El id `alquileres` se
  // conserva (es el CHECK de `portal_modulo.modulo` y las filas ya pedidas siguen valiendo); cambia lo que dice y a
  // dónde lleva. Fase 1: solo para clientes con ficha (el acceso lo da `accesosPatrimonio`, no esta tarjeta).
  alquileres: {
    id: 'alquileres',
    nombre: 'Patrimonio y alquileres',
    antetitulo: 'Inmuebles',
    descripcion:
      'Tus pisos y locales en un sitio: gastos, contratos e inquilinos, sus documentos y qué seguro tiene cada uno.',
    seguros: 'Hogar del propietario, comunidad, impago de alquiler y el seguro del inquilino.',
    hrefPortal: '/patrimonio',
    textoActivo: 'Activado. Si no ves tus inmuebles en «Patrimonio», escríbenos.',
  },
}

/** ¿Es un id del catálogo? Para validar lo que llega del navegador. */
export function esModuloPortal(v: unknown): v is ModuloPortal {
  return typeof v === 'string' && (MODULOS_PORTAL as readonly string[]).includes(v)
}

/**
 * Disponibilidad de un módulo para ESTA persona.
 * - Flota: `disponible` si ya lleva la flota de alguna sociedad (dueño o jefe), `bajo_solicitud` si
 *   no, y `null` si no se ha podido comprobar (no se adivina).
 * - RRHH: `bajo_solicitud` (se da de alta a mano, por operador, en apps/rrhh; no hay SSO).
 * - Patrimonio y alquileres (24/10/2026): `disponible` si `accesosPatrimonio` no está vacío (fase 1: clientes
 *   con ficha), `bajo_solicitud` si no, y `null` si no se ha podido comprobar. Ya no es «próximamente».
 */
export function disponibilidadModulo(id: ModuloPortal, ctx: ContextoModulos): DisponibilidadModulo | null {
  switch (id) {
    case 'flota':
      if (ctx.accesoFlota === null) return null
      return ctx.accesoFlota ? 'disponible' : 'bajo_solicitud'
    case 'rrhh':
      return 'bajo_solicitud'
    case 'alquileres':
      if (ctx.accesoPatrimonio === null) return null
      return ctx.accesoPatrimonio ? 'disponible' : 'bajo_solicitud'
  }
}

/** Lo que se sabe de ESTA persona para decidir cada tarjeta. `null` = no se ha podido comprobar (nunca «no tiene»). */
export type ContextoModulos = { accesoFlota: boolean | null; accesoPatrimonio: boolean | null }

export type FilaModulo = { modulo: string; estado: string; solicitadoEn: Date }

/**
 * Patrimonio y alquileres: ¿esta identidad puede usar `/patrimonio`? UNA sola función para el acceso (lib/patrimonio/accesos.ts),
 * el menú y la tarjeta de `/herramientas`/`/inicio` (25/10/2026). Se suma a la regla de fase 1 (póliza viva = `titulares > 0`,
 * que sigue mandando): sin titulares, nunca.
 *  - Fila `activo` de `portal_modulo` ('alquileres') → abre.
 *  - Fila solo `retirado` → CIERRA (retirar tiene que cerrar), aunque haya inmuebles.
 *  - Sin fila vigente (ninguna, o solo `solicitado`) → solo si YA tiene inmuebles creados (pilotos previos al módulo:
 *    no se quita a nadie lo que tenía); sin inmuebles, necesita el módulo activo.
 *  - `filas`/`tieneInmuebles` `null` (la lectura falló) → fail-closed salvo fila activa legible: nunca se inventa acceso.
 */
export function accesoPatrimonioPorModulo(c: {
  titulares: number
  filas: readonly { modulo: string; estado: string }[] | null
  tieneInmuebles: boolean | null
}): boolean {
  if (c.titulares <= 0) return false
  if (c.filas === null) return false
  const mias = c.filas.filter((f) => f.modulo === 'alquileres')
  if (mias.some((f) => f.estado === 'activo')) return true
  if (mias.some((f) => f.estado === 'retirado') && !mias.some((f) => f.estado === 'solicitado')) return false
  return c.tieneInmuebles === true
}

export type AccionModulo =
  | { tipo: 'abrir'; href: string }
  | { tipo: 'solicitar' }
  | { tipo: 'apuntarse' }
  | { tipo: 'solicitado'; desde: Date }
  | { tipo: 'activo'; texto: string }
  /** La lectura falló: no se ofrece ni pedir ni abrir. La pantalla lo dice. */
  | { tipo: 'sin_comprobar' }

export type TarjetaModulo = FichaModulo & {
  disponibilidad: DisponibilidadModulo | null
  accion: AccionModulo
}

/**
 * La fila VIGENTE de un módulo: la no retirada (el índice único parcial de la BD garantiza que hay
 * como mucho una). Una retirada no cuenta: se puede volver a pedir.
 */
function filaVigente(filas: readonly FilaModulo[], id: ModuloPortal): FilaModulo | null {
  return filas.find((f) => f.modulo === id && f.estado !== 'retirado') ?? null
}

export function accionModulo(
  id: ModuloPortal,
  ctx: ContextoModulos & { filas: readonly FilaModulo[] | null },
): AccionModulo {
  const ficha = CATALOGO_MODULOS[id]
  const disp = disponibilidadModulo(id, ctx)
  // Lo que ya se puede usar en el portal se abre, haya o no fila: el acceso lo da otra cosa (flota, patrimonio).
  if (disp === 'disponible' && ficha.hrefPortal !== null) return { tipo: 'abrir', href: ficha.hrefPortal }
  if (disp === null || ctx.filas === null) return { tipo: 'sin_comprobar' }
  const fila = filaVigente(ctx.filas, id)
  // Activado por el corredor pero sin acceso real (p. ej. sin póliza viva): no se manda a una pantalla vacía.
  if (fila?.estado === 'activo' && id === 'alquileres') return { tipo: 'activo', texto: TEXTO_ACTIVO_SIN_ACCESO_PATRIMONIO }
  if (fila?.estado === 'activo') {
    return ficha.hrefPortal !== null ? { tipo: 'abrir', href: ficha.hrefPortal } : { tipo: 'activo', texto: ficha.textoActivo }
  }
  if (fila?.estado === 'solicitado') return { tipo: 'solicitado', desde: fila.solicitadoEn }
  return disp === 'proximamente' ? { tipo: 'apuntarse' } : { tipo: 'solicitar' }
}

/** Las tarjetas de `/herramientas`, en el orden del catálogo. */
export function tarjetasModulos(ctx: ContextoModulos & { filas: readonly FilaModulo[] | null }): TarjetaModulo[] {
  return MODULOS_PORTAL.map((id) => ({
    ...CATALOGO_MODULOS[id],
    disponibilidad: disponibilidadModulo(id, ctx),
    accion: accionModulo(id, ctx),
  }))
}

/** ¿La acción de la tarjeta permite escribir una fila `solicitado`? Lo usa la ruta, no solo el botón. */
export function admiteSolicitud(a: AccionModulo): boolean {
  return a.tipo === 'solicitar' || a.tipo === 'apuntarse'
}

/**
 * El aviso de Telegram a Alberto (HTML de Telegram: el nombre lo tecleó la persona, se escapa).
 * `vinculada=false` = el nombre no lo ha comprobado nadie (no hay ficha de la cartera detrás).
 */
export function mensajeSolicitudModulo(c: {
  identidadId: string
  nombre: string | null
  vinculada: boolean
  modulo: ModuloPortal
}): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const nombre = c.nombre?.trim() ? esc(c.nombre.trim()) : 'Alguien sin nombre'
  const quien = c.vinculada ? nombre : `${nombre} (sin vincular a tu cartera)`
  const verbo = disponibilidadModulo(c.modulo, { accesoFlota: false, accesoPatrimonio: false }) === 'proximamente' ? 'se apunta al' : 'pide el'
  return `🧰 ${quien} ${verbo} módulo ${esc(CATALOGO_MODULOS[c.modulo].nombre)}.\nIdentidad ${c.identidadId}`
}
