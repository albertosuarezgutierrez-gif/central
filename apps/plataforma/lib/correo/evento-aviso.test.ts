import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eventoConfirmado, leerResultadosEvento, textoAvisoEvento, type ResultadoPuertoEvento } from './evento-aviso.ts'
import type { EventoAseguradora } from '@central/module-seguros'

const url = (id: string) => `https://x/ficha/${id}`

const preAnulacion: EventoAseguradora = {
  tipo: 'pre_anulacion', compania: 'occident', codigoDgs: 'C0468', ilegibles: 0,
  recibos: [{ numeroPoliza: 'BIDS000001', idRecibo: '480000001-H', importe: 1494.69, fechaLimite: '2026-10-15' }],
}
const siniestro: EventoAseguradora = {
  tipo: 'siniestro', compania: 'occident', codigoDgs: 'C0468', ilegibles: 0,
  siniestros: [{ subtipo: 'apertura', numeroSiniestro: '43000001', numeroPoliza: '806000001', ramo: null, fechaOcurrencia: '2026-09-15', fechaAccion: null, accion: 'Apertura de expediente' }],
}
const base: ResultadoPuertoEvento = {
  clave: 'BIDS000001/480000001-H', estado: 'aplicado', repetido: false, resumen: 'tarea creada, vence 15/10/2026', motivo: null,
  clienteId: 'c1', cliente: 'Persona Prueba', numeroPoliza: 'BIDS000001', tareaVence: '2026-10-15',
}

test('leerResultadosEvento: descarta filas raras, no las inventa', () => {
  assert.equal(leerResultadosEvento(null), null)
  assert.equal(leerResultadosEvento({ estado: 'ok' }), null)
  const r = leerResultadosEvento({ resultados: [base, { clave: 'x', estado: 'otro' }, { estado: 'aplicado' }, 7] })
  assert.equal(r?.length, 1)
  assert.equal(r?.[0].tareaVence, '2026-10-15')
})

test('aplicado con tarea: dice quién, qué se hizo y cuándo vence, con enlace a la ficha', () => {
  const t = textoAvisoEvento(preAnulacion, 'Resumen de recibos próximos a la anulación', [base], url)
  assert.match(t, /Recibo a punto de ANULARSE/)
  assert.match(t, /1\.494,69€/)
  assert.match(t, /Persona Prueba/)
  assert.match(t, /tarea creada, vence 15\/10\/2026/)
  assert.match(t, /href="https:\/\/x\/ficha\/c1"/)
})

test('siniestro abierto en la ficha y siniestro ya en CIMA se distinguen', () => {
  const abierto = textoAvisoEvento(siniestro, 'Siniestro Diversos 43000001', [{ ...base, clave: '43000001', resumen: 'siniestro 43000001 abierto en la ficha', tareaVence: null }], url)
  assert.match(abierto, /✅ .*siniestro 43000001 abierto en la ficha/)
  const cima = textoAvisoEvento(siniestro, 'Siniestro Diversos 43000001', [{ ...base, clave: '43000001', estado: 'duplicado_cima', resumen: 'siniestro 43000001 ya en CIMA: nota de seguimiento en la ficha', tareaVence: null }], url)
  assert.match(cima, /ℹ️ .*ya en CIMA/)
})

test('póliza no encontrada → lo dice y manda a la bandeja de Mi mesa', () => {
  const t = textoAvisoEvento(preAnulacion, 'x', [{ ...base, estado: 'sin_resolver', resumen: null, clienteId: null, cliente: null, tareaVence: null }], url)
  assert.match(t, /❔ póliza no encontrada → bandeja/)
  assert.match(t, /Correos de compañía/)
  assert.doesNotMatch(t, /ficha<\/a>/)
})

test('puerto caído: avisa con lo leído y dice que la cartera NO lo sabe (nunca «hecho»)', () => {
  const t = textoAvisoEvento(preAnulacion, 'x', null, url, { estado: 'sin_respuesta', motivo: 'HTTP 503' })
  assert.match(t, /BIDS000001/)
  assert.match(t, /No se pudo confirmar en la cartera \(HTTP 503\)/)
  assert.doesNotMatch(t, /tarea creada/)
  const r = textoAvisoEvento(preAnulacion, 'x', null, url, { estado: 'rechazado', motivo: 'compañía desconocida' })
  assert.match(r, /RECHAZÓ/)
})

test('elemento que asegura no devolvió y correo repetido se dicen', () => {
  assert.match(textoAvisoEvento(preAnulacion, 'x', [], url), /asegura no devolvió este elemento/)
  assert.match(textoAvisoEvento(preAnulacion, 'x', [{ ...base, repetido: true }], url), /ya procesado antes/)
})

test('el HTML del asunto y del cliente va escapado', () => {
  const t = textoAvisoEvento(preAnulacion, '<b>x</b>', [{ ...base, cliente: 'A & <B>' }], url)
  assert.match(t, /&lt;b&gt;x&lt;\/b&gt;/)
  assert.match(t, /A &amp; &lt;B&gt;/)
})

// ── Cepos sobre el triaje (lo que no se puede probar sin IMAP) ────────────────

const TRIAJE = readFileSync(join(import.meta.dirname, 'triaje.ts'), 'utf8')

test('el triaje lee eventos de TODO correo correduria* que no fue devolución, y solo en vivo', () => {
  const vivo = TRIAJE.indexOf('if (DRY_RUN())')
  const evento = TRIAJE.indexOf('leerCorreoEventoAseguradora({')
  assert.ok(vivo > 0 && evento > vivo, 'el lector de eventos corre en la rama viva, después del modo sombra')
  assert.ok(TRIAJE.indexOf('registrarDevolucionesAsegura(') < evento, 'las devoluciones van antes')
  assert.match(TRIAJE, /c\.categoria === 'correduria' \|\| c\.categoria === 'correduria-recibo'/)
  assert.match(TRIAJE, /tgAviso\('correo\.correduria-evento'/)
})

test('eventoConfirmado: solo «aplicado» o «duplicado_cima» quitan la nota genérica; sin_resolver/procesando la dejan', () => {
  assert.equal(eventoConfirmado(null), false)
  assert.equal(eventoConfirmado([]), false)
  assert.equal(eventoConfirmado([{ ...base, estado: 'sin_resolver' }, { ...base, estado: 'procesando' }]), false)
  assert.equal(eventoConfirmado([{ ...base, estado: 'sin_resolver' }, { ...base, estado: 'duplicado_cima' }]), true)
  assert.equal(eventoConfirmado([{ ...base, estado: 'aplicado' }]), true)
})

test('el triaje usa eventoConfirmado para decidir la nota genérica (no «hay algún resultado»)', () => {
  assert.match(TRIAJE, /eventoAplicado = eventoConfirmado\(resultados\)/)
  assert.doesNotMatch(TRIAJE, /eventoAplicado = resultados !== null && resultados\.length > 0/)
})

test('el reencaminado correduria → correduria-recibo decide SOLO por remitente + asunto', () => {
  const ini = TRIAJE.indexOf("const c = clasificado.categoria === 'correduria'")
  const fin = TRIAJE.indexOf('const ruta = rutaDe(c.categoria)')
  assert.ok(ini > 0 && fin > ini)
  const tramo = TRIAJE.slice(ini, fin)
  assert.match(tramo, /esCorreoDevolucion\(\{ remitente: correo\.from, asunto: correo\.subject \}\)/)
  assert.doesNotMatch(tramo, /correo\.texto|extracto|leerCorreoDevolucion/)
})

test('PDFs: el lector de eventos solo los recibe si su formato los necesita, y nunca se leen dos veces', () => {
  assert.match(TRIAJE, /textoAdjuntos: eventoNecesitaAdjuntos\(\{ remitente: correo\.from, asunto: correo\.subject \}\) \? await textoPdfs\(\) : null/)
  // Una sola lectura por correo: `textoDePdfs(correo)` aparece una vez, dentro del memo.
  assert.equal(TRIAJE.match(/textoDePdfs\(correo\)/g)?.length, 1)
  assert.match(TRIAJE, /pdfsLeidos \?\?= textoDePdfs\(correo\)/)
  assert.doesNotMatch(TRIAJE, /textoConPdfs\(correo\)/)
})

test('emisión (póliza nueva): «Póliza nueva emitida» con producto, efecto y prima; ya en CIMA o pendiente de CIMA', () => {
  const emision: EventoAseguradora = {
    compania: 'allianz', codigoDgs: 'C0109', ilegibles: 0, tipo: 'emision',
    polizas: [
      { numeroPoliza: '061000001', idRecibo: '900000001', producto: 'Allianz Moto V.03', fechaEfecto: '2026-09-29', prima: 1113.3 },
      { numeroPoliza: '061000002', idRecibo: '900000002', producto: null, fechaEfecto: null, prima: null },
    ],
  }
  const r = (clave: string, estado: ResultadoPuertoEvento['estado'], resumen: string, motivo: string | null): ResultadoPuertoEvento => ({
    clave, estado, repetido: false, resumen, motivo, clienteId: null, cliente: null, numeroPoliza: clave, tareaVence: null,
  })
  const t = textoAvisoEvento(emision, 'Rel. Emisión Producción', [
    r('061000001', 'duplicado_cima', 'póliza nueva 061000001 ya en CIMA: nada que hacer', 'CIMA ya trae la póliza en vigor'),
    r('061000002', 'sin_resolver', 'póliza nueva 061000002 emitida, aún no llegada por CIMA → bandeja', 'póliza nueva aún no llegada por CIMA'),
  ], (id) => `/c/${id}`)
  assert.match(t, /2 pólizas nuevas emitidas<\/b> — Allianz/)
  assert.match(t, /• Póliza nueva emitida: 061000001 · Allianz Moto V\.03 · efecto 29\/09\/2026 · 1\.113,30€/)
  assert.match(t, /• Póliza nueva emitida: 061000002\n/)
  assert.match(t, /ℹ️ póliza nueva 061000001 ya en CIMA/)
  assert.match(t, /❔ póliza nueva 061000002 emitida, aún no llegada por CIMA/)
  assert.match(t, /Queda 1 en «Correos de compañía»/)
  assert.doesNotMatch(t, /asegura no devolvió/)
})
