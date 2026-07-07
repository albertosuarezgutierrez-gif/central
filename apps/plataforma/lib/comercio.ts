// apps/plataforma/lib/comercio.ts
// "Comercio" mostrado en el drill-down de gasto personal. Muchos movimientos traen el nombre del
// comercio en el CONCEPTO ("COMPRA EN OSORNITO") con `contraparte` vacía; si se agrupa solo por
// contraparte, todos colapsan en un único pseudo-comercio "Sin identificar". Aquí se deriva el
// comercio real reutilizando `claveComercio` (extrae "OSORNITO"/"NETFLIX"/… del concepto). Módulo
// puro para que lo compartan el agrupado (getMerchantsForCategoria) y el casado (movimientos/asignar).
import { claveComercio } from './correduria.ts'

export const SIN_IDENTIFICAR = 'Sin identificar'

// Etiqueta de comercio de un movimiento: contraparte si la hay; si no, el token del concepto; si no,
// 'Sin identificar' (queda como cubo solo para los verdaderamente irreconocibles).
export function comercioDe(contraparte: string | null, concepto: string | null): string {
  const cp = (contraparte ?? '').trim()
  if (cp) return cp
  return claveComercio(concepto) ?? SIN_IDENTIFICAR
}
