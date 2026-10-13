// Los TRES niveles de acceso compartido, vistos como lo que la persona puede
// HACER (12/10/2026, decisión de Alberto).
//
// El titular no elige casillas sueltas: elige un PRESET —Consulta, Gestión o
// Total— y por dentro cada preset es un conjunto cerrado de capacidades. Este
// fichero es la única traducción alcance → capacidades; las rutas preguntan
// aquí («¿puede editar esta declarada?»), no miran el alcance a mano.
//
// Reglas que fija, cada una con su brazo en `capacidades.test.ts`:
//   1. **Fail-closed.** Un alcance desconocido, una lista vacía o un valor que
//      no es texto no abren NADA (todas las capacidades a `false`).
//   2. **Límites duros en todos los niveles**: nadie reautoriza a un cuarto
//      (`autorizarTerceros`) y nadie edita la cartera de CIMA (`editarCartera`):
//      esas pólizas las gestiona la correduría. Son constantes `false`, no un
//      cálculo que un alcance nuevo pueda torcer.
//   3. **Las pólizas AÑADIDAS por el titular** (`portal_poliza_declarada`) se
//      VEN con cualquier nivel (también en detalle, en solo lectura) pero solo
//      se añaden, editan o quitan con **Total**: es «hacer todo lo que el
//      titular», y lo que no es Total no lo hace.
//   4. Lo que se ve de la cartera (recibos, documentos, DNI…) NO se decide aquí:
//      lo decide `camposDeAlcances` póliza a póliza. Aquí solo se resume.
import {
  camposDeAlcances,
  esAlcance,
  puedeDarParte,
  type Alcance,
  type TipoOtorgante,
} from './autorizacion.ts'

export const NIVELES_COMPARTIDOS = ['consulta', 'gestion', 'total'] as const
export type NivelCompartido = (typeof NIVELES_COMPARTIDOS)[number]

/** El alcance que se ESCRIBE en `portal_autorizacion` para cada preset. */
export const ALCANCE_DE_NIVEL: Readonly<Record<NivelCompartido, Alcance>> = {
  consulta: 'ver_economico',
  gestion: 'gestion',
  total: 'total',
}

export type Capacidades = {
  /** Ver las pólizas (de cartera y añadidas) del titular. */
  verPolizas: boolean
  /** Recibos e importes (lo decide `camposDeAlcances`). */
  verRecibos: boolean
  /** Documentos de las pólizas (lo decide `camposDeAlcances`). */
  verDocumentos: boolean
  /** Dar un parte de siniestro en nombre del titular (`puedeDarParte`). */
  abrirParte: boolean
  /** Aportar documentos a sus pólizas. */
  subirDocumentos: boolean
  /** Abrir la ficha de una póliza AÑADIDA por el titular (siempre en solo lectura salvo Total). */
  verDeclaradas: boolean
  /** Añadir una póliza a la bóveda del titular, en su nombre. */
  anadirDeclaradas: boolean
  /** Corregir una póliza añadida por el titular. */
  editarDeclaradas: boolean
  /** Quitar una póliza añadida por el titular. */
  quitarDeclaradas: boolean
  /** Límite duro: SIEMPRE `false`. */
  autorizarTerceros: false
  /** Límite duro: SIEMPRE `false`. La cartera de CIMA la gestiona la correduría. */
  editarCartera: false
}

const NADA: Capacidades = {
  verPolizas: false,
  verRecibos: false,
  verDocumentos: false,
  abrirParte: false,
  subirDocumentos: false,
  verDeclaradas: false,
  anadirDeclaradas: false,
  editarDeclaradas: false,
  quitarDeclaradas: false,
  autorizarTerceros: false,
  editarCartera: false,
}

/** Se queda solo con lo que es un alcance conocido. Lo demás no abre nada. */
function conocidos(alcances: readonly unknown[]): Alcance[] {
  return alcances.filter(esAlcance)
}

/**
 * El preset que ve la persona para un conjunto de alcances vigentes: el MÁS
 * ALTO. `null` = ninguno conocido. Los alcances viejos se leen como el nivel que
 * de verdad abren: `ver`/`documentos` → Consulta; `partes` solo es Gestión si
 * cede una SOCIEDAD (en una física no abre nada de actuar → Consulta).
 */
export function nivelCompartido(
  alcances: readonly unknown[],
  tipo: TipoOtorgante = 'fisica',
): NivelCompartido | null {
  const a = conocidos(alcances)
  if (a.length === 0) return null
  if (a.includes('total')) return 'total'
  if (a.includes('gestion')) return 'gestion'
  if (tipo === 'juridica' && a.includes('partes')) return 'gestion'
  return 'consulta'
}

/**
 * Qué puede HACER quien tiene estos alcances vigentes sobre la ficha ENTERA de
 * un titular. `tipo` por defecto `'fisica'`: el lado restrictivo.
 */
export function capacidadesDeAlcances(
  alcances: readonly unknown[],
  tipo: TipoOtorgante = 'fisica',
): Capacidades {
  const a = conocidos(alcances)
  const nivel = nivelCompartido(a, tipo)
  if (nivel === null) return { ...NADA }
  const campos = camposDeAlcances(a, tipo)
  if (campos === null) return { ...NADA }
  const total = nivel === 'total'
  const actua = nivel === 'gestion' || total
  return {
    verPolizas: true,
    verRecibos: campos.recibos,
    verDocumentos: campos.documentos,
    abrirParte: puedeDarParte(a, tipo),
    subirDocumentos: actua && campos.documentos,
    // Abrir la ficha de una añadida ajena = ver prima, matrícula, catastro: solo con
    // Consulta o superior (lo que da `recibos`). El legado `ver` (solo tarjeta) NO.
    verDeclaradas: campos.recibos,
    anadirDeclaradas: total,
    editarDeclaradas: total,
    quitarDeclaradas: total,
    autorizarTerceros: false,
    editarCartera: false,
  }
}

export type AccionDeclarada = 'ver' | 'editar' | 'quitar' | 'parte'

/**
 * Quién es la DUEÑA de una póliza añadida para esta petición, o `null` (= 404).
 *
 *   - Si es de quien mira (`propia`), manda la propia: su identidad.
 *   - Si es de un titular que le ha abierto su ficha ENTERA (`ajena`), solo si
 *     sus capacidades permiten ESA acción.
 *   - Cualquier otro caso, `null`. Nunca se distingue «no existe» de «no puedes»:
 *     las dos son 404, que no confirma que la póliza exista.
 */
export function duenaDeDeclarada(entrada: {
  identidadQueMira: string
  propia: boolean
  ajena: { titularIdentidadId: string; capacidades: Capacidades } | null
  accion: AccionDeclarada
}): { identidadId: string; propia: boolean } | null {
  if (entrada.propia) return { identidadId: entrada.identidadQueMira, propia: true }
  const aj = entrada.ajena
  if (aj === null) return null
  // Nunca la identidad que mira por la vía ajena: eso sería «propia» y ya se miró.
  if (aj.titularIdentidadId === entrada.identidadQueMira || aj.titularIdentidadId === '') return null
  const c = aj.capacidades
  const permitido =
    entrada.accion === 'ver'
      ? c.verDeclaradas
      : entrada.accion === 'editar'
        ? c.editarDeclaradas
        : entrada.accion === 'quitar'
          ? c.quitarDeclaradas
          : c.abrirParte
  return permitido ? { identidadId: aj.titularIdentidadId, propia: false } : null
}
