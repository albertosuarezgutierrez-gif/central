/**
 * Lo que el portal YA SABE y puede ofrecerle precargado a la persona cuando se
 * pone un recordatorio, en vez de hacérselo teclear.
 *
 * Nace de una pregunta de Alberto (21/09/2026) mirando la pestaña: «esto se
 * podría automatizar más… ¿tienes datos de clientes?». Sí, de dos:
 *
 *  · el **carné de conducir**, que ya calcula `caducidadCarnet()` en
 *    `apps/asegura` con la fecha de expedición y la de nacimiento (las dos
 *    cifradas: aquí solo llega el resultado, ver `CarnetParaAviso`);
 *  · la **ITV**, que sale de aplicar la periodicidad legal a la fecha de
 *    matriculación (`proximaItv()`).
 *
 * 🚨 LA DECISIÓN QUE SOSTIENE ESTE FICHERO: las dos NO valen lo mismo, y por eso
 * `confianza` no es un adorno ni una decisión de la pantalla.
 *
 *  · `firme` → sale de fechas REALES de la ficha y de una cuenta legal exacta.
 *    Se puede meter sola en el formulario, igual que ya se autorrellena la
 *    matrícula en el parte de siniestro: es una sugerencia editable, no un dato
 *    impuesto.
 *  · `calculada` → hay al menos una suposición por debajo (la matriculación
 *    estimada de la matrícula, o el suponer que ha ido pasando las ITV en su
 *    aniversario). **No se mete sola**: se ENSEÑA y solo entra si la persona la
 *    acepta, que es el mismo trato que reciben los metros del Catastro.
 *    Autorrellenarla dejaría que alguien pulse «Guardar» sin mirar y se lleve
 *    una fecha que puede estar a meses de la suya.
 *
 * Quien pinte esto no puede decidir por su cuenta meter una `calculada` en el
 * campo: la calidad del dato se decide aquí, con test, no en el JSX.
 */
import { fechaMatriculacionEstimada } from '@central/module-seguros'

import { perfilItvDeRamo, proximaItv } from './itv.ts'
import type { CarnetParaAviso } from './avisos.ts'
import { TITULO_MAX, type TipoRecordatorio } from './recordatorio-libre.ts'

/** Qué se ha tenido que suponer para llegar a la fecha. Ver la cabecera. */
export type ConfianzaPrecarga = 'firme' | 'calculada'

export type PrecargaRecordatorio = {
  /**
   * Identificador ESTABLE y único de esta precarga, para que la pantalla tenga
   * `key`. No vale el título: dos carnés del mismo tipo (uno renovado) darían
   * la misma cadena y React fundiría las dos filas en una sin que nada fallara.
   * Sale de la fila de origen — el id del carné, o el valor de la póliza.
   */
  id: string
  /** La sugerencia del catálogo a la que pertenece (`SUGERENCIAS_RECORDATORIO`). */
  clave: 'carnet' | 'itv'
  tipo: TipoRecordatorio
  titulo: string
  /** `YYYY-MM-DD`. */
  fecha: string
  repiteCadaMeses: number | null
  /** `cartera:<id>` / `declarada:<id>` del bien, o `null` si no cuelga de ninguno. */
  polizaValor: string | null
  confianza: ConfianzaPrecarga
  /**
   * Qué hay que decirle a la persona antes de que acepte la fecha. `null` solo
   * cuando no hay nada que advertir — y eso únicamente pasa con las `firme`.
   */
  aviso: string | null
}

/** Lo mínimo que hace falta de una póliza para poder calcularle la ITV. */
export type PolizaParaPrecarga = {
  /** `cartera:<id>` / `declarada:<id>`: el mismo `valor` que usa el selector. */
  valor: string
  /** Código de ramo de la BD (`'auto'`, `'moto'`…), no la etiqueta traducida. */
  ramo?: string | null
  /** `bien.matricula` de la cartera, o la columna propia de una declarada. */
  matricula?: string | null
  /**
   * La fecha de matriculación EXACTA, si alguien la ha declarado (solo la traen
   * algunas pólizas que aporta el propio cliente). Cuando falta se estima desde
   * la matrícula, y entonces el aviso lo dice.
   */
  fechaMatriculacion?: string | null
}

export type EntradaPrecargas = {
  /** `null` = el puente a `apps/asegura` no se ha podido leer (≠ «no tiene carné»). */
  carnets: CarnetParaAviso[] | null
  polizas: readonly PolizaParaPrecarga[]
  hoy: Date
}

export type Precargas = {
  precargas: PrecargaRecordatorio[]
  /** `true` = no se ha podido mirar si tiene carné. La pantalla lo DICE, no lo calla. */
  carnetsIlegibles: boolean
}

const AVISO_ITV_PRIMERA =
  'Calculado con la antigüedad del vehículo: es su primera ITV, así que no depende de ninguna revisión anterior. Si es una furgoneta o un vehículo de trabajo, los plazos legales son otros.'

const AVISO_ITV_CICLO =
  'Calculado con la antigüedad del vehículo, suponiendo que has ido pasando las revisiones en su fecha. Si la última la pasaste antes o después, la tuya es otra: mira la pegatina o el informe de la última ITV. Si es una furgoneta o un vehículo de trabajo, los plazos legales son otros.'

const AVISO_ITV_MATRICULACION_ESTIMADA =
  ' La fecha de matriculación la hemos estimado a partir de la matrícula, así que puede bailar unas semanas.'

/** Recorta al máximo que acepta `normalizarRecordatorio()`: un título más largo
 *  se rechazaría al guardar y la persona vería un error que no ha provocado. */
function titulo(texto: string): string {
  return texto.length > TITULO_MAX ? texto.slice(0, TITULO_MAX).trimEnd() : texto
}

/**
 * Compone lo que se le puede ofrecer precargado.
 *
 * El carné va primero: es lo único `firme`, y lo que más cuesta renovar tarde
 * (cita en la DGT, y reconocimiento médico a partir de los 65). Las ITV van
 * después por fecha, de la más cercana a la más lejana.
 */
export function precargasDeRecordatorio(x: EntradaPrecargas): Precargas {
  const precargas: PrecargaRecordatorio[] = []

  const hoyIso = `${x.hoy.getUTCFullYear()}-${String(x.hoy.getUTCMonth() + 1).padStart(2, '0')}-${String(
    x.hoy.getUTCDate(),
  ).padStart(2, '0')}`

  for (const c of x.carnets ?? []) {
    // La fecha viene ya calculada por `caducidadCarnet()`; aquí solo se
    // comprueba que es una fecha, para no meter basura en el `<input type=date>`.
    const caduca = c.fechaCaducidad.trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(caduca)) continue
    // 🚨 Un carné YA CADUCADO no se ofrece como recordatorio, y no por
    // cosmética: la fecha caería en el pasado, así que el recordatorio no
    // entraría nunca en la ventana de aviso (`entraEnVentana`) y, como el carné
    // no se repite, no avisaría jamás. Le habríamos hecho guardar algo que no
    // sirve. El mismo corte de futuro que ya aplica `entraEnVentanaCarnet()` en
    // la campana. ⚠️ Que un carné caducado no se pueda RECORDAR no quiere decir
    // que no haya que decírselo: eso es un aviso, y hoy no lo da nadie — queda
    // anotado, no resuelto aquí.
    if (caduca < hoyIso) continue
    precargas.push({
      id: `carnet:${c.id}`,
      clave: 'carnet',
      tipo: 'carnet',
      titulo: titulo(`Carnet de conducir (${c.tipo})`),
      fecha: caduca,
      // 🚨 A propósito NO se repite, aunque el catálogo ofrezca «cada 10 años»
      // cuando se pone a mano: la vigencia del carné baja a 5 años a partir de
      // los 65, y esta capa NO conoce la edad (la fecha de nacimiento va
      // cifrada y nunca cruza el puente). Un ciclo de 10 años puesto a alguien
      // de 66 sería un plazo inventado. Cuando renueve, su carné nuevo trae la
      // fecha buena y la campana ya la vigila desde la ficha.
      repiteCadaMeses: null,
      polizaValor: null,
      confianza: 'firme',
      aviso: null,
    })
  }

  const conItv: { p: PrecargaRecordatorio; fecha: string }[] = []
  for (const pol of x.polizas) {
    const perfil = perfilItvDeRamo(pol.ramo)
    if (perfil === null) continue

    // Orden deliberado: lo declarado gana a lo estimado. Es la misma escalera de
    // procedencias que ya aplica `debeSustituir()` — una estimación no pisa
    // jamás un dato que alguien ha declarado.
    const declarada =
      typeof pol.fechaMatriculacion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pol.fechaMatriculacion.trim())
        ? pol.fechaMatriculacion.trim()
        : null
    const estimada = declarada === null && pol.matricula ? fechaMatriculacionEstimada(pol.matricula) : null
    const fechaMatriculacion = declarada ?? estimada?.estimada ?? null
    if (fechaMatriculacion === null) continue

    const itv = proximaItv({ fechaMatriculacion, perfil, hoy: x.hoy })
    if (itv === null) continue

    const base = itv.fiabilidad === 'primera' ? AVISO_ITV_PRIMERA : AVISO_ITV_CICLO
    conItv.push({
      fecha: itv.fecha,
      p: {
        id: `itv:${pol.valor}`,
        clave: 'itv',
        tipo: 'itv',
        // Lo que identifica el vehículo para su dueño es la matrícula, no el nº
        // de póliza (regla del portal). Sin ella, «ITV» a secas y que lo
        // distinga el seguro al que se cuelga.
        titulo: titulo(pol.matricula ? `ITV de ${pol.matricula}` : 'ITV'),
        fecha: itv.fecha,
        // La del TRAMO que le toca, no el «cada año» fijo del catálogo: un coche
        // de 5 años es bienal, y avisarle cada 12 meses le haría ir a la ITV un
        // año antes de que le tocara.
        repiteCadaMeses: itv.periodicidadMeses,
        polizaValor: pol.valor,
        confianza: 'calculada',
        aviso: declarada !== null ? base : `${base}${AVISO_ITV_MATRICULACION_ESTIMADA}`,
      },
    })
  }

  conItv.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  precargas.push(...conItv.map((c) => c.p))

  return { precargas, carnetsIlegibles: x.carnets === null }
}
