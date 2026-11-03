// Fixtures del correo INDIVIDUAL de Agoda, copiados de los correos REALES del 03/11/2026 (reserva Luxury).
// Estructura literal (tabla con `|`, saludo, «ID de reserva», traducción + «mensaje original», pie «Did you
// know?… Replying to this email», cabecera de la reserva, e HISTORIAL después). ANONIMIZADO: sin enlaces de
// tracking, claves de portal/caja, wifi ni enlaces de check-in (el historial real los trae: no van al repo).
const CABECERA = '| |\n\n| | |\n| | | [](http://tracking.agoda.com/click?cid=1&linkType=logo) | Hola Luxury, | |\n\n| |\n\n| | |\n| Este viajero está actualmente hospedado en tu alojamiento. |\n\n| |\n| Nueva solicitud de Nicolas Iha |\n| |\n\n| | | | | | |\n| Huésped actual |\n| |\n\n| |\n'
const PIE = '\n\n| Did you know? Prompt replies to guests result in fewer cancellations and can improve review scores. Replying to this email, will be sent directly to the guest. |\n\n| |\n\n| |\n| Luxury 3 nov. 2026 - 5 nov. 2026 |\n| Luxury | 1 habitación | 3 adultos , 0 niños |\n| Nombre del huésped principal : Guest of Nicolas Iha |\n\n| | | | |\n| ¡Responder a esta consulta es sencillo! |\n| Simplemente responde a este correo electrónico como harías con cualquier otro y se lo reenviaremos directamente al huésped. No hace falta cambiar la dirección de correo electrónico ¡Ya nos ocupamos nosotros! |\n\n'
const HISTORIAL_PREVIO = '| |\n| | nov. 03, 02:07 p. m. ICT | Luxury | |\n\n| |\n| | ¡Bienvenido/a, Nicolas Iha! WIFI: red «XXXX» · contraseña: XXXX Respondemos mensajes de 9:00 a 21:00. | |\n\n| |\n| | Nicolas Iha | nov. 02, 04:08 p. m. ICT | |\n\n| |\n| | Hola! Ya realizamos el check in. Nuestro vuelo llega a las 9 am, seguramente pasemos para dejar valijas. | |\n\n| |\n| | nov. 02, 03:08 p. m. ICT | Luxury | |\n\n| |\n| | ¡Hola Nicolas Iha! Entrada a partir de las 15:00. CÓMO ENTRAR: marca la clave XXXX#. Ábrela con la clave XXXX. | |\n\n| |\n| | Email enviado por: Agoda Company Pte. Ltd. | |'

/** 14:27Z — «no hay internet» (con traducción automática; lo nuevo va ANTES del historial). */
export const AGODA_WIFI = {
  from: 'notifications@agoda-messaging.com',
  subject: 'Reply from Nicolas Iha (Nov 3-5, 2026)',
  body: CABECERA
    + '| | Nicolas Iha | nov. 03, 09:27 p. m. ICT | |\n| | ID de reserva: 1053955690 | | |\n\n| |\n\n| |\n'
    + '| | Hello, I am able to connect to the provided Wi-Fi, however, I get a message that there is no internet. El texto anterior es una traducción automática (realizada a través del Traductor de Google) del siguiente mensaje original: Hola , me estoy pudiendo conectar al wifi proporcionado sin embargo obtengo un memsaje de que no hay internet | |'
    + PIE
    + '| | Nicolas Iha | nov. 03, 03:55 p. m. ICT | |\n\n| |\n| | Gracias! Perfecto, lo tendremos en cuenta. Consulta, cual seria el horario mas temprano en que podamos ir por lo menos a dejar las valijas? Gracias! | |\n\n'
    + HISTORIAL_PREVIO,
}

/** 08:56Z — maletas (traducción + original; el historial ya incluye mensajes nuestros). */
export const AGODA_MALETAS = {
  from: 'notifications@agoda-messaging.com',
  subject: 'Reply from Nicolas Iha (Nov 3-5, 2026)',
  body: CABECERA
    + '| | Nicolas Iha | nov. 03, 03:55 p. m. ICT | |\n| | ID de reserva: 1053955690 | | |\n\n| |\n\n| |\n'
    + '| | Thank you! Perfect, we will keep that in mind. Quick question, what is the earliest time we could go to at least drop off our suitcases? Thanks! El texto anterior es una traducción automática (realizada a través del Traductor de Google) del siguiente mensaje original: Gracias! Perfecto, lo tendremos en cuenta. Consulta, cual seria el horario mas temprano en que podamos ir por lo menos a dejar las valijas? Gracias! | |'
    + PIE
    + HISTORIAL_PREVIO,
}
