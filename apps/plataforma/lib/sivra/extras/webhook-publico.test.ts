import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 🚨 GUARDIÁN — el webhook de Stripe TIENE que estar exento del gate de sesión.
//
// Stripe POSTea desde sus servidores, sin cookie y sin seguir redirects. Si `middleware.ts` no lo
// exime, el gate responde 307 → /login: Stripe lo apunta como entrega fallida y el extra se queda
// para siempre en `enlace_enviado` PESE A ESTAR COBRADO — el huésped paga, la limpieza no se entera
// y el cron de impago acaba caducándolo. Es un fallo MUDO: nada en nuestro lado se pone rojo.
//
// Pasó de verdad el 28/08/2026: la ruta se mergeó sin tocar el middleware y solo se vio sondeando
// producción con curl. Ni `tsc` ni el build lo cazan, porque no es un error de tipos: es una lista.
//
// Se lee el FUENTE a propósito — importar `middleware.ts` arrastra `next/server`, que no carga
// bajo `node --test`. Mismo patrón que `lib/subastas/cols-subasta.test.ts`.
const RUTA_WEBHOOK = '/api/sivra/extras/webhook'

function middlewareFuente(): string {
  return readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
}

test('el webhook de extras está en la lista PUBLIC del middleware', () => {
  const src = middlewareFuente()
  const publico = src.slice(src.indexOf('const PUBLIC'), src.indexOf(']', src.indexOf('const PUBLIC')))
  assert.ok(
    publico.includes(`'${RUTA_WEBHOOK}'`),
    `${RUTA_WEBHOOK} NO está en PUBLIC: Stripe recibirá un 307 al login y el pago nunca se marcará como cobrado.`,
  )
})

// La exención solo es aceptable porque el handler valida la FIRMA de Stripe. Si alguien quitara esa
// verificación, tendríamos una ruta pública que cualquiera podría usar para declarar extras pagados.
test('el handler del webhook verifica la firma de Stripe antes de tocar nada', () => {
  const handler = readFileSync(join(process.cwd(), 'app/api/sivra/extras/webhook/route.ts'), 'utf8')
  assert.match(handler, /constructEvent/, 'el webhook debe verificar la firma con constructEvent')
  assert.match(handler, /requireSecret\(\s*'STRIPE_WEBHOOK_SECRET_SIVRA'\s*\)/,
    'el secreto de firma debe leerse con requireSecret (nunca un literal de respaldo)')
  // Ojo: se compara contra la LLAMADA (`await marcarPagado(`), no contra cualquier aparición del
  // nombre — el `import` de arriba del fichero siempre va antes que la firma y daría un falso rojo.
  const idxFirma = handler.indexOf('constructEvent')
  const idxPago = handler.indexOf('await marcarPagado(')
  assert.ok(idxFirma > 0, 'no se encontró constructEvent en el handler')
  assert.ok(idxPago > idxFirma,
    'marcarPagado no puede ejecutarse antes de verificar la firma')
})
