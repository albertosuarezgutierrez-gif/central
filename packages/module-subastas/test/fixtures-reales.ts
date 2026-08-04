// Correos REALES del Portal de Subastas del BOE recibidos por Alberto, uno por
// cada variante de búsqueda guardada. Se conserva el marcado tal cual llega
// (comillas simples, saltos de línea dentro del <dd>, entidades HTML); solo se
// ha recortado el pie de página legal, que el parser ignora por completo.
//
// Cubren los casos que importan:
//   · descripción rica con dirección y superficie          → SEVILLA
//   · descripción PLANTILLA sin datos («…CERTIFICACIÓN…»)  → PUNTA UMBRIA
//   · referencia catastral en mayúsculas con letras        → ASTURIAS
//   · descripción larga multilínea + ref. catastral        → PUERTO SANTAMARIA

export interface CorreoReal {
  asunto: string
  html: string
}

const cabecera = (dia: string, busqueda: string, n = 1) => ` <html>
                    <body style='font-size: 16px; font-family: arial, helvetica, sans-serif;'>
                      <h1 style='font-size: 1.5em;'>Subastas: Mis b&uacute;squedas (Subastas en el Portal de Subastas del BOE)</h1>
                      <h2>Suscripci&oacute;n de alberto.suarez.gutierrez@gmail.com</h2>
                      <p style='margin:0;'>Resultados del d&iacute;a <strong> ${dia} </strong>:</p>
                      <h3 style='background-color: #00447a; color: #ffffff;'>
                          Mi b&uacute;squeda "${busqueda}" (Subastas): ${n} resultado
                      </h3>`

const pie = `                    </body>
              </html>`

const item = (id: string, estado: string, descripcion: string) => `
                      <ol> <li style='color: #00447a; font-weight: bold;'>
                         <dl style='margin: 0.3em 0 2em 0;'>
                           <dt>SUBASTA:</dt>
                           <dd style='margin: 0 0 0 1.5em; font-weight: normal; color: #000;'>${id}</dd>
                           <dt>Estado:</dt>
                           <dd style='margin: 0 0 0 1.5em; font-weight: normal; color: #000;'>${estado}</dd>
                           <dt>Descripci&oacute;n:</dt>
                           <dd style='margin: 0 0 0 1.5em; font-weight: normal; color: #000;'>${descripcion}</dd>
                           <dt>Ver subasta:</dt>
                           <dd style='margin: 0 0 0 1.5em;'><a href='https://subastas.boe.es/detalleSubasta.php?idSub=${id}&acc=linkAlertaSub'>${id}</a></dd>
                         </dl>
                      </li> </ol>`

export const CORREOS_REALES: CorreoReal[] = [
  {
    asunto: 'SUBASTAS BOE: Mi búsqueda "INMUEBLE SEVILLA" de 24/07/2026',
    html:
      cabecera('24/07/2026', 'INMUEBLE SEVILLA') +
      item(
        'SUB-JA-2026-264062',
        'Celebr&aacute;ndose [Fecha prevista de finalizaci&oacute;n: 13/08/2026 a las 18:00]',
        'egistro de la Prop&igrave;edad n&ordm; 3 de Dos Hermanas finca registral 9670. URBANA VIVIENDA sita en Dos Hermanas, C/ castillo de la Serrezuela 12. Superficie total construida 605 m2  ',
      ) +
      pie,
  },
  {
    asunto: 'SUBASTAS BOE: Mi búsqueda "PUNTA UMBRIA" de 21/07/2026',
    html:
      cabecera('21/07/2026', 'PUNTA UMBRIA') +
      item(
        'SUB-JA-2026-264600',
        'Celebr&aacute;ndose [Fecha prevista de finalizaci&oacute;n: 10/08/2026 a las 18:00]',
        'DESCRIPCI&Oacute;N QUE CONSTA EN LA CERTIFICACI&Oacute;N DE CARGAS PUBLICADA EN EL BOE ',
      ) +
      pie,
  },
  {
    asunto: 'SUBASTAS BOE: Mi búsqueda "ASTURIAS" de 21/07/2026',
    html:
      cabecera('21/07/2026', 'ASTURIAS') +
      item(
        'SUB-JA-2026-264269',
        'Celebr&aacute;ndose [Fecha prevista de finalizaci&oacute;n: 10/08/2026 a las 18:00]',
        'PARCELA DE TERRENO Y SU EDIFICACION, sita en Pumarada 3, Parroquia de San Bartolom&eacute;, Concejo de Belmonte de Miranda. REFERENCIA CATASTRAL L00400300QJ30C0001BU. FINCA 24.482 DE MIRANDA INSCRITA EN EL REGISTRO DE PRAVIA ',
      ) +
      pie,
  },
  {
    asunto: 'SUBASTAS BOE: Mi búsqueda "PUERTO SANTAMARIA" de 14/07/2026',
    html:
      cabecera('14/07/2026', 'PUERTO SANTAMARIA') +
      item(
        'SUB-JA-2026-264154',
        'Celebr&aacute;ndose [Fecha prevista de finalizaci&oacute;n: 03/08/2026 a las 18:00]',
        `URBANA: Registral 25.143. VIVIENDA en segunda planta alta del Edificio en El Puerto de Santa Mar&iacute;a, en la calle Virgen de los Milagros n&uacute;mero setenta y nueve y ochenta y tres, del portal n&uacute;mero dos o de la derecha, letra C, a la izquierda seg&uacute;n se llega por la escalera, con superficie de ciento quince metros con sesenta y seis decimetros cuadrados, compuesta de hall de entrada, sal&oacute;n comedor con terraza, pasillo distribuidor, tres
dormitorios, dos cuartos de ba&ntilde;o y cocina; y linda entrando frente, vestibulo com&uacute;n, ascensor y vivienda letra B de su misma planta; izquierda, escalera, patio y vivienda letra A
de su misma planta; derecha, espacios libres y fondo, finca n&uacute;mero ochenta y uno de Don Eduardo Ruiz Golluri y vivienda del portal n&uacute;mero uno o de la izquierda. Su cuota a los efectos de la Ley de Propiedad Horizontal de 21 de Julio de 1.960 es de tres enteros, ocho cent&eacute;simas de otro por ciento. Referencia Catastral: 8342605QA4584A0006YM `,
      ) +
      pie,
  },
]
