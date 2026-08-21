import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, zipUnaEntrada, solicitudEnBase64 } from '../src/zip.ts'

test('crc32 coincide con el vector conocido de "123456789"', () => {
  // Vector estándar del CRC-32 (IEEE 802.3): 0xCBF43926. Sin un valor externo, un test del CRC
  // solo confirmaría la implementación contra sí misma.
  assert.equal(crc32(Buffer.from('123456789', 'ascii')), 0xcbf43926)
})

test('la salida es un ZIP que `unzip` abre y cuyo contenido sobrevive intacto', () => {
  // 🚨 Este es EL test del fichero. La versión anterior de este código usaba gzip creyendo que
  // valía, y unos tests escritos con la misma suposición lo habrían bendecido igual. Solo un
  // lector de ZIP de verdad, ajeno a este código, distingue las dos cosas.
  const xml = '<a>áé "ñ" <b>&</b></a>'
  const dir = mkdtempSync(join(tmpdir(), 'ses-zip-'))
  try {
    const f = join(dir, 'p.zip')
    writeFileSync(f, zipUnaEntrada('solicitud.xml', xml))
    // -p vuelca la entrada por stdout; si el contenedor estuviese mal, unzip falla con código != 0.
    const salida = execFileSync('unzip', ['-p', f], { maxBuffer: 1 << 20 })
    assert.equal(salida.toString('utf8'), xml)
    const listado = execFileSync('unzip', ['-l', f]).toString('utf8')
    assert.match(listado, /solicitud\.xml/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('el mismo contenido produce SIEMPRE los mismos bytes', () => {
  // No es cosmético: SES rechaza como «lote duplicado» un XML idéntico a uno anterior, y esa red
  // de seguridad solo funciona si nuestra salida es reproducible. Una fecha tomada del reloj la
  // rompería sin que nada más fallase.
  const a = zipUnaEntrada('solicitud.xml', '<x/>')
  const b = zipUnaEntrada('solicitud.xml', '<x/>')
  assert.deepEqual(a, b)
})

test('contenidos distintos producen bytes distintos', () => {
  assert.notDeepEqual(zipUnaEntrada('solicitud.xml', '<x/>'), zipUnaEntrada('solicitud.xml', '<y/>'))
})

test('solicitudEnBase64 devuelve base64 de un ZIP (firma PK\\x03\\x04)', () => {
  const b64 = solicitudEnBase64('<x/>')
  const bytes = Buffer.from(b64, 'base64')
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04])
  // Y NO es gzip, que empieza por 1f 8b. Es la confusión que costó el error 10111.
  assert.notDeepEqual([...bytes.subarray(0, 2)], [0x1f, 0x8b])
})
