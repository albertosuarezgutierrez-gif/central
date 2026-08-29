import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 🚨 GUARDIÁN — el enlace de pago DEBE crearse con Managed Payments desactivado.
//
// Managed Payments (Stripe como merchant of record) viene ACTIVADO POR DEFECTO en las cuentas
// nuevas. Con él, `paymentLinks.create` devuelve un 400 —«the product tax code is missing … required
// for Managed Payments, which is enabled by default on your account»— porque solo admite productos
// DIGITALES con `tax_code`, y su doc dice explícitamente que no cubre la venta de SERVICIOS. Una
// cuna montada en un piso no lo es.
//
// El fallo es MUDO: `crearEnlacePago` captura la excepción y devuelve `null`, que aguas arriba
// (`cobro-auto.ts`) es indistinguible de «Stripe no está configurado». El huésped acepta el precio
// y sencillamente no le llega nada.
//
// Encontrado el 29/08/2026 haciendo la llamada REAL contra la cuenta viva. Ni `tsc` ni el build lo
// cazan —el SDK 22.2.0 ni siquiera tipa el campo— y ningún test con mocks lo habría visto: el
// rechazo lo pone Stripe, no nuestro código.
//
// Se lee el FUENTE porque lo que hay que fijar es la FORMA DE LA LLAMADA, no su resultado.
// Se miran SOLO las líneas de código: los comentarios de `stripe.ts` explican por qué NO se pone un
// `tax_code`, y esa explicación no puede hacer fallar al guardián que la defiende.
function fuenteStripe(): string {
  const src = readFileSync(join(process.cwd(), 'lib/sivra/extras/stripe.ts'), 'utf8')
  return src.split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n')
}

/** El cuerpo de la llamada a `paymentLinks.create`, sin lo que haya antes o después. */
function llamadaPaymentLinks(src: string): string {
  const i = src.indexOf('paymentLinks.create(')
  assert.notStrictEqual(i, -1, 'ya no se crea el enlace con paymentLinks.create: revisa este guardián')
  return src.slice(i, src.indexOf('\n    })', i))
}

test('el Payment Link se crea con managed_payments desactivado', () => {
  const cuerpo = llamadaPaymentLinks(fuenteStripe())
  assert.ok(
    /managed_payments\s*:\s*\{\s*enabled\s*:\s*false\s*\}/.test(cuerpo),
    'falta `managed_payments: { enabled: false }` en paymentLinks.create — Stripe rechazará el enlace ' +
      'por falta de tax_code y el huésped se quedará sin cobrar, en silencio.',
  )
})

test('no se cuela un tax_code para contentar a Managed Payments', () => {
  // El arreglo correcto es APAGAR Managed Payments, no ponerle un tax_code al producto: eso lo
  // activaría, y entonces el vendedor pasa a ser Stripe (el huésped ve «LINK.COM*» en su extracto).
  // Alberto cobra como persona física y sin IVA.
  assert.ok(
    !/tax_code/.test(fuenteStripe()),
    'aparece `tax_code`: eso ACTIVA Managed Payments y cambia quién es el vendedor. No es el arreglo.',
  )
})

test('el enlace sigue siendo de un solo uso', () => {
  // Regresión del propio guardián: al tocar la llamada es fácil llevarse por delante la restricción
  // que impide que el huésped pague dos veces la misma cuna.
  const cuerpo = llamadaPaymentLinks(fuenteStripe())
  assert.ok(
    /completed_sessions\s*:\s*\{\s*limit\s*:\s*1\s*\}/.test(cuerpo),
    'falta `restrictions.completed_sessions.limit = 1`: el enlace admitiría pagos repetidos.',
  )
})
