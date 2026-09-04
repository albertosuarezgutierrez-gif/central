/**
 * Los tres botones de «hablar con esta persona»: llamar, escribir, WhatsApp.
 *
 * 🚨 Existe porque **a un fijo no se le puede mandar un WhatsApp**, y pintar el
 * icono igual es ofrecer una acción que falla — la misma familia de error que
 * afirmar un dato que no se ha mirado. Medido en la propia ficha de Alberto
 * (03/09/2026): tiene 607905544 (móvil) y 954220548 (fijo de Sevilla). Con el
 * icono en los dos, uno de cada dos toques acaba en un error de WhatsApp.
 *
 * Por eso el veredicto tiene TRES estados y no dos:
 *   · `movil`      → se ofrece WhatsApp.
 *   · `fijo`       → NO se ofrece: sabemos que falla.
 *   · `no_consta`  → sí se ofrece, pero declarando que no se ha podido
 *                    comprobar. Es el caso del número extranjero: bloquearlo
 *                    quitaría una acción que probablemente funciona, y solo se
 *                    esconde lo que se SABE roto, no lo que no se sabe.
 *
 * Móvil en España = empieza por 6 o 7 (el 7 lo es desde 2009). Fijo = 8 o 9.
 */

/** Qué se sabe del número de cara a WhatsApp. */
export type ClaseTelefono = 'movil' | 'fijo' | 'no_consta'

export type AccionesContacto = {
  /** href de `tel:`, o null si no hay teléfono utilizable. */
  tel: string | null
  /** href de `mailto:`, o null. */
  email: string | null
  /** href de wa.me SIN `+`, o null si no se ofrece. */
  whatsapp: string | null
  clase: ClaseTelefono
  /** Para el `title` del icono cuando la clase no es `movil`. */
  nota: string | null
}

/** Quita separadores y prefijos internacionales escritos a mano. */
function compactar(bruto: string): string {
  const s = bruto.replace(/[\s.\-()/]/g, '')
  if (s.startsWith('0034')) return `+34${s.slice(4)}`
  if (s.startsWith('34') && s.length === 11) return `+34${s.slice(2)}`
  return s
}

/**
 * Clasifica el número. Solo se pronuncia sobre los ESPAÑOLES: de un +33 o un
 * +44 no sabemos las reglas de numeración, así que `no_consta` — que no es
 * «es fijo», es «no me consta».
 */
export function claseDeTelefono(bruto: string | null | undefined): ClaseTelefono {
  if (!bruto) return 'no_consta'
  const s = compactar(bruto)
  const nacional = s.startsWith('+34') ? s.slice(3) : s
  // Un número español son 9 dígitos. Cualquier otra longitud no la juzgamos.
  if (!/^\d{9}$/.test(nacional)) return 'no_consta'
  if (/^[67]/.test(nacional)) return 'movil'
  if (/^[89]/.test(nacional)) return 'fijo'
  return 'no_consta'
}

/**
 * Los tres enlaces para un contacto. `ilegible` es el contacto cifrado que
 * asegura no ha podido descifrar: no se ofrece NADA sobre él, porque el valor
 * que tenemos delante no es su teléfono.
 */
export function accionesContacto(
  { telefono, email, ilegible = false }:
  { telefono?: string | null; email?: string | null; ilegible?: boolean },
): AccionesContacto {
  if (ilegible) {
    return { tel: null, email: null, whatsapp: null, clase: 'no_consta', nota: 'el contacto está cifrado y no se ha podido leer' }
  }

  const tel = telefono ? compactar(telefono) : ''
  const clase = claseDeTelefono(telefono)
  const correo = (email ?? '').trim()

  // wa.me quiere el internacional SIN `+` ni separadores. Un número español de
  // 9 dígitos sin prefijo se asume ES: es lo que hay en la cartera.
  let whatsapp: string | null = null
  let nota: string | null = null
  if (clase === 'fijo') {
    nota = 'es un fijo: no admite WhatsApp'
  } else if (tel) {
    const sinMas = tel.startsWith('+') ? tel.slice(1) : `34${tel}`
    whatsapp = `https://wa.me/${sinMas}`
    if (clase === 'no_consta') nota = 'no se ha podido comprobar que admita WhatsApp'
  }

  return {
    tel: tel ? `tel:${tel}` : null,
    email: correo ? `mailto:${correo}` : null,
    whatsapp,
    clase,
    nota,
  }
}
