// Expedientes que se ABREN SOLOS (Alberto, 13/10/2026, decisión 1 de «Mi mesa»). PURO: sin BD ni red
// (`node --test`). La lectura y la escritura viven en `expedientes-auto.ts`.
//
//   · Renovación de CARTERA PROPIA: póliza en vigor (`esCarteraEnVigor`, nunca `clientes.tipo`) cuyo
//     vencimiento REAL (`vencimientoConRecibos`, lo calcula la SQL) cae entre 60 días y el mismo día del
//     vencimiento (`DIAS_PREAVISO_ASEGURADOR`, el aviso de dos meses de la compañía, art. 22 LCS). Alberto
//     (13/10/2026) amplió el 60→30 inicial para no dejar fuera las que ya están a menos de un mes.
//   · Póliza DECLARADA en el portal (de otra compañía): misma ventana; su primera acción sigue la regla
//     única de toda oportunidad (`fechaAvisoOportunidad`, 45 días antes): el expediente se ve desde los
//     60, pero a un seguro que no es nuestro no se le llama antes de tiempo. Su FECHA ÚTIL (el último día en que el
//     tomador puede oponerse a la prórroga) es un mes antes del vencimiento (`DIAS_PREAVISO_TOMADOR`, la misma de
//     `leadDeclarada`) y viaja en el expediente.
//     🚨 GATE LEGAL (Alberto, 27/10/2026): una declarada SOLO se convierte en oportunidad si la persona tiene el
//     consentimiento `comercial` VIGENTE sobre el texto actual (`consentimientoVigente(…, 'comercial',
//     VERSION_TEXTO_COMERCIAL)`). Sin él no se crea nada: la lista de leads (`leads-portal.ts`) sigue igual.
//
// 🚨 Sin duplicar: no se abre si ya hay una oportunidad ABIERTA (aparcadas incluidas) de esa póliza o de
// ese riesgo, ni si ESTE ciclo ya tuvo la suya (aunque se cerrara: si Alberto la dio por perdida el día 50,
// el día 49 no puede volver a nacer). «Ese riesgo» = mismo cliente, mismo ramo y mismo nº de póliza; el
// ramo solo NO basta (el segundo coche de la casa es otro riesgo) y ante la duda se ABRE: un duplicado se
// cierra con un clic, una renovación que no sale en ningún sitio se prorroga sola.

import {
  DIAS_PREAVISO_ASEGURADOR,
  DIAS_PREAVISO_TOMADOR,
  esCarteraEnVigor,
  fechaAvisoOportunidad,
  type EntradaCarteraEnVigor,
} from '@central/module-seguros'
import { RAMOS_POLIZA } from '@central/module-seguros-portal'

/** `info_riesgo.origen` de la renovación de cartera propia abierta sola. */
export const ORIGEN_RENOVACION_CARTERA = 'renovacion_cartera'
/** `info_riesgo.origen` del expediente de una póliza declarada en el portal. */
export const ORIGEN_DECLARADA_PORTAL = 'portal:declarada'

const ISO = /^\d{4}-\d{2}-\d{2}$/

function valida(s: string | null | undefined): string | null {
  if (typeof s !== 'string' || !ISO.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** ¿`dias` hasta el vencimiento cae en la ventana 60→30 (bordes incluidos)? */
export function enVentanaExpediente(dias: number): boolean {
  return Number.isInteger(dias) && dias >= DIAS_PREAVISO_TOMADOR && dias <= DIAS_PREAVISO_ASEGURADOR
}

/**
 * Ventana de la RENOVACIÓN propia (Alberto, 13/10/2026): desde 60 días antes hasta el mismo día del
 * vencimiento. Pasado el mes del tomador (art. 22) ya no puede oponerse a la prórroga, pero la renovación
 * sigue siendo trabajo (revisar precio, coberturas, avisar): no se deja fuera.
 */
export function enVentanaRenovacion(dias: number): boolean {
  return Number.isInteger(dias) && dias >= 0 && dias <= DIAS_PREAVISO_ASEGURADOR
}

export type MotivoNoAbrir =
  | 'no_en_vigor'
  | 'sin_vencimiento'
  | 'fuera_de_ventana'
  | 'tarde'
  | 'ya_abierta'
  | 'ya_tratada_este_ciclo'
  | 'sin_vincular'
  | 'ya_en_cartera'
  /** Declarada sin consentimiento `comercial` vigente (27/10/2026): no se crea oportunidad. */
  | 'sin_consentimiento'

export type DecisionApertura =
  /** `fechaUtil` (solo declaradas): último día útil = vencimiento − `DIAS_PREAVISO_TOMADOR` (art. 22 LCS). */
  | { abrir: true; vence: string; dias: number; fechaAccion: string; texto: string; fechaUtil?: string }
  | { abrir: false; motivo: MotivoNoAbrir; dias: number | null }

// ── Renovación de cartera propia ────────────────────────────────────────────

export type CandidatoRenovacion = EntradaCarteraEnVigor & {
  /** Vencimiento REAL (`vencimientoConRecibos`), `YYYY-MM-DD`. `null` = no consta. */
  vence: string | null
  ramo: string | null
  compania: string | null
  numeroPoliza: string | null
  /** Hay una oportunidad ABIERTA (aparcadas incluidas) de esa póliza o de ese riesgo. */
  yaAbierta: boolean
  /** Ya hubo una renovación abierta sola para esta póliza y ESTE vencimiento (en cualquier estado). */
  yaEsteCiclo: boolean
}

export function decidirRenovacion(c: CandidatoRenovacion, hoy: string): DecisionApertura {
  // Segunda barrera: la SQL ya filtra cartera en vigor; si las dos se separan, aguanta esta.
  if (!esCarteraEnVigor(c)) return { abrir: false, motivo: 'no_en_vigor', dias: null }
  const vence = valida(c.vence)
  if (!vence) return { abrir: false, motivo: 'sin_vencimiento', dias: null }
  const dias = diasEntre(hoy, vence)
  if (!enVentanaRenovacion(dias)) return { abrir: false, motivo: 'fuera_de_ventana', dias }
  if (c.yaEsteCiclo) return { abrir: false, motivo: 'ya_tratada_este_ciclo', dias }
  if (c.yaAbierta) return { abrir: false, motivo: 'ya_abierta', dias }
  const limiteTomador = sumarDias(vence, -DIAS_PREAVISO_TOMADOR)
  const plazoTomador = dias >= DIAS_PREAVISO_TOMADOR
    ? `antes del ${fechaEs(limiteTomador)} (art. 22 LCS: hasta entonces puede no renovar)`
    : `ya (el plazo del art. 22 LCS para no renovar acabó el ${fechaEs(limiteTomador)})`
  const que = [c.ramo ?? 'seguro', c.compania ? `(${c.compania}${c.numeroPoliza ? `, nº ${c.numeroPoliza}` : ''})` : c.numeroPoliza ? `(nº ${c.numeroPoliza})` : null]
    .filter(Boolean).join(' ')
  return {
    abrir: true,
    vence,
    dias,
    fechaAccion: hoy,
    texto: `Renovación de su ${que}: vence el ${fechaEs(vence)}. Revisa precio y coberturas ${plazoTomador}.`,
  }
}

// ── Póliza declarada en el portal ───────────────────────────────────────────

export type CandidatoDeclarada = {
  declaradaId: string
  /** Ficha vinculada (`portal_vinculo`). `null` = sin vínculo: no hay a quién llamar. */
  clienteId: string | null
  vence: string | null
  ramo: string | null
  compania: string | null
  yaAbierta: boolean
  yaEsteCiclo: boolean
  /**
   * Su nº de póliza ya está en la cartera de esta correduría (cualquier ficha: también la de su sociedad).
   * Es NUESTRA: «pásale precio» sería ofrecerle lo que ya se le vendió (la misma regla que `leadDeclarada`).
   */
  yaEnCartera: boolean
  /**
   * Consentimiento `comercial` VIGENTE de quien la declaró, sobre `VERSION_TEXTO_COMERCIAL` (`consentimientoVigente`).
   * Tres estados y SOLO `true` abre: `false` = dijo que no (o lo retiró) · `null` = nunca se le preguntó, o marcó un texto
   * viejo, o no se pudo leer. Ante la duda, no se crea nada.
   */
  consentimientoComercial: boolean | null
}

export function decidirDeclarada(c: CandidatoDeclarada, hoy: string): DecisionApertura {
  // 🚨 Gate legal PRIMERO: sin consentimiento comercial vigente no se mira nada más (ni se cuenta como «tarde»).
  // ⚖️ Interés legítimo (art. 6.1.f) NO se usa como base para esto hasta que lo valide el abogado.
  if (c.consentimientoComercial !== true) return { abrir: false, motivo: 'sin_consentimiento', dias: null }
  const vence = valida(c.vence)
  if (!vence) return { abrir: false, motivo: 'sin_vencimiento', dias: null }
  const dias = diasEntre(hoy, vence)
  if (dias >= 0 && dias < DIAS_PREAVISO_TOMADOR) return { abrir: false, motivo: 'tarde', dias }
  if (!enVentanaExpediente(dias)) return { abrir: false, motivo: 'fuera_de_ventana', dias }
  if (!c.clienteId) return { abrir: false, motivo: 'sin_vincular', dias }
  if (c.yaEnCartera) return { abrir: false, motivo: 'ya_en_cartera', dias }
  if (c.yaEsteCiclo) return { abrir: false, motivo: 'ya_tratada_este_ciclo', dias }
  if (c.yaAbierta) return { abrir: false, motivo: 'ya_abierta', dias }
  const que = [c.ramo ?? 'seguro', c.compania ? `con ${c.compania}` : null].filter(Boolean).join(' ')
  const fechaUtil = sumarDias(vence, -DIAS_PREAVISO_TOMADOR)
  return {
    abrir: true,
    vence,
    dias,
    fechaAccion: fechaAvisoOportunidad(vence, hoy),
    fechaUtil,
    texto: `Declaró en el portal su ${que}, que vence el ${fechaEs(vence)}: pásale precio antes del ${fechaEs(fechaUtil)} (fecha útil: hasta entonces puede no renovar, art. 22 LCS).`,
  }
}

/** Ramo declarado → `tipo_seguro`. Lo que no es un ramo conocido va a `otros` (nunca un cast que tumbe el lote). */
export function tipoDeRamoDeclarado(ramo: string | null): string {
  return ramo && (RAMOS_POLIZA as readonly string[]).includes(ramo) ? ramo : 'otros'
}

// ── Cierre de la renovación ya resuelta ─────────────────────────────────────

/**
 * ¿Se cierra sola (como ganada) una renovación abierta sola? Solo con PRUEBA: el vencimiento real de la
 * póliza ya está más allá del del expediente (renovó: CIMA avanzó la fecha o hay recibo anual cobrado) y
 * sigue en vigor, o la sustituyó otra nuestra. Una cancelada NO se cierra aquí: es una pérdida y se
 * revisa (eventos de cartera). Sin fecha legible, no se toca.
 */
export function renovacionResuelta(e: {
  venceExpediente: string | null
  venceActual: string | null
  enVigor: boolean
  sustituida: boolean
}): 'renovada' | 'sustituida' | null {
  if (e.sustituida) return 'sustituida'
  const antes = valida(e.venceExpediente)
  const ahora = valida(e.venceActual)
  if (!antes || !ahora || !e.enVigor) return null
  return ahora > antes ? 'renovada' : null
}
