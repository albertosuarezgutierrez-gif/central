// ────────────────────────────────────────────────────────────────────────────
// Estado de las PUJAS de una subasta del Portal, leído SIN iniciar sesión. PURO.
//
// Lo que el Portal enseña a un visitante anónimo en la pestaña «Pujas» (ver=5),
// verificado contra las 13 subastas vivas el 20/08/2026 — son cuatro frases
// literales y ninguna trae el importe mientras la subasta está abierta:
//
//   · «La subasta no ha recibido pujas.»                      → nadie ha pujado
//   · «La subasta ha recibido alguna puja. Para ver su
//      importe debe acceder como usuario registrado.»          → hay puja, cuánto no
//   · «La puja máxima de la subasta es secreta.»               → lo decide el juzgado
//   · «Puja máxima de la subasta | 669.900,00 €»               → subasta CONCLUIDA
//
// 🚨 Por qué esto es un módulo y no un `includes` suelto: «no lo he podido
// leer» y «no ha recibido pujas» son la misma cadena vacía para un parser
// descuidado, y son la diferencia entre «puedes llevártela por el mínimo» y «no
// lo sé». El cuarto estado (`desconocido`) existe para eso y NUNCA se colapsa
// con `sin_pujas` — regla del CLAUDE.md aplicada al dato que decide la puja.
//
// Contexto de lo que había antes: `mejorPujaDeFicha` buscaba la puja en la
// pestaña GENERAL, donde solo están la puja MÍNIMA y los tramos. Por eso
// `subastas.mejor_puja` llevaba 26 filas a NULL sin que nadie lo notara.
// ────────────────────────────────────────────────────────────────────────────
import { decodificarHtml } from './email-boe.ts'
import { norm, parseImporteEs } from './parsing.ts'

/**
 * Lo que se puede afirmar de las pujas de una subasta abierta, sin sesión:
 *  · `sin_pujas`    — el Portal dice literalmente que no ha recibido ninguna.
 *  · `con_puja`     — hay al menos una (el importe solo si la subasta concluyó).
 *  · `secretas`     — la autoridad gestora las declaró secretas: no hay dato ni habrá.
 *  · `desconocido`  — no se ha podido leer. NO es «sin pujas».
 */
export type EstadoPujas = 'sin_pujas' | 'con_puja' | 'secretas' | 'desconocido'

export interface PujasFicha {
  estado: EstadoPujas
  /**
   * Importe de la puja máxima SOLO cuando el Portal lo publica (lo hace al
   * concluir el periodo de pujas). `null` mientras está abierta = «no publicado
   * sin iniciar sesión», jamás «va por cero».
   */
  importe: number | null
}

/** Celdas de la pestaña, en orden, ya sin etiquetas. */
function celdas(html: string): string[] {
  const cuerpo = html.slice(Math.max(0, html.indexOf('id="contenido"')))
  return cuerpo
    .replace(/<\/?(th|td|li|p|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    // Decodificar es OBLIGATORIO, no cosmético: el Portal escribe «Puja
    // m&#xE1;xima» y «669.900,00 &#x20AC;», así que buscar «máxima» o «€» sobre
    // el HTML crudo no encuentra NADA y todo saldría como «desconocido».
    .map((s) => decodificarHtml(s))
    .filter(Boolean)
}

/**
 * Estado de las pujas a partir del HTML de la pestaña «Pujas» (`&ver=5`).
 *
 * Orden deliberado: primero las frases EXPLÍCITAS y solo después se busca un
 * importe. Una subasta secreta concluida publica su remate, y leer el banner
 * antes que la cifra la dejaría eternamente en «secreta».
 */
export function pujasDeFicha(html: string): PujasFicha {
  if (!html) return { estado: 'desconocido', importe: null }
  const filas = celdas(html)
  const texto = norm(filas.join(' \n '))

  // El importe manda cuando existe: es el único dato duro de todo esto.
  const importe = importeDePujaMaxima(filas)
  if (importe != null) return { estado: 'con_puja', importe }

  if (/la subasta no ha recibido pujas/.test(texto)) return { estado: 'sin_pujas', importe: null }
  if (/la subasta ha recibido alguna puja/.test(texto)) return { estado: 'con_puja', importe: null }
  // La frase del panel, no la ADVERTENCIA de cabecera: esa sale en las cuatro
  // pestañas y marcaría como secreta una ficha cuya pestaña no se llegó a leer.
  if (/la puja maxima de la subasta es secreta/.test(texto)) return { estado: 'secretas', importe: null }

  return { estado: 'desconocido', importe: null }
}

/**
 * Importe que sigue al rótulo «Puja máxima…», si lo hay. Se ancla al rótulo y no
 * se busca «el primer € de la página» a propósito: la ficha general trae la puja
 * MÍNIMA y los TRAMOS, y confundir cualquiera de los dos con la puja viva es
 * inventarse el estado de la subasta.
 */
function importeDePujaMaxima(filas: string[]): number | null {
  for (let i = 0; i < filas.length; i++) {
    if (!/^puja maxima/.test(norm(filas[i]))) continue
    // El valor va en la celda siguiente; si esa es otra frase, no hay importe.
    for (const candidata of [filas[i], filas[i + 1] ?? '']) {
      if (!/€|eur/i.test(candidata)) continue
      const n = parseImporteEs(candidata)
      if (n != null && n > 0) return n
    }
    return null
  }
  return null
}

/**
 * Línea legible del estado de pujas para el aviso de Telegram y la ficha.
 *
 * `valorSubasta` solo se usa para el porcentaje sobre el tipo; sin él se omite
 * (un porcentaje sobre un tipo desconocido es un número inventado). El formato
 * del dinero lo pone quien pinta: aquí no se decide la presentación del euro.
 */
export function titularPujas(p: PujasFicha, eur: (n: number) => string, valorSubasta?: number | null): string {
  switch (p.estado) {
    case 'sin_pujas':
      return '🎯 Todavía SIN pujas'
    case 'con_puja': {
      if (p.importe == null) {
        return '⚠️ Ya hay alguna puja (el Portal no publica el importe sin iniciar sesión)'
      }
      const pct = valorSubasta != null && valorSubasta > 0
        ? ` (${Math.round((p.importe / valorSubasta) * 100)}% del tipo)`
        : ''
      return `🔥 Puja máxima ${eur(p.importe)}${pct}`
    }
    case 'secretas':
      return '🤐 Pujas SECRETAS por decisión del juzgado: no se sabe si hay ni cuánto, ni registrándose'
    default:
      return '❔ Estado de pujas sin comprobar'
  }
}
