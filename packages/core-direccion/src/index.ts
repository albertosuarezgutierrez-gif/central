// @central/core-direccion — base común de direcciones postales españolas. PURO (apto navegador).
// La tabla CP→municipios (JSON INE, solo servidor) vive en `@central/core-direccion/servidor`.
export { validarCp, provinciaPorCp, PROVINCIA_POR_CP } from './cp.ts'
export type { ResultadoCp } from './cp.ts'
export { ciudadDelCp, decidirCiudad, cpCompleto } from './ciudad-cp.ts'
export type { DecisionCiudad } from './ciudad-cp.ts'
export { provinciaAlternativa } from './provincia-alternativa.ts'
// Normalización de vía y sugerencias: viven en core-catastro (una sola copia).
export { normVia, tokensVia, sugerirVias, nombreCalleEscrito } from '@central/core-catastro'
export type { ViaCatastro } from '@central/core-catastro'
