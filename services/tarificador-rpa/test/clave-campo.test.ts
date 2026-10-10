// Claves de CAMPO del formador (revisión de seguridad 06/10/2026): la clave que el worker manda a asegura es
// un slug `^[a-z0-9_]{1,60}$` (lo exigen `leerPeticionSugerir`/`leerPeticionConfirmar` y el CHECK del SQL).
// Antes viajaba la etiqueta en bruto («DNI/NIF/NIE/CIF#1») y asegura respondía 400: el fallback nunca funcionaba.
// Se prueban TODAS las etiquetas reales de `CAMPOS` contra el validador REAL del servidor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAMPOS } from '../src/adapters/allianz/comunidades.ts'
import { claveCampo } from '../src/formador.ts'
import { leerPeticionConfirmar, leerPeticionSugerir } from '../../../apps/asegura/lib/tarificador-formador-reglas.ts'

const CLAVE_SERVIDOR = /^[a-z0-9_]{1,60}$/
const cabecera = { trabajoId: '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b', compania: 'allianz', ramo: 'comunidades' }
const estructura = [{ tag: 'input', id: 'x', name: null, type: 'text', role: null, clases: null, texto: null, etiqueta: 'x', marco: 'appArea' }]

test('claveCampo: slug sin tildes, minúsculas, `_`, recorte a 60 y sufijo `__n` para el índice', () => {
  assert.equal(claveCampo('DNI/NIF/NIE/CIF'), 'dni_nif_nie_cif')
  assert.equal(claveCampo('DNI/NIF/NIE/CIF', 1), 'dni_nif_nie_cif__1')
  assert.equal(claveCampo('Año Construcción'), 'ano_construccion')
  assert.equal(claveCampo('% Comisión'), 'comision')
  assert.equal(claveCampo('Instalaciones Anexas (Deportivas, Piscinas, etc.)'), 'instalaciones_anexas_deportivas_piscinas_etc')
  assert.equal(claveCampo('%%%'), 'campo')
  const larga = claveCampo('x'.repeat(100), 3)
  assert.equal(larga.length, 60)
  assert.ok(larga.endsWith('__3'))
})

test('TODAS las etiquetas reales de CAMPOS → clave válida para asegura (regex + leerPeticionSugerir/Confirmar), sin colisiones', () => {
  const vistas = new Map<string, string>()
  for (const campo of CAMPOS) {
    const indice = campo.indice ?? 0
    const clave = claveCampo(campo.etiqueta, indice)
    const quien = `«${campo.etiqueta}»${indice ? ` #${indice}` : ''}`
    assert.match(clave, CLAVE_SERVIDOR, quien)
    const s = leerPeticionSugerir({ ...cabecera, clave, tipo: 'campo', descripcion: `Campo editable del formulario «${campo.etiqueta}»`, estructura })
    assert.ok(s.ok, `${quien}: leerPeticionSugerir lo rechaza (${s.ok ? '' : s.errores.join(', ')})`)
    const cf = leerPeticionConfirmar({ ...cabecera, clave, tipo: 'campo', selector: '#x', marco: 'appArea', origen: 'ia' })
    assert.ok(cf.ok, `${quien}: leerPeticionConfirmar lo rechaza`)
    assert.ok(!vistas.has(clave) || vistas.get(clave) === quien, `${quien} colisiona con ${vistas.get(clave)} en «${clave}»`)
    vistas.set(clave, quien)
  }
  assert.ok(vistas.size >= 25, 'se probaron todas las filas de CAMPOS')
})

test('la etiqueta en bruto (lo de antes) la rechaza el servidor: el cepo mide lo que dice', () => {
  const s = leerPeticionSugerir({ ...cabecera, clave: 'DNI/NIF/NIE/CIF#1', tipo: 'campo', descripcion: 'x', estructura })
  assert.equal(s.ok, false)
})
