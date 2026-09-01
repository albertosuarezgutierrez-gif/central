import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolverConfig,
  resolverTopes,
  explicarConfig,
  TOPE_DIARIO_DEFECTO,
  TOPE_DIARIO_MAXIMO,
  TOPE_MENSUAL_MAXIMO,
  COSTE_COTIZACION_CENTS,
} from './config.ts'

const COMPLETO = {
  CODEOSCOPIC_TARIFICACION_ACTIVA: 'true',
  CODEOSCOPIC_BASE_URL: 'https://api.codeoscopic.io',
  CODEOSCOPIC_CLIENT_ID: 'id',
  CODEOSCOPIC_CLIENT_SECRET: 'secreto',
  CODEOSCOPIC_CLIENT_APP: 'app',
  CODEOSCOPIC_USER_EMAIL: 'a@b.es',
}

test('el coste por cotización es 0,50€ (por COTIZACIÓN, no por emisión)', () => {
  assert.equal(COSTE_COTIZACION_CENTS, 50)
})

// ─── El interruptor está apagado por defecto ─────────────────────────────────
test('sin la variable de activación NO se tarifica, aunque todo lo demás esté puesto', () => {
  const { CODEOSCOPIC_TARIFICACION_ACTIVA: _, ...sinFlag } = COMPLETO
  assert.equal(resolverConfig(sinFlag).estado, 'apagado')
})

test('solo el literal "true" enciende: ni "1", ni "TRUE", ni "sí"', () => {
  for (const v of ['1', 'TRUE', 'True', 'si', 'yes', '']) {
    assert.equal(
      resolverConfig({ ...COMPLETO, CODEOSCOPIC_TARIFICACION_ACTIVA: v }).estado,
      'apagado',
      `«${v}» no debería encender la tarificación`,
    )
  }
})

// ─── «Apagado» e «incompleta» son cosas distintas ────────────────────────────
test('encendido pero sin credenciales dice CUÁLES faltan, y no se confunde con apagado', () => {
  const r = resolverConfig({
    CODEOSCOPIC_TARIFICACION_ACTIVA: 'true',
    CODEOSCOPIC_BASE_URL: 'https://api.codeoscopic.io',
  })
  assert.equal(r.estado, 'incompleta')
  if (r.estado === 'incompleta') {
    assert.deepEqual(r.faltan, [
      'CODEOSCOPIC_CLIENT_ID',
      'CODEOSCOPIC_CLIENT_SECRET',
      'CODEOSCOPIC_CLIENT_APP',
      'CODEOSCOPIC_USER_EMAIL',
    ])
  }
})

test('una variable en blanco cuenta como ausente, no como valor', () => {
  const r = resolverConfig({ ...COMPLETO, CODEOSCOPIC_CLIENT_SECRET: '   ' })
  assert.equal(r.estado, 'incompleta')
})

test('con todo puesto queda lista y deriva el token del host', () => {
  const r = resolverConfig(COMPLETO)
  assert.equal(r.estado, 'lista')
  if (r.estado === 'lista') {
    assert.equal(r.config.tokenUrl, 'https://api.codeoscopic.io/oauth2/token')
    assert.equal(r.config.quotePath, '/insurances')
  }
})

test('la barra final del host no duplica la del path', () => {
  const r = resolverConfig({ ...COMPLETO, CODEOSCOPIC_BASE_URL: 'https://api.codeoscopic.io/' })
  assert.equal(r.estado, 'lista')
  if (r.estado === 'lista') assert.equal(r.config.baseUrl, 'https://api.codeoscopic.io')
})

// ─── Topes: lo ilegible NO significa «sin límite» ────────────────────────────
test('sin topes en el entorno se aplican los defectos bajos', () => {
  assert.equal(resolverTopes({}).diario, TOPE_DIARIO_DEFECTO)
})

test('un tope ilegible cae al defecto, nunca a «ilimitado»', () => {
  for (const v of ['muchas', '-5', '3.7', 'NaN', 'Infinity']) {
    assert.equal(
      resolverTopes({ CODEOSCOPIC_TOPE_DIARIO: v }).diario,
      TOPE_DIARIO_DEFECTO,
      `«${v}» debería caer al defecto`,
    )
  }
})

test('un tope absurdo se recorta al techo: un cero de más no cuesta 1.000€', () => {
  const t = resolverTopes({ CODEOSCOPIC_TOPE_DIARIO: '2000', CODEOSCOPIC_TOPE_MENSUAL: '99999' })
  assert.equal(t.diario, TOPE_DIARIO_MAXIMO)
  assert.equal(t.mensual, TOPE_MENSUAL_MAXIMO)
})

test('un tope de 0 es válido: es la forma de cerrar el grifo sin apagar la integración', () => {
  assert.equal(resolverTopes({ CODEOSCOPIC_TOPE_DIARIO: '0' }).diario, 0)
})

test('la explicación distingue apagado de mal configurado', () => {
  assert.match(explicarConfig({ estado: 'apagado', motivo: 'x' }), /apagada/i)
  assert.match(explicarConfig({ estado: 'incompleta', faltan: ['A'] }), /faltan A/)
})

test('la sonda puede resolver la config con el interruptor APAGADO (pedir token es gratis)', () => {
  // Verificar host y credenciales ANTES de encender es el orden correcto: la
  // primera cotización real ya cuesta 0,50€ y no hay sandbox donde ensayar.
  const { CODEOSCOPIC_TARIFICACION_ACTIVA: _, ...sinFlag } = COMPLETO
  assert.equal(resolverConfig(sinFlag, { ignorarInterruptor: true }).estado, 'lista')
})

test('pero ignorar el interruptor NO perdona las credenciales que falten', () => {
  const r = resolverConfig({ CODEOSCOPIC_BASE_URL: 'https://x' }, { ignorarInterruptor: true })
  assert.equal(r.estado, 'incompleta')
})
