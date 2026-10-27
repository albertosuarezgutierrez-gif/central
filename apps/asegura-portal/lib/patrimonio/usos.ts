// Usos de un inmueble (espejo del CHECK de `portal_patrimonio_inmueble.uso`). Fichero aparte y sin imports para que lo
// use el formulario del navegador sin arrastrar el Catastro.
// `edificio` (27/10/2026): edificio SIN división horizontal (una referencia catastral) con unidades que cuelgan de él.
export const USOS_INMUEBLE = ['vivienda', 'local', 'oficina', 'nave', 'garaje', 'trastero', 'otro', 'edificio'] as const
export type UsoInmueble = (typeof USOS_INMUEBLE)[number]

export const ETIQUETA_USO: Record<UsoInmueble, string> = {
  vivienda: 'Vivienda', local: 'Local', oficina: 'Oficina', nave: 'Nave', garaje: 'Garaje', trastero: 'Trastero', otro: 'Otro',
  edificio: 'Edificio entero (sin división horizontal)',
}
