// La DECISIÓN del vínculo identidad ↔ ficha de la cartera, pura y sin
// dependencias: ni Prisma, ni red, ni Next. La recogida de filas vive en
// `lib/vinculo.ts`, que la re-exporta; aquí solo se decide.
//
// Está en su propio fichero por dos razones, y la segunda es la importante:
// una decisión repartida entre los `await` de una función que abre la BD no se
// puede probar sin BD, y lo que no se prueba se rompe sin que falle nada — que
// es exactamente cómo llegó a producción el fallo de abajo.

/**
 * Una ficha que casa con el índice ciego del email, y POR DÓNDE casa.
 *
 * `principal: true` = el email está en `clientes.email_lookup_hash`, la columna
 * de la propia ficha. `principal: false` = solo aparece en `cliente_emails`,
 * que es la lista de emails de CONTACTO de esa ficha.
 */
export type Candidato = { clienteId: string; correduriaId: string; principal: boolean }

/**
 * Unión discriminada a propósito: quien recibe un `ok` tiene los dos ids
 * garantizados por el tipo y no hace falta un `!` aguas abajo. En `ambiguo` y
 * `sin_ficha` no hay ficha que devolver, y que el tipo no la ofrezca evita que
 * alguien lea un `clienteId` que no significa nada.
 */
export type FichaElegida =
  | { estado: 'ok'; clienteId: string; correduriaId: string }
  | { estado: 'ambiguo' }
  | { estado: 'sin_ficha' }

/**
 * Elige a qué ficha de la cartera pertenece un email, DESEMPATANDO POR
 * PROCEDENCIA.
 *
 * ─── El caso fundacional (03/09/2026, producción) ───────────────────────────
 * Con el email del propio Alberto salían **1 ficha por la columna principal (la
 * suya) y 3 filas en `cliente_emails`**: la suya otra vez y las fichas de DOS
 * personas distintas que llevan su correo como email de contacto. El código
 * anterior metía todo en el mismo saco, contaba 2 candidatos y devolvía
 * `ambiguo`: se entraba al portal y la bóveda salía VACÍA, sin error. No es un
 * caso raro — cualquier email usado como contacto en la ficha de otro (un
 * familiar, o el propio corredor mientras cargaba la cartera) queda igual de
 * bloqueado, y desde fuera se ve idéntico a «no tienes pólizas».
 *
 * ─── La regla, y por qué no es relajar el criterio ──────────────────────────
 * El email principal de una ficha ES la identidad de esa ficha. Aparecer como
 * contacto en la ficha de OTRO no te convierte en esa persona: es un dato sobre
 * a quién llamar, no sobre quién eres. Así que un único principal gana aunque
 * haya N secundarios. Lo que sigue sin adivinarse es el empate de verdad: DOS
 * fichas que declaran el mismo email como SUYO. Ahí no hay criterio que valga y
 * se devuelve `ambiguo`, igual que antes.
 *
 * ⚠️ Y por eso NO vale el atajo «si hay un principal, ignoro los secundarios y
 * ya». Los secundarios siguen contando cuando no hay ninguno principal: una
 * ficha cuya única dirección conocida vive en `cliente_emails` tiene que poder
 * vincularse (es el comportamiento que ya había y que no se toca). Filtrarlos
 * de entrada convertiría en `sin_ficha` a clientes que hoy entran bien.
 *
 * ⚠️ Una ficha FUSIONADA (lápida `merged_into_cliente_id`) no llega hasta aquí:
 * la descarta quien construye la lista, por los dos caminos. La ficha viva es
 * la que absorbió, y vincular a una lápida es enseñar una cartera muerta.
 */
export function elegirFicha(candidatos: readonly Candidato[]): FichaElegida {
  // Una misma ficha puede venir por los DOS caminos (su email principal está
  // además en su lista de contactos, que es justo lo que pasaba con la ficha de
  // Alberto). Se cuenta UNA vez, y manda `principal`: si algún camino dice que
  // el email es suyo, lo es.
  const porFicha = new Map<string, Candidato>()
  for (const c of candidatos) {
    const previo = porFicha.get(c.clienteId)
    if (!previo) porFicha.set(c.clienteId, c)
    else if (c.principal && !previo.principal) porFicha.set(c.clienteId, c)
  }

  const unicos = [...porFicha.values()]
  const principales = unicos.filter((c) => c.principal)
  // Los secundarios solo se miran si no hay ningún principal: son el plan B, no
  // un voto que empate con el titular.
  const elegibles = principales.length > 0 ? principales : unicos

  if (elegibles.length === 0) return { estado: 'sin_ficha' }
  if (elegibles.length > 1) return { estado: 'ambiguo' }

  const ganadora = elegibles[0]
  return { estado: 'ok', clienteId: ganadora.clienteId, correduriaId: ganadora.correduriaId }
}
