// PATRIMONIO (25/10/2026) — saneado PURO de los parámetros de la URL del alta prerrellenada desde una póliza
// (`/patrimonio?alta=1&cp=&dir=&rc=&poliza=tipo:id&titular=`).
//
// 🚨 Todo lo que viene de la URL es una PETICIÓN, nunca un dato de confianza: aquí solo se valida la FORMA. El titular se
// busca luego DENTRO de los titulares con nivel de alta (el formulario lo ignora si no está), y la póliza se busca DENTRO
// de lo que ve la sesión cuando se enlaza (`responderSegurosInmueble`: ajena → 404). Nada de esto abre datos de nadie.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ParametrosAlta = Record<string, string | string[] | undefined>

export type PrecargaAltaSaneada = {
  cp: string
  direccion: string
  referenciaCatastral: string
  titular: string
  poliza: { tipo: 'cartera' | 'declarada'; id: string } | null
}

const uno = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/** `null` = no se pide un alta prerrellenada (falta `alta=1`). Cada campo malformado queda vacío; nunca lanza. */
export function precargaDeParametros(p: ParametrosAlta): PrecargaAltaSaneada | null {
  if (uno(p.alta) !== '1') return null
  const cp = uno(p.cp).trim()
  const rc = uno(p.rc).trim().toUpperCase()
  const dir = uno(p.dir).replace(/\s+/g, ' ').trim()
  const titular = uno(p.titular).trim()
  const [tipo, id] = uno(p.poliza).split(':')
  return {
    cp: /^\d{5}$/.test(cp) ? cp : '',
    direccion: dir.length <= 200 ? dir : '',
    referenciaCatastral: /^[0-9A-Z]{20}$/.test(rc) ? rc : '',
    titular: UUID.test(titular) ? titular : '',
    poliza: (tipo === 'cartera' || tipo === 'declarada') && id !== undefined && UUID.test(id) ? { tipo, id } : null,
  }
}
