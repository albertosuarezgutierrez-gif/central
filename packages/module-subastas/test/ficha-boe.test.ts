// Ficha REAL del Portal de Subastas del BOE, descargada el 28/07/2026 de
// SUB-JA-2026-264062 (la vivienda de Dos Hermanas de las alertas de Alberto).
// El fixture conserva el marcado original de las tres pestañas. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mejorPujaDeFicha, parsearCertificadoCierre, parsearFichaBoe, paresFicha, resultadoDeBanner, resultadoDeFicha } from '../src/ficha-boe.ts'
import { evaluarOportunidad } from '../src/scoring.ts'
import type { SubastaInmueble } from '../src/types.ts'

const F = JSON.parse(readFileSync(new URL('./fixtures-ficha.json', import.meta.url), 'utf8')) as {
  general: string; autoridad: string; bien: string
}
const ficha = parsearFichaBoe(F.general, F.bien, F.autoridad)

test('cifras reales de la ficha', () => {
  assert.equal(ficha.identificador, 'SUB-JA-2026-264062')
  assert.equal(ficha.boeId, 'BOE-B-2026-24705')
  assert.equal(ficha.tipo, 'judicial')
  assert.equal(ficha.valorSubasta, 739210.43)
  assert.equal(ficha.tramos, 14784.2)
  assert.equal(ficha.deposito, 36960.52)
  assert.equal(ficha.cantidadReclamada, 237990)
})

test('EL CENTINELA QUE IMPORTA: «Tasación 0,00 €» es null, no cero', () => {
  // Si entrara como 0, el descuento dividiría por cero y saldría un chollo falso.
  assert.equal(ficha.tasacion, null)
  // El otro centinela del portal: «Sin lotes».
  assert.equal(ficha.lotes, null)
})

test('«Sin puja mínima» es una DECLARACIÓN: 0 (revisado, no hay), no null', () => {
  // La ficha real lo publica en texto: cualquier postura es admisible. El 0
  // se distingue del null («no publicada») en toda la cadena aguas abajo.
  assert.equal(ficha.pujaMinima, 0)
})

test('puja mínima: ausente → null, y «0,00 €» numérico → null (no es declaración)', () => {
  const fila = (v: string) => `<tr><th>Puja mínima</th><td>${v}</td></tr>`
  assert.equal(parsearFichaBoe('<table></table>').pujaMinima, null)
  assert.equal(parsearFichaBoe(fila('0,00 €')).pujaMinima, null)
  assert.equal(parsearFichaBoe(fila('12.000,00 €')).pujaMinima, 12000)
})

test('el depósito publicado ES el 5% del valor de subasta', () => {
  // Confirma con datos reales la constante que usa `costes.ts`.
  assert.equal(Math.round(ficha.valorSubasta! * 0.05 * 100) / 100, ficha.deposito)
})

test('fechas: se prefiere la ISO que el portal da entre paréntesis', () => {
  assert.equal(ficha.fechaInicio, '2026-07-24T16:00:00.000Z')
  assert.equal(ficha.fechaFin, '2026-08-13T16:00:00.000Z')
})

test('RIESGO REAL: «No consta (consta inscrito arrendamiento)» no es libre', () => {
  // El portal dice «No consta», pero hay un arrendamiento inscrito: el
  // adjudicatario puede heredar al inquilino. Tratarlo como libre sería el
  // error caro. Se marca como ocupación probable.
  assert.equal(ficha.arrendamientoInscrito, true)
  assert.equal(ficha.situacionPosesoria, 'ocupada_desconocida')
})

test('«Visitable: No consta» se trata como sin acceso', () => {
  assert.equal(ficha.sinVisita, true)
})

test('datos del bien y de la autoridad gestora', () => {
  assert.equal(ficha.provincia, 'Sevilla')
  assert.equal(ficha.localidad, 'DOS HERMANAS')
  assert.equal(ficha.codigoPostal, '41700')
  assert.match(ficha.direccion ?? '', /Lopez de Vega/)
  assert.match(ficha.autoridad ?? '', /Dos Hermanas/)
  assert.equal(ficha.telefonoAutoridad, '954724565')
  assert.match(ficha.emailAutoridad ?? '', /@juntadeandalucia\.es$/)
})

test('con la ficha puesta, la subasta ya se evalúa de punta a punta', () => {
  const s: SubastaInmueble = {
    dedupeKey: ficha.identificador!,
    fuente: 'boe',
    tipo: ficha.tipo!,
    provincia: ficha.provincia,
    descripcion: ficha.descripcion,
    valorSubasta: ficha.valorSubasta,
    tasacion: ficha.tasacion,
    situacionPosesoria: ficha.situacionPosesoria,
    sinVisita: ficha.sinVisita,
    cargasConocidas: ficha.cargasConocidas,
    ejecutado: 'desconocido',
  }
  const o = evaluarOportunidad(s)
  // El depósito ya se conoce aunque falte la tasación.
  assert.equal(o.deposito, 36960.52)
  // Y sigue SIN puntuación, porque el BOE no publicó tasación: es lo correcto.
  assert.equal(o.puntuacion, null)
  assert.ok(o.motivos.some((m) => m.includes('no se puede calcular')))
})

test('paresFicha ignora filas sin par etiqueta/valor', () => {
  assert.equal(paresFicha('').size, 0)
  assert.equal(paresFicha('<tr><td>suelta</td></tr>').size, 0)
})

// ── Resultado tras la conclusión (parser DEFENSIVO, pendiente de la 1ª real) ─

test('resultadoDeFicha: la ficha abierta real NO tiene estado → null', () => {
  // paresFicha del fixture real (subasta abierta): no hay clave de estado.
  const g = paresFicha(F.general)
  assert.equal(resultadoDeFicha(g), null)
})

test('mejorPujaDeFicha: puja viva sin exigir estado; la ficha real abierta no la publica', () => {
  // La ficha real de una subasta abierta (fixture) no enseña la mejor puja → null,
  // que significa «no publicada», NO «sin pujas».
  assert.equal(mejorPujaDeFicha(paresFicha(F.general)), null)
  assert.equal(mejorPujaDeFicha(new Map([['puja maxima', '52.000,00 €']])), 52000)
  assert.equal(mejorPujaDeFicha(new Map([['mejor puja', '1.500,00 €']])), 1500)
  // «Importe de adjudicación» es un RESULTADO, no una puja en curso.
  assert.equal(mejorPujaDeFicha(new Map([['importe de adjudicacion', '90.000,00 €']])), null)
  // «0,00 €» no es una puja.
  assert.equal(mejorPujaDeFicha(new Map([['puja maxima', '0,00 €']])), null)
})

test('resultadoDeFicha: estados concluidos plausibles se clasifican, celebrándose no', () => {
  const con = (estado: string, extra: [string, string][] = []) =>
    resultadoDeFicha(new Map([['estado', estado], ...extra]))
  assert.deepEqual(con('Concluida', [['puja maxima', '150.000,00 €']]), { resultado: 'concluida', importe: 150000 })
  assert.deepEqual(con('Desierta'), { resultado: 'desierta', importe: null })
  assert.deepEqual(con('Cancelada'), { resultado: 'cancelada', importe: null })
  assert.equal(con('Celebrándose'), null)
})

// ── Cierre REAL (SUB-JA-2026-264154, El Puerto, 09/08/2026) ──────────────────
// La ficha concluida publica el estado como BANNER (no como par clave/valor) y
// el desenlace vive en el certificado de cierre. Fixtures copiados del HTML y
// del PDF reales — regla del repo: el fixture de un parser de documento externo
// se copia de un documento real.

const BANNER_CONCLUIDA = `
  <div class="caja gris aviso">
    <p class="destaca">
      <strong>LA SUBASTA HA CONCLUIDO SU PERIODO DE PUJAS (se encuentra pendiente de finalizaci&#xF3;n y devoluci&#xF3;n de dep&#xF3;sitos con reserva por parte de la Autoridad Gestora).</strong>
    </p>
    <p class="puntoPDF">
      <a href="./verCertificadoCierre.php?idSub=SUB-JA-2026-264154" target="_blank">Certificado de cierre de la subasta en el Portal de Subastas</a>
    </p>`

test('resultadoDeBanner: el banner real de conclusión se reconoce; la ficha abierta no', () => {
  assert.equal(resultadoDeBanner(BANNER_CONCLUIDA), 'concluida')
  // La ficha real ABIERTA (fixture) no lleva banner → null.
  assert.equal(resultadoDeBanner(F.general), null)
  assert.equal(resultadoDeBanner('<html><body>Portal de Subastas</body></html>'), null)
})

test('parsearCertificadoCierre: el texto real del certificado → con_pujas + puja máxima', () => {
  // Texto extraído del PDF real de SUB-JA-2026-264154.
  const texto = 'Valor de la subasta: 275.206,00 euros.\nValor de tasación: 0,00 euros.\nLa subasta concluyó con pujas (puja máxima 170.627,72 euros).\n4 de Agosto de 2026'
  assert.deepEqual(parsearCertificadoCierre(texto), { resultado: 'con_pujas', pujaMaxima: 170627.72 })
})

test('parsearCertificadoCierre: sin pujas → desierta; marcado desconocido → null', () => {
  assert.deepEqual(parsearCertificadoCierre('La subasta concluyó sin pujas.'), { resultado: 'desierta', pujaMaxima: null })
  // Defensivo: un certificado con otro marcado no se inventa (se reintenta).
  assert.equal(parsearCertificadoCierre('CERTIFICACIÓN DE CIERRE DE SUBASTA'), null)
  assert.equal(parsearCertificadoCierre(''), null)
})
