/**
 * Lo que se le dice a quien da de alta una póliza (subir documento o a mano), 27/10/2026.
 *
 * Base del tratamiento de guardar y avisar: lo SOLICITA la persona al subirla (sin casilla, es el servicio).
 * Las ofertas de OTROS seguros son aparte y solo con la casilla `comercial` (`ConsentimientoComercial.tsx` →
 * `POST /api/consentimiento`), SIEMPRE desmarcada de partida. No hay segunda casilla ni segunda ruta.
 */

// PENDIENTE revisión abogado/DPD
export const TEXTO_SERVICIO_ALTA =
  'Guardamos tu póliza, te avisamos antes del vencimiento y al renovar te preparamos una comparativa.'

/** La casilla comercial NUNCA nace marcada. Un test lee `ConsentimientoComercial.tsx` y falla si esto deja de ser verdad. */
export const CASILLA_COMERCIAL_INICIAL = false
