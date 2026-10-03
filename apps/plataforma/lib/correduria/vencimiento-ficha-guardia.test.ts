import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8')

test('póliza: la alerta de vencimiento solo se calcula en pólizas vivas y no canceladas', () => {
  const src = leer('../../app/(usuario)/correduria/poliza/[id]/page.tsx')
  assert.match(src, /const venc = p\.viva && !cancelada \? alertaVencimiento\(/)
})

test('SegurosCliente: alertaVencimiento recibe la fecha de referencia (hoy), no la hora del servidor', () => {
  const src = leer('../../app/(usuario)/correduria/cliente/[id]/SegurosCliente.tsx')
  assert.match(src, /alertaVencimiento\(e\.ultimaFecha, hoy\)/)
})
