// Qué tipo de siniestro es, en botones, según el RAMO de la póliza elegida.
//
// El cliente lo cuenta con sus palabras en «Qué ha pasado»; esto no lo sustituye.
// Sirve para que el corredor reciba el parte ya clasificado (agua, lunas, robo…)
// y para dar la indicación que toca a cada caso (una avería con grúa es de la
// ASISTENCIA, no de un parte).
//
// 🚨 Es OPCIONAL y `null` = no lo ha contestado, que NO es «otro». Un parte sin
// tipo se tramita igual; uno con el tipo inventado por obligar a elegir, peor.
//
// La lista cerrada es la MISMA que el CHECK de la BD
// (`2026-09-26_portal_parte_tipo_siniestro.sql`); la vigila su test.

export const TIPOS_SINIESTRO = [
  'colision',
  'lunas',
  'robo',
  'averia',
  'agua',
  'incendio',
  'cristales',
  'electrico',
  'danos_terceros',
  'otro',
] as const
export type TipoSiniestro = (typeof TIPOS_SINIESTRO)[number]

export const ETIQUETA_TIPO_SINIESTRO: Record<TipoSiniestro, string> = {
  colision: 'Choque o golpe',
  lunas: 'Lunas',
  robo: 'Robo',
  averia: 'Avería o grúa',
  agua: 'Agua o fuga',
  incendio: 'Incendio',
  cristales: 'Cristales',
  electrico: 'Daños eléctricos',
  danos_terceros: 'Daños a un vecino u otra persona',
  otro: 'Otra cosa',
}

const AUTO: readonly TipoSiniestro[] = ['colision', 'lunas', 'robo', 'averia', 'otro']
const HOGAR: readonly TipoSiniestro[] = ['agua', 'robo', 'incendio', 'cristales', 'electrico', 'danos_terceros', 'otro']

/**
 * Las opciones para ESE ramo. `[]` = para este ramo no se pregunta (o no se sabe
 * el ramo): la pantalla no pinta el bloque, y el parte viaja sin tipo.
 */
export function opcionesTipoSiniestro(ramo: string | null | undefined): readonly TipoSiniestro[] {
  const r = (ramo ?? '').trim().toLowerCase()
  if (r === 'auto' || r === 'moto') return AUTO
  // Las dos formas: la cartera dice «comunidad», las aportadas (`RAMOS_POLIZA`) «comunidades».
  if (r === 'hogar' || r === 'comunidad' || r === 'comunidades') return HOGAR
  return []
}

export function esTipoSiniestro(v: unknown): v is TipoSiniestro {
  return typeof v === 'string' && (TIPOS_SINIESTRO as readonly string[]).includes(v)
}
