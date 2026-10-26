/**
 * HOGAR: el enlace de datos pregunta SOLO lo que falta (26/10/2026). PURO.
 *
 * Alberto: «cliente antiguo de hogar del que ya tenemos la dirección y los datos de la vivienda pero falta si tiene rejas
 * o alarma → el formulario debe mostrar solo esas preguntas». Lo sabido es el bloque `datosVivienda` de la oportunidad tal
 * como lo enseña la pantalla del riesgo (`leerBloqueDeRamo`: lo estructurado o, sin él, la precarga de la póliza).
 *
 * Reglas:
 *  - Se OCULTA la pregunta; su valor NUNCA viaja a la página (vale igual para el enlace a ciegas, `creada_por='web'`).
 *  - «Sabido» = valor presente en su destino (`DESTINOS_HOGAR`). `null`/vacío = «no se sabe» → se pregunta. `false` y `0`
 *    son respuestas (se ocultan). Ante la duda, se pregunta.
 *  - Dirección: solo si el bloque tiene CP, municipio, calle y número (sin eso no se consulta el Catastro ni se tarifica).
 *  - Tarjeta del Catastro: fuera si la dirección está oculta (la tarjeta sale de la dirección tecleada) o si tipo, m² y
 *    año ya se saben.
 *  - Una pregunta de la que cuelgan otras (`siMarcado`) solo se oculta si su valor sabido es `false` (las hijas no
 *    aplican) o si TODAS sus hijas también se saben: si no, la hija no se podría enseñar.
 *  - DNI y nacimiento no tienen destino en `datosVivienda`: no se tocan aquí.
 */
import { DESTINOS_HOGAR } from './solicitud-destinos.ts'
import type { CampoSolicitud } from './solicitud-datos.ts'

/** Claves de `datosVivienda` sin las que la dirección no cuenta como sabida. */
export const DIRECCION_SABIDA_MINIMA = ['cp', 'municipio', 'nombreVia', 'numeroVia'] as const

function conocido(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'number') return Number.isFinite(v)
  return typeof v === 'boolean'
}

function valorSabido(c: CampoSolicitud, vivienda: Readonly<Record<string, unknown>>): unknown {
  const d = Object.hasOwn(DESTINOS_HOGAR, c.clave) ? DESTINOS_HOGAR[c.clave] : undefined
  return d && d.en === 'riesgo' ? vivienda[d.campo] : undefined
}

/** Las claves de los campos que NO se preguntan porque ya se saben. */
export function clavesSabidasHogar(campos: readonly CampoSolicitud[], vivienda: Readonly<Record<string, unknown>> | null): Set<string> {
  const ocultas = new Set<string>()
  if (!vivienda) return ocultas
  for (const c of campos) {
    if (c.catastro === 'tarjeta') continue
    if (c.tipo === 'direccion') {
      if (DIRECCION_SABIDA_MINIMA.every((k) => conocido(vivienda[k]))) ocultas.add(c.clave)
      continue
    }
    if (conocido(valorSabido(c, vivienda))) ocultas.add(c.clave)
  }
  // De quien cuelgan otras: fuera solo si su «no» las anula o si todas ellas también se saben.
  for (const c of campos) {
    if (!ocultas.has(c.clave)) continue
    const hijas = campos.filter((h) => h.siMarcado === c.clave)
    if (hijas.length === 0) continue
    if (valorSabido(c, vivienda) === false) continue
    if (!hijas.every((h) => ocultas.has(h.clave))) ocultas.delete(c.clave)
  }
  const dirOculta = campos.some((c) => c.tipo === 'direccion' && ocultas.has(c.clave))
  const trio = campos.filter((c) => c.catastro === 'tipo_vivienda' || c.catastro === 'metros' || c.catastro === 'anio')
  const trioSabido = trio.length > 0 && trio.every((c) => ocultas.has(c.clave))
  for (const c of campos) if (c.catastro === 'tarjeta' && (dirOculta || trioSabido)) ocultas.add(c.clave)
  return ocultas
}

/** Los campos a enseñar Y aceptar: los de siempre menos lo sabido. Sin bloque legible (`null`), todos. */
export function camposHogarSinLoSabido(campos: readonly CampoSolicitud[], vivienda: Readonly<Record<string, unknown>> | null): CampoSolicitud[] {
  const ocultas = clavesSabidasHogar(campos, vivienda)
  return campos.filter((c) => !ocultas.has(c.clave))
}
