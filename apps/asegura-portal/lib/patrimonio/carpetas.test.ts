import { test } from 'node:test'
import assert from 'node:assert/strict'

import { carpetaDeOwner, puedeDocumento, CARPETAS_POR_OWNER } from './carpetas.ts'

test('Gestión y Total ven, suben y borran en toda carpeta de su owner', () => {
  for (const rol of ['gestion', 'total'] as const) {
    for (const owner of ['inmueble', 'contrato', 'inquilino'] as const) {
      for (const c of CARPETAS_POR_OWNER[owner]) for (const a of ['ver', 'subir', 'borrar'] as const) assert.equal(puedeDocumento(rol, a, owner, c.id), true)
    }
  }
})

test('sin nivel (null/undefined/desconocido): nada', () => {
  for (const rol of [null, undefined, 'consulta', 'admin'] as never[]) for (const a of ['ver', 'subir', 'borrar'] as const) assert.equal(puedeDocumento(rol, a, 'inmueble', 'facturas'), false)
})

test('la carpeta tiene que ser del owner: una de contrato no vale para un inmueble', () => {
  assert.equal(carpetaDeOwner('inmueble', 'contrato_firmado'), false)
  assert.equal(puedeDocumento('total', 'subir', 'inmueble', 'contrato_firmado'), false)
  assert.equal(puedeDocumento('total', 'ver', 'otro', 'facturas'), false)
})

test('inquilino: solo ve y sube en su carpeta de recibos; nunca borra ni toca otras', () => {
  assert.equal(puedeDocumento('inquilino', 'ver', 'inquilino', 'recibos'), true)
  assert.equal(puedeDocumento('inquilino', 'subir', 'inquilino', 'recibos'), true)
  assert.equal(puedeDocumento('inquilino', 'borrar', 'inquilino', 'recibos'), false)
  for (const c of ['identificacion', 'otros_inquilino']) for (const a of ['ver', 'subir', 'borrar'] as const) assert.equal(puedeDocumento('inquilino', a, 'inquilino', c), false)
  // Ni gastos/facturas del inmueble ni el contrato.
  assert.equal(puedeDocumento('inquilino', 'ver', 'inmueble', 'facturas'), false)
  assert.equal(puedeDocumento('inquilino', 'ver', 'contrato', 'contrato_firmado'), false)
})
