import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ADJ_COMPANIA_MAX_BYTES, ADJ_COMPANIA_MAX_POR_CORREO, ADJ_COMPANIA_PRESUPUESTO_PASADA, adjuntosDeCompania } from './adjuntos-compania.ts'

// F1 del agente corredor de correo (21/10/2026): qué PDF de un correo de compañía se conservan. Fixtures inventados.
const pdf = (n: number) => { const b = Buffer.alloc(n, 0x20); Buffer.from('%PDF-1.4\n', 'latin1').copy(b); return b }
const adj = (n: number, nombre = 'doc.pdf') => ({ contentType: 'application/pdf', filename: nombre, content: pdf(n) })
const pres = () => ({ bytes: ADJ_COMPANIA_PRESUPUESTO_PASADA })

test('aseguradora con PDF → se conserva; topes declarados', () => {
  const r = adjuntosDeCompania({ from: 'mediadores@occidentinforma.com', excluido: false }, [adj(50_000)], pres())
  assert.equal(r?.adjuntos.length, 1)
  assert.equal(r?.omitidos, 0)
  assert.equal(ADJ_COMPANIA_MAX_POR_CORREO, 5)
  assert.ok(ADJ_COMPANIA_MAX_BYTES * 1.37 < 4_500_000, 'en base64 tiene que caber en el cuerpo de Vercel')
})

test('🪤 adjunto por encima del tope → NO se conserva y se CUENTA (el triaje lo suma a ilegibles)', () => {
  const r = adjuntosDeCompania({ from: 'mediador@allianz.es', excluido: false }, [adj(ADJ_COMPANIA_MAX_BYTES + 1), adj(10 * 1024 * 1024 + 1)], pres())
  assert.deepEqual(r && { n: r.adjuntos.length, omitidos: r.omitidos }, { n: 0, omitidos: 2 })
})

test('más de 5 por correo o sin presupuesto de pasada → los que sobran, omitidos (contados)', () => {
  const r = adjuntosDeCompania({ from: 'mediador@allianz.es', excluido: false }, Array.from({ length: 7 }, (_, i) => adj(1000, `d${i}.pdf`)), pres())
  assert.equal(r?.adjuntos.length, 5)
  assert.equal(r?.omitidos, 2)
  const p = { bytes: 1500 }
  const r2 = adjuntosDeCompania({ from: 'mediador@allianz.es', excluido: false }, [adj(1000), adj(1000)], p)
  assert.equal(r2?.adjuntos.length, 1)
  assert.equal(r2?.omitidos, 1)
  assert.equal(p.bytes, 500)
})

test('🛡️ correo EXCLUIDO por seguridad → nada (ni se mira la lista); y fuera de aseguradoras tampoco', () => {
  assert.equal(adjuntosDeCompania({ from: 'mediador@allianz.es', excluido: true }, [adj(1000)], pres()), null)
  assert.equal(adjuntosDeCompania({ from: 'soporte@tirea.es', excluido: false }, [adj(1000)], pres()), null)
  assert.equal(adjuntosDeCompania({ from: 'avant2@codeoscopic.com', excluido: false }, [adj(1000)], pres()), null)
  assert.equal(adjuntosDeCompania({ from: 'alguien@gmail.com', excluido: false }, [adj(1000)], pres()), null)
})

test('solo PDF de verdad: una imagen no cuenta; un «.pdf» que no es PDF se cuenta como omitido', () => {
  const r = adjuntosDeCompania({ from: 'mediador@allianz.es', excluido: false }, [
    { contentType: 'image/png', filename: 'logo.png', content: Buffer.alloc(20_000) },
    { contentType: 'application/pdf', filename: 'falso.pdf', content: Buffer.from('<html></html>') },
  ], pres())
  assert.deepEqual(r && { n: r.adjuntos.length, omitidos: r.omitidos }, { n: 0, omitidos: 1 })
})
