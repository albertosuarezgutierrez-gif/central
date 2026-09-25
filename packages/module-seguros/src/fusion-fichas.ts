// Fusionar dos fichas de la MISMA persona eligiendo, campo a campo, con qué
// valor se queda (Alberto, 25/09/2026: «que indique qué datos son diferentes y
// pueda seleccionar cuál sí y cuál no»).
//
// Puro: lo usan asegura (para validar lo que llega) y plataforma (para pintar
// la comparación). Los grupos son los MISMOS que acepta la función SQL
// `seguros.fusionar_clientes` — si se añade uno aquí sin añadirlo allí, la BD
// lo rechaza con `campo_no_permitido` (y viceversa, no se ofrece).
//
// Lo que NO se elige, a propósito:
// - Teléfonos y correos: se conservan TODOS (la ficha que queda los recibe como
//   secundarios). Elegir uno sería tirar el otro, y un contacto no sobra nunca.
// - DNI: o es el mismo, o una de las dos no lo tiene (y se hereda). Si son
//   distintos, son DOS personas y no se fusiona (el caso de Antonio Cruz, padre
//   e hijo, revertido el 24/09/2026).

export const GRUPOS_FUSION = [
  'nombre',
  'apellidos',
  'fecha_nacimiento',
  'direccion',
  'direccion_fiscal',
  'cuenta_bancaria',
  'notas',
  'saludo',
  'estado_civil',
  'ocupacion',
  'sector',
  'tipo_persona',
] as const
export type GrupoFusion = (typeof GRUPOS_FUSION)[number]

export const ETIQUETA_GRUPO_FUSION: Record<GrupoFusion, string> = {
  nombre: 'Nombre',
  apellidos: 'Apellidos',
  fecha_nacimiento: 'Fecha de nacimiento',
  direccion: 'Dirección',
  direccion_fiscal: 'Dirección fiscal',
  cuenta_bancaria: 'Cuenta bancaria',
  notas: 'Notas',
  saludo: 'Sexo / saludo',
  estado_civil: 'Estado civil',
  ocupacion: 'Ocupación',
  sector: 'Sector',
  tipo_persona: 'Tipo de persona',
}

/** Un valor tal como se ha podido leer: el texto, vacío, o cifrado que no abre. */
export type ValorFusion = { valor: string | null; ilegible: boolean }

export type EstadoCampoFusion =
  | 'igual' // los dos dicen lo mismo (o los dos vacíos)
  | 'distinto' // los dos tienen valor y no coincide: SE ELIGE
  | 'solo_superviviente' // la otra no lo tiene: se queda
  | 'solo_absorbida' // la que queda no lo tiene: se hereda solo
  | 'ilegible' // alguno está cifrado y no abre: no se puede comparar

export type CampoFusion = {
  grupo: GrupoFusion
  etiqueta: string
  superviviente: ValorFusion
  absorbida: ValorFusion
  estado: EstadoCampoFusion
}

function normal(v: string | null): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

function vacio(v: ValorFusion): boolean {
  return !v.ilegible && (v.valor === null || v.valor.trim() === '')
}

/**
 * Compara las dos fichas grupo a grupo. «Igual» ignora mayúsculas, acentos y
 * signos: «CL SAN VICENTE, 40» y «Cl. San Vicente 40» no piden elegir.
 */
export function compararFichas(
  superviviente: Partial<Record<GrupoFusion, ValorFusion>>,
  absorbida: Partial<Record<GrupoFusion, ValorFusion>>,
): CampoFusion[] {
  const nada: ValorFusion = { valor: null, ilegible: false }
  return GRUPOS_FUSION.map((grupo) => {
    const s = superviviente[grupo] ?? nada
    const a = absorbida[grupo] ?? nada
    let estado: EstadoCampoFusion
    if ((s.ilegible && !vacio(a)) || (a.ilegible && !vacio(s))) estado = 'ilegible'
    else if (vacio(s) && vacio(a)) estado = 'igual'
    else if (vacio(a)) estado = 'solo_superviviente'
    else if (vacio(s)) estado = 'solo_absorbida'
    else estado = normal(s.valor) === normal(a.valor) ? 'igual' : 'distinto'
    return { grupo, etiqueta: ETIQUETA_GRUPO_FUSION[grupo], superviviente: s, absorbida: a, estado }
  })
}

/** Quién es quién por el DNI. Solo el índice ciego decide; el nombre no. */
export type IdentidadFusion = 'mismo_dni' | 'dni_distinto' | 'sin_comprobar'

export function identidadFusion(hashSuperviviente: string | null, hashAbsorbida: string | null): IdentidadFusion {
  if (hashSuperviviente && hashAbsorbida) return hashSuperviviente === hashAbsorbida ? 'mismo_dni' : 'dni_distinto'
  return 'sin_comprobar'
}

export type RevisionElecciones =
  | { ok: true; deAbsorbida: GrupoFusion[] }
  | { ok: false; motivo: 'grupo_desconocido' | 'no_hay_nada_que_elegir'; grupo: string }

/**
 * Valida la lista de grupos en los que el corredor ha elegido el valor de la
 * ficha que desaparece. Solo tiene sentido elegir donde hay dos valores
 * distintos: en «solo_absorbida» se hereda igualmente, y en «igual» o
 * «ilegible» elegir sobreescribiría a ciegas.
 */
export function revisarElecciones(pedidos: unknown, campos: CampoFusion[]): RevisionElecciones {
  const lista = Array.isArray(pedidos) ? pedidos : []
  const deAbsorbida: GrupoFusion[] = []
  for (const g of lista) {
    if (typeof g !== 'string' || !(GRUPOS_FUSION as readonly string[]).includes(g)) {
      return { ok: false, motivo: 'grupo_desconocido', grupo: String(g) }
    }
    const campo = campos.find((c) => c.grupo === g)
    if (!campo || campo.estado !== 'distinto') return { ok: false, motivo: 'no_hay_nada_que_elegir', grupo: g }
    if (!deAbsorbida.includes(g as GrupoFusion)) deAbsorbida.push(g as GrupoFusion)
  }
  return { ok: true, deAbsorbida }
}
