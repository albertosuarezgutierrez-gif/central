// Almacenamiento de archivos del taller (fotos de la recepción, firma) tras un PUERTO.
//
// TODO(F1-storage): @central/core-storage hoy solo FIRMA/compone URLs de Supabase Storage (lectura); no sube. Cuando exista el
// bucket privado `taller` y la clave de servicio en Vercel, la implementación real hará la subida (PUT) y devolverá la ruta
// `<tallerId>/<carpeta>/<huella>.<ext>`. Mientras tanto `almacenSoloMetadatos` NO guarda los bytes: devuelve la ruta que les
// correspondería y la huella SHA-256, y la app guarda solo esos metadatos (tabla recepcion_fotos / recepciones.firma_ruta).
import { createHash } from 'node:crypto'

export type ArchivoSubido = { tallerId: string; carpeta: string; nombre: string; mime: string; bytes: Uint8Array }
export interface AlmacenArchivos {
  guardar(a: ArchivoSubido): Promise<{ ruta: string; huellaSha256: string }>
}

export const huellaSha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const MIME_ACEPTADOS = Object.keys(EXT)

export const almacenSoloMetadatos: AlmacenArchivos = {
  async guardar(a) {
    const ext = EXT[a.mime]
    if (!ext) throw new Error(`tipo de archivo no admitido: ${a.mime}`)
    const huella = huellaSha256(a.bytes)
    return { ruta: `${a.tallerId}/${a.carpeta}/${huella}.${ext}`, huellaSha256: huella }
  },
}

/** Implementación activa. Cambiar aquí cuando exista la subida real. */
export const almacen: AlmacenArchivos = almacenSoloMetadatos
