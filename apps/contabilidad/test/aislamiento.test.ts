// Aislamiento por empresa en las CONSULTAS (segunda capa, además de RLS): cada SQL que emite el repositorio lleva el filtro
// explícito de la empresa con la que se construyó, enlazado como parámetro. Si un método olvida el filtro, rojo.
// Cepo visto fallar el 05/11/2026: quitando `WHERE empresa_id = ${e}::uuid AND` de `planCuentas` en lib/repo.ts → rojo en
// «planCuentas»; restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repoSql, type RepoContable } from '../lib/repo.ts'
import { crearConEmpresa, SinEmpresaError } from '../lib/rls.ts'
import type { TxSql } from '../lib/rls.ts'

const E = '00000000-0000-4000-8000-00000000000a'
type Llamada = { sql: string; valores: unknown[] }

function txGrabadora(): { tx: TxSql; llamadas: Llamada[] } {
  const llamadas: Llamada[] = []
  const filaGenerica = {
    id: '00000000-0000-4000-8000-000000000001', numero: 1, ejercicio: 2026, fecha: new Date('2026-01-02'), concepto: 'x', origen: 'manual',
    reversa_de: null, rectificado_por: null, ultimo_numero: 0, n: 0, debe: 0, haber: 0, saldo: 0, anio: 2026, inicio: '2026-01-01',
    fin: '2026-12-31', estado: 'abierto', codigo: '572', nombre: 'Bancos', grupo: 5, naturaleza: 'deudora', admite_apuntes: true, activa: true,
    cuenta: '572', orden: 1, documento: null, huella: 'a'.repeat(64), motivo: null, asiento_id: null, tipo_hecho: 'venta', cuentas: {},
    razon_social: 'X', nif: 'B1', forma: 'sociedad', sector: 'generico', logo_url: null, color_primario: null, usuario_id: E, rol: 'dueno',
    asiento_id_: null, ok: 1,
    mes: '2026-01', valor: null, desde: new Date('2026-01-01'), medio: null, importe: 1, ref: 'R-1', pendientes: 0, rechazados: 0, version: 1,
    proveedor_nif: 'B12345674', proveedor_nombre: 'P', fecha_contable: new Date('2026-01-02'), fecha_valor: new Date('2026-01-02'),
    base_cent: 100, cuota_cent: 21, retencion_cent: 0, total_cent: 121, adjunto_ref: null, importe_cent: -100, cuenta_ref: 'c', contraparte: 'x', referencia: '',
    retencion_pct: null, patron: 'banco', sentido: 'cargo', cnae: '4520',
    clave: 'k', tipo: 'fiscal', severidad: 'info', titulo: 't', detalle: 'd', fecha_ref: null, enlace: null, creado_en: new Date('2026-01-01'), leido_en: null,
  }
  const tx: TxSql = {
    async $queryRaw<T>(q: TemplateStringsArray, ...valores: unknown[]) {
      llamadas.push({ sql: q.join('?'), valores })
      return [filaGenerica] as unknown as T
    },
    async $executeRaw(q: TemplateStringsArray, ...valores: unknown[]) {
      llamadas.push({ sql: q.join('?'), valores })
      return 1
    },
  }
  return { tx, llamadas }
}

const asiento = { ejercicio: 2026, numero: 1, fecha: '2026-01-02', concepto: 'x', origen: 'manual' as const, hash: 'a'.repeat(64), apuntes: [{ cuenta: '572', debe: 1, haber: 0 }, { cuenta: '100', debe: 0, haber: 1 }] }

const LLAMADAS: [string, (r: RepoContable) => Promise<unknown>][] = [
  ['empresa', (r) => r.empresa()],
  ['planCuentas', (r) => r.planCuentas()],
  ['ejercicio', (r) => r.ejercicio(2026)],
  ['ejercicios', (r) => r.ejercicios()],
  ['reservarNumero', (r) => r.reservarNumero(2026)],
  ['insertarAsiento', (r) => r.insertarAsiento(asiento)],
  ['asiento', (r) => r.asiento('00000000-0000-4000-8000-000000000001')],
  ['diario', (r) => r.diario({ limite: 50 })],
  ['diario por ejercicio', (r) => r.diario({ limite: 50, ejercicio: 2026 })],
  ['mayor', (r) => r.mayor('572', { limite: 50, ejercicio: 2026 })],
  ['hechoPorClave', (r) => r.hechoPorClave('taller', 'venta', 'F-1')],
  ['insertarHecho', (r) => r.insertarHecho({ app: 'taller', tipo: 'venta', ref: 'F-1', fecha: '2026-01-02', payload: {}, huella: 'a'.repeat(64) })],
  ['cerrarHecho', (r) => r.cerrarHecho('00000000-0000-4000-8000-000000000001', 'asentado', null, '00000000-0000-4000-8000-000000000002')],
  ['reglasVigentes', (r) => r.reglasVigentes()],
  ['origenAutorizado', (r) => r.origenAutorizado('taller')],
  ['sumasPorCuenta periodo', (r) => r.sumasPorCuenta({ desde: '2026-01-01', hasta: '2026-01-31' })],
  ['sumasPorCuenta acumulado', (r) => r.sumasPorCuenta({ hasta: '2026-01-31' })],
  ['auditar', (r) => r.auditar({ actor: 'operador', accion: 'x', entidad: 'y' })],
  ['asientosPeriodo', (r) => r.asientosPeriodo({ desde: '2026-01-01', hasta: '2026-12-31', limite: 10 })],
  ['asientosPeriodo acumulado', (r) => r.asientosPeriodo({ hasta: '2026-12-31', limite: 10 })],
  ['sumasMensuales', (r) => r.sumasMensuales({ hasta: '2026-12-31' })],
  ['sumasPorDimension', (r) => r.sumasPorDimension('ot', { desde: '2026-01-01', hasta: '2026-12-31' })],
  ['partidasPorDocumento', (r) => r.partidasPorDocumento(['43', '40'], { hasta: '2026-12-31' })],
  ['cobrosPorMedio', (r) => r.cobrosPorMedio({ desde: '2026-01-01', hasta: '2026-12-31' })],
  ['cobrosEfectivoAltos', (r) => r.cobrosEfectivoAltos({ desde: '2026-01-01', umbral: 100000 })],
  ['contarHechos', (r) => r.contarHechos()],
  ['guardarRegla', (r) => r.guardarRegla('venta', { ingreso: '705' }, E)],
  ['insertarAviso', (r) => r.insertarAviso({ clave: 'k', tipo: 'fiscal', severidad: 'info', titulo: 't', detalle: 'd', fechaRef: '2026-01-02', enlace: '/informes' })],
  ['avisos', (r) => r.avisos({ limite: 10 })],
  ['contarAvisosSinLeer', (r) => r.contarAvisosSinLeer()],
  ['marcarAvisosLeidos', (r) => r.marcarAvisosLeidos(E)],
  ['contarCuentas', (r) => r.contarCuentas()],
  ['contarAperturasVivas', (r) => r.contarAperturasVivas(2026)],
  ['sembrarPlan', (r) => r.sembrarPlan([{ codigo: '572', nombre: 'B', grupo: 5, naturaleza: 'deudora', admiteApuntes: true, activa: true }])],
  ['crearEjercicio', (r) => r.crearEjercicio({ anio: 2026, inicio: '2026-01-01', fin: '2026-12-31', estado: 'abierto' })],
  ['vinculos', (r) => r.vinculos()],
  ['vincular', (r) => r.vincular(E, 'gestor')],
  ['autorizarOrigen', (r) => r.autorizarOrigen('taller')],
  // ── F3 ──
  ['cnaeEmpresa', (r) => r.cnaeEmpresa()],
  ['fijarActividad', (r) => r.fijarActividad('4520', 'taller')],
  ['proveedor', (r) => r.proveedor('B12345674')],
  ['proveedoresRecientes', (r) => r.proveedoresRecientes(20)],
  ['guardarProveedor', (r) => r.guardarProveedor({ nif: 'B12345674', nombre: 'P', tipo: 'proveedor', categoria: 'mercaderias', retencionPct: null })],
  ['facturaRecibidaPorClave', (r) => r.facturaRecibidaPorClave('B12345674', 'F-1')],
  ['insertarFacturaRecibida', (r) => r.insertarFacturaRecibida({ proveedorNif: 'B12345674', proveedorNombre: 'P', numero: 'F-1', numeroNorm: 'F-1', fecha: '2026-01-02', fechaContable: '2026-01-02', base: 100, cuota: 21, retencion: 0, total: 121, lineas: [], origen: 'manual', hechoId: E, asientoId: E, creadaPor: E })],
  ['facturasRecibidas', (r) => r.facturasRecibidas({ limite: 10 })],
  ['insertarMovimientosBanco', (r) => r.insertarMovimientosBanco([{ cuentaRef: 'c', fecha: '2026-01-02', fechaValor: '2026-01-02', importe: -100, concepto: 'x', contraparte: 'x', referencia: '', saldo: null, origen: 'csv', huella: 'a'.repeat(64) }], E)],
  ['movimientosBanco pendientes', (r) => r.movimientosBanco({ filtro: 'pendientes', limite: 10 })],
  ['movimientosBanco conciliados', (r) => r.movimientosBanco({ filtro: 'conciliados', limite: 10 })],
  ['movimientoBanco', (r) => r.movimientoBanco(E)],
  ['insertarConciliacion', (r) => r.insertarConciliacion({ movimientoId: E, tipo: 'pago', documento: 'D', cuenta: '400', metodo: 'importe_exacto', hechoId: E, asientoId: E, confirmadaPor: E })],
  ['reglasConciliacion', (r) => r.reglasConciliacion()],
  ['insertarReglaConciliacion', (r) => r.insertarReglaConciliacion({ patron: 'banco', cuenta: '626', sentido: 'cargo' }, E)],
  ['desactivarReglaConciliacion', (r) => r.desactivarReglaConciliacion(E)],
]

for (const [nombre, llamar] of LLAMADAS) {
  test(`aislamiento SQL: ${nombre} filtra/escribe SIEMPRE con la empresa del repositorio`, async () => {
    const { tx, llamadas } = txGrabadora()
    await llamar(repoSql(tx, E))
    assert.ok(llamadas.length > 0, 'no emitió SQL')
    for (const l of llamadas) {
      const sql = l.sql.trim()
      const filtro = /^INSERT INTO contabilidad\.\w+ \(\s*(usuario_id, )?empresa_id\b/.test(sql)
        ? true // INSERT: la empresa es una columna (y RLS WITH CHECK la exige igual a la de la sesión)
        : /WHERE (\w+\.)?empresa_id = \?::uuid/.test(sql) || /^SELECT [\s\S]* FROM contabilidad\.empresas WHERE id = \?::uuid/.test(sql)
        || /^SELECT contabilidad\.fijar_actividad\(\?::uuid, /.test(sql) // función SECURITY DEFINER: ella misma exige que la empresa sea la de la sesión
      assert.ok(filtro, `consulta sin filtro de empresa:\n${l.sql}`)
      assert.ok(l.valores.includes(E), `la empresa no va como parámetro:\n${l.sql}`)
      // En un JOIN, AMBAS tablas se filtran (no basta con la condición del JOIN).
      if (/JOIN contabilidad\.asientos a/.test(l.sql) && /contabilidad\.apuntes p/.test(l.sql)) {
        assert.match(l.sql, /p\.empresa_id = \?::uuid/)
        assert.match(l.sql, /a\.empresa_id = \?::uuid/)
      }
    }
  })
}

test('cada método del repositorio está en la lista de aislamiento (uno nuevo no se cuela sin probar)', () => {
  const { tx } = txGrabadora()
  const metodos = Object.keys(repoSql(tx, E)).filter((k) => k !== 'empresaId').sort()
  const probados = [...new Set(LLAMADAS.map(([n]) => n.split(' ')[0]))].sort()
  assert.deepEqual(metodos, probados)
})

test('conEmpresa falla CERRADO: sin uuid no abre transacción; con uuid fija el ajuste LOCAL antes de la función', async () => {
  let transacciones = 0
  const visto: string[] = []
  const cliente = {
    async $transaction<R>(fn: (tx: TxSql) => Promise<R>) {
      transacciones += 1
      const { tx } = txGrabadora()
      const t: TxSql = { ...tx, async $queryRaw<T>(q: TemplateStringsArray, ...v: unknown[]) { visto.push(q.join('?')); return [{ v: v[0] }] as unknown as T } }
      return fn(t)
    },
  }
  const conEmpresa = crearConEmpresa(cliente)
  for (const malo of [undefined, null, '', 'piloto', `${E}' OR 1=1 --`, 42, {}]) {
    await assert.rejects(conEmpresa(malo, async () => 'no'), SinEmpresaError)
  }
  assert.equal(transacciones, 0)
  assert.equal(await conEmpresa(E.toUpperCase(), async () => 'ok'), 'ok')
  assert.match(visto[0], /set_config\('contabilidad\.empresa_id', \?, true\)/)
})

test('conEmpresa aborta si el ajuste de sesión no se aplicó', async () => {
  let ejecutada = false
  const conEmpresa = crearConEmpresa({ $transaction: async (fn) => fn({ $queryRaw: async () => [] as never }) })
  await assert.rejects(conEmpresa(E, async () => { ejecutada = true }), SinEmpresaError)
  assert.equal(ejecutada, false)
})
