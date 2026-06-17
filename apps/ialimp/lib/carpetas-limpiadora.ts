// Taxonomía del expediente de la limpiadora + bucket de Storage.
// Reutiliza las carpetas estándar de RR.HH. de @central/module-rrhh (las mismas que rrhh).
import { CARPETAS_RRHH, CARPETAS_RRHH_IDX, ACTOR_GESTOR, ACTOR_TITULAR } from '@central/module-rrhh'

export const CARPETAS = CARPETAS_RRHH
export const CARPETAS_IDX = CARPETAS_RRHH_IDX
export { ACTOR_GESTOR, ACTOR_TITULAR }

/** Bucket PRIVADO de los documentos de RR.HH. de la limpiadora (URLs firmadas). */
export const BUCKET_DOCS_LIMP = 'documentos-limpiadora'
