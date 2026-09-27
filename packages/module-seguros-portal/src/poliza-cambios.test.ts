import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  VERSION_FOTO_POLIZA,
  camposCambiados,
  cambioMasivo,
  fotoDePoliza,
  grupoEstado,
  leerFoto,
  polizasModificadasParaAviso,
  textoPolizaModificada,
  type FilaFotoPoliza,
} from './poliza-cambios.ts'
import { avisosDe } from './avisos.ts'

const base: FilaFotoPoliza = {
  estado: 'activa',
  fechaInicio: new Date('2026-01-10T00:00:00Z'),
  fechaVencimiento: new Date('2027-01-10T00:00:00Z'),
  primaAnual: 320.5,
  primaBruta: null,
  fraccionamiento: 'anual',
  coberturas: [{ codigo: 'RC', capitalAsegurado: '50000000', franquicia: null }],
  documentosVisibles: ['d1'],
  siniestros: [{ id: 's1', estado: 'cerrado' }],
}
const foto = (x: Partial<FilaFotoPoliza> = {}) => fotoDePoliza({ ...base, ...x })

test('la misma póliza no cambia', () => {
  assert.deepEqual(camposCambiados(foto(), foto()), [])
})

test('precio, fechas, forma de pago y coberturas cuentan', () => {
  assert.deepEqual(
    camposCambiados(
      foto(),
      foto({
        primaAnual: 350,
        fechaVencimiento: new Date('2028-01-10T00:00:00Z'),
        fraccionamiento: 'semestral',
        coberturas: [{ codigo: 'RC', capitalAsegurado: '60000000', franquicia: null }],
      }),
    ),
    ['fechas', 'prima', 'forma_pago', 'coberturas'],
  )
})

test('completar un dato no es cambiarlo, y perderlo tampoco', () => {
  assert.deepEqual(camposCambiados(foto({ primaAnual: null }), foto()), [])
  assert.deepEqual(camposCambiados(foto(), foto({ primaAnual: null })), [])
  assert.deepEqual(camposCambiados(foto({ coberturas: [] }), foto()), [])
})

test('estados equivalentes no avisan; la baja sí', () => {
  assert.deepEqual(camposCambiados(foto(), foto({ estado: 'en_vigor' })), [])
  // El devuelto va por la cola de aprobación de Alberto, no por aquí.
  assert.deepEqual(camposCambiados(foto(), foto({ estado: 'recibo_devuelto' })), [])
  assert.deepEqual(camposCambiados(foto(), foto({ estado: 'cancelada' })), ['estado'])
  assert.equal(grupoEstado('fin_riesgo'), 'baja')
})

test('documento nuevo y siniestro nuevo o con otro estado cuentan; quitar un documento no', () => {
  assert.deepEqual(camposCambiados(foto(), foto({ documentosVisibles: ['d1', 'd2'] })), ['documentos'])
  assert.deepEqual(camposCambiados(foto(), foto({ documentosVisibles: [] })), [])
  assert.deepEqual(camposCambiados(foto(), foto({ siniestros: [{ id: 's1', estado: 'rechazado' }] })), ['siniestros'])
})

test('una foto de otra versión no se compara: se re-siembra', () => {
  assert.equal(leerFoto({ ...foto(), v: VERSION_FOTO_POLIZA + 1 }), null)
  assert.equal(leerFoto(null), null)
  assert.deepEqual(leerFoto(JSON.parse(JSON.stringify(foto()))), foto())
})

test('el cortacircuitos salta con media cartera a la vez o con un mismo campo en muchas', () => {
  const n = (k: number, campo = 'prima') => Array.from({ length: k }, (_, i) => ({ campos: [i % 2 ? campo : 'fechas'] }))
  assert.equal(cambioMasivo(n(3), 100), false)
  assert.equal(cambioMasivo(n(31), 100), true)
  // 20 pólizas con coberturas cambiadas de golpe (10 % de 200 = 20 → 21 salta).
  const cob = Array.from({ length: 21 }, () => ({ campos: ['coberturas'] }))
  assert.equal(cambioMasivo(cob, 200), true)
  assert.equal(cambioMasivo(cob.slice(0, 20), 200), false)
})

test('la prima anual que llega después de la bruta no es un cambio de precio', () => {
  assert.deepEqual(camposCambiados(foto({ primaAnual: null, primaBruta: 300 }), foto({ primaAnual: 320, primaBruta: 300 })), [])
  assert.deepEqual(camposCambiados(foto({ primaBruta: 300 }), foto({ primaBruta: 310 })), ['prima'])
})

test('una póliza ya de baja o vencida no avisa de nada más', () => {
  assert.deepEqual(camposCambiados(foto({ estado: 'cancelada' }), foto({ estado: 'cancelada', documentosVisibles: ['d1', 'd9'] })), [])
  assert.deepEqual(camposCambiados(foto({ estado: 'vencida' }), foto({ estado: 'activa', primaAnual: 999 })), [])
})

test('mismaFoto no depende del orden de las claves', async () => {
  const { mismaFoto } = await import('./poliza-cambios.ts')
  const a = foto()
  const b = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).reverse())))
  assert.equal(mismaFoto(a, b), true)
  assert.equal(mismaFoto(a, foto({ primaAnual: 1 })), false)
})

const hoy = new Date('2026-09-27T10:00:00Z')
const fila = (id: string, polizaId: string, campos: string[], dias: number, estadoNuevo: string | null = null) => ({
  id, polizaId, campos, estadoNuevo, compania: 'Reale', tipo: 'hogar',
  detectadoEn: new Date(hoy.getTime() - dias * 86_400_000),
})

test('un aviso por póliza con los campos juntos, y la clave es el cambio más reciente', () => {
  const r = polizasModificadasParaAviso([fila('a', 'p1', ['prima'], 5), fila('b', 'p1', ['fechas'], 1), fila('c', 'p2', ['documentos'], 2)], hoy)
  assert.equal(r.length, 2)
  const p1 = r.find((x) => x.polizaId === 'p1')!
  assert.equal(p1.id, 'b')
  assert.deepEqual(p1.campos, ['fechas', 'prima'])
})

test('fuera de la ventana no se avisa, y un campo desconocido tampoco', () => {
  assert.deepEqual(polizasModificadasParaAviso([fila('a', 'p1', ['prima'], 20)], hoy), [])
  assert.deepEqual(polizasModificadasParaAviso([fila('a', 'p1', ['otro'], 1)], hoy), [])
})

test('el texto dice qué cambió sin importes ni número de póliza', () => {
  const [p] = polizasModificadasParaAviso([fila('a', 'p1', ['prima', 'documentos'], 1)], hoy)
  const t = textoPolizaModificada(p!)
  assert.match(t.titulo, /Hay cambios en tu póliza de hogar con Reale/i)
  assert.match(t.detalle, /Ha cambiado el precio\. Hay documentación nueva\./)
  assert.doesNotMatch(`${t.titulo} ${t.detalle}`, /\d/)
  const [baja] = polizasModificadasParaAviso([fila('b', 'p2', ['estado'], 1, 'baja')], hoy)
  assert.match(textoPolizaModificada(baja!).titulo, /se ha dado de baja/)
})

test('la campana lo pinta y una fuente ilegible se declara', () => {
  const vacio = { autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], hoy }
  const [p] = polizasModificadasParaAviso([fila('a', 'p1', ['prima'], 1)], hoy)
  const r = avisosDe({ ...vacio, polizasModificadas: [p!] })
  assert.equal(r.avisos.length, 1)
  assert.equal(r.avisos[0]!.tipo, 'poliza_modificada')
  assert.equal(r.avisos[0]!.id, 'a')
  const ilegible = avisosDe({ ...vacio, polizasModificadas: null })
  assert.deepEqual(ilegible.fuentesIlegibles, ['polizas_modificadas'])
  assert.equal(ilegible.globo, '0+')
})

test('push: la propia dice qué cambió; la ajena no nombra al titular', async () => {
  const { textoPushPolizaModificada } = await import('./poliza-cambios.ts')
  const { planificarAvisos } = await import('./avisos-cima.ts')
  const [propia] = polizasModificadasParaAviso([fila('a', 'p1', ['prima'], 1)], hoy)
  const [ajena] = polizasModificadasParaAviso([{ ...fila('b', 'p2', ['coberturas'], 1), titularAjeno: 'María' }], hoy)
  assert.match(textoPushPolizaModificada(propia!), /Hay cambios en tu póliza/)
  assert.doesNotMatch(textoPushPolizaModificada(ajena!), /María/)
  assert.match(textoPushPolizaModificada(ajena!), /que sigues/)
  // En la campana sí se nombra (la ve quien ya tiene acceso total).
  assert.match(textPolizaTitulo(ajena!), /de María/)
  const plan = planificarAvisos([], new Set(['mod:a']), new Set(), hoy, [], [propia!, ajena!])
  assert.deepEqual(plan.enviar.map((e) => e.clave), ['mod:b'])
  const silenciado = planificarAvisos([], new Set(), new Set(['poliza_modificada']), hoy, [], [propia!])
  assert.deepEqual(silenciado.enviar, [])
  assert.deepEqual(silenciado.sellarSiempre.map((s) => s.clave), ['mod:a'])
})

function textPolizaTitulo(p: Parameters<typeof textoPolizaModificada>[0]): string {
  return textoPolizaModificada(p).titulo
}
