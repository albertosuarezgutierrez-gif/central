// Versión del texto de consentimiento RGPD que ve el cliente en su intranet.
// Si cambia el texto legal, sube esta versión: los clientes que aceptaron una
// versión anterior volverán a ver el gate y deberán reaceptar (re-consent).
export const RGPD_VERSION = '1.1'

// Responsable del tratamiento (editable). Es quien trata los datos del cliente
// y quien le ofrece la intranet gratis a cambio del consentimiento, incluido el
// envío de ofertas comerciales propias y de empresas asociadas.
export const RGPD_RESPONSABLE = {
  nombre:    'Alberto Suárez Gutiérrez',
  marca:     'IALIMP',
  nif:       '28823484E',
  direccion: 'C/ San Juan de la Palma 28, 41003 Sevilla',
  email:     'hola@ialimp.es',
}
