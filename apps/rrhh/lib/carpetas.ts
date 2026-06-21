// Taxonomía de carpetas del expediente de EMPLEADO. Reusa la taxonomía RR.HH. compartida
// (`@central/module-rrhh`), que comparten rrhh (empleados) e ialimp (limpiadoras).
import { CARPETAS_RRHH, CARPETAS_RRHH_IDX, ACTOR_GESTOR, ACTOR_TITULAR } from '@central/module-rrhh'

export const CARPETAS = CARPETAS_RRHH
export const CARPETAS_IDX = CARPETAS_RRHH_IDX
export { ACTOR_GESTOR, ACTOR_TITULAR }

export const BUCKET_DOCS = 'rrhh-documentos'
