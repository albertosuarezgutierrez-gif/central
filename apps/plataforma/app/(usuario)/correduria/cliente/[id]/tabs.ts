/**
 * Las pestañas de la ficha del cliente, sin JSX.
 *
 * Vive aparte de `FichaTabs.tsx` para que `tabDeParametro` sea comprobable con
 * `node --test`, que no sabe importar `.tsx`. Es la función que impide que un
 * `?tab=` inventado (o un enlace viejo) deje la ficha en blanco.
 */

export type TabFicha =
  | 'resumen' | 'oportunidades' | 'pendiente' | 'polizas' | 'contactos' | 'mensajes' | 'documentos' | 'correos' | 'notas' | 'historial'

/**
 * Desde el 24/09/2026 no son pestañas sino ACCESOS directos (Alberto: «tiene que ser todo
 * accesos directos»): «resumen» es la ficha con los seguros en tres cubos, y cada acceso
 * carga su sección debajo.
 */
export const TABS_FICHA: readonly TabFicha[] = [
  'resumen', 'oportunidades', 'pendiente', 'polizas', 'contactos', 'mensajes', 'documentos', 'correos', 'notas', 'historial',
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
