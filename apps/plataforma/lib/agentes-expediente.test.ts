import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatearExpediente, SYSTEM_CONSULTA, type Expediente } from './agentes-expediente.ts'

const FICHA = {
  id: 'psd2-health-check',
  nombre: 'Guardián PSD2',
  funcion: 'Comprueba que los movimientos bancarios llegan frescos',
  cadencia: 'Semanal (lunes)',
  disparo: 'trigger Claude Code web',
  entrega: 'acción directa',
  telegram: true,
  archivo: '.claude/skills/psd2-health-check/SKILL.md',
  vertical: 'plataforma',
  estado: 'activo',
}

const base: Expediente = { ficha: FICHA, salud: null, latidos: [], latidosEsperados: [], vigia: null }

test('la ficha del catálogo entra entera', () => {
  const t = formatearExpediente(base)
  assert.match(t, /Guardián PSD2/)
  assert.match(t, /psd2-health-check/)
  assert.match(t, /Semanal \(lunes\)/)
  assert.match(t, /avisa por Telegram/)
})

test('sin telemetría se declara como «no se sabe», nunca como parado', () => {
  const t = formatearExpediente({ ...base, salud: { estado: 'gris', detalle: 'sin telemetría', ultima: null, horas: null } })
  assert.match(t, /SIN TELEMETRÍA/)
  assert.match(t, /no significa que esté parado/)
})

test('sin fila de salud dice «no consta», no inventa un estado', () => {
  const t = formatearExpediente(base)
  assert.match(t, /No consta: este agente no tiene fila de salud/)
  assert.doesNotMatch(t, /Estado: VERDE/)
})

test('un latido con detalle trae lo que el agente dejó dicho', () => {
  const t = formatearExpediente({
    ...base,
    latidos: [{ agente: 'psd2_health_check', ultimo_at: '2026-09-01T06:00:00.000Z', ultimo_ok_at: '2026-09-01T06:00:00.000Z', ok: true, detalle: '4 cuentas frescas' }],
  })
  assert.match(t, /«4 cuentas frescas»/)
  assert.match(t, /2026-09-01 06:00 UTC/)
  assert.match(t, /resultado de la última: ok/)
})

test('una pasada fallida se lee como FALLÓ y conserva la última buena', () => {
  const t = formatearExpediente({
    ...base,
    latidos: [{ agente: 'x', ultimo_at: '2026-09-02T06:00:00.000Z', ultimo_ok_at: '2026-08-25T06:00:00.000Z', ok: false, detalle: null }],
  })
  assert.match(t, /resultado de la última: FALLÓ/)
  assert.match(t, /última pasada BUENA 2026-08-25/)
  assert.match(t, /Lo que dejó dicho: nada/)
})

test('latido esperado y ausente NO se confunde con «no tiene latido»', () => {
  const esperado = formatearExpediente({ ...base, latidosEsperados: ['psd2_health_check'] })
  assert.match(esperado, /y NO hay ninguna fila/)
  assert.match(esperado, /no que no tuviera trabajo/)

  const sinLatido = formatearExpediente(base)
  assert.match(sinLatido, /no tiene latido declarado/)
  assert.doesNotMatch(sinLatido, /NO hay ninguna fila/)
})

test('un fallo de la propia sonda se declara como tal', () => {
  const t = formatearExpediente({
    ...base,
    vigia: { evaluado_at: '2026-09-02T05:00:00.000Z', alerta: true, horas: null, max_horas: 192, motivo: 'no se pudo comprobar', nota: null, sonda_error: 'timeout al leer agente_latidos' },
  })
  assert.match(t, /¿Falló la propia comprobación\?: SÍ — timeout al leer agente_latidos/)
  assert.match(t, /Desfase medido: no consta/)
})

test('sin vigía se dice que no lo vigila, no que esté bien', () => {
  const t = formatearExpediente(base)
  assert.match(t, /el vigía no vigila a este agente/)
})

test('una fecha inválida no revienta ni se inventa', () => {
  const t = formatearExpediente({ ...base, latidos: [{ agente: 'x', ultimo_at: 'ayer', ultimo_ok_at: null, ok: null, detalle: null }] })
  assert.match(t, /última pasada ayer/)
  assert.match(t, /última pasada BUENA no consta/)
  assert.match(t, /resultado de la última: no consta/)
})

test('el system prompt prohíbe lo que más caro sale', () => {
  assert.match(SYSTEM_CONSULTA, /NO eres ese agente/)
  assert.match(SYSTEM_CONSULTA, /no se sabe/)
  assert.match(SYSTEM_CONSULTA, /sonda_error/)
})
