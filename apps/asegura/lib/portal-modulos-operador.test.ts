import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoCliente, esCarteraEnVigor } from '@central/module-seguros'
import { ORIGENES_VINCULO, ORIGEN_VINCULO_AUTORIZACION } from '@central/module-seguros-portal'
import { decidirProspecto, fichaProspecto, identidadesQueActivan, textoHistorialProspecto, vistaSolicitud, estadoDelModulo, fichasModulos, planDeEscritura, puedeActivar, textoHistorialModulo, type FilaModuloCliente } from './portal-modulos-operador.ts'

const fila = (o: Partial<FilaModuloCliente>): FilaModuloCliente => ({ id: 'f1', identidadId: 'i1', modulo: 'alquileres', estado: 'activo', ...o })

// 27/10/2026 (Alberto, REESCRITO A PROPÓSITO): activar = AUTORIZAR. Antes «alquileres exige póliza en vigor» (0 → no);
// ahora ningún módulo mira pólizas. Lo único que impide activar a una ficha es no tener identidad del portal.
test('🚨 activación SIN póliza: cualquier módulo se activa con una identidad, tenga o no pólizas', () => {
  for (const m of ['alquileres', 'flota', 'rrhh'] as const) {
    const f = fichasModulos([], { identidades: 1 })!.find((x) => x.id === m)!
    assert.deepEqual([f.puedeActivar, f.motivoNoActivar], [true, null], m)
  }
  assert.equal(puedeActivar({ identidades: 1 }).puede, true)
  // La firma ya no admite el recuento de pólizas: no puede volver por la puerta de atrás.
  assert.equal(puedeActivar.length, 1)
  const src = readFileSync(new URL('./portal-modulos-operador.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /MODULOS_CON_POLIZA_EN_VIGOR|polizasEnVigor/)
})

test('null = no se ha podido mirar: no se ofrece activar y no se confunde con 0', () => {
  const b = puedeActivar({ identidades: null })
  assert.ok(!b.puede && /No se ha podido comprobar/.test(b.motivo))
})

test('sin identidad en el portal no hay dónde colgar la fila', () => {
  const d = puedeActivar({ identidades: 0 })
  assert.ok(!d.puede && /aún no ha entrado/.test(d.motivo))
})

test('estado agregado: activo > solicitado > inactivo; las retiradas no cuentan', () => {
  assert.equal(estadoDelModulo([], 'alquileres'), 'inactivo')
  assert.equal(estadoDelModulo([fila({ estado: 'retirado' })], 'alquileres'), 'inactivo')
  assert.equal(estadoDelModulo([fila({ estado: 'solicitado' })], 'alquileres'), 'solicitado')
  assert.equal(estadoDelModulo([fila({ estado: 'solicitado' }), fila({ id: 'f2', identidadId: 'i2' })], 'alquileres'), 'activo')
  assert.equal(estadoDelModulo([fila({ modulo: 'flota' })], 'alquileres'), 'inactivo')
})

test('plan al activar: crea, promueve la solicitada y no toca la activa', () => {
  const filas = [fila({ id: 'a', identidadId: 'i1', estado: 'solicitado' }), fila({ id: 'b', identidadId: 'i2', estado: 'activo' }), fila({ id: 'c', identidadId: 'i3', estado: 'retirado' })]
  assert.deepEqual(planDeEscritura('activar', 'alquileres', ['i1', 'i2', 'i3', 'i4'], filas), [
    { tipo: 'activar', filaId: 'a' },
    { tipo: 'insertar_activo', identidadId: 'i3' },
    { tipo: 'insertar_activo', identidadId: 'i4' },
  ])
})

test('plan al retirar: toda fila vigente de ESAS identidades, nunca las ajenas ni otro módulo', () => {
  const filas = [fila({ id: 'a', identidadId: 'i1' }), fila({ id: 'b', identidadId: 'i2', estado: 'solicitado' }), fila({ id: 'x', identidadId: 'i9' }), fila({ id: 'y', identidadId: 'i1', modulo: 'flota' })]
  assert.deepEqual(planDeEscritura('retirar', 'alquileres', ['i1', 'i2'], filas), [{ tipo: 'retirar', filaId: 'a' }, { tipo: 'retirar', filaId: 'b' }])
})

test('fichas: catálogo entero en orden; sin filas leídas no se pinta nada', () => {
  assert.equal(fichasModulos(null, { identidades: 1 }), null)
  const f = fichasModulos([fila({})], { identidades: 1 })!
  assert.deepEqual(f.map((x) => x.id), ['flota', 'rrhh', 'alquileres'])
  const alq = f.find((x) => x.id === 'alquileres')!
  assert.deepEqual([alq.estado, alq.puedeActivar, alq.motivoNoActivar, alq.puedeRetirar], ['activo', false, null, true])
  const flota = f.find((x) => x.id === 'flota')!
  assert.deepEqual([flota.estado, flota.puedeActivar, flota.puedeRetirar], ['inactivo', true, false])
})

test('historial: dice módulo, acción y quién', () => {
  assert.match(textoHistorialModulo('alquileres', 'activar', 'a@b.es'), /activado: Patrimonio y alquileres \(a@b\.es\)/)
  assert.match(textoHistorialModulo('flota', 'retirar', 'x'), /retirado: Flota/)
})

test('vistaSolicitud: nombre legible; con ficha se activa sin mirar pólizas; sin ficha, se activa creando prospecto', () => {
  const ok = vistaSolicitud('alquileres', 'c1')
  assert.deepEqual([ok.moduloNombre, ok.puedeActivar, ok.motivoNoActivar, ok.creaProspecto], ['Patrimonio y alquileres', true, null, false])
  assert.equal(vistaSolicitud('flota', 'c1').puedeActivar, true)
  const sinFicha = vistaSolicitud('alquileres', null)
  assert.deepEqual([sinFicha.puedeActivar, sinFicha.creaProspecto], [true, true])
  assert.ok(!vistaSolicitud('inventado', 'c1').puedeActivar)
  assert.equal(vistaSolicitud('inventado', null).creaProspecto, false)
})

// ── Activación SIN ficha (27/10/2026): ficha de prospecto + vínculo `autorizacion_corredor` ──
test('🚨 activación sin ficha: solo a quien PIDIÓ ese módulo, sin ficha y que no es el corredor', () => {
  assert.deepEqual(decidirProspecto({ filaVigente: 'solicitado', vinculosPropios: 0, esCorredor: false, ultimoVinculo: null }), { crear: true })
  for (const [e, re] of [
    [{ filaVigente: null, vinculosPropios: 0, esCorredor: false, ultimoVinculo: null }, /no ha pedido/],
    [{ filaVigente: 'activo', vinculosPropios: 0, esCorredor: false, ultimoVinculo: null }, /ya está activado/],
    [{ filaVigente: 'solicitado', vinculosPropios: 1, esCorredor: false, ultimoVinculo: null }, /ya tiene una ficha/],
    [{ filaVigente: 'solicitado', vinculosPropios: 0, esCorredor: true, ultimoVinculo: null }, /vista de corredor/],
    // Su email casa con varias fichas: ya está en la cartera; un prospecto sería otra ficha más.
    [{ filaVigente: 'solicitado', vinculosPropios: 0, esCorredor: false, ultimoVinculo: 'ambiguo' }, /vincúlala a mano/],
  ] as const) {
    const d = decidirProspecto(e)
    assert.ok(!d.crear && d.status === 409 && re.test(d.motivo), JSON.stringify(e))
  }
})

test('🚨 la ficha de prospecto es lead/prospecto/portal, activa, y su nombre es lo tecleado (o un rótulo, nunca vacío)', () => {
  const p = fichaProspecto('  Ana   Pérez ')
  assert.deepEqual([p.nombre, p.apellidos, p.tipo, p.segmento, p.fuente, p.activo], ['Ana Pérez', '', 'lead', 'prospecto', 'portal', true])
  assert.match(p.notas, /NO es cliente/)
  assert.match(p.notas, /sin comprobar/)
  assert.equal(fichaProspecto(null).nombre, 'Prospecto del portal')
  assert.equal(fichaProspecto('   ').nombre, 'Prospecto del portal')
  assert.match(textoHistorialProspecto('alquileres', 'a@b.es'), /prospecto.*Patrimonio y alquileres.*sin póliza.*a@b\.es/)
})

// La regla de la casa: «32.600 fichas ≠ clientes». Cliente = póliza viva de CIMA EN VIGOR (`esCarteraEnVigor`), nunca
// `clientes.tipo`. Una ficha de prospecto nace SIN pólizas: ninguna póliza suya pasa `esCarteraEnVigor` y su estado derivado es
// «lead». Y los recuentos de cartera cuentan «cliente» solo con ≥1 póliza en vigor (`resumenCartera`).
test('🚨 el prospecto NO cuenta como cliente: sin pólizas en vigor es lead en el estado derivado y en el recuento', () => {
  const polizasDelProspecto: Parameters<typeof esCarteraEnVigor>[0][] = []
  assert.equal(polizasDelProspecto.some(esCarteraEnVigor), false)
  const e = estadoCliente({ polizasConfirmadasActivas: 0, polizasConfirmadasCanceladas: 0, polizasHistoricas: 0, polizasPendientesCima: 0, cotizacionesVivas: 0 })
  assert.equal(e.estado, 'lead')
  // Y una póliza que no es de CIMA o no está vigente tampoco lo haría cliente.
  assert.equal(esCarteraEnVigor({ importRef: 'intranet:1', eiacXmlHash: null, estado: 'vigente' }), false)
  // El recuento de «clientes» del resumen exige una póliza EN VIGOR por ficha (no `clientes.tipo`, no «tiene ficha»).
  const cartera = readFileSync(new URL('./cartera.ts', import.meta.url), 'utf8')
  const resumen = cartera.slice(cartera.indexOf('export async function resumenCartera('), cartera.indexOf('export async function vencimientosProximos('))
  assert.match(resumen, /count\(\*\) filter \(where v\.polizas_en_vigor > 0\)::bigint as clientes/)
  assert.match(resumen, /sqlCarteraEnVigor\('p'\)/)
  assert.doesNotMatch(resumen, /c\.tipo\b|segmento/)
})

test('🚨 el origen nuevo del vínculo está en el CHECK del SQL y NO es el de la vista de corredor (opera como una persona)', () => {
  assert.equal(ORIGEN_VINCULO_AUTORIZACION, 'autorizacion_corredor')
  assert.deepEqual(identidadesQueActivan([{ identidadId: 'p', nivel: 'gestionar', origen: ORIGEN_VINCULO_AUTORIZACION }]), ['p'])
  const sql = readFileSync(new URL('../prisma/sql/2026-10-27_portal_acceso_por_autorizacion.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
  const check = sql.match(/portal_vinculo_origen_check\s+CHECK \(origen = ANY \(ARRAY\[([^\]]*)\]\)\)/)
  assert.ok(check, 'el SQL tiene que redefinir portal_vinculo_origen_check')
  const enSql = [...check[1].matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1])
  assert.deepEqual(enSql, [...ORIGENES_VINCULO])
})

test('🚨 la escritura por identidad: candado, re-decide en la transacción, crea ficha+vínculo+activa y deja historial; sin SQL, 503', () => {
  const src = readFileSync(new URL('./portal-modulos-cartera.ts', import.meta.url), 'utf8')
  const f = src.slice(src.indexOf('export async function escribirModuloPorIdentidad('))
  assert.match(f, /if \(!\(await checkOrigenAplicado\(\)\)\) return \{ ok: false, status: 503, estado: 'sin_migracion'/)
  assert.match(f, /pg_advisory_xact_lock\(hashtext\(\$\{`portal-prospecto:\$\{identidadId\}`\}\)\)/)
  const tx = f.slice(f.indexOf('db.$transaction('), f.indexOf('return creada.id'))
  for (const re of [/decidirProspecto\(/, /tx\.cliente\.create\(/, /insert into portal_vinculo/, /'gestionar', \$\{ORIGEN_VINCULO_AUTORIZACION\}/,
    /update portal_modulo set estado = 'activo'/, /textoHistorialProspecto\(modulo, actor\)/, /textoHistorialModulo\(modulo, 'activar', actor\)/]) {
    assert.match(tx, re, String(re))
  }
  // La fila tiene que ser de ESA identidad y de ESE módulo (no se activa a cualquiera por id).
  assert.match(tx, /where identidad_id = \$\{identidadId\}::uuid and modulo = \$\{modulo\} and estado <> 'retirado'/)
  assert.match(tx, /ultimoVinculo: ident\.ultimoVinculo/)
  assert.match(tx, /anotarCambio\(\{ entidad: 'cliente', id: creada\.id, campo: 'activo', antes: null, despues: true \}\)/)
  assert.match(f, /if \(esViolacionDelCheck\(e\)\) return \{ ok: false, status: 503, estado: 'sin_migracion'/)
})

// Cepo (27/10/2026): «Activar Patrimonio en /correduria aún no abre /patrimonio». Con la vista de corredor abierta sobre
// la ficha, su vínculo temporal (`origen='corredor'`) contaba como «el cliente ha entrado»: la fila `activo` se colgaba
// de la identidad del CORREDOR, la ficha salía «Activado» y el cliente (que el portal decide por SUS vínculos que operan,
// `accesosPatrimonio`) nunca abría `/patrimonio`.
test('🚨 los módulos se cuelgan solo de identidades que SON la persona de la ficha (sin vista de corredor ni niveles que no operan)', () => {
  const v = (identidadId: string, nivel: string, origen: string) => ({ identidadId, nivel, origen })
  assert.deepEqual(identidadesQueActivan([v('corr', 'gestionar', 'corredor')]), [])
  assert.deepEqual(identidadesQueActivan([v('cli', 'gestionar', 'email_hash'), v('corr', 'gestionar', 'corredor')]), ['cli'])
  assert.deepEqual(identidadesQueActivan([v('a', 'administrar', 'manual'), v('t', 'tarjeta', 'manual'), v('c', 'completo', 'email_hash')]), ['a'])
  // Solo con la vista del corredor, la ficha cuenta como «aún no ha entrado»: no se activa en el aire.
  const d = puedeActivar({ identidades: identidadesQueActivan([v('corr', 'gestionar', 'corredor')]).length })
  assert.ok(!d.puede && /aún no ha entrado/.test(d.motivo))
})

test('🚨 el SQL de la ficha pasa los vínculos por identidadesQueActivan (lee nivel y origen)', () => {
  const src = readFileSync(new URL('./portal-modulos-cartera.ts', import.meta.url), 'utf8')
  const leer = src.slice(src.indexOf('async function leer('), src.indexOf('export async function modulosDeFicha'))
  assert.match(leer, /select identidad_id::text as "identidadId", nivel, origen from portal_vinculo/)
  assert.match(leer, /const identidades = identidadesQueActivan\(vinc\)/)
})
