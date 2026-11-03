// Fase 3 de la regularización de RC (03/11/2026): borrador de respuesta a la COMPAÑÍA, edición «Para:» y buzón del
// Directorio. Textos inventados. `node --test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { borradorRespuestaCompania, buzonElegido, leerEdicionRespuestaCompania } from './regularizacion-rc.ts'

const base = {
  compania: 'Occident', numeroPoliza: 'BIDS000002', tomador: 'OBRAS INVENTADAS SL', periodo: { desde: '2025-07', hasta: '2026-07' },
  conDocumento: false, claveMediador: null, firmante: 'Nombre Apellido — Grupo ASegura',
}

test('borrador a la compañía: póliza, tomador, periodo y facturación en formato español (2.162,49€)', () => {
  const b = borradorRespuestaCompania({ ...base, respuesta: { facturacionCent: 216249, empleados: null, masaSalarialCent: null } })
  assert.match(b.asunto, /BIDS000002/)
  assert.match(b.asunto, /OBRAS INVENTADAS SL/)
  assert.match(b.asunto, /07\/2025 – 07\/2026/)
  assert.match(b.texto, /Facturación del periodo \(sin IVA\): 2\.162,49€/)
  assert.doesNotMatch(b.texto, /2162[.,]49|2,162\.49/)
})

test('cifras grandes con puntos de miles; empleados y masa solo si los puso (null ≠ 0)', () => {
  const sin = borradorRespuestaCompania({ ...base, respuesta: { facturacionCent: 37843654, empleados: null, masaSalarialCent: null } })
  assert.match(sin.texto, /378\.436,54€/)
  assert.doesNotMatch(sin.texto, /empleados/i)
  assert.doesNotMatch(sin.texto, /Masa salarial/)
  const con = borradorRespuestaCompania({ ...base, respuesta: { facturacionCent: 0, empleados: 0, masaSalarialCent: 4800000 } })
  assert.match(con.texto, /Facturación del periodo \(sin IVA\): 0,00€/, '0 declarado es un dato, se escribe')
  assert.match(con.texto, /Nº de empleados: 0/)
  assert.match(con.texto, /Masa salarial: 48\.000,00€/)
})

test('adjunto y clave de mediador solo si existen; el borrador no lleva ninguna dirección de correo', () => {
  const b = borradorRespuestaCompania({ ...base, conDocumento: true, claveMediador: 'M00000', respuesta: { facturacionCent: 100, empleados: null, masaSalarialCent: null } })
  assert.match(b.texto, /Adjuntamos la documentación/)
  assert.match(b.texto, /Mediador M00000/)
  const s = borradorRespuestaCompania({ ...base, respuesta: { facturacionCent: 100, empleados: null, masaSalarialCent: null } })
  assert.doesNotMatch(s.texto, /Adjuntamos/)
  assert.doesNotMatch(s.texto, /Mediador /)
  assert.doesNotMatch(`${b.asunto}\n${b.texto}`, /@/, 'ni un correo inventado en el borrador')
})

test('edición: «Para:» opcional en la primera línea; solo destinatario, solo texto, o los dos', () => {
  assert.deepEqual(leerEdicionRespuestaCompania('Para: Buzon@Occident.com'), { para: 'buzon@occident.com', texto: null })
  const t = 'Buenos días, os mando la cifra real del periodo.'
  assert.deepEqual(leerEdicionRespuestaCompania(t), { para: undefined, texto: t })
  assert.deepEqual(leerEdicionRespuestaCompania(`para: <a@b.es>\n${t}`), { para: 'a@b.es', texto: t })
  assert.equal(leerEdicionRespuestaCompania('Para: no-es-un-correo'), null)
  assert.equal(leerEdicionRespuestaCompania('Para:'), null)
  assert.equal(leerEdicionRespuestaCompania(''), null)
  assert.equal(leerEdicionRespuestaCompania('ok'), null)
})

test('buzón: solo un contacto ACTIVO del Directorio con ese correo exacto; lo demás no se acepta', () => {
  const buzones = [
    { id: '1', nombre: 'Soporte', email: 'Soporte@Occident.com', activo: true },
    { id: '2', nombre: 'Viejo', email: 'viejo@occident.com', activo: false },
  ]
  assert.equal(buzonElegido(buzones, 'soporte@occident.com')?.id, '1')
  assert.equal(buzonElegido(buzones, 'viejo@occident.com'), null, 'inactivo')
  assert.equal(buzonElegido(buzones, 'otro@occident.com'), null, 'tecleado y no está en el Directorio')
  assert.equal(buzonElegido(buzones, 'oporte@occident.com'), null, 'sin coincidencias parciales')
  assert.equal(buzonElegido([], 'soporte@occident.com'), null)
})
