// SOLICITUD DE DATOS DE LA RENOVACIÓN por la app (Alberto, 05/11/2026). Reglas PURAS (sin BD ni red), con test.
//
// Para tarificar una renovación de HOGAR con nuestros bots (gratis) cuando al riesgo le faltan datos:
//   1. Alberto la prepara desde la póliza (`/api/operador/solicitud-renovacion/preparar`, botón en plataforma). Las preguntas
//      salen del MISMO validador que rechaza a los bots con 422 `riesgo_incompleto` (`faltasHogarBot` de module-tarificacion,
//      del que sale `formularioBotHogar`): solo se pregunta lo que falta. Año y m² los rellena antes el Catastro si puede.
//   2. Telegram a Alberto con el resumen y ✅ Enviar / ✏️ Modificar: NADA sale al cliente sin su ✅.
//   3. Tras ✅: campana del portal + correo de aviso SIN datos (cron `avisos-intranet`) al tomador y a quien él autoriza con
//      Gestión/Total (regla única `quienContestaDatosRenovacion` de module-seguros-portal).
//   4. El cliente contesta en el portal; lo declarado va a `datosVivienda` SIN pisar nada (`planEscrituraVivienda`).
// TARIFICAR ≠ EMITIR: aquí no se cotiza ni se emite nada; Avant2 (de pago) jamás se dispara desde esto.
import type { Boton } from '@central/core-telegram'
import { escapeHtml } from '@central/core-telegram'
import type { CampoSolicitud } from '@central/module-seguros'
import type { CampoFaltaHogar, FaltaHogarBot } from '@central/module-tarificacion'

/** Prefijo de `callback_data` (enrutado en el webhook de plataforma): `cdr_env:<solicitudId>` (44 bytes). */
export const PREFIJO_DATOS_RENOVACION_TG = 'cdr'
export const CALLBACK_ENVIAR_DATOS = `${PREFIJO_DATOS_RENOVACION_TG}_env`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Qué preguntas del formulario de hogar (`camposSolicitud('hogar', …)`) contestan cada falta del bot. La dirección es UNA
 * pregunta (CP → provincia → municipio → calle del callejero → número → planta/puerta). Con la dirección se pregunta también
 * la tarjeta del Catastro («¿Es esta tu vivienda?»), que da tipo, m² y año sin teclearlos.
 */
export const PREGUNTAS_DE_FALTA: Readonly<Record<Exclude<CampoFaltaHogar, 'empresa'>, readonly string[]>> = Object.freeze({
  codigoPostal: ['vivienda'],
  nombreVia: ['vivienda'],
  numero: ['vivienda'],
  anioConstruccion: ['anioConstruccion'],
  superficieM2: ['metrosCuadrados'],
  uso: ['usoVivienda'],
  regimen: ['regimen'],
  tipoVivienda: ['tipoVivienda'],
  conMadera: ['conMadera'],
})

/** Lo que Alberto lee en Telegram de cada falta (sin valores). */
export const ETIQUETA_FALTA: Readonly<Record<CampoFaltaHogar, string>> = Object.freeze({
  empresa: 'el tomador es una empresa',
  codigoPostal: 'dirección (CP)',
  nombreVia: 'dirección (calle)',
  numero: 'dirección (número)',
  anioConstruccion: 'año de construcción',
  superficieM2: 'metros cuadrados',
  uso: 'uso (habitual/segunda/alquilada)',
  regimen: 'propietario o inquilino',
  tipoVivienda: 'tipo de vivienda (piso/casa)',
  conMadera: 'si lleva madera',
})

export type DecisionSolicitud =
  | { ok: true; campos: CampoSolicitud[]; preguntas: string[] }
  | { ok: false; status: 409; motivo: 'nada_que_pedir' | 'no_preguntable'; texto: string }

/**
 * De lo que el bot echa en falta a las preguntas. `todos` = el formulario de hogar vigente (`camposSolicitud('hogar', NADA_CONOCIDO)`).
 * Se conservan el orden y las ayudas del formulario; lo que el bot exige (dirección, régimen, uso, madera) pasa a OBLIGATORIO y
 * ESENCIAL (en el enlace general la madera es opcional; aquí, sin ella el bot no avanza). Tipo, m² y año siguen dependiendo del
 * Catastro (si la dirección se pregunta y el cliente confirma la tarjeta, no se teclean). Nada de DNI ni nacimiento: se toman
 * de la ficha (y un autorizado no debe ver ni dar el DNI del tomador). Un tomador EMPRESA no se arregla preguntando. PURA.
 */
export function decidirPreguntas(faltas: readonly FaltaHogarBot[], todos: readonly CampoSolicitud[]): DecisionSolicitud {
  if (faltas.some((f) => f.campo === 'empresa')) {
    return { ok: false, status: 409, motivo: 'no_preguntable', texto: 'El tomador es una empresa: el bot de hogar no la tarifica. Preguntar al cliente no lo arregla.' }
  }
  if (faltas.length === 0) return { ok: false, status: 409, motivo: 'nada_que_pedir', texto: 'Al riesgo no le falta nada para los bots: tarifícalo directamente (Probar).' }
  const claves = new Set<string>()
  for (const f of faltas) for (const c of PREGUNTAS_DE_FALTA[f.campo as Exclude<CampoFaltaHogar, 'empresa'>] ?? []) claves.add(c)
  if (claves.has('vivienda')) claves.add('confirmaCatastro')
  const OBLIGATORIAS = new Set(['vivienda', 'regimen', 'usoVivienda', 'conMadera'])
  const campos = todos
    .filter((c) => claves.has(c.clave))
    .map((c): CampoSolicitud => {
      const { siMarcado: _sin, ...resto } = c
      const base: CampoSolicitud = { ...resto, seccion: 'La vivienda', nivel: 'esencial' }
      return OBLIGATORIAS.has(c.clave) ? { ...base, obligatorio: true } : base
    })
  if (campos.length === 0) return { ok: false, status: 409, motivo: 'no_preguntable', texto: 'Lo que falta no se le puede preguntar al cliente: revísalo en el riesgo.' }
  const preguntas = [...new Set(faltas.map((f) => ETIQUETA_FALTA[f.campo]))]
  return { ok: true, campos, preguntas }
}

/** Texto del Telegram de revisión (interno, a Alberto). Sin DNI, IBAN ni dirección del tomador. */
export function textoRevisionDatos(e: {
  cliente: string | null
  compania: string | null
  vence: string | null
  preguntas: readonly string[]
  catastro: string | null
  destinatarios: readonly string[]
  publicable: boolean
}): string {
  const lineas = [
    '📝 <b>Renovación de hogar: pedir datos al cliente por la app</b>',
    `👤 ${escapeHtml(e.cliente ?? 'Cliente')}${e.compania ? ` · ${escapeHtml(e.compania)}` : ''}${e.vence ? ` · vence ${escapeHtml(e.vence)}` : ''}`,
    `❓ Le preguntaremos SOLO lo que falta a los bots: ${e.preguntas.map(escapeHtml).join(', ')}.`,
    ...(e.catastro ? [escapeHtml(e.catastro)] : []),
    ...e.destinatarios.map(escapeHtml),
    '💬 En su campana: «Estamos revisando la renovación de tu seguro de hogar; necesitamos unos datos» (y un correo de aviso, sin datos).',
    e.publicable ? '🔒 No sale nada hasta que pulses ✅.' : '⛔ Nadie que pueda contestar usa la app: no se puede enviar por aquí.',
  ]
  return lineas.join('\n')
}

/** Botones: ✅ solo si hay a quién (si no, se diría «enviado» sin destinatario); ✏️ siempre (la póliza, con sesión). */
export function botonesRevisionDatos(solicitudId: string, urlModificar: string, publicable: boolean): Boton[][] {
  return [
    ...(publicable ? [[{ texto: '✅ Enviar al cliente (app)', callback: `${CALLBACK_ENVIAR_DATOS}:${solicitudId}` }]] : []),
    [{ texto: '✏️ Modificar', url: urlModificar }],
  ]
}

export type DecisionBotonDatos = { ok: true; solicitudId: string } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO); sin chat configurado, nadie. PURA. */
export function decidirBotonDatos(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonDatos {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (accion !== 'env' || args.length !== 1 || !UUID.test(args[0] ?? '')) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, solicitudId: args[0].toLowerCase() }
}

/** Historial interno al preparar. Sin datos personales. */
export function lineaHistorialPreparadaDatos(n: number): string {
  return `Solicitud de datos de la renovación de hogar preparada (${n === 1 ? 'una pregunta' : `${n} preguntas`}): pendiente de la revisión de Alberto, no ha salido nada al cliente.`
}

/** ¿Desde Telegram, es el ÚLTIMO mensaje de revisión? (rehacer la solicitud deja viejo el anterior). PURA. */
export function mensajeVigente(via: 'telegram' | 'pantalla', pedido: number | null | undefined, ultimo: number | null): { ok: true } | { ok: false; motivo: string } {
  if (via === 'pantalla') return { ok: true }
  if (typeof pedido !== 'number' || !Number.isInteger(pedido)) return { ok: false, motivo: 'Desde Telegram hace falta el mensaje del botón: no se envía sin él.' }
  if (ultimo !== pedido) return { ok: false, motivo: 'Ese mensaje no es el último de esta solicitud (se rehízo): usa el más reciente.' }
  return { ok: true }
}
