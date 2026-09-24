import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// El aviso de "ceros de relleno" de Mapfre (ver regression-auto-nuevo-historial.test.ts
// y regression-moto-nuevo-historial.test.ts) era solo texto de ayuda estático — dependía
// de que el corredor lo leyera y lo notara solo. Esto lo convierte en una comprobación EN
// VIVO (`digitosPolizaSospechosos`, ≥3 ceros seguidos) mientras se teclea, en las DOS
// pantallas de "oportunidad nueva" (auto y moto).

const RUTA_AUTO = join(
  import.meta.dirname,
  '..',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx',
)
const RUTA_MOTO = join(
  import.meta.dirname,
  '..',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx',
)

for (const [nombre, ruta] of [['auto-nuevo', RUTA_AUTO] as const, ['moto-nuevo', RUTA_MOTO] as const]) {
  test(`${nombre}: importa el detector puro y lo usa junto al campo de póliza`, () => {
    const fuente = readFileSync(ruta, 'utf8')
    assert.match(fuente, /import \{ digitosPolizaSospechosos \} from '@\/lib\/poliza-digitos-sospechosos'/)
    assert.match(fuente, /digitosPolizaSospechosos\(polizaActualDigitos\)/)
    assert.match(fuente, /Parece relleno \(varios ceros seguidos\)/)
  })
}
