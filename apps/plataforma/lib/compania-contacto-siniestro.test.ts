import test from 'node:test'
import assert from 'node:assert/strict'

import { companiaDeSiniestro, contactoSiniestroDe, tieneAlgoQueEnsenar } from './compania-contacto-siniestro.ts'
import type { Compania, Contacto } from './companias-asegura.ts'

function compania(p: Partial<Compania> = {}): Compania {
  return {
    codigoDgs: 'X',
    nombreComun: 'Mapfre',
    nombreCima: 'MAPFRE ESPAÑA',
    enCima: true,
    claveMediador: null,
    notas: null,
    telefonoSiniestros: null,
    whatsappSiniestros: null,
    horarioSiniestros: null,
    contactos: [],
    ...p,
  }
}

const contacto = (p: Partial<Contacto> = {}): Contacto => ({
  id: 'c1', nombre: 'Ana', cargo: null, area: null, email: null, telefono: null, notas: null, orden: 0, ultimoContactoEn: null, ...p,
})

// ── companiaDeSiniestro ──────────────────────────────────────────────────────

test('companiaDeSiniestro: casa por nombreComun exacto (sin distinguir mayúsculas/acentos)', () => {
  const cs = [compania({ nombreComun: 'Generali' })]
  assert.equal(companiaDeSiniestro('GENERALI', cs), cs[0])
})

test('companiaDeSiniestro: casa por nombreCima cuando difiere del nombreComun', () => {
  const cs = [compania({ nombreComun: 'Mapfre', nombreCima: 'MAPFRE ESPAÑA CIA DE SEGUROS' })]
  assert.equal(companiaDeSiniestro('Mapfre España Cia de Seguros', cs), cs[0])
})

test('🚨 sin match, o con MÁS DE UNO, no se elige ninguna — nunca "la que más se parece"', () => {
  const cs = [compania({ codigoDgs: 'A', nombreComun: 'Occident' }), compania({ codigoDgs: 'B', nombreComun: 'Reale' })]
  assert.equal(companiaDeSiniestro('Zurich', cs), null)
  // Las dos contienen "a" tras normalizar en algún punto, pero el test real de
  // ambigüedad es dos candidatas que contienen el mismo texto genérico:
  const ambiguas = [compania({ codigoDgs: 'A', nombreComun: 'Seguros Grupo Uno' }), compania({ codigoDgs: 'B', nombreComun: 'Grupo Uno Seguros Generales' })]
  assert.equal(companiaDeSiniestro('Grupo Uno', ambiguas), null)
})

test('companiaDeSiniestro: texto vacío no casa con nada', () => {
  assert.equal(companiaDeSiniestro('', [compania()]), null)
  assert.equal(companiaDeSiniestro('   ', [compania()]), null)
})

// ── contactoSiniestroDe ───────────────────────────────────────────────────────

test('contactoSiniestroDe: prioriza la persona de área "siniestros" del directorio', () => {
  const c = compania({
    telefonoSiniestros: '900111222',
    contactos: [contacto({ nombre: 'Pedro', area: 'comercial', telefono: '900000000' }), contacto({ nombre: 'Lucía', area: 'siniestros', telefono: '900333444' })],
  })
  const r = contactoSiniestroDe(c)
  assert.equal(r.nombre, 'Lucía')
  assert.equal(r.telefono, '900333444')
})

test('sin contacto de área siniestros, cae al teléfono GENÉRICO de la compañía', () => {
  const c = compania({ telefonoSiniestros: '900111222', contactos: [contacto({ nombre: 'Pedro', area: 'comercial' })] })
  const r = contactoSiniestroDe(c)
  assert.equal(r.nombre, null)
  assert.equal(r.telefono, '900111222')
})

test('whatsapp y horario son SIEMPRE los de la compañía, aunque haya persona destacada', () => {
  const c = compania({
    whatsappSiniestros: '600111222',
    horarioSiniestros: '24h',
    contactos: [contacto({ nombre: 'Lucía', area: 'siniestros', telefono: '900333444' })],
  })
  const r = contactoSiniestroDe(c)
  assert.equal(r.whatsapp, '600111222')
  assert.equal(r.horario, '24h')
})

test('tieneAlgoQueEnsenar: false solo cuando los cuatro campos son null', () => {
  assert.equal(tieneAlgoQueEnsenar({ nombre: null, telefono: null, whatsapp: null, horario: null }), false)
  assert.equal(tieneAlgoQueEnsenar({ nombre: null, telefono: null, whatsapp: null, horario: '24h' }), true)
})
