import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarPanel, ESTADOS_CONSULTA } from '../../../../../lib/correduria/consultas-companias-asegura.ts'
import type { CompaniaConsulta, ConsultaDTO } from '../../../../../lib/correduria/consultas-companias-asegura.ts'
import {
  agruparCompanias, avisoFaltan, contarSeleccion, destinatariosMarcados, diasEspera, etiquetaRamo, filaCompetencia, llevaRamo,
  mostrarAvisoAdjunto, ordenarConsultas, rotuloEstado, tonoEstado, ROTULO_ESTADO, TONO_ESTADO, rotuloContador, textoErrorEnvio, textoErrorPanel,
} from './consultas-vista.ts'

const k = (id: string, ramos: string[] | null) => ({ id, nombre: id, cargo: null, area: null, email: `${id}@x.es`, ramos })
const companias: CompaniaConsulta[] = [
  { codigoDgs: 'A', nombre: 'A', contactos: [k('a1', null), k('a2', ['rc'])] },
  { codigoDgs: 'B', nombre: 'B', contactos: [k('b1', ['hogar']), k('b2', [])] },
  { codigoDgs: 'C', nombre: 'C', contactos: [k('c1', ['rc', 'hogar'])] },
]

describe('ramos', () => {
  it('null (sin clasificar) y [] nunca «llevan» el ramo', () => {
    assert.equal(llevaRamo(k('x', null), 'rc'), false)
    assert.equal(llevaRamo(k('x', []), 'rc'), false)
    assert.equal(llevaRamo(k('x', ['rc']), 'rc'), true)
    assert.equal(llevaRamo(k('x', ['rc']), null), false)
  })
  it('etiqueta solo para quien lo lleva, con el nombre legible del ramo', () => {
    assert.equal(etiquetaRamo(k('x', ['responsabilidad_civil']), 'responsabilidad_civil'), 'lleva R. Civil')
    assert.equal(etiquetaRamo(k('x', null), 'responsabilidad_civil'), null)
  })
})

describe('agruparCompanias', () => {
  it('las del ramo primero, las demás aparte, orden estable y contactos del ramo arriba', () => {
    const g = agruparCompanias(companias, 'rc')
    assert.deepEqual(g.delRamo.map((c) => c.codigoDgs), ['A', 'C'])
    assert.deepEqual(g.otras.map((c) => c.codigoDgs), ['B'])
    assert.deepEqual(g.delRamo[0].contactos.map((c) => c.id), ['a2', 'a1'])
  })
  it('sin ramo conocido todo va a «otras»', () => {
    const g = agruparCompanias(companias, null)
    assert.deepEqual(g.delRamo, [])
    assert.equal(g.otras.length, 3)
  })
  it('no premarca ni muta la entrada', () => {
    const antes = JSON.stringify(companias)
    agruparCompanias(companias, 'rc')
    assert.equal(JSON.stringify(companias), antes)
  })
})

describe('contador N · M', () => {
  it('cuenta compañías y personas marcadas; ids fantasma no cuentan', () => {
    assert.deepEqual(contarSeleccion(companias, new Set()), { companias: 0, personas: 0 })
    assert.deepEqual(contarSeleccion(companias, new Set(['a1', 'a2', 'c1', 'zzz'])), { companias: 2, personas: 3 })
  })
  it('rótulo con singular/plural', () => {
    assert.equal(rotuloContador({ companias: 1, personas: 1 }), '1 compañía · 1 persona')
    assert.equal(rotuloContador({ companias: 2, personas: 3 }), '2 compañías · 3 personas')
  })
  it('destinatariosMarcados en orden del panel', () => {
    assert.deepEqual(destinatariosMarcados(companias, new Set(['c1', 'a1'])), ['a1', 'c1'])
  })
})

describe('diasEspera', () => {
  it('no enviada → null (no 0)', () => assert.equal(diasEspera(null, null, '2026-10-15'), null))
  it('sin respuesta cuenta hasta hoy', () => assert.equal(diasEspera('2026-10-10T08:00:00Z', null, '2026-10-15'), 5))
  it('respondida cuenta hasta la respuesta, no hasta hoy', () => assert.equal(diasEspera('2026-10-10', '2026-10-12T10:00:00Z', '2026-10-30'), 2))
  it('nunca negativo; fecha basura → null', () => {
    assert.equal(diasEspera('2026-10-20', null, '2026-10-15'), 0)
    assert.equal(diasEspera('ayer', null, '2026-10-15'), null)
  })
})

describe('avisoFaltan', () => {
  it('null = no se pudo comprobar (aviso), [] = nada falta (sin aviso)', () => {
    assert.match(avisoFaltan(null, 'responsabilidad_civil') ?? '', /No se han podido comprobar/)
    assert.equal(avisoFaltan([], 'responsabilidad_civil'), null)
  })
  it('las CLAVES se enseñan con su etiqueta del ramo', () => {
    const t = avisoFaltan(['cnae', 'limiteDeseado'], 'responsabilidad_civil') ?? ''
    assert.match(t, /CNAE, Límite de indemnización deseado/)
    assert.ok(!t.includes('limiteDeseado'))
  })
})

describe('errores de envío', () => {
  it('canal_no_disponible, envio_fallido y ya_enviada tienen textos distintos', () => {
    assert.match(textoErrorEnvio(503, { estado: 'canal_no_disponible' }), /no está configurado/)
    assert.match(textoErrorEnvio(502, { estado: 'envio_fallido', motivo: 'smtp' }), /NO consta como enviada/)
    assert.match(textoErrorEnvio(409, { estado: 'ya_enviada' }), /ya estaba enviada/)
  })
  it('🪤 sin_migracion (503) NO se confunde con canal_no_disponible (503)', () => {
    assert.notEqual(textoErrorEnvio(503, { estado: 'sin_migracion' }), textoErrorEnvio(503, { estado: 'canal_no_disponible' }))
    assert.match(textoErrorEnvio(503, { estado: 'sin_migracion' }), /SQL/)
  })
  it('🪤 enviada_sin_registrar dice que SÍ salió y que no se reenvíe', () => {
    const t = textoErrorEnvio(500, { estado: 'enviada_sin_registrar' })
    assert.match(t, /SÍ ha salido/)
    assert.ok(!/NO enviada/.test(t))
  })
  it('🪤 un 502 de red de plataforma o un 5xx genérico es «no se sabe», nunca «NO enviada»', () => {
    assert.match(textoErrorEnvio(502, { estado: 'error', motivo: 'red' }), /No se sabe/)
    assert.match(textoErrorEnvio(504, null), /No se sabe/)
  })
  it('envio_en_curso ≠ ya_enviada', () => assert.notEqual(textoErrorEnvio(409, { estado: 'envio_en_curso' }), textoErrorEnvio(409, { estado: 'ya_enviada' })))
  it('status 0 avisa de que no se sabe', () => assert.match(textoErrorEnvio(0, null), /No se sabe/))
  it('un 4xx de validación sí es «NO enviada»', () => assert.match(textoErrorEnvio(422, { estado: 'identidad_incompleta', motivo: 'falta DNI' }), /NO enviada: falta DNI/))
})

describe('lectura del panel', () => {
  it('503 sin_migracion se lee como tal (no como error genérico)', () => {
    const l = interpretarPanel(503, { estado: 'sin_migracion', motivo: 'falta el SQL' })
    assert.equal(l.estado, 'sin_migracion')
    assert.match(textoErrorPanel(l as { estado: 'sin_migracion' }), /falta aplicar su SQL/)
  })
  it('adjuntos del puerto ({documentoId, nombre, competencia}) se conservan', () => {
    const l = interpretarPanel(200, { companias: [], documentosLeidos: true, documentos: [{ id: 'd1', nombre: 'p.pdf', competencia: true }], consultas: [{ id: 'c1', estado: 'borrador', adjuntos: [{ documentoId: 'd1', nombre: 'p.pdf', competencia: true }] }] })
    assert.equal(l.estado, 'ok')
    if (l.estado === 'ok') {
      assert.deepEqual(l.datos.consultas[0].adjuntos, [{ id: 'd1', nombre: 'p.pdf', competencia: true }])
      assert.equal(l.datos.documentos[0].competencia, true)
    }
  })
  it('documentos sin leer ≠ no hay documentos', () => {
    const l = interpretarPanel(200, { companias: [], documentos: [], documentosLeidos: false })
    assert.equal(l.estado === 'ok' && l.datos.documentosLeidos, false)
  })
  it('tomador sin nombre pero con documento se conserva (no se pierde la identidad)', () => {
    const l = interpretarPanel(200, { companias: [], tomador: { nombre: null, docEnmascarado: '*****678Z', docLegible: true } })
    assert.deepEqual(l.estado === 'ok' && l.datos.tomador, { nombre: null, docEnmascarado: '*****678Z', docLegible: true })
  })
})

describe('orden de consultas, adjuntos y competencia', () => {
  const c = (id: string, estado: ConsultaDTO['estado'], enviadaAt: string | null) => ({ id, estado, enviadaAt } as ConsultaDTO)
  it('borradores arriba, luego enviadas recientes primero', () => {
    const o = ordenarConsultas([c('1', 'enviada', '2026-10-01'), c('2', 'borrador', null), c('3', 'respondida', '2026-10-05')])
    assert.deepEqual(o.map((x) => x.id), ['2', '3', '1'])
  })
  it('el aviso del adjunto sale siempre que haya alguno', () => {
    assert.equal(mostrarAvisoAdjunto([]), false)
    assert.equal(mostrarAvisoAdjunto(['d1']), true)
  })
  it('competencia: null → «No figura», nunca 0', () => {
    const f = filaCompetencia({ compania: null, prima: null, coberturas: null }, (n) => `${n}€`)
    assert.deepEqual(f, { compania: 'No figura', prima: 'No figura', coberturas: 'No figura' })
    assert.equal(filaCompetencia({ compania: 'X', prima: 0, coberturas: 'rc' }, (n) => `${n}€`).prima, '0€')
  })
})

describe('estados', () => {
  it('los 8 estados tienen etiqueta legible y tono', () => {
    assert.equal(ESTADOS_CONSULTA.length, 8)
    for (const e of ESTADOS_CONSULTA) { assert.ok(ROTULO_ESTADO[e]); assert.ok(TONO_ESTADO[e]); assert.notEqual(rotuloEstado(e), e) }
    assert.equal(rotuloEstado('pide_info'), 'Pide más información')
  })
  it('un estado desconocido se muestra CRUDO y la fila no se descarta', () => {
    assert.equal(rotuloEstado('en_revision'), 'en_revision')
    assert.equal(tonoEstado('en_revision'), 'neutral')
    const l = interpretarPanel(200, { companias: [], consultas: [{ id: 'c1', estado: 'en_revision', companiaNombre: 'X' }] })
    assert.equal(l.estado, 'ok')
    if (l.estado === 'ok') { assert.equal(l.datos.consultas.length, 1); assert.equal(l.datos.consultas[0].estado, 'en_revision') }
  })
})
