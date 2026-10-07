// Validación PURA del riesgo de comunidad que llega al encolar (05/10/2026). Lo que no viene se
// guarda como `null` («no se sabe»), nunca como 0 ni `false`.

import type { RiesgoComunidad } from './tipos.ts'

export type ValidacionRiesgo = { ok: true; riesgo: RiesgoComunidad } | { ok: false; errores: string[] }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/** Entero ≥ min o null. Un valor presente pero inválido es ERROR (no se convierte en null). */
function entero(v: unknown, campo: string, errores: string[], min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isInteger(n) || n < min || n > max) {
    errores.push(`${campo}: «${String(v)}» no es un entero entre ${min} y ${max}`)
    return null
  }
  return n
}

function importe(v: unknown, campo: string, errores: string[]): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n <= 0) {
    errores.push(`${campo}: tiene que ser un importe en euros mayor que 0 (número, no texto)`)
    return null
  }
  return Math.round(n * 100) / 100
}

function booleano(v: unknown, campo: string, errores: string[]): boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'boolean') {
    errores.push(`${campo}: tiene que ser true/false (o no venir)`)
    return null
  }
  return v
}

/**
 * `exigirSelectsPortal` (07/10/2026): tipo de vivienda, uso y lista de propietarios son etiquetas de los
 * desplegables de ePAC, no datos del riesgo comunes a toda compañía. El formulario CANÓNICO
 * (`capacidades.ts`) valida con `false` y cada adaptador los pide como «extras»; el riesgo que llega al
 * worker se valida siempre con el valor por defecto (`true`).
 */
export function validarRiesgoComunidad(
  entrada: unknown,
  hoy: Date = new Date(),
  ajustes: { exigirSelectsPortal?: boolean } = {},
): ValidacionRiesgo {
  const exigirSelects = ajustes.exigirSelectsPortal !== false
  const e = obj(entrada)
  if (!e) return { ok: false, errores: ['el riesgo tiene que ser un objeto'] }
  const errores: string[] = []
  if (e.ramo !== undefined && e.ramo !== 'comunidades') errores.push(`ramo «${String(e.ramo)}» no es comunidades`)

  const d = obj(e.direccion)
  const via = texto(d?.via)
  const cp = texto(d?.codigoPostal)
  if (!cp || !/^\d{5}$/.test(cp)) errores.push('direccion.codigoPostal (C.P. *) tiene que tener 5 dígitos')

  const anioMax = hoy.getUTCFullYear()
  const anioConstruccion = entero(e.anioConstruccion, 'anioConstruccion', errores, 1800, anioMax)
  const anioRehabilitacion = entero(e.anioRehabilitacion, 'anioRehabilitacion', errores, 1800, anioMax)
  const m2Construidos = entero(e.m2Construidos, 'm2Construidos', errores, 1)
  const numViviendas = entero(e.numViviendas, 'numViviendas', errores, 0)
  const numLocales = entero(e.numLocales, 'numLocales', errores, 0)
  const numViviendasYLocalesDado = entero(e.numViviendasYLocales, 'numViviendasYLocales', errores, 1)
  const numGarajes = entero(e.numGarajes, 'numGarajes', errores, 0)
  const plantas = entero(e.plantas, 'plantas', errores, 1, 80)
  const plantasBajoRasante = entero(e.plantasBajoRasante, 'plantasBajoRasante', errores, 0, 10)
  const sotanos = entero(e.sotanos, 'sotanos', errores, 0, 10)
  const numEdificios = entero(e.numEdificios, 'numEdificios', errores, 1, 999)
  const siniestros = entero(e.siniestrosUltimos3Anios, 'siniestrosUltimos3Anios', errores, 0)
  const capitalContinente = importe(e.capitalContinente, 'capitalContinente', errores)
  const capitalContenido = importe(e.capitalContenido, 'capitalContenido', errores)

  // «Nº Viv. y Locales *» es un único campo en ePAC: dado, o la suma de los dos (solo si vienen ambos).
  const numViviendasYLocales =
    numViviendasYLocalesDado ?? (numViviendas !== null && numLocales !== null ? numViviendas + numLocales : null)

  // Selects de ePAC: string libre (TODO(valores admitidos): no se inventa catálogo).
  const tipoVivienda = texto(e.tipoVivienda)
  const uso = texto(e.uso)
  const listaPropietarios = texto(e.listaPropietarios)

  // Obligatorios (*) del formulario «Comunidades 2020».
  const faltan: [string, unknown][] = [
    ['fechaEfecto (Fecha Inicio *)', texto(e.fechaEfecto)],
    ['fechaTermino (Fecha Término *)', texto(e.fechaTermino)],
    ['m2Construidos (Metros Cuadrados *)', m2Construidos],
    ['anioConstruccion (Año Construcción *)', anioConstruccion],
    ...(exigirSelects ? ([['tipoVivienda (Tipo Vivienda *)', tipoVivienda], ['uso (Uso *)', uso]] as [string, unknown][]) : []),
    ['plantas (Plantas sobre N. Calle *)', plantas],
    ['numEdificios (Nº Edificios *)', numEdificios],
    ['numViviendasYLocales (Nº Viv. y Locales *; o numViviendas + numLocales)', numViviendasYLocales],
    ...(exigirSelects ? ([['listaPropietarios (Lista Propietarios / Arrendatarios *)', listaPropietarios]] as [string, unknown][]) : []),
    // Sin «Edificación Valor Reposición» ePAC deja «Calcular» deshabilitado (06/10/2026).
    ['capitalContinente (Edificación Valor Reposición, en euros)', capitalContinente],
  ]
  for (const [campo, valor] of faltan) if (valor === null) errores.push(`${campo} es obligatorio`)

  const modalidad = e.modalidad
  if (modalidad !== undefined && modalidad !== null && modalidad !== 'estandar' && modalidad !== 'personalizado') {
    errores.push('modalidad: estandar | personalizado')
  }

  const calidad = e.calidadConstruccion
  if (calidad !== undefined && calidad !== null && calidad !== 'normal' && calidad !== 'alta' && calidad !== 'lujo') {
    errores.push('calidadConstruccion: normal | alta | lujo')
  }

  const fecha = texto(e.fechaEfecto)
  const fechaTermino = texto(e.fechaTermino)
  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (fecha !== null && !iso.test(fecha)) errores.push('fechaEfecto: formato AAAA-MM-DD')
  if (fechaTermino !== null && !iso.test(fechaTermino)) errores.push('fechaTermino: formato AAAA-MM-DD')
  if (fecha !== null && iso.test(fecha) && fecha < hoy.toISOString().slice(0, 10)) {
    errores.push('fechaEfecto: ya ha pasado (una fecha de efecto caducada no se tarifica)')
  }
  if (fecha !== null && fechaTermino !== null && iso.test(fecha) && iso.test(fechaTermino) && fechaTermino <= fecha) {
    errores.push('fechaTermino: tiene que ser posterior a fechaEfecto')
  }

  const ascensor = booleano(e.ascensor, 'ascensor', errores)
  const piscina = booleano(e.piscina, 'piscina', errores)
  const zonas = booleano(e.zonasAjardinadas, 'zonasAjardinadas', errores)
  const instalacionesAnexas = booleano(e.instalacionesAnexas, 'instalacionesAnexas', errores)
  const asistenciaPlagas = booleano(e.asistenciaPlagas, 'asistenciaPlagas', errores)
  const asesoramientoJuridico = booleano(e.asesoramientoJuridico, 'asesoramientoJuridico', errores)
  const impagoCuotas = booleano(e.impagoCuotas, 'impagoCuotas', errores)
  const ite = booleano(e.ite, 'ite', errores)
  const opciones = booleano(e.opciones, 'opciones', errores)

  if (errores.length) return { ok: false, errores }
  return {
    ok: true,
    riesgo: {
      ramo: 'comunidades',
      direccion: {
        via,
        numero: texto(d?.numero),
        codigoPostal: cp as string,
        municipio: texto(d?.municipio),
        provincia: texto(d?.provincia),
      },
      referenciaCatastral: texto(e.referenciaCatastral),
      polizaAReemplazar: texto(e.polizaAReemplazar),
      documentoIdentidad: texto(e.documentoIdentidad),
      tipoDocumento: texto(e.tipoDocumento),
      tipoVivienda,
      uso,
      sotanos,
      numEdificios,
      contiguos: texto(e.contiguos),
      numViviendasYLocales,
      listaPropietarios,
      instalacionesAnexas,
      formaPagoPrimerRecibo: texto(e.formaPagoPrimerRecibo),
      formaPagoSucesivos: texto(e.formaPagoSucesivos),
      comision: texto(e.comision),
      asistenciaPlagas,
      asesoramientoJuridico,
      impagoCuotas,
      ite,
      fechaTermino,
      modalidad: (modalidad as RiesgoComunidad['modalidad']) ?? null,
      opciones,
      anioConstruccion,
      anioRehabilitacion,
      m2Construidos,
      numViviendas,
      numLocales,
      numGarajes,
      plantas,
      plantasBajoRasante,
      ascensor,
      piscina,
      zonasAjardinadas: zonas,
      calidadConstruccion: (calidad as RiesgoComunidad['calidadConstruccion']) ?? null,
      capitalContinente,
      capitalContenido,
      siniestrosUltimos3Anios: siniestros,
      companiaActual: texto(e.companiaActual),
      fechaEfecto: fecha,
    },
  }
}
