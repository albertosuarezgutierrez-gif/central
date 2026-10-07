// Occident / Catalana Occidente — Comunidades (07/10/2026). ESQUELETO sobre dos grabaciones parciales:
// la página del SSO (solo el paso del USUARIO) y el portal (el formulario vive en un iframe de OTRO origen, sin
// capturar). Lo que no se ha visto es un HUECO explícito (`ErrorMapaIncompleto`), nunca un selector adivinado.
//
// Reglas para quien toque este fichero:
//   · Pulsar SIEMPRE con `pulsarSeguro` (guarda propia de Occident + `ctx.pulsar`), nunca `locator.click()`.
//   · El robot NO emite: aquí no hay lógica ni selectores para emitir, contratar, formalizar, grabar, firmar ni
//     confirmar nada. La lista de lo prohibido vive en `guarda.ts` (con su test y su cepo).
//   · Credenciales SOLO desde `ctx.credenciales` (fly secrets `CRED_OCCIDENT_PORTAL_USER/PASS`); nunca literales,
//     nunca al log.
//   · Se navega solo por `irA` (lista blanca de hosts + guarda de emisión).
//   · Un dato que el portal exige y el riesgo no trae → `ErrorTarificador('datos', …)`; nunca un valor inventado.

import type { Locator, Page } from 'playwright'
import type { AdaptadorPortal, ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { comprobarDescriptorOccident, comprobarUrlOccident } from './guarda.ts'
import {
  CAMPOS_OCCIDENT,
  RAMO_GCO_COMUNIDADES,
  SEL,
  esUrlFormulario,
  esUrlSso,
  mapaIncompleto,
  selObligatorio,
  urlEntradaPortal,
  urlFormularioTomador,
} from './mapa.ts'

/** Navegación con lista blanca + guarda de emisión. Un 5xx es pasajero (`portal` transitorio: el runner reintenta una vez). */
async function irA(page: Page, url: string): Promise<void> {
  comprobarUrlOccident(url)
  const r = await page.goto(url, { waitUntil: 'domcontentloaded' })
  const st = r?.status() ?? 0
  if (st >= 500) throw new ErrorTarificador('portal', `occident/comunidades: el portal respondió ${st}`, { transitorio: true })
}

/** Pulsa SOLO si el elemento (texto, ids, href, onclick…) pasa la guarda de Occident; después, `ctx.pulsar` (guarda común). */
async function pulsarSeguro(ctx: ContextoPortal, boton: Locator): Promise<void> {
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
  comprobarDescriptorOccident(desc)
  await ctx.pulsar(boton)
}

const FALTA_CONTRASENA = 'el paso de contraseña del SSO (campo y botón de envío: solo se grabó el paso del usuario)'
const FALTA_FORMULARIO = 'el formulario del iframe (catalanaaplicaciones.gco.global …ProyectoTomador: grabación de ese marco)'

/**
 * Login SSO en dos pasos: usuario → contraseña. Sin el paso 2 grabado FALLA ANTES de tocar el portal (no se abre
 * sesión ni se envía nada a medias: repetir logins rechazados es como se bloquea una cuenta).
 */
export async function login(page: Page, ctx: ContextoPortal): Promise<void> {
  const selContrasena = selObligatorio(SEL.ssoContrasena, FALTA_CONTRASENA)
  const selEnviar = selObligatorio(SEL.ssoEnviarContrasena, FALTA_CONTRASENA)
  await irA(page, urlEntradaPortal())
  await ctx.exigirSinCaptcha()
  if (esUrlSso(page.url())) {
    await page.locator(SEL.ssoUsuario).fill(ctx.credenciales.usuario)
    await ctx.pausa()
    await pulsarSeguro(ctx, page.locator(SEL.ssoEnviarUsuario))
    await ctx.exigirSinCaptcha()
    await page.locator(selContrasena).fill(ctx.credenciales.contrasena)
    await ctx.pausa()
    await pulsarSeguro(ctx, page.locator(selEnviar))
    await ctx.exigirSinCaptcha()
  }
  // Logueado = cabecera del portal visible. Si no aparece no se reintenta el login.
  try {
    await page.locator(SEL.portalCabecera).first().waitFor({ state: 'visible', timeout: 25_000 })
  } catch {
    const rechazo = await page.locator(SEL.ssoMensajeError).count().catch(() => 0)
    throw new ErrorTarificador('credenciales', `occident/comunidades: no se llegó al portal tras el login (${rechazo > 0 ? 'el SSO rechazó los datos' : 'sin cabecera del portal'})`)
  }
  ctx.log('login ok')
}

/** ramoGco que declara el iframe del portal (solo dígitos) o el de comunidades por defecto. */
export function ramoDelIframe(src: string | null | undefined, base: string): string {
  try {
    const r = new URL(src ?? '', base).searchParams.get('ramoGco')
    return r && /^\d{3,8}$/.test(r) ? r : RAMO_GCO_COMUNIDADES
  } catch {
    return RAMO_GCO_COMUNIDADES
  }
}

/** Portal → ruta de Comunidades → URL del iframe → se abre en el propio contexto (la sesión SSO se comparte por cookies). */
async function abrirFormulario(page: Page, ctx: ContextoPortal): Promise<void> {
  await irA(page, urlEntradaPortal())
  await ctx.exigirSinCaptcha()
  const marco = page.locator(SEL.iframeFormulario).first()
  await marco.waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {
    throw new ErrorTarificador('portal', 'occident/comunidades: el portal no cargó el iframe de tarificación')
  })
  const ramo = ramoDelIframe(await marco.getAttribute('src'), page.url())
  await ctx.pausa()
  await irA(page, urlFormularioTomador(ramo))
  await ctx.exigirSinCaptcha()
  if (esUrlSso(page.url())) {
    throw new ErrorTarificador('portal', 'occident/comunidades: al abrir el formulario por su cuenta el SSO pide login otra vez (la sesión no se hereda; hace falta cargarlo dentro del portal)')
  }
  if (!esUrlFormulario(page.url())) {
    throw new ErrorTarificador('portal', 'occident/comunidades: la URL del formulario no cargó la aplicación de tarificación')
  }
  ctx.log('formulario de tarificación abierto')
}

/** HUECO: rellenar el formulario, calcular y leer la prima. Falta la grabación del iframe. */
async function rellenarYLeerPrima(ctx: ContextoPortal): Promise<never> {
  ctx.log(`canónico previsto: ${CAMPOS_OCCIDENT.length} campos, ninguno con etiqueta del portal conocida`)
  throw mapaIncompleto(FALTA_FORMULARIO)
}

export const occidentComunidades: AdaptadorPortal = {
  compania: 'occident',
  ramo: 'comunidades',
  credencial: 'OCCIDENT_PORTAL',
  async tarificar(page, _riesgo, ctx) {
    await login(page, ctx)
    await ctx.trasLogin()
    await abrirFormulario(page, ctx)
    return rellenarYLeerPrima(ctx)
  },
}
