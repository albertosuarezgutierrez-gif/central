import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// «No aparecen todas las compañías» (Alberto, 25/09/2026): el desplegable de
// «Compañía actual» de auto nuevo leía el DIRECTORIO de la correduría
// (`seguros.companias_dgs`, solo las compañías con las que trabaja Alberto),
// cuando el cliente puede venir de cualquiera. La lista buena es el catálogo de
// mercado de Avant2 (`/car/insurance-companies`), que es además la que valida
// `previousInsurance.previousCompany.code`.

const leer = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')

test('asegura sirve el catálogo de compañías anteriores de Avant2', () => {
  assert.match(leer('apps/asegura/lib/codeoscopic/catalogos.ts'), /catalogo\(config, '\/car\/insurance-companies'\)/)
  assert.match(
    leer('apps/asegura/lib/retarificar-cartera.ts'),
    /case 'companias-anteriores':\s*return \{ estado: 'ok', opciones: await companiasAnteriores\(config\) \}/,
  )
})

test('auto nuevo usa ese catálogo antes que el directorio de la correduría', () => {
  const page = leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/page.tsx')
  assert.match(page, /catalogoAsegura\(\{ tipo: 'companias-anteriores' \}\)/)
  assert.match(page, /anteriores\.estado === 'ok' && anteriores\.opciones\.length > 0\s*\? anteriores\.opciones/)
})

test('asegura sirve la fecha de matriculación de Avant2 sin degradar un fallo a «no hay»', () => {
  const r = leer('apps/asegura/lib/retarificar-cartera.ts')
  assert.match(r, /case 'fecha-matriculacion':/)
  assert.match(r, /if \(f\.estado === 'error'\) throw new Error\(f\.detalle\)/)
})
