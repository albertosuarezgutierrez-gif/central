import { test } from 'node:test'
import assert from 'node:assert'
import { derivaAEspanol, asegurarIdioma } from './idioma-salida.ts'

const stub = (out: string, capture?: (args: any[]) => void) =>
  async (...args: any[]) => { capture?.(args); return out }

// El caso real (reserva 154375571): huésped en inglés, borrador en español.
const BORRADOR_ES = '¡Genial! Para llegar desde el aeropuerto, te recomiendo tomar el autobús EA que te deja en el centro. Desde allí son solo 10 minutos andando hasta el apartamento.'
const BORRADOR_EN = 'Great! From the airport, I recommend the EA bus — it drops you in the centre, a 10-minute walk from the apartment.'

test('detecta la deriva al español cuando el huésped escribe en otro idioma', () => {
  assert.equal(derivaAEspanol(BORRADOR_ES, 'en'), true)
  assert.equal(derivaAEspanol(BORRADOR_ES, 'it'), true)
})

test('no marca deriva si la respuesta ya está en el idioma del huésped', () => {
  assert.equal(derivaAEspanol(BORRADOR_EN, 'en'), false)
})

test('una respuesta en español a un huésped en español no es deriva', () => {
  assert.equal(derivaAEspanol(BORRADOR_ES, 'es'), false)
})

test('sin deriva no se gasta llamada a la IA', async () => {
  let called = false
  const res = await asegurarIdioma(BORRADOR_EN, 'en', async () => { called = true; return 'x' })
  assert.equal(called, false)
  assert.deepEqual(res, { texto: BORRADOR_EN, corregido: false, fallo: false })
})

test('con deriva, traduce al idioma del huésped y lo marca corregido', async () => {
  let seen: any[] = []
  const res = await asegurarIdioma(BORRADOR_ES, 'en', stub(BORRADOR_EN, a => { seen = a }))
  assert.equal(res.texto, BORRADOR_EN)
  assert.equal(res.corregido, true)
  assert.equal(res.fallo, false)
  assert.match(seen[1].system, /inglés/)
})

test('si la traducción falla, NO se maquilla: se declara el fallo y se conserva el original', async () => {
  const res = await asegurarIdioma(BORRADOR_ES, 'en', async () => { throw new Error('boom') })
  assert.equal(res.texto, BORRADOR_ES)
  assert.equal(res.fallo, true)
})

test('si la traducción vuelve en español, cuenta como fallo (no como corrección)', async () => {
  const res = await asegurarIdioma(BORRADOR_ES, 'en', stub(BORRADOR_ES))
  assert.equal(res.corregido, false)
  assert.equal(res.fallo, true)
})
