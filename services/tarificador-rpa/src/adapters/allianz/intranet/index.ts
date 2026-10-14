// Capa de intranet de Allianz ePAC: lo común a TODOS los ramos de la compañía (sesión, marcos, entrada, formato).
// Los adaptadores de ramo (comunidades, auto, comercio, rc-pyme) importan de aquí, no unos de otros.
// 🚨 Mapfre aún importa `fechaEs` de ../allianz/comunidades.ts (PR #4662): ese re-export se mantiene por compatibilidad.
export { login, sesionSirve } from './sesion.ts'
export { marcoCon, esperarMarcoApp, NOMBRE_MARCO_APP, type Raiz } from './marcos.ts'
export { abrirNuevaAlta, etiquetaProducto, textoExacto, TARJETA_AUTOS, type PestanaEntradaAllianz } from './entrada.ts'
export { fechaEs } from './formato.ts'
