// Mapa PURO de Occident / Catalana Occidente · Comunidades (grabaciones del 07/10/2026). Sin Playwright.
// Fuente: scratchpad mapa-occident (mapa.json). Todo lo que NO se ha visto va marcado como hueco.

import type { RiesgoComunidad } from '@central/module-tarificacion'
import { ErrorTarificador } from '../../errores.ts'
import { comprobarUrlOccident } from './guarda.ts'

export const HOST_PORTAL = 'portaloccident.gco.global'
export const HOST_SSO = 'ssoaut.gco.global'
export const HOST_APLICACIONES = 'catalanaaplicaciones.gco.global'

/** Ruta SPA del portal donde estaba la grabación (Productos › Multirriesgos › Comunidades › Tarificación). */
export const RUTA_TARIFICACION_COMUNIDADES = '/productos/multirriesgos/comunidades/tarificacion'
/** Código de ramo de GCO en la URL del iframe (grabado: único parámetro, sin tokens). */
export const RAMO_GCO_COMUNIDADES = '90690'
export const RUTA_FORMULARIO_TOMADOR = '/FE/SGE.Tarifa.Generico.FE.ProyectoTomador/'

/** Selectores VISTOS en las capturas. `null` = no capturado: el paso falla con `mapaIncompleto`, no se adivina. */
export const SEL = {
  // SSO (F5 APM), paso 1 — capturado.
  ssoUsuario: '#usernamegco',
  ssoEnviarUsuario: '#SubmitCreds',
  ssoMensajeError: '.msg-error-datos:not(.hide), #err-password:not(.hide), #empty-password:not(.hide)',
  // SSO, paso 2 (contraseña) — NO capturado.
  ssoContrasena: null as string | null,
  ssoEnviarContrasena: null as string | null,
  // Portal (React/MUI) — capturado.
  portalCabecera: 'header.MuiAppBar-root',
  iframeFormulario: 'iframe.site-layout-content-iframe',
}

/** Error tipado del hueco: falta una grabación. `portal` = definitivo (no se reintenta). */
export class ErrorMapaIncompleto extends ErrorTarificador {
  readonly falta: string
  constructor(falta: string, adaptador: string = 'occident/comunidades') {
    super('portal', `${adaptador}: mapa incompleto: falta ${falta}`)
    this.name = 'ErrorMapaIncompleto'
    this.falta = falta
  }
}

export function mapaIncompleto(falta: string, adaptador?: string): ErrorMapaIncompleto {
  return new ErrorMapaIncompleto(falta, adaptador)
}

/** Selector pendiente → error de mapa incompleto en vez de adivinar. */
export function selObligatorio(sel: string | null, falta: string, adaptador?: string): string {
  if (!sel) throw mapaIncompleto(falta, adaptador)
  return sel
}

/** URL de entrada: la ruta del portal con sesión; sin sesión el portal manda al SSO (NO verificado: ver informe). */
export function urlEntradaPortal(ruta: string = RUTA_TARIFICACION_COMUNIDADES): string {
  return comprobarUrlOccident(`https://${HOST_PORTAL}${ruta}`).toString()
}

/**
 * URL del iframe del formulario (la que se abre en el propio contexto). `ramoGco` solo dígitos: nada que venga del
 * riesgo ni del portal entra aquí. Pasa por la lista blanca y el guard de emisión antes de devolverse.
 */
export function urlFormularioTomador(ramoGco: string = RAMO_GCO_COMUNIDADES): string {
  if (!/^\d{3,8}$/.test(ramoGco)) throw new ErrorTarificador('datos', 'occident/comunidades: ramoGco no válido (solo dígitos)')
  const u = new URL(`https://${HOST_APLICACIONES}${RUTA_FORMULARIO_TOMADOR}`)
  u.searchParams.set('ramoGco', ramoGco)
  return comprobarUrlOccident(u.toString()).toString()
}

/** ¿La URL es una página del SSO (sin sesión / sesión caducada)? */
export function esUrlSso(url: string): boolean {
  try {
    return new URL(url).hostname === HOST_SSO
  } catch {
    return false
  }
}

/** ¿La URL es la del formulario de tarificación (host + ruta, sin mirar parámetros)? */
export function esUrlFormulario(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname === HOST_APLICACIONES && u.pathname === RUTA_FORMULARIO_TOMADOR
  } catch {
    return false
  }
}

// ─────────── canónico de comunidades → formulario de Occident (HIPÓTESIS hasta ver el iframe) ───────────

export type UsoCampo = 'seguro' | 'probable' | 'dudoso'

export type CampoMapeado = {
  /** Clave de `RiesgoComunidad`. */
  canonico: keyof RiesgoComunidad | 'direccion.codigoPostal' | 'direccion.municipio' | 'direccion.provincia'
  /** Confianza en que el formulario de Occident lo pida (ninguno está visto: el iframe no está capturado). */
  uso: UsoCampo
  /** Etiqueta del portal. `null` = no se conoce (hueco de grabación). */
  etiquetaPortal: string | null
  nota: string
}

export const CAMPOS_OCCIDENT: readonly CampoMapeado[] = [
  { canonico: 'direccion.codigoPostal', uso: 'probable', etiquetaPortal: null, nota: 'el riesgo se localiza por dirección/C.P.' },
  { canonico: 'direccion.municipio', uso: 'probable', etiquetaPortal: null, nota: 'desambigua población del C.P.' },
  { canonico: 'direccion.provincia', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'referenciaCatastral', uso: 'dudoso', etiquetaPortal: null, nota: 'algunas tarifas la usan para autocompletar' },
  { canonico: 'documentoIdentidad', uso: 'probable', etiquetaPortal: null, nota: 'el recurso se llama «ProyectoTomador»: probablemente pide el tomador' },
  { canonico: 'fechaEfecto', uso: 'seguro', etiquetaPortal: null, nota: 'toda tarifa pide fecha de efecto' },
  { canonico: 'fechaTermino', uso: 'dudoso', etiquetaPortal: null, nota: 'puede derivarse de la duración' },
  { canonico: 'm2Construidos', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'anioConstruccion', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'anioRehabilitacion', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'plantas', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'plantasBajoRasante', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'sotanos', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'numEdificios', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'numViviendasYLocales', uso: 'probable', etiquetaPortal: null, nota: 'Occident puede separarlas: entonces numViviendas y numLocales' },
  { canonico: 'numViviendas', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'numLocales', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'numGarajes', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'ascensor', uso: 'probable', etiquetaPortal: null, nota: 'null = no se pregunta (nunca false por defecto)' },
  { canonico: 'piscina', uso: 'probable', etiquetaPortal: null, nota: 'idem' },
  { canonico: 'zonasAjardinadas', uso: 'dudoso', etiquetaPortal: null, nota: 'idem' },
  { canonico: 'calidadConstruccion', uso: 'dudoso', etiquetaPortal: null, nota: 'equivalencia normal/alta/lujo con el desplegable: sin ver' },
  { canonico: 'capitalContinente', uso: 'seguro', etiquetaPortal: null, nota: 'capital asegurado del edificio' },
  { canonico: 'capitalContenido', uso: 'dudoso', etiquetaPortal: null, nota: '' },
  { canonico: 'siniestrosUltimos3Anios', uso: 'probable', etiquetaPortal: null, nota: '' },
  { canonico: 'companiaActual', uso: 'dudoso', etiquetaPortal: null, nota: '' },
]

// ─────────── HOGAR (capturas de Alberto, 14/10/2026) ───────────
// Visto: menú superior del portal «Productos» › «Análisis de necesidades» › «Hogar» › «Tarificación» (submenús en
// cascada, cada ítem con una estrella de favorito al lado: NO se pulsa). «Tarificación» NAVEGA DENTRO del portal a
// `RUTA_TARIFICACION_HOGAR` (NO abre pestaña nueva: corrección del 14/10). El formulario va casi seguro en
// `iframe.site-layout-content-iframe` de catalanaaplicaciones, como Comunidades (HIPÓTESIS hasta ver el DOM): si el iframe
// no aparece → hueco; si su `src` cae fuera de la lista blanca de `guarda.ts` → error tipado (no se amplía la lista).

/** Ruta SPA vista en la captura (Productos › Análisis de necesidades › Hogar › Tarificación). */
export const RUTA_TARIFICACION_HOGAR = '/productos/multirriesgos/hogar/tarificacion'
/** ramoGco del iframe de hogar: DESCONOCIDO (no se ha visto su `src`). `null` = hueco; se lee del `src` real si aparece. */
export const RAMO_GCO_HOGAR: string | null = null
/** Ruta de menú VISTA, en orden. Etiquetas EXACTAS del portal (el casado ignora mayúsculas/espacios, nunca «contiene»). */
export const RUTA_MENU_HOGAR = ['Productos', 'Análisis de necesidades', 'Hogar', 'Tarificación'] as const
/** Ítem cuyo submenú contiene «Hogar» (otros submenús también lo traen): «Hogar» se busca SOLO dentro de este. */
export const MENU_PADRE_HOGAR = 'Análisis de necesidades'

/** Hueco del formulario (lo que haya tras el modal de situación y el paso 2 salvo lo visto). */
export const FALTA_FORMULARIO_HOGAR = 'formulario hogar: falta grabación'
export const FALTA_CONTRASENA_HOGAR = 'el paso de contraseña del SSO (solo se grabó el paso del usuario)'
export const ADAPTADOR_HOGAR = 'occident/hogar'

/**
 * SSO paso 2 — HIPÓTESIS (sin captura; no se inventan ids): el campo de contraseña visible y el submit del MISMO formulario.
 * Se usa solo en Hogar; Comunidades sigue con el hueco (`SEL.ssoContrasena = null`).
 */
export const SEL_HIPOTESIS_SSO_CONTRASENA = 'input[type="password"]'
export const SEL_HIPOTESIS_SSO_ENVIAR = 'form:has(input[type="password"]) :is(button[type="submit"], input[type="submit"])'

export function huecoHogar(falta: string): ErrorMapaIncompleto {
  return mapaIncompleto(falta, ADAPTADOR_HOGAR)
}

/** `^\s*texto\s*$` insensible a mayúsculas y a espacios entre palabras; nunca «contiene». Las tildes cuentan. */
export function etiquetaExactaOccident(t: string): RegExp {
  const palabras = t.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^\\s*${palabras.join('\\s+')}\\s*$`, 'i')
}

/** ¿El descriptor (aria-label, title, id, clase, data-testid…) es el de la ESTRELLA de favorito? Nunca se pulsa. */
export function esEstrellaFavorito(descriptor: readonly (string | null | undefined)[]): boolean {
  return descriptor.some((d) => typeof d === 'string' && /favorit|estrella|star(?!t)|bookmark/i.test(d.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
}

/**
 * Tras pulsar «Tarificación»: la URL del portal tiene que ser el host del portal (https, lista blanca, sin patrón de
 * emisión) y la ruta de hogar. Otra cosa → `ErrorTarificador('portal')` (el SSO = sesión no heredada).
 */
export function comprobarDestinoHogar(url: string): URL {
  const u = comprobarUrlOccident(url)
  if (u.hostname === HOST_SSO) throw new ErrorTarificador('portal', 'occident/hogar: el portal mandó al SSO (sesión no heredada)')
  if (u.hostname !== HOST_PORTAL || u.pathname.replace(/\/+$/, '') !== RUTA_TARIFICACION_HOGAR) {
    throw new ErrorTarificador('portal', `occident/hogar: «Tarificación» no llevó a la ruta de hogar (${u.hostname}${u.pathname})`)
  }
  return u
}

/**
 * `src` del iframe del formulario (relativo o absoluto): host en la lista blanca y sin emisión. Fuera → error tipado;
 * el iframe NO se toca. El host de hogar NO está visto: no se añade a ciegas, se comprueba contra lo que ya hay.
 */
export function comprobarSrcIframeHogar(src: string | null | undefined, base: string): URL {
  let u: URL
  try {
    u = new URL(src ?? '', base)
  } catch {
    throw new ErrorTarificador('portal', 'occident/hogar: el iframe del formulario no tiene un src válido')
  }
  return comprobarUrlOccident(u.toString())
}

// ─────────── formulario de hogar VISTO (etiquetas exactas de la captura) ───────────

export const ETIQUETAS_HOGAR = Object.freeze({
  persona: 'Persona:',
  personaFisica: 'Física',
  personaJuridica: 'Jurídica',
  tipoDocumento: 'NIF (DNI, CIF, NIE)',
  documento: 'Nº documento tomador:',
  fechaNacimiento: 'Fecha de nacimiento:',
  codigoPostalTomador: 'Código postal:',
  tipoVivienda: 'Tipo de vivienda:',
  fechaEfecto: 'Fecha de efecto:',
  codigoAgente: 'Código del agente:',
  // Modal «Datos de la situación».
  busquedaDireccion: 'Dirección',
  codigoPostalSituacion: 'Código postal:*',
  nombreVia: 'Nombre de la vía:*',
  numero: 'Número:',
  planta: 'Planta:',
  puerta: 'Puerta:',
})
/** Secciones vistas del paso 1 «Datos del riesgo». */
export const SECCIONES_HOGAR = ['Datos del mediador', 'Datos del tomador', 'Tipología', 'Situación', 'Datos de contratación'] as const
/** Marca del paso 2: si no aparece tras avanzar, se para. */
export const TITULO_PASO2_HOGAR = 'Opciones de cotización'
/** Las 4 tarjetas de producto del paso 2 (nombre EXACTO) con su prima anual. */
export const PRODUCTOS_HOGAR = ['HOGAR ESTÁNDAR', 'HOGAR CONFORT', 'HOGAR ÓPTIMA', 'PERSONALIZADA'] as const
/** Botones del paso 2 que NO se pulsan: «Recalcular», «Modificar», el disquete de guardar, los checkboxes de coberturas. */
export const BOTON_IMPRIMIR_HOGAR = 'Imprimir'
