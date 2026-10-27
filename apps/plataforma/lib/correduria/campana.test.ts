import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLAS_AVISO, componerAvisos, componerCampana, contadorCampana, grupoLeads, grupoPatrimonio, MAX_ITEMS_GRUPO,
  type FuentesCampana, type GrupoCampana,
} from './avisos.ts'
import { interpretarCampana } from './campana.ts'
import { interpretarPermisosPortal } from './permisos-portal.ts'
import type { SolicitudPortal } from './solicitudes-portal.ts'
import type { LeadVista } from '../leads-asegura.ts'

const HOY = '2026-10-26'
const ok = (n: number, plazo: string | null = null, urgentes = 0) => ({ estado: 'ok', n, plazo, urgentes })
const colas = (o: Record<string, unknown> = {}) => ({ estado: 'ok', hoy: HOY, colas: { ...Object.fromEntries(COLAS_AVISO.map((c) => [c, ok(0)])), ...o } })
/** Las colas del puerto SIN la línea de la ingesta (la ingesta se prueba aparte, con su veredicto real). */
function avisosDe(status: number, json: unknown) {
  const r = componerAvisos(status, json, { estado: 'error', motivo: 'red' }, HOY)
  return { ...r, avisos: r.avisos.filter((a) => a.tipo !== 'ingesta') }
}

const sol = (id: string): SolicitudPortal => ({
  id, modulo: 'flota', moduloNombre: 'Flota', clienteId: `c-${id}`, identidadId: null, creaProspecto: false, cliente: `Cliente ${id}`, sinFicha: false,
  solicitadoEn: '2026-10-25T10:00:00Z', puedeActivar: true, motivoNoActivar: null,
})
const lead = (o: Partial<LeadVista>): LeadVista => ({
  id: 'l1', compania: 'Mapfre', numeroPoliza: null, ramo: 'hogar', estado: 'confirmado', fechaVencimiento: null,
  fechaAccionable: new Date('2026-11-10T00:00:00Z'), diasParaAccionable: 15, ventanaPasada: false, urgente: true,
  senalCarta: 'ninguna', cartaEnviadaEn: null, yaEnCartera: null, clienteId: 'c1', subidaEn: null, documentoNombre: null,
  primaAnual: null, titularTipo: 'propio', titularEmpresa: null, fichaEmpresaId: null, ...o,
})

function fuentes(o: Partial<FuentesCampana> = {}): FuentesCampana {
  return {
    avisos: avisosDe(200, colas()),
    solicitudes: { estado: 'ok', solicitudes: [] },
    leadsPortal: { ok: true, leads: [], sinIdentificar: 0, ilegibles: 0 },
    leadsWeb: { estado: 'ok', total: 0, convertidos: 0, tasaConversion: null, pendientes: [], primerLeadAt: null, ultimoLeadAt: null },
    permisos: { estado: 'ok', pendientes: 0, recientes: 0, movimientos: [], truncado: false },
    patrimonio: { estado: 'ok', senales: [] },
    cartas: { estado: 'ok', cartas: [] },
    cima: { estado: 'ok', fichas: 0, sinDatosCima: 0, rellenos: 0, ilegibles: 0, discrepancias: [] },
    ...o,
  }
}

test('todo comprobado y vacío: sin grupos y sin número en el icono', () => {
  const c = componerCampana(fuentes())
  assert.deepEqual(c.grupos, [])
  assert.equal(c.contador, '')
  assert.equal(c.total, 0)
})

test('error ≠ 0: una fuente caída sale como grupo «no se ha podido comprobar» y el contador lleva «+»', () => {
  const c = componerCampana(fuentes({
    solicitudes: { estado: 'ok', solicitudes: [sol('a'), sol('b'), sol('c')] },
    permisos: { estado: 'error', motivo: 'HTTP 500' },
  }))
  const p = c.grupos.find((g) => g.tipo === 'permisos_portal')
  assert.equal(p?.estado, 'error')
  assert.equal(p?.n, null)
  assert.match(p?.texto ?? '', /^No se ha podido comprobar los permisos del portal \(HTTP 500\)/)
  assert.equal(c.total, 3)
  assert.equal(c.contador, '3+')
})

test('sin nada contado y algo ilegible: «!», nunca un icono vacío', () => {
  assert.equal(componerCampana(fuentes({ cartas: { estado: 'sin_datos', causa: 'no se pudo llegar a asegura' } })).contador, '!')
  // El puerto de avisos caído entero: UN grupo que lo dice, no nueve vacíos.
  const c = componerCampana(fuentes({ avisos: avisosDe(503, { estado: 'sin_configurar' }) }))
  assert.deepEqual(c.grupos.map((g) => g.tipo), ['puerto'])
  assert.equal(c.contador, '!')
})

test('plazo legal primero (supresiones/quejas/partes), aunque otra cola sea urgente', () => {
  const c = componerCampana(fuentes({
    avisos: avisosDe(200, colas({ bajas_pue: ok(2, null, 2), quejas: ok(1, '2026-11-20'), supresiones: ok(1, '2026-11-01') })),
    solicitudes: { estado: 'ok', solicitudes: [sol('a')] },
  }))
  assert.deepEqual(c.grupos.map((g) => g.tipo), ['supresiones', 'quejas', 'bajas_pue', 'solicitudes_portal'])
  assert.ok(c.grupos[0].plazoLegal && c.grupos[1].plazoLegal && !c.grupos[2].plazoLegal)
  assert.equal(c.contador, '5')
})

test('máx. 20 filas por tipo; el resto va en «mas» y sigue contando entero', () => {
  const muchas = Array.from({ length: 27 }, (_, i) => sol(`s${i}`))
  const g = componerCampana(fuentes({ solicitudes: { estado: 'ok', solicitudes: muchas } })).grupos[0]
  assert.equal(g.items.length, MAX_ITEMS_GRUPO)
  assert.equal(g.mas, 7)
  assert.equal(g.n, 27)
  assert.equal(g.items[0].solicitud?.id, 's0')
})

test('leads nuevos: portal = `urgente`; web = sin convertir y `lead_estado` nuevo (o sin dato)', () => {
  const g = grupoLeads(
    { ok: true, leads: [lead({ id: 'u' }), lead({ id: 'no', urgente: false })], sinIdentificar: 0, ilegibles: 0 },
    { estado: 'ok', total: 3, convertidos: 0, tasaConversion: 0, primerLeadAt: null, ultimoLeadAt: null, pendientes: [
      { clienteId: 'w1', nombre: 'Ana', createdAt: '2026-10-25T00:00:00Z', diasDesdeAlta: 1, tieneTelefono: true, tieneEmail: false, leadEstado: 'nuevo' },
      { clienteId: 'w2', nombre: 'Luis', createdAt: '2026-10-20T00:00:00Z', diasDesdeAlta: 6, tieneTelefono: true, tieneEmail: false, leadEstado: 'contactado' },
      { clienteId: 'w3', nombre: 'Eva', createdAt: '2026-10-26T00:00:00Z', diasDesdeAlta: 0, tieneTelefono: true, tieneEmail: false, leadEstado: null },
    ] },
  ) as GrupoCampana
  assert.deepEqual(g.items.map((i) => i.id), ['portal:u', 'web:w1', 'web:w3'])
  assert.equal(g.n, 3)
  assert.equal(g.estado, 'ok')
})

test('leads: una de las dos fuentes caída deja el grupo PARCIAL (cuenta lo leído y lo dice); las dos, error', () => {
  const web = { estado: 'error', motivo: 'red' } as const
  const g = grupoLeads({ ok: true, leads: [lead({})], sinIdentificar: 0, ilegibles: 0 }, web) as GrupoCampana
  assert.equal(g.estado, 'parcial')
  assert.equal(g.n, 1)
  assert.match(g.texto, /no se han podido comprobar los de la web/)
  assert.equal(grupoLeads({ ok: false, motivo: 'red', causa: null }, web)?.estado, 'error')
  assert.equal(contadorCampana([g]).contador, '1+')
})

test('Patrimonio apagado o vacío no aparece; error sí', () => {
  assert.equal(grupoPatrimonio({ estado: 'apagado' }), null)
  assert.equal(grupoPatrimonio({ estado: 'ok', senales: [] }), null)
  assert.equal(grupoPatrimonio({ estado: 'error', motivo: 'HTTP 500' })?.estado, 'error')
})

test('permisos: solo los pendientes cuentan; aceptados/revocados recientes se enseñan como información', () => {
  const permisos = interpretarPermisosPortal(200, { estado: 'ok', movimientos: [
    { id: 'p1', evento: 'pendiente_aceptar', alcance: 'polizas', fecha: '2026-10-20T10:00:00Z', de: 'Ana', deClienteId: 'c1', a: 'Luis', aClienteId: 'c2' },
    { id: 'p2', evento: 'revocada', alcance: 'polizas', fecha: '2026-10-25T10:00:00Z', de: 'Ana', deClienteId: 'c1', revocadoPor: 'otorgante' },
  ] })
  const g = componerCampana(fuentes({ permisos })).grupos[0]
  assert.equal(g.tipo, 'permisos_portal')
  assert.equal(g.n, 1)
  assert.equal(g.informativos, 1)
  assert.match(g.items[0].texto, /Ana autorizó a Luis a ver sus pólizas: sin aceptar/)
  // Una fila ilegible tumba la lectura (si falta una, la lista no es la lista).
  assert.equal(interpretarPermisosPortal(200, { estado: 'ok', movimientos: [{ id: 'x' }] }).estado, 'error')
  assert.equal(interpretarPermisosPortal(404, null).estado, 'error')
})

test('navegador: respuesta rota = error (nunca «no hay nada»); grupo raro descartado = parcial; href externo fuera', () => {
  for (const [s, j] of [[500, null], [200, '<html>'], [200, { estado: 'ok', avisos: [] }], [401, {}]] as const) {
    assert.equal(interpretarCampana(s, j).estado, 'error', JSON.stringify([s, j]))
  }
  const buena = componerCampana(fuentes({ solicitudes: { estado: 'ok', solicitudes: [sol('a')] } }))
  const json = JSON.parse(JSON.stringify({ estado: 'ok', campana: buena }))
  json.campana.grupos[0].items[0].href = 'javascript:alert(1)'
  json.campana.grupos.push({ tipo: 'inventado', texto: 'x' })
  const r = interpretarCampana(200, json)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.campana.grupos[0].items[0].href, null)
  assert.equal(r.campana.grupos[0].items[0].solicitud?.id, 'a')
  assert.equal(r.descartados, 1)
  assert.equal(r.campana.contador, '1+')
})

test('la ingesta sin comprobar se DICE y marca el contador como incompleto, pero no suma pendientes', () => {
  const c = componerCampana(fuentes({ avisos: componerAvisos(200, colas({ partes: ok(2) }), { estado: 'error', motivo: 'red' }, HOY) }))
  assert.deepEqual(c.grupos.map((g) => [g.tipo, g.estado]), [['partes', 'ok'], ['ingesta', 'error']])
  assert.equal(c.contador, '2+')
})
