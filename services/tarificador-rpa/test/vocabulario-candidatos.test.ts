// Candidatos al vocabulario común desde avisos/errores (26/10/2026). Fixtures SINTÉTICOS, sin datos personales. Heurística pura: no toca red ni base de datos.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TERMINOS_BLOQUEO_SOLO_GUARD } from '../src/guard.ts'
import { extraerRotulos, informeMarkdown, proponerCandidatos, rotuloDescartable, sugerirAccion, sugerirLectura } from '../scripts/lib/vocabulario-candidatos.ts'

const opts = { extraBloqueo: TERMINOS_BLOQUEO_SOLO_GUARD }

test('extrae rótulos de los cuatro formatos de diagnóstico', () => {
  assert.deepEqual(
    extraerRotulos('No se pudo guardar; controles a la vista: «Volver», «Descargar cotización», «Emitir póliza». Otro texto').map((x) => [x.rotulo, x.fuente]),
    [['Volver', 'controles'], ['Descargar cotización', 'controles'], ['Emitir póliza', 'controles']],
  )
  assert.deepEqual(
    extraerRotulos('no existe app-historial-siniestralidad; etiquetas: «Compañía anterior», «Bonus Malus»').map((x) => [x.rotulo, x.fuente]),
    [['Compañía anterior', 'etiquetas'], ['Bonus Malus', 'etiquetas']],
  )
  assert.deepEqual(
    extraerRotulos('Modalidades (2f): «Basico»[marcada] RA=1 PA=2 · Botones: Guardar presupuesto #g1 v=x, Pagar ahora, Siguiente ›').map((x) => [x.rotulo, x.fuente]),
    [['Guardar presupuesto', 'botones'], ['Pagar ahora', 'botones'], ['Siguiente ›', 'botones']],
  )
  assert.deepEqual(extraerRotulos('Modalidades: tabla no localizada · Botones: —'), [])
  const tablas = extraerRotulos('Tablas: [Modalidades de Seguro|Recibo Anual|Bonificación] [(otra)|Total] · Importes: Prima neta 1.234,56 € ; Franquicia 300,00 €')
  assert.deepEqual(tablas.filter((x) => x.fuente === 'tablas').map((x) => x.rotulo), ['Modalidades de Seguro', 'Recibo Anual', 'Bonificación', '(otra)', 'Total'])
  assert.deepEqual(tablas.filter((x) => x.fuente === 'importes').map((x) => x.rotulo), ['Prima neta', 'Franquicia'])
})

test('nunca propone rótulos con forma de dato personal', () => {
  for (const r of ['', 'x', '(otra)', 'NIF 12345678Z', '1234BCD', 'Juan 600123456', 'a@b.es', '1.234,56 €', 'x'.repeat(61)]) assert.equal(rotuloDescartable(r), true, r)
  for (const r of ['Prima neta', 'Siniestros RC 5 últimos años', 'Compañía']) assert.equal(rotuloDescartable(r), false, r)
})

test('heurísticas: acción solo con verbo + objeto o avance exacto; lectura por concepto', () => {
  assert.equal(sugerirAccion('descargar cotizacion'), 'descargar_documento')
  assert.equal(sugerirAccion('guardar presupuesto'), 'guardar_proyecto')
  assert.equal(sugerirAccion('generar oferta'), 'generar_proyecto')
  assert.equal(sugerirAccion('continuar'), 'avanzar')
  assert.equal(sugerirAccion('descargar'), null)
  assert.equal(sugerirLectura('prima neta'), 'precio')
  assert.equal(sugerirLectura('compania anterior'), 'compania_anterior')
  assert.equal(sugerirLectura('anos en la compania'), 'anios_asegurado')
  assert.equal(sugerirLectura('fecha de expedicion del permiso'), 'fecha_carne')
  assert.equal(sugerirLectura('franquicia general'), 'importe_ajeno')
  assert.equal(sugerirLectura('lunas'), null)
})

test('propone solo lo que NO está en el vocabulario, clasificado y con el bloqueo ganando', () => {
  const filas = [
    { compania: 'generali', texto: 'Botones: Guardar presupuesto #g1, Siguiente ›, Pagar ahora, Descargar propuesta' },
    { compania: 'mapfre', texto: 'x; controles a la vista: «Descargar cotización», «Emitir póliza», «Aceptar todo», «Calcular»' },
    { compania: 'mapfre', texto: 'y; controles a la vista: «Descargar cotización»' },
    { compania: 'allianz', texto: 'no existe el bloque; etiquetas: «Prima neta», «Compañía anterior», «Compañia», «Fecha de nacimiento», «NIF 12345678Z»' },
    { compania: 'generali', texto: 'Tablas: [Modalidades de Seguro|Recibo Anual|Prima Anualidad|Gastos de gestión] · Importes: Prima total 1.234,56 € ; Franquicia 300,00 €' },
  ]
  const cs = proponerCandidatos(filas, opts)
  const por = (r: string) => cs.find((c) => c.rotulo === r)
  // Conocidos: no salen.
  for (const r of ['Siguiente ›', 'Descargar propuesta', 'Calcular', 'Compañia', 'Fecha de nacimiento', 'Recibo Anual', 'Prima Anualidad', 'Modalidades de Seguro', 'Prima total', 'Franquicia']) assert.equal(por(r), undefined, `«${r}» ya está en el vocabulario`)
  // Acción: requiere revisión, nunca auto-aplicable. Agrega veces y compañías.
  const desc = por('Descargar cotización')!
  assert.deepEqual([desc.clase, desc.concepto, desc.estado, desc.veces, desc.companias], ['accion', 'descargar_documento', 'requiere_revision', 2, ['mapfre']])
  assert.equal(por('Guardar presupuesto')!.estado, 'requiere_revision')
  // Lectura: auto-aplicable.
  assert.deepEqual([por('Prima neta')!.clase, por('Prima neta')!.concepto, por('Prima neta')!.estado], ['lectura', 'precio', 'auto_aplicable'])
  assert.equal(por('Compañía anterior')!.concepto, 'compania_anterior')
  assert.equal(por('Compañía anterior')!.estado, 'auto_aplicable')
  // Bloqueo: descartado, incluso el que solo puede nombrar el guard.
  for (const r of ['Pagar ahora', 'Emitir póliza', 'Aceptar todo']) assert.equal(por(r)!.estado, 'descartado', r)
  // Sin concepto: informativo.
  assert.equal(por('Gastos de gestión')!.estado, 'sin_concepto')
  assert.equal(por('Bonificación'), undefined, 'la lista blanca de diagnóstico también cuenta como vocabulario')
  // Datos personales: ni aparecen.
  assert.equal(cs.some((c) => /12345678/.test(c.rotulo)), false)
  // Ningún candidato de acción sale auto-aplicable y ningún bloqueado sale con otro estado.
  for (const c of cs) {
    if (c.clase === 'accion') assert.equal(c.estado, 'requiere_revision')
    if (c.estado === 'auto_aplicable') assert.equal(c.clase, 'lectura')
  }
  // Orden: auto-aplicables, revisión, sin concepto, descartados.
  const orden = cs.map((c) => c.estado)
  assert.deepEqual(orden, [...orden].sort((a, b) => ['auto_aplicable', 'requiere_revision', 'sin_concepto', 'descartado'].indexOf(a) - ['auto_aplicable', 'requiere_revision', 'sin_concepto', 'descartado'].indexOf(b)))
})

test('«Recibo» como botón se bloquea; como etiqueta de importe, no', () => {
  const cs = proponerCandidatos([{ texto: 'Botones: Recibos pendientes · x' }, { texto: 'etiquetas: «Recibo semestral»' }], opts)
  assert.equal(cs.find((c) => c.rotulo === 'Recibos pendientes')!.estado, 'descartado')
  assert.equal(cs.find((c) => c.rotulo === 'Recibo semestral')!.estado, 'auto_aplicable')
})

test('minVeces filtra y el informe Markdown agrupa por estado', () => {
  const filas = [{ texto: 'etiquetas: «Prima neta»' }, { texto: 'etiquetas: «Prima neta», «Tasa de gestión»' }]
  assert.deepEqual(proponerCandidatos(filas, { ...opts, minVeces: 2 }).map((c) => c.rotulo), ['Prima neta'])
  const md = informeMarkdown(proponerCandidatos(filas, opts), '26/10/2026')
  assert.match(md, /^# Candidatos al vocabulario común \(26\/10\/2026\)/)
  assert.match(md, /## Lectura — auto-aplicables .*\(1\)/)
  assert.match(md, /## Acción — REQUIEREN REVISIÓN .*\(0\)/)
  assert.match(md, /Nada se ha aplicado/)
})
