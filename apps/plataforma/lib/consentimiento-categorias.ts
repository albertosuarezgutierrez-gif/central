// Normaliza el campo `categorias` que llega a /api/publico/correduria/consentimiento.
//
// 🚨 Existe por un fallo MEDIDO el 15/09/2026: la tabla `consentimiento_registro` llevaba
// vacía desde que se creó (14/09) y eso se leyó como «todavía no ha aceptado nadie». Era
// falso. Las tres webs mandan `CookieConsent.getUserPreferences().acceptedCategories`, que
// es un ARRAY de strings (`["necessary","statistics"]`), y el receptor lo rechazaba con un
// 400 «categorias inválidas» por el guard `Array.isArray(categorias)`.
//
// Lo que lo hacía invisible: el reenvío es fire-and-forget con `.catch()`, así que el 400 se
// tiraba a la basura en el navegador. Medido contra producción ese día: un POST con el
// payload exacto de las apps devolvía 400, mientras PostHog SÍ registraba visitas de ese
// mismo día — o sea, gente aceptando el banner y ni una fila de auditoría (RGPD art. 7.1,
// que exige poder DEMOSTRAR el consentimiento).
//
// Se arregla en el receptor y no en los tres emisores a propósito: es un solo punto y no
// obliga a redesplegar asegura-web, ia-rest y housesevillana para recuperar el registro.

/** Forma con la que se guarda en BD, sea cual sea la que mande el emisor. */
export type CategoriasNormalizadas = Record<string, unknown>

/**
 * Devuelve el objeto a guardar, o `null` si el valor no es una forma aceptable.
 *
 * - **Array de strings** (lo que mandan hoy las tres webs) → `{ aceptadas: [...] }`.
 *   Se envuelve en vez de expandirse a `{necessary:true}` porque el emisor manda SOLO las
 *   aceptadas: inventar un `false` para las que no vienen sería afirmar un rechazo que
 *   nadie ha dicho.
 * - **Objeto** → tal cual (por si algún emisor futuro manda el mapa completo).
 */
export function normalizarCategorias(valor: unknown): CategoriasNormalizadas | null {
  if (Array.isArray(valor)) {
    if (!valor.every((c) => typeof c === 'string')) return null
    return { aceptadas: valor }
  }
  if (valor && typeof valor === 'object') return valor as CategoriasNormalizadas
  return null
}
