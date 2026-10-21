// Precarga de «Datos de la vivienda» desde el Catastro (10/10/2026, fase HOGAR del riesgo unificado,
// docs/superpowers/specs/2026-10-10-riesgo-unificado-todos-los-ramos-design.md). PURO: lo usa `DatosRiesgo.tsx` y lo
// cubre `catastro-vivienda.test.ts`.
//
// La consulta es la misma que `HogarCatastro` y `hogar-nuevo` (`POST /api/correduria/catastro`, gratis, servicio
// público). Reglas:
//   - Solo se RELLENA lo que el formulario tiene vacío. Lo que el corredor ya tiene escrito NO se pisa: si el Catastro
//     dice otra cosa, se enseña como diferencia para que decida él.
//   - Un dato que el Catastro no trae (`null`) no se rellena con nada: sigue «sin dato» (nunca 0 ni '').
//   - Nada se guarda solo: se rellena el formulario y se guarda con «Guardar» (queda sin confirmar, como siempre).

import { busquedaCatastroDeVivienda } from '@central/module-seguros'

/** Lo que el Catastro da de una vivienda (`PrecalificacionHogar.datos` de `@central/core-catastro`). */
export type CatastroVivienda = {
  /** m² CONSTRUIDOS TOTALES (vivienda + anexos). */
  metrosCuadrados: number | null
  /** m² de la VIVIENDA sola, si el Catastro publica el desglose. Ausente/`null` = no hay desglose (se usa el total). */
  metrosVivienda?: number | null
  /** Anexos (aparcamiento, almacén…) con sus m². */
  anexos?: Array<{ uso: string; superficie: number }>
  anioConstruccion: number | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  codigoPostal: string | null
  /** Uso catastral tal cual («Residencial»…). INFORMATIVO: nunca rellena el uso del seguro (habitual/secundaria/alquiler…). */
  uso?: string | null
}

/** Los campos de `datosVivienda` que el Catastro puede rellenar. */
export const CAMPOS_DEL_CATASTRO = ['referenciaCatastral', 'direccion', 'nombreVia', 'numeroVia', 'planta', 'puertaVivienda', 'cp', 'municipio', 'provincia', 'metrosCuadrados', 'anioConstruccion'] as const
export type CampoDelCatastro = (typeof CAMPOS_DEL_CATASTRO)[number]

export type PrecargaCatastro = {
  /** Lo que se escribe en el formulario (solo campos que estaban vacíos). */
  cambios: Partial<Record<CampoDelCatastro, string>>
  /** Campos con valor escrito que el Catastro da distinto: no se tocan, se enseñan. */
  distintos: Array<{ campo: CampoDelCatastro; escrito: string; catastro: string }>
}

const limpio = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/\s+/g, ' ') : null)

/**
 * La dirección del Catastro («CL SAN VICENTE 40 Es:1 Pl:02 Pt:14 41002 SEVILLA») partida en calle, número, planta y puerta.
 * CONSERVADORA: solo si el texto tiene la forma `SIGLA NOMBRE… NÚMERO` (más interior y CP/municipio opcionales); un número
 * «S/N» o cualquier otra forma deja ese trozo en `null` (sin dato), jamás una conjetura. La sigla («CL», «AV») no se traduce
 * al catálogo de tipos de vía: ese id lo elige una persona. Planta «00» (baja) no se escribe: no se supone.
 */
export function partirViaCatastro(direccion: string | null | undefined): { nombreVia: string | null; numeroVia: string | null; planta: string | null; puerta: string | null } {
  const vacio = { nombreVia: null, numeroVia: null, planta: null, puerta: null }
  const t = limpio(direccion)
  if (t === null) return vacio
  const trozo = (re: RegExp): string | null => limpio(re.exec(t)?.[1])
  const planta = trozo(/\bPl:\s*(\S+)/i)
  const puerta = trozo(/\bPt:\s*(\S+)/i)
  const sinInterior = t.replace(/\b(?:Es|Pl|Pt|Bq):\s*\S+/gi, ' ').replace(/\s+/g, ' ').trim()
  const sinCp = sinInterior.replace(/\s+\d{5}(?:\s+.*)?$/, '').trim()
  const m = /^([A-ZÁÉÍÓÚÜÑ]{2,3})\s+(.+?)\s+(\d{1,4}[A-Z]?)$/i.exec(sinCp)
  const sinCeros = (v: string | null, nulaSiCero: boolean): string | null => {
    if (v === null) return null
    if (/^\d+$/.test(v)) { const n = Number.parseInt(v, 10); return n === 0 && nulaSiCero ? null : String(n) }
    return v.toUpperCase().slice(0, 10)
  }
  return {
    nombreVia: m ? limpio(m[2]) : null,
    numeroVia: m ? m[3]!.toUpperCase() : null,
    planta: sinCeros(planta, true),
    puerta: sinCeros(puerta, false),
  }
}

/** Aviso (o `null`) sobre el uso CATASTRAL de la finca: solo informa; el uso del seguro lo elige la persona. */
export function avisoUsoCatastral(uso: string | null | undefined): string | null {
  const u = limpio(uso)
  if (u === null) return 'El Catastro no informa el uso del inmueble: no se puede confirmar que sea una vivienda.'
  return /residencial/i.test(u) ? `Uso catastral: ${u}. Es informativo: el uso del seguro (habitual, secundaria, alquiler…) lo eliges tú.` : `El Catastro clasifica este inmueble como «${u}», no como vivienda: compruébalo antes de cotizar hogar.`
}

/** El valor que el Catastro da para un campo, como texto de formulario; `null` = el Catastro no lo trae. */
function delCatastro(campo: CampoDelCatastro, referencia: string | null, c: CatastroVivienda): string | null {
  switch (campo) {
    case 'referenciaCatastral': return limpio(referencia)
    case 'direccion': return limpio(c.direccion)
    case 'nombreVia': return partirViaCatastro(c.direccion).nombreVia
    case 'numeroVia': return partirViaCatastro(c.direccion).numeroVia
    case 'planta': return partirViaCatastro(c.direccion).planta
    case 'puertaVivienda': return partirViaCatastro(c.direccion).puerta
    case 'cp': { const cp = limpio(c.codigoPostal); return cp !== null && /^\d{5}$/.test(cp) ? cp : null }
    case 'municipio': return limpio(c.localidad)
    case 'provincia': return limpio(c.provincia)
    // 0 m² no es una superficie: el Catastro sin dato no se convierte en «0».
    // Superficie que se declara = TOTAL CONSTRUIDO (vivienda + anexos): declarar menos es riesgo de infraseguro. El desglose solo se muestra.
    case 'metrosCuadrados': { const m = metrosPositivo(c.metrosCuadrados); return m !== null ? String(m) : null }
    case 'anioConstruccion': return typeof c.anioConstruccion === 'number' && Number.isInteger(c.anioConstruccion) && c.anioConstruccion >= 1500 ? String(c.anioConstruccion) : null
  }
}

const metrosPositivo = (n: number | null | undefined): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null)

/** Compara sin que cuenten mayúsculas, espacios ni guiones de la referencia. */
const igual = (a: string, b: string) => a.replace(/[\s-]/g, '').toUpperCase() === b.replace(/[\s-]/g, '').toUpperCase()

export function precargaCatastroVivienda(form: Record<string, string | undefined>, referencia: string | null, c: CatastroVivienda): PrecargaCatastro {
  const cambios: PrecargaCatastro['cambios'] = {}
  const distintos: PrecargaCatastro['distintos'] = []
  for (const campo of CAMPOS_DEL_CATASTRO) {
    const cat = delCatastro(campo, referencia, c)
    if (cat === null) continue
    const escrito = limpio(form[campo])
    if (escrito === null) cambios[campo] = cat
    else if (!igual(escrito, cat)) distintos.push({ campo, escrito, catastro: cat })
  }
  return { cambios, distintos }
}

export type ConsultaCatastroVivienda =
  | { ok: true; cuerpo: { referencia: string } | { direccion: string; municipio: string; provincia: string } }
  | { ok: false; motivo: string }

/**
 * Con qué se pregunta al Catastro desde el formulario: la referencia si está escrita; si no, calle + número (con el
 * tipo de vía) + municipio + provincia del propio formulario. Sin eso no se pregunta: se dice qué falta (el buscador
 * no inventa «Sevilla»).
 */
export function consultaCatastroDeForm(form: Record<string, string | undefined>, tipoViaNombre: string | null): ConsultaCatastroVivienda {
  const ref = limpio(form.referenciaCatastral)
  if (ref !== null) return { ok: true, cuerpo: { referencia: ref } }
  const b = busquedaCatastroDeVivienda({
    direccion: limpio(form.direccion), tipoViaId: limpio(form.tipoViaId), nombreVia: limpio(form.nombreVia),
    numeroVia: limpio(form.numeroVia), municipio: limpio(form.municipio), provincia: limpio(form.provincia),
  }, tipoViaNombre)
  if (b.direccion === null) return { ok: false, motivo: 'Escribe la referencia catastral, o la calle con su número.' }
  if (b.municipio === null || b.provincia === null) return { ok: false, motivo: 'Para buscar por dirección hacen falta también el municipio y la provincia.' }
  return { ok: true, cuerpo: { direccion: b.direccion, municipio: b.municipio, provincia: b.provincia } }
}

/**
 * Lo que se GUARDA de una consulta al Catastro en `datosVivienda` (20/10/2026): cuándo se hizo y qué dijo (uso catastral,
 * m² y año), para poder avisar de discrepancias con lo declarado aunque pase el tiempo. Como texto de formulario: lo que el
 * Catastro no trae es `''` («sin dato»), nunca `0`. A diferencia de la precarga, una consulta NUEVA sustituye a la anterior.
 */
export function metadatosConsultaCatastro(c: CatastroVivienda, referencia: string, ahoraIso: string): Record<'catastroConsultadoAt' | 'catastroReferencia' | 'usoCatastral' | 'catastroMetrosCuadrados' | 'catastroMetrosVivienda' | 'catastroMetrosAnexos' | 'catastroAnexos' | 'catastroAnioConstruccion', string> {
  const anexos = (c.anexos ?? []).filter((a) => a.superficie > 0)
  const sumaAnexos = anexos.reduce((s, a) => s + a.superficie, 0)
  const bonito = (u: string) => `${u.charAt(0).toUpperCase()}${u.slice(1).toLowerCase()}`
  return {
    catastroConsultadoAt: ahoraIso,
    usoCatastral: limpio(c.uso) ?? '',
    // La referencia consultada: sus datos solo valen mientras sea la del riesgo.
    catastroReferencia: limpio(referencia)?.replace(/[\s-]/g, '').toUpperCase() ?? '',
    catastroMetrosCuadrados: delCatastro('metrosCuadrados', null, c) ?? '',
    catastroMetrosVivienda: metrosPositivo(c.metrosVivienda) !== null ? String(c.metrosVivienda) : '',
    catastroMetrosAnexos: sumaAnexos > 0 ? String(sumaAnexos) : '',
    catastroAnexos: anexos.map((a) => `${bonito(a.uso)} ${a.superficie} m²`).join(' · '),
    catastroAnioConstruccion: delCatastro('anioConstruccion', null, c) ?? '',
  }
}
