/**
 * Enlace de datos «a CIEGAS» (25/10/2026): el que genera el formulario web ANÓNIMO (`creada_por = 'web'`). Quien lo
 * tiene no está verificado (pudo teclear el email de un cliente y su propio móvil), así que PURO y en un solo sitio:
 *   - la página no trae nada relleno de la ficha (`solicitudPorToken`);
 *   - un documento subido NO prueba las contraseñas de la ficha (abrir un PDF protegido del cliente con ellas sería
 *     revelar su contenido a un extraño) NI abre/completa oportunidades: se archiva marcado para revisión.
 */
export const ACTOR_ENLACE_WEB = 'web'

export function enlaceACiegas(creadaPor: string | null | undefined): boolean {
  return creadaPor === ACTOR_ENLACE_WEB
}

export const NOTA_DOC_PENDIENTE_REVISION = '⚠️ PENDIENTE DE REVISIÓN: subido por un enlace del formulario web (quien lo subió no está verificado)'

export type PoliticaDocEnlace = { probarContrasenasFicha: boolean; abrirOportunidad: boolean; notaRevision: string | null }

export function politicaDocEnlace(creadaPor: string | null | undefined): PoliticaDocEnlace {
  return enlaceACiegas(creadaPor)
    ? { probarContrasenasFicha: false, abrirOportunidad: false, notaRevision: NOTA_DOC_PENDIENTE_REVISION }
    : { probarContrasenasFicha: true, abrirOportunidad: true, notaRevision: null }
}
