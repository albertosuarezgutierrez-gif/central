// apps/housesevillana/app/reservas.ts
//
// La URL del motor de reservas, en UN solo sitio.
//
// 🚨 Por qué existe este fichero (12/08/2026): la landing tenía este enlace copiado a mano en
// SEIS botones distintos —el hero, el bloque de enlaces internos, /barrio, /que-ver y los dos
// de /parking— y todos apuntaban a `https://reservas.house-sevillana.com`, un dominio que
// **NO EXISTE**: no tiene registro DNS, y su dominio padre `house-sevillana.com` tampoco.
// Comprobado por dos vías independientes (resolución del sistema y fetch → `ENOTFOUND`).
//
// Es decir: el botón principal de todas las páginas —en una web cuyo único objetivo es la
// reserva directa— devolvía un error de DNS del navegador. Falla en el PRIMER paso, no en el
// último. Encaja con lo que dice GA4: 109 sesiones en 12 meses y **1 solo clic saliente**.
//
// La lección de método, que es la razón de que esto sea una constante y no seis literales:
// un enlace repetido a mano no se revisa nunca, porque revisar uno no dice nada de los otros
// cinco. Ahora arreglarlo es cambiar esta línea, y el test de `app/i18n/enlaces.test.ts`
// impide que vuelva a aparecer una URL de reservas escrita a pelo en una página.

/**
 * Motor de reservas de House Sevillana (Smoobu, cuenta 103685).
 *
 * El `apartmentId` NO es opcional. Sin él, la misma URL abre el portal MULTI-PROPIEDAD de la
 * cuenta y lista las cuatro casas en tarjetas (Busto Reform, Duplex Center, House Sevillana,
 * Luxury Busto): el huésped que llega desde esta web tendría que identificar la suya entre
 * las otras tres, justo después de haber decidido reservar. Con el id entra directo a House
 * Sevillana, ya seleccionada, y sigue bloqueada en ella aunque cambie las fechas y busque.
 *
 * Verificado en prueba real de huésped (12/08/2026, sin completar la reserva): carga con la
 * casa correcta, ofrece únicamente tarjeta (Stripe con claves live) y llega a la pantalla de
 * pago sin ningún aviso de sandbox.
 *
 * Los ids de la cuenta, por si algún día hace falta otro: Busto Reform 352418 · Duplex Center
 * 352928 · House Sevillana 352007 · Luxury Busto 352943.
 */
export const MOTOR_RESERVAS = 'https://booking.smoobu.com/yourothercity?apartmentId=352007'

/**
 * Dominios que NO deben volver a aparecer como destino de reserva.
 *
 * `reservas.house-sevillana.com` nunca llegó a existir: parece una intención que se quedó a
 * medias. Comprobado en Smoobu (12/08/2026) que el campo «External link» del motor **no aloja
 * nada** — solo redirige los enlaces que Smoobu genera hacia una URL propia que ya tengas
 * montada. Para servir el motor bajo un subdominio propio habría que publicar una página con
 * el iframe y apuntar ahí el DNS; nadie lo hizo, pero los botones ya apuntaban al subdominio.
 */
export const DOMINIOS_MUERTOS = ['reservas.house-sevillana.com', 'house-sevillana.com']
