// Usos de un inmueble (espejo del CHECK de `portal_patrimonio_inmueble.uso`). Fichero aparte y sin imports para que lo
// use el formulario del navegador sin arrastrar el Catastro.
export const USOS_INMUEBLE = ['vivienda', 'local', 'oficina', 'nave', 'garaje', 'trastero', 'otro'] as const
export type UsoInmueble = (typeof USOS_INMUEBLE)[number]

export const ETIQUETA_USO: Record<UsoInmueble, string> = {
  vivienda: 'Vivienda', local: 'Local', oficina: 'Oficina', nave: 'Nave', garaje: 'Garaje', trastero: 'Trastero', otro: 'Otro',
}
