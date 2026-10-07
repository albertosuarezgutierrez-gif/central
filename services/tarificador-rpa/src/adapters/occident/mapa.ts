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
  constructor(falta: string) {
    super('portal', `occident/comunidades: mapa incompleto: falta ${falta}`)
    this.name = 'ErrorMapaIncompleto'
    this.falta = falta
  }
}

export function mapaIncompleto(falta: string): ErrorMapaIncompleto {
  return new ErrorMapaIncompleto(falta)
}

/** Selector pendiente → error de mapa incompleto en vez de adivinar. */
export function selObligatorio(sel: string | null, falta: string): string {
  if (!sel) throw mapaIncompleto(falta)
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
