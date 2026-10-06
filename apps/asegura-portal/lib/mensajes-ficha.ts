/**
 * Mensajes compartidos cuando el acceso de la persona no resuelve UNA ficha de la cartera.
 *
 * `varias_fichas` = su acceso está enlazado a más de una ficha: no es que la póliza «no sea suya», así que
 * nunca debe traducirse a «No encontramos esta póliza entre las tuyas». Una sola fuente para que el puente
 * (anulación, presupuesto, carta del mediador, mejorar precio) y «Cambiar de cuenta» digan lo mismo.
 */
export const MENSAJE_VARIAS_FICHAS = 'Tu acceso está enlazado a varias fichas. Llámanos y lo cambiamos por teléfono.'
