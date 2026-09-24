import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SOLICITUDES_DIA, urlsPendientesIndexar, promptClaudeChromeIndexacion } from './indexacion-pendiente.ts'
import type { DatosCobertura } from './tipos.ts'

test('urlsPendientesIndexar: cualquier página propia no legal sin indexar, no solo el blog', () => {
  const cobertura: DatosCobertura = {
    paginas: [
      { url: 'https://grupoasegura.es/seguros/comunidades', estado: 'ok', verdicto: 'NEUTRAL' },
      { url: 'https://grupoasegura.es/legal/privacidad', estado: 'ok', verdicto: 'NEUTRAL' },
      { url: 'https://grupoasegura.es/', estado: 'ok', verdicto: 'PASS' },
    ],
  }
  assert.deepEqual(urlsPendientesIndexar(cobertura), ['https://grupoasegura.es/seguros/comunidades'])
})

test('promptClaudeChromeIndexacion: no pide más de las que admite Search Console al día', () => {
  const urls = Array.from({ length: MAX_SOLICITUDES_DIA + 3 }, (_, i) => `https://grupoasegura.es/p${i}`)
  const p = promptClaudeChromeIndexacion(urls)!
  assert.match(p, new RegExp(`${MAX_SOLICITUDES_DIA}\\. https://grupoasegura\\.es/p${MAX_SOLICITUDES_DIA - 1}\\n`))
  assert.doesNotMatch(p, new RegExp(`/p${MAX_SOLICITUDES_DIA}\\b`))
  assert.match(p, /Quedan 3 más/)
})

test('urlsPendientesIndexar: filtra estado ok y verdicto != PASS', () => {
  const cobertura: DatosCobertura = {
    paginas: [
      { url: 'https://grupoasegura.es/blog/como-dar-de-baja-un-seguro-a-tiempo', estado: 'ok', verdicto: 'NEUTRAL' },
      { url: 'https://grupoasegura.es/blog/que-cubre-de-verdad-el-seguro-de-hogar', estado: 'ok', verdicto: 'PASS' },
      { url: 'https://grupoasegura.es/seguros/hogar', estado: 'error', detalle: 'timeout' },
      { url: 'https://grupoasegura.es/blog/siniestro-denegado-que-hacer', estado: 'ok', verdicto: 'NEUTRAL' },
    ],
  }
  assert.deepEqual(urlsPendientesIndexar(cobertura), [
    'https://grupoasegura.es/blog/como-dar-de-baja-un-seguro-a-tiempo',
    'https://grupoasegura.es/blog/siniestro-denegado-que-hacer',
  ])
})

test('urlsPendientesIndexar: un error de lectura no se cuenta como pendiente (no se ha mirado, no hace falta pedirlo)', () => {
  const cobertura: DatosCobertura = {
    paginas: [{ url: 'https://grupoasegura.es/blog/preaviso-un-mes-no-renovar-seguro', estado: 'error', detalle: 'sin tiempo' }],
  }
  assert.deepEqual(urlsPendientesIndexar(cobertura), [])
})

test('urlsPendientesIndexar: vacío si todo el blog está indexado', () => {
  const cobertura: DatosCobertura = {
    paginas: [{ url: 'https://grupoasegura.es/blog/x', estado: 'ok', verdicto: 'PASS' }],
  }
  assert.deepEqual(urlsPendientesIndexar(cobertura), [])
})

test('promptClaudeChromeIndexacion: null sin URLs', () => {
  assert.equal(promptClaudeChromeIndexacion([]), null)
})

test('promptClaudeChromeIndexacion: lista numerada y pide "Solicitar indexación"', () => {
  const p = promptClaudeChromeIndexacion(['https://grupoasegura.es/blog/a', 'https://grupoasegura.es/blog/b'])
  assert.ok(p)
  assert.match(p!, /search\.google\.com\/search-console\?resource_id=sc-domain:grupoasegura\.es/)
  assert.match(p!, /1\. https:\/\/grupoasegura\.es\/blog\/a/)
  assert.match(p!, /2\. https:\/\/grupoasegura\.es\/blog\/b/)
  assert.match(p!, /Solicitar indexación/)
})

test('promptClaudeChromeIndexacion: singular/plural en el enunciado', () => {
  const uno = promptClaudeChromeIndexacion(['https://grupoasegura.es/blog/a'])
  assert.match(uno!, /esta 1 URL,/)
  const dos = promptClaudeChromeIndexacion(['https://grupoasegura.es/blog/a', 'https://grupoasegura.es/blog/b'])
  assert.match(dos!, /estas 2 URLs,/)
})
