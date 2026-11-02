/**
 * FIGURAS y TERCEROS de CIMA con estructura (04/10/2026, decisión de Alberto).
 *
 * Qué se guarda de cada persona que trae el EIAC (póliza: tomador, asegurado,
 * conductores, pagador, beneficiario…; siniestro: perjudicado, contrario,
 * testigos…): el PAPEL, el nombre, el documento, el domicilio, el teléfono y el
 * email. NUNCA: sexo, estado civil, profesión, idioma ni consentimientos (no se
 * leen, así que tampoco cuentan como «leídos» en el medidor de cobertura).
 *
 * Nombres de clave anclados a los Documentos Estándar EIAC V07.1 (carpeta «CIMA»
 * de Drive): `tipo_persona` (choice PersonaFisica|PersonaJuridica), `tipo_personafisica`
 * (TipoIdentificacion, IdPersona, Nombre, Apellido1, Apellido2, Domicilio,
 * DatosContacto…), `tipo_domicilio` (NombreVia, CodigoPostal, Poblacion, Provincia,
 * ClaseVia, OtrosDatosVia, Pais), `tipo_contacto` (Telefonos/Telefono/Numero,
 * Emails/Email/Direccion), `tipo_figura` (DatosFigura + ClaseFigura) y la tabla
 * `claves_figura` (13.3.22).
 *
 * 🚨 PURO y EN CLARO: el mapper no cifra. Quien lo persista DEBE pasarlo por
 * `cifrarFigurasCima` (`figuras-cima-pii.ts`), que cifra nombre, documento
 * (→ `documentoCifrado`), dirección, teléfono, email y matrícula, y DESCARTA el
 * campo si el cifrado no devuelve `v1:` (sin clave, `encryptField` devuelve el
 * texto plano: perderlo se ve, escribirlo en claro no se ve nunca).
 *
 * Tres estados: cada clave está SIEMPRE (forma fija); `null` = no consta.
 */
import { codigoDgsDe } from "./codigo-entidad.ts";

/** `claves_figura` (EIAC V07.1, 13.3.22) → papel legible. */
export const PAPEL_POR_CLASE_FIGURA: Readonly<Record<string, string>> = {
  AD: "asegurado_dependiente",
  BE: "beneficiario",
  CO: "contratista",
  PA: "pagador",
  PE: "perjudicado",
  PR: "promotor",
  SU: "subcontratista",
  TE: "tercero",
  TS: "testigo",
};

/** Papeles que NO salen de `ClaseFigura` sino del bloque del EIAC que trae a la persona. */
export type PapelEstructural =
  | "tomador"
  | "asegurado"
  | "propietario"
  | "conductor_habitual"
  | "conductor_ocasional"
  | "contrario"
  | "conductor_contrario";

export interface DomicilioCima {
  /** `NombreVia` + `OtrosDatosVia`. PII Tier-1 → se cifra al persistir. */
  direccion: string | null;
  /** `ClaseVia` (Calle, Plaza…), en claro. */
  claseVia: string | null;
  cp: string | null;
  localidad: string | null;
  /** Código de provincia tal cual (tabla 12.1). */
  provincia: string | null;
  /** ISO 3166-1 alpha-3. */
  pais: string | null;
}

/** Una persona del EIAC con su papel. EN CLARO (forma intermedia del mapper). */
export interface FiguraCima {
  /** Papel legible (`tomador`, `pagador`, `perjudicado`…) u `otro` si la clave no está en `claves_figura`. */
  papel: string;
  /** `ClaseFigura` cruda del EIAC (null en los papeles estructurales). */
  claseFigura: string | null;
  tipoPersona: "fisica" | "juridica" | null;
  /** Física: Nombre + Apellido1 + Apellido2. Jurídica: RazonSocial. PII Tier-1. */
  nombre: string | null;
  /** `IdPersona` (NIF/NIE/CIF/pasaporte). PII → `documentoCifrado` al persistir. */
  documento: string | null;
  /** `TipoIdentificacion` (NI/NE/CI/PA…), código crudo. */
  tipoDocumento: string | null;
  domicilio: DomicilioCima | null;
  /** Primer `Telefonos/Telefono/Numero`. PII Tier-1. */
  telefono: string | null;
  /** Primer `Emails/Email/Direccion`. PII Tier-1. */
  email: string | null;
  /** Solo beneficiario (`tipo_beneficiario.Orden`). */
  orden?: string | null;
  /** Solo beneficiario (`tipo_beneficiario.PorcentajeParticipacion`). */
  porcentaje?: string | null;
  /** Solo terceros de siniestro con vehículo. PII Tier-1 (como `siniestro_contrarios.matricula`). */
  matricula?: string | null;
  /** Solo contrario: `DatosPoliza/NombreEntidad`. */
  compania?: string | null;
  /** Solo contrario: `DatosPoliza/CodigoEntidad/CodigoDGS`. */
  codigoEntidadDgs?: string | null;
  /** Solo contrario: `DatosPoliza/IdPoliza`. */
  numeroPoliza?: string | null;
  /** Solo contrario: `Responsabilidad` cruda (claves_responsabilidad). */
  responsabilidad?: string | null;
  /**
   * 20/10/2026 — solo terceros de SINIESTRO: `FechaNacimiento` cruda. PII → se cifra
   * al persistir (`FIGURA_CAMPOS_CIFRADOS`). En la póliza NO se lee (decisión 04/10).
   */
  fechaNacimiento?: string | null;
  /**
   * 20/10/2026 — solo contrario: domicilio del BIEN dañado del contrario
   * (`Contrarios/Contrario/ImplicadoDiversos/Domicilio`). `direccion` se cifra al persistir.
   */
  domicilioDanos?: DomicilioCima | null;
}

/**
 * `claves_figuraaccion` (EIAC V07.1) → papel de la figura PROFESIONAL de una acción
 * de tramitación (`AccionesSiniestro/Accion/FigurasAccion/FiguraAccion`). Tabla
 * propia: `PE` aquí es PERITO, no el «perjudicado» de `claves_figura`.
 */
export const PAPEL_POR_FIGURA_ACCION: Readonly<Record<string, string>> = {
  AB: "abogado",
  EA: "empresa_asistencia",
  PE: "perito",
  RE: "reparador",
  TA: "taller",
  TR: "tramitador",
};

/** `claves_figuraaccion` → papel; fuera de tabla → `profesional` (el crudo queda en `claseFigura`). */
export function papelDeFiguraAccion(raw: unknown): string {
  const c = str(raw)?.toUpperCase();
  return (c && PAPEL_POR_FIGURA_ACCION[c]) || "profesional";
}

/** Tope de figuras por objeto: ninguna póliza real pasa de una decena. */
export const MAX_FIGURAS = 60;

function str(raw: unknown): string | null {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** «No identificado» es el relleno de la norma para quien no tiene documento (13.32). */
const DOCUMENTO_RELLENO = /^no identificado$/i;

/** `claves_figura` → papel; código fuera de la tabla → `otro` (el crudo queda en `claseFigura`). */
export function papelDeClaseFigura(raw: unknown): string {
  const c = str(raw)?.toUpperCase();
  return (c && PAPEL_POR_CLASE_FIGURA[c]) || "otro";
}

/**
 * Papel de una `ClaseFigura` en un SINIESTRO. Igual que `papelDeClaseFigura` salvo
 * `AD`: en el SIN es el ADVERSO (el mapper lo enruta a contrarios, «verificado en
 * prod»), no el «asegurado dependiente» de la póliza.
 */
export function papelDeClaseFiguraSiniestro(raw: unknown): string {
  return str(raw)?.toUpperCase() === "AD" ? "contrario" : papelDeClaseFigura(raw);
}

/** `tipo_domicilio` → `DomicilioCima`, o null si no trae nada. */
export function domicilioCima(raw: unknown): DomicilioCima | null {
  const d = obj(raw);
  if (!d) return null;
  const direccion = [str(d.NombreVia), str(d.OtrosDatosVia)].filter((x): x is string => x !== null).join(" ");
  const out: DomicilioCima = {
    direccion: direccion === "" ? null : direccion,
    claseVia: str(d.ClaseVia),
    cp: str(d.CodigoPostal),
    localidad: str(d.Poblacion),
    provincia: str(d.Provincia),
    pais: str(d.Pais),
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}

function primerTelefono(contacto: Record<string, unknown> | null, persona: Record<string, unknown>): string | null {
  const tels = obj(contacto?.Telefonos)?.Telefono;
  for (const t of asArray(tels)) {
    const n = str(obj(t)?.Numero);
    if (n) return n;
  }
  // Respaldo de compañías que no siguen la norma (ya leído así en el SIN).
  return str(persona.Telefono) ?? str(obj(persona.Contacto)?.Telefono);
}

function primerEmail(contacto: Record<string, unknown> | null): string | null {
  const ems = obj(contacto?.Emails)?.Email;
  for (const e of asArray(ems)) {
    const d = str(obj(e)?.Direccion);
    if (d) return d;
  }
  return null;
}

/**
 * Una persona del EIAC → `FiguraCima`. Acepta `tipo_persona` (con envoltorio
 * `PersonaFisica`/`PersonaJuridica`) o una `tipo_personafisica` suelta (el
 * `Conductor`, la `Persona` de vida/decesos). null si no trae ni documento ni
 * nombre (fila vacía). PURA, nunca lanza.
 *
 * Lee SOLO: TipoIdentificacion, IdPersona, Nombre, Apellido1, Apellido2,
 * RazonSocial, Domicilio y DatosContacto, y FechaNacimiento únicamente con
 * `conNacimiento` (terceros del SIN, 20/10/2026; el persist la cifra; en la póliza
 * no se lee). Sexo, EstadoCivil, Profesion, Idioma, IdCliente y Consentimientos NO se tocan.
 */
export function figuraDePersona(
  raw: unknown,
  papel: string,
  opts: { claseFigura?: string | null; conNacimiento?: boolean } = {},
): FiguraCima | null {
  const p = obj(raw);
  if (!p) return null;
  const pf = obj(p.PersonaFisica);
  const pj = obj(p.PersonaJuridica);
  // Sin envoltorio: es una persona física suelta si trae algún campo de persona.
  const suelta = !pf && !pj && (p.IdPersona !== undefined || p.Nombre !== undefined || p.RazonSocial !== undefined)
    ? p
    : null;
  const persona = pf ?? pj ?? suelta;
  if (!persona) return null;
  const esJuridica = pj !== null || (suelta !== null && str(suelta.RazonSocial) !== null && str(suelta.Nombre) === null);

  const nombre = esJuridica
    ? str(persona.RazonSocial)
    : [str(persona.Nombre), str(persona.Apellido1), str(persona.Apellido2)]
        .filter((x): x is string => x !== null)
        .join(" ") || null;
  const docRaw = str(persona.IdPersona);
  const documento = docRaw && !DOCUMENTO_RELLENO.test(docRaw) ? docRaw : null;
  if (nombre === null && documento === null) return null;
  const contacto = obj(persona.DatosContacto);
  const out: FiguraCima = {
    papel,
    claseFigura: opts.claseFigura ?? null,
    tipoPersona: esJuridica ? "juridica" : "fisica",
    nombre,
    documento,
    tipoDocumento: str(persona.TipoIdentificacion),
    domicilio: domicilioCima(persona.Domicilio),
    telefono: primerTelefono(contacto, persona),
    email: primerEmail(contacto),
  };
  // Solo SIN (20/10/2026): la fecha de nacimiento del tercero, que el persist CIFRA.
  if (opts.conNacimiento === true) out.fechaNacimiento = esJuridica ? null : str(persona.FechaNacimiento);
  return out;
}

/** Documento normalizado para comparar identidad (no se guarda así). */
export function documentoNormalizado(d: string | null | undefined): string | null {
  const t = d?.replace(/[\s.-]/g, "").toUpperCase();
  return t ? t : null;
}

/**
 * FIGURAS de una PÓLIZA EIAC (POL) → `datos_especificos.figuras`:
 *  - `Tomador` → `tomador`;
 *  - `Asegurado[]` → `asegurado` (si es el propio tomador, por documento: solo
 *    papel, nombre y documento — su contacto ya está en la figura `tomador`);
 *  - `RiesgoAutos/Propietario` → `propietario`;
 *  - `RiesgoAutos/Conductores/Conductor[]/DatosConductor` → `conductor_habitual`
 *    u `conductor_ocasional` (ClaseConductor `OC`);
 *  - `OtrasFiguras/Figura[]` → papel por `ClaseFigura` (`claves_figura`);
 *  - `Beneficiarios/Beneficiario[]/Persona` → `beneficiario` + orden y porcentaje.
 * La `Persona` de vida/decesos va en `vida.persona`/`decesos.persona`, no aquí.
 * El titular de la cuenta y el del préstamo NO entran (no los pidió Alberto).
 */
export function extractFigurasPoliza(poliza: unknown): FiguraCima[] {
  const p = obj(poliza);
  if (!p) return [];
  const out: FiguraCima[] = [];
  const tomador = figuraDePersona(p.Tomador, "tomador");
  if (tomador) out.push(tomador);
  const docTomador = documentoNormalizado(tomador?.documento);

  for (const a of asArray(p.Asegurado)) {
    const f = figuraDePersona(a, "asegurado");
    if (!f) continue;
    if (docTomador && documentoNormalizado(f.documento) === docTomador) {
      out.push({ ...f, domicilio: null, telefono: null, email: null });
    } else {
      out.push(f);
    }
  }

  const riesgos = asArray(obj(p.DatosRiesgos)?.Riesgo);
  for (const r of riesgos) {
    const riesgo = obj(r);
    if (!riesgo) continue;
    const autos = obj(riesgo.RiesgoAutos);
    if (autos) {
      const prop = figuraDePersona(autos.Propietario, "propietario");
      if (prop) out.push(prop);
      for (const c of asArray(obj(autos.Conductores)?.Conductor)) {
        const co = obj(c);
        if (!co) continue;
        const papel = str(co.ClaseConductor)?.toUpperCase() === "OC" ? "conductor_ocasional" : "conductor_habitual";
        const f = figuraDePersona(co.DatosConductor, papel);
        if (f) out.push(f);
      }
    }
    for (const fig of asArray(obj(riesgo.OtrasFiguras)?.Figura)) {
      const fo = obj(fig);
      if (!fo) continue;
      const clase = str(fo.ClaseFigura);
      const f = figuraDePersona(fo.DatosFigura, papelDeClaseFigura(clase), { claseFigura: clase });
      if (f) out.push(f);
    }
    for (const b of asArray(obj(riesgo.Beneficiarios)?.Beneficiario)) {
      const bo = obj(b);
      if (!bo) continue;
      const persona = bo.Persona ?? bo.DatosBeneficiario ?? (bo.PersonaFisica || bo.PersonaJuridica ? bo : undefined);
      const f = figuraDePersona(persona, "beneficiario");
      if (!f) continue;
      out.push({ ...f, orden: str(bo.Orden) ?? str(bo.NumeroOrden), porcentaje: str(bo.PorcentajeParticipacion) });
    }
  }
  return out.slice(0, MAX_FIGURAS);
}

/**
 * TERCEROS de un SINIESTRO EIAC (SIN) → `siniestros.cima_extra.terceros` (solo
 * OPERADOR: la columna no está concedida al portal). Todas las personas del SIN con
 * su identificación (nombre, documento, domicilio, teléfono, email y fecha de
 * nacimiento), que el persist CIFRA (`cifrarFigura`):
 *  - `FigurasSiniestro/Figura[]` → papel por `ClaseFigura` (perjudicado, testigo,
 *    tercero…), con la matrícula si la figura trae vehículo;
 *  - `Contrarios/Contrario[]` → `contrario`: la persona de contacto
 *    (`PersonaContacto/Persona`), su compañía (`DatosPoliza`: nombre, DGS, nº póliza),
 *    la responsabilidad, la matrícula de `ImplicadoAutos/Vehiculo` y el domicilio del
 *    bien dañado (`ImplicadoDiversos/Domicilio` → `domicilioDanos`);
 *  - `Contrarios/Contrario[]/ImplicadoAutos/Conductor` → `conductor_contrario`
 *    (con la matrícula y la compañía del vehículo que conducía);
 *  - 20/10/2026 — los IMPLICADOS del lado asegurado y las figuras PROFESIONALES:
 *    `Asegurado/ImplicadoAutos/Conductor` → `conductor_asegurado`;
 *    `Asegurado/PersonaContacto/Persona` → `contacto_asegurado`;
 *    `Asegurado/Asistencias/Asistencia/Asistente` → `asistente` (asistencia: dato
 *    sensible, solo cifrado aquí);
 *    `AccionesSiniestro/Accion/FigurasAccion/FiguraAccion` → perito, taller, abogado…
 *    (`claves_figuraaccion`); `PagosSiniestro/PagoSiniestro/ReceptoresPago/Figura` →
 *    `receptor_pago`. El IBAN del pago NO se lee (lista de exclusión: «dato bancario»).
 * Un contrario sin persona pero con compañía/matrícula/domicilio también se guarda (nombre null).
 * Sexo, estado civil, profesión, idioma, consentimientos e IdCliente no se leen nunca.
 */
export function extractTercerosSiniestro(datosSiniestro: unknown): FiguraCima[] {
  const ds = obj(datosSiniestro);
  if (!ds) return [];
  const sinOpts = { conNacimiento: true } as const;
  const out: FiguraCima[] = [];
  for (const fig of asArray(obj(ds.FigurasSiniestro)?.Figura)) {
    const fo = obj(fig);
    if (!fo) continue;
    const clase = str(fo.ClaseFigura);
    const datos = obj(fo.DatosFigura);
    const f = figuraDePersona(datos, papelDeClaseFiguraSiniestro(clase), { ...sinOpts, claseFigura: clase });
    if (!f) continue;
    const persona = obj(datos?.PersonaFisica) ?? obj(datos?.PersonaJuridica);
    const veh = obj(datos?.Vehiculo) ?? obj(persona?.Vehiculo);
    out.push({ ...f, matricula: str(veh?.Matricula) ?? str(persona?.Matricula) });
  }
  for (const c of asArray(obj(ds.Contrarios)?.Contrario)) {
    const co = obj(c);
    if (!co) continue;
    const pol = obj(co.DatosPoliza);
    const vehiculoDe = (ia: unknown) => str(obj(obj(ia)?.Vehiculo)?.Matricula);
    const implicados = asArray(co.ImplicadoAutos);
    const matricula = implicados.map(vehiculoDe).find((m) => m !== null) ?? null;
    const domicilioDanos =
      asArray(co.ImplicadoDiversos)
        .map((idv) => domicilioCima(obj(idv)?.Domicilio))
        .find((d) => d !== null) ?? null;
    const comunes = {
      compania: str(pol?.NombreEntidad),
      codigoEntidadDgs: codigoDgsDe(pol?.CodigoEntidad)?.toUpperCase() ?? null,
      numeroPoliza: str(pol?.IdPoliza),
      responsabilidad: str(co.Responsabilidad)?.toUpperCase() ?? null,
    };
    const contacto = figuraDePersona(obj(co.PersonaContacto)?.Persona, "contrario", sinOpts);
    const algo = Object.values(comunes).some((v) => v !== null) || matricula !== null || domicilioDanos !== null;
    if (contacto) {
      out.push({ ...contacto, matricula, ...comunes, domicilioDanos });
    } else if (algo) {
      out.push({
        papel: "contrario",
        claseFigura: null,
        tipoPersona: null,
        nombre: null,
        documento: null,
        tipoDocumento: null,
        domicilio: null,
        telefono: null,
        email: null,
        matricula,
        ...comunes,
        domicilioDanos,
      });
    }
    for (const ia of implicados) {
      const cond = figuraDePersona(obj(ia)?.Conductor, "conductor_contrario", sinOpts);
      if (cond) out.push({ ...cond, matricula: vehiculoDe(ia), ...comunes });
    }
  }

  // 20/10/2026 — implicados del lado asegurado y figuras profesionales (después de
  // los terceros de siempre: el tope `MAX_FIGURAS` nunca se come a un contrario).
  const asegurado = obj(ds.Asegurado);
  for (const ia of asArray(asegurado?.ImplicadoAutos)) {
    const f = figuraDePersona(obj(ia)?.Conductor, "conductor_asegurado", sinOpts);
    if (f) out.push(f);
  }
  const contactoAsegurado = figuraDePersona(obj(asegurado?.PersonaContacto)?.Persona, "contacto_asegurado", sinOpts);
  if (contactoAsegurado) out.push(contactoAsegurado);
  for (const a of asArray(obj(asegurado?.Asistencias)?.Asistencia)) {
    for (const as of asArray(obj(a)?.Asistente)) {
      const ao = obj(as);
      const clase = str(ao?.ClaseFigura);
      const f = figuraDePersona(ao?.DatosFigura, "asistente", { ...sinOpts, claseFigura: clase });
      if (f) out.push(f);
    }
  }
  for (const ac of asArray(obj(ds.AccionesSiniestro)?.Accion)) {
    for (const fa of asArray(obj(obj(ac)?.FigurasAccion)?.FiguraAccion)) {
      const fo = obj(fa);
      const clase = str(fo?.ClaseFigura);
      const f = figuraDePersona(fo?.DatosFigura, papelDeFiguraAccion(clase), { ...sinOpts, claseFigura: clase });
      if (f) out.push(f);
    }
  }
  for (const p of asArray(obj(ds.PagosSiniestro)?.PagoSiniestro)) {
    for (const r of asArray(obj(obj(p)?.ReceptoresPago)?.Figura)) {
      const ro = obj(r);
      const clase = str(ro?.ClaseFigura);
      const f = figuraDePersona(ro?.DatosFigura, "receptor_pago", { ...sinOpts, claseFigura: clase });
      if (f) out.push(f);
    }
  }
  // Repeticiones (el mismo perito en tres acciones): las FUNDE campo a campo el
  // persist (`fusionarTercerosCima` + `mismoTercero`), sin perder ningún dato. Antes
  // del tope se quitan las repeticiones EXACTAS (todos los campos iguales, aún en
  // claro): así un SIN con muchas acciones no llena los 60 huecos de duplicados y
  // deja fuera figuras distintas del final (receptor_pago…). Orden intacto.
  return quitarRepeticionesExactas(out).slice(0, MAX_FIGURAS);
}

/** Clave estable (claves ordenadas) de una figura en claro, para detectar copias exactas. */
function claveExacta(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(claveExacta).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${claveExacta(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Quita las figuras idénticas campo a campo (conserva la primera). Dos distintas nunca se funden. */
export function quitarRepeticionesExactas(lista: FiguraCima[]): FiguraCima[] {
  const vistas = new Set<string>();
  return lista.filter((f) => {
    const k = claveExacta(f);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

