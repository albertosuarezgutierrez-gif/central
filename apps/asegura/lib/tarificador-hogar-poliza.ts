import { esCarteraEnVigor, precargaViviendaDePoliza, referenciaCatastral } from '@central/module-seguros'
import { capitalContenidoEstimado, capitalContinenteEstimado, datosViviendaParaBot, formularioBotHogar, type RiesgoParaBotsHogar } from '@central/module-tarificacion'
import { partirDireccion } from './codeoscopic/direccion.ts'
import type { ReconstruccionRiesgo } from './tarificador-relanzar-reglas.ts'

// «Probar» de HOGAR sin oportunidad de hogar ni trabajo previo (01/11/2026): el riesgo se construye de la póliza de hogar EN VIGOR más
// reciente del cliente (`datos_especificos`). PURO: sin BD ni red (la lectura y el descifrado entran por parámetro).
// Reutiliza el MISMO mapeo que la precarga del PATCH de riesgo (`precargaViviendaDePoliza`) y el MISMO constructor que el botón
// «pedir precio» (`formularioBotHogar`). Nada personal sale de aquí: avisos y supuestos son CLAVES, nunca valores.
// 🚨 TARIFICAR ≠ EMITIR. Régimen y madera NO constan en ninguna póliza de CIMA: no se suponen (422 que los nombra).

export type FilaPolizaHogar = {
  id: string
  /** Fecha de efecto (aaaa-mm-dd) para elegir la más reciente; `null` = sin fecha. */
  desde: string | null
  estado: string | null
  importRef: string | null
  eiacXmlHash: string | null
  sustituidaAt: unknown
  datosEspecificos: unknown
}

export type RiesgoHogarDePoliza = {
  /** Póliza elegida (para vincular la oportunidad). `null` = ninguna póliza de hogar en vigor. */
  polizaId: string | null
  reconstruccion: ReconstruccionRiesgo
  /** Datos que NO declaró el cliente y se deducen/estiman (claves). Todo precio de hogar ya sale `estimado` (`firmezaPrecioRpa`: solo auto es firme). */
  supuestos: string[]
  /** Avisos para quien llama (claves), p. ej. `varias_polizas_hogar_direcciones_distintas`. */
  avisos: string[]
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const sinNulos = <T extends Record<string, unknown>>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>
const clave = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Códigos CIMA del uso del inmueble que dicen SIN AMBIGÜEDAD el uso del bot. El resto no se interpreta (queda sin contestar). */
const USO_DE_CODIGO_CIMA: Record<string, string> = { HA: 'habitual', SE: 'secundaria' }
/** Código CIMA de la clase de inmueble que dice sin ambigüedad el tipo del bot. */
const TIPO_DE_CODIGO_CIMA: Record<string, string> = {
  PI: 'piso',
  // UD (unifamiliar, 01/11/2026, «coger el más similar»): el tipo más parecido de Allianz sin llegar al extremo es `adosada` (casa en
  // hilera; `independiente` sería más caro y no se sabe si lo es). SUPUESTO: el precio sale estimado.
  UD: 'adosada',
}

/**
 * Directriz de Alberto (01/11/2026, «hay que dar precio, ya iremos afinando»): ninguna póliza de CIMA trae el régimen ni la madera. SOLO
 * «probar» desde póliza los supone (propietario, sin madera) y ambos viajan como `supuestos`. El resto de caminos (botón, oportunidad)
 * siguen sin suponerlos: `formularioBotHogar` no cambia.
 */
export const SUPUESTOS_HOGAR_DESDE_POLIZA = Object.freeze({ regimen: 'propietario', conMadera: 'no' })

/** Dirección y CP de la FICHA del cliente (ya en claro). Plan B del número de calle: solo si CP y calle cuadran con los de la póliza. */
export type FichaDomicilio = { direccion: string | null; codigoPostal: string | null }
/** Plan B del número de calle (01/11/2026), en este orden: ficha (`numeroDeFicha`) → Catastro por RC (`numeroDeCatastro`) → «S/N» (`numeroSinNumero`). */
export type ComplementosHogar = { ficha?: FichaDomicilio | null; numeroCatastro?: string | null }

const cpClaro = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, '') : '')
/** Calles compatibles: mismo nombre normalizado, o uno contenido en el otro por palabras completas (p. ej. «socorro» ⊂ «del socorro»). PURA. */
export function callesCompatibles(a: string | null, b: string | null): boolean {
  const ta = clave(a).split(' ').filter(Boolean)
  const tb = clave(b).split(' ').filter(Boolean)
  if (!ta.length || !tb.length) return false
  const [c, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return c.every((t) => l.includes(t))
}
/** Número válido de portal para el vendor (el mismo patrón que reconoce `partirDireccion`). */
const esNumeroPortal = (v: unknown): v is string => typeof v === 'string' && /^\d{1,4}[a-z]?$/i.test(v.trim())

/** Referencia catastral (20) de la póliza de hogar elegida, para que quien llama consulte el número al Catastro. PURA. */
export function referenciaCatastralDeHogarElegida(filas: readonly FilaPolizaHogar[]): string | null {
  const e = polizasHogarEnVigor(filas)[0]
  return e && esObj(e.datosEspecificos) ? referenciaCatastral(e.datosEspecificos) : null
}

/** Solo cartera EN VIGOR de hogar, la más reciente primero (misma fecha → id para que sea estable). PURA. */
export function polizasHogarEnVigor(filas: readonly FilaPolizaHogar[]): FilaPolizaHogar[] {
  return filas
    .filter((f) => esCarteraEnVigor({ importRef: f.importRef, eiacXmlHash: f.eiacXmlHash, estado: f.estado, sustituidaAt: f.sustituidaAt }))
    .sort((a, b) => (b.desde ?? '').localeCompare(a.desde ?? '') || a.id.localeCompare(b.id))
}

function direccionClaro(datos: unknown, descifrar: (v: string) => string): { datos: Record<string, unknown>; direccion: string | null } {
  const d = esObj(datos) ? { ...datos } : {}
  const dir = d.direccion
  if (typeof dir === 'string' && dir.startsWith('v1:')) {
    try { d.direccion = descifrar(dir) } catch { delete d.direccion }
  }
  return { datos: d, direccion: typeof d.direccion === 'string' && d.direccion.trim() !== '' ? d.direccion : null }
}

/**
 * Riesgo de hogar para el bot desde las pólizas de hogar del cliente. `filas` = todas las de hogar del cliente (se filtra aquí la cartera
 * en vigor). Varias en vigor: la más reciente, y si hay otra con dirección DISTINTA se avisa. `descifrar` abre la dirección `v1:` (si
 * lanza, no hay calle → el 422 lo dirá). Lo que falte sale como `faltan_datos` (etiquetas, nunca valores). PURA.
 */
export function riesgoHogarDePolizas(
  filas: readonly FilaPolizaHogar[], descifrar: (v: string) => string, ahora = new Date(),
  /** Elecciones que NO constan en la póliza (régimen, madera) y que quien llama SÍ tiene por otra vía. Hoy `probar` no pasa ninguna: se piden (422). */
  elecciones: { regimen?: string; conMadera?: string } = {},
  complementos: ComplementosHogar = {},
): RiesgoHogarDePoliza {
  const vivas = polizasHogarEnVigor(filas)
  if (!vivas.length) return { polizaId: null, reconstruccion: { riesgo: null, motivo: 'sin_oportunidad' }, supuestos: [], avisos: [] }
  const elegida = vivas[0]
  const avisos: string[] = []
  const supuestos: string[] = []
  const { datos, direccion } = direccionClaro(elegida.datosEspecificos, descifrar)
  const dirsDistintas = vivas.slice(1).some((f) => {
    const o = direccionClaro(f.datosEspecificos, descifrar).direccion
    return o !== null && direccion !== null && clave(o) !== clave(direccion)
  })
  if (dirsDistintas) avisos.push('varias_polizas_hogar_direcciones_distintas')
  if (vivas.length > 1 && !dirsDistintas) avisos.push('varias_polizas_hogar_misma_direccion')

  // 1) El MISMO mapeo que la precarga del PATCH de riesgo (vivienda).
  const vivienda: Record<string, unknown> = { ...precargaViviendaDePoliza(datos) }
  // 2) Calle y número: la dirección de la póliza es texto libre; el troceo es conservador (lo que no reconoce queda sin dato).
  const p = partirDireccion(direccion)
  Object.assign(vivienda, sinNulos({ nombreVia: p.nombre, numeroVia: p.numero, planta: p.planta, puertaVivienda: p.puerta }))
  // 2b) Falta el número (plan B, 01/11/2026, «hay que dar precio»): 1) la ficha, solo si CP y calle cuadran con los de la póliza; 2) el
  // Catastro por la referencia catastral de la póliza; 3) «S/N» (el validador lo admite ≤10 caracteres; que el portal lo acepte NO está
  // verificado: si lo rechaza, falla el trabajo, no el 422). Los tres son SUPUESTOS (precio estimado).
  if (p.numero === null && p.nombre !== null) { // sin calle no hay plan B: el 422 pide calle y número
    const f = complementos.ficha ?? null
    const pf = f ? partirDireccion(f.direccion) : null
    const cpPoliza = cpClaro(vivienda.cp)
    if (f && pf && esNumeroPortal(pf.numero) && cpPoliza !== '' && cpPoliza === cpClaro(f.codigoPostal) && callesCompatibles(p.nombre, pf.nombre)) {
      vivienda.numeroVia = pf.numero.trim()
      if (vivienda.planta == null && pf.planta) vivienda.planta = pf.planta
      if (vivienda.puertaVivienda == null && pf.puerta) vivienda.puertaVivienda = pf.puerta
      supuestos.push('numeroDeFicha')
    } else if (esNumeroPortal(complementos.numeroCatastro)) {
      vivienda.numeroVia = complementos.numeroCatastro.trim()
      supuestos.push('numeroDeCatastro')
    } else {
      vivienda.numeroVia = 'S/N'
      supuestos.push('numeroSinNumero')
    }
  }
  // 3) Año de construcción: el de la compañía (EIAC, `anioConstruccionCima`) NO es declarado → vale como SUPUESTO (precio estimado).
  if (vivienda.anioConstruccion == null) {
    const a = Number(esObj(datos) ? datos.anioConstruccionCima : undefined)
    if (Number.isInteger(a) && a >= 1500 && a <= ahora.getFullYear()) { vivienda.anioConstruccion = a; supuestos.push('anioConstruccion') }
  }

  // 3b) Capitales a 0 o ausentes (01/11/2026, «hay que dar precio»; job ac0b4631): continente = m² × coste de reconstrucción de la zona y
  // contenido = 30 % del continente (mín. 15.000 €), a miles (`hogar-asesor.ts`). SUPUESTOS (precio estimado). Sin superficie NO se inventa:
  // `formularioBotHogar` la pide en el 422. Lo que la póliza SÍ trae (>0) no se toca.
  const positivo = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const m2 = positivo(vivienda.metrosCuadrados)
  if (m2 !== null) {
    let cont = positivo(vivienda.capitalContinente)
    if (cont === null) {
      cont = capitalContinenteEstimado(m2, typeof vivienda.provincia === 'string' ? vivienda.provincia : null)
      if (cont !== null) { vivienda.capitalContinente = cont; supuestos.push('capitalContinenteEstimado') }
    }
    if (positivo(vivienda.capitalContenido) === null) {
      const cnt = capitalContenidoEstimado(cont)
      if (cnt !== null) { vivienda.capitalContenido = cnt; supuestos.push('capitalContenidoEstimado') }
    }
  }

  const r: RiesgoParaBotsHogar = { datosRiesgo: { clave: 'datosVivienda', datos: vivienda }, figuras: [] }
  // 4) Elecciones: solo los códigos de CIMA que no dejan duda. Régimen y madera no constan en la póliza: no se suponen.
  const codigo = (k: string) => (esObj(datos) && typeof datos[k] === 'string' ? (datos[k] as string).trim().toUpperCase() : '')
  const uso = USO_DE_CODIGO_CIMA[codigo('usoInmueble')] ?? ''
  const tipoVivienda = TIPO_DE_CODIGO_CIMA[codigo('claseInmueble')] ?? ''
  if (uso) supuestos.push('uso')
  if (tipoVivienda) supuestos.push('tipoVivienda')
  if (elecciones.regimen) supuestos.push('regimen')
  if (elecciones.conMadera) supuestos.push('conMadera')
  const f = formularioBotHogar({ ...datosViviendaParaBot(r), uso, tipoVivienda, regimen: elecciones.regimen ?? '', conMadera: elecciones.conMadera ?? '' }, ahora)
  const reconstruccion: ReconstruccionRiesgo = f.ok ? { riesgo: f.riesgo, bloqueos: [], repreguntar: [] } : { riesgo: null, motivo: 'faltan_datos', faltan: f.faltan }
  return { polizaId: elegida.id, reconstruccion, supuestos: f.ok ? supuestos : [], avisos }
}

/**
 * Qué reconstrucción usa «probar»: la de la oportunidad si dio riesgo; si no hay oportunidad de hogar (`sin_oportunidad`), la de la póliza
 * (sea completa o con `faltan_datos`, para que el 422 nombre lo que falta); si hay oportunidad pero incompleta, la de la oportunidad solo
 * cuando la póliza sí completa el riesgo. Sin póliza → la de la oportunidad tal cual. PURA.
 */
export function elegirReconstruccionHogar(deOportunidad: ReconstruccionRiesgo, dePoliza: RiesgoHogarDePoliza | null): { reconstruccion: ReconstruccionRiesgo; usaPoliza: boolean } {
  if (deOportunidad.riesgo !== null || !dePoliza || dePoliza.polizaId === null) return { reconstruccion: deOportunidad, usaPoliza: false }
  const sinOp = 'motivo' in deOportunidad && deOportunidad.motivo === 'sin_oportunidad'
  if (dePoliza.reconstruccion.riesgo !== null || sinOp) return { reconstruccion: dePoliza.reconstruccion, usaPoliza: true }
  return { reconstruccion: deOportunidad, usaPoliza: false }
}
