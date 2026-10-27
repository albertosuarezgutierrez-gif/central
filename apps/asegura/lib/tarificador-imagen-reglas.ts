// Imagen del bot del tarificador RPA desde la BD (27/10/2026). Reglas PURAS (sin BD); la parte con BD en
// `tarificador-imagen.ts`, SQL en `prisma/sql/2026-10-27_tarificador_imagen.sql`.
//
//   · PRODUCCIÓN: la fila `produccion` de `seguros.tarificador_imagen` manda sobre la env `TARIFICADOR_FLY_IMAGE` (que queda
//     de respaldo). La escribe SOLO el workflow `tarificador-rpa-imagen.yml` lanzado sobre `main`, por el puerto de operador
//     (`POST /api/operador/tarificador/imagen`). Nunca vuelve a una imagen más antigua salvo `forzar: true` (la lección del
//     21-22/10/2026: dos sesiones pisaron la env con imágenes viejas).
//   · PRUEBA: `POST /api/operador/tarificador/probar { …, imagen }` lanza UNA imagen de rama (`rama-*`) solo para ese trabajo,
//     y solo con el interruptor `permitir_imagen_prueba` encendido (lo enciende Alberto en BD).
// Todo valor se valida con la MISMA regex estricta: una fila rara no lanza nada raro.

/** Única forma admitida: el registro de Fly de la app del worker y una etiqueta corta en minúsculas. */
export const REGEX_IMAGEN_BOT = /^registry\.fly\.io\/asegura-tarificador:[a-z0-9][a-z0-9._-]{0,63}$/

/** Etiqueta de una imagen de rama (`tarificador-rpa-imagen.yml` fuera de `main`): `rama-<sha7>`. */
export const PREFIJO_PRUEBA = 'rama-'
/** Etiqueta de producción (`tarificador-rpa-imagen.yml` sobre `main`): `main-<sha7>`. */
export const PREFIJO_PRODUCCION = 'main-'

export function imagenValida(v: unknown): v is string {
  return typeof v === 'string' && REGEX_IMAGEN_BOT.test(v)
}

/** La etiqueta (lo que va tras `:`) de una imagen YA validada. */
export function etiquetaDe(imagen: string): string {
  return imagen.slice(imagen.lastIndexOf(':') + 1)
}

export type FilaImagen = { imagen: string | null; commitAt: Date | null; permitirPrueba: boolean }

export type ImagenElegida = { imagen: string | null; origen: 'bd' | 'env' | null; aviso: string | null }

/**
 * Imagen de PRODUCCIÓN: la de la BD si es válida y no es de rama; si no (sin fila, sin tabla, valor raro), la env de respaldo.
 * `aviso` = por qué se ignoró la BD (se loguea; nunca el valor entero si no casa, por si trae algo raro).
 */
export function elegirImagenProduccion(bd: string | null | undefined, env: Record<string, string | undefined>): ImagenElegida {
  const respaldo = (env.TARIFICADOR_FLY_IMAGE ?? '').trim() || null
  const deEnv = (aviso: string | null): ImagenElegida => ({ imagen: respaldo, origen: respaldo ? 'env' : null, aviso })
  if (bd === null || bd === undefined) return deEnv(null)
  if (!imagenValida(bd)) return deEnv('la imagen de la BD no casa con el formato permitido: se usa TARIFICADOR_FLY_IMAGE')
  if (etiquetaDe(bd).startsWith(PREFIJO_PRUEBA)) return deEnv('la imagen de la BD es de rama (rama-*): nunca es producción; se usa TARIFICADOR_FLY_IMAGE')
  return { imagen: bd, origen: 'bd', aviso: null }
}

export type ValidacionImagenPrueba = { ok: true; imagen: string } | { ok: false; motivo: string }

/** Imagen de PRUEBA pedida en `probar`: formato estricto, etiqueta `rama-*` y nunca `main-*` (eso es producción). */
export function validarImagenPrueba(v: unknown): ValidacionImagenPrueba {
  if (typeof v !== 'string') return { ok: false, motivo: 'imagen tiene que ser texto' }
  const imagen = v.trim()
  if (!imagenValida(imagen)) return { ok: false, motivo: 'imagen no válida: registry.fly.io/asegura-tarificador:<etiqueta> (minúsculas, números, . _ -)' }
  const etiqueta = etiquetaDe(imagen)
  if (etiqueta.startsWith(PREFIJO_PRODUCCION)) return { ok: false, motivo: 'una imagen main-* es de producción: para probarla, publícala desde main' }
  if (!etiqueta.startsWith(PREFIJO_PRUEBA)) return { ok: false, motivo: 'solo se prueban imágenes de rama (etiqueta rama-<sha7>)' }
  return { ok: true, imagen }
}

export type ImagenTrabajo = { ok: true; imagen: string; prueba: boolean } | { ok: false; motivo: string }

/**
 * Imagen con la que se lanza la máquina de UN trabajo. Con `imagenPrueba` (la pidió `probar`) se re-valida y se exige el
 * interruptor AHORA (pudo apagarse entre encolar y lanzar): si no vale, NO se cae a producción en silencio (la prueba
 * mediría otra cosa) → el trabajo falla con el motivo. Sin ella, la de producción.
 */
export function imagenParaTrabajo(p: { imagenPrueba: string | null; permitirPrueba: boolean; produccion: string | null }): ImagenTrabajo {
  if (p.imagenPrueba !== null) {
    const v = validarImagenPrueba(p.imagenPrueba)
    if (!v.ok) return { ok: false, motivo: `imagen_prueba_no_valida: ${v.motivo}` }
    if (!p.permitirPrueba) return { ok: false, motivo: 'imagen_prueba_no_permitida: el interruptor permitir_imagen_prueba está apagado' }
    return { ok: true, imagen: v.imagen, prueba: true }
  }
  if (!p.produccion) return { ok: false, motivo: 'sin imagen de producción (ni BD ni TARIFICADOR_FLY_IMAGE)' }
  return { ok: true, imagen: p.produccion, prueba: false }
}

/** ¿Se puede pedir una imagen de prueba? Interruptor apagado o sin la tabla → 403 claro. */
export function decidirPermisoPrueba(fila: FilaImagen | null): { ok: true } | { ok: false; status: 403; motivo: string } {
  if (!fila) return { ok: false, status: 403, motivo: 'imagen_prueba_no_permitida: no hay configuración de imagen en BD (SQL 2026-10-27_tarificador_imagen sin aplicar)' }
  if (!fila.permitirPrueba) return { ok: false, status: 403, motivo: 'imagen_prueba_no_permitida: el interruptor permitir_imagen_prueba está apagado (lo enciende Alberto en la tabla tarificador_imagen)' }
  return { ok: true }
}

export type DecisionPublicar =
  | { ok: true; cambia: boolean; imagen: string; commitAt: Date }
  | { ok: false; status: 400 | 409; motivo: string }

/** Margen para relojes: un commit «del futuro» de más de 1 h es un dato raro. */
const MARGEN_FUTURO_MS = 60 * 60 * 1000

/**
 * Publicar una imagen de PRODUCCIÓN (lo llama el workflow tras construir sobre `main`). Reglas:
 *   · formato estricto y nunca `rama-*`;
 *   · `commitAt` (fecha ISO del commit construido) obligatoria y legible;
 *   · NUNCA más antigua que la vigente (commit anterior) salvo `forzar` — el comentario de la env: «No poner una imagen anterior»;
 *   · la misma imagen = sin cambios (idempotente). La vigente sin fecha (`null` = no se sabe) no bloquea.
 */
export function decidirPublicarProduccion(
  p: { actual: { imagen: string | null; commitAt: Date | null } | null; imagen: unknown; commitAt: unknown; forzar: unknown },
  ahora: Date,
): DecisionPublicar {
  if (!imagenValida(p.imagen)) return { ok: false, status: 400, motivo: 'imagen no válida: registry.fly.io/asegura-tarificador:<etiqueta>' }
  if (etiquetaDe(p.imagen).startsWith(PREFIJO_PRUEBA)) return { ok: false, status: 400, motivo: 'una imagen rama-* nunca es producción' }
  const commitAt = typeof p.commitAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(p.commitAt) ? new Date(p.commitAt) : null
  if (!commitAt || Number.isNaN(commitAt.getTime())) return { ok: false, status: 400, motivo: 'commitAt (fecha ISO del commit construido) obligatoria' }
  if (commitAt.getTime() > ahora.getTime() + MARGEN_FUTURO_MS) return { ok: false, status: 400, motivo: 'commitAt en el futuro' }
  const forzar = p.forzar === true
  const a = p.actual
  if (a?.imagen === p.imagen) return { ok: true, cambia: false, imagen: p.imagen, commitAt }
  if (a?.commitAt && commitAt.getTime() < a.commitAt.getTime() && !forzar) {
    return { ok: false, status: 409, motivo: `imagen_anterior: su commit (${commitAt.toISOString()}) es anterior al de la vigente (${a.commitAt.toISOString()}); para volver atrás a propósito, forzar: true` }
  }
  return { ok: true, cambia: true, imagen: p.imagen, commitAt }
}
