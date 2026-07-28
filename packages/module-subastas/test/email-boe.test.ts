// Tests del parseo de las alertas del Portal de Subastas del BOE.
// El fixture es HTML REAL de un correo recibido el 24/07/2026 (recortado a lo
// que importa, sin tocar el marcado). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodificarHtml, esAlertaBoe, parsearAlertaBoe, parsearEstado } from '../src/email-boe.ts'

const HTML_REAL = `<html>
  <body style='font-size: 16px; font-family: arial, helvetica, sans-serif;'>
    <h1 style='font-size: 1.5em;'>Subastas: Mis b&uacute;squedas (Subastas en el Portal de Subastas del BOE)</h1>
    <p style='margin:0;'>Resultados del d&iacute;a <strong> 24/07/2026 </strong>:</p>
    <h3 style='background-color: #00447a;'>
        Mi b&uacute;squeda "INMUEBLE SEVILLA" (Subastas): 1 resultado
    </h3>
    <ol> <li style='color: #00447a; font-weight: bold;'>
       <dl style='margin: 0.3em 0 2em 0;'>
         <dt>SUBASTA:</dt>
         <dd style='margin: 0 0 0 1.5em;'>SUB-JA-2026-264062</dd>
         <dt>Estado:</dt>
         <dd style='margin: 0 0 0 1.5em;'>Celebr&aacute;ndose [Fecha prevista de finalizaci&oacute;n: 13/08/2026 a las 18:00]</dd>
         <dt>Descripci&oacute;n:</dt>
         <dd style='margin: 0 0 0 1.5em;'>egistro de la Prop&igrave;edad n&ordm; 3 de Dos Hermanas finca registral 9670. URBANA VIVIENDA sita en Dos Hermanas, C/ castillo de la Serrezuela 12. Superficie total construida 605 m2  </dd>
         <dt>Ver subasta:</dt>
         <dd style='margin: 0 0 0 1.5em;'><a href='https://subastas.boe.es/detalleSubasta.php?idSub=SUB-JA-2026-264062&acc=linkAlertaSub'>SUB-JA-2026-264062</a></dd>
       </dl>
    </li> </ol>
  </body>
</html>`

const ASUNTO = 'SUBASTAS BOE: Mi búsqueda "INMUEBLE SEVILLA" de 24/07/2026'

test('parsea el correo real del BOE', () => {
  const r = parsearAlertaBoe(HTML_REAL, ASUNTO)
  assert.equal(r.length, 1)

  const { busqueda, estado, subasta } = r[0]
  assert.equal(busqueda, 'INMUEBLE SEVILLA')
  assert.equal(estado, 'Celebrándose')
  assert.equal(subasta.identificador, 'SUB-JA-2026-264062')
  assert.equal(subasta.dedupeKey, 'SUB-JA-2026-264062')
  assert.equal(subasta.fuente, 'boe')
  assert.equal(subasta.tipo, 'judicial')
  assert.equal(subasta.fechaFin, '2026-08-13T18:00:00.000Z')
  assert.match(subasta.descripcion ?? '', /Dos Hermanas/)
  assert.match(subasta.descripcion ?? '', /605 m2/)
  assert.equal(subasta.url, 'https://subastas.boe.es/detalleSubasta.php?idSub=SUB-JA-2026-264062&acc=linkAlertaSub')
})

test('el correo NO trae cifras: se marcan como desconocidas, no como cero', () => {
  const { subasta } = parsearAlertaBoe(HTML_REAL, ASUNTO)[0]
  assert.equal(subasta.valorSubasta, null)
  assert.equal(subasta.tasacion, null)
  assert.equal(subasta.cargas, null)
  assert.equal(subasta.cargasConocidas, false)
  assert.equal(subasta.situacionPosesoria, 'desconocida')
})

test('varios resultados en la misma búsqueda', () => {
  const dos = HTML_REAL.replace(
    '</ol>',
    `<li><dl>
       <dt>SUBASTA:</dt><dd>SUB-NE-2026-100</dd>
       <dt>Estado:</dt><dd>Pr&oacute;xima apertura</dd>
       <dt>Descripci&oacute;n:</dt><dd>Piso en Camas</dd>
       <dt>Ver subasta:</dt><dd><a href='https://subastas.boe.es/detalleSubasta.php?idSub=SUB-NE-2026-100'>x</a></dd>
     </dl></li></ol>`,
  )
  const r = parsearAlertaBoe(dos, ASUNTO)
  assert.equal(r.length, 2)
  assert.equal(r[1].subasta.identificador, 'SUB-NE-2026-100')
  assert.equal(r[1].subasta.tipo, 'notarial')
  // Sin fecha prevista de finalización, el estado se lee igual y la fecha queda null.
  assert.equal(r[1].estado, 'Próxima apertura')
  assert.equal(r[1].subasta.fechaFin, null)
})

test('cada sección hereda su propia búsqueda guardada', () => {
  const multi = `
    <h3>Mi b&uacute;squeda "PUNTA UMBRIA" (Subastas): 1 resultado</h3>
    <ol><li><dl>
      <dt>SUBASTA:</dt><dd>SUB-JA-2026-1</dd>
      <dt>Estado:</dt><dd>Celebr&aacute;ndose</dd>
    </dl></li></ol>
    <h3>Mi b&uacute;squeda "MAZAGON" (Subastas): 1 resultado</h3>
    <ol><li><dl>
      <dt>SUBASTA:</dt><dd>SUB-JA-2026-2</dd>
      <dt>Estado:</dt><dd>Celebr&aacute;ndose</dd>
    </dl></li></ol>`
  const r = parsearAlertaBoe(multi, null)
  assert.equal(r.length, 2)
  assert.equal(r[0].busqueda, 'PUNTA UMBRIA')
  assert.equal(r[1].busqueda, 'MAZAGON')
})

test('ignora bloques que no llevan un identificador válido', () => {
  const basura = `<h3>Mi b&uacute;squeda "X" (Subastas): 0 resultados</h3>
    <ol><li><dl><dt>SUBASTA:</dt><dd>no consta</dd></dl></li></ol>`
  assert.equal(parsearAlertaBoe(basura, null).length, 0)
  assert.equal(parsearAlertaBoe('', null).length, 0)
})

test('parsearEstado separa el estado de la fecha de cierre', () => {
  assert.deepEqual(parsearEstado('Celebrándose [Fecha prevista de finalización: 13/08/2026 a las 18:00]'), {
    estado: 'Celebrándose',
    fechaFin: '2026-08-13T18:00:00.000Z',
  })
  assert.deepEqual(parsearEstado('Concluida'), { estado: 'Concluida', fechaFin: null })
})

test('decodificarHtml resuelve las entidades del BOE', () => {
  assert.equal(decodificarHtml('b&uacute;squeda'), 'búsqueda')
  assert.equal(decodificarHtml('finalizaci&oacute;n'), 'finalización')
  assert.equal(decodificarHtml('A &amp; B'), 'A & B')
})

test('esAlertaBoe reconoce el remitente y el asunto', () => {
  assert.equal(esAlertaBoe('no-responder@boe.es', ASUNTO), true)
  assert.equal(esAlertaBoe('noresponder@idealista.com', ASUNTO), false)
  assert.equal(esAlertaBoe('no-responder@boe.es', 'Otra cosa del BOE'), false)
})
