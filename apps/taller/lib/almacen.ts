// Almacenamiento de archivos del taller (fotos, firma, logo) tras un PUERTO, con Supabase Storage por REST.
//
// Bucket PRIVADO `taller`; ruta `<tallerId>/<carpeta>/<nombre>-<huella>.<ext>` (la carpeta es el id de la recepción, de la OT o `marca`).
// Subida con la clave de servicio (`TALLER_STORAGE_SERVICE_KEY`) contra `SUPABASE_URL`, ambas vía `requireSecret` (error con el
// nombre de la variable que falta, nunca `Bearer undefined`). Lectura SIEMPRE por URL firmada de corta duración; antes de firmar
// se comprueba que la ruta pertenece al taller que la pide (defensa en profundidad además de la ruta con el taller delante).
// Patrón de cabeceras: `apikey` + `Authorization` (las claves nuevas de Supabase no son JWT; ver docs/ROTACION-SERVICE-ROLE.md).
import { createHash } from 'node:crypto'
import { requireSecret } from '@central/core-identity/secret'

export type ArchivoSubido = { tallerId: string; carpeta: string; nombre: string; mime: string; bytes: Uint8Array }
export interface AlmacenArchivos {
  guardar(a: ArchivoSubido): Promise<{ ruta: string; huellaSha256: string }>
  /** URL firmada de lectura. `null` si la ruta no es del taller o el firmado falla (el llamante muestra «sin imagen»). */
  urlFirmada(tallerId: string, ruta: string, segundos?: number): Promise<string | null>
}

export const BUCKET_TALLER = 'taller'
/** Vida de las URL firmadas (segundos): la página se pinta y se imprime en minutos. */
export const SEGUNDOS_URL_FIRMADA = 300

export const huellaSha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const MIME_ACEPTADOS = Object.keys(EXT)

/** Tipo REAL de la imagen por sus primeros bytes (no por lo que diga el navegador). null si no es PNG/JPEG/WebP. */
export function mimeReal(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

/** Nombre seguro para la ruta: sin separadores ni nada que no sea [a-z0-9-]. */
const trozo = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
const CARPETA = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/

export function rutaDe(a: ArchivoSubido): { ruta: string; huella: string } {
  const ext = EXT[a.mime]
  if (!ext) throw new Error(`tipo de archivo no admitido: ${a.mime}`)
  if (!CARPETA.test(a.carpeta) || a.carpeta.includes('..') || a.carpeta.includes('//')) throw new Error('carpeta de almacén inválida')
  const huella = huellaSha256(a.bytes)
  const base = trozo(a.nombre)
  return { ruta: `${a.tallerId}/${a.carpeta}/${base ? base + '-' : ''}${huella}.${ext}`, huella }
}

export const rutaEsDelTaller = (tallerId: string, ruta: string) =>
  ruta.startsWith(`${tallerId}/`) && !ruta.includes('..') && !ruta.includes('//')

const codificar = (ruta: string) => ruta.split('/').map(encodeURIComponent).join('/')

type Fetch = typeof fetch
export type ConfigAlmacen = { url: string; claveServicio: string; fetch?: Fetch }

/** Almacén real contra Supabase Storage. `config` inyectable (tests con fetch falso). */
export function almacenSupabase(config: ConfigAlmacen): AlmacenArchivos {
  const f: Fetch = config.fetch ?? fetch
  const base = config.url.replace(/\/+$/, '')
  const cab = { apikey: config.claveServicio, Authorization: `Bearer ${config.claveServicio}` }
  return {
    async guardar(a) {
      const { ruta, huella } = rutaDe(a)
      // Copia a ArrayBuffer propio: el cuerpo exacto de los bytes, sin depender del buffer compartido.
      const cuerpo = a.bytes.slice().buffer as ArrayBuffer
      const r = await f(`${base}/storage/v1/object/${BUCKET_TALLER}/${codificar(ruta)}`, {
        method: 'POST', headers: { ...cab, 'Content-Type': a.mime, 'x-upsert': 'true' }, body: cuerpo,
      })
      if (!r.ok) throw new Error(`Storage upload ${r.status}`)
      return { ruta, huellaSha256: huella }
    },
    async urlFirmada(tallerId, ruta, segundos = SEGUNDOS_URL_FIRMADA) {
      if (!rutaEsDelTaller(tallerId, ruta)) return null
      try {
        const r = await f(`${base}/storage/v1/object/sign/${BUCKET_TALLER}/${codificar(ruta)}`, {
          method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: segundos }),
        })
        if (!r.ok) return null
        const d = (await r.json()) as { signedURL?: string; signedUrl?: string }
        const s = d.signedURL ?? d.signedUrl
        return s ? `${base}/storage/v1${s.startsWith('/') ? '' : '/'}${s}` : null
      } catch {
        return null
      }
    },
  }
}

/** Sin bytes (solo tests y entornos sin Storage): devuelve la ruta que correspondería y la huella. Nunca firma. */
export const almacenSoloMetadatos: AlmacenArchivos = {
  async guardar(a) {
    const { ruta, huella } = rutaDe(a)
    return { ruta, huellaSha256: huella }
  },
  async urlFirmada() {
    return null
  },
}

let activo: AlmacenArchivos | null = null
/** Implementación activa: Supabase Storage. Falta una variable → lanza con su nombre (no se pierde una foto en silencio). */
export function almacenActivo(): AlmacenArchivos {
  return (activo ??= almacenSupabase({ url: requireSecret('SUPABASE_URL'), claveServicio: requireSecret('TALLER_STORAGE_SERVICE_KEY') }))
}

/** Firma varias rutas a la vez. Sin Storage configurado o con fallo → mapa vacío para esas rutas (la pantalla pone «sin imagen»). */
export async function firmarVarias(tallerId: string, rutas: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  let a: AlmacenArchivos
  try { a = almacenActivo() } catch { return m }
  await Promise.all([...new Set(rutas)].map(async (r) => { const u = await a.urlFirmada(tallerId, r).catch(() => null); if (u) m.set(r, u) }))
  return m
}
