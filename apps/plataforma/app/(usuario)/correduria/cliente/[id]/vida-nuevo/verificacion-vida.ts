// Lógica PURA (sin JSX) de la «Verificación antes de pedir precio» del cotizador de VIDA embebido en la oportunidad
// (13/10/2026; hermana de `../decesos-nuevo/verificacion-decesos.ts`, que da los tipos comunes de `verificacion-embebido`).
//
// Regla de Alberto: «los campos son siempre los de Avant2». Lo que Avant2 lleva en vida
// (`apps/asegura/lib/codeoscopic/peticion-vida.ts`): `holder` (el tomador: persona entera con estado civil y teléfono),
// `risk.insured` = UNA persona asegurada propia (`TermLifeRisk_V1`): el tomador o, si el riesgo tiene una figura
// `asegurado` que no lo es, ESA ficha (`NaturalPerson_V1`: nombre, apellidos, nacimiento, sexo; DNI opcional) — más
// `economicOccupation.code` (profesión CNO-11) y `smoker` (fumador) —, y `risk.deathBenefit` (el capital, obligatorio),
// con `effectiveDate`. NO hay duración, beneficiarios, peso/altura ni seguro anterior: aquí no se piden ni se marcan.
// Más de un asegurado distinto no cabe en `insured`: ✗.
//
// Cada ✗ sale de lo mismo que apaga el botón de 0,50€; un `faltaAlgo` sin ✗ que lo explique añade uno genérico (nunca
// un ✓ falso). Lo cubre `verificacion-vida.test.ts`.
import { CLAVES_HISTORIAL_DECLARADO } from '@central/module-seguros'
import type { GrupoVerificacion, ItemVerificacion } from '../auto-nuevo/verificacion-embebido'
import { textoFaltan, type Riesgo } from '../../../../../../lib/riesgo-asegura.ts'
import { eur } from '../../../../../../lib/dinero.ts'
import { personasDelRol } from '../../../oportunidad/[id]/figuras-form.ts'

/** Ids de los bloques (de la pantalla del riesgo y de este cotizador) a los que llevan los enlaces. */
export const ANCLA_VIDA = {
  intervinientes: 'intervinientes',
  tomadorArriba: 'interviniente-tomador',
  datosRiesgo: 'datos-riesgo',
  historial: 'historial-riesgo',
  tomadorAqui: 'cotizador-tomador',
  efectoAqui: 'cotizador-efecto',
} as const

const RE_CNO = /^\d{4}$/

/** Lo que viaja de «Datos del riesgo» (`info_riesgo.datosCapital`). `null` = no consta (no se manda). */
export type DatosVidaVerificacion = { capital: number | null; profesion: string | null; fumador: boolean | null }

export type EntradaVerificacionVida = {
  tomador: {
    sinPrecalificar: boolean
    faltaCivil: boolean
    aMano: { campo: string; etiqueta: string; relleno: boolean }[]
    enFicha: { campo: string; motivo: string }[]
  }
  /**
   * Figuras `asegurado` que NO son el tomador (`[]` = se asegura al tomador). Una = viaja como `risk.insured` desde su
   * ficha; más de una no cabe. `faltan` como en decesos: `null` = no se pudo leer su ficha (aviso, el servidor corta).
   */
  aseguradosDistintos: { clienteId: string; nombre: string; faltan: string[] | null; textoFalta: string | null; empresa: boolean }[]
  /** `null` = no se ha podido leer «Datos del riesgo» (nunca «sin datos»). */
  datos: DatosVidaVerificacion | null
  /** Lo que el vendor EXIGE del asegurado (`person-roles`, llega como hueco `profesion`/`fumador` al precalificar). */
  exige: { profesion: boolean; fumador: boolean }
  efecto: { vacia: boolean; fueraDeLimites: boolean }
  historialDeclarado: boolean
  faltaAlgo: boolean
}

const estado = (falta: boolean) => (falta ? ('falta' as const) : ('ok' as const))

export function gruposVerificacionVida(e: EntradaVerificacionVida): GrupoVerificacion[] {
  const t = e.tomador
  const figuras: ItemVerificacion[] = []
  const arribaTomador = { ancla: ANCLA_VIDA.tomadorArriba, alternativa: ANCLA_VIDA.intervinientes, arriba: true } as const
  if (t.sinPrecalificar) {
    figuras.push({ clave: 'tomador-precalificar', texto: 'Tomador: no se ha podido precalificar su ficha', estado: 'aviso', nota: 'no se sabe qué datos personales faltan; el servidor corta antes de gastar si falta algo', ...arribaTomador })
  }
  figuras.push({ clave: 'tomador-civil', texto: 'Estado civil del tomador', estado: estado(t.faltaCivil), ancla: ANCLA_VIDA.tomadorAqui })
  for (const f of t.aMano) figuras.push({ clave: `tomador-${f.campo}`, texto: `${f.etiqueta} del tomador`, estado: estado(!f.relleno), ancla: ANCLA_VIDA.tomadorAqui })
  for (const f of t.enFicha) {
    figuras.push({ clave: `tomador-ficha-${f.campo}`, texto: `Ficha del tomador: ${f.campo}`, estado: 'falta', nota: `${f.motivo} — «Editar datos» del tomador en «Intervinientes»`, ...arribaTomador })
  }
  const arribaInter = { ancla: ANCLA_VIDA.intervinientes, arriba: true } as const
  if (e.aseguradosDistintos.length === 0) {
    figuras.push({ clave: 'asegurado', texto: 'Se asegura al tomador', estado: 'ok' })
  } else if (e.aseguradosDistintos.length > 1) {
    figuras.push({ clave: 'asegurado-varios', texto: `${e.aseguradosDistintos.length} asegurados además del tomador`, estado: 'falta', nota: 'en vida Avant2 lleva UNA persona asegurada: deja una sola en «Intervinientes»', ...arribaInter })
  } else {
    const a = e.aseguradosDistintos[0]
    if (a.empresa || (a.faltan ?? []).includes('empresa_no_asegurada')) {
      figuras.push({ clave: 'asegurado', texto: `Asegurado ${a.nombre}: es una empresa`, estado: 'falta', nota: 'el asegurado de vida tiene que ser una persona: quítalo de «Intervinientes»', ...arribaInter })
    } else if (a.faltan === null) {
      figuras.push({ clave: 'asegurado', texto: `Asegurado ${a.nombre}: no se pudo leer su ficha`, estado: 'aviso', nota: 'si sigue sin leerse, no se pide precio (no se cotiza a otra persona)', ...arribaInter })
    } else if (a.faltan.length > 0) {
      figuras.push({ clave: 'asegurado', texto: `Ficha del asegurado ${a.nombre}`, estado: 'falta', nota: `${a.textoFalta ?? a.faltan.join(', ')} — «Editar datos» en «Intervinientes»`, ...arribaInter })
    } else {
      figuras.push({ clave: 'asegurado', texto: `Asegurado ${a.nombre} (no es el tomador)`, estado: 'ok' })
    }
  }

  const riesgo: ItemVerificacion[] = []
  const arribaDatos = { ancla: ANCLA_VIDA.datosRiesgo, arriba: true } as const
  const d = e.datos
  if (d === null) {
    riesgo.push({ clave: 'datos', texto: 'No se han podido leer los «Datos del riesgo»', estado: 'falta', nota: 'sin el capital no se pide precio', ...arribaDatos })
  } else {
    riesgo.push(d.capital !== null && d.capital > 0
      ? { clave: 'capital', texto: `Capital asegurado: ${eur(d.capital)}`, estado: 'ok' }
      : { clave: 'capital', texto: 'Capital asegurado', estado: 'falta', nota: 'obligatorio en vida: se teclea en «Datos del riesgo»', ...arribaDatos })
    const prof = d.profesion
    if (prof !== null && !RE_CNO.test(prof)) {
      riesgo.push({ clave: 'profesion', texto: 'Profesión (CNO-11)', estado: 'falta', nota: 'tiene que ser un código de 4 cifras', ...arribaDatos })
    } else if (prof === null) {
      riesgo.push(e.exige.profesion
        ? { clave: 'profesion', texto: 'Profesión (CNO-11)', estado: 'falta', nota: 'la exige la compañía: tecléala en «Datos del riesgo»', ...arribaDatos }
        : { clave: 'profesion', texto: 'Profesión: no consta', estado: 'aviso', nota: 'no se manda (no se supone)', ...arribaDatos })
    } else {
      riesgo.push({ clave: 'profesion', texto: `Profesión (CNO-11): ${prof}`, estado: 'ok' })
    }
    if (d.fumador === null) {
      riesgo.push(e.exige.fumador
        ? { clave: 'fumador', texto: '¿Fuma?', estado: 'falta', nota: 'lo exige la compañía: indícalo en «Datos del riesgo»', ...arribaDatos }
        : { clave: 'fumador', texto: '¿Fuma?: no consta', estado: 'aviso', nota: 'no se manda (nunca «no fuma» por defecto)', ...arribaDatos })
    } else {
      riesgo.push({ clave: 'fumador', texto: d.fumador ? 'Fuma' : 'No fuma', estado: 'ok' })
    }
  }
  riesgo.push(e.efecto.fueraDeLimites
    ? { clave: 'efecto', texto: 'Fecha de efecto', estado: 'falta', nota: 'fuera de las fechas que admite la compañía', ancla: ANCLA_VIDA.efectoAqui }
    : { clave: 'efecto', texto: e.efecto.vacia ? 'Fecha de efecto: la de por defecto (para que el precio siga valiendo al emitir)' : 'Fecha de efecto', estado: 'ok' })

  const grupos: GrupoVerificacion[] = [
    { titulo: e.aseguradosDistintos.length === 0 ? '1 · Figuras (tomador = asegurado)' : '1 · Figuras (tomador y asegurado)', items: figuras },
    { titulo: '2 · Riesgo: vida', items: riesgo },
  ]
  if (e.historialDeclarado) {
    grupos.push({
      titulo: '3 · Historial y bonificaciones',
      items: [{ clave: 'historial-no-viaja', texto: 'Lo declarado en «Historial y bonificaciones» no viaja', estado: 'aviso', nota: 'Avant2 no admite seguro anterior en vida: queda para el expediente', ancla: ANCLA_VIDA.historial, arriba: true }],
    })
  }
  if (e.faltaAlgo && grupos.every((g) => g.items.every((i) => i.estado !== 'falta'))) {
    figuras.push({ clave: 'otro', texto: 'Falta algún dato más del formulario', estado: 'falta', nota: 'revisa los campos marcados «falta» en este cotizador' })
  }
  return grupos
}

/**
 * PURA. Lo que la verificación lee del RIESGO (lo de arriba): los asegurados que no son el tomador (si los hay), lo que
 * viaja de «Datos del riesgo» y si hay historial declarado. `tomadorId` es el del cotizador (`tomadorDelRiesgo`).
 */
export function desdeRiesgoVida(r: Riesgo, tomadorId: string): Pick<EntradaVerificacionVida, 'aseguradosDistintos' | 'datos' | 'historialDeclarado'> {
  const otros = personasDelRol(r.figuras, 'asegurado')
    .filter((f) => f.clienteId !== tomadorId)
    .map((f) => ({ clienteId: f.clienteId, nombre: f.nombre, faltan: f.faltan, textoFalta: textoFaltan(f.faltan), empresa: f.empresa }))
  const b = r.datosRiesgo
  const datos = b !== null && b.clave === 'datosCapital' ? { capital: b.datos.capital, profesion: b.datos.profesion, fumador: b.datos.fumador } : null
  const hd = r.historial?.historialDeclarado ?? null
  return {
    aseguradosDistintos: otros,
    datos,
    historialDeclarado: hd !== null && CLAVES_HISTORIAL_DECLARADO.some((k) => hd[k] !== null && hd[k] !== undefined),
  }
}
