// Terceros y testigos de un siniestro — el hueco que `central` no tenía y el
// CRM viejo de Manuel sí (`siniestro_contrarios`/`siniestro_testigos`).
//
// Reglas puras, SIN cifrado: el cifrado de nombre/teléfono/matrícula vive en
// la capa de datos de `apps/asegura` (mismo mecanismo que ya usa `Cliente`),
// igual que este paquete no cifra nada de `Cliente` tampoco. Aquí solo se
// decide si lo que llega es un dato válido.
//
// 🚨 EXCLUSIVO de siniestros `gestionado_correduria` (ver `siniestro-ramo.ts`):
// CIMA no manda terceros ni testigos con este detalle.
//
// 🚨 Ningún campo obligatorio salvo el `tipo` y AL MENOS un dato identificador
// (nombre, teléfono o matrícula) — un interviniente sin ningún dato no es un
// interviniente, es una fila vacía.

export type TipoInterviniente = 'tercero' | 'testigo'

export const TIPOS_INTERVINIENTE: readonly TipoInterviniente[] = ['tercero', 'testigo']

export function esTipoInterviniente(v: unknown): v is TipoInterviniente {
  return typeof v === 'string' && (TIPOS_INTERVINIENTE as readonly string[]).includes(v)
}

/** Lo que llega de la pantalla (cliente o corredor), sin cifrar. */
export type IntervinienteEntrada = {
  tipo: string
  /** Solo tiene sentido en `tercero` de un siniestro de auto/moto. */
  esConductor?: boolean | null
  nombre?: string | null
  telefono?: string | null
  /** Solo `tercero`: la matrícula del vehículo contrario. */
  matricula?: string | null
  marcaModelo?: string | null
  companiaNombre?: string | null
  numeroPoliza?: string | null
}

export type IntervinienteRevisado = {
  tipo: TipoInterviniente
  esConductor: boolean | null
  nombre: string | null
  telefono: string | null
  matricula: string | null
  marcaModelo: string | null
  companiaNombre: string | null
  numeroPoliza: string | null
}

const MAX_NOMBRE = 150
const MAX_TELEFONO = 30
const MAX_MATRICULA = 15
const MAX_TEXTO = 150

function limpia(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s === '' ? null : s.slice(0, max)
}

/**
 * Valida un interviniente antes de cifrarlo y guardarlo.
 *
 * Un `testigo` no lleva datos de vehículo (matrícula/marca/compañía/póliza):
 * si llegan, se DESCARTAN en silencio en vez de rechazar la petición entera —
 * es basura de un formulario mal armado, no un motivo para perder el nombre
 * y el teléfono que sí son válidos.
 */
export function revisarInterviniente(
  entrada: IntervinienteEntrada,
): { ok: true; interviniente: IntervinienteRevisado } | { ok: false; motivo: string } {
  if (!esTipoInterviniente(entrada.tipo)) return { ok: false, motivo: 'tipo de interviniente desconocido' }

  const nombre = limpia(entrada.nombre, MAX_NOMBRE)
  const telefono = limpia(entrada.telefono, MAX_TELEFONO)
  const esTercero = entrada.tipo === 'tercero'
  const matricula = esTercero ? limpia(entrada.matricula, MAX_MATRICULA) : null
  const marcaModelo = esTercero ? limpia(entrada.marcaModelo, MAX_TEXTO) : null
  const companiaNombre = esTercero ? limpia(entrada.companiaNombre, MAX_TEXTO) : null
  const numeroPoliza = esTercero ? limpia(entrada.numeroPoliza, 50) : null

  if (nombre === null && telefono === null && matricula === null) {
    return { ok: false, motivo: 'apunta al menos un nombre, un teléfono o una matrícula' }
  }

  return {
    ok: true,
    interviniente: {
      tipo: entrada.tipo,
      esConductor: esTercero && typeof entrada.esConductor === 'boolean' ? entrada.esConductor : null,
      nombre,
      telefono,
      matricula,
      marcaModelo,
      companiaNombre,
      numeroPoliza,
    },
  }
}
