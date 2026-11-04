import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CALLBACK_PUBLICAR, MAX_ELECCIONES_DIA, botonesRevision, compararConRenovacion, completarViviendaConCatastro, decidirBotonRenovacion,
  decidirDestinatarios, decidirEleccion, decidirPreparacion, filaOfertaActual, filaOfertaAvant2, lineaCatastro, textoDiferencia,
  textoEleccion, textoRevision, validarEleccion, type EstadoParaElegir,
} from './renovacion-alternativas-reglas.ts'

const P = '11111111-1111-4111-8111-111111111111'
const O = '22222222-2222-4222-8222-222222222222'
const REF = '1234567AB1234C0001XY'

test('preparar: solo una póliza en vigor, no fusionada y con ramo', () => {
  assert.equal(decidirPreparacion(null).ok, false)
  assert.deepEqual(decidirPreparacion({ enVigor: false, fusionada: false, ramo: 'hogar' }).ok, false)
  assert.equal(decidirPreparacion({ enVigor: true, fusionada: true, ramo: 'hogar' }).ok, false)
  assert.equal(decidirPreparacion({ enVigor: true, fusionada: false, ramo: null }).ok, false)
  assert.equal(decidirPreparacion({ enVigor: true, fusionada: false, ramo: 'hogar' }).ok, true)
})

test('oferta actual: la prima que no consta es null, nunca 0; sin compañía no hay fila', () => {
  const f = filaOfertaActual({ polizaId: P, compania: 'Mapfre', prima: null, deRecibo: false, vence: '2026-12-01' })
  assert.ok(f)
  assert.equal(f.primaTotal, null)
  assert.match(String(f.datosExtra.renovacionClave), /sin-prima/)
  assert.equal(filaOfertaActual({ polizaId: P, compania: '  ', prima: 300, deRecibo: true, vence: null }), null)
  const g = filaOfertaActual({ polizaId: P, compania: 'Mapfre', prima: 412.3, deRecibo: true, vence: '2026-12-01' })
  assert.equal(g?.primaTotal, 412.3)
  assert.equal(g?.datosExtra.primaDeRecibo, true)
})

test('Avant2: solo con compañía y prima ANUAL positiva; franquicia que no consta = null', () => {
  assert.equal(filaOfertaAvant2('t', { id: 'p', compania: 'Reale', producto: 'Hogar', modalidad: null, primaAnual: null, franquiciaEur: null }, null), null)
  assert.equal(filaOfertaAvant2('t', { id: 'p', compania: null, producto: 'Hogar', modalidad: null, primaAnual: 200, franquiciaEur: null }, null), null)
  const f = filaOfertaAvant2('t', { id: 'p', compania: 'Reale', producto: 'Hogar', modalidad: 'Plus', primaAnual: 199.999, franquiciaEur: null }, {})
  assert.equal(f?.primaTotal, 200)
  assert.equal(f?.producto, 'Hogar · Plus')
  assert.equal(f?.datosExtra.franquiciaGeneral, null)
  assert.equal(f?.garantias, null, 'garantías vacías = no constan')
  assert.equal(f?.datosExtra.avant2Clave, 'avant2:t:p')
})

test('comparar con la renovación: sin renovación no hay ahorro; con ella, la diferencia y su sentido', () => {
  const ops = [
    { id: 'a', compania: 'B', producto: 'x', primaEur: 450, franquiciaEur: null, nivel: null },
    { id: 'b', compania: 'A', producto: 'y', primaEur: 350.5, franquiciaEur: 150, nivel: null },
    { id: 'c', compania: 'C', producto: 'z', primaEur: 400, franquiciaEur: null, nivel: null },
  ]
  const sin = compararConRenovacion(null, ops)
  assert.ok(sin.every((o) => o.diferenciaEur === null && o.sentido === null))
  assert.equal(textoDiferencia(sin[0]), null)
  const con = compararConRenovacion(400, ops)
  assert.deepEqual(con.map((o) => o.id), ['b', 'c', 'a'])
  assert.deepEqual(con.map((o) => o.sentido), ['mas_barata', 'igual', 'mas_cara'])
  assert.equal(textoDiferencia(con[0]), '49,50€ menos que tu renovación')
  assert.equal(textoDiferencia(con[2]), '50,00€ más que tu renovación')
  assert.equal(compararConRenovacion(0, ops)[0].diferenciaEur, null, 'una renovación de 0 no es un precio')
})

test('Catastro: rellena SOLO lo vacío, no pisa lo escrito ni lo confirmado, ni escribe lo que no trae', () => {
  const c = { referencia: REF, metrosCuadrados: 95, anioConstruccion: 1972, codigoPostal: '41003', uso: 'Residencial' }
  assert.deepEqual(completarViviendaConCatastro({ confirmadoAt: '2026-10-01T00:00:00Z' }, c, 'T'), { estado: 'confirmada' })
  assert.deepEqual(completarViviendaConCatastro({ referenciaCatastral: '9999999ZZ9999Z0001AA' }, c, 'T'), { estado: 'otra_referencia' })
  const r = completarViviendaConCatastro({ metrosCuadrados: 80, cp: '41003' }, c, 'T')
  assert.equal(r.estado, 'completada')
  if (r.estado !== 'completada') return
  assert.deepEqual(r.anadidos.sort(), ['anioConstruccion', 'referenciaCatastral'])
  assert.deepEqual(r.distintos, ['metrosCuadrados'])
  assert.equal(r.cambios.metrosCuadrados, undefined, 'lo escrito no se pisa')
  assert.equal(r.cambios.catastroMetrosCuadrados, 95, 'lo que dice el Catastro se anota aparte')
  assert.equal('confirmadoAt' in r.cambios, false)
  const sinDatos = completarViviendaConCatastro({}, { referencia: REF, metrosCuadrados: 0, anioConstruccion: null, codigoPostal: null, uso: null }, 'T')
  assert.equal(sinDatos.estado === 'completada' && sinDatos.cambios.metrosCuadrados, undefined, '0 m² no es una superficie')
  assert.match(lineaCatastro({ estado: 'completada', anadidos: ['anioConstruccion'], distintos: [] }) ?? '', /Del Catastro \(sin confirmar\): año de construcción/)
  assert.match(lineaCatastro({ estado: 'error' }) ?? '', /NO significa/)
})

test('destinatarios: sin poder mirarlo o sin el tomador en la app, NO se publica; los autorizados se nombran', () => {
  const nc = decidirDestinatarios(null)
  assert.equal(nc.publicable, false)
  const sin = decidirDestinatarios({ vinculadasTomador: 0, otrosVenPoliza: [{ nombre: 'Pepe', via: 'autorizacion' }] })
  assert.equal(sin.publicable, false)
  assert.equal(!sin.publicable && sin.motivo, 'sin_app')
  assert.match(sin.lineas.join('\n'), /Pepe[\s\S]*NO verán|NO verán[\s\S]*Pepe/)
  const ok = decidirDestinatarios({ vinculadasTomador: 1, otrosVenPoliza: [{ nombre: null, via: 'interviniente' }] })
  assert.equal(ok.publicable, true)
  assert.match(ok.lineas.join('\n'), /alguien \(figura en la póliza\)/)
})

test('Telegram: ✅ solo si es publicable; ✏️ y la vista previa siempre; callback ≤ 64 bytes', () => {
  const urls = { vista: 'https://x/vista', modificar: 'https://x/poliza' }
  const si = botonesRevision(P, urls, true)
  assert.equal(si[0][0].callback, `${CALLBACK_PUBLICAR}:${P}`)
  assert.ok(Buffer.byteLength(si[0][0].callback ?? '') <= 64)
  const no = botonesRevision(P, urls, false)
  assert.equal(no.flat().some((b) => b.callback), false)
  assert.deepEqual(no.flat().map((b) => b.url), [urls.vista, urls.modificar])
})

test('botón ✅: solo el titular exacto y con un uuid', () => {
  assert.equal(decidirBotonRenovacion({ from: { id: 5 } }, 'pub', [P], undefined).ok, false)
  assert.equal(decidirBotonRenovacion({ from: { id: 6 } }, 'pub', [P], '5').ok, false)
  assert.equal(decidirBotonRenovacion({ from: { id: 5 } }, 'pub', ['x'], '5').ok, false)
  assert.equal(decidirBotonRenovacion({ from: { id: 5 } }, 'otra', [P], '5').ok, false)
  assert.deepEqual(decidirBotonRenovacion({ from: { id: 5 } }, 'pub', [P], '5'), { ok: true, presupuestoId: P, quien: '5' })
})

test('texto de revisión: importes en formato español, escapado y aviso de que elegir no emite', () => {
  const t = textoRevision({
    cliente: 'Ana <b>', referencia: 'AS-26-0001', ramo: 'hogar',
    actual: { polizaId: P, compania: 'Mapfre', prima: 2162.49, deRecibo: true, vence: '2026-12-01' },
    opciones: compararConRenovacion(2162.49, [{ id: 'a', compania: 'Reale', producto: 'Hogar', primaEur: 1999.9, franquiciaEur: null, nivel: null }]),
    niveles: [], catastro: { estado: 'no_aplica' }, destinatarios: decidirDestinatarios({ vinculadasTomador: 1, otrosVenPoliza: [] }), sinRevisar: 2,
  })
  assert.match(t, /2\.162,49€ \(del recibo\)/)
  assert.match(t, /1\.999,90€/)
  assert.match(t, /Ana &lt;b&gt;/)
  assert.match(t, /NO emite nada/)
  assert.match(t, /estas 2 ofertas/)
})

const base = (o: Partial<EstadoParaElegir> = {}): EstadoParaElegir => ({
  modo: 'renovacion', enviadoAt: new Date('2026-11-01'), venceEl: new Date('2026-12-31'), retiradoAt: null, aceptadoAt: null, emitidoAt: null,
  eleccionActual: null, eleccionesDia: 0, ...o,
})
const HOY = new Date('2026-11-04')

test('elegir: solo una renovación publicada, vigente y sin firmar ni emitir', () => {
  const e = { tipo: 'renovacion' } as const
  assert.deepEqual(decidirEleccion(base({ modo: null }), e, true, HOY), { ok: false, estado: 'no_encontrado' })
  assert.deepEqual(decidirEleccion(base({ enviadoAt: null }), e, true, HOY), { ok: false, estado: 'no_encontrado' }, 'un borrador no se elige')
  assert.deepEqual(decidirEleccion(base({ aceptadoAt: new Date() }), e, true, HOY), { ok: false, estado: 'no_admite' })
  assert.deepEqual(decidirEleccion(base({ emitidoAt: new Date() }), e, true, HOY), { ok: false, estado: 'no_admite' })
  assert.deepEqual(decidirEleccion(base({ retiradoAt: new Date() }), e, true, HOY), { ok: false, estado: 'no_admite' })
  assert.deepEqual(decidirEleccion(base({ venceEl: new Date('2026-11-01') }), e, true, HOY), { ok: false, estado: 'caducado' })
  assert.deepEqual(decidirEleccion(base(), { tipo: 'opcion', opcionId: O }, false, HOY), { ok: false, estado: 'no_encontrado' }, 'una opción ajena u oculta no vale')
  assert.deepEqual(decidirEleccion(base(), e, true, HOY), { ok: true, cambio: true })
})

test('elegir: repetir lo mismo no es un cambio; cambiar de opinión tiene tope', () => {
  const op = { tipo: 'opcion', opcionId: O } as const
  assert.deepEqual(decidirEleccion(base({ eleccionActual: op }), op, true, HOY), { ok: true, cambio: false })
  assert.deepEqual(decidirEleccion(base({ eleccionActual: op, eleccionesDia: MAX_ELECCIONES_DIA }), { tipo: 'renovacion' }, true, HOY), { ok: false, estado: 'limite' })
  assert.deepEqual(decidirEleccion(base({ eleccionActual: op, eleccionesDia: MAX_ELECCIONES_DIA }), op, true, HOY), { ok: true, cambio: false })
})

test('validar la elección del cuerpo: nunca un clienteId, solo opción (uuid) o renovación', () => {
  assert.deepEqual(validarEleccion({ eleccion: 'renovacion', clienteId: P }), { tipo: 'renovacion' })
  assert.deepEqual(validarEleccion({ eleccion: 'opcion', opcionId: O.toUpperCase() }), { tipo: 'opcion', opcionId: O })
  assert.equal(validarEleccion({ eleccion: 'opcion', opcionId: 'x' }), null)
  assert.equal(validarEleccion({ eleccion: 'emitir' }), null)
  assert.equal(validarEleccion(null), null)
})

test('aviso de la elección: dice que NO se ha emitido y no lleva datos sensibles', () => {
  const t = textoEleccion({ tomador: 'Ana', ramo: 'hogar', eleccion: { tipo: 'opcion', opcionId: O }, opcion: { compania: 'Reale', producto: 'Hogar', primaEur: 350 }, primaRenovacion: 400, enlace: 'https://x/c', cambio: true })
  assert.match(t, /NO se ha emitido ni firmado/)
  assert.match(t, /350,00€/)
  assert.doesNotMatch(t, /IBAN|DNI/)
})

test('cepo: las reglas son PURAS (ni BD, ni red, ni envs)', () => {
  const src = readFileSync(new URL('./renovacion-alternativas-reglas.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /prisma|fetch\(|process\.env|tgSend/)
})

// ─── Revisión adversarial (04/11/2026) ────────────────────────────────────────

test('🪤 una RENOVACIÓN no se acepta ni se firma por el camino antiguo (preparar/código/firmar)', async () => {
  const { bloqueoFirmaRenovacion } = await import('./renovacion-alternativas-reglas.ts')
  assert.match(bloqueoFirmaRenovacion('renovacion') ?? '', /elige/i)
  assert.equal(bloqueoFirmaRenovacion(null), null)
  assert.equal(bloqueoFirmaRenovacion(undefined), null)
})

test('🪤 Catastro: en la fusión GANA el dato existente; la marca de la consulta es la nueva', async () => {
  const { fusionarViviendaCatastro } = await import('./renovacion-alternativas-reglas.ts')
  const m = fusionarViviendaCatastro(
    { cp: '41003', metrosCuadrados: 90, anioConstruccion: '', catastroConsultadoAt: '2026-01-01T00:00:00Z' },
    { cp: '41004', metrosCuadrados: 85, anioConstruccion: 1960, catastroConsultadoAt: '2026-11-04T10:00:00Z' },
  )
  assert.equal(m.cp, '41003', 'lo escrito entre la lectura y la escritura no se pisa')
  assert.equal(m.metrosCuadrados, 90)
  assert.equal(m.anioConstruccion, 1960, 'un hueco vacío sí se rellena')
  assert.equal(m.catastroConsultadoAt, '2026-11-04T10:00:00Z')
  assert.deepEqual(fusionarViviendaCatastro(null, { cp: '41003' }), { cp: '41003' })
})

test('🪤 Catastro: el UPDATE va condicionado a lo leído (compare-and-swap) y relee si cambió', () => {
  const src = readFileSync(new URL('./renovacion-alternativas.ts', import.meta.url), 'utf8')
  const cat = src.slice(src.indexOf('async function catastroDeOportunidad'), src.indexOf('const conTope'))
  assert.match(cat, /fusionarViviendaCatastro\(/)
  assert.match(cat, /coalesce\(info_riesgo->'datosVivienda', '\{\}'::jsonb\) = \$\{JSON\.stringify\(v\)\}::jsonb/)
  assert.doesNotMatch(cat, /coalesce\(info_riesgo->'datosVivienda', '\{\}'::jsonb\) \|\| \$\{JSON\.stringify\(r\.cambios\)\}/, 'nunca «existente || cambios»')
})

test('🪤 publicar desde Telegram EXIGE message_id y que sea el último; la pantalla no lleva mensaje', async () => {
  const { decidirMensajeVigente } = await import('./renovacion-alternativas-reglas.ts')
  assert.equal(decidirMensajeVigente({ via: 'telegram', pedido: null, ultimo: 7 }).ok, false, 'sin message_id, no')
  assert.equal(decidirMensajeVigente({ via: 'telegram', pedido: 6, ultimo: 7 }).ok, false)
  assert.equal(decidirMensajeVigente({ via: 'telegram', pedido: 7, ultimo: null }).ok, false, 'sin revisión registrada, no')
  assert.equal(decidirMensajeVigente({ via: 'telegram', pedido: 7, ultimo: 7 }).ok, true)
  assert.equal(decidirMensajeVigente({ via: 'pantalla', pedido: null, ultimo: null }).ok, true)
  const src = readFileSync(new URL('./renovacion-alternativas.ts', import.meta.url), 'utf8')
  const pub = src.slice(src.indexOf('export async function publicarRenovacion'), src.indexOf('// ─── La elección del cliente'))
  assert.doesNotMatch(pub, /typeof e\.telegramMessageId === 'number'\) \{/, 'el cepo no puede depender de que venga el id')
  assert.match(pub, /decidirMensajeVigente\(/)
  const ruta = readFileSync(new URL('../app/api/operador/renovacion/publicar/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /b\?\.via === 'pantalla' \? 'pantalla' : 'telegram'/, 'por defecto, Telegram (fail-closed)')
})

test('🪤 quién lo verá: solo cuentan los vínculos que pueden OPERAR (elegir)', async () => {
  const { contarVinculadasQueOperan } = await import('./renovacion-alternativas-reglas.ts')
  assert.equal(contarVinculadasQueOperan([{ identidadId: 'a', nivel: 'tarjeta' }, { identidadId: 'b', nivel: 'completo' }]), 0)
  assert.equal(contarVinculadasQueOperan([{ identidadId: 'a', nivel: 'gestionar' }, { identidadId: 'a', nivel: 'administrar' }, { identidadId: 'b', nivel: 'tarjeta' }]), 1)
  const src = readFileSync(new URL('./renovacion-alternativas.ts', import.meta.url), 'utf8')
  const q = src.slice(src.indexOf('export async function quienVeEnApp'), src.indexOf('// ─── Catastro'))
  assert.match(q, /contarVinculadasQueOperan\(/)
})

test('🪤 preparar escribe el historial interno de la ficha (como publicar y elegir)', () => {
  const src = readFileSync(new URL('./renovacion-alternativas.ts', import.meta.url), 'utf8')
  const prep = src.slice(src.indexOf('export async function prepararRenovacion'), src.indexOf('// ─── Publicar en la app'))
  const tx = prep.indexOf('db().$transaction(')
  const hist = prep.indexOf('insert into historial_interno', tx)
  assert.ok(tx > 0 && hist > tx && hist < prep.indexOf('return { nuevo: true as const'), 'dentro de la transacción del borrador nuevo')
})

test('🪤 si el Telegram de la elección no sale, queda en la ficha (historial + evento) con su motivo', async () => {
  const { lineaHistorialAvisoFallido, EVENTO_AVISO_FALLIDO } = await import('./renovacion-alternativas-reglas.ts')
  assert.match(lineaHistorialAvisoFallido('sin_canal'), /Telegram/)
  assert.match(lineaHistorialAvisoFallido('sin_canal'), /sin_canal/)
  assert.equal(typeof EVENTO_AVISO_FALLIDO, 'string')
  const src = readFileSync(new URL('./renovacion-alternativas.ts', import.meta.url), 'utf8')
  const av = src.slice(src.indexOf('export async function avisarEleccion'))
  assert.ok(av.length > 0 && av.indexOf('tgSend(') > 0)
  assert.match(av, /EVENTO_AVISO_FALLIDO/)
  assert.match(av, /insert into historial_interno/)
  const ruta = readFileSync(new URL('../app/api/portal/presupuesto/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /after\(\(\) => avisarEleccion\(/)
})

test('🪤 la cabecera de la migración 2026-11-05b solo cita rutas y ficheros que existen', async () => {
  const { existsSync } = await import('node:fs')
  const sql = readFileSync(new URL('../prisma/sql/2026-11-05b_presupuesto_renovacion.sql', import.meta.url), 'utf8')
  const cabecera = sql.slice(0, sql.indexOf('BEGIN;'))
  const raiz = new URL('../../', import.meta.url)
  const ficheros = [...cabecera.matchAll(/(?:apps\/[\w-]+\/)?lib\/[\w./-]+\.ts|app\/[\w/()[\]-]+\.tsx?/g)].map((m) => m[0])
  assert.ok(ficheros.length >= 2)
  for (const f of ficheros) {
    const ok = f.startsWith('apps/') ? existsSync(new URL(`../${f}`, raiz)) : ['asegura', 'asegura-portal'].some((a) => existsSync(new URL(`${a}/${f}`, raiz)))
    assert.ok(ok, `${f} no existe`)
  }
  for (const m of cabecera.matchAll(/\/api\/operador\/renovacion\/\{([^}]+)\}/g)) {
    for (const r of m[1]!.split(',')) assert.ok(existsSync(new URL(`asegura/app/api/operador/renovacion/${r.trim()}/route.ts`, raiz)), `ruta ${r} no existe`)
  }
})
