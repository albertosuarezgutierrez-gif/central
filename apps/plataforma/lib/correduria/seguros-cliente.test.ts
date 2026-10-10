import test from 'node:test'
import assert from 'node:assert/strict'
import { aniversarioOportunidad, repartirSegurosCliente, estaHuerfana, estadoVencimiento, vencimientoPoliza, segurosDeReparto, contarOportunidades, precargaAlta } from './seguros-cliente.ts'
import type { PolizaDeclaradaFicha, PolizaFicha } from '../ficha-asegura'
import type { OportunidadDeCliente } from '../seguimiento-asegura'

const pol = (id: string, over: Partial<PolizaFicha> = {}): PolizaFicha => ({
  id, tipo: 'auto', aseguradora: 'Reale', numeroPoliza: id, estado: 'en_vigor',
  fechaInicio: null, fechaVencimiento: '2027-01-01', prima: 300, fraccionamiento: null, matricula: null,
  objeto: null, viva: true, leadDescartado: null, confirmadaCima: true, retarificable: false, retarificacion: null,
  recibos: null, pago: null, evolucionPrima: null,
  ...over,
} as PolizaFicha)

const opo = (id: string, over: Partial<OportunidadDeCliente> = {}): OportunidadDeCliente => ({
  id, clienteId: 'c', ramo: 'auto', estado: 'competencia', fechaFinVigencia: null, motivoPerdida: null,
  competidor: null, primaCompetidor: null, aparcadaHasta: null, cerradaAt: null,
  aseguradora: 'Mapfre', numeroPoliza: null, matricula: null, vehiculo: null, seguroAnterior: null, prima: null, creada: '2026-09-01', proximaTarea: { tipo: 'llamada', fechaLimite: '2026-09-30' },
  ...over,
})

const ids = (l: { id: string }[]) => l.map(s => s.id)

test('en vigor y pendiente de CIMA están con nosotros; cancelada y vencida son oportunidad; fin_riesgo ya no existe', () => {
  const r = repartirSegurosCliente({
    polizas: [
      pol('vigor'),
      pol('emitida', { confirmadaCima: false }),
      pol('anula', { estado: 'anula_al_vencimiento' }),
      pol('cancel', { estado: 'cancelada' }),
      pol('venc', { estado: 'vencida' }),
      pol('comp', { estado: 'competencia' }),
      pol('fin', { estado: 'fin_riesgo' }),
    ],
    declaradas: [],
    oportunidades: [],
  })
  assert.deepEqual(ids(r.conNosotros).sort(), ['anula', 'emitida', 'vigor'])
  assert.deepEqual(ids(r.oportunidades).sort(), ['cancel', 'comp', 'venc'])
  assert.deepEqual(ids(r.yaNoExiste), ['fin'])
})

test('volcado histórico: la más reciente de cada ramo sin cubrir es oportunidad; el resto va plegado', () => {
  // Rafael Campa (25/09/2026): su auto de Pelayo de 2015 se le ofrecía por WhatsApp y la
  // ficha solo lo nombraba en una nota al pie. «Póliza en competencia es oportunidad».
  const r = repartirSegurosCliente({
    polizas: [
      pol('auto2015', { viva: false, estado: 'recibo_devuelto', fechaVencimiento: '2015-10-20' }),
      pol('auto2013', { viva: false, estado: 'vencida', fechaVencimiento: '2013-10-20' }),
      pol('hogarViejo', { viva: false, tipo: 'hogar', fechaVencimiento: '2016-03-01' }),
      pol('hogarVivo', { tipo: 'hogar' }),
      pol('finRiesgo', { viva: false, tipo: 'moto', estado: 'fin_riesgo' }),
    ],
    declaradas: [],
    oportunidades: [],
  })
  assert.deepEqual(ids(r.oportunidades), ['auto2015'])
  const t = r.oportunidades[0]
  assert.ok(t.clase === 'poliza' && t.historica === true)
  assert.deepEqual(ids(r.historicas).sort(), ['auto2013', 'finRiesgo', 'hogarViejo'])
})

test('volcado histórico: una oportunidad abierta del ramo se engancha a su tarjeta; «ya no lo necesita» la retira', () => {
  const r = repartirSegurosCliente({
    polizas: [
      pol('auto', { viva: false, fechaVencimiento: '2015-10-20' }),
      pol('hogar', { viva: false, tipo: 'hogar', fechaVencimiento: '2015-05-01' }),
    ],
    declaradas: [],
    oportunidades: [opo('o1', { ramo: 'auto' }), opo('p1', { ramo: 'hogar', estado: 'perdida', motivoPerdida: 'cliente_desiste', proximaTarea: null })],
  })
  const auto = r.oportunidades.find(s => s.id === 'auto')
  assert.ok(auto && auto.clase === 'poliza' && auto.oportunidad?.id === 'o1')
  assert.equal(r.oportunidades.some(s => s.id === 'o1' || s.id === 'hogar'), false)
  assert.deepEqual(ids(r.historicas), ['hogar'])
})

test('volcado histórico: no sale si del ramo hay algo más nuevo (perdida, fin_riesgo o aportada)', () => {
  const viejo = (id: string, tipo: string) => pol(id, { viva: false, tipo, fechaVencimiento: '2015-10-20' })
  const r = repartirSegurosCliente({
    polizas: [viejo('hAuto', 'auto'), viejo('hHogar', 'hogar'), viejo('hMoto', 'moto'), pol('finMoto', { tipo: 'moto', estado: 'fin_riesgo' })],
    declaradas: [{ id: 'd', ramo: 'hogar', yaEnCartera: false } as PolizaDeclaradaFicha],
    oportunidades: [opo('perdidaAuto', { estado: 'perdida', motivoPerdida: 'precio', proximaTarea: null })],
  })
  assert.deepEqual(ids(r.oportunidades).sort(), ['d', 'perdidaAuto'])
  assert.deepEqual(ids(r.historicas).sort(), ['hAuto', 'hHogar', 'hMoto'])
})

test('una oportunidad abierta se engancha a la póliza perdida del mismo ramo, sin duplicar tarjeta', () => {
  const r = repartirSegurosCliente({
    polizas: [pol('cancel', { estado: 'cancelada', tipo: 'hogar' })],
    declaradas: [],
    oportunidades: [opo('o1', { ramo: 'hogar' }), opo('o2', { ramo: 'moto' })],
  })
  assert.deepEqual(ids(r.oportunidades).sort(), ['cancel', 'o2'])
  const p = r.oportunidades.find(s => s.id === 'cancel')
  assert.ok(p && p.clase === 'poliza' && p.oportunidad?.id === 'o1')
})

test('perdidas: «ya no lo necesita» = ya no existe; por precio se reintenta; error_alta y ganadas no salen', () => {
  const r = repartirSegurosCliente({
    polizas: [],
    declaradas: [],
    oportunidades: [
      opo('desiste', { ramo: 'moto', estado: 'perdida', motivoPerdida: 'cliente_desiste' }),
      opo('precio', { ramo: 'hogar', estado: 'perdida', motivoPerdida: 'precio' }),
      opo('error', { ramo: 'vida', estado: 'perdida', motivoPerdida: 'error_alta' }),
      opo('ganada', { ramo: 'salud', estado: 'ganada' }),
    ],
  })
  assert.deepEqual(ids(r.yaNoExiste), ['desiste'])
  assert.deepEqual(ids(r.oportunidades), ['precio'])
})

test('una perdida no se repite si ya hay algo abierto del mismo ramo', () => {
  const r = repartirSegurosCliente({
    polizas: [],
    declaradas: [],
    oportunidades: [opo('vieja', { estado: 'perdida', motivoPerdida: 'precio' }), opo('nueva')],
  })
  assert.deepEqual(ids(r.oportunidades), ['nueva'])
})

test('las aportadas desde el portal son oportunidad salvo que ya estén en cartera', () => {
  const d = (id: string, yaEnCartera: boolean | null) => ({ id, yaEnCartera, fechaVencimiento: null } as PolizaDeclaradaFicha)
  const r = repartirSegurosCliente({ polizas: [], declaradas: [d('fuera', false), d('dentro', true), d('nose', null)], oportunidades: [] })
  assert.deepEqual(ids(r.oportunidades).sort(), ['fuera', 'nose'])
})

test('lo que no se pudo leer se declara, no se da por vacío', () => {
  const r = repartirSegurosCliente({ polizas: [], declaradas: null, oportunidades: null })
  assert.equal(r.oportunidadesLeidas, false)
  assert.equal(r.declaradasLeidas, false)
})

test('huérfana = abierta, sin próxima tarea y sin aparcar', () => {
  assert.equal(estaHuerfana(opo('a', { proximaTarea: null })), true)
  assert.equal(estaHuerfana(opo('b', { proximaTarea: null, aparcadaHasta: '2026-12-01' })), false)
  assert.equal(estaHuerfana(opo('c', { proximaTarea: null, estado: 'perdida' })), false)
})

test('una perdida no sale si ese ramo ya está con nosotros, ni como reintento ni como «ya no existe»', () => {
  const r = repartirSegurosCliente({
    polizas: [pol('hogar-vivo', { tipo: 'hogar' }), pol('moto-viva', { tipo: 'moto' })],
    declaradas: [],
    oportunidades: [
      opo('hogar-perdida', { ramo: 'hogar', estado: 'perdida', motivoPerdida: 'precio' }),
      opo('moto-desiste', { ramo: 'moto', estado: 'perdida', motivoPerdida: 'cliente_desiste' }),
    ],
  })
  assert.deepEqual(ids(r.oportunidades), [])
  assert.deepEqual(ids(r.yaNoExiste), [])
})

test('una abierta sin ramo no tapa las perdidas sin ramo', () => {
  const r = repartirSegurosCliente({
    polizas: [],
    declaradas: [],
    oportunidades: [opo('abierta', { ramo: null }), opo('perdida', { ramo: null, estado: 'perdida', motivoPerdida: 'precio' })],
  })
  assert.deepEqual(ids(r.oportunidades).sort(), ['abierta', 'perdida'])
})

test('volcado histórico: «Eliminar» quita el RAMO de Oportunidades, sin que la siguiente más vieja ocupe su sitio', () => {
  const quitada = { fecha: '2026-09-25T10:00:00Z', motivo: 'Duplicada' }
  const r = repartirSegurosCliente({
    polizas: [
      pol('otros2014', { viva: false, tipo: 'otros', fechaVencimiento: '2014-07-24', leadDescartado: quitada }),
      pol('otros2013', { viva: false, tipo: 'otros', fechaVencimiento: '2013-07-24' }),
      pol('hogar2015', { viva: false, tipo: 'hogar', fechaVencimiento: '2015-03-01' }),
    ],
    declaradas: [],
    oportunidades: [],
  })
  assert.deepEqual(ids(r.oportunidades), ['hogar2015'])
  assert.deepEqual(ids(r.descartadas), ['otros2014'])
  assert.deepEqual(ids(r.historicas), ['otros2013'])
})

test('viva cancelada: «Eliminar» la saca de Oportunidades a «descartadas», y su ramo no resucita una del volcado', () => {
  const quitada = { fecha: '2026-09-25T10:00:00Z', motivo: 'Ya no tiene ese seguro' }
  const r = repartirSegurosCliente({
    polizas: [
      pol('motoViva', { estado: 'cancelada', tipo: 'moto', leadDescartado: quitada }),
      pol('autoViva', { estado: 'cancelada', tipo: 'auto' }),
      pol('moto2015', { viva: false, tipo: 'moto', fechaVencimiento: '2015-03-01' }),
    ],
    declaradas: [],
    oportunidades: [],
  })
  assert.deepEqual(ids(r.oportunidades), ['autoViva'])
  assert.deepEqual(ids(r.descartadas), ['motoViva'])
  assert.deepEqual(ids(r.historicas), ['moto2015'])
})

test('la sustituida va DENTRO de la tarjeta de la nueva, no como un segundo seguro (moto Allianz→Occident, 28/09/2026)', () => {
  const r = repartirSegurosCliente({
    polizas: [
      pol('allianz', { tipo: 'moto', aseguradora: 'Allianz', fechaVencimiento: '2026-11-01', sustituida: true }),
      pol('occident', { tipo: 'moto', aseguradora: 'Occident', fechaVencimiento: '2027-11-01', sustituyeA: 'allianz' }),
    ],
    declaradas: [],
    oportunidades: [],
  })
  assert.deepEqual(ids(r.conNosotros), ['occident'])
  const t = r.conNosotros[0]
  assert.equal(t.clase === 'poliza' ? t.sustituye?.id : null, 'allianz')
  assert.deepEqual(ids(r.oportunidades), [])
})

test('sustituida sin la nueva a la vista sigue con nosotros (cubre hasta su vencimiento)', () => {
  const r = repartirSegurosCliente({
    polizas: [pol('vieja', { sustituida: true })],
    declaradas: [],
    oportunidades: [],
  })
  assert.deepEqual(ids(r.conNosotros), ['vieja'])
})

test('una abierta de OTRO seguro del mismo ramo no se engancha a la histórica (otro coche, otra matrícula)', () => {
  const hist = pol('mondeo', { aseguradora: 'Pelayo', numeroPoliza: 'P-HIST-01', matricula: '1111BBB', viva: false, estado: 'recibo_devuelto', fechaVencimiento: '2015-10-20' })
  const kalos = opo('kalos', { estado: 'en_negociacion', aseguradora: 'MUSSAP', numeroPoliza: 'P-COMP-02', matricula: '2222CCC' })
  const r = repartirSegurosCliente({ polizas: [hist], declaradas: [], oportunidades: [kalos], hoy: new Date('2026-09-28') })
  const tarjeta = r.oportunidades.find(s => s.id === 'mondeo')
  assert.ok(tarjeta && tarjeta.clase === 'poliza')
  assert.equal(tarjeta.oportunidad, null)
  assert.ok(r.oportunidades.some(s => s.clase === 'oportunidad' && s.id === 'kalos'))
})

test('una abierta sin datos que la distingan sigue enganchándose a la histórica del ramo', () => {
  const hist = pol('mondeo', { aseguradora: 'Pelayo', numeroPoliza: 'P-HIST-01', matricula: '1111BBB', viva: false, estado: 'recibo_devuelto', fechaVencimiento: '2015-10-20' })
  const r = repartirSegurosCliente({ polizas: [hist], declaradas: [], oportunidades: [opo('o', { estado: 'en_negociacion', aseguradora: null })], hoy: new Date('2026-09-28') })
  const tarjeta = r.oportunidades.find(s => s.id === 'mondeo')
  assert.ok(tarjeta && tarjeta.clase === 'poliza' && tarjeta.oportunidad?.id === 'o')
})

test('la oportunidad que cuelga de una póliza va a SU tarjeta aunque haya otra del mismo ramo', () => {
  // Al anotar el vencimiento se abre el seguimiento de ESA póliza: casar por ramo lo pintaba
  // en la primera tarjeta del ramo y la fecha recién guardada «no salía».
  const r = repartirSegurosCliente({
    polizas: [pol('hogarB', { tipo: 'hogar', estado: 'cancelada' }), pol('hogarA', { tipo: 'hogar', estado: 'cancelada' })],
    declaradas: [],
    // `o0` (sin póliza) va delante en la lista: no puede quedarse la tarjeta de `hogarB`.
    oportunidades: [opo('o0', { ramo: 'hogar' }), opo('o1', { ramo: 'hogar', polizaId: 'hogarB' })],
  })
  const a = r.oportunidades.find(s => s.id === 'hogarA'), b = r.oportunidades.find(s => s.id === 'hogarB')
  assert.ok(a?.clase === 'poliza' && a.oportunidad?.id === 'o0')
  assert.ok(b?.clase === 'poliza' && b.oportunidad?.id === 'o1')
})

test('vencimiento de la tarjeta: el del seguimiento manda sobre el del volcado', () => {
  const hoy = new Date('2026-09-29T10:00:00Z')
  const r = repartirSegurosCliente({
    polizas: [pol('moto', { viva: false, tipo: 'moto', fechaVencimiento: '2018-03-08' }), pol('auto', { viva: false, fechaVencimiento: null })],
    declaradas: [],
    oportunidades: [opo('o1', { ramo: 'moto', fechaFinVigencia: '2027-01-15', polizaId: 'moto' })],
    hoy,
  })
  const moto = r.oportunidades.find(s => s.id === 'moto'), auto = r.oportunidades.find(s => s.id === 'auto')
  assert.ok(moto?.clase === 'poliza' && auto?.clase === 'poliza')
  assert.deepEqual(vencimientoPoliza(moto, hoy), { fecha: '2027-01-15', delSeguimiento: true })
  // Sin seguimiento: un 2018 NO se proyecta a 2027 (fecha pasada = desconocido); sin fecha, null.
  assert.deepEqual(vencimientoPoliza({ ...moto, oportunidad: null }, hoy), { fecha: null, delSeguimiento: false })
  assert.deepEqual(vencimientoPoliza(auto, hoy), { fecha: null, delSeguimiento: false })
})

// ─── Regla de Alberto (30/09/2026): Seguro = cartera en vigor; todo lo demás, oportunidad ───

const hoy30 = new Date('2026-09-30T10:00:00Z')

test('estadoVencimiento: futuro conocido · pasado · sin fecha o ilegible; nunca se proyecta', () => {
  assert.deepEqual(estadoVencimiento('2027-01-10', hoy30), { estado: 'futuro', fecha: '2027-01-10' })
  assert.deepEqual(estadoVencimiento('2026-09-30', hoy30), { estado: 'futuro', fecha: '2026-09-30' })
  assert.deepEqual(estadoVencimiento('2017-11-19', hoy30), { estado: 'desconocido', ultimaFecha: '2017-11-19' })
  assert.deepEqual(estadoVencimiento(null, hoy30), { estado: 'desconocido', ultimaFecha: null })
  assert.deepEqual(estadoVencimiento('basura', hoy30), { estado: 'desconocido', ultimaFecha: null })
  assert.deepEqual(estadoVencimiento('2027-02-30', hoy30), { estado: 'desconocido', ultimaFecha: null })
})

test('caso real: 0 seguros en vigor y 2 filas del volcado → 0 seguros y 2 oportunidades derivadas', () => {
  const r = repartirSegurosCliente({
    polizas: [
      pol('p106', { viva: false, estado: 'activa', matricula: '1234ABC', objeto: { estado: 'conocido', titulo: 'Peugeot 106', detalle: null, nota: null, coberturas: null }, fechaVencimiento: '2017-11-19' }),
      pol('partner', { viva: false, estado: 'activa', matricula: '5678DEF', objeto: { estado: 'conocido', titulo: 'Peugeot Partner', detalle: null, nota: null, coberturas: null }, fechaVencimiento: null }),
    ],
    declaradas: [], oportunidades: [], hoy: hoy30,
  })
  assert.deepEqual(segurosDeReparto(r), [])
  assert.deepEqual(ids(r.oportunidades).sort(), ['p106', 'partner'])
  assert.equal(contarOportunidades(r), 2)
  const t = r.oportunidades.find(s => s.id === 'p106')
  assert.ok(t?.clase === 'poliza' && t.historica === true)
  // Ni pasada ni sin fecha: vencimiento desconocido (nada de 2027).
  assert.deepEqual(vencimientoPoliza(t, hoy30), { fecha: null, delSeguimiento: false })
  assert.deepEqual(vencimientoPoliza(r.oportunidades.find(s => s.id === 'partner') as never, hoy30), { fecha: null, delSeguimiento: false })
})

test('cartera en vigor: solo eso son seguros; cancelada y volcado no cuentan, la sustituida va dentro de la nueva', () => {
  const r = repartirSegurosCliente({
    polizas: [
      pol('vigor'), pol('cancel', { estado: 'cancelada', tipo: 'hogar' }),
      pol('vol', { viva: false, tipo: 'moto', fechaVencimiento: '2016-01-01' }),
      pol('allianz', { tipo: 'vida', sustituida: true }), pol('occident', { tipo: 'vida', sustituyeA: 'allianz' }),
    ],
    declaradas: [], oportunidades: [], hoy: hoy30,
  })
  assert.deepEqual(segurosDeReparto(r).map(p => p.id).sort(), ['allianz', 'occident', 'vigor'])
  assert.equal(contarOportunidades(r), 2) // cancel + vol
})

test('el contador de oportunidades no cuenta las perdidas por reintentar y es null si no se leyeron', () => {
  const r = repartirSegurosCliente({ polizas: [], declaradas: [], oportunidades: [opo('a'), opo('p', { ramo: 'hogar', estado: 'perdida', motivoPerdida: 'precio' })] })
  assert.equal(r.oportunidades.length, 2)
  assert.equal(contarOportunidades(r), 1)
  assert.equal(contarOportunidades(repartirSegurosCliente({ polizas: [], declaradas: [], oportunidades: null })), null)
})

test('dos coches del volcado son dos oportunidades; el mismo coche repetido con otra prima, una', () => {
  const r = repartirSegurosCliente({
    polizas: [
      pol('a1', { viva: false, matricula: '1111BBB', fechaVencimiento: '2016-05-01' }),
      pol('a2', { viva: false, matricula: '1111 BBB', fechaVencimiento: '2015-05-01', prima: 999 }),
      pol('b1', { viva: false, matricula: '2222CCC', fechaVencimiento: null }),
    ],
    declaradas: [], oportunidades: [], hoy: hoy30,
  })
  assert.deepEqual(ids(r.oportunidades).sort(), ['a1', 'b1'])
  assert.deepEqual(ids(r.historicas), ['a2'])
})

test('dedupe: si ya hay CUALQUIER oportunidad de ese riesgo (abierta, ganada o perdida), la derivada no se pinta', () => {
  for (const estado of ['competencia', 'ganada', 'perdida'] as const) {
    const r = repartirSegurosCliente({
      polizas: [pol('v', { viva: false, matricula: '1111BBB', fechaVencimiento: '2016-05-01' })],
      declaradas: [],
      oportunidades: [opo('o', { estado, matricula: '1111 bbb', motivoPerdida: estado === 'perdida' ? 'cliente_desiste' : null })],
      hoy: hoy30,
    })
    assert.equal(r.oportunidades.some(s => s.id === 'v'), false, estado)
  }
  // También por nº de póliza, aunque no haya matrícula.
  const r = repartirSegurosCliente({
    polizas: [pol('v', { viva: false, numeroPoliza: 'ABC-12345', fechaVencimiento: '2016-05-01' })],
    declaradas: [], oportunidades: [opo('o', { numeroPoliza: 'abc12345' })], hoy: hoy30,
  })
  assert.deepEqual(ids(r.oportunidades), ['o'])
  // Un descarte por error no es una oportunidad real: no tapa la derivada.
  const e = repartirSegurosCliente({
    polizas: [pol('v', { viva: false, matricula: '1111BBB', fechaVencimiento: '2016-05-01' })],
    declaradas: [], oportunidades: [opo('o', { estado: 'perdida', motivoPerdida: 'error_alta', matricula: '1111BBB' })], hoy: hoy30,
  })
  assert.deepEqual(ids(e.oportunidades), ['v'])
})

test('«Descartar (ya no lo tiene)»: la perdida creada para ese riesgo (matrícula) hace desaparecer SOLO esa derivada', () => {
  const r = repartirSegurosCliente({
    polizas: [
      pol('a', { viva: false, matricula: '1111BBB', fechaVencimiento: '2016-05-01' }),
      pol('b', { viva: false, matricula: '2222CCC', fechaVencimiento: '2016-05-01' }),
    ],
    declaradas: [],
    oportunidades: [opo('d', { estado: 'perdida', motivoPerdida: 'cliente_desiste', matricula: '1111BBB', proximaTarea: null })],
    hoy: hoy30,
  })
  assert.deepEqual(ids(r.oportunidades), ['b'])
})

test('otra matrícula viva no tapa una derivada: otro coche del volcado sigue siendo oportunidad', () => {
  const r = repartirSegurosCliente({
    polizas: [pol('vivo', { matricula: '1111BBB' }), pol('viejo', { viva: false, matricula: '2222CCC', fechaVencimiento: '2016-05-01' })],
    declaradas: [], oportunidades: [], hoy: hoy30,
  })
  assert.deepEqual(ids(r.oportunidades), ['viejo'])
})

test('precarga del alta desde una fila del volcado: vencimiento solo si es futuro; pasado → aviso, sin fecha', () => {
  const futura = precargaAlta(pol('f', { viva: false, matricula: '1111BBB', fechaVencimiento: '2027-03-01', aseguradora: 'Pelayo', numeroPoliza: 'N-1' }), hoy30)
  assert.equal(futura.fechaFinVigencia, '2027-03-01')
  assert.equal(futura.fechaObsoleta, null)
  assert.equal(futura.matricula, '1111BBB')
  assert.equal(futura.aseguradora, 'Pelayo')
  const pasada = precargaAlta(pol('p', { viva: false, fechaVencimiento: '2017-11-19' }), hoy30)
  assert.equal(pasada.fechaFinVigencia, null)
  assert.equal(pasada.fechaObsoleta, '2017-11-19')
  const sin = precargaAlta(pol('s', { viva: false, fechaVencimiento: null }), hoy30)
  assert.equal(sin.fechaFinVigencia, null)
  assert.equal(sin.fechaObsoleta, null)
})

test('una póliza o fila SIN matrícula ni título no se come dos coches distintos del mismo ramo', () => {
  const coche = (id: string, m: string, f: string) => pol(id, { viva: false, matricula: m, fechaVencimiento: f })
  // Fila del volcado sin datos + dos coches identificados: la sin datos NO se funde con ninguno.
  const r = repartirSegurosCliente({
    polizas: [coche('a', '1111BBB', '2016-01-01'), coche('b', '2222CCC', '2015-01-01'), pol('sin', { viva: false, fechaVencimiento: '2014-01-01' })],
    declaradas: [], oportunidades: [], hoy: hoy30,
  })
  assert.deepEqual(ids(r.oportunidades).sort(), ['a', 'b', 'sin'])
  // Con UN solo coche identificado, la sin datos se une a él.
  const u = repartirSegurosCliente({ polizas: [coche('a', '1111BBB', '2016-01-01'), pol('sin', { viva: false, fechaVencimiento: '2014-01-01' })], declaradas: [], oportunidades: [], hoy: hoy30 })
  assert.deepEqual(ids(u.oportunidades), ['a'])
  // Una póliza viva sin claves no oculta dos derivadas distintas del ramo…
  const v = repartirSegurosCliente({ polizas: [pol('vivo'), coche('a', '1111BBB', '2016-01-01'), coche('b', '2222CCC', '2015-01-01')], declaradas: [], oportunidades: [], hoy: hoy30 })
  assert.deepEqual(ids(v.oportunidades).sort(), ['a', 'b'])
  // …ni una perdida sin claves.
  const p = repartirSegurosCliente({ polizas: [coche('a', '1111BBB', '2016-01-01'), coche('b', '2222CCC', '2015-01-01')], declaradas: [], oportunidades: [opo('x', { estado: 'perdida', motivoPerdida: 'precio', proximaTarea: null })], hoy: hoy30 })
  assert.deepEqual(ids(p.oportunidades).sort(), ['a', 'b'])
})

test('estadoVencimiento usa el día de Madrid: a las 00:30 del 30/09 el 29/09 ya es pasado', () => {
  const hoyMad = new Date('2026-09-29T22:30:00Z') // 30/09 00:30 en Madrid
  assert.deepEqual(estadoVencimiento('2026-09-29', hoyMad), { estado: 'desconocido', ultimaFecha: '2026-09-29' })
  assert.deepEqual(estadoVencimiento('2026-09-30', hoyMad), { estado: 'futuro', fecha: '2026-09-30' })
})

test('precarga: un ramo que el alta no admite queda vacío', () => {
  assert.equal(precargaAlta(pol('x', { tipo: 'inventado' }), hoy30).ramo, '')
  assert.equal(precargaAlta(pol('y', { tipo: 'hogar' }), hoy30).ramo, 'hogar')
})

test('oportunidades: el vencimiento es un aniversario (año da igual), orden por próxima ocurrencia; con nosotros no cambia', () => {
  const hoy = new Date('2026-10-06T10:00:00Z')
  const sinTarea = { proximaTarea: null }
  const r = repartirSegurosCliente({
    polizas: [], declaradas: [], hoy,
    oportunidades: [
      opo('a', { fechaFinVigencia: '2024-06-01', ...sinTarea }),
      opo('b', { fechaFinVigencia: '2017-12-24', ramo: 'hogar', ...sinTarea }),
      opo('c', { fechaFinVigencia: null, ramo: 'vida', ...sinTarea }),
    ],
  })
  assert.deepEqual(r.oportunidades.map(s => s.id), ['b', 'a', 'c'])
  assert.equal(aniversarioOportunidad('2024-06-01', hoy), '2027-06-01')
  assert.equal(aniversarioOportunidad('1900-01-01', hoy), null)
  assert.equal(aniversarioOportunidad(null, hoy), null)
})
