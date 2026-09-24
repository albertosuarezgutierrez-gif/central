// La «revisión anual» del portal (20/09/2026): UNA vez al año, y solo a quien
// lo pidió, un correo que dice «estos seguros tuyos vencen en los próximos
// meses; si quieres que los revisemos, responde». Es la conversación que una
// correduría tiene con su cliente en persona, hecha para los que no llaman.
//
// Puro, sin BD: quién recibe el correo es una decisión de negocio (y de RGPD)
// y tiene que poder verse fallar con `node --test`. `apps/asegura` la lee de la
// BD y la aplica; aquí solo se decide.
//
// Tres condiciones, y las tres tienen que darse:
//
//   1. **Consentimiento comercial VIGENTE y AFIRMATIVO.** `null` (nunca marcó
//      la casilla, o la marcó sobre un texto ya viejo) NO es un sí: es la
//      diferencia entre un aviso que se pidió y un mailing. Es el mismo valor
//      que devuelve `consentimientoVigente()` para la versión actual del texto.
//   2. **Hace al menos `DIAS_ENTRE_REVISIONES` de la última.** `null` = nunca,
//      y esa sí toca. 330 y no 365 a propósito: el cron corre el día 1 de cada
//      mes, y con 365 exactos la revisión de septiembre de 2027 caería el 1 de
//      octubre, y cada año un mes más tarde.
//   3. **Al menos un vencimiento en los próximos `DIAS_HORIZONTE_REVISION`.**
//      Sin vencimiento cerca no hay nada que revisar, y un correo que no habla
//      de nada concreto es el que se marca como spam. Se cuentan las pólizas de
//      cartera Y las declaradas (las de otras compañías, que son justo las que
//      la correduría podría pasar a llevar).

const MS_DIA = 86_400_000

export const DIAS_ENTRE_REVISIONES = 330
export const DIAS_HORIZONTE_REVISION = 90

function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export type EntradaRevision = {
  /** Lo que devuelve `consentimientoVigente(…, 'comercial', VERSION_TEXTO_COMERCIAL)`. */
  consentimientoComercial: boolean | null
  /** `null` = nunca se le ha mandado. */
  ultimaRevisionEn: Date | null
  /** Vencimientos de TODAS sus pólizas (cartera + declaradas); los `null` ya filtrados fuera. */
  vencimientos: readonly Date[]
}

export type MotivoNoRevision = 'sin_consentimiento' | 'reciente' | 'sin_vencimiento_proximo'

export type DecisionRevision =
  | { toca: true; proximos: Date[] }
  | { toca: false; motivo: MotivoNoRevision }

/**
 * El orden de las comprobaciones importa para el MOTIVO que se cuenta: sin
 * consentimiento no se mira nada más (no es que «no le tocaba», es que no se
 * le puede escribir), y «reciente» va antes que «sin vencimiento» porque a
 * quien ya se le escribió este año no se le vuelve a evaluar.
 */
export function tocaRevisionAnual(e: EntradaRevision, hoy: Date): DecisionRevision {
  if (e.consentimientoComercial !== true) return { toca: false, motivo: 'sin_consentimiento' }

  const h = diaUtc(hoy)
  if (e.ultimaRevisionEn !== null) {
    const dias = Math.floor((h.getTime() - diaUtc(e.ultimaRevisionEn).getTime()) / MS_DIA)
    if (dias < DIAS_ENTRE_REVISIONES) return { toca: false, motivo: 'reciente' }
  }

  const limite = h.getTime() + DIAS_HORIZONTE_REVISION * MS_DIA
  const proximos = e.vencimientos
    .map(diaUtc)
    .filter((v) => v.getTime() >= h.getTime() && v.getTime() <= limite)
    .sort((a, b) => a.getTime() - b.getTime())
  if (proximos.length === 0) return { toca: false, motivo: 'sin_vencimiento_proximo' }

  return { toca: true, proximos }
}
