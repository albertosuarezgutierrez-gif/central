// Alta de una empresa por el OPERADOR (Grupo ASegura, plataforma `/operador/clientes`) — `POST /api/operador/empresas`.
//
//   · Bearer `CONTABILIDAD_OPERADOR_SECRET` (requireSecret, sin fallback; tiempo constante). Sin la variable: 401 a todos.
//   · IDEMPOTENTE por NIF (`contabilidad.alta_empresa`, SECURITY DEFINER con candado por NIF): repetir el alta NO crea otra empresa;
//     completa lo que falte (ejercicio, plan, dueño si no hay ninguno activo, gestor y verticales autorizadas: solo AÑADE).
//     Nunca se pisa un dueño existente ni se cambia la marca/razón social de una empresa ya dada de alta (eso, en Ajustes).
//   · Siembra: ejercicio natural ABIERTO (año de `ejercicio` o el de hoy, reloj inyectado) y plan de cuentas PGC pymes
//     (`SEMILLA_PGC_PYMES` de @central/module-contabilidad, copia por empresa, editable después).
//   · Sin envío de nada a nadie: el dueño entra con su correo y un código (que hoy queda «no enviado»: ver lib/acceso.ts).
import { SEMILLA_PGC_PYMES } from '@central/module-contabilidad'
import type { FilaCuenta, RepoContable } from './repo.ts'
import { APPS_ORIGEN } from './secretos.ts'

export const SECTORES = ['generico', 'taller', 'hosteleria', 'limpieza', 'alquiler'] as const
export type Sector = (typeof SECTORES)[number]
export type Forma = 'sociedad' | 'autonomo'

const NIF_RE = /^[A-Z0-9]{8,12}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const HEX_RE = /^#[0-9a-f]{6}$/

export function normalizarNif(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const n = v.toUpperCase().replace(/[\s.-]/g, '')
  return NIF_RE.test(n) ? n : null
}

/**
 * Forma jurídica deducida del NIF cuando el operador no la da: DNI (8 cifras + letra) o NIE (X/Y/Z) = persona física → autónomo;
 * NIF de entidad (letra inicial A-W salvo X/Y/Z, p. ej. B para S.L.) = sociedad. null si no encaja en ninguno (se pide explícita).
 */
export function formaDesdeNif(nif: string): Forma | null {
  if (/^[0-9]{8}[A-Z]$/.test(nif) || /^[XYZ][0-9]{7}[A-Z]$/.test(nif)) return 'autonomo'
  if (/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(nif)) return 'sociedad'
  return null
}

export const filasSemillaPgc = (): FilaCuenta[] =>
  SEMILLA_PGC_PYMES.map(([codigo, nombre, nat]) => ({
    codigo, nombre, grupo: Number(codigo[0]), naturaleza: nat === 'D' ? 'deudora' : 'acreedora', admiteApuntes: true, activa: true,
  }))

type Persona = { email: string; nombre: string }
export type EntradaAltaValida = {
  nif: string; razonSocial: string; forma: Forma; sector: Sector; anio: number
  dueno: Persona; gestor: Persona | null; logoUrl: string | null; colorPrimario: string | null; origenes: string[]
}

function persona(v: unknown, etiqueta: string, errores: string[]): Persona | null {
  if (!v || typeof v !== 'object') { errores.push(`${etiqueta}: { email, nombre } obligatorio`); return null }
  const o = v as Record<string, unknown>
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : ''
  const nombre = typeof o.nombre === 'string' ? o.nombre.trim() : ''
  if (!EMAIL_RE.test(email) || email.length > 200) errores.push(`${etiqueta}.email no válido`)
  if (!nombre || nombre.length > 200) errores.push(`${etiqueta}.nombre obligatorio`)
  return { email, nombre }
}

export function validarEntradaAlta(b: unknown, hoy: Date): { ok: true; valor: EntradaAltaValida } | { ok: false; errores: string[] } {
  const errores: string[] = []
  if (!b || typeof b !== 'object') return { ok: false, errores: ['cuerpo JSON obligatorio'] }
  const o = b as Record<string, unknown>
  const nif = normalizarNif(o.nif)
  if (!nif) errores.push('NIF no válido')
  const razonSocial = typeof o.razonSocial === 'string' ? o.razonSocial.trim() : ''
  if (!razonSocial || razonSocial.length > 200) errores.push('razonSocial obligatoria (máx. 200)')
  let forma: Forma | null = null
  if (o.forma === 'sociedad' || o.forma === 'autonomo') forma = o.forma
  else if (o.forma !== undefined) errores.push('forma: sociedad | autonomo')
  else if (nif) {
    forma = formaDesdeNif(nif)
    if (!forma) errores.push('forma: no se deduce del NIF; indícala (sociedad | autonomo)')
  }
  // El sector es la plantilla de reglas; sin sector, la genérica (es el último eslabón de la precedencia, no un valor de cajón).
  const sector = (o.sector ?? 'generico') as Sector
  if (!SECTORES.includes(sector)) errores.push(`sector: ${SECTORES.join(' | ')}`)
  const anio = o.ejercicio === undefined ? hoy.getUTCFullYear() : o.ejercicio
  if (typeof anio !== 'number' || !Number.isInteger(anio) || anio < 2000 || anio > 2100) errores.push('ejercicio: año entre 2000 y 2100')
  const dueno = persona(o.dueno, 'dueno', errores)
  const gestor = o.gestor === undefined || o.gestor === null ? null : persona(o.gestor, 'gestor', errores)
  const logoUrl = typeof o.logoUrl === 'string' && o.logoUrl.trim() ? o.logoUrl.trim() : null
  if (logoUrl && !/^https:\/\/[^\s]+$/.test(logoUrl)) errores.push('logoUrl debe ser https://')
  const colorPrimario = typeof o.colorPrimario === 'string' && o.colorPrimario.trim() ? o.colorPrimario.trim().toLowerCase() : null
  if (colorPrimario && !HEX_RE.test(colorPrimario)) errores.push('colorPrimario: #rrggbb')
  const origenes = o.origenes === undefined ? [] : o.origenes
  if (!Array.isArray(origenes) || origenes.some((x) => !(APPS_ORIGEN as readonly string[]).includes(x as string))) {
    errores.push(`origenes: lista de ${APPS_ORIGEN.join(', ')}`)
  }
  if (gestor && dueno && gestor.email === dueno.email) errores.push('el gestor y el dueño no pueden ser el mismo correo')
  if (errores.length) return { ok: false, errores }
  return {
    ok: true,
    valor: {
      nif: nif!, razonSocial, forma: forma!, sector, anio: anio as number, dueno: dueno!, gestor, logoUrl, colorPrimario,
      origenes: [...new Set(origenes as string[])],
    },
  }
}

export type DepsAlta = {
  altaEmpresa(d: { nif: string; razonSocial: string; forma: Forma; sector: Sector; logoUrl: string | null; colorPrimario: string | null }): Promise<{ id: string; creado: boolean }>
  altaUsuario(email: string, nombre: string): Promise<string>
  conRepo<R>(empresaId: string, fn: (repo: RepoContable) => Promise<R>): Promise<R>
  hoy(): Date
}

export type ResultadoAlta =
  | { ok: true; status: 200 | 201; empresaId: string; creada: boolean; duenoUsuarioId: string | null; completado: string[] }
  | { ok: false; status: 400; errores: string[] }

export async function altaEmpresa(deps: DepsAlta, cuerpo: unknown): Promise<ResultadoAlta> {
  const v = validarEntradaAlta(cuerpo, deps.hoy())
  if (!v.ok) return { ok: false, status: 400, errores: v.errores }
  const d = v.valor
  const emp = await deps.altaEmpresa({ nif: d.nif, razonSocial: d.razonSocial, forma: d.forma, sector: d.sector, logoUrl: d.logoUrl, colorPrimario: d.colorPrimario })
  // Los usuarios se localizan/crean antes (función propia, sin empresa); el VÍNCULO se crea dentro de la empresa (RLS).
  const duenoId = await deps.altaUsuario(d.dueno.email, d.dueno.nombre)
  const gestorId = d.gestor ? await deps.altaUsuario(d.gestor.email, d.gestor.nombre) : null

  return deps.conRepo(emp.id, async (repo) => {
    const completado: string[] = []
    const ejercicioNuevo = await repo.crearEjercicio({ anio: d.anio, inicio: `${d.anio}-01-01`, fin: `${d.anio}-12-31`, estado: 'abierto' })
    if (ejercicioNuevo) completado.push(`ejercicio ${d.anio}`)
    if ((await repo.contarCuentas()) === 0) {
      await repo.sembrarPlan(filasSemillaPgc())
      completado.push('plan de cuentas PGC pymes')
    }
    const vinculos = await repo.vinculos()
    let duenoUsuarioId: string | null = null
    // Dueño: solo si la empresa no tiene NINGUNO activo (nunca un segundo dueño por repetir el alta con otro correo).
    if (!vinculos.some((x) => x.rol === 'dueno' && x.activo)) {
      await repo.vincular(duenoId, 'dueno')
      duenoUsuarioId = duenoId
      completado.push('dueño')
    } else if (vinculos.some((x) => x.usuarioId === duenoId && x.rol === 'dueno' && x.activo)) {
      duenoUsuarioId = duenoId
    }
    if (gestorId && !vinculos.some((x) => x.usuarioId === gestorId)) {
      await repo.vincular(gestorId, 'gestor')
      completado.push('gestor')
    }
    for (const app of d.origenes) {
      if (!(await repo.origenAutorizado(app))) {
        await repo.autorizarOrigen(app)
        completado.push(`origen ${app}`)
      }
    }
    await repo.auditar({ actor: 'operador', accion: emp.creado ? 'alta_empresa' : 'completar_alta', entidad: 'empresas', entidadId: emp.id, detalle: { nif: d.nif, completado } })
    return { ok: true as const, status: emp.creado ? 201 as const : 200 as const, empresaId: emp.id, creada: emp.creado, duenoUsuarioId, completado }
  })
}

export function crearManejadorAlta(deps: { autorizado(req: Request): boolean; alta(cuerpo: unknown): Promise<ResultadoAlta> }) {
  return async function POST(req: Request): Promise<Response> {
    if (!deps.autorizado(req)) return json({ error: 'No autorizado' }, 401)
    const r = await deps.alta(await req.json().catch(() => null))
    if (!r.ok) return json({ error: 'datos_no_validos', errores: r.errores }, r.status)
    return json({ empresaId: r.empresaId, creada: r.creada, duenoUsuarioId: r.duenoUsuarioId, completado: r.completado }, r.status)
  }
}

const json = (o: unknown, status: number) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
