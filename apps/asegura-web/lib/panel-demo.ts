// Los datos y las cuentas del panel de la portada, fuera del componente para
// que se puedan comprobar.
//
// ── Por qué se sacó de `PanelDemo.tsx` (07/09/2026) ─────────────────────────
//
// Porque tenía un fallo que solo se ve leyendo el código: la baldosa decía
// «Próximo» y el valor era `activas[0]?.vence` — la PRIMERA fila del array, no
// la que vence antes. Con las filas en el orden en que estaban escritas, el
// panel llegó a enseñar «Próximo: 12 mar» teniendo «15 ene» encendida.
//
// En un mock de portada eso parece inofensivo, y no lo es por dos razones:
// alguien lo lee como su situación (por eso la ventana lleva su insignia
// «Ejemplo»), y esta misma cuenta se va a pintar en la bóveda REAL del portal,
// donde el error deja de ser cosmético. La versión buena de la cuenta vive en
// `resumirCartera()` de `@central/module-seguros-portal`; esta es su gemela de
// escaparate, con la misma regla: **el mínimo FUTURO, no el primero de la
// lista**.
//
// 🚨 Nada de lo que hay aquí es un dato de nadie: son cinco pólizas inventadas.
// Las compañías sí son las que de verdad hay en cartera, que es lo que hace el
// ejemplo reconocible.

export type FilaDemo = {
  slug: string
  ramo: string
  compania: string
  /** Día y mes del vencimiento, sin año: el ejemplo se repite cada año. */
  dia: number
  /** 1 = enero. */
  mes: number
  prima: number
}

export const FILAS: readonly FilaDemo[] = [
  { slug: 'hogar', ramo: 'Hogar', compania: 'Mapfre', dia: 12, mes: 3, prima: 312 },
  { slug: 'auto', ramo: 'Auto', compania: 'Allianz', dia: 4, mes: 6, prima: 468 },
  { slug: 'vida-y-salud', ramo: 'Salud', compania: 'Occident', dia: 28, mes: 9, prima: 690 },
  { slug: 'comunidades', ramo: 'Comunidad', compania: 'Mapfre', dia: 15, mes: 1, prima: 1140 },
  { slug: 'comercio', ramo: 'Comercio', compania: 'Reale', dia: 2, mes: 11, prima: 540 },
] as const

/** Las tres que entran solas en el guion. Las otras dos las enciende quien mire. */
export const GUION = ['hogar', 'auto', 'vida-y-salud'] as const

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «12 mar». Sale de `dia`/`mes`, así que la etiqueta y la cuenta no pueden separarse. */
export const etiquetaVence = (f: FilaDemo) =>
  `${String(f.dia).padStart(2, '0')} ${MESES[f.mes - 1]}`

/**
 * La fila que vence ANTES a partir de `hoy`, contando que el ejemplo se repite
 * cada año: una fecha que este año ya pasó cuenta como la del año que viene.
 *
 * `null` con la lista vacía — no `'—'`: quién pinta el guion es de la vista.
 */
export function proximaEnVencer(filas: readonly FilaDemo[], hoy: Date): FilaDemo | null {
  let mejor: FilaDemo | null = null
  let mejorDistancia = Number.POSITIVE_INFINITY
  for (const f of filas) {
    const esteAnio = Date.UTC(hoy.getUTCFullYear(), f.mes - 1, f.dia)
    const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
    // La que vence HOY sigue contando como próxima: el vencimiento es el último
    // día de cobertura, no el primero sin ella.
    const cuando =
      esteAnio >= hoyUtc ? esteAnio : Date.UTC(hoy.getUTCFullYear() + 1, f.mes - 1, f.dia)
    const distancia = cuando - hoyUtc
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia
      mejor = f
    }
  }
  return mejor
}

export const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
