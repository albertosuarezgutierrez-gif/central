// Formador / acompañante del tarificador RPA (06/10/2026): reglas PURAS compartidas por el worker
// (services/tarificador-rpa/src/formador.ts) y el orquestador (apps/asegura, rutas /api/tarificador/formador/*).
//
//   · `limpiarTextoAviso`: lo que el worker le enseña a la IA de un aviso/alerta/modal del portal pasa
//     por el redactor de credenciales Y por aquí (DNI/NIE/CIF, correo, teléfono, IBAN, matrícula,
//     tiradas largas de cifras). Fail-closed: ante la duda, se tapa.
//   · `coherenciaPrecio`: comprobación DETERMINISTA de lo leído en la pantalla de resultado (prima neta +
//     impuestos ≈ total, total positivo, modalidad la pedida). La IA puede explicar; NO decide un precio.
//   · `siguienteAcompanamiento`: el contador del modo acompañado (activo hasta N éxitos seguidos sin IA;
//     un fallo lo reactiva).

import type { ModalidadPortal } from './tipos.ts'

export const MARCA_DATO_PERSONAL = '[DATO]'

/** Exportada para el GRABADOR (07/10/2026): el bookmarklet lleva estos mismos patrones al navegador. */
export const PATRONES_PERSONALES: readonly RegExp[] = [
  // IBAN español (y cualquiera con forma de IBAN), con o sin espacios.
  /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){3,7}(?:[\s-]?[A-Z0-9]{1,4})?\b/gi,
  // Correo.
  // (?<!…): solo arranca al principio de la tirada; sin él, una tirada larga sin «@» es cuadrática (100 KB ≈ 15 s).
  /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  // DNI / NIE / CIF.
  /\b\d{8}[\s-]?[A-Z]\b/gi,
  /\b[XYZ][\s-]?\d{7}[\s-]?[A-Z]\b/gi,
  /\b[ABCDEFGHJNPQRSUVW][\s-]?\d{7}[\s-]?[0-9A-J]\b/gi,
  // Teléfono español (9 cifras empezando por 6-9, con prefijo opcional y separadores).
  /(?:\+?34[\s-]?)?\b[6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
  // Matrícula (0000 BBB).
  /\b\d{4}[\s-]?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/gi,
  // Cualquier otra tirada de 7+ cifras (cuentas, pólizas, referencias catastrales numéricas).
  /\d[\d\s.-]{5,}\d/g,
]

/** Tapa datos personales reconocibles. Puro: no conoce secretos (eso lo hace `crearRedactor`). */
export function redactarDatosPersonales(texto: string): string {
  let out = String(texto)
  for (const p of PATRONES_PERSONALES) out = out.replace(p, (m) => (/\d/.test(m) || m.includes('@') ? MARCA_DATO_PERSONAL : m))
  return out
}

/**
 * Texto de un aviso del portal listo para salir del worker: credenciales fuera (`redactarSecretos`,
 * el redactor del worker), datos personales fuera, espacios colapsados y recortado a `max`.
 * Vacío o no-string → `null` (no se manda nada).
 */
export function limpiarTextoAviso(texto: unknown, redactarSecretos: (t: string) => string = (t) => t, max = 300): string | null {
  if (typeof texto !== 'string') return null
  const plano = texto.replace(/\s+/g, ' ').trim()
  if (!plano) return null
  const limpio = redactarDatosPersonales(redactarSecretos(plano))
  return limpio.length > max ? limpio.slice(0, max - 1) + '…' : limpio
}

// ─── Coherencia del precio leído ─────────────────────────────────────────────

export type ValoresLeidos = {
  primaNetaEur?: number | null
  impuestosEur?: number | null
  primaTotalEur?: number | null
  /** Modalidad que el portal dice tener seleccionada al leer (si se pudo leer). */
  modalidad?: ModalidadPortal | null
}

export type IncidenciaPrecio = { codigo: 'sin_total' | 'total_no_positivo' | 'negativo' | 'descuadre' | 'impuestos_altos' | 'modalidad_distinta' | 'sin_desglose'; mensaje: string; bloqueante: boolean }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const eurEs = (n: number): string => {
  const [ent, dec] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}€`
}

/**
 * Determinista. Tolerancia del cuadre: el mayor de 0,05 € y el 0,2 % del total (redondeos del portal).
 * Bloqueante = el precio no puede ir a un cliente tal cual (sin total, total ≤ 0, negativo, descuadre,
 * otra modalidad). `impuestos_altos` (impuestos > 30 % de la neta) y `sin_desglose` solo avisan.
 */
export function coherenciaPrecio(v: ValoresLeidos, modalidadPedida: ModalidadPortal | null): IncidenciaPrecio[] {
  const out: IncidenciaPrecio[] = []
  const neta = num(v.primaNetaEur)
  const imp = num(v.impuestosEur)
  const total = num(v.primaTotalEur)
  if (total === null) out.push({ codigo: 'sin_total', mensaje: 'No se ha podido leer la prima total de la pantalla de resultado.', bloqueante: true })
  else if (total <= 0) out.push({ codigo: 'total_no_positivo', mensaje: `La prima total leída (${eurEs(total)}) no es positiva.`, bloqueante: true })
  for (const [n, nombre] of [[neta, 'prima neta'], [imp, 'impuestos']] as const) {
    if (n !== null && n < 0) out.push({ codigo: 'negativo', mensaje: `La ${nombre} leída es negativa (${eurEs(n)}).`, bloqueante: true })
  }
  if (neta === null || imp === null) {
    out.push({ codigo: 'sin_desglose', mensaje: 'El portal no separa prima neta e impuestos: no se ha podido cuadrar el total.', bloqueante: false })
  } else if (total !== null && total > 0) {
    const diferencia = Math.abs(neta + imp - total)
    const tolerancia = Math.max(0.05, total * 0.002)
    if (diferencia > tolerancia) {
      out.push({ codigo: 'descuadre', mensaje: `Prima neta ${eurEs(neta)} + impuestos ${eurEs(imp)} = ${eurEs(neta + imp)}, pero el total leído es ${eurEs(total)} (diferencia ${eurEs(diferencia)}).`, bloqueante: true })
    }
    if (neta > 0 && imp > neta * 0.3) {
      out.push({ codigo: 'impuestos_altos', mensaje: `Los impuestos (${eurEs(imp)}) superan el 30 % de la prima neta (${eurEs(neta)}): revisar.`, bloqueante: false })
    }
  }
  if (modalidadPedida && v.modalidad && v.modalidad !== modalidadPedida) {
    out.push({ codigo: 'modalidad_distinta', mensaje: `Se pidió la modalidad «${modalidadPedida}» y el portal muestra «${v.modalidad}».`, bloqueante: true })
  }
  return out
}

// ─── Modo acompañado ─────────────────────────────────────────────────────────

export type EstadoAcompanamiento = { activo: boolean; exitosSeguidos: number; umbral: number }
/** `exito_sin_ia`: cotizó sin que la IA señalara nada ni hubiera aviso bloqueante. */
export type EventoAcompanamiento = 'exito_sin_ia' | 'exito_con_ia' | 'fallo'

export const UMBRAL_ACOMPANAMIENTO = 10

/** Sin fila = acompañado desde cero (compañía/ramo nueva). */
export function acompanamientoInicial(umbral = UMBRAL_ACOMPANAMIENTO): EstadoAcompanamiento {
  return { activo: true, exitosSeguidos: 0, umbral }
}

export function siguienteAcompanamiento(e: EstadoAcompanamiento, evento: EventoAcompanamiento): EstadoAcompanamiento {
  const umbral = Number.isInteger(e.umbral) && e.umbral >= 1 ? e.umbral : UMBRAL_ACOMPANAMIENTO
  if (evento === 'fallo') return { activo: true, exitosSeguidos: 0, umbral }
  if (evento === 'exito_con_ia') return { activo: e.activo, exitosSeguidos: 0, umbral }
  const exitos = Math.max(0, e.exitosSeguidos) + 1
  return { activo: e.activo && exitos < umbral, exitosSeguidos: exitos, umbral }
}
