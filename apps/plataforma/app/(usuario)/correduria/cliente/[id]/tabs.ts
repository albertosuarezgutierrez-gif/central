/**
 * Las pestañas de la ficha del cliente, sin JSX.
 *
 * Vive aparte de `FichaTabs.tsx` para que `tabDeParametro` sea comprobable con
 * `node --test`, que no sabe importar `.tsx`. Es la función que impide que un
 * `?tab=` inventado (o un enlace viejo) deje la ficha en blanco.
 */

export type TabFicha =
  | 'resumen' | 'pendiente' | 'oportunidades' | 'contactos' | 'documentos' | 'correos' | 'notas' | 'historial'

/**
 * Desde el 24/09/2026 no son pestañas sino ACCESOS directos (Alberto: «tiene que ser todo
 * accesos directos»): «resumen» es la ficha con los seguros en tres cubos, y cada acceso
 * carga su sección debajo.
 */
export const TABS_FICHA: readonly TabFicha[] = [
  // Primero lo de trabajo, luego lo de consulta (18/10/2026).
  'resumen', 'pendiente', 'oportunidades', 'contactos', 'documentos', 'correos', 'notas', 'historial',
]

/**
 * Recibos y Siniestros dejaron de ser pestañas el 24/09/2026 (Alberto: «dentro de las pólizas
 * está recibos, siniestros…»): viven en cada póliza y en la pestaña Pólizas. Un enlace viejo
 * con `?tab=recibos|siniestros` lleva a Pólizas, que es donde están ahora, no a Resumen.
 *
 * (18/10/2026) «Todas las pólizas» se FUSIONÓ con «Sus seguros» en la tarjeta «Seguros» (Alberto
 * veía redundancia: ambas contaban lo mismo). Ya no hay `?tab=polizas`, pero el enlace viejo sigue
 * vivo y aterriza en la vista de seguros (`resumen`), que lleva ahora las pólizas, el histórico y los
 * siniestros.
 *
 * (18/10/2026) «Tareas» se FUSIONÓ con «Pendiente» (una sola tarjeta: arriba la acción sugerida y las
 * peticiones, debajo las tareas guardadas). `?tab=tareas` sigue vivo y aterriza en `pendiente`.
 */
const HEREDADAS: Record<string, TabFicha> = { recibos: 'resumen', siniestros: 'resumen', polizas: 'resumen', tareas: 'pendiente' }

/** Un `?tab=` desconocido (o ausente) no falla: cae a «Resumen». */
export function tabDeParametro(v: string | string[] | undefined): TabFicha {
  const t = Array.isArray(v) ? v[0] : v
  // `Object.hasOwn`, no `HEREDADAS[t]`: con `?tab=constructor` el objeto devolvería lo heredado de Object.
  if (t && Object.hasOwn(HEREDADAS, t)) return HEREDADAS[t]
  return TABS_FICHA.includes(t as TabFicha) ? (t as TabFicha) : 'resumen'
}

// ─── Lo que dice cada acceso (28/09/2026) ────────────────────────────────────
//
// Alberto: «en los cuadrados debería aparecer información… en contactos este
// cliente tiene varios». Hasta ahora solo se pintaba un número cuando era > 0, y
// Contactos contaba únicamente a las PERSONAS de sus pólizas: un cliente con dos
// teléfonos y un correo salía con la baldosa en blanco.
//
// Tres estados, como en toda la ficha: `null` = no se ha podido leer → no se
// pinta nada (jamás «0»); `0` leído → se dice que no hay; `n` → el dato.

export type DatosAccesos = {
  conNosotros: number
  oportunidadesAbiertas: number | null
  /**
   * Subtítulo ya hecho de la tarjeta «Oportunidades» (`subtituloOportunidades`: «N abiertas · ~X€/año»).
   * Ausente o `null` = el de siempre, solo con el número.
   */
  oportunidadesTexto?: string | null
  /** `siguienteAccion`: `accion` (con urgencia), `nada` o `sin_comprobar`. */
  pendiente: { estado: 'accion'; urgente: boolean } | { estado: 'nada' } | { estado: 'sin_comprobar' }
  /** Tareas (del cliente y de sus pólizas): `contarTareasAbiertas`; `null`/ausente = no se pudieron leer (no es «0»). */
  tareas?: { abiertas: number; truncado: boolean } | null
  telefonos: number | null
  emails: number | null
  personas: number | null
  documentos: number | null
  documentosPedidos: number | null
  correos: number | null
  notas: number | null
  historial: number | null
}

export type DetalleAcceso = {
  texto: string
  tono?: 'bien' | 'aviso' | 'malo'
  /** Vacío CONFIRMADO (dato leído = 0) que se pinta atenuado: sigue siendo pulsable. */
  tenue?: boolean
  /** Vacío CONFIRMADO que no merece sitio en el grid. Nunca por `null` (no se pudo leer). */
  oculto?: boolean
}

/**
 * Subtítulo de la tarjeta fusionada «Pendiente»: lo sugerido + las tareas guardadas. Tres estados por
 * parte: sin comprobar / sin leer → no se afirma nada de esa parte; 0 leído → se dice; n → el dato.
 */
export function detallePendiente(p: DatosAccesos['pendiente'], tareas: DatosAccesos['tareas']): DetalleAcceso | undefined {
  const partes: string[] = []
  let tono: DetalleAcceso['tono']
  if (p.estado === 'accion') {
    partes.push(p.urgente ? 'urgente' : 'hay algo que hacer')
    tono = p.urgente ? 'malo' : 'aviso'
  }
  const n = tareas ? tareas.abiertas : null
  if (n !== null && n > 0) {
    partes.push(`${n}${tareas?.truncado ? '+' : ''} ${n === 1 ? 'tarea' : 'tareas'}`)
    tono ??= 'aviso'
  } else if (n === 0 && tareas?.truncado) {
    partes.push('hay más tareas de las que se ven')
    tono ??= 'aviso'
  }
  if (p.estado === 'nada' && partes.length === 0) {
    // «Al día» solo si las tareas también se leyeron; si no, no se afirma.
    return { texto: tareas ? 'al día' : 'al día · tareas sin leer' }
  }
  return partes.length > 0 ? { texto: partes.join(' · '), tono } : undefined
}

/**
 * Cuántas PERSONAS tiene la ficha: las de sus pólizas más los vínculos
 * declarados (familia, empresa…) que no salen ya en una póliza — la misma
 * lista que pinta el bloque «Personas» de Contactos. Hasta el 28/09/2026 solo
 * se contaban las de pólizas, y Antonio Lozano, con 3 vínculos y ninguna
 * persona en su póliza, salía sin ninguna. Si alguna de las dos listas no se
 * pudo leer, `null`: contar solo la otra se quedaría corto sin avisar.
 */
export function contarPersonas(
  personas: readonly { fichaId: string | null }[] | null,
  relaciones: readonly { relacionadoId: string }[] | null,
): number | null {
  if (personas === null || relaciones === null) return null
  const fichas = new Set(personas.map(p => p.fichaId).filter((x): x is string => x !== null))
  const extra = new Set(relaciones.map(r => r.relacionadoId).filter(id => !fichas.has(id)))
  return personas.length + extra.size
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Subtítulo de la tarjeta «Seguros»: «N con nosotros · M oportunidades». La parte de oportunidades se
 * omite si M = 0 o no se pudo leer (`null`: no se inventa un número); sin nada de ambos, «ninguno».
 */
export function textoSeguros(conNosotros: number, oportunidades: number | null): string {
  const opo = oportunidades !== null && oportunidades > 0 ? plural(oportunidades, 'oportunidad', 'oportunidades') : null
  if (conNosotros === 0) return opo ? `ninguno con nosotros · ${opo}` : 'ninguno'
  return opo ? `${conNosotros} con nosotros · ${opo}` : `${conNosotros} con nosotros`
}

/** El texto corto bajo cada baldosa. Pura: la prueba `regression-ficha-cliente-pestanas`. */
export function detallesAccesos(d: DatosAccesos): Partial<Record<TabFicha, DetalleAcceso>> {
  const r: Partial<Record<TabFicha, DetalleAcceso>> = {}
  r.resumen = { texto: textoSeguros(d.conNosotros, d.oportunidadesAbiertas) }
  if (d.oportunidadesAbiertas !== null) {
    r.oportunidades = { texto: d.oportunidadesAbiertas === 0 ? 'ninguna abierta' : d.oportunidadesTexto ?? plural(d.oportunidadesAbiertas, 'abierta', 'abiertas') }
  }
  const pend = detallePendiente(d.pendiente, d.tareas)
  if (pend) r.pendiente = pend

  // Contactos: teléfonos, correos y personas. Lo que no se pudo leer se OMITE,
  // no se cuenta como cero.
  const partes = [
    d.telefonos !== null && d.telefonos > 0 ? plural(d.telefonos, 'teléfono', 'teléfonos') : null,
    d.emails !== null && d.emails > 0 ? plural(d.emails, 'correo', 'correos') : null,
    d.personas !== null && d.personas > 0 ? plural(d.personas, 'persona', 'personas') : null,
  ].filter((x): x is string => x !== null)
  if (partes.length > 0) r.contactos = { texto: partes.join(' · ') }
  else if (d.telefonos === 0 && d.emails === 0) r.contactos = { texto: 'sin teléfono ni correo', tono: 'aviso' }

  if (d.documentosPedidos !== null && d.documentosPedidos > 0) r.documentos = { texto: plural(d.documentosPedidos, 'pedido', 'pedidos'), tono: 'aviso' }
  else if (d.documentos !== null) r.documentos = { texto: d.documentos === 0 ? 'ninguno' : plural(d.documentos, 'documento', 'documentos') }
  if (d.correos !== null) r.correos = { texto: d.correos === 0 ? 'ninguno enviado' : plural(d.correos, 'enviado', 'enviados') }
  // Notas a 0 NO se oculta (desde ahí se crea la primera): se atenúa. Historial a 0 es solo lectura
  // y no tiene nada que hacer: se oculta. Ambos SOLO con el 0 leído; `null` deja la tarjeta normal.
  if (d.notas !== null) r.notas = d.notas === 0 ? { texto: 'ninguna', tenue: true } : { texto: plural(d.notas, 'nota', 'notas') }
  if (d.historial !== null) r.historial = d.historial === 0 ? { texto: 'sin anotaciones', tenue: true, oculto: true } : { texto: plural(d.historial, 'anotación', 'anotaciones') }
  return r
}

/** Qué accesos se pintan: los vacíos confirmados `oculto` se van, salvo el que está abierto. */
export function accesosVisibles(detalles: Partial<Record<TabFicha, DetalleAcceso>>, activa: TabFicha): TabFicha[] {
  return TABS_FICHA.filter(k => k === activa || !detalles[k]?.oculto)
}
