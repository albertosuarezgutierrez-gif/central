import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { contrasenasDesdeDni, leerPdfProbando, pdfCifrado } from './pdf-contrasena.ts'

// PDF real cifrado AES-256 con contraseña de usuario «12345678Z» (DNI ficticio), texto «POLIZA 46300 TERRACAN».
const PDF = readFileSync(new URL('./fixture-poliza-con-dni.pdf', import.meta.url))

test('candidatas: DNI normalizado, en minúsculas y sin la letra; sin DNI, ninguna', () => {
  assert.deepEqual(contrasenasDesdeDni(' 12.345.678-z '), ['12345678Z', '12345678z', '12345678'])
  assert.deepEqual(contrasenasDesdeDni('X1234567L'), ['X1234567L', 'x1234567l', 'X1234567'])
  assert.deepEqual(contrasenasDesdeDni(null), [])
  assert.deepEqual(contrasenasDesdeDni('  '), [])
})

test('🪤 pdf-parse no abre el PDF cifrado (y su error varía: por eso se detecta /Encrypt)', async () => {
  assert.equal(pdfCifrado(PDF), true)
  assert.equal(pdfCifrado(Buffer.from('%PDF-1.4 sin cifrar')), false)
  const pdfParse = createRequire(import.meta.url)('pdf-parse') as (b: Buffer) => Promise<unknown>
  await assert.rejects(pdfParse(PDF))
})

test('🪤 el DNI de la ficha abre el PDF, aunque esté guardado en minúsculas', async () => {
  const r = await leerPdfProbando(PDF, ['00000000T', ...contrasenasDesdeDni('12345678z')])
  assert.equal(r.ok, true)
  assert.match(r.ok ? r.texto : '', /POLIZA 46300 TERRACAN/)
})

test('🪤 un DNI que no es el suyo NO lo abre, y lo dice distinto de «sin DNI»', async () => {
  assert.deepEqual(await leerPdfProbando(PDF, contrasenasDesdeDni('87654321X')), { ok: false, motivo: 'ninguna_vale' })
  assert.deepEqual(await leerPdfProbando(PDF, []), { ok: false, motivo: 'sin_candidatas' })
})

