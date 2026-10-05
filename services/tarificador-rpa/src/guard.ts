// Barrera de EMISIÓN en el navegador (05/10/2026). TARIFICAR ≠ EMITIR.
//   1. Toda navegación (y toda petición que no sea GET) a una URL que casa con el patrón se ABORTA
//      antes de salir, y el trabajo queda marcado → `error_definitivo`.
//   2. Los adaptadores NO hacen `.click()`: usan `pulsar()`, que mira el texto, aria-label, title,
//      value, id, name y href del elemento y se niega a pulsar si casa con el patrón. (Lo vigila
//      `test/regression-tarificador-rpa.test.ts` en la raíz.)

import type { BrowserContext, Locator } from 'playwright'
import { EmisionBloqueadaError, comprobarBoton, pareceEmision } from '@central/module-tarificacion'

export type GuardEmision = { violacion(): EmisionBloqueadaError | null; comprobar(): void }

export async function instalarGuardEmision(context: BrowserContext): Promise<GuardEmision> {
  let violacion: EmisionBloqueadaError | null = null
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    if ((req.isNavigationRequest() || req.method() !== 'GET') && pareceEmision(url)) {
      violacion ??= new EmisionBloqueadaError('url', url)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return {
    violacion: () => violacion,
    comprobar() {
      if (violacion) throw violacion
    },
  }
}

/** El ÚNICO modo de pulsar algo en un portal. Lanza `EmisionBloqueadaError` antes de pulsar. */
export async function pulsar(boton: Locator, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  const desc = await boton.evaluate((el) => {
    const h = el as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
    return [
      h.innerText ?? h.textContent ?? '',
      h.getAttribute('aria-label'),
      h.getAttribute('title'),
      typeof h.value === 'string' ? h.value : null,
      h.id || null,
      typeof h.name === 'string' ? h.name : null,
      typeof h.href === 'string' ? h.href : h.getAttribute('href'),
      h.getAttribute('onclick'),
      h.getAttribute('formaction'),
    ]
  })
  comprobarBoton(desc)
  await boton.click()
  guard.comprobar()
}
