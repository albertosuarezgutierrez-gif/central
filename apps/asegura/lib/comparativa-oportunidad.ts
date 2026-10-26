// La COMPARATIVA de una oportunidad con TODAS sus fuentes (20/10/2026, comparativa única) — lo que plataforma
// pide al abrir la oportunidad. GRATIS: solo lee lo que ya está guardado (ni Codeoscopic ni IA).
//
//   · Ofertas de la oportunidad (`oportunidad_oferta`: PDF de compañía/competencia y bots) — no descartadas.
//   · La última cotización REAL de Avant2 de la oportunidad (`tarificaciones` + `tarificacion_precios`), el más
//     barato por compañía y nivel (`seleccionarAvant2`).
//   · La póliza actual de la CARTERA (si la oportunidad tiene `poliza_id` y no se ha subido ya su PDF como
//     «actual»), con la prima de `primaConRecibos` (la póliza miente por compañía) y las coberturas de CIMA.
//   → `compararOfertas` (el ÚNICO motor) + el último estudio guardado y si sigue VIGENTE (misma huella) + el aviso
//     de «ya hay una cotización del dd/mm» antes de pagar otra.
//
// 🛡️ Todo por `correduria_id`. 🚨 Nada sale al cliente; nada gasta.

import { avisoCotizacionGuardada, compararOfertas, etiquetaResumen, ofertaDeAvant2, ofertaDePolizaActual, primaConRecibos, seleccionarAvant2, type OfertaNormalizada, type ResultadoComparacion } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { prisma } from './tenant'
import { cargarPrecios } from './codeoscopic/tarificacion-guardada'
import { COSTE_COTIZACION_CENTS } from './codeoscopic/config'
import { numeroLeido, ofertaNormalizadaDeFila } from './documentos/oferta-leida'
import { leerOportunidadParaOfertas, ofertasDeOportunidad } from './oportunidad-ofertas'
import { huellaComparativa, ultimoEstudioGuardado } from './comparativa-guardada'
import { infoOfertasBot, type InfoOfertaBot } from './proyecto-comparativa'

import { MAX_AVANT2_EN_CUADRO } from './estudio-avant2'
export { MAX_AVANT2_EN_CUADRO }

export type Avant2Guardada = {
  cotizacionId: string
  creadaEn: string
  caducada: boolean
  precios: number
  enCuadro: number
  /** «Ya hay una cotización de Avant2 del 12/10: ábrela gratis. ¿Hacer una consulta nueva (0,50€)?» */
  aviso: string
}

export type ResultadoComparativaOportunidad =
  | {
      estado: 'ok'
      oportunidad: { id: string; ramo: string | null; ramoOferta: string; polizaId: string | null }
      comparacion: ResultadoComparacion
      /** Huella de lo que congelaría «Generar presupuesto» (ver `huellaCubre`): con ella se decide `guardado.vigente`. */
      huella: string
      /** Huella del CUADRO entero de esta respuesta (todas las fuentes, Avant2 y póliza de la cartera incluidas). */
      huellaCuadro: string
      /** Qué cubre cada huella, dicho (para que nadie compare una con la otra). */
      huellaCubre: { huella: string; huellaCuadro: string }
      guardado: { presupuestoId: string; generadoAt: string | null; vigente: boolean; etiqueta: string | null; narrativa: { resumen: string; recomendacion: string; fuente: string } | null } | null
      avant2: Avant2Guardada | null
      polizaCartera: 'incluida' | 'no_aplica' | 'ya_hay_actual' | 'no_encontrada'
      /** Por cada precio de bot: nº de proyecto, caducidad, verificación del PDF y «limpio / con supuestos» (26/10/2026). */
      ofertasBot: InfoOfertaBot[]
    }
  | { estado: 'no_encontrado' }

export async function comparativaDeOportunidad(correduriaId: string, oportunidadId: string): Promise<ResultadoComparativaOportunidad> {
  const op = await leerOportunidadParaOfertas(correduriaId, oportunidadId)
  if (!op) return { estado: 'no_encontrado' }
  const filas = (await ofertasDeOportunidad(correduriaId, op.id)).filter((f) => f.estado !== 'descartada')
  const deFilas = filas.map((f) => ofertaNormalizadaDeFila(f, { ramo: op.ramoOferta }))
  const recomendadaId = filas.find((f) => f.recomendada && f.rol === 'oferta')?.id ?? null
  const huella = huellaComparativa({ ramo: op.ramoOferta, ofertas: deFilas, superficieM2: op.superficieM2, recomendadaId })

  // La póliza de la cartera, solo si no hay ya una «actual» subida en PDF (no se compara dos veces lo mismo).
  let polizaCartera: 'incluida' | 'no_aplica' | 'ya_hay_actual' | 'no_encontrada' = 'no_aplica'
  const extras: OfertaNormalizada[] = []
  if (op.polizaId) {
    if (deFilas.some((o) => o.rol === 'actual')) polizaCartera = 'ya_hay_actual'
    else {
      const pol = await polizaParaComparar(correduriaId, op.clienteId, op.polizaId)
      if (pol) { extras.push(ofertaDePolizaActual(pol, op.ramoOferta)); polizaCartera = 'incluida' }
      else polizaCartera = 'no_encontrada'
    }
  }

  const av = await ultimaAvant2DeOportunidad(correduriaId, op.id)
  let avant2: Avant2Guardada | null = null
  if (av) {
    const elegidos = seleccionarAvant2(av.precios, MAX_AVANT2_EN_CUADRO)
    for (const p of elegidos) extras.push(ofertaDeAvant2(p, op.ramoOferta, { caducada: av.caducada }))
    avant2 = {
      cotizacionId: av.cotizacionId, creadaEn: av.creadaEn, caducada: av.caducada, precios: av.precios.length, enCuadro: elegidos.length,
      aviso: avisoCotizacionGuardada({ creadaEn: av.creadaEn, caducada: av.caducada, costeCents: COSTE_COTIZACION_CENTS }),
    }
  }

  const actualCartera = extras.filter((o) => o.rol === 'actual')
  const comparacion = compararOfertas({
    ramo: op.ramoOferta,
    ofertas: [...actualCartera, ...deFilas, ...extras.filter((o) => o.rol !== 'actual')],
    superficieM2: op.superficieM2,
  })

  const g = await ultimoEstudioGuardado(correduriaId, op.id)
  // Una lectura accesoria: si falla, la comparativa sale igual (sin la caducidad ni las marcas) y se dice en el log.
  let ofertasBot: InfoOfertaBot[] = []
  try {
    ofertasBot = await infoOfertasBot(correduriaId, filas, new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }))
  } catch (e) {
    console.error('[comparativa] proyectos de bot no legibles:', e instanceof Error ? e.message.slice(0, 200) : 'error')
  }
  return {
    estado: 'ok',
    oportunidad: { id: op.id, ramo: op.ramo, ramoOferta: op.ramoOferta, polizaId: op.polizaId },
    comparacion,
    huella,
    huellaCuadro: huellaComparativa({ ramo: op.ramoOferta, ofertas: comparacion.ofertas, superficieM2: op.superficieM2, recomendadaId }),
    huellaCubre: {
      huella: 'Ofertas de la oportunidad (PDF de compañía o competencia y bots) no descartadas, póliza actual subida y recomendada: lo que congela «Generar presupuesto». Sin Avant2 ni póliza de la cartera.',
      huellaCuadro: 'Todo lo de este cuadro: lo anterior más la cotización de Avant2 elegida y la póliza de la cartera.',
    },
    guardado: g
      ? {
          presupuestoId: g.presupuestoId, generadoAt: g.generadoAt, vigente: g.huella !== null && g.huella === huella,
          etiqueta: g.narrativa ? etiquetaResumen(g.narrativa.fuente, g.narrativa.revisada) : null,
          narrativa: g.narrativa ? { resumen: g.narrativa.resumen, recomendacion: g.narrativa.recomendacion, fuente: g.narrativa.fuente } : null,
        }
      : null,
    avant2,
    polizaCartera,
    ofertasBot,
  }
}

/** La última tarificación REAL de Avant2 colgada de la oportunidad (con o sin póliza). `null` = no hay. */
async function ultimaAvant2DeOportunidad(correduriaId: string, oportunidadId: string) {
  const [t] = await prisma.$queryRaw<{ id: string; creado_at: Date; project_id_codeoscopic: string | null; peticion: unknown; fallos: unknown }[]>`
    select id::text as id, creado_at, project_id_codeoscopic, peticion, fallos
    from tarificaciones
    where correduria_id = ${correduriaId}::uuid
      and oportunidad_id = ${oportunidadId}::uuid
      and simulado = false
      and coalesce(to_jsonb(tarificaciones) ->> 'canal', 'codeoscopic') = 'codeoscopic'
    order by creado_at desc
    limit 1`
  if (!t || !t.project_id_codeoscopic) return null
  return cargarPrecios(t)
}

/** La póliza de la cartera, de ESTE cliente, lista para `ofertaDePolizaActual`. `null` = no está aquí. */
export async function polizaParaComparar(correduriaId: string, clienteId: string, polizaId: string) {
  const p = await prismaAsegura().poliza.findFirst({
    where: { id: polizaId, correduriaId, clienteId },
    select: {
      id: true, aseguradora: true, primaAnual: true, primaBruta: true, fraccionamiento: true, datosEspecificos: true,
      recibos: { where: { correduriaId }, select: { claseRecibo: true, situacion: true, primaTotal: true, fechaVencimiento: true } },
      coberturasRel: { where: { correduriaId }, select: { descripcion: true, capitalAsegurado: true, franquicia: true }, orderBy: { numeroOrden: 'asc' } },
    },
  })
  if (!p) return null
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)))
  const dudosa = (p.datosEspecificos as { primaAnualDudosa?: unknown } | null)?.primaAnualDudosa === true
  const prima = primaConRecibos(
    { primaAnual: dudosa ? null : n(p.primaAnual), primaBruta: dudosa ? null : n(p.primaBruta), fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento) },
    p.recibos.map((r) => ({ claseRecibo: r.claseRecibo ?? null, situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal, fechaVencimiento: r.fechaVencimiento ? r.fechaVencimiento.toISOString().slice(0, 10) : null })),
    new Date().toISOString(),
  ).prima
  const coberturas = p.coberturasRel
    .filter((c) => (c.descripcion ?? '').trim() !== '')
    .map((c) => ({ nombre: c.descripcion!.trim(), incluida: true, capital: numeroLeido(c.capitalAsegurado), franquicia: numeroLeido(c.franquicia) }))
  return {
    id: p.id,
    compania: p.aseguradora,
    primaAnual: prima,
    fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento),
    // Sin filas de CIMA no se sabe qué cubre (no «no cubre nada»).
    coberturas: coberturas.length > 0 ? coberturas : null,
  }
}
