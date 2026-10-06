// Guardián del lector de acuerdos/productividad de plataforma y de su pantalla
// (fase 2 de acuerdos con compañías, 06/10/2026). `node --test` (gate en CI vía
// `pnpm test:guardia`). Spec:
// docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
//
// Lo que vigila, porque ninguna de estas cosas da error al romperse:
//   · un % que no consta se pinta «—», nunca «0 %»;
//   · una suma sin recibos se pinta «sin recibos», nunca «0,00€»;
//   · un objetivo pendiente es ⚪ con su motivo, nunca 🟢;
//   · un número mal formado del puerto NO se convierte en 0;
//   · las líneas de un acuerdo se paginan y la letra pequeña se monta al abrirla;
//   · el bloque «Comisiones por compañía» ya no vive suelto en Datos.
//
// 🔒 Datos FICTICIOS: las cifras de APROMES son privadas y no pueden aparecer aquí.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  interpretarAcuerdos,
  interpretarProductividad,
  semaforoObjetivo,
  textoPct,
  textoSuma,
  etiquetaFuente,
} from '../apps/plataforma/lib/acuerdos-asegura.ts'

const ROOT = join(import.meta.dirname, '..')
const CORR = 'apps/plataforma/app/(usuario)/correduria'
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const ACUERDOS_FICTICIOS = {
  estado: 'ok',
  claves: [],
  conflictosCodigos: [],
  acuerdos: [{
    id: 'a1', companiaCodigoDgs: 'C9999', fuente: { valor: 'apromes' }, fuenteNombre: null, claveId: null,
    vigenciaDesde: '2026-01-01', vigenciaHasta: null, requisitosApertura: null, letraPequena: 'x',
    documentoFuente: 'doc ficticio, p. 1', revisadoAt: null,
    comisiones: [
      { id: 'l1', ramo: 'hogar', ramoTexto: 'Hogar', producto: null, modalidad: null, pctNp: 11, pctCartera: null, notas: null },
      { id: 'l2', ramo: null, ramoTexto: 'Otro', producto: null, modalidad: null, pctNp: '17,5', pctCartera: 0, notas: null },
    ],
    objetivos: [],
  }],
}

test('lector: un % ausente o con forma de texto queda null (no 0); un 0 explícito queda 0', () => {
  const r = interpretarAcuerdos(200, ACUERDOS_FICTICIOS)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  const [l1, l2] = r.acuerdos[0].comisiones
  assert.equal(l1.pctCartera, null)
  assert.equal(l2.pctNp, null, '«17,5» en texto no es un número: no se adivina')
  assert.equal(l2.pctCartera, 0)
  assert.equal(r.acuerdos[0].revisadoAt, null)
})

test('lector: sin configurar, secreto rechazado y error con causa no se colapsan en «no hay acuerdos»', () => {
  assert.deepEqual(interpretarAcuerdos(503, null), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarAcuerdos(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarAcuerdos(200, { estado: 'error', causa: 'esquema' }), { estado: 'error', motivo: 'esquema' })
  assert.deepEqual(interpretarAcuerdos(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('textoPct: null → «—», 0 → «0 %»', () => {
  assert.equal(textoPct(null), '—')
  assert.equal(textoPct(0), '0 %')
  assert.equal(textoPct(17.5), '17,5 %')
})

test('textoSuma: sin recibos NO es «0,00€»; null es «sin datos»; ilegibles se declaran', () => {
  assert.equal(textoSuma({ importe: 0, recibos: 0, ilegibles: 0 }), 'sin recibos')
  assert.equal(textoSuma(null), 'sin datos')
  assert.equal(textoSuma({ importe: 1234.5, recibos: 3, ilegibles: 0 }), '1.234,50€ · 3 recibos')
  assert.match(textoSuma({ importe: 100, recibos: 2, ilegibles: 1 }), /1 ilegible: total incompleto/)
  assert.doesNotMatch(textoSuma({ importe: 0, recibos: 0, ilegibles: 0 }), /0,00/)
})

test('semáforo: pendiente es ⚪ con su motivo, jamás 🟢', () => {
  for (const motivo of ['sin_clave', 'sin_cotejar', 'colectivo', 'lo-que-sea-nuevo']) {
    const s = semaforoObjetivo({ color: 'pendiente', motivo, detalle: null, medido: 99999 })
    assert.equal(s.punto, '⚪', motivo)
    assert.match(s.texto, /^Pendiente: /)
    assert.notEqual(s.tono, 'positivo')
  }
  assert.equal(semaforoObjetivo({ color: 'alcanzado', medido: 1, umbral: 1, proyectado: null, siguiente: null, falta: null, rappelEstimado: null, diasRestantes: 0 }).punto, '🟢')
})

test('productividad: una fila con un campo que falta es ilegible (no un 0), y un color sin números se descarta', () => {
  const suma = { importe: 10, recibos: 1, ilegibles: 0 }
  const r = interpretarProductividad(200, {
    estado: 'ok', anio: 2026, periodo: { desde: '2026-01-01', hasta: '2026-12-31' }, hoy: '2026-10-06', truncado: false,
    produccion: [
      { companiaCodigoDgs: 'C9999', npCobrada: suma, npPendiente: suma, carteraCobrada: suma, comisionAplicada: suma, polizasNp: 1, sinFecha: 0 },
      { companiaCodigoDgs: 'C9998', npCobrada: suma, npPendiente: suma, carteraCobrada: suma, comisionAplicada: suma },
    ],
    objetivos: [
      { acuerdoId: 'a1', objetivoId: 'o1', companiaCodigoDgs: 'C9999', estado: { color: 'alcanzado' } },
      { acuerdoId: 'a1', objetivoId: 'o2', companiaCodigoDgs: 'C9999', estado: { color: 'pendiente', motivo: 'sin_clave' } },
    ],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.produccion.map((p) => p.companiaCodigoDgs), ['C9999'])
  assert.deepEqual(r.objetivos.map((o) => o.objetivoId), ['o2'])
  assert.equal(r.sinCompania, null, 'un recuento que no viene es «no consta», no 0')
})

test('etiquetaFuente: un valor desconocido se declara, no se esconde', () => {
  assert.equal(etiquetaFuente({ fuente: { valor: 'apromes' }, fuenteNombre: null }), 'APROMES')
  assert.match(etiquetaFuente({ fuente: { valor: null, crudo: 'xyz' }, fuenteNombre: null }), /no reconocida/)
})

// ─── La pantalla (lee el fuente: tsc no ve estas reglas) ─────────────────────

test('AcuerdosVista: los % se pintan con textoPct y las sumas con textoSuma', () => {
  const src = leer(`${CORR}/companias/AcuerdosVista.tsx`)
  assert.match(src, /textoPct\(l\.pctNp\)/)
  assert.match(src, /textoPct\(l\.pctCartera\)/)
  assert.doesNotMatch(src, /\{l\.pct(Np|Cartera)\}/, 'un % pintado a pelo saltaría el «—» de no consta')
  assert.match(src, /textoSuma\(prod\.npCobrada\)/)
})

test('AcuerdosVista: las líneas se montan por páginas y la letra pequeña y las notas al abrirlas', () => {
  const src = leer(`${CORR}/companias/AcuerdosVista.tsx`)
  assert.match(src, /export const LINEAS_POR_PAGINA = (\d+)/)
  const n = Number(/export const LINEAS_POR_PAGINA = (\d+)/.exec(src)?.[1])
  assert.ok(n > 0 && n <= 50, 'página de 1-50 líneas')
  assert.match(src, /lineas\.slice\(0, visibles\)/)
  assert.doesNotMatch(src, /lineas\.map\(/, 'montar todas las líneas de golpe (Helvetia tiene decenas)')
  assert.match(src, /\{verLetra && </, 'la letra pequeña solo se monta abierta')
  assert.match(src, /nota === l\.id\s*\?/, 'las notas solo se montan abiertas')
})

test('el cuadro firmado ya no es un bloque suelto en Datos: vive en la ficha', () => {
  const cliente = leer(`${CORR}/CorreduriaClient.tsx`)
  assert.doesNotMatch(cliente, /ComisionesPactadas/)
  const ficha = leer(`${CORR}/companias/[codigo]/FichaCompania.tsx`)
  assert.match(ficha, /<ComisionReal /)
  assert.match(ficha, /<TarjetaAcuerdo /)
})

test('las rejillas de tarjetas no desbordan a 320 px (minmax con min(100%, …))', () => {
  for (const f of [`${CORR}/Companias.tsx`, `${CORR}/companias/page.tsx`]) {
    const src = leer(f)
    assert.doesNotMatch(src, /minmax\(\d+px,/, `${f}: minmax(280px, …) desborda en pantallas de 320 px`)
  }
})
