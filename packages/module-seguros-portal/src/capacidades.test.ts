import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALCANCE_DE_NIVEL,
  NIVELES_COMPARTIDOS,
  capacidadesDeAlcances,
  duenaDeDeclarada,
  nivelCompartido,
  type Capacidades,
} from './capacidades.ts'
import { ALCANCES, ALCANCES_CONCEDIBLES } from './autorizacion.ts'

const YO = 'id-alberto'
const ELLA = 'id-maria'

test('tres presets y cada uno escribe un alcance concedible', () => {
  assert.deepEqual([...NIVELES_COMPARTIDOS], ['consulta', 'gestion', 'total'])
  for (const n of NIVELES_COMPARTIDOS) {
    assert.ok(ALCANCES_CONCEDIBLES.includes(ALCANCE_DE_NIVEL[n]), `${n} → ${ALCANCE_DE_NIVEL[n]} no se puede conceder`)
  }
})

test('Consulta: ve pólizas y recibos, no actúa ni toca las añadidas', () => {
  const c = capacidadesDeAlcances(['ver_economico'], 'fisica')
  assert.equal(c.verPolizas, true)
  assert.equal(c.verRecibos, true)
  assert.equal(c.verDeclaradas, true)
  assert.equal(c.abrirParte, false)
  assert.equal(c.subirDocumentos, false)
  assert.equal(c.anadirDeclaradas, false)
  assert.equal(c.editarDeclaradas, false)
  assert.equal(c.quitarDeclaradas, false)
  assert.equal(nivelCompartido(['ver_economico']), 'consulta')
})

test('Gestión: Consulta + partes + documentos, pero NO edita las añadidas', () => {
  for (const tipo of ['fisica', 'juridica'] as const) {
    const c = capacidadesDeAlcances(['gestion'], tipo)
    assert.equal(c.verPolizas, true, tipo)
    assert.equal(c.abrirParte, true, `${tipo}: gestión da partes`)
    assert.equal(c.subirDocumentos, true, `${tipo}: gestión sube documentos`)
    assert.equal(c.verDocumentos, true, tipo)
    assert.equal(c.anadirDeclaradas, false, `${tipo}: gestión no añade en su nombre`)
    assert.equal(c.editarDeclaradas, false, `${tipo}: gestión no edita sus añadidas`)
    assert.equal(c.quitarDeclaradas, false, `${tipo}: gestión no quita sus añadidas`)
  }
  assert.equal(nivelCompartido(['ver_economico', 'gestion']), 'gestion')
})

test('Total: como el titular sobre sus añadidas', () => {
  for (const tipo of ['fisica', 'juridica'] as const) {
    const c = capacidadesDeAlcances(['total'], tipo)
    assert.equal(c.abrirParte, true)
    assert.equal(c.anadirDeclaradas, true, tipo)
    assert.equal(c.editarDeclaradas, true, tipo)
    assert.equal(c.quitarDeclaradas, true, tipo)
  }
  assert.equal(nivelCompartido(['ver_economico', 'gestion', 'total']), 'total')
})

test('límites duros en TODOS los niveles y combinaciones: ni reautorizar ni tocar CIMA', () => {
  const combinaciones: unknown[][] = [[], ...ALCANCES.map((a) => [a]), [...ALCANCES], ['flota'], ['raro']]
  for (const tipo of ['fisica', 'juridica'] as const) {
    for (const a of combinaciones) {
      const c = capacidadesDeAlcances(a, tipo)
      assert.equal(c.autorizarTerceros, false, `${tipo} ${a.join('+')} reautoriza`)
      assert.equal(c.editarCartera, false, `${tipo} ${a.join('+')} edita CIMA`)
    }
  }
})

test('fail-closed: vacío, desconocido o no-texto no abre NADA', () => {
  for (const a of [[], ['raro'], ['flota'], [null], [42], ['TOTAL ']] as unknown[][]) {
    const c = capacidadesDeAlcances(a)
    assert.ok(Object.values(c).every((v) => v === false), `${JSON.stringify(a)} abrió algo`)
    assert.equal(nivelCompartido(a), null)
  }
})

test('los alcances viejos se leen por lo que de verdad abren', () => {
  // Una fila `partes` de una FÍSICA no abre actuar (lado restrictivo): es Consulta.
  assert.equal(nivelCompartido(['partes'], 'fisica'), 'consulta')
  assert.equal(capacidadesDeAlcances(['partes'], 'fisica').abrirParte, false)
  assert.equal(nivelCompartido(['partes'], 'juridica'), 'gestion')
  assert.equal(nivelCompartido(['ver']), 'consulta')
  assert.equal(capacidadesDeAlcances(['ver']).verRecibos, false, '`ver` es la tarjeta: sin recibos')
})

const cap = (alcances: string[]): Capacidades => capacidadesDeAlcances(alcances, 'fisica')

test('🔒 dueña de una declarada: tercero SIN concesión → null (404) para todo', () => {
  for (const accion of ['ver', 'editar', 'quitar', 'parte'] as const) {
    assert.equal(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena: null, accion }), null, accion)
  }
})

test('🔒 dueña de una declarada: con Consulta ve, pero editar/quitar/parte → null', () => {
  const ajena = { titularIdentidadId: ELLA, capacidades: cap(['ver_economico']) }
  assert.deepEqual(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena, accion: 'ver' }), {
    identidadId: ELLA,
    propia: false,
  })
  for (const accion of ['editar', 'quitar', 'parte'] as const) {
    assert.equal(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena, accion }), null, accion)
  }
})

test('🔒 dueña de una declarada: con Gestión da parte pero NO edita ni quita', () => {
  const ajena = { titularIdentidadId: ELLA, capacidades: cap(['gestion']) }
  assert.equal(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena, accion: 'parte' })?.identidadId, ELLA)
  assert.equal(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena, accion: 'editar' }), null)
  assert.equal(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena, accion: 'quitar' }), null)
})

test('🔒 dueña de una declarada: con Total edita y quita EN la identidad del titular', () => {
  const ajena = { titularIdentidadId: ELLA, capacidades: cap(['total']) }
  for (const accion of ['ver', 'editar', 'quitar', 'parte'] as const) {
    assert.deepEqual(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena, accion }), {
      identidadId: ELLA,
      propia: false,
    })
  }
})

test('la propia manda siempre, y la vía ajena nunca devuelve a quien mira', () => {
  assert.deepEqual(duenaDeDeclarada({ identidadQueMira: YO, propia: true, ajena: null, accion: 'quitar' }), {
    identidadId: YO,
    propia: true,
  })
  const trampa = { titularIdentidadId: YO, capacidades: cap(['total']) }
  assert.equal(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena: trampa, accion: 'editar' }), null)
  const vacia = { titularIdentidadId: '', capacidades: cap(['total']) }
  assert.equal(duenaDeDeclarada({ identidadQueMira: YO, propia: false, ajena: vacia, accion: 'editar' }), null)
})
