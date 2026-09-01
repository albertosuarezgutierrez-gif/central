// Un solo cuadro de búsqueda para toda la cartera: se teclea lo que se tenga a
// mano —una matrícula que dicta el cliente por teléfono, su DNI, el número de
// póliza de un recibo, un apellido— y esto decide DÓNDE hay que mirar.
//
// ─── Por qué la clasificación es pura y vive aquí ───────────────────────────
// Porque es la parte que se equivoca en silencio. Si «41003» se toma solo por
// número de póliza, buscar el código postal de San Julián devuelve vacío y la
// pantalla dice «no hay nadie» sobre 300 clientes. Un término puede encajar en
// VARIOS criterios a la vez y se buscan TODOS: es más barato enseñar dos
// bloques de resultados que una ausencia falsa.
//
// ─── 🚨 Lo que la cartera NO deja buscar, y hay que decirlo ─────────────────
// Medido el 01/09/2026 contra la base real:
//   · nombre/apellidos → EN CLARO, 32.600 de 32.600. Búsqueda parcial, fiable.
//   · matrícula        → EN CLARO en `datos_especificos`, 4.504 pólizas.
//   · nº de póliza     → EN CLARO, 6.895 pólizas.
//   · DNI              → CIFRADO. Solo se encuentra por índice ciego y EXACTO,
//                        y solo 3.904 de 32.600 fichas (12%) tienen el hash.
//   · teléfono / email → ídem: 5.377 (16%) y 4.308 (13%).
//   · ciudad / CP      → EN CLARO: 4.482 y 16.398.
//   · dirección        → CIFRADA, las 1.954 que hay. **NO se puede buscar.**
//
// De ahí `Aviso`: un criterio que no puede dar resultados no se ejecuta y se
// CUENTA. «No he encontrado a nadie» y «por ahí no se puede buscar» son cosas
// distintas, y la segunda dice qué hacer en su lugar.

export type TipoCriterio =
  | 'nombre'
  | 'matricula'
  | 'poliza'
  | 'dni'
  | 'telefono'
  | 'email'
  | 'codigo_postal'
  | 'ciudad'

export type Criterio = {
  tipo: TipoCriterio
  /** El término YA normalizado para ese criterio (mayúsculas, sin guiones…). */
  valor: string
  /**
   * `parcial` = LIKE sobre texto en claro: encuentra por un fragmento.
   * `exacto`  = índice ciego sobre un valor cifrado: o coincide entero, o nada.
   * Un `exacto` que no devuelve fila NO prueba que el dato no exista.
   */
  coincidencia: 'parcial' | 'exacto'
}

export type Aviso = {
  /** Qué se ha intentado buscar y no se puede. */
  tema: 'direccion'
  texto: string
}

export type PlanBusqueda = {
  termino: string
  criterios: Criterio[]
  avisos: Aviso[]
  /** `false` = el término es demasiado corto. NO es «no hay resultados». */
  buscable: boolean
}

/** Mínimo para una búsqueda parcial por texto: menos devuelve media cartera. */
export const MINIMO_TEXTO = 3

/**
 * Matrícula española, los dos formatos vivos:
 *   · desde 2000: 4 dígitos + 3 consonantes (sin vocales, ni Ñ, Q, CH, LL).
 *   · anterior:   1-2 letras de provincia + 4 dígitos + 1-2 letras.
 */
const RE_MATRICULA_NUEVA = /^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/
const RE_MATRICULA_VIEJA = /^[A-Z]{1,2}\d{4}[A-Z]{1,2}$/

/** DNI · NIE · CIF. No se valida la letra: buscar no es dar de alta. */
const RE_DNI = /^\d{8}[A-Z]$/
const RE_NIE = /^[XYZ]\d{7}[A-Z]$/
const RE_CIF = /^[A-HJNP-SUVW]\d{7}[0-9A-J]$/

/** `41003`. En España son SIEMPRE 5 dígitos, con el cero delante si toca. */
const RE_CP = /^\d{5}$/

/** Un número de póliza: letras, dígitos, guiones y barras. Al menos 4 signos. */
const RE_POLIZA = /^[A-Z0-9][A-Z0-9\/-]{3,}$/

function limpio(v: string): string {
  return v.trim().replace(/\s+/g, ' ')
}

/** Quita todo lo que no sea letra o dígito y sube a mayúsculas. */
function compacto(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Decide dónde buscar un término. Puede devolver varios criterios: `41003` es
 * a la vez un código postal plausible y un número de póliza plausible, y no hay
 * forma de saber cuál quería quien lo teclea — así que se buscan los dos.
 */
export function planBusqueda(termino: string): PlanBusqueda {
  const t = limpio(termino)
  const base: PlanBusqueda = { termino: t, criterios: [], avisos: [], buscable: false }
  if (t.length < MINIMO_TEXTO) return base

  const criterios: Criterio[] = []
  const c = compacto(t)

  // ── Los que se reconocen por su FORMA, y son los que más rápido cierran ──
  if (RE_MATRICULA_NUEVA.test(c) || RE_MATRICULA_VIEJA.test(c)) {
    criterios.push({ tipo: 'matricula', valor: c, coincidencia: 'parcial' })
  }
  if (RE_DNI.test(c) || RE_NIE.test(c) || RE_CIF.test(c)) {
    criterios.push({ tipo: 'dni', valor: c, coincidencia: 'exacto' })
  }
  if (RE_CP.test(c)) {
    criterios.push({ tipo: 'codigo_postal', valor: c, coincidencia: 'parcial' })
  }
  if (t.includes('@') && /@[^@\s]+\.[^@\s]{2,}$/.test(t)) {
    criterios.push({ tipo: 'email', valor: t.toLowerCase(), coincidencia: 'exacto' })
  }

  // ── Teléfono: 9 dígitos, o 6+ si el término es SOLO dígitos y separadores ──
  // No basta «tiene 6 dígitos»: un número de póliza los tiene y se buscaría un
  // teléfono que nunca existió. El índice ciego es exacto: sin los 9 no casa.
  const digitos = t.replace(/\D/g, '')
  const soloNumero = /^[\d\s.+()-]+$/.test(t)
  if (soloNumero && (digitos.length === 9 || (digitos.length > 9 && digitos.length <= 13))) {
    criterios.push({ tipo: 'telefono', valor: digitos, coincidencia: 'exacto' })
  }

  // ── Nº de póliza: cualquier código con dígitos que no sea ya otra cosa ──
  const yaEsIdentificador = criterios.some((k) => k.tipo === 'matricula' || k.tipo === 'dni')
  if (!yaEsIdentificador && /\d/.test(c) && RE_POLIZA.test(c)) {
    criterios.push({ tipo: 'poliza', valor: c, coincidencia: 'parcial' })
  }

  // ── Texto: nombre y, si no lleva dígitos, también ciudad ──
  if (/[A-ZÁÉÍÓÚÑ]/i.test(t)) {
    criterios.push({ tipo: 'nombre', valor: t, coincidencia: 'parcial' })
    if (!/\d/.test(t) && !t.includes('@')) {
      criterios.push({ tipo: 'ciudad', valor: t, coincidencia: 'parcial' })
    }
  }

  return { ...base, criterios, buscable: criterios.length > 0 }
}

/**
 * Lo que hay que decir cuando alguien busca una DIRECCIÓN.
 *
 * No es un mensaje de error ni una lista vacía: es que ese campo va cifrado en
 * la base y una consulta SQL no puede mirarlo. Devolver «ningún resultado»
 * sería afirmar que ese cliente no vive en esa calle, que es justo lo contrario
 * de lo que se sabe. Se ofrece lo que SÍ funciona: la ciudad y el CP.
 */
export function avisoDireccion(): Aviso {
  return {
    tema: 'direccion',
    texto:
      'La dirección va cifrada en la base, así que no se puede buscar por calle. ' +
      'Prueba con la ciudad o con el código postal, que sí están en claro.',
  }
}

/**
 * Cuántas fichas de la cartera pueden aparecer por cada criterio, para que la
 * pantalla no presente una ausencia como si fuera concluyente.
 *
 * 🚨 El caso que importa es el DNI: solo el 12% de las fichas tienen calculado
 * su índice ciego, así que un «no aparece» es casi siempre «esa ficha no tiene
 * hash», no «ese DNI no está en la cartera». Decirlo cambia lo que hace quien
 * busca: en vez de dar de alta un duplicado, prueba por apellido.
 */
export type Cobertura = { alcanzables: number; total: number }

export function explicarVacio(tipo: TipoCriterio, cob: Cobertura | null): string {
  if (cob === null) {
    return 'No se ha podido comprobar sobre cuántas fichas alcanza esta búsqueda.'
  }
  const pct = cob.total === 0 ? 0 : Math.round((cob.alcanzables / cob.total) * 100)
  const nombres: Record<TipoCriterio, string> = {
    nombre: 'el nombre',
    matricula: 'la matrícula',
    poliza: 'el número de póliza',
    dni: 'el DNI',
    telefono: 'el teléfono',
    email: 'el email',
    codigo_postal: 'el código postal',
    ciudad: 'la ciudad',
  }
  if (pct >= 99) return `Se ha buscado por ${nombres[tipo]} en toda la cartera.`
  return (
    `Solo ${cob.alcanzables.toLocaleString('es-ES')} de ${cob.total.toLocaleString('es-ES')} ` +
    `fichas (${pct}%) se pueden encontrar por ${nombres[tipo]}. Que no aparezca NO significa ` +
    `que no esté: prueba por apellido.`
  )
}
