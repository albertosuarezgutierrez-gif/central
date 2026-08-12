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
 * Motor de reservas público (Smoobu, cuenta 103685).
 *
 * ⚠️ PENDIENTE DE CONFIRMAR: el enlace PROFUNDO a House Sevillana. Este portal es
 * multi-propiedad — en la prueba de huésped del 12/08/2026 salió «Busto Reform»— así que
 * mandar aquí obliga al huésped a encontrar el piso él solo, que es fricción justo donde
 * menos conviene. En cuanto se tenga la URL directa de House Sevillana, se cambia SOLO aquí.
 *
 * Lo que sí está verificado de esta URL (prueba real de huésped, sin completar la reserva):
 * carga, ofrece únicamente tarjeta (Stripe, claves live) y llega a la pantalla de pago sin
 * ningún aviso de sandbox.
 */
export const MOTOR_RESERVAS = 'https://booking.smoobu.com/yourothercity'

/** Dominios que NO deben volver a aparecer como destino de reserva. */
export const DOMINIOS_MUERTOS = ['reservas.house-sevillana.com', 'house-sevillana.com']
