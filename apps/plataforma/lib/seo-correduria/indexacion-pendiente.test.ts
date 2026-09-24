import { test } from 'node:test'
import assert from 'node:assert/strict'
import { urlsBlogPendientesIndexar, promptClaudeChromeIndexacion } from './indexacion-pendiente.ts'
import type { DatosCobertura } from './tipos.ts'

test('urlsBlogPendientesIndexar: filtra solo /blog/, estado ok y verdicto != PASS', () => {
  const cobertura: DatosCobertura = {
    paginas: [
      { url: 'https://grupoasegura.es/blog/como-dar-de-baja-un-seguro-a-tiempo', estado: 'ok', verdicto: 'NEUTRAL' },
      { url: 'https://grupoasegura.es/blog/que-cubre-de-verdad-el-seguro-de-hogar', estado: 'ok', verdicto: 'PASS' },
      { url: 'https://grupoasegura.es/seguros/hogar', estado: 'error', detalle: 'timeout' },
      { url: 'https://grupoasegura.es/blog/siniestro-denegado-que-hacer', estado: 'ok', verdicto: 'NEUTRAL' },
    ],
  }
  assert.deepEqual(urlsBlogPendientesIndexar(cobertura), [
    'https://grupoasegura.es/blog/como-dar-de-baja-un-seguro-a-tiempo',
    'https://grupoasegura.es/blog/siniestro-denegado-que-hacer',
  ])
})

test('urlsBlogPendientesIndexar: un error de lectura no se cuenta como pendiente (no se ha mirado, no hace falta pedirlo)', () => {
  const cobertura: DatosCobertura = {
    paginas: [{ url: 'https://grupoasegura.es/blog/preaviso-un-mes-no-renovar-seguro', estado: 'error', detalle: 'sin tiempo' }],
  }
  assert.deepEqual(urlsBlogPendientesIndexar(cobertura), [])
})

test('urlsBlogPendientesIndexar: vacío si todo el blog está indexado', () => {
  const cobertura: DatosCobertura = {
    paginas: [{ url: 'https://grupoasegura.es/blog/x', estado: 'ok', verdicto: 'PASS' }],
  }
  assert.deepEqual(urlsBlogPendientesIndexar(cobertura), [])
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
