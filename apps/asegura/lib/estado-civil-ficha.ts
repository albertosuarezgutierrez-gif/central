// Estado civil que llega al PATCH de la ficha (`/api/operador/cliente`) → el texto que se guarda (20/10/2026).
//
// Lo elige el corredor en el cotizador de plataforma (moto/auto) cuando la ficha no lo traía o no casaba con el
// catálogo de Codeoscopic. Se valida contra ESE MISMO catálogo (`/marital-statuses`, GET gratis y cacheado 24 h) y se
// guarda el NOMBRE de la opción, que es lo que `emparejar` volverá a encontrar al precalificar: así la próxima vez viene
// precargado. Sin catálogo legible no se guarda (no se puede comprobar): 503, y el resto de la ficha no se toca.
// La lectura del catálogo se INYECTA para poder probarlo sin red.
import { estadoCivilDeCatalogo, type OpcionEstadoCivil } from '@central/module-seguros'

export type EstadoCivilParaFicha =
  | { ok: true; valor: undefined }
  /** `catalogo`: con el que se validó (para `estadoCivilSoloSiNoCasa`: no pisar el que ya casa). */
  | { ok: true; valor: string; catalogo: readonly OpcionEstadoCivil[] }
  | { ok: false; status: 422 | 503; estado: 'invalido' | 'catalogo_no_disponible'; motivo: string; campo: 'estadoCivil' }

/** `undefined` en el cuerpo = no se toca (ni se lee el catálogo). Cualquier otra cosa tiene que ser una opción del catálogo. */
export async function estadoCivilParaFicha(
  v: unknown,
  leerCatalogo: () => Promise<readonly OpcionEstadoCivil[] | null>,
): Promise<EstadoCivilParaFicha> {
  if (v === undefined) return { ok: true, valor: undefined }
  if (typeof v !== 'string' || v.trim() === '' || v.length > 120) {
    return { ok: false, status: 422, estado: 'invalido', motivo: 'Estado civil no válido.', campo: 'estadoCivil' }
  }
  const catalogo = await leerCatalogo().catch(() => null)
  if (!catalogo) {
    return {
      ok: false, status: 503, estado: 'catalogo_no_disponible', campo: 'estadoCivil',
      motivo: 'No se ha podido leer el catálogo de estados civiles de Codeoscopic: el estado civil no se guarda sin comprobarlo.',
    }
  }
  const r = estadoCivilDeCatalogo(v, catalogo)
  if (!r.ok) return { ok: false, status: 422, estado: 'invalido', motivo: r.motivo, campo: 'estadoCivil' }
  return { ok: true, valor: r.valor, catalogo }
}
