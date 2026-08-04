// ────────────────────────────────────────────────────────────────────────────
// Análisis profundo documental: el embudo de Alberto es «primero rentabilidad,
// y si cuadra, comprobar que no hay problema y que la documentación es clara».
// Esta es la segunda etapa: un checklist DETERMINISTA de las casuísticas de
// subasta (cargas, posesión, proindiviso, herencia yacente, vivienda habitual,
// valoración, documentación legible) que resume en un semáforo:
//   🟢 verde  = nada bloquea; documentación clara
//   🟡 ámbar  = dudas que hay que verificar antes de pujar
//   🔴 rojo   = problema serio detectado (ocupación, proindiviso, cargas vivas)
// PURO: entra la subasta normalizada + las notas ya extraídas del edicto.
// ────────────────────────────────────────────────────────────────────────────

import type { SubastaInmueble } from './types.ts'
import { titularCargas, type AdjuntoFicha } from './cargas.ts'

export type Nivel = 'verde' | 'ambar' | 'rojo'

export interface PuntoAnalisis {
  clave: string
  nivel: Nivel
  detalle: string
}

export interface AnalisisDocumental {
  semaforo: Nivel
  puntos: PuntoAnalisis[]
}

/**
 * Checklist documental. `notasEdicto` son las líneas que el enriquecedor ya
 * extrajo de los documentos de la ficha (`notasDeEdicto`): NULL = documentos
 * aún no procesados; '' = procesados sin hallazgos.
 */
export function analisisDocumental(
  s: SubastaInmueble,
  notasEdicto: string | null | undefined,
  documentos?: AdjuntoFicha[] | null,
  /** `false` en las fuentes sin ficha documental (Junta): ahí no hay nada que revisar. */
  publicaAdjuntos = true,
): AnalisisDocumental {
  const puntos: PuntoAnalisis[] = []
  const notas = notasEdicto ?? null
  // Cuántos adjuntos se han llegado a LEER de verdad. `undefined` = quien llama
  // no pasa el listado (comportamiento antiguo): solo se mira `notas == null`.
  const leidos = documentos == null ? null : documentos.filter((d) => d.legible === true).length

  // ── Posesión: el mayor riesgo real de una subasta ─────────────────────────
  const posesion = s.situacionPosesoria ?? 'desconocida'
  if (posesion === 'libre') {
    puntos.push({ clave: 'posesion', nivel: 'verde', detalle: 'Anunciada libre de ocupantes.' })
  } else if (posesion === 'desconocida') {
    puntos.push({ clave: 'posesion', nivel: 'ambar', detalle: 'La situación posesoria no consta: verificar antes de pujar.' })
  } else {
    puntos.push({ clave: 'posesion', nivel: 'rojo', detalle: 'Ocupada o con indicios de ocupación: el desalojo puede llevar años.' })
  }

  // ── Cargas anteriores (las que NO se cancelan con la adjudicación) ────────
  // Seis estados y no dos. La frase la pone `titularCargas` —la MISMA que pinta
  // el titular de la ficha— a propósito: cuando este punto tenía su propia copia
  // del texto, la ficha y el desplegable llegaron a decir cosas distintas de la
  // misma subasta (01/08/2026, SUB-JA-2026-264478). Aquí solo se traduce el
  // emoji a nivel del semáforo.
  const cargas = titularCargas({ cargas: s.cargas, cargasConocidas: s.cargasConocidas, documentos, publicaAdjuntos })
  puntos.push({
    clave: 'cargas',
    nivel: cargas.emoji === '🔴' ? 'rojo' : cargas.emoji === '🟢' ? 'verde' : 'ambar',
    detalle: cargas.texto,
  })

  // ── Proindiviso: se compra un problema, no un inmueble ────────────────────
  const pct = s.porcentajeSubastado ?? 100
  if (pct < 100) {
    puntos.push({ clave: 'proindiviso', nivel: 'rojo', detalle: `Solo se subasta el ${pct}% del inmueble (proindiviso).` })
  }

  // ── Señales del edicto (extraídas de los documentos de la ficha) ──────────
  if (notas == null) {
    puntos.push({ clave: 'documentacion', nivel: 'ambar', detalle: 'Documentos de la ficha aún sin procesar (o escaneados sin texto).' })
  } else {
    // 🚨 `notas === ''` significa «procesado sin hallazgos», y eso solo vale si
    // se llegó a LEER algo. Con la ficha sin adjuntos, o con todos escaneados
    // sin capa de texto, no se ha leído un solo carácter: dar el semáforo por
    // claro sería declarar limpia una documentación que nadie ha abierto — y
    // ese semáforo viaja por Telegram y decide si se puja.
    if (leidos === 0) {
      puntos.push({
        clave: 'documentacion',
        nivel: 'ambar',
        detalle: documentos!.length === 0
          ? 'La ficha no publica edicto ni certificación: no hay documentación que analizar.'
          : 'Los adjuntos de la ficha son escaneados sin texto: hay que leerlos a mano antes de pujar.',
      })
    }
    if (/herencia yacente/i.test(notas)) {
      puntos.push({ clave: 'herencia', nivel: 'ambar', detalle: 'Ejecución contra herencia yacente: plazos procesales más largos.' })
    }
    if (/vivienda habitual del demandado:\s*s[ií]/i.test(notas)) {
      puntos.push({ clave: 'vivienda_habitual', nivel: 'ambar', detalle: 'Vivienda habitual del demandado: el lanzamiento puede prorrogarse.' })
    }
    // Sin esto, una certificación con embargo pero «sin cargas de procedencia»
    // pondría el punto de cargas en verde y el embargo quedaría invisible.
    if (/anotaci[oó]n de EMBARGO/i.test(notas)) {
      puntos.push({ clave: 'embargo', nivel: 'ambar', detalle: 'Anotación de embargo en la certificación: verificar importe, vigencia y si es posterior (se cancelaría con la adjudicación).' })
    }
  }

  // ── Valoración: ¿con qué se está comparando el precio? ────────────────────
  if (s.tasacion == null && s.valorReferencia == null) {
    puntos.push({
      clave: 'valoracion',
      nivel: 'ambar',
      detalle: s.precioM2Mercado != null
        ? 'Sin tasación ni valor de referencia: el valor está estimado con anuncios de la zona.'
        : 'Sin tasación, valor de referencia ni comparables: precio sin contraste.',
    })
  }

  // ── Identificación registral/catastral ────────────────────────────────────
  if (!s.refCatastral) {
    puntos.push({ clave: 'identificacion', nivel: 'ambar', detalle: 'Sin referencia catastral publicada: identificar la finca antes de pujar.' })
  }

  const semaforo: Nivel = puntos.some((p) => p.nivel === 'rojo')
    ? 'rojo'
    : puntos.some((p) => p.nivel === 'ambar')
      ? 'ambar'
      : 'verde'

  return { semaforo, puntos }
}
