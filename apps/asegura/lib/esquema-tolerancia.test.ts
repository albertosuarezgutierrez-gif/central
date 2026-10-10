// Cepo estructural: los puntos que tocan columnas/tabla del SQL de 08/10/2026 deben estar protegidos por la
// comprobación de esquema opcional. Si alguien los vuelve a hacer incondicionales, esto se pone rojo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8')

test('reservarSinDuplicado comprueba hayHuella ANTES de tocar `huella`, y sin ella sigue reservando en libro', () => {
  const s = leer('./codeoscopic/consumo.ts')
  const i = s.indexOf('export async function reservarSinDuplicado')
  const cuerpo = s.slice(i)
  const iGuarda = cuerpo.indexOf('if (!(await hayHuella()))')
  const iHuella = cuerpo.indexOf('and huella =')
  assert.ok(iGuarda > 0 && iGuarda < iHuella, 'la guarda hayHuella debe ir antes de usar la columna')
  assert.match(cuerpo.slice(iGuarda, iHuella), /await reservar\(/, 'sin huella se reserva igualmente en el libro')
})

test('tarificador: bot_version y pasos solo con esquema presente', () => {
  const s = leer('./tarificador.ts')
  assert.match(s, /const conBot = await hayBotVersion\(\)/)
  assert.match(s, /interno\.traza && \(await hayPasos\(\)\)/)
  assert.match(s, /conBotVersion/)
})

test('bandeja/traza: lecturas toleran falta de columna y tabla', () => {
  const s = leer('./tarificador-bandeja.ts')
  assert.match(s, /await hayBotVersion\(\)/)
  assert.match(s, /await hayPasos\(\)/)
  assert.match(s, /null::text as bot_version/)
})
