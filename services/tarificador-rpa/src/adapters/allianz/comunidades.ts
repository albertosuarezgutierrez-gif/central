// Allianz ePAC — Comunidades (05/10/2026). ESQUELETO a la espera de capturas del formulario.
//
// Autorizado por Alberto el 05/10/2026, SIN confirmación escrita de Allianz
// (`seguros.companias_integracion`, modo rpa_autorizada). Ritmo humano: una sesión a la vez con esta
// credencial (max_concurrencia 1) y `ctx.pausa()` entre pasos.
//
// Reglas para quien complete los TODO:
//   · Pulsar SIEMPRE con `ctx.pulsar(locator)`, nunca `locator.click()` (lo vigila el guardián de la raíz).
//     Los campos se rellenan con `fill`/`selectOption`/`check`, no pulsando botones.
//   · Tras el login y tras enviar el formulario: `await ctx.exigirSinCaptcha()`.
//   · Nada de emitir: el flujo acaba al LEER el precio y descargar el PDF del proyecto/oferta. Si el
//     portal solo ofrece «Contratar»/«Emitir» como siguiente paso, se para ahí.
//   · Sin credenciales en logs: `ctx.log()` ya redacta, pero no se pasan a ningún mensaje.
//   · Un dato del riesgo que el portal exige y no tenemos (`null`) → `ErrorTarificador('datos', …)`,
//     NUNCA se inventa un valor por defecto.

import type { Page } from 'playwright'
import type { OfertaNormalizada, RiesgoComunidad } from '@central/module-tarificacion'
import type { AdaptadorPortal, ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'

/**
 * Selectores y URLs del portal. `null` = PENDIENTE DE CAPTURAS: el adaptador falla en ese paso con
 * `portal` (error_definitivo, no se reintenta) en vez de adivinar.
 */
const SEL = {
  // TODO(capturas): URL de entrada de ePAC (la que usa el corredor, no la pública de clientes).
  urlLogin: null as string | null,
  // TODO(capturas): campos y botón del formulario de acceso.
  usuario: null as string | null,
  contrasena: null as string | null,
  botonEntrar: null as string | null,
  // TODO(capturas): algo que SOLO existe tras un login correcto (menú, nombre del mediador…).
  marcaLogueado: null as string | null,
  // TODO(capturas): mensaje de credenciales rechazadas (→ ErrorTarificador('credenciales')).
  errorLogin: null as string | null,
  // TODO(capturas): ruta de menú hasta «Tarificador / Nuevo proyecto → Comunidades».
  menuTarificador: null as string | null,
  opcionComunidades: null as string | null,
  // TODO(capturas): campos del riesgo (ver `rellenarRiesgo`).
  via: null as string | null,
  numero: null as string | null,
  codigoPostal: null as string | null,
  anioConstruccion: null as string | null,
  m2Construidos: null as string | null,
  numViviendas: null as string | null,
  numLocales: null as string | null,
  plantas: null as string | null,
  ascensor: null as string | null,
  capitalContinente: null as string | null,
  capitalContenido: null as string | null,
  fechaEfecto: null as string | null,
  // TODO(capturas): botón que CALCULA el precio (no el que guarda/contrata).
  botonCalcular: null as string | null,
  // TODO(capturas): bloque de resultados (una fila/tarjeta por modalidad), prima, coberturas, franquicias.
  resultados: null as string | null,
  prima: null as string | null,
  producto: null as string | null,
  coberturas: null as string | null,
  franquicias: null as string | null,
  referencia: null as string | null,
  // TODO(capturas): enlace/botón de descarga del PDF del PROYECTO (nunca el de la póliza).
  descargarPdf: null as string | null,
}

function sel(clave: keyof typeof SEL): string {
  const s = SEL[clave]
  if (!s) throw new ErrorTarificador('portal', `allianz/comunidades: selector «${clave}» pendiente de capturas`)
  return s
}

async function login(page: Page, ctx: ContextoPortal): Promise<void> {
  await page.goto(sel('urlLogin'))
  await ctx.exigirSinCaptcha()
  await page.locator(sel('usuario')).fill(ctx.credenciales.usuario)
  await ctx.pausa()
  await page.locator(sel('contrasena')).fill(ctx.credenciales.contrasena)
  await ctx.pausa()
  await ctx.pulsar(page.locator(sel('botonEntrar')))
  await ctx.exigirSinCaptcha()
  const ok = page.locator(sel('marcaLogueado'))
  const ko = page.locator(sel('errorLogin'))
  await Promise.race([ok.waitFor(), ko.waitFor()])
  if (await ko.isVisible().catch(() => false)) {
    // UN intento: repetir un login rechazado es como se bloquea una cuenta.
    throw new ErrorTarificador('credenciales', 'allianz/comunidades: el portal rechaza las credenciales')
  }
  ctx.log('login ok')
}

async function abrirTarificador(page: Page, ctx: ContextoPortal): Promise<void> {
  await ctx.pulsar(page.locator(sel('menuTarificador')))
  await ctx.pausa()
  await ctx.pulsar(page.locator(sel('opcionComunidades')))
  await ctx.pausa()
}

/** Exige el dato: si el portal lo pide y no lo tenemos, NO se inventa. */
function dato<T>(v: T | null | undefined, campo: string): T {
  if (v === null || v === undefined) throw new ErrorTarificador('datos', `allianz/comunidades: el portal exige «${campo}» y el riesgo no lo trae`)
  return v
}

async function rellenarRiesgo(page: Page, r: RiesgoComunidad, ctx: ContextoPortal): Promise<void> {
  // TODO(capturas): confirmar qué campos son obligatorios en ePAC y su formato (¿m² con decimales?
  // ¿capitales con puntos?, ¿ascensor es check o select?). Lo que no exija, no se rellena.
  await page.locator(sel('via')).fill(r.direccion.via)
  if (r.direccion.numero) await page.locator(sel('numero')).fill(r.direccion.numero)
  await page.locator(sel('codigoPostal')).fill(r.direccion.codigoPostal)
  await page.locator(sel('anioConstruccion')).fill(String(dato(r.anioConstruccion, 'año de construcción')))
  await page.locator(sel('m2Construidos')).fill(String(dato(r.m2Construidos, 'm² construidos')))
  await page.locator(sel('numViviendas')).fill(String(dato(r.numViviendas, 'nº de viviendas')))
  await page.locator(sel('numLocales')).fill(String(dato(r.numLocales, 'nº de locales')))
  await page.locator(sel('plantas')).fill(String(dato(r.plantas, 'plantas')))
  await page.locator(sel('ascensor')).setChecked(dato(r.ascensor, 'ascensor'))
  if (r.capitalContinente !== null) await page.locator(sel('capitalContinente')).fill(String(r.capitalContinente))
  if (r.capitalContenido !== null) await page.locator(sel('capitalContenido')).fill(String(r.capitalContenido))
  if (r.fechaEfecto) await page.locator(sel('fechaEfecto')).fill(r.fechaEfecto)
  await ctx.pausa()
}

async function calcular(page: Page, ctx: ContextoPortal): Promise<void> {
  await ctx.pulsar(page.locator(sel('botonCalcular')))
  await ctx.exigirSinCaptcha()
  await page.locator(sel('resultados')).first().waitFor()
}

/** Importe español («1.234,56 €») → número. `null` si no se puede leer (nunca 0). */
export function importeEs(texto: string | null | undefined): number | null {
  if (!texto) return null
  const limpio = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(limpio)
  return Number.isFinite(n) && limpio !== '' ? n : null
}

async function leerOfertas(page: Page, ctx: ContextoPortal): Promise<OfertaNormalizada[]> {
  // TODO(capturas): recorrer cada modalidad del bloque de resultados y leer prima, coberturas y
  // franquicias; descargar el PDF del proyecto con `page.waitForEvent('download')` + `ctx.pulsar(...)`
  // y registrarlo con `ctx.adjuntarPdf(nombre, bytes)`.
  const filas = page.locator(sel('resultados'))
  const n = await filas.count()
  const ofertas: OfertaNormalizada[] = []
  for (let i = 0; i < n; i++) {
    const f = filas.nth(i)
    const prima = importeEs(await f.locator(sel('prima')).innerText())
    if (prima === null) {
      ctx.log(`fila ${i} sin prima legible: se omite`)
      continue
    }
    ofertas.push({
      compania: 'Allianz',
      producto: (await f.locator(sel('producto')).innerText()).trim(),
      primaAnualEur: prima,
      primaNetaEur: null,
      fraccionamiento: null,
      importeReciboEur: null,
      coberturas: [], // TODO(capturas)
      franquicias: [], // TODO(capturas)
      validaHasta: null,
      referenciaPortal: null, // TODO(capturas): sel('referencia')
      pdf: null, // TODO(capturas): sel('descargarPdf')
      avisos: ['Coberturas y franquicias aún sin leer del portal (adaptador en esqueleto)'],
    })
  }
  if (!ofertas.length) throw new ErrorTarificador('portal', 'allianz/comunidades: el portal no devolvió ninguna prima legible')
  return ofertas
}

export const allianzComunidades: AdaptadorPortal = {
  compania: 'allianz',
  ramo: 'comunidades',
  credencial: 'ALLIANZ_EPAC',
  async tarificar(page, riesgo, ctx) {
    await login(page, ctx)
    await ctx.trasLogin()
    await abrirTarificador(page, ctx)
    await rellenarRiesgo(page, riesgo, ctx)
    await calcular(page, ctx)
    return { ofertas: await leerOfertas(page, ctx) }
  },
}
