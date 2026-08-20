// Fixtures REALES de la pestaña «Pujas» (`&ver=5`) del Portal, capturados el
// 20/08/2026 con las cuatro respuestas que da a un visitante anónimo. Se copian
// del documento real (entidades y <strong> intercalados incluidos): un fixture
// escrito a mano se redacta con la misma suposición equivocada que el parser y
// por eso los tests pasan mientras producción falla — lección del extracto de
// tarjeta (08/08/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pujasDeFicha, titularPujas } from '../src/pujas.ts'

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`

const envoltura = (advertencia: string, panel: string) => `
<div id="contenido">
  <h2>Subasta SUB-JA-2026-000000</h2>
  <div class="caja gris aviso"><p><strong>ADVERTENCIA:</strong> ${advertencia}</p></div>
  <div id="idBloqueDatos5">
    <h3>Pujas</h3>
    <table><tr>${panel}</tr></table>
    <p>Para participar en la subasta debe haberse registrado en el Portal de Subastas e iniciar sesi&#xF3;n.</p>
  </div>
</div>`

const PUBLICA = 'la puja m&#xE1;s alta realizada es p&#xFA;blica y existe posibilidad de pr&#xF3;rroga hasta un m&#xE1;ximo de 24 horas'
const SECRETA = 'todas las pujas son secretas y no existe posibilidad de pr&#xF3;rroga de dicho plazo'

// SUB-JA-2026-264175
const SIN_PUJAS = envoltura(PUBLICA, '<th>Puja m&#xE1;xima actual de la subasta</th><td>La subasta no ha recibido pujas.</td>')
// SUB-JA-2026-262310
const CON_PUJA = envoltura(PUBLICA, '<th>Puja m&#xE1;xima actual de la subasta</th><td>La subasta ha recibido alguna puja. Para ver su importe debe acceder como usuario registrado.</td>')
// SUB-JA-2026-260867
const SECRETAS = envoltura(SECRETA, '<th>Puja m&#xE1;xima actual de la subasta</th><td>La puja m&#xE1;xima de la subasta es secreta.</td>')
// SUB-JA-2026-263425, ya CONCLUIDA: aquí sí publica el remate.
const CONCLUIDA = envoltura(PUBLICA, '<th>Puja m&#xE1;xima de la subasta</th><td>669.900,00 &#x20AC;</td>')

test('las cuatro respuestas reales del Portal se leen como cuatro estados', () => {
  assert.deepEqual(pujasDeFicha(SIN_PUJAS), { estado: 'sin_pujas', importe: null })
  assert.deepEqual(pujasDeFicha(CON_PUJA), { estado: 'con_puja', importe: null })
  assert.deepEqual(pujasDeFicha(SECRETAS), { estado: 'secretas', importe: null })
  assert.deepEqual(pujasDeFicha(CONCLUIDA), { estado: 'con_puja', importe: 669900 })
})

test('🚨 lo que no se ha podido leer NUNCA es «sin pujas»', () => {
  // Es la diferencia entre «puedes llevártela por el mínimo» y «no lo sé», y va
  // en un aviso de Telegram sobre el que se decide una puja de decenas de miles.
  for (const basura of ['', '<html><body>Servicio no disponible</body></html>', envoltura(PUBLICA, '<th>Pujas</th><td></td>')]) {
    assert.deepEqual(pujasDeFicha(basura), { estado: 'desconocido', importe: null }, JSON.stringify(basura.slice(0, 40)))
  }
})

test('una subasta secreta ya concluida publica su remate y deja de ser «secreta»', () => {
  // El banner de «pujas secretas» sale en las CUATRO pestañas: leerlo antes que
  // la cifra dejaría la ficha en «secreta» para siempre, con el remate delante.
  const secretaConcluida = envoltura(SECRETA, '<th>Puja m&#xE1;xima de la subasta</th><td>129.112,60 &#x20AC;</td>')
  assert.deepEqual(pujasDeFicha(secretaConcluida), { estado: 'con_puja', importe: 129112.6 })
})

test('la puja MÍNIMA y los tramos no se confunden con la puja viva', () => {
  // La pestaña general trae «Puja mínima» y «Tramos entre pujas»: coger «el
  // primer € de la página» convertiría un tramo de 3.300€ en la puja actual.
  const general = `
    <div id="contenido">
      <table>
        <tr><th>Valor subasta</th><td>165.000,00 &#x20AC;</td></tr>
        <tr><th>Puja m&#xED;nima</th><td>Sin puja m&#xED;nima</td></tr>
        <tr><th>Tramos entre pujas</th><td>3.300,00 &#x20AC;</td></tr>
        <tr><th>Importe del dep&#xF3;sito</th><td>8.250,00 &#x20AC;</td></tr>
      </table>
    </div>`
  assert.deepEqual(pujasDeFicha(general), { estado: 'desconocido', importe: null })
})

test('«Sin puja mínima» no se lee como un importe de cero', () => {
  const raro = envoltura(PUBLICA, '<th>Puja m&#xE1;xima actual de la subasta</th><td>Sin puja m&#xED;nima</td>')
  assert.equal(pujasDeFicha(raro).importe, null)
  assert.equal(pujasDeFicha(raro).estado, 'desconocido')
})

test('el titular manda a Alberto al sitio correcto en cada estado', () => {
  assert.match(titularPujas({ estado: 'sin_pujas', importe: null }, eur), /SIN pujas/)
  assert.match(titularPujas({ estado: 'con_puja', importe: null }, eur), /no publica el importe/)
  assert.equal(titularPujas({ estado: 'con_puja', importe: 669900 }, eur, 165000), '🔥 Puja máxima 669.900,00€ (406% del tipo)')
  // Sin tipo no se inventa el porcentaje.
  assert.equal(titularPujas({ estado: 'con_puja', importe: 669900 }, eur), '🔥 Puja máxima 669.900,00€')
  assert.equal(titularPujas({ estado: 'con_puja', importe: 669900 }, eur, 0), '🔥 Puja máxima 669.900,00€')
  assert.match(titularPujas({ estado: 'secretas', importe: null }, eur), /ni registr/)
  // Y el desconocido se declara como hueco, no como calma.
  assert.match(titularPujas({ estado: 'desconocido', importe: null }, eur), /sin comprobar/)
})
