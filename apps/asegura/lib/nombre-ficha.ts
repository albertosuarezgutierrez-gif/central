// Nombre y apellidos de una ficha de la cartera (movido de codeoscopic/desde-cartera.ts el 14/10/2026 para que el
// tarificador RPA lo use sin importar nada de Codeoscopic). PURO.

/**
 * Nombres de pila que el CRM escribe cuando NO hay nombre. Son centinelas
 * («un no lo sé disfrazado de dato»): 20.860 fichas se llaman literalmente
 * «Lead» (medido 01/09/2026). Tratarlos como nombre mandaría «Lead» al vendor.
 */
const NOMBRES_CENTINELA = new Set(['lead', 'cliente', 'sin nombre', 'desconocido', 'n/a', '-'])

function limpio(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/** Nombre de ficha útil: sin vacíos ni centinelas de cajón («lead», «cliente», «-»…). PURA. */
export function nombreUtil(v: string | null): string | null {
  const t = limpio(v)
  if (t === null) return null
  return NOMBRES_CENTINELA.has(t.toLowerCase()) ? null : t
}

const PARTICULAS_APELLIDO = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'san', 'santa', 'van', 'von', 'da', 'das', 'do', 'dos'])

function esParticula(p: string): boolean {
  return PARTICULAS_APELLIDO.has(p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
}

/**
 * «Pérez García» → ['Pérez', 'García']. El vendor quiere los dos por separado.
 * Las partículas («de», «del», «la», «san», «van»…) se pegan a la palabra siguiente: «García de la Torre» →
 * «García» / «de la Torre»; «De la Rosa» es UN apellido.
 */
export function partirApellidos(apellidos: string | null): { primero: string | null; segundo: string | null } {
  const t = nombreUtil(apellidos)
  if (t === null) return { primero: null, segundo: null }
  const palabras = t.split(/\s+/)
  const unidades: string[] = []
  let pendiente: string[] = []
  for (const w of palabras) {
    pendiente.push(w)
    if (!esParticula(w)) { unidades.push(pendiente.join(' ')); pendiente = [] }
  }
  // Partículas sueltas al final («García de»): no hay palabra a la que pegarlas, se quedan con la anterior.
  if (pendiente.length > 0) {
    if (unidades.length > 0) unidades[unidades.length - 1] += ' ' + pendiente.join(' ')
    else unidades.push(pendiente.join(' '))
  }
  if (unidades.length === 1) return { primero: unidades[0], segundo: null }
  // Con tres o más unidades el corte no es adivinable: la ÚLTIMA es el segundo apellido.
  return { primero: unidades.slice(0, -1).join(' '), segundo: unidades[unidades.length - 1] }
}
