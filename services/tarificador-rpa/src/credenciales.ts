// Credenciales rechazadas / cuenta bloqueada / contraseña caducada (15/10/2026). El usuario del portal es el MISMO que usan
// las personas: repetir un login fallido puede BLOQUEARLO. Todo lo de aquí es NO reintentable (tipo `credenciales` en el cable).
//   · detección por mensajes típicos del portal en español (ningún portal tiene texto confirmado en el repo: genérica);
//   · `ErrorCredenciales`: mensaje `credenciales_<motivo>: …`; el runner lo convierte en el aviso con el fly secret a cambiar;
//   · cortocircuito EN MEMORIA del proceso: tras un rechazo, los siguientes trabajos de esa credencial NO abren el portal.
//     La pausa entre máquinas (cada trabajo es una máquina de Fly nueva) tiene que vivir en asegura: ver el informe.
// 🔑 Solo LEE texto visible; nunca registra usuario ni contraseña (el texto del portal no se copia a los mensajes).

import type { Page } from 'playwright'
import { ErrorTarificador } from './errores.ts'
import { nombreCompania } from './aviso.ts'

export type MotivoCredenciales = 'rechazadas' | 'bloqueada' | 'caducada'

// «Bloqueada» manda sobre «caducada» y esta sobre «rechazadas» (un bloqueo también dice «incorrecto» a veces).
const BLOQUEADA =
  /(cuenta|usuario|acceso|credenciales?)\s+(ha\s+sido\s+|est[aá]\s+|se\s+ha\s+)?(bloquead|suspendid|deshabilitad|inhabilitad|desactivad|revocad)|(bloquead|suspendid|inhabilitad)[oa]s?\s+(por|tras)\s+(demasiados\s+)?intentos|demasiados\s+intentos|(n[uú]mero\s+m[aá]ximo|l[ií]mite)\s+de\s+intentos|intentos\s+(fallidos|permitidos)\s+(superad|excedid|agotad)|superado\s+(el\s+)?(n[uú]mero|l[ií]mite)\s+de\s+intentos/i
// Nunca «cambiar contraseña» a secas: es un ENLACE fijo de la pantalla de acceso de Mapfre.
const CADUCADA =
  /contrase[ñn]a\s+(ha\s+|est[aá]\s+)?(caducad|expirad|vencid)|(caducad|expirad|vencid)[oa]\s+(su\s+|la\s+)?contrase[ñn]a|(debe|tiene\s+que|es\s+necesario|necesita)\s+(cambiar|renovar|actualizar)\s+(su\s+|la\s+)?contrase[ñn]a|cambio\s+(de\s+contrase[ñn]a\s+)?obligatorio|(caducidad|expiraci[oó]n)\s+de\s+(la\s+)?contrase[ñn]a/i
const RECHAZADAS =
  /(usuario|c[oó]digo\s+de\s+usuario|identificador)\s+(y\/o\s+|o\s+|y\s+)(la\s+)?contrase[ñn]a\s+(son\s+|es\s+)?(incorrect|inv[aá]lid|erron|no\s+v[aá]lid|no\s+es\s+correct)|contrase[ñn]a\s+(es\s+|son\s+)?(incorrect|inv[aá]lid|erron|no\s+v[aá]lid|no\s+es\s+correct|no\s+coincide)|(datos|credenciales|clave)\s+(de\s+acceso\s+)?(son\s+)?(incorrect|inv[aá]lid|erron|no\s+v[aá]lid)|(usuario|credenciales)\s+(o\s+contrase[ñn]a\s+)?(incorrect|inv[aá]lid|erron|no\s+v[aá]lid|desconocid)|(autenticaci[oó]n|identificaci[oó]n|acceso)\s+(fallid|incorrect|denegad|erron)|login\s+(failed|incorrect)|invalid\s+(user|credentials|password)|incorrect\s+(user|password)/i

/** Pura: ¿el texto de la pantalla dice que las credenciales no valen? `null` = no se ve nada de eso. */
export function motivoCredenciales(texto: string): MotivoCredenciales | null {
  if (!texto) return null
  if (BLOQUEADA.test(texto)) return 'bloqueada'
  if (CADUCADA.test(texto)) return 'caducada'
  if (RECHAZADAS.test(texto)) return 'rechazadas'
  return null
}

const DESCRIPCION: Record<MotivoCredenciales, string> = {
  rechazadas: 'el portal rechaza el usuario o la contraseña',
  bloqueada: 'el portal indica cuenta o usuario bloqueado',
  caducada: 'el portal pide cambiar la contraseña (caducada)',
}

/** Credenciales no válidas. NO reintentable (tipo `credenciales`). Mensaje sin texto del portal ni secretos. */
export class ErrorCredenciales extends ErrorTarificador {
  readonly motivo: MotivoCredenciales
  constructor(compania: string, motivo: MotivoCredenciales) {
    super('credenciales', `credenciales_${motivo}: ${nombreCompania(compania)}: ${DESCRIPCION[motivo]}`)
    this.name = 'ErrorCredenciales'
    this.motivo = motivo
  }
}

/** Motivo de un mensaje `credenciales_<motivo>: …`; sin prefijo (el rechazo genérico de un adaptador) → `rechazadas`. */
export function motivoDeMensaje(mensaje: string): MotivoCredenciales {
  const m = /^credenciales_(rechazadas|bloqueada|caducada):/.exec(mensaje)
  return (m?.[1] as MotivoCredenciales | undefined) ?? 'rechazadas'
}

/** Aviso a Alberto (sin usuario ni contraseña; `variablePass` es solo el NOMBRE del fly secret). */
export function textoAvisoCredenciales(compania: string, motivo: MotivoCredenciales, variablePass: string): string {
  const c = nombreCompania(compania)
  if (motivo === 'bloqueada') return `${c}: el portal indica que el usuario está bloqueado; desbloquéalo en el portal, revisa ${variablePass} en fly secrets y quita la pausa`
  if (motivo === 'caducada') return `${c}: la contraseña ha caducado; cámbiala en el portal, actualiza ${variablePass} en fly secrets y quita la pausa`
  return `${c}: el portal rechaza la contraseña; actualiza ${variablePass} en fly secrets y quita la pausa`
}

/** Texto visible de la página y sus marcos (solo lectura; un fallo de lectura = vacío). */
export async function textoVisiblePagina(page: Page): Promise<string> {
  const t: string[] = []
  for (const marco of page.frames()) t.push(await marco.locator('body').innerText({ timeout: 1_000 }).catch(() => ''))
  return t.join('\n').slice(0, 20_000)
}

/**
 * Tras enviar el login (o con la pantalla ya cambiada): si el portal dice que la cuenta no sirve, lanza `ErrorCredenciales`.
 * `soloInutilizable`: tras un login «bueno» solo cuentan bloqueo y caducidad (un «incorrecto» puede ser de otro formulario).
 */
export async function exigirSinRechazoCredenciales(page: Page, compania: string, o: { soloInutilizable?: boolean } = {}): Promise<void> {
  const m = motivoCredenciales(await textoVisiblePagina(page))
  if (m && !(o.soloInutilizable && m === 'rechazadas')) throw new ErrorCredenciales(compania, m)
}

// ───────────────────────── cortocircuito por credencial (en memoria del proceso) ─────────────────────────

export class CortocircuitoCredenciales {
  readonly #bloqueadas = new Map<string, MotivoCredenciales>()
  /** `credencial` = `adaptador.credencial` (p. ej. MAPFRE_WMEDIADORES). */
  bloquear(credencial: string, motivo: MotivoCredenciales): void {
    this.#bloqueadas.set(credencial.toUpperCase(), motivo)
  }
  motivo(credencial: string): MotivoCredenciales | null {
    return this.#bloqueadas.get(credencial.toUpperCase()) ?? null
  }
}

export const cortocircuito = new CortocircuitoCredenciales()
