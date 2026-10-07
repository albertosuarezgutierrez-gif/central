// Aviso de verificación humana (08/10/2026): solo `requiere_humano` por verificación, una vez por trabajo, sin datos personales.
// Para verlo en rojo: quita `&& !yaAvisado(f.error)` en `avisosPendientes` (avisaría en cada pasada) o cambia el estado esperado
// en `esVerificacionHumana` (un CAPTCHA avisaría como verificación).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosPendientes, esVerificacionHumana, yaAvisado, type FilaVerificacion } from './tarificador-verificacion-reglas.ts'

const MSG = 'requiere_verificacion_humana: Generali pide verificación: entra en su portal, valida y pulsa Reintentar'
const fila = (p: Partial<FilaVerificacion> & { error?: unknown } = {}): FilaVerificacion => ({
  id: 't1', compania: 'generali', ramo: 'comunidades', estado: 'requiere_humano', terminado_at: '2026-10-08T09:00:00Z',
  error: { tipo: 'captcha', mensaje: MSG, url: 'https://portal.test/login?sesion=SECRETO' }, ...p,
})

test('solo es verificación el requiere_humano con el motivo al principio del mensaje (con o sin nota delante)', () => {
  assert.equal(esVerificacionHumana('requiere_humano', { mensaje: MSG }), true)
  assert.equal(esVerificacionHumana('requiere_humano', { mensaje: `[reintento] ${MSG}` }), true)
  assert.equal(esVerificacionHumana('requiere_humano', { mensaje: 'CAPTCHA en el login' }), false)
  assert.equal(esVerificacionHumana('error_definitivo', { mensaje: MSG }), false)
  assert.equal(esVerificacionHumana('requiere_humano', { mensaje: `otra cosa ${MSG}` }), false)
  assert.equal(esVerificacionHumana('requiere_humano', null), false)
})

test('idempotente: con marca no se vuelve a avisar; un fallo nuevo (sin marca) sí', () => {
  const marcada = fila({ error: { tipo: 'captcha', mensaje: MSG, avisadoHumanoEn: '2026-10-08T09:05:00Z' } })
  assert.equal(yaAvisado(marcada.error), true)
  assert.deepEqual(avisosPendientes([marcada]), [])
  assert.equal(avisosPendientes([fila()]).length, 1)
})

test('el aviso no lleva datos personales: solo trabajo, compañía y ramo (ni URL, ni mensaje, ni riesgo)', () => {
  const [a] = avisosPendientes([fila({ riesgo: { direccion: { via: 'Calle Falsa' } } } as never)])
  assert.deepEqual(Object.keys(a).sort(), ['compania', 'ramo', 'terminadoEn', 'trabajoId'])
  assert.ok(!JSON.stringify(a).includes('SECRETO'))
  assert.equal(a.terminadoEn, '2026-10-08T09:00:00.000Z')
})
