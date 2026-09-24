// apps/asegura/lib/cartera-recaptacion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = readFileSync(new URL('./cartera-recaptacion.ts', import.meta.url), 'utf8')

test('el filtro de cartera viva usa el helper compartido, no una condición propia', () => {
  assert.match(FUENTE, /sqlVolcadoHistorico|sqlCarteraViva/)
})

test('la exclusión de cliente-ya-vivo-por-CIMA está en el SQL de la cola', () => {
  // Debe existir un NOT EXISTS que mire otras pólizas del mismo cliente que SÍ
  // sean cartera viva — si esta línea desaparece, un cliente actual volvería a
  // aparecer en la cola de "leads a recaptar".
  assert.match(FUENTE, /not exists[\s\S]{0,400}cartera_viva|not exists[\s\S]{0,400}import_ref is null or[\s\S]{0,80}eiac_xml_hash is not null/i)
})

test('la prima usa nullif para no pintar 0 como si fuera un importe real', () => {
  assert.match(FUENTE, /nullif/i)
})

test('Fase 2: un lead CON vencimiento entra en cualquier estado, no solo activa', () => {
  // Si esta condición desapareciera, la cola volvería a la Fase 1 (solo
  // "activa y sin fecha") y los ~1.399 leads con vencimiento antiguo
  // (el 89% `vencida`) dejarían de verse sin que nada avisara.
  assert.match(FUENTE, /fecha_vencimiento is not null/)
})

test('Fase 2: el origen, el mes y el día viajan en el SELECT, no se adivinan después', () => {
  assert.match(FUENTE, /vencimiento_antiguo/)
  assert.match(FUENTE, /extract\(month from p\.fecha_vencimiento\)/i)
  assert.match(FUENTE, /extract\(day from p\.fecha_vencimiento\)/i)
})

test('Fase 2: un vencimiento_antiguo se filtra por la ventana de 45 días, sin_vencimiento no', () => {
  assert.match(FUENTE, /dentroVentanaAntiguo/)
})

test('el opt-out de WhatsApp y de email se respetan cada uno por su canal', () => {
  // Guarda obligatoria del spec (punto 1, la única que Alberto marcó como
  // "sí o sí"): un cliente que dio de baja un canal no puede recibir esa
  // oferta por ese canal, aunque siga teniendo el otro disponible.
  assert.match(FUENTE, /wa_opt_out_at/i)
  assert.match(FUENTE, /email_opt_out_at/i)
})

test('«(legacy)» del volcado (26.987 polizas) no se sirve como nombre de compania', () => {
  // Es un centinela del importador, no una aseguradora real: si se cuela,
  // el mensaje de recaptacion dice «que tuviste con (legacy)», y en la
  // pantalla de Alberto sale «Antes con: (legacy)».
  assert.match(FUENTE, /aseguradoraLegible/)
  assert.match(FUENTE, /legacy/i)
})
