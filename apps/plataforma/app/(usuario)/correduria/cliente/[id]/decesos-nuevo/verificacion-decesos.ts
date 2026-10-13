// Lógica PURA (sin JSX) de la «Verificación antes de pedir precio» del cotizador de DECESOS embebido en la oportunidad
// (13/10/2026; hermana de `../auto-nuevo/verificacion-embebido.ts`, que da los tipos y `verificacionCompleta`).
//
// Regla de Alberto: «los campos son siempre los de Avant2». Lo que Avant2 lleva en decesos
// (`apps/asegura/lib/codeoscopic/peticion-decesos.ts`): `holder` (el tomador: persona entera con estado civil y
// teléfono), `risk.insureds[]` (`NaturalPerson_V1`: el tomador y los asegurados — nombre, apellidos, nacimiento, sexo,
// documento opcional) y `effectiveDate`. NO hay capital, modalidad, forma de pago, parentesco ni seguro anterior: aquí
// no se piden ni se marcan.
//
// SALUD (13/10/2026) reutiliza esta misma verificación (`ramo: 'salud'`): su petición (`peticion-salud.ts`) lleva
// exactamente lo mismo — `holder`, `risk.insureds[]` y `effectiveDate`; capital y modalidad son notas que NO viajan.
//
// Cada ✗ sale de lo mismo que apaga el botón de 0,50€; un `faltaAlgo` sin ✗ que lo explique añade uno genérico (nunca
// un ✓ falso). Lo cubre `verificacion-decesos.test.ts`.
import { CLAVES_HISTORIAL_DECLARADO } from '@central/module-seguros'
import type { GrupoVerificacion, ItemVerificacion } from '../auto-nuevo/verificacion-embebido'
import { textoFaltan, type Riesgo } from '../../../../../../lib/riesgo-asegura.ts'
import { personasDelRol } from '../../../oportunidad/[id]/figuras-form.ts'

/** Ids de los bloques (de la pantalla del riesgo y de este cotizador) a los que llevan los enlaces. */
export const ANCLA_DECESOS = {
  intervinientes: 'intervinientes',
  tomadorArriba: 'interviniente-tomador',
  datosRiesgo: 'datos-riesgo',
  historial: 'historial-riesgo',
  tomadorAqui: 'cotizador-tomador',
  efectoAqui: 'cotizador-efecto',
} as const

export type AseguradoVerificacion = {
  clienteId: string
  nombre: string
  /** Lo que falta en SU ficha para viajar a Avant2 (`faltanDeAseguradoFicha` de asegura). `null` = no se pudo leer. */
  faltan: string[] | null
  /** Texto de lo que falta, ya en castellano (`textoFaltan`). */
  textoFalta: string | null
  empresa: boolean
}

export type EntradaVerificacionDecesos = {
  /** El ramo de personas con `risk.insureds[]` (decesos por defecto; salud tiene la misma forma). */
  ramo?: 'decesos' | 'salud'
  tomador: {
    /** No se pudo precalificar su ficha: no se sabe qué falta (el servidor corta antes de gastar). */
    sinPrecalificar: boolean
    faltaCivil: boolean
    aMano: { campo: string; etiqueta: string; relleno: boolean }[]
    /** Lo que falta en su ficha y aquí no se teclea: se corrige arriba («Editar datos» del tomador). */
    enFicha: { campo: string; motivo: string }[]
  }
  /** Las figuras `asegurado` del riesgo, ya sin el tomador (él es siempre el primero de `insureds`). */
  asegurados: AseguradoVerificacion[]
  /** `riesgo.figurasMulti`: si la BD admite asegurados con ficha. */
  figurasMulti: 'disponible' | 'sin_migracion' | 'desconocido' | null
  /** Asegurados TECLEADOS (texto, sin ficha) en «Datos del riesgo». No viajan: la lista de Avant2 sale de las fichas. */
  aseguradosSinFicha: number
  efecto: { vacia: boolean; fueraDeLimites: boolean }
  /** Arriba («Historial y bonificaciones») hay algo declarado: Avant2 no lo admite en decesos y no viaja. */
  historialDeclarado: boolean
  faltaAlgo: boolean
}

const estado = (falta: boolean) => (falta ? ('falta' as const) : ('ok' as const))

export function gruposVerificacionDecesos(e: EntradaVerificacionDecesos): GrupoVerificacion[] {
  const t = e.tomador
  const ramo = e.ramo ?? 'decesos'
  const figuras: ItemVerificacion[] = []
  const arribaTomador = { ancla: ANCLA_DECESOS.tomadorArriba, alternativa: ANCLA_DECESOS.intervinientes, arriba: true } as const
  if (t.sinPrecalificar) {
    figuras.push({ clave: 'tomador-precalificar', texto: 'Tomador: no se ha podido precalificar su ficha', estado: 'aviso', nota: 'no se sabe qué datos personales faltan; el servidor corta antes de gastar si falta algo', ...arribaTomador })
  }
  figuras.push({ clave: 'tomador-civil', texto: 'Estado civil del tomador', estado: estado(t.faltaCivil), ancla: ANCLA_DECESOS.tomadorAqui })
  for (const f of t.aMano) figuras.push({ clave: `tomador-${f.campo}`, texto: `${f.etiqueta} del tomador`, estado: estado(!f.relleno), ancla: ANCLA_DECESOS.tomadorAqui })
  for (const f of t.enFicha) {
    figuras.push({ clave: `tomador-ficha-${f.campo}`, texto: `Ficha del tomador: ${f.campo}`, estado: 'falta', nota: `${f.motivo} — «Editar datos» del tomador en «Intervinientes»`, ...arribaTomador })
  }

  // Asegurados: cada uno es una FICHA (identidad por id, nunca por nombre). Lo que falta es lo de Avant2.
  for (const a of e.asegurados) {
    const arriba = { ancla: ANCLA_DECESOS.intervinientes, arriba: true } as const
    if (a.empresa || (a.faltan ?? []).includes('empresa_no_asegurada')) {
      figuras.push({ clave: `asegurado-${a.clienteId}`, texto: `Asegurado ${a.nombre}: es una empresa`, estado: 'falta', nota: `un asegurado de ${ramo} tiene que ser una persona: quítalo de «Intervinientes»`, ...arriba })
    } else if (a.faltan === null) {
      // No se pudo leer AQUÍ: el servidor la vuelve a leer y, si no puede, corta antes de pagar. Aviso, no ✓.
      figuras.push({ clave: `asegurado-${a.clienteId}`, texto: `Asegurado ${a.nombre}: no se pudo leer su ficha`, estado: 'aviso', nota: 'si sigue sin leerse, no se pide precio (no se cotiza con menos personas)', ...arriba })
    } else if (a.faltan.length > 0) {
      figuras.push({ clave: `asegurado-${a.clienteId}`, texto: `Ficha del asegurado ${a.nombre}`, estado: 'falta', nota: `${a.textoFalta ?? a.faltan.join(', ')} — «Editar datos» en «Intervinientes»`, ...arriba })
    } else {
      figuras.push({ clave: `asegurado-${a.clienteId}`, texto: `Asegurado ${a.nombre}`, estado: 'ok' })
    }
  }
  if (e.figurasMulti === 'sin_migracion') {
    figuras.push({ clave: 'asegurados-migracion', texto: 'Asegurados con ficha: pendiente de migración', estado: 'aviso', nota: 'hasta entonces solo se asegura al tomador', ancla: ANCLA_DECESOS.intervinientes, arriba: true })
  } else if (e.figurasMulti !== 'disponible') {
    figuras.push({ clave: 'asegurados-desconocido', texto: 'No se ha podido comprobar si este riesgo admite asegurados con ficha', estado: 'aviso', nota: 'se cotiza con los que consten en «Intervinientes»', ancla: ANCLA_DECESOS.intervinientes, arriba: true })
  }
  if (e.aseguradosSinFicha > 0) {
    figuras.push({
      clave: 'asegurados-sin-ficha',
      texto: e.aseguradosSinFicha === 1 ? 'Hay 1 asegurado tecleado sin ficha' : `Hay ${e.aseguradosSinFicha} asegurados tecleados sin ficha`,
      estado: 'falta',
      nota: 'no viajan a la compañía (se cotizaría con menos personas): añádelos como asegurados en «Intervinientes» y quítalos de la lista de «Datos del riesgo»',
      ancla: ANCLA_DECESOS.datosRiesgo,
      alternativa: ANCLA_DECESOS.intervinientes,
      arriba: true,
    })
  }
  const n = 1 + e.asegurados.length
  figuras.push({ clave: 'personas', texto: n === 1 ? 'Se asegura solo al tomador' : `Se aseguran ${n} personas (el tomador y ${n - 1 === 1 ? '1 asegurado' : `${n - 1} asegurados`})`, estado: 'ok' })

  const riesgo: ItemVerificacion[] = [
    e.efecto.fueraDeLimites
      ? { clave: 'efecto', texto: 'Fecha de efecto', estado: 'falta', nota: 'fuera de las fechas que admite la compañía', ancla: ANCLA_DECESOS.efectoAqui }
      : { clave: 'efecto', texto: e.efecto.vacia ? 'Fecha de efecto: la de por defecto (para que el precio siga valiendo al emitir)' : 'Fecha de efecto', estado: 'ok' },
  ]

  const grupos: GrupoVerificacion[] = [
    { titulo: '1 · Figuras (tomador y asegurados)', items: figuras },
    { titulo: `2 · Riesgo: ${ramo}`, items: riesgo },
  ]
  if (e.historialDeclarado) {
    grupos.push({
      titulo: '3 · Historial y bonificaciones',
      items: [{ clave: 'historial-no-viaja', texto: 'Lo declarado en «Historial y bonificaciones» no viaja', estado: 'aviso', nota: `Avant2 no admite seguro anterior en ${ramo}: queda para el expediente`, ancla: ANCLA_DECESOS.historial, arriba: true }],
    })
  }
  if (e.faltaAlgo && grupos.every((g) => g.items.every((i) => i.estado !== 'falta'))) {
    figuras.push({ clave: 'otro', texto: 'Falta algún dato más del formulario', estado: 'falta', nota: 'revisa los campos marcados «falta» en este cotizador' })
  }
  return grupos
}

/**
 * PURA. Lo que la verificación lee del RIESGO (lo de arriba): los asegurados con ficha (sin el tomador, una vez cada
 * ficha), si la BD los admite, cuántos hay tecleados sin ficha y si hay historial declarado. `tomadorId` es el del
 * cotizador (`tomadorDelRiesgo`).
 */
export function desdeRiesgoDecesos(r: Riesgo, tomadorId: string): Pick<EntradaVerificacionDecesos, 'asegurados' | 'figurasMulti' | 'aseguradosSinFicha' | 'historialDeclarado'> {
  const asegurados = personasDelRol(r.figuras, 'asegurado')
    .filter((f) => f.clienteId !== tomadorId)
    .map((f) => ({ clienteId: f.clienteId, nombre: f.nombre, faltan: f.faltan, textoFalta: textoFaltan(f.faltan), empresa: f.empresa }))
  const b = r.datosRiesgo
  const tecleados = b !== null && b.clave === 'datosCapital' ? (b.datos as { asegurados?: unknown }).asegurados : null
  const hd = r.historial?.historialDeclarado ?? null
  const fm = r.figurasMulti
  return {
    asegurados,
    figurasMulti: fm === 'disponible' || fm === 'sin_migracion' || fm === 'desconocido' ? fm : null,
    aseguradosSinFicha: Array.isArray(tecleados) ? tecleados.length : 0,
    historialDeclarado: hd !== null && CLAVES_HISTORIAL_DECLARADO.some((k) => hd[k] !== null && hd[k] !== undefined),
  }
}
