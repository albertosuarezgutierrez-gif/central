/**
 * Dónde se arregla cada hueco que el servidor devuelve en `faltan`.
 *
 * Caso fundacional (21/09/2026). La pantalla de auto nuevo partía los reparos
 * en dos: los que sabe teclear (`CAMPOS_A_MANO`) y **todo lo demás**, que
 * pintaba bajo «Esto no se arregla desde esta pantalla · Hay que corregirlo en
 * la ficha del cliente». Los seis campos del historial de seguro
 * (`companiaAnteriorCodigo`, `polizaAnterior`, los años, los siniestros) caían
 * ahí **teniendo su propio bloque tres dedos más abajo, en esa misma
 * pantalla** — y en la ficha del cliente no existe ninguno de ellos. O sea: un
 * callejón sin salida que además mandaba al sitio equivocado.
 *
 * Es la regla de «un dato que NO hay ≠ un dato que NO se ha mirado» aplicada a
 * las INSTRUCCIONES: afirmar dónde se corrige algo que no se ha comprobado es
 * la misma clase de mentira, y encima cuesta un viaje.
 *
 * Cuatro destinos, y el cuarto es el que importa: un campo que este módulo no
 * conoce sale como `desconocido` y la pantalla lo DICE, en vez de mandar a la
 * ficha por descarte. Añadir un reparo nuevo aguas arriba no puede producir
 * una instrucción falsa aguas abajo.
 */

export type DondeSeCorrige = 'pantalla' | 'historial' | 'ficha' | 'desconocido'

export type Reparo = { campo: string; motivo: string }

/** Lo que la pantalla resuelve con sus desplegables y sus casillas. */
export const CAMPOS_EN_PANTALLA = new Set<string>([
  'codigoVehiculo', 'garaje', 'matricula', 'fechaMatriculacion',
  'municipioCirculacionId', 'estadoCivil', 'sexo',
])

/**
 * El bloque «¿Tiene seguro en vigor ahora mismo?» de esta misma pantalla.
 * NO van en `CAMPOS_EN_PANTALLA` porque su aviso es distinto: hay que
 * encender el interruptor, y decir solo «está en la pantalla» no ayuda a
 * encontrarlos.
 */
export const CAMPOS_HISTORIAL = new Set<string>([
  'companiaAnteriorCodigo', 'polizaAnterior',
  'aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros', 'siniestrosUltimos5',
])

/** Lo que de verdad vive en la ficha del cliente y aquí no se puede tocar. */
export const CAMPOS_DE_FICHA = new Set<string>([
  'cpCirculacion', 'cpResidencia', 'municipioResidenciaId',
  'nombreVia', 'numeroVia', 'tipoVia', 'email',
  'nombre', 'apellido1', 'apellido2',
])

export function dondeSeCorrige(campo: string, aMano: (c: string) => boolean): DondeSeCorrige {
  if (CAMPOS_HISTORIAL.has(campo)) return 'historial'
  if (CAMPOS_EN_PANTALLA.has(campo) || aMano(campo)) return 'pantalla'
  if (CAMPOS_DE_FICHA.has(campo)) return 'ficha'
  return 'desconocido'
}

export type FaltanClasificados = {
  historial: Reparo[]
  ficha: Reparo[]
  desconocidos: Reparo[]
}

/**
 * Reparte los reparos por dónde se arreglan. Los de `pantalla` no salen: ya
 * los pinta el propio campo en rojo, y repetirlos en una lista de avisos
 * convierte lo accionable en ruido.
 */
export function clasificarFaltan(
  faltan: readonly Reparo[] | null | undefined,
  aMano: (c: string) => boolean,
): FaltanClasificados {
  const r: FaltanClasificados = { historial: [], ficha: [], desconocidos: [] }
  for (const f of faltan ?? []) {
    const d = dondeSeCorrige(f.campo, aMano)
    if (d === 'historial') r.historial.push(f)
    else if (d === 'ficha') r.ficha.push(f)
    else if (d === 'desconocido') r.desconocidos.push(f)
  }
  return r
}
