/**
 * Mensajes compartidos cuando el acceso de la persona no resuelve UNA ficha de la cartera.
 *
 * `varias_fichas` = su acceso está enlazado a más de una ficha: no es que la póliza «no sea suya», así que
 * nunca debe traducirse a «No encontramos esta póliza entre las tuyas». Una sola fuente para que el puente
 * (anulación, presupuesto, carta del mediador, mejorar precio) y «Cambiar de cuenta» digan lo mismo.
 */
export const MENSAJE_VARIAS_FICHAS = 'Tu acceso está enlazado a varias fichas. Llámanos y lo cambiamos por teléfono.'

/**
 * `sin_permiso` = la ficha SÍ está vinculada a su acceso, pero con un nivel de solo consulta (`tarjeta`/`completo`).
 * No es «no es tuya»: la ve en su bóveda. Se dice tal cual, sin revelar nada de fichas NO vinculadas (esas siguen
 * siendo «no encontrada», igual que una inexistente).
 */
export const MENSAJE_SOLO_CONSULTA = 'Tu acceso a esta ficha es de solo consulta; para hacerlo, llámanos.'
