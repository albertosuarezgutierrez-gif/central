// Trazabilidad / APPCC (casa de marcas) — entry point único. Lógica PURA:
// sin BD, sin secretos, sin LLM. Modela el parte de elaboración de hostelería.

// Puertos y tipos de dominio
export type {
  Alergeno,
  RegistroDesinfeccion,
  Ingrediente,
  TipoControl,
  PuntoControl,
  RegistroTemp,
  ElaboracionTraza,
  UbicacionEvento,
  ParteElaboracion,
  ResultadoControl,
  VeredictoSalida,
} from './types.ts'

// Validación APPCC: puntos de control y bloqueo de salida
export {
  objetivoControl,
  validarPuntoControl,
  validarControles,
  evaluarSalida,
} from './appcc.ts'

// Alérgenos automáticos (los 14 de la norma) por ingrediente/elaboración
export {
  ALERGENO_NOMBRE,
  detectarAlergenos,
  alergenosIngrediente,
  alergenosElaboracion,
} from './alergenos.ts'

// Muestras testigo: aviso de las que ya pueden retirarse
export { muestrasACaducar } from './muestras.ts'
export type { MuestraACaducar } from './muestras.ts'

// Generación automática del parte a partir de catálogo + eventos
export { generarParte, paxTotal } from './generar.ts'
export type { EscandalloIngrediente, FichaCatalogo, EventoInput } from './generar.ts'
