// La composición de los avisos de la campana, sin BD.
//
// Cada test rompe UNA regla de `avisosDe` / `textoGlobo`: se escribieron viendo
// cada uno en rojo antes de dejarlo en verde (regla del `CLAUDE.md` de la raíz:
// un cepo no está terminado hasta que se le ha visto fallar).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DIAS_VENTANA_AVISO } from '@central/module-seguros-portal'

import { avisosDe, HREF_POR_TIPO, textoGlobo, type AutorizacionParaAviso, type ObligacionParaAviso } from './avisos.ts'

const HOY = new Date('2026-09-08T10:00:00Z')
const dias = (n: number) => new Date(HOY.getTime() + n * 86_400_000)

const auto = (x: Partial<AutorizacionParaAviso> & { id: string }): AutorizacionParaAviso => ({
  estado: 'pendiente',
  otorganteNombre: 'María del Carmen Martínez Ayala',
  autorizadoNombre: 'Gabriel Durán Martínez',
  ...x,
})
const obl = (x: Partial<ObligacionParaAviso> & { id: string }): ObligacionParaAviso => ({
  titulo: 'Seguro de auto · Reale',
  fechaAccionable: dias(3),
  ...x,
})
const vacias = { otorgadas: [], recibidas: [] }

test('una autorización RECIBIDA pendiente es un aviso que lleva a «Quién me ve», nunca a una acción', () => {
  const r = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [auto({ id: 'a1' })] }, obligaciones: [], hoy: HOY })
  assert.equal(r.avisos.length, 1)
  const a = r.avisos[0]!
  assert.equal(a.tipo, 'autorizacion_pendiente')
  assert.equal(a.id, 'a1')
  assert.match(a.titulo, /María del Carmen Martínez Ayala te ha dado acceso/)
  assert.equal(a.href, '/autorizaciones')
  assert.equal(r.globo, '1')
})

test('solo cuentan las PENDIENTES: una vigente, caducada o revocada no es un aviso', () => {
  const recibidas = [auto({ id: 'v', estado: 'vigente' }), auto({ id: 'c', estado: 'caducada' }), auto({ id: 'r', estado: 'revocada' })]
  const r = avisosDe({ autorizaciones: { otorgadas: [], recibidas }, obligaciones: [], hoy: HOY })
  assert.deepEqual(r.avisos, [])
  assert.equal(r.globo, null, 'todo leído y nada pendiente = sin globo, no «0»')
})

test('una autorización que YO di y no han aceptado es el aviso espejo, y sin nombre no se inventa uno', () => {
  const otorgadas = [auto({ id: 'o1' }), auto({ id: 'o2', autorizadoNombre: null })]
  const r = avisosDe({ autorizaciones: { otorgadas, recibidas: [] }, obligaciones: [], hoy: HOY })
  assert.equal(r.avisos.length, 2)
  assert.equal(r.avisos[0]!.tipo, 'autorizacion_sin_aceptar')
  assert.match(r.avisos[0]!.titulo, /^Gabriel Durán Martínez aún no ha aceptado/)
  assert.match(r.avisos[1]!.titulo, /^La persona invitada aún no ha aceptado/)
  assert.equal(r.avisos[1]!.href, HREF_POR_TIPO.autorizacion_sin_aceptar)
})

test('las obligaciones entran solo en la VENTANA del módulo (0..7 días antes de la fecha accionable)', () => {
  const obligaciones = [
    obl({ id: 'hoy', fechaAccionable: dias(0) }),
    obl({ id: 'borde', fechaAccionable: dias(DIAS_VENTANA_AVISO) }),
    obl({ id: 'fuera', fechaAccionable: dias(DIAS_VENTANA_AVISO + 1) }),
    obl({ id: 'pasada', fechaAccionable: dias(-1) }),
  ]
  const r = avisosDe({ autorizaciones: vacias, obligaciones, hoy: HOY })
  assert.deepEqual(
    r.avisos.map((a) => a.id),
    ['hoy', 'borde'],
  )
  assert.equal(r.avisos[0]!.tipo, 'obligacion_en_ventana')
  assert.equal(r.avisos[0]!.href, '/boveda#calendario-titulo', 'el ancla es el titular del calendario')
  assert.match(r.avisos[0]!.detalle, /hasta el 8 de septiembre/, 'la fecha que se enseña es la ACCIONABLE, no la del vencimiento')
})

test('una fuente ilegible NO colapsa a «sin avisos»: se declara y el globo lleva «+»', () => {
  const r = avisosDe({ autorizaciones: null, obligaciones: [obl({ id: 'o' })], hoy: HOY })
  assert.deepEqual(r.fuentesIlegibles, ['autorizaciones'])
  assert.equal(r.avisos.length, 1, 'la fuente que SÍ se leyó se sirve igual')
  assert.equal(r.globo, '1+')

  const cero = avisosDe({ autorizaciones: vacias, obligaciones: null, hoy: HOY })
  assert.deepEqual(cero.fuentesIlegibles, ['obligaciones'])
  assert.equal(cero.globo, '0+', 'cero leídos con una fuente sin leer NO es «nada pendiente»')
})

test('ninguna fuente legible = «!»: no se sabe nada y se dice', () => {
  const r = avisosDe({ autorizaciones: null, obligaciones: null, hoy: HOY })
  assert.deepEqual(r.avisos, [])
  assert.deepEqual(r.fuentesIlegibles, ['autorizaciones', 'obligaciones'])
  assert.equal(r.globo, '!')
})

test('textoGlobo: los tres desenlaces, y ninguno es «0»', () => {
  assert.equal(textoGlobo(0, 0, 2), null)
  assert.equal(textoGlobo(3, 0, 2), '3')
  assert.equal(textoGlobo(3, 1, 2), '3+')
  assert.equal(textoGlobo(0, 1, 2), '0+')
  assert.equal(textoGlobo(0, 2, 2), '!')
  assert.equal(textoGlobo(5, 2, 2), '!', 'con todo ilegible no puede haber avisos; si los hay, algo cuenta mal')
})

test('todo ilegible manda sobre el «+» aunque haya avisos de relleno', () => {
  // `textoGlobo` decide por el número de fuentes, no por si la lista viene
  // vacía: así un `[]` de consuelo aguas arriba no convierte «!» en «0+».
  assert.equal(textoGlobo(0, 2, 2), '!')
})

test('cada tipo tiene destino, y es una pantalla del portal', () => {
  for (const [tipo, href] of Object.entries(HREF_POR_TIPO)) {
    assert.match(href, /^\/(autorizaciones|boveda)/, `${tipo} lleva a ${href}, que no es una pantalla del portal`)
    assert.ok(!/\/api\//.test(href), `${tipo} apunta a una API: la campana enlaza pantallas, no ejecuta acciones`)
  }
})
