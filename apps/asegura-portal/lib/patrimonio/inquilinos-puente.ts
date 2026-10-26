// PATRIMONIO (22/10/2026, paso 9) — el PUENTE de la PII del inquilino a `apps/asegura` (`/api/portal/patrimonio/inquilino`),
// a imagen de `lib/mis-datos.ts` ↔ `/api/portal/contacto`.
//
// Por qué: el NIF, el correo y el teléfono del inquilino van CIFRADOS con `PII_ENCRYPTION_KEY`, que el portal NO tiene
// (ni las columnas `*_cifrado` concedidas a su rol). Aquí NO se guarda nada: se manda lo que la persona escribió y se
// recibe solo un id (alta) o la PII descifrada para pintarla una vez (lectura, nivel Total). Nunca se escribe en un log.
//
// 🚨 asegura NO se fía de este lado: no recibe titular ni ficha; resuelve el titular desde el CONTRATO (o el inquilino) y
// recalcula el nivel de patrimonio de la identidad sobre esa ficha. Ni con el secreto en la mano se llega a otro titular.
//
// Fallos que NO se colapsan: `sin_puente` (faltan envs: se arregla en Vercel) ≠ `error` (no ha salido: reintentar) ≠
// `sin_clave` (asegura no puede cifrar: NO guarda en claro). Ninguno se le enseña a la persona como «guardado».
import { PORTAL_PUENTE_TIEMPO_MS } from '../puente-config'
import type { DatosAltaInquilino, ResultadoPuenteAlta, ResultadoPuentePii } from './contratos-api'

const RUTA = '/api/portal/patrimonio/inquilino'

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

async function llamar(init: { metodo: 'GET' | 'POST'; query?: URLSearchParams; cuerpo?: unknown }) {
  const p = puente()
  if (!p) return { sinPuente: true as const }
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const url = `${p.base}${RUTA}${init.query ? `?${init.query.toString()}` : ''}`
    const res = await fetch(url, {
      method: init.metodo,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      body: init.cuerpo === undefined ? undefined : JSON.stringify(init.cuerpo),
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { status: res.status, j }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    // Sin cuerpo ni datos en el log: solo cómo ha fallado.
    console.error('[portal/patrimonio-inquilino] el puente no respondió:', abortado ? 'timeout' : 'red')
    return { caida: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

export async function altaInquilinoPorPuente(
  identidadId: string,
  contratoId: string,
  datos: DatosAltaInquilino,
): Promise<ResultadoPuenteAlta> {
  const r = await llamar({ metodo: 'POST', cuerpo: { identidadId, contratoId, ...datos } })
  if ('sinPuente' in r) return { estado: 'sin_puente' }
  if ('caida' in r) return { estado: 'error', causa: r.caida ?? 'red' }
  const estado = str(r.j?.estado)
  if (r.status === 201 && estado === 'ok' && str(r.j?.id)) return { estado: 'ok', id: str(r.j?.id)! }
  if (estado === 'invalido') return { estado: 'invalido', campo: str(r.j?.campo), motivo: str(r.j?.motivo) ?? 'dato no válido' }
  if (estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (r.status === 409 && estado === 'duplicado' && str(r.j?.id)) return { estado: 'duplicado', id: str(r.j?.id)!, nombre: str(r.j?.nombre) ?? '' }
  if (r.status === 409 && estado === 'ya_en_contrato' && str(r.j?.id)) return { estado: 'ya_en_contrato', id: str(r.j?.id)! }
  if (estado === 'sin_clave') return { estado: 'sin_clave' }
  if (estado === 'sin_configurar') return { estado: 'sin_puente' }
  console.error(`[portal/patrimonio-inquilino] respuesta inesperada del puente: ${r.status} ${estado ?? 'sin estado'}`)
  return { estado: 'error', causa: `puente_${r.status}` }
}

export async function piiInquilinoPorPuente(identidadId: string, inquilinoId: string): Promise<ResultadoPuentePii> {
  const r = await llamar({ metodo: 'GET', query: new URLSearchParams({ identidadId, inquilinoId }) })
  if ('sinPuente' in r) return { estado: 'sin_puente' }
  if ('caida' in r) return { estado: 'error', causa: r.caida ?? 'red' }
  const estado = str(r.j?.estado)
  if (r.status === 200 && estado === 'ok') {
    const ilegibles = Array.isArray(r.j?.ilegibles) ? (r.j!.ilegibles as unknown[]).filter((x): x is string => typeof x === 'string') : []
    // `null` = no lo dio (o no se ha podido leer: va en `ilegibles`). Nunca se rellena.
    return { estado: 'ok', nif: str(r.j?.nif), email: str(r.j?.email), telefono: str(r.j?.telefono), ilegibles }
  }
  if (estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (estado === 'sin_configurar') return { estado: 'sin_puente' }
  console.error(`[portal/patrimonio-inquilino] respuesta inesperada del puente: ${r.status} ${estado ?? 'sin estado'}`)
  return { estado: 'error', causa: `puente_${r.status}` }
}
