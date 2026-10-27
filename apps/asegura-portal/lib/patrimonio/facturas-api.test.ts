import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CUPO_IA_AMPLIO, CUPO_IA_BASICO, MENSAJE_CUPO_IA_AGOTADO, type NivelPatrimonio, type ValorCliente } from '@central/module-patrimonio'

import { PROPUESTA_VACIA } from './factura-propuesta.ts'
import {
  MAX_BYTES_FACTURA,
  MAX_FACTURAS_DIA,
  responderResolverFactura,
  responderSubidaFactura,
  validarConfirmacion,
  type FicheroFactura,
  type PuertosFacturas,
  type ResultadoLectura,
} from './facturas-api.ts'

const MIO = '11111111-1111-1111-1111-111111111111'
const AJENO = '33333333-3333-3333-3333-333333333333'
const INM = '44444444-4444-4444-4444-444444444444'
const INM_AJENO = '55555555-5555-5555-5555-555555555555'
const GASTO = '66666666-6666-6666-6666-666666666666'

const PDF = Buffer.from('%PDF-1.7\n%contenido')
const fichero = (extra: Partial<FicheroFactura> = {}): FicheroFactura => ({ nombre: 'f.pdf', mime: 'application/pdf', tamano: 1000, contenido: PDF, ...extra })
const ILEGIBLE: ResultadoLectura = { propuesta: PROPUESTA_VACIA, motivos: ['No legible'], fuente: 'none' }

function puertos(niveles: [string, NivelPatrimonio][], o: { hoy?: number; lectura?: ResultadoLectura; resolver?: 'ok' | 'no_encontrado' | 'ya_resuelto'; leerFalla?: boolean; valor?: ValorCliente | 'falla'; mesUsadas?: number } = {}) {
  const llamadas = { leer: 0, leerMime: [] as string[], reservar: [] as unknown[], completar: [] as unknown[], confirmar: [] as unknown[], descartar: [] as unknown[] }
  let ocupadas = o.hoy ?? 0
  let mes = o.mesUsadas ?? 0
  const p: PuertosFacturas = {
    accesos: async () => new Map(niveles),
    inmuebleDelTitular: async (_c, i) => i === INM,
    // Atómico como el real: recuento + reserva en un paso síncrono (no hay await entre comprobar y sumar).
    valorCliente: async () => {
      if (o.valor === 'falla') throw new Error('bd')
      return o.valor ?? { comisionAnualCent: null, polizasEnVigor: 3 }
    },
    reservarPropuesta: async (x) => {
      llamadas.reservar.push(x)
      if (ocupadas >= MAX_FACTURAS_DIA) return { ok: false, motivo: 'tope' }
      ocupadas++
      const cupoAgotado = mes >= x.cupoMes
      mes++
      return { ok: true, id: GASTO, cupoAgotado }
    },
    leer: async (f) => {
      llamadas.leer++
      llamadas.leerMime.push(f.mime)
      await new Promise((r) => setTimeout(r, 1))
      if (o.leerFalla) throw new Error('boom')
      return o.lectura ?? ILEGIBLE
    },
    completarPropuesta: async (x) => { llamadas.completar.push(x) },
    confirmar: async (x) => { llamadas.confirmar.push(x); return o.resolver ?? 'ok' },
    descartar: async (x) => { llamadas.descartar.push(x); return o.resolver ?? 'ok' },
  }
  return { p, llamadas }
}
const subir = (p: PuertosFacturas, titular: unknown, extra: { inmueble?: unknown; fichero?: FicheroFactura | null } = {}) =>
  responderSubidaFactura(p, { titular, inmueble: extra.inmueble ?? null, fichero: extra.fichero === undefined ? fichero() : extra.fichero })

test('titular ajeno o inexistente: 404 idéntica, sin gastar IA ni escribir', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  const ajeno = await subir(p, AJENO)
  assert.equal(ajeno.status, 404)
  assert.deepEqual(ajeno, await subir(p, 'no-existe'))
  assert.deepEqual(ajeno, await subir(p, undefined))
  assert.equal(llamadas.leer, 0)
  assert.deepEqual(llamadas.reservar, [])
})

test('inmueble AJENO al titular: 404 y no se llama a la IA', async () => {
  const { p, llamadas } = puertos([[MIO, 'gestion']])
  const r = await subir(p, MIO, { inmueble: INM_AJENO })
  assert.equal(r.status, 404)
  assert.deepEqual(r, await subir(p, MIO, { inmueble: 'no-es-uuid' }))
  assert.equal(llamadas.leer, 0)
  assert.deepEqual(llamadas.reservar, [])
})

test('tope diario: al llegar al máximo, 429 y sin IA; justo por debajo, pasa', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']], { hoy: MAX_FACTURAS_DIA })
  const r = await subir(p, MIO)
  assert.equal(r.status, 429)
  assert.equal(r.body.error, 'tope_diario')
  assert.equal(llamadas.leer, 0)
  assert.deepEqual(llamadas.completar, [])
  const justo = puertos([[MIO, 'total']], { hoy: MAX_FACTURAS_DIA - 1 })
  assert.equal((await subir(justo.p, MIO)).status, 201)
})

test('subidas SIMULTÁNEAS: solo caben las que quedan hasta el tope y solo esas gastan IA', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']], { hoy: MAX_FACTURAS_DIA - 3 })
  const rs = await Promise.all(Array.from({ length: 12 }, () => subir(p, MIO)))
  assert.equal(rs.filter((r) => r.status === 201).length, 3)
  assert.equal(rs.filter((r) => r.status === 429).length, 9)
  assert.equal(llamadas.leer, 3)
})

test('la reserva va ANTES de leer y la fila se completa DESPUÉS, también si la IA lanza', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']], { leerFalla: true })
  const r = await subir(p, MIO)
  assert.equal(r.status, 201)
  assert.equal(r.body.fuente, 'none')
  assert.equal(llamadas.reservar.length, 1)
  assert.equal(llamadas.completar.length, 1)
})

test('fichero: ausente 400, grande 413, formato raro 415; ninguno reserva cupo ni llama a la IA', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await subir(p, MIO, { fichero: null })).status, 400)
  assert.equal((await subir(p, MIO, { fichero: fichero({ tamano: MAX_BYTES_FACTURA + 1 }) })).status, 413)
  assert.equal((await subir(p, MIO, { fichero: fichero({ mime: 'application/zip', contenido: Buffer.from('PK\x03\x04') }) })).status, 415)
  assert.equal(llamadas.leer, 0)
  assert.deepEqual(llamadas.reservar, [])
})

test('el tipo lo deciden los BYTES: un «pdf» que no lo es, 415; una imagen declarada como pdf se lee como imagen', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await subir(p, MIO, { fichero: fichero({ mime: 'application/pdf', contenido: Buffer.from('<html>no soy pdf</html>') }) })).status, 415)
  assert.equal((await subir(p, MIO, { fichero: fichero({ mime: 'image/jpeg', contenido: Buffer.alloc(0) }) })).status, 415)
  assert.equal(llamadas.leer, 0)
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
  assert.equal((await subir(p, MIO, { fichero: fichero({ mime: 'application/pdf', contenido: png }) })).status, 201)
  assert.deepEqual(llamadas.leerMime, ['image/png'])
  // El navegador a veces no manda tipo: con bytes válidos se lee igual.
  assert.equal((await subir(p, MIO, { fichero: fichero({ mime: '' }) })).status, 201)
})

test('fuente none: crea una propuesta SIN importes (nunca un gasto de 0) y lo dice', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  const r = await subir(p, MIO, { inmueble: INM })
  assert.equal(r.status, 201)
  assert.equal(r.body.fuente, 'none')
  assert.equal((llamadas.reservar[0] as { inmuebleId: string }).inmuebleId, INM)
  const hecho = llamadas.completar[0] as { lectura: ResultadoLectura }
  assert.equal(hecho.lectura.propuesta.totalCent, null)
  assert.equal(hecho.lectura.propuesta.baseCent, null)
  assert.deepEqual(llamadas.confirmar, [])
})

const confirmacion = (extra: Record<string, unknown> = {}) => ({ accion: 'confirmar', titular: MIO, gasto: GASTO, fecha: '2026-10-03', categoria: 'SUMINISTROS', total: '121,00', base: '100,00', ...extra })

test('confirmar: un total vacío, 0 o negativo no crea gasto; categoría OTRO válida solo si la elige la persona', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  for (const total of [undefined, '', '0', '0,00', '-5', 'abc']) {
    const r = await responderResolverFactura(p, confirmacion({ total }))
    assert.equal(r.status, 400, `total=${String(total)}`)
  }
  assert.equal((await responderResolverFactura(p, confirmacion({ fecha: undefined }))).status, 400)
  assert.equal((await responderResolverFactura(p, confirmacion({ categoria: 'inventada' }))).status, 400)
  assert.deepEqual(llamadas.confirmar, [])
  assert.equal(validarConfirmacion(confirmacion({ categoria: 'OTRO' })).ok, true)
})

test('confirmar: ok llama al puerto con céntimos; titular ajeno, gasto ajeno e inmueble ajeno = 404; ya resuelto = 409', async () => {
  const bien = puertos([[MIO, 'gestion']])
  const ok = await responderResolverFactura(bien.p, confirmacion())
  assert.equal(ok.status, 200)
  assert.deepEqual((bien.llamadas.confirmar[0] as { datos: unknown }).datos, { inmuebleId: null, fecha: '2026-10-03', categoria: 'SUMINISTROS', concepto: null, baseCent: 10000, ivaCent: null, retencionCent: null, totalCent: 12100 })

  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await responderResolverFactura(p, confirmacion({ titular: AJENO }))).status, 404)
  assert.equal((await responderResolverFactura(p, confirmacion({ inmueble: INM_AJENO }))).status, 404)
  assert.deepEqual(llamadas.confirmar, [])
  assert.equal((await responderResolverFactura(puertos([[MIO, 'total']], { resolver: 'no_encontrado' }).p, confirmacion())).status, 404)
  assert.equal((await responderResolverFactura(puertos([[MIO, 'total']], { resolver: 'ya_resuelto' }).p, confirmacion())).status, 409)
})

test('descartar y acción desconocida', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await responderResolverFactura(p, { accion: 'descartar', titular: MIO, gasto: GASTO })).status, 200)
  assert.equal(llamadas.descartar.length, 1)
  assert.equal((await responderResolverFactura(p, { accion: 'borrar', titular: MIO, gasto: GASTO })).status, 400)
  assert.equal((await responderResolverFactura(p, { accion: 'descartar', titular: AJENO, gasto: GASTO })).status, 404)
})

test('retención de IRPF: base > total vale si total = base + IVA − retención (±2 cént.)', () => {
  const ok = (extra: Record<string, unknown>) => validarConfirmacion(confirmacion(extra))
  // Profesional: 1000 + 210 IVA − 150 retención = 1060
  const bien = ok({ base: '1000,00', iva: '210,00', retencion: '150,00', total: '1060,00' })
  assert.equal(bien.ok, true)
  if (bien.ok) assert.deepEqual([bien.datos.baseCent, bien.datos.ivaCent, bien.datos.retencionCent, bien.datos.totalCent], [100000, 21000, 15000, 106000])
  assert.equal(ok({ base: '1000,00', iva: '210,00', retencion: '150,00', total: '1060,02' }).ok, true) // redondeo
  assert.equal(ok({ base: '1000,00', iva: '210,00', retencion: '150,00', total: '1060,05' }).ok, false)
  // Exenta con retención (alquiler de local exento, sin IVA): 1000 − 150 = 850
  assert.equal(ok({ base: '1000,00', iva: '', retencion: '150,00', total: '850,00' }).ok, true)
  assert.equal(ok({ base: '1000,00', iva: '0', retencion: '150,00', total: '850,00' }).ok, true)
  // Sin retención, base > total sigue siendo error; y total menor que base − retención también.
  const mal = ok({ base: '150,00', total: '100,00' })
  assert.deepEqual(mal.ok ? null : [mal.campo, mal.motivo], ['base', 'no_cuadra'])
  assert.equal(ok({ base: '1000,00', retencion: '150,00', total: '800,00' }).ok, false)
  // Retención sin base o mayor que la base: error en «retencion»; negativa o texto, también.
  for (const r of [{ base: '', retencion: '10,00' }, { base: '100,00', retencion: '150,00' }, { base: '100,00', retencion: '-5' }, { base: '100,00', retencion: 'abc' }]) {
    const x = ok({ ...r, total: '100,00' })
    assert.deepEqual(x.ok ? null : x.campo, 'retencion', JSON.stringify(r))
  }
})

test('el 400 de un cuadre fallido dice qué pasa (motivo no_cuadra) y no confirma nada', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  const r = await responderResolverFactura(p, confirmacion({ base: '100,00', iva: '21,00', total: '150,00' }))
  assert.equal(r.status, 400)
  assert.deepEqual([r.body.campo, r.body.motivo], ['total', 'no_cuadra'])
  assert.deepEqual(llamadas.confirmar, [])
})

test('la reserva recibe el fichero validado por sus bytes (para guardarlo como documento del inmueble) y la respuesta dice si se guardó', async () => {
  const llamadas: { reservar: { fichero?: { nombre: string; mime: string; contenido: Buffer } }[] } = { reservar: [] }
  const { p } = puertos([[MIO, 'gestion']])
  const original = p.reservarPropuesta
  p.reservarPropuesta = async (x) => {
    llamadas.reservar.push(x)
    const r = await original(x)
    return r.ok ? { ...r, documentoId: x.inmuebleId ? 'doc-1' : null } : r
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
  const con = await subir(p, MIO, { inmueble: INM, fichero: fichero({ nombre: '../../a b.pdf', mime: 'application/pdf', contenido: png }) })
  assert.equal(con.status, 201)
  assert.equal((con.body as { documento: string | null }).documento, 'doc-1')
  assert.equal(llamadas.reservar[0].fichero?.mime, 'image/png', 'los bytes mandan, no el MIME declarado')
  assert.equal(llamadas.reservar[0].fichero?.nombre, 'a b.pdf', 'sin ruta')
  const sin = await subir(p, MIO, {})
  assert.equal((sin.body as { documento: string | null }).documento, null, 'sin inmueble no hay owner: no se guarda')
})

test('cupo mensual: el valor del cliente fija el tope que se pasa a la reserva (0 pólizas básico, con pólizas amplio, no se sabe amplio)', async () => {
  const cupoDe = async (valor: ValorCliente | 'falla') => {
    const { p, llamadas } = puertos([[MIO, 'total']], { valor })
    await subir(p, MIO)
    return (llamadas.reservar[0] as { cupoMes: number }).cupoMes
  }
  assert.equal(await cupoDe({ comisionAnualCent: null, polizasEnVigor: 0 }), CUPO_IA_BASICO)
  assert.equal(await cupoDe({ comisionAnualCent: null, polizasEnVigor: 2 }), CUPO_IA_AMPLIO)
  assert.equal(await cupoDe({ comisionAnualCent: null, polizasEnVigor: null }), CUPO_IA_AMPLIO)
  assert.equal(await cupoDe('falla'), CUPO_IA_AMPLIO)
})

test('cupo agotado: 201, NO se llama a la IA, mensaje claro y la fila se completa vacía para rellenar a mano', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']], { valor: { comisionAnualCent: null, polizasEnVigor: 0 }, mesUsadas: CUPO_IA_BASICO })
  const r = await subir(p, MIO)
  assert.equal(r.status, 201)
  assert.equal(llamadas.leer, 0)
  assert.equal(r.body.cupo_agotado, true)
  assert.equal(r.body.fuente, 'none')
  assert.deepEqual(r.body.motivos, [MENSAJE_CUPO_IA_AGOTADO])
  assert.match(MENSAJE_CUPO_IA_AGOTADO, /límite de este mes.*con tus seguros en Grupo ASegura tienes más/)
  assert.equal(llamadas.completar.length, 1)
  // Con hueco en el cupo sí lee.
  const ok = puertos([[MIO, 'total']], { valor: { comisionAnualCent: null, polizasEnVigor: 0 }, mesUsadas: CUPO_IA_BASICO - 1 })
  const r2 = await subir(ok.p, MIO)
  assert.equal(ok.llamadas.leer, 1)
  assert.equal(r2.body.cupo_agotado, false)
})
