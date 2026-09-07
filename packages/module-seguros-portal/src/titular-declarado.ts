// ¿De quién es la póliza que sube el cliente al portal?
//
// ── Por qué existe (07/09/2026) ─────────────────────────────────────────────
//
// Alberto: «si él sube esas pólizas a nombre de empresa, se pregunta». Y tiene
// razón, porque son DOS cosas que no dependen una de la otra y esta sesión las
// había mezclado:
//
//   · ETIQUETAR lo que sube («esto es de mi empresa») no necesita nada. Es un
//     dato suyo sobre una póliza suya, y el momento de preguntarlo es ese:
//     tiene el PDF delante y sabe la respuesta.
//   · ACCEDER a la cartera que la correduría ya tiene de esa empresa sí exige
//     ficha y autorización, y eso sigue igual.
//
// 🚨 ES UNA DECLARACIÓN, NO UN VÍNCULO. Nada de esto crea una ficha de sociedad
// ni la casa sola con una existente: dar de alta un cliente en la cartera
// porque alguien escribe un nombre en un formulario es precisamente lo que el
// portal no puede hacer. La reconciliación la decide el corredor.
//
// ── Tres estados, y el tercero es el que evita la mentira ───────────────────
//
//   `propio`        → lo ha dicho: es suya.
//   `empresa`       → lo ha dicho, y ha dicho CUÁL.
//   `sin_preguntar` → no consta. TODAS las filas anteriores a hoy, y también
//                     las que digan «empresa» sin nombre — un «de mi empresa»
//                     sin nombre no identifica ninguna empresa, así que no
//                     puede viajar como si lo hiciera.

export type TipoTitular = 'propio' | 'empresa' | 'sin_preguntar'

export type TitularDeclarado = {
  tipo: TipoTitular
  /** Solo con `empresa`, y entonces nunca vacío. */
  nombre: string | null
  /** Puede faltar aunque haya empresa: mucha gente no se lo sabe de memoria. */
  cif: string | null
}

const SIN_PREGUNTAR: TitularDeclarado = { tipo: 'sin_preguntar', nombre: null, cif: null }

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * De lo que hay en la BD (o llega en un formulario) al vocabulario. Nunca
 * lanza y nunca inventa: cualquier cosa que no encaje cae a `sin_preguntar`,
 * que es el estado que no afirma nada.
 */
export function normalizarTitular(bruto: { tipo: unknown; nombre: unknown; cif: unknown }): TitularDeclarado {
  const tipo = texto(bruto.tipo)?.toLowerCase() ?? null
  if (tipo === 'propio') return { tipo: 'propio', nombre: null, cif: null }
  if (tipo !== 'empresa') return SIN_PREGUNTAR

  const nombre = texto(bruto.nombre)
  // «De mi empresa» sin decir cuál no identifica ninguna empresa. La BD lo
  // rechaza con un CHECK; aquí se degrada en vez de lanzar, porque esto también
  // lee filas viejas y no puede tumbar una pantalla por un dato a medias.
  if (nombre === null) return SIN_PREGUNTAR

  return { tipo: 'empresa', nombre, cif: texto(bruto.cif)?.toUpperCase() ?? null }
}

/**
 * Contra qué ficha se comprueba si la casa YA lleva esa póliza. `null` = contra
 * ninguna.
 *
 * 🚨 Es el arreglo concreto que trae este módulo. Si se cotejara siempre contra
 * la ficha personal de quien la sube, una póliza que su SOCIEDAD ya tiene
 * contratada con la correduría saldría como oportunidad — y el corredor
 * llamaría a un cliente para ofrecerle lo que ya le vendió.
 *
 * `sin_preguntar` tampoco coteja: no se sabe de quién es, y cotejar sería
 * suponer que es suya.
 */
export function fichaParaCotejar(t: TitularDeclarado, fichaDeQuienSube: string | null): string | null {
  return t.tipo === 'propio' ? fichaDeQuienSube : null
}

/** Para pintar. Los tres estados se dicen distinto, y el tercero se dice. */
export function etiquetaTitular(t: TitularDeclarado): string {
  switch (t.tipo) {
    case 'empresa':
      return `De su empresa: ${t.nombre}${t.cif ? ` (${t.cif})` : ''}`
    case 'propio':
      return 'Suya, a título personal'
    default:
      return 'No se le preguntó de quién era'
  }
}
