// Guardián del briefing diario (edge function `daily-briefing`).
//
// Regresión que cubre (27-28/08/2026): el briefing llegó a Telegram como «⚠️ daily-briefing
// error / NVIDIA 410» y NADA más, porque el fallo del LLM tumbaba el mensaje entero — cuando las
// métricas YA estaban calculadas y el modelo solo las envuelve en prosa. Y el stock colapsaba un
// «no se pudo consultar» a «no hay alertas» (regla de CLAUDE.md: `null` ≠ `[]`).
//
// El edge function es Deno y el typecheck del monorepo excluye `supabase/`, así que la lógica
// pura vive en `formato.ts` y se prueba desde aquí.

import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueContexto, bloquePlano, eur, mensajeBriefing, type Metricas } from '../supabase/functions/daily-briefing/formato.ts'

const base: Metricas = {
  numComandas: 12,
  totalVentas: 2162.49,
  ticketMedio: 180.2075,
  top5: ['Solomillo(4u)', 'Rabo(3u)'],
  personalActivo: 3,
  alertas: [],
}

test('eur: formato español, € detrás, miles con punto', () => {
  assert.equal(eur(2162.49), '2.162,49€')
  assert.equal(eur(2000.12), '2.000,12€')   // 4 cifras TAMBIÉN llevan separador
  assert.equal(eur(0), '0,00€')
})

test('sin IA se manda el briefing EN CRUDO con los datos, no solo el error', () => {
  const msg = mensajeBriefing('viernes, 28 de agosto', [{ nombre: 'La Taberna', m: base }], {
    texto: null,
    via: null,
    fallos: ['pasarela sin configurar (falta AI_GATEWAY_SECRET)', 'NVIDIA (x) falló: HTTP 410'],
  })
  // Los números sobreviven a la muerte del LLM: eso es lo que falló el 27-28/08.
  assert.match(msg, /12 comandas/)
  assert.match(msg, /2\.162,49€/)
  assert.match(msg, /Personal activo: 3/)
  // Y el motivo viaja en el mensaje, no se queda en un log que nadie mira.
  assert.match(msg, /Sin IA/)
  assert.match(msg, /AI_GATEWAY_SECRET/)
  assert.match(msg, /410/)
})

test('con IA se manda la prosa y el pie dice qué proveedor sirvió', () => {
  const msg = mensajeBriefing('viernes, 28 de agosto', [{ nombre: 'La Taberna', m: base }], {
    texto: 'Ayer fue un buen día.',
    via: 'Director · deepseek/deepseek-chat',
    fallos: [],
  })
  assert.match(msg, /Ayer fue un buen día\./)
  assert.match(msg, /Director · deepseek\/deepseek-chat/)
  assert.doesNotMatch(msg, /Sin IA/)
})

test('stock: null (no consultado) NO se pinta como «sin alertas»', () => {
  const sinConsultar = bloquePlano('La Taberna', { ...base, alertas: null })
  assert.match(sinConsultar, /no se pudo consultar/)

  const revisadoSinNada = bloquePlano('La Taberna', { ...base, alertas: [] })
  assert.doesNotMatch(revisadoSinNada, /no se pudo consultar/)
  assert.doesNotMatch(revisadoSinNada, /bajo mínimo/)

  const conAlertas = bloquePlano('La Taberna', { ...base, alertas: ['Vino tinto (2u)'] })
  assert.match(conAlertas, /bajo mínimo: Vino tinto \(2u\)/)
})

test('el prompt del LLM también distingue los tres estados del stock', () => {
  assert.match(bloqueContexto('X', { ...base, alertas: null }), /no se pudo consultar/)
  assert.match(bloqueContexto('X', { ...base, alertas: [] }), /revisado, nada bajo mínimo/)
  assert.match(bloqueContexto('X', { ...base, alertas: ['Vino (1u)'] }), /ALERTAS STOCK: Vino \(1u\)/)
  // Y el importe va en formato español también dentro del prompt.
  assert.match(bloqueContexto('X', base), /2\.162,49€/)
})
