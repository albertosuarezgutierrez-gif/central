import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  corteIdentidadNuevo,
  decidirDuplicadoNuevo,
  emisionNuevoActiva,
  enmascararNumeroPoliza,
  resolverContextoEmision,
  riesgoDeTarificacion,
  tipoDeRamo,
} from './contexto-emision.ts'

// Emisión a clientes NUEVOS (28/09/2026). Lógica pura: sin BD, sin red, sin
// `prisma generate` — el job `Tests (packages + guardián)` no lo corre.

const CLAVE = 'c'.repeat(64)
function conClave<T>(fn: () => T): T {
  const antes = process.env.PII_ENCRYPTION_KEY
  process.env.PII_ENCRYPTION_KEY = CLAVE
  try {
    return fn()
  } finally {
    if (antes === undefined) delete process.env.PII_ENCRYPTION_KEY
    else process.env.PII_ENCRYPTION_KEY = antes
  }
}

const PETICION_AUTO = {
  insuranceLine: { id: 'Car' },
  risk: { registrationPlate: '1234 abc', registrationDate: '2019-05-10', vehicle: { code: 'X' } },
}
const PETICION_HOGAR = {
  risk: {
    address: {
      postalCode: '41002',
      town: { id: 41091 },
      roadType: { id: 'Calle' },
      roadName: 'San Vicente',
      roadNumber: '40',
      floor: '2º',
      door: '14',
      cadastralReference: '1234567tg3413s0001ab',
    },
    floorArea: 76,
    yearBuilt: 1994,
  },
}

const PROYECTO_NUEVO = { polizaId: null, clienteId: 'cli-1', tarificacionId: 'tar-1' }

test('contexto NUEVO: polizaOrigenId null, tipo del ramo y riesgo de la tarificación', () => {
  const r = resolverContextoEmision({
    proyecto: PROYECTO_NUEVO,
    poliza: null,
    tarificacion: { clienteId: 'cli-1', ramo: 'moto', peticion: PETICION_AUTO, polizaId: null },
    ficha: { clienteId: 'cli-1', dniLookupHash: 'h' },
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.ctx.modo, 'nuevo')
  assert.equal(r.ctx.polizaOrigenId, null)
  assert.equal(r.ctx.tipo, 'moto')
  assert.equal(r.ctx.fraccionamientoBase, null)
  assert.equal(r.ctx.sustituida, false)
  assert.equal(r.ctx.clienteId, 'cli-1')
  assert.deepEqual(r.ctx.riesgo, { matricula: '1234ABC', fechaMatriculacion: '2019-05-10' })
})

test('contexto SUSTITUCIÓN: el camino de siempre, con la póliza de origen', () => {
  const r = resolverContextoEmision({
    proyecto: { polizaId: 'pol-1', clienteId: null, tarificacionId: 'tar-1' },
    poliza: { clienteId: 'cli-1', tipo: 'auto', fraccionamiento: 'semestral', datosEspecificos: { matricula: '1234ABC' }, dniLookupHash: 'h', sustituida: false },
    tarificacion: null,
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.ctx.modo, 'sustitucion')
  assert.equal(r.ctx.polizaOrigenId, 'pol-1')
  assert.equal(r.ctx.fraccionamientoBase, 'semestral')
  assert.deepEqual(r.ctx.riesgo, { matricula: '1234ABC' })
})

test('póliza de OTRO cliente que el del proyecto → error, no se emite', () => {
  const r = resolverContextoEmision({
    proyecto: { polizaId: 'pol-1', clienteId: 'cli-2', tarificacionId: 'tar-1' },
    poliza: { clienteId: 'cli-1', tipo: 'auto', fraccionamiento: null, datosEspecificos: {}, dniLookupHash: 'h', sustituida: false },
    tarificacion: null,
  })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.status, 409)
  assert.equal(r.causa, 'cliente_distinto')
})

test('tarificación de otro cliente que el del proyecto → error', () => {
  const r = resolverContextoEmision({
    proyecto: PROYECTO_NUEVO,
    poliza: null,
    tarificacion: { clienteId: 'cli-9', ramo: 'auto', peticion: PETICION_AUTO, polizaId: null },
    ficha: { clienteId: 'cli-1', dniLookupHash: 'h' },
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.causa, 'cliente_distinto')
})

test('proyecto LIBERADO (su tarificación retarificaba una póliza) → 409 proyecto_liberado, nunca modo nuevo', () => {
  const r = resolverContextoEmision({
    proyecto: PROYECTO_NUEVO,
    poliza: null,
    tarificacion: { clienteId: 'cli-1', ramo: 'auto', peticion: PETICION_AUTO, polizaId: 'pol-vieja' },
    ficha: { clienteId: 'cli-1', dniLookupHash: 'h' },
  })
  assert.equal(r.ok, false, 'un proyecto liberado se emitiría como NUEVO: póliza sin baja de la anterior')
  if (r.ok) return
  assert.equal(r.status, 409)
  assert.equal(r.causa, 'proyecto_liberado')
  assert.match(r.mensaje, /vuelve a confirmar la oferta desde la póliza/)
})

test('sustitución con el tomador FUSIONADO → 404 que lo dice, no «la póliza ya no existe»', () => {
  const base = { proyecto: { polizaId: 'pol-1', clienteId: null, tarificacionId: null }, poliza: null, tarificacion: null }
  const fus = resolverContextoEmision({ ...base, polizaTomadorFusionado: true })
  assert.equal(fus.ok, false)
  if (fus.ok) return
  assert.equal(fus.status, 404)
  assert.equal(fus.causa, 'tomador_fusionado')
  assert.match(fus.mensaje, /se fusionó en otra ficha: retarifica desde la ficha buena/)
  const nada = resolverContextoEmision(base)
  assert.equal(nada.ok, false)
  if (!nada.ok) assert.match(nada.mensaje, /ya no existe/)
})

test('sin póliza y sin cliente+tarificación → el 409 de siempre', () => {
  for (const proyecto of [
    { polizaId: null, clienteId: null, tarificacionId: null },
    { polizaId: null, clienteId: 'cli-1', tarificacionId: null },
    { polizaId: null, clienteId: null, tarificacionId: 'tar-1' },
  ]) {
    const r = resolverContextoEmision({ proyecto, poliza: null, tarificacion: null })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.status, 409)
  }
})

test('modo nuevo sin ficha (o fusionada) → 404; ramo que no mapea → 422, nunca auto', () => {
  const sinFicha = resolverContextoEmision({
    proyecto: PROYECTO_NUEVO,
    poliza: null,
    tarificacion: { clienteId: 'cli-1', ramo: 'auto', peticion: PETICION_AUTO, polizaId: null },
    ficha: null,
  })
  assert.equal(sinFicha.ok, false)
  if (!sinFicha.ok) assert.equal(sinFicha.status, 404)
  const raro = resolverContextoEmision({
    proyecto: PROYECTO_NUEVO,
    poliza: null,
    tarificacion: { clienteId: 'cli-1', ramo: 'patinete', peticion: {}, polizaId: null },
    ficha: { clienteId: 'cli-1', dniLookupHash: 'h' },
  })
  assert.equal(raro.ok, false)
  if (!raro.ok) assert.equal(raro.status, 422)
  assert.equal(tipoDeRamo('otros'), null)
  assert.equal(tipoDeRamo(null), null)
  assert.equal(tipoDeRamo('Hogar'), 'hogar')
})

test('hogar: la dirección se guarda CIFRADA (v1:) y no contiene la calle', () => {
  const riesgo = conClave(() => riesgoDeTarificacion('hogar', PETICION_HOGAR))
  assert.ok(riesgo)
  assert.equal(riesgo!.cp, '41002')
  assert.equal(riesgo!.metrosCuadrados, 76)
  assert.equal(riesgo!.anioConstruccion, 1994)
  assert.equal(riesgo!.referenciaCatastral, '1234567TG3413S0001AB')
  const dir = riesgo!.direccion
  assert.equal(typeof dir, 'string')
  assert.ok((dir as string).startsWith('v1:'), 'la dirección tiene que ir cifrada')
  assert.ok(!(dir as string).includes('San Vicente'))
  assert.ok(!JSON.stringify(riesgo).includes('San Vicente'))
})

test('hogar sin clave de cifrado → la dirección se OMITE, jamás en claro', () => {
  const antes = process.env.PII_ENCRYPTION_KEY
  delete process.env.PII_ENCRYPTION_KEY
  try {
    const riesgo = riesgoDeTarificacion('hogar', PETICION_HOGAR)
    assert.ok(riesgo)
    assert.equal('direccion' in riesgo!, false)
    assert.ok(!JSON.stringify(riesgo).includes('San Vicente'))
  } finally {
    if (antes !== undefined) process.env.PII_ENCRYPTION_KEY = antes
  }
  // Y un cifrado que lanza (clave mal formada) tampoco deja la calle.
  const r2 = riesgoDeTarificacion('hogar', PETICION_HOGAR, () => {
    throw new Error('clave mal formada')
  })
  assert.equal('direccion' in (r2 ?? {}), false)
})

test('riesgo: lo que no tiene forma válida se omite, no se inventa', () => {
  assert.equal(riesgoDeTarificacion('auto', { risk: { registrationPlate: 'X', registrationDate: '10/05/2019' } }), null)
  assert.equal(riesgoDeTarificacion('vida', PETICION_AUTO), null)
  assert.equal(riesgoDeTarificacion('hogar', { risk: { address: { postalCode: '410' }, floorArea: -3, yearBuilt: 99 } }), null)
})

test('identidad del modo nuevo: FAIL-CLOSED si falta el hash de la ficha o del tomador', () => {
  assert.ok(corteIdentidadNuevo('abc', null), 'ficha sin DNI tiene que bloquear')
  assert.ok(corteIdentidadNuevo(null, 'abc'), 'proyecto ilegible tiene que bloquear')
  assert.ok(corteIdentidadNuevo(null, null))
  assert.ok(corteIdentidadNuevo('abc', 'xyz'), 'DNI distinto tiene que bloquear')
  assert.equal(corteIdentidadNuevo('abc', 'abc'), null)
})

test('interruptor del modo nuevo: solo CODEOSCOPIC_EMISION_NUEVO=1 lo enciende', () => {
  assert.equal(emisionNuevoActiva({}), false)
  assert.equal(emisionNuevoActiva({ CODEOSCOPIC_EMISION_NUEVO: 'true' }), false)
  assert.equal(emisionNuevoActiva({ CODEOSCOPIC_EMISION_NUEVO: '0' }), false)
  assert.equal(emisionNuevoActiva({ CODEOSCOPIC_EMISION_NUEVO: '1' }), true)
})

test('duplicado auto/moto: póliza en vigor Y proyecto reciente se miran los DOS', () => {
  // Sin póliza en cartera (el nuevo anterior acabó `emitido_sin_acunar`) el proyecto reciente basta.
  const soloProyecto = decidirDuplicadoNuevo({ tipo: 'auto', matricula: '1234ABC', mismaMatricula: [], proyectosRecientes: ['P9'] })
  assert.ok(soloProyecto, 'auto con matrícula tiene que mirar también el proyecto emitido reciente')
  assert.equal(soloProyecto!.causa, 'ya_emitido')
  const ambos = decidirDuplicadoNuevo({
    tipo: 'moto', matricula: '1234ABC',
    mismaMatricula: [{ id: 'pol-1', numeroPoliza: '3021700000001', mismoCliente: true }],
    proyectosRecientes: ['P9'],
  })
  assert.equal(ambos!.causa, 'ya_en_cartera')
  assert.deepEqual(ambos!.polizas, ['pol-1'])
  assert.match(ambos!.mensaje, /emite desde esa póliza/)
  assert.match(ambos!.mensaje, /P9/)
  assert.equal(decidirDuplicadoNuevo({ tipo: 'auto', matricula: '1234ABC', mismaMatricula: [], proyectosRecientes: [] }), null)
  assert.equal(decidirDuplicadoNuevo({ tipo: 'hogar', matricula: null, mismaMatricula: [], proyectosRecientes: ['P1'] })!.causa, 'ya_emitido')
})

test('duplicado: matrícula en OTRA ficha → ya_en_cartera con nº enmascarado, sin datos de esa ficha', () => {
  const d = decidirDuplicadoNuevo({
    tipo: 'auto', matricula: '1234ABC',
    mismaMatricula: [{ id: 'pol-ajena', numeroPoliza: '3021700000001', mismoCliente: false }],
    proyectosRecientes: [],
  })
  assert.ok(d)
  assert.equal(d!.causa, 'ya_en_cartera')
  assert.match(d!.mensaje, /OTRA ficha/)
  assert.match(d!.mensaje, /••••0001/)
  assert.ok(!d!.mensaje.includes('3021700000001'), 'el número completo de otra ficha no sale')
  assert.equal(enmascararNumeroPoliza(null), null)
  assert.equal(enmascararNumeroPoliza('12'), '••••')
})

// ── Cepos de FUENTE: lo que vigilan vive en SQL/rutas que no se pueden importar sin Prisma ──

const RAIZ = join(import.meta.dirname, '../..')
const EMITIR = readFileSync(join(RAIZ, 'app/api/operador/codeoscopic/emitir/route.ts'), 'utf8')
const OFERTA = readFileSync(join(RAIZ, 'app/api/operador/codeoscopic/oferta/route.ts'), 'utf8')

/** Cada consulta SQL (plantilla etiquetada) que contiene `patron`, hasta su backtick de cierre. */
function consultasCon(fuente: string, patron: RegExp): string[] {
  const out: string[] = []
  const re = new RegExp(patron.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(fuente)) !== null) {
    const ini = fuente.lastIndexOf('`', m.index)
    const fin = fuente.indexOf('`', m.index)
    out.push(fuente.slice(ini, fin))
  }
  return out
}

test('emitir/route: el origen de la sustitución sale de ctx, nunca de p.poliza_id', () => {
  const usos = [...EMITIR.matchAll(/polizaOrigenId:\s*([\w.]+)/g)].map((m) => m[1])
  assert.ok(usos.length >= 4, `se esperaban ≥4 polizaOrigenId (registrar×2 + tras×2), hay ${usos.length}`)
  for (const u of usos) assert.equal(u, 'ctx.polizaOrigenId', `polizaOrigenId: ${u}`)
  for (const llamada of ['registrarPolizaEmitida(', 'trasEmisionConTope(']) {
    for (let i = EMITIR.indexOf(llamada); i !== -1; i = EMITIR.indexOf(llamada, i + 1)) {
      assert.ok(!/p\.poliza_id/.test(EMITIR.slice(i, i + 700)), `${llamada} no puede recibir p.poliza_id`)
    }
  }
})

test('emitir/route: todo `from tarificaciones` filtra por correduria_id', () => {
  const qs = consultasCon(EMITIR, /from tarificaciones/)
  assert.ok(qs.length >= 1, 'emitir tiene que leer la tarificación en modo nuevo')
  for (const q of qs) assert.match(q, /correduria_id\s*=/, `consulta sin correduría: ${q.slice(0, 120)}`)
})

test('emitir/route: toda lectura de clientes excluye fichas fusionadas (salvo el diagnóstico booleano)', () => {
  const qs = consultasCon(EMITIR, /(from|join) clientes/)
  assert.ok(qs.length >= 2)
  const DIAG = /select c\.merged_into_cliente_id is not null as tomador_fusionado\s+from/
  const diagnosticos = qs.filter((q) => DIAG.test(q))
  assert.equal(diagnosticos.length, 1, 'un único diagnóstico de fusión, que solo devuelve el booleano')
  for (const q of qs) {
    if (DIAG.test(q)) continue
    assert.match(q, /merged_into_cliente_id is null/, `consulta sin filtro de fusión: ${q.slice(0, 120)}`)
  }
})

test('emitir/route: la tarificación se lee CON su poliza_id y llega a resolverContextoEmision', () => {
  const q = consultasCon(EMITIR, /from tarificaciones/)[0]
  assert.match(q, /t\.poliza_id::text as poliza_id/)
  assert.match(EMITIR, /polizaId: tar\.poliza_id/)
  assert.match(EMITIR, /polizaTomadorFusionado: tomadorFusionado/)
})

test('emitir/route: la matrícula se busca en TODA la correduría, no solo en el cliente', () => {
  const q = consultasCon(EMITIR, /datos_especificos->>'matricula'/)[0]
  assert.ok(q, 'falta la consulta por matrícula')
  const where = q.slice(q.indexOf('where'))
  assert.doesNotMatch(where, /p\.cliente_id = \$\{ctx\.clienteId\}::uuid\s+and/, 'la matrícula no puede filtrar por el cliente del proyecto')
  assert.match(q, /as mismo_cliente/)
  assert.match(q, /merged_into_poliza_id is null/)
  // Y la consulta de proyectos recientes NO depende del ramo/matrícula: se hace siempre.
  const iRecientes = EMITIR.indexOf('const recientes = await')
  const iMismas = EMITIR.indexOf('const mismas =')
  assert.ok(iRecientes > iMismas && iMismas > 0)
  assert.doesNotMatch(EMITIR.slice(iMismas, iRecientes), /\} else \{/, 'proyectos recientes no puede ir en un else del motor')
})

test('emitir/route: modo nuevo detrás de su interruptor, identidad y duplicado ANTES de acuñar', () => {
  const iInterruptor = EMITIR.indexOf('emisionNuevoActiva()')
  const iIdentidad = EMITIR.indexOf('corteIdentidadNuevo(')
  const iDuplicado = EMITIR.indexOf('decidirDuplicadoNuevo(')
  const iAcunar = EMITIR.indexOf('if (cuerpo.acunarExistente === true)')
  const iSubmit = EMITIR.indexOf('await enviarEmision(')
  for (const [n, i] of Object.entries({ iInterruptor, iIdentidad, iDuplicado, iAcunar, iSubmit })) assert.ok(i > 0, n)
  assert.ok(iInterruptor < iAcunar && iIdentidad < iAcunar && iDuplicado < iAcunar, 'guardas antes de acunarExistente')
  assert.ok(iIdentidad < iSubmit && iDuplicado < iSubmit, 'guardas antes del Submit')
})

test('oferta/route: sin literal auto de relleno, y graba cliente_id + tarificacion_id', () => {
  assert.doesNotMatch(OFERTA, /\?\?\s*'auto'/, 'el producto no puede caer a un literal auto')
  const insert = consultasCon(OFERTA, /insert into codeoscopic_projects/)[0]
  assert.ok(insert, 'falta el insert de codeoscopic_projects')
  assert.match(insert, /cliente_id,\s*tarificacion_id/)
  assert.match(insert, /\$\{t\.cliente_id\}::uuid,\s*\$\{tarificacionId\}::uuid/)
  assert.match(insert, /cliente_id = coalesce\(codeoscopic_projects\.cliente_id, excluded\.cliente_id\)/)
  assert.match(insert, /tarificacion_id = excluded\.tarificacion_id/)
  // El 422 del ramo va ANTES del ReRate.
  // (buscado por regex y no como literal: el cepo del libro de gasto confunde el literal con una llamada)
  assert.ok(OFERTA.indexOf("causa: 'ramo_desconocido'") < OFERTA.search(/\breRate\s*\(/))
})
