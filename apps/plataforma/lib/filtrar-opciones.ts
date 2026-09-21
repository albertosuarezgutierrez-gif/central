/**
 * Filtro de texto para las listas largas del catálogo de Codeoscopic (las
 * versiones de un modelo son decenas: «1.0 TGDI 48V TECNO 4X2», «1.0 TGDI
 * ESSENCE 4X2»…). Puro y aparte del componente para poder probarlo.
 */

export type OpcionSimple = { id: string; nombre: string }

/** Minúsculas, sin acentos y con los espacios colapsados: así «TECNO» casa con «tecno». */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Deja las opciones que contienen TODOS los términos escritos (AND, en
 * cualquier orden): «48v tecno» encuentra «1.0 TGDI 48V TECNO 4X2». Busca en el
 * nombre Y en el código, que es lo que el tarificador pide de verdad.
 *
 * 🚨 La opción YA SELECCIONADA nunca se filtra fuera. Si desapareciera de la
 * lista, el `<select>` se quedaría pintando un hueco en blanco mientras el
 * formulario sigue llevando ese código: enseñaría «no has elegido» sobre un
 * dato elegido, que es justo la clase de mentira que este repo persigue.
 */
export function filtrarOpciones<T extends OpcionSimple>(
  opciones: readonly T[],
  consulta: string,
  seleccionado = '',
): T[] {
  const terminos = normalizar(consulta).split(' ').filter(Boolean)
  if (terminos.length === 0) return [...opciones]
  return opciones.filter((o) => {
    if (seleccionado !== '' && o.id === seleccionado) return true
    const heno = normalizar(`${o.nombre} ${o.id}`)
    return terminos.every((t) => heno.includes(t))
  })
}

/**
 * Añade el código al nombre SOLO cuando ese nombre está repetido en la lista.
 * El catálogo devuelve versiones homónimas (tres «1.0 TGDI TECNO 4X2» seguidas
 * en el mismo desplegable) que son códigos Base7 distintos: sin el código, el
 * corredor elige a ciegas entre filas idénticas. Los nombres únicos se quedan
 * limpios.
 */
export function etiquetarOpciones<T extends OpcionSimple>(
  opciones: readonly T[],
): (T & { etiqueta: string })[] {
  const veces = new Map<string, number>()
  for (const o of opciones) {
    const k = normalizar(o.nombre)
    veces.set(k, (veces.get(k) ?? 0) + 1)
  }
  return opciones.map((o) => ({
    ...o,
    etiqueta: (veces.get(normalizar(o.nombre)) ?? 0) > 1 ? `${o.nombre} · ${o.id}` : o.nombre,
  }))
}

/**
 * Convierte una PISTA en texto libre (la versión escrita en otra póliza de la
 * misma matrícula: «HEV 1.6 GDI DT TECNO RED») en la consulta más larga que
 * todavía encuentra algo en el catálogo.
 *
 * Va término a término y se queda solo con los que NO dejan la lista vacía:
 * la pista y el catálogo son dos vocabularios distintos («HEV» puede no existir
 * como palabra en ninguna versión), así que meter la pista entera de golpe
 * filtraría a cero y el buscador nacería roto.
 *
 * 🚨 Esto FILTRA, nunca selecciona: la pista es texto histórico de otra póliza,
 * no un código Base7 del catálogo. Quién es la versión lo sigue decidiendo el
 * corredor.
 */
export function consultaSugerida(opciones: readonly OpcionSimple[], pista: string): string {
  const elegidos: string[] = []
  for (const t of normalizar(pista).split(' ').filter(Boolean)) {
    const prueba = [...elegidos, t].join(' ')
    if (filtrarOpciones(opciones, prueba).length > 0) elegidos.push(t)
  }
  return elegidos.join(' ')
}
