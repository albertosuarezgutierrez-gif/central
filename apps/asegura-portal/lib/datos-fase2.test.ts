// Enlace de datos, fase 2 (26/10/2026): el buscador de la versión exacta en el formulario público.
import test from 'node:test'
import assert from 'node:assert/strict'
import { NADA_CONOCIDO, camposSolicitud } from '@central/module-seguros'
import { esencialesPendientes, estadoDesdeBorrador } from './datos-vista.ts'
import { interpretarBorrador, interpretarCatalogo } from './solicitud-datos.ts'

const CAMPOS = camposSolicitud('auto', NADA_CONOCIDO)

test('el buscador no bloquea el envío (es una ayuda) y sus ids vuelven del borrador', () => {
  assert.ok(!esencialesPendientes(CAMPOS, {}, new Set()).includes('versionCatalogo'))
  const b = interpretarBorrador({ versionCatalogoMarcaId: '7', versionCatalogoCodigo: 'X1', versionCatalogo: 'no', raro: 'x' }, CAMPOS)
  assert.deepEqual(b, { versionCatalogoMarcaId: '7', versionCatalogoCodigo: 'X1' })
  const e = estadoDesdeBorrador(CAMPOS, b)
  assert.equal(e.valores.versionCatalogoMarcaId, '7')
  assert.equal(e.valores.versionCatalogoCodigo, 'X1')
})

test('catálogo del puente: solo ok con lista; un fallo NO es «no hay opciones»', () => {
  assert.deepEqual(interpretarCatalogo(200, { estado: 'ok', opciones: [{ id: '7', nombre: 'SEAT' }, { id: 8 }] }), [{ id: '7', nombre: 'SEAT' }])
  assert.equal(interpretarCatalogo(503, { estado: 'sin_configurar' }), null)
  assert.equal(interpretarCatalogo(200, { estado: 'error' }), null)
  assert.equal(interpretarCatalogo(200, null), null)
})
