/**
 * Ámbito de correduría de la sesión — LÓGICA PURA, sin acceso a base de datos.
 *
 * Vive aparte de `tenant.ts` a propósito: así se puede probar sin Prisma ni red
 * (patrón de `apps/plataforma/lib/subastas/resumen-docs.ts` + su `.test.ts`).
 *
 * ─── Por qué existe este fichero ─────────────────────────────────────────────
 * El CRM de origen aísla los datos con **86 políticas RLS** que se resuelven por
 * `auth.uid()` de Supabase Auth. Esta app NO usa Supabase Auth (cookie propia
 * `asegura_session` contra `public.cuentas`), y además conecta con el rol
 * `prisma_seguros`, que tiene **BYPASSRLS**.
 *
 * La consecuencia no es «no se ve nada»: es que **se ve TODO y ninguna consulta
 * falla**. El aislamiento deja de ser cosa de la base y pasa a ser cosa del
 * código — es decir, de este fichero.
 *
 * ─── La regla ────────────────────────────────────────────────────────────────
 * TRES estados, nunca dos, y NUNCA un valor por defecto:
 *
 *   'pendiente'    → el schema `seguros` está vacío: **no se sabe** a qué
 *                    correduría pertenece la cuenta, porque la tabla que lo dice
 *                    todavía no existe. No es «no tiene ninguna».
 *   'sin-asignar'  → ya está migrado, pero esta cuenta no está vinculada a
 *                    ninguna correduría. Esto SÍ es una ausencia comprobada.
 *   'ok'           → hay `correduriaId` y toda consulta debe filtrar por él.
 *
 * 🚫 Lo que NUNCA se hace aquí: devolver una correduría «por defecto», colapsar
 * con `?? ''` o dejar pasar la consulta sin filtro. Un `correduriaId` inventado
 * no da error: da los datos de otro.
 */

export type AmbitoCorreduria =
  | { estado: 'pendiente' }
  | { estado: 'sin-asignar'; cuentaId: string }
  | { estado: 'ok'; cuentaId: string; correduriaId: string }

/** Lo que se sabe al resolver el ámbito. `correduriaId` a `null` = «no vinculada». */
export type DatosAmbito = {
  cuentaId: string
  /** ¿Existe ya el schema `seguros` con tablas? `false` = todavía sin migrar. */
  migrado: boolean
  /** `null` cuando la cuenta no está vinculada a ninguna correduría. */
  correduriaId: string | null
}

/**
 * Valores «de cajón» que algunos CRM escriben en vez de dejar NULL. Se tratan
 * como ausencia: un `'desconocido'` es un «no lo he sabido leer» disfrazado de
 * dato, y por eso se cuela por todas las guardas basadas en NULL.
 */
const CENTINELAS = new Set(['', 'otro', 'otros', 'desconocido', 'n/a', 'na', 'null', 'undefined', 'sin asignar', 'sin clasificar'])

function esCentinela(v: string | null): boolean {
  return v === null || CENTINELAS.has(v.trim().toLowerCase())
}

export function resolverAmbito(d: DatosAmbito): AmbitoCorreduria {
  // Sin migrar, la pregunta no tiene respuesta todavía. Decir 'sin-asignar' aquí
  // afirmaría algo que no se ha mirado.
  if (!d.migrado) return { estado: 'pendiente' }
  if (esCentinela(d.correduriaId)) return { estado: 'sin-asignar', cuentaId: d.cuentaId }
  return { estado: 'ok', cuentaId: d.cuentaId, correduriaId: (d.correduriaId as string).trim() }
}

/** Mensaje para la UI. No inventa números ni pinta ceros donde no hay dato. */
export function explicarAmbito(a: AmbitoCorreduria): string {
  switch (a.estado) {
    case 'pendiente':
      return 'La cartera todavía no se ha traído: el schema «seguros» está vacío. Esto no significa que no haya clientes.'
    case 'sin-asignar':
      return 'Tu cuenta no está vinculada a ninguna correduría. Hasta que lo esté no se muestran datos.'
    case 'ok':
      return ''
  }
}

/**
 * Puerta única a los datos de la correduría. Devuelve el `correduriaId` o LANZA.
 *
 * Deliberadamente no tiene rama «devuelve algo por si acaso»: el modo de fallo
 * que hay que evitar es exactamente ese, una consulta sin filtro que responde
 * 200 con los datos de otra correduría.
 */
export function exigirCorreduriaId(a: AmbitoCorreduria): string {
  if (a.estado !== 'ok') {
    throw new Error(`No hay ámbito de correduría (estado: ${a.estado}). No se consulta sin filtro.`)
  }
  return a.correduriaId
}
