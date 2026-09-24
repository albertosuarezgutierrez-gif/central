/**
 * Las pestañas de la ficha del cliente, sin JSX.
 *
 * Vive aparte de `FichaTabs.tsx` para que `tabDeParametro` sea comprobable con
 * `node --test`, que no sabe importar `.tsx`. Es la función que impide que un
 * `?tab=` inventado (o un enlace viejo) deje la ficha en blanco.
 */

export type TabFicha = 'resumen' | 'polizas' | 'recibos' | 'siniestros' | 'contactos' | 'documentos' | 'historial'

export const TABS_FICHA: readonly TabFicha[] = [
  'resumen', 'polizas', 'recibos', 'siniestros', 'contactos', 'documentos', 'historial',
]

/** Un `?tab=` desconocido (o ausente) no falla: cae a «Resumen». */
export function tabDeParametro(v: string | string[] | undefined): TabFicha {
  const t = Array.isArray(v) ? v[0] : v
  return TABS_FICHA.includes(t as TabFicha) ? (t as TabFicha) : 'resumen'
}
