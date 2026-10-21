// Captura JPEG y opciones de un ATASCO (21/10/2026): se guarda como la evidencia HTML, se sirve solo por el puerto del
// operador y la que lleva datos del tomador no sale a Telegram. `node --test`. Un brazo por aserción.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { leerResultadoWorker, mimeCaptura, nombreCapturaFallo, opcionesDeError } from './tarificador-reglas.ts'
import { esNombreEvidenciaFallo } from './tarificador-purga-evidencia-reglas.ts'

const APP = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(APP, rel), 'utf8')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const ID = '229b2fc5-4a39-4fd8-8dcd-4b7ce5e9c056'

test('mimeCaptura: por los bytes, PNG o JPEG; lo demás no', () => {
  assert.equal(mimeCaptura(PNG), 'image/png')
  assert.equal(mimeCaptura(JPG), 'image/jpeg')
  assert.equal(mimeCaptura(Buffer.from('GIF89a----')), null)
  assert.equal(mimeCaptura(null), null)
})

test('nombreCapturaFallo: .jpg / .png, y la purga de 15 días lo reconoce', () => {
  assert.equal(nombreCapturaFallo(ID, 'image/jpeg'), 'fallo-229b2fc5.jpg')
  assert.equal(nombreCapturaFallo(ID, 'image/png'), 'fallo-229b2fc5.png')
  assert.equal(esNombreEvidenciaFallo('fallo-229b2fc5.jpg'), true)
})

test('opcionesDeError: tres estados (null no se miró · [] no había · lista)', () => {
  assert.equal(opcionesDeError(undefined), null)
  assert.deepEqual(opcionesDeError([]), [])
  assert.deepEqual(opcionesDeError([' SEVILLA ', 3, '']), ['SEVILLA'])
})

test('leerResultadoWorker: acepta JPEG y lee la marca capturaConDatos (solo con captura)', () => {
  const base = { trabajoId: ID, resultado: 'error', error: { tipo: 'portal', mensaje: 'hueco', url: null } }
  const r = leerResultadoWorker({ ...base, capturaBase64: JPG.toString('base64'), capturaConDatos: true })
  assert.ok(r.ok && r.r.tipo === 'error' && r.r.capturaConDatos === true)
  const sin = leerResultadoWorker({ ...base, capturaConDatos: true })
  assert.ok(sin.ok && sin.r.tipo === 'error' && sin.r.capturaConDatos === false)
  const gif = leerResultadoWorker({ ...base, capturaBase64: Buffer.from('GIF89a----').toString('base64') })
  assert.equal(gif.ok, false)
})

test('servicio: los avisos (Telegram) nunca llevan la captura con datos; el detalle sí (puerto del operador)', () => {
  const ruta = leer('app/api/operador/tarificador/atascos/route.ts')
  assert.match(ruta, /listarAtascos\(correduria\.id, \{ pendientesAviso: avisos, conCaptura: avisos, sinCapturaConDatos: true \}\)/)
  const det = leer('app/api/operador/tarificador/atascos/[id]/route.ts')
  assert.match(det, /if \(!operadorAutorizado\(req\)\) return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 401 \}\)/)
  const rob = leer('lib/tarificador-robustez.ts')
  assert.match(rob, /if \(o\.sinCapturaConDatos && f\.captura_con_datos === true\) return \{ capturaBase64: null, capturaMime: null \}/)
  assert.match(rob, /from seguros\.documentos where id = \$\{documentoId\}::uuid and correduria_id = \$\{correduriaId\}::uuid/, 'la captura solo de ESTA correduría')
})

test('guardado: la captura usa el nombre/mime de sus bytes y marca capturaConDatos en el error', () => {
  const src = leer('lib/tarificador.ts')
  assert.match(src, /nombre: nombreCapturaFallo\(id, mimeCap\), mime: mimeCap/)
  assert.match(src, /const marcaCaptura = capturaId && evidencia\?\.capturaConDatos \? \{ capturaConDatos: true \} : \{\}/)
})
