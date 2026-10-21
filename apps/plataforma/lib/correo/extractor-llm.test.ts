// Extractor LLM en MODO SOMBRA (F2 del agente de correo, 21/10/2026). Runner: `node --test`. Fixtures INVENTADOS:
// nºs de prueba, «EMPRESA EJEMPLO SL», NIF/IBAN de forma válida pero ficticios. El modelo se inyecta: aquí no se gasta nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EventoAseguradora } from '@central/module-seguros'
import {
  extraerEnSombra, filtroPrevioLLM, modoExtractorLLM, topeDiarioLLM, topesLLM,
  type CorreoParaExtractor, type DepsExtractor, type PasadaLLM, type TopesLLM,
} from './extractor-llm.ts'

const CUERPO = [
  'Le informamos del cierre del expediente de la póliza 0094512345.',
  'Tomador: EMPRESA EJEMPLO SL (NIF 12345678Z). Cuenta ES91 2100 0418 4502 0005 1332.',
  'Recibo 480000123-H por importe de 1.234,56 €, fecha de efecto 15/09/2026.',
].join('\n')

const correo: CorreoParaExtractor = {
  messageId: '<prueba-1@mapfre.test>', from: 'avisos@mapfre.com', subject: 'Cierre de expediente', cuerpo: CUERPO,
  categoria: 'correduria', deCliente: false,
}

const TOPES: TopesLLM = { pasada: 2, dia: 10 }
const RESPUESTA = JSON.stringify({
  tipo: 'recibo', numero_poliza: '0094512345', numero_recibo: '480000123-H', tomador: 'EMPRESA EJEMPLO SL',
  fecha_efecto: '15/09/2026', importes: [{ concepto: 'recibo', valor: '1.234,56' }], estado: null, confianza: 0.8,
})

function deps(over: Partial<DepsExtractor> = {}) {
  const llamadas: { system: string; user: string }[] = []
  const guardados: Record<string, unknown>[] = []
  const d: DepsExtractor = {
    llamar: async (system, user) => { llamadas.push({ system, user }); return { texto: RESPUESTA, modelo: 'anthropic/claude-sonnet-4.5' } },
    usadasHoy: async () => 0,
    guardar: async (l) => { guardados.push(l); return true },
    ...over,
  }
  return { d, llamadas, guardados }
}

const ctx = (pasada: PasadaLLM = { usadas: 0 }, modo: 'off' | 'sombra' = 'sombra') => ({ modo, topes: TOPES, pasada, transcurridoMs: 1_000 })

test('el interruptor: solo «sombra» lo enciende; sin poner, APAGADO', () => {
  assert.equal(modoExtractorLLM(undefined), 'off')
  assert.equal(modoExtractorLLM(''), 'off')
  assert.equal(modoExtractorLLM('on'), 'off')
  assert.equal(modoExtractorLLM('vivo'), 'off')
  assert.equal(modoExtractorLLM(' Sombra '), 'sombra')
})

test('topes desde el entorno: por defecto 2/25, con techo, e ilegible = por defecto', () => {
  assert.deepEqual(topesLLM({}), { pasada: 2, dia: 25 })
  assert.deepEqual(topesLLM({ CORREO_LLM_TOPE_PASADA: '4', CORREO_LLM_TOPE_DIA: '9999' }), { pasada: 4, dia: 200 })
  assert.deepEqual(topesLLM({ CORREO_LLM_TOPE_PASADA: 'muchos', CORREO_LLM_TOPE_DIA: '-3' }), { pasada: 2, dia: 25 })
  assert.deepEqual(topesLLM({ CORREO_LLM_TOPE_PASADA: '0' }), { pasada: 0, dia: 25 })
})

test('🚨 CEPO: modo off → no llama al modelo', async () => {
  const { d, llamadas } = deps()
  const r = await extraerEnSombra(correo, null, ctx({ usadas: 0 }, 'off'), d)
  assert.deepEqual(r, { llamado: false, motivo: 'apagado' })
  assert.equal(llamadas.length, 0)
})

test('🚨 CEPO: correo excluido por seguridad (TIREA, credenciales, secreto en cuerpo o adjunto) → no llama al modelo', async () => {
  const casos: CorreoParaExtractor[] = [
    { ...correo, from: 'altas@tirea.es', subject: 'Alta CIMA' },
    { ...correo, subject: 'Recuperación de la clave de acceso' },
    { ...correo, cuerpo: `${CUERPO}\nUsuario: mediador01 Contraseña: Xy12345` },
  ]
  for (const c of casos) {
    const { d, llamadas } = deps()
    const r = await extraerEnSombra(c, null, ctx(), d)
    assert.equal(r.llamado, false, `${c.from} · ${c.subject}`)
    assert.equal(llamadas.length, 0, `llegó al modelo: ${c.from} · ${c.subject}`)
  }
  const { d, llamadas } = deps({ textoAdjuntos: async () => 'Acceso al portal. Password: Secreta123' })
  const r = await extraerEnSombra(correo, null, ctx(), d)
  assert.deepEqual(r, { llamado: false, motivo: 'excluido' })
  assert.equal(llamadas.length, 0, 'un secreto en el PDF llegó al modelo')
})

test('🚨 CEPO: tope por pasada → la tercera no llama (y la que falla también cuenta)', async () => {
  const pasada: PasadaLLM = { usadas: 0 }
  let n = 0
  const { d } = deps({ llamar: async () => { n++; if (n === 1) throw new Error('caído'); return { texto: RESPUESTA, modelo: 'm/x' } } })
  const r1 = await extraerEnSombra(correo, null, ctx(pasada), d)
  const r2 = await extraerEnSombra({ ...correo, messageId: '<2>' }, null, ctx(pasada), d)
  const r3 = await extraerEnSombra({ ...correo, messageId: '<3>' }, null, ctx(pasada), d)
  assert.deepEqual(r1, { llamado: true, proposito: 'cola_larga', ok: false, motivo: 'fallo_modelo' })
  assert.equal(r2.llamado, true)
  assert.deepEqual(r3, { llamado: false, motivo: 'tope_pasada' })
  assert.equal(n, 2)
})

test('🚨 CEPO: tope diario; contador ilegible = no se llama; la comparación solo usa la mitad', async () => {
  assert.equal(topeDiarioLLM('cola_larga', 10, TOPES), 'tope_dia')
  assert.equal(topeDiarioLLM('cola_larga', 9, TOPES), null)
  assert.equal(topeDiarioLLM('cola_larga', null, TOPES), 'sin_contador')
  assert.equal(topeDiarioLLM('comparacion', 5, TOPES), 'tope_comparacion')
  assert.equal(topeDiarioLLM('comparacion', 4, TOPES), null)
  for (const usadas of [10, null]) {
    const { d, llamadas } = deps({ usadasHoy: async () => usadas })
    const r = await extraerEnSombra(correo, null, ctx(), d)
    assert.equal(r.llamado, false)
    assert.equal(llamadas.length, 0, `llamó con usadasHoy=${usadas}`)
  }
  const { d, llamadas } = deps({ usadasHoy: async () => { throw new Error('bd caída') } })
  assert.deepEqual(await extraerEnSombra(correo, null, ctx(), d), { llamado: false, motivo: 'sin_contador' })
  assert.equal(llamadas.length, 0)
})

test('filtro previo: solo correduría, nunca un cliente ni un remitente que no es aseguradora, y con tiempo', () => {
  const p = { modo: 'sombra' as const, topes: TOPES, usadasPasada: 0, transcurridoMs: 0 }
  assert.equal(filtroPrevioLLM(correo, p), null)
  assert.equal(filtroPrevioLLM({ ...correo, categoria: 'contabilidad' }, p), 'categoria')
  assert.equal(filtroPrevioLLM({ ...correo, deCliente: true }, p), 'cliente')
  assert.equal(filtroPrevioLLM({ ...correo, from: 'alguien@gmail.com' }, p), 'remitente')
  assert.equal(filtroPrevioLLM(correo, { ...p, transcurridoMs: 160_000 }), 'sin_tiempo')
})

test('🚨 el payload del modelo no lleva IBAN ni NIF; lo guardado, ni tomador', async () => {
  const { d, llamadas, guardados } = deps()
  const r = await extraerEnSombra(correo, null, ctx(), d)
  assert.equal(r.llamado && r.ok, true)
  assert.equal(llamadas.length, 1)
  assert.ok(!llamadas[0].user.includes('12345678Z'), 'el NIF llega al modelo')
  assert.ok(!/ES91\s?2100/.test(llamadas[0].user), 'el IBAN llega al modelo')
  const g = JSON.stringify(guardados[0])
  assert.ok(!g.includes('EJEMPLO'), 'se guarda el nombre del tomador')
  assert.equal(guardados[0].proposito, 'cola_larga')
  assert.equal((guardados[0].ficha as Record<string, unknown>).numeroPoliza, '0094512345')
})

test('con lector: se compara y se guarda la comparación; el resultado no devuelve nada que aplicar', async () => {
  const lector: EventoAseguradora = {
    tipo: 'pre_anulacion', compania: 'occident', codigoDgs: 'C0468', ilegibles: 0,
    recibos: [{ numeroPoliza: '0094512345', idRecibo: '480000123-H', importe: 1234.56, fechaLimite: null }],
  }
  const { d, guardados } = deps()
  const r = await extraerEnSombra(correo, lector, ctx(), d)
  assert.ok(r.llamado && r.ok)
  if (!(r.llamado && r.ok)) return
  assert.equal(r.proposito, 'comparacion')
  assert.equal(r.fallos, 0)
  assert.ok((r.aciertos ?? 0) >= 4)
  assert.deepEqual(Object.keys(r).sort(), ['aciertos', 'fallos', 'guardado', 'llamado', 'noLiterales', 'ok', 'proposito'])
  assert.equal((guardados[0].comparacion as { tipoLector: string }).tipoLector, 'pre_anulacion')
})

test('el triaje no aplica nada del extractor: solo cuenta (lee el FUENTE)', () => {
  const src = readFileSync(join(import.meta.dirname, 'triaje.ts'), 'utf8')
  const i = src.indexOf('await extraerEnSombra(')
  assert.ok(i > 0, 'el triaje no llama al extractor')
  const tramo = src.slice(i, src.indexOf('\n          }\n', i))
  assert.ok(!/tgAviso|tgSend|registrarEvento|anotarHistorial/.test(tramo), 'el extractor en sombra avisa o escribe en la cartera')
  // El correo excluido ni siquiera llega a la rama de correduría: la categoría excluida no es una de las del extractor.
  assert.match(src, /modoLLM === 'sombra' && \(c\.categoria === 'correduria' \|\| c\.categoria === 'correduria-recibo'\)/)
})
