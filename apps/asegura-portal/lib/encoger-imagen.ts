// Encoge en el NAVEGADOR una foto antes de subirla (24/09/2026). Una foto de móvil
// pesa 3-8 MB y Vercel corta el cuerpo a 4,5 MB sin llegar a la función. Un lado
// de 2000 px basta para leer un DNI, un carné o un permiso de circulación.
// Un PDF no se toca (perdería su capa de texto). Si algo del canvas falla, se
// devuelve el original: como mucho lo rechazará el servidor con un motivo claro.
const LADO_MAX = 2000
const UMBRAL_BYTES = 1_500_000

export async function encogerSiHaceFalta(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= UMBRAL_BYTES) return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * k))
    canvas.height = Math.max(1, Math.round(bmp.height * k))
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    const nombre = (file.name || 'foto').replace(/\.[a-z0-9]+$/i, '') + '.jpg'
    return new File([blob], nombre, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
