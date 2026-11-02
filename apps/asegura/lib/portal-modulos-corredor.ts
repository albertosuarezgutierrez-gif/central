import { IDENTIDAD_CORREDOR_ID } from '@central/module-seguros-portal'

/**
 * Marca exacta de una identidad de vista de corredor POR APERTURA. DUPLICADA de
 * `apps/asegura-portal/lib/vista-corredor-identidad.ts` (`NOMBRE_IDENTIDAD_VISTA`) para no acoplar apps;
 * la iguala el guardián `test/regression-vista-corredor-marca.test.ts`.
 */
export const NOMBRE_IDENTIDAD_VISTA = 'Corredor · Grupo ASegura · vista temporal'

/**
 * ¿Es esta identidad la vista de corredor? La compartida antigua (`IDENTIDAD_CORREDOR_ID`) o una de las nuevas:
 * nombre-marca exacto Y id de un enlace de `portal_vista_corredor` ya gastado (`esVistaGastada`).
 */
export function esIdentidadCorredor(e: { identidadId: string; nombre: string | null; esVistaGastada: boolean }): boolean {
  if (e.identidadId === IDENTIDAD_CORREDOR_ID) return true
  return e.nombre === NOMBRE_IDENTIDAD_VISTA && e.esVistaGastada
}
