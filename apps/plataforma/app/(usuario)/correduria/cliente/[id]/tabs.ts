/**
 * Las pestañas de la ficha del cliente, sin JSX.
 *
 * Vive aparte de `FichaTabs.tsx` para que `tabDeParametro` sea comprobable con
 * `node --test`, que no sabe importar `.tsx`. Es la función que impide que un
 * `?tab=` inventado (o un enlace viejo) deje la ficha en blanco.
 */

export type TabFicha =
  | 'resumen' | 'oportunidades' | 'pendiente' | 'polizas' | 'contactos' | 'documentos' | 'correos' | 'notas' | 'historial'

/**
 * Desde el 24/09/2026 no son pestañas sino ACCESOS directos (Alberto: «tiene que ser todo
 * accesos directos»): «resumen» es la ficha con los seguros en tres cubos, y cada acceso
 * carga su sección debajo.
 */
export const TABS_FICHA: readonly TabFicha[] = [
  'resumen', 'oportunidades', 'pendiente', 'polizas', 'contactos', 'documentos', 'correos', 'notas', 'historial',
]

/**
 * Recibos y Siniestros dejaron de ser pestañas el 24/09/2026 (Alberto: «dentro de las pólizas
 * está recibos, siniestros…»): viven en cada póliza y en la pestaña Pólizas. Un enlace viejo
 * con `?tab=recibos|siniestros` lleva a Pólizas, que es donde están ahora, no a Resumen.
 */
const HEREDADAS: Record<string, TabFicha> = { recibos: 'polizas', siniestros: 'polizas' }

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
  /** `siguienteAccion`: `accion` (con urgencia), `nada` o `sin_comprobar`. */
  pendiente: { estado: 'accion'; urgente: boolean } | { estado: 'nada' } | { estado: 'sin_comprobar' }
  polizas: number
  telefonos: number | null
  emails: number | null
  personas: number | null
  documentos: number | null
  documentosPedidos: number | null
  correos: number | null
  notas: number | null
  historial: number | null
}

export type DetalleAcceso = { texto: string; tono?: 'bien' | 'aviso' | 'malo' }

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

/** El texto corto bajo cada baldosa. Pura: la prueba `regression-ficha-cliente-pestanas`. */
export function detallesAccesos(d: DatosAccesos): Partial<Record<TabFicha, DetalleAcceso>> {
  const r: Partial<Record<TabFicha, DetalleAcceso>> = {}
  r.resumen = { texto: d.conNosotros === 0 ? 'ninguno con nosotros' : `${d.conNosotros} con nosotros` }
  if (d.oportunidadesAbiertas !== null) {
    r.oportunidades = { texto: d.oportunidadesAbiertas === 0 ? 'ninguna abierta' : plural(d.oportunidadesAbiertas, 'abierta', 'abiertas') }
  }
  if (d.pendiente.estado === 'accion') r.pendiente = d.pendiente.urgente ? { texto: 'urgente', tono: 'malo' } : { texto: 'hay algo que hacer', tono: 'aviso' }
  else if (d.pendiente.estado === 'nada') r.pendiente = { texto: 'al día' }
  r.polizas = { texto: d.polizas === 0 ? 'ninguna' : `${d.polizas} en total` }

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
  if (d.notas !== null) r.notas = { texto: d.notas === 0 ? 'ninguna' : plural(d.notas, 'nota', 'notas') }
  if (d.historial !== null) r.historial = { texto: d.historial === 0 ? 'sin anotaciones' : plural(d.historial, 'anotación', 'anotaciones') }
  return r
}
