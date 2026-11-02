/**
 * 04/10/2026 — figuras/terceros con estructura, vida/decesos con valores y ramos
 * sin extractor propio aceptados (decisión de Alberto). Datos SINTÉTICOS.
 * Un brazo por aserción: cada `assert` protege UNA cosa.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { mapEiacPol, type ParsedEiacPol } from "./eiac-pol-mapper.ts";
import { mapEiacSinAll, type ParsedEiacSin } from "./eiac-sin-mapper.ts";
import { extractFigurasPoliza, extractTercerosSiniestro, papelDeClaseFigura, type FiguraCima } from "./figuras-cima.ts";
import {
  cifrarFigura,
  descifrarFigurasCima,
  fusionarTercerosCima,
} from "./figuras-cima-pii.ts";
// PORT central (fase 1): los 4 tests que usan `prepararDatosEspecificosCima`
// (pull-persist) y `valorCimaExtraSin` (persist-siniestro) se portan con la capa de BD.
import { motivoExclusionCima } from "./cima-extra.ts";
import { medirCoberturaCampos } from "./field-coverage.ts";

let prevKey: string | undefined;
beforeEach(() => {
  prevKey = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
});
afterEach(() => {
  if (prevKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
  else process.env.PII_ENCRYPTION_KEY = prevKey;
});

const esCifrado = (v: unknown) => typeof v === "string" && v.startsWith("v1:");

/** Persona física con TODO lo que la norma permite, incluidas las categorías que siguen fuera. */
function personaCompleta(over: Record<string, unknown> = {}) {
  return {
    PersonaFisica: {
      TipoIdentificacion: "NI",
      IdPersona: "00000001R",
      Nombre: "ANA",
      Apellido1: "PRUEBA",
      Apellido2: "FICTICIA",
      Sexo: "SEXO-CENTINELA",
      EstadoCivil: "ECIVIL-CENTINELA",
      Profesion: { Descripcion: "PROFESION-CENTINELA" },
      Idioma: "IDIOMA-CENTINELA",
      FechaNacimiento: "1980-05-01T00:00:00",
      Domicilio: { NombreVia: "CALLE FALSA 1", OtrosDatosVia: "2B", ClaseVia: "CL", CodigoPostal: "41003", Poblacion: "SEVILLA", Provincia: "41", Pais: "ESP" },
      DatosContacto: {
        Telefonos: { Telefono: { Numero: "600000000" } },
        Emails: { Email: { Direccion: "ana@example.com" } },
        Consentimientos: { Consentimiento: { Clase: "CONSENT-CENTINELA" } },
      },
      ...over,
    },
  };
}

function pol(poliza: Record<string, unknown>): ParsedEiacPol {
  return {
    Objetos: {
      Poliza: {
        DatosPoliza: { IdPoliza: "P-1", CodigoEntidad: { CodigoDGS: "C0468" }, DatosRamo: { RamoDGS: "999" } },
        SituacionPoliza: "EV",
        Fechas: { FechaEfectoInicial: "2026-01-01", FechaVencimiento: "2027-01-01" },
        Tomador: personaCompleta(),
        ...poliza,
      },
    },
  } as ParsedEiacPol;
}

// ----------------------------------------------------------- FIGURAS (POL)

test("figuras POL: tomador con domicilio, teléfono, email y documento", () => {
  const [t] = extractFigurasPoliza(pol({}).Objetos!.Poliza);
  assert.equal(t.papel, "tomador");
  assert.equal(t.nombre, "ANA PRUEBA FICTICIA");
  assert.equal(t.documento, "00000001R");
  assert.equal(t.domicilio?.direccion, "CALLE FALSA 1 2B");
  assert.equal(t.domicilio?.cp, "41003");
  assert.equal(t.telefono, "600000000");
  assert.equal(t.email, "ana@example.com");
});

test("figuras POL: cada categoría que SIGUE FUERA no sale en figuras (un brazo cada una)", () => {
  const json = JSON.stringify(extractFigurasPoliza(pol({}).Objetos!.Poliza));
  assert.ok(!json.includes("SEXO-CENTINELA"), "sexo");
  assert.ok(!json.includes("ECIVIL-CENTINELA"), "estado civil");
  assert.ok(!json.includes("PROFESION-CENTINELA"), "profesión");
  assert.ok(!json.includes("IDIOMA-CENTINELA"), "idioma");
  assert.ok(!json.includes("CONSENT-CENTINELA"), "consentimientos");
});

test("figuras POL: asegurado, conductores, propietario jurídico, pagador, beneficiario", () => {
  const figs = extractFigurasPoliza(
    pol({
      Asegurado: personaCompleta({ IdPersona: "00000002W", Nombre: "LUIS" }),
      DatosRiesgos: {
        Riesgo: {
          RiesgoAutos: {
            Vehiculo: { ClaseVehiculo: "AU" },
            Propietario: { PersonaJuridica: { IdPersona: "B00000000", RazonSocial: "EMPRESA FICTICIA SL" } },
            Conductores: {
              Conductor: [
                { ClaseConductor: "HA", DatosConductor: personaCompleta({ IdPersona: "00000003A", Nombre: "HAB" }).PersonaFisica },
                { ClaseConductor: "OC", DatosConductor: personaCompleta({ IdPersona: "00000004G", Nombre: "OCA" }).PersonaFisica },
              ],
            },
          },
          OtrasFiguras: { Figura: { ClaseFigura: "PA", DatosFigura: personaCompleta({ IdPersona: "00000005M", Nombre: "PAGA" }) } },
          Beneficiarios: { Beneficiario: { Orden: "1", PorcentajeParticipacion: "50", Persona: personaCompleta({ IdPersona: "00000006Y", Nombre: "BENE" }) } },
        },
      },
    }).Objetos!.Poliza,
  );
  const por = (papel: string) => figs.filter((f) => f.papel === papel);
  assert.equal(por("asegurado")[0]?.email, "ana@example.com");
  assert.equal(por("conductor_habitual")[0]?.documento, "00000003A");
  assert.equal(por("conductor_ocasional")[0]?.documento, "00000004G");
  assert.equal(por("propietario")[0]?.tipoPersona, "juridica");
  assert.equal(por("pagador")[0]?.claseFigura, "PA");
  assert.equal(por("beneficiario")[0]?.porcentaje, "50");
});

test("figuras POL: asegurado que ES el tomador → solo la figura, sin repetir su contacto", () => {
  const figs = extractFigurasPoliza(pol({ Asegurado: personaCompleta() }).Objetos!.Poliza);
  const aseg = figs.find((f) => f.papel === "asegurado");
  assert.equal(aseg?.documento, "00000001R");
  assert.equal(aseg?.telefono, null);
});

test("claves_figura: código fuera de la tabla → `otro` (el crudo se conserva en claseFigura)", () => {
  assert.equal(papelDeClaseFigura("TS"), "testigo");
  assert.equal(papelDeClaseFigura("ZZ"), "otro");
});

test("mapper POL: `figuras` va a datos_especificos (en claro aquí; lo cifra el persist)", () => {
  const r = mapEiacPol(pol({ DatosRiesgos: { Riesgo: { RiesgoAutos: { Vehiculo: { ClaseVehiculo: "AU" } } } } }));
  const figs = r.datosEspecificos?.figuras as FiguraCima[];
  assert.equal(figs[0].papel, "tomador");
});

// ----------------------------------------------------------- CIFRADO

test("cifrado: nombre, teléfono, email, dirección y documento → v1:, documento en claro desaparece", () => {
  const f = cifrarFigura(extractFigurasPoliza(pol({}).Objetos!.Poliza)[0] as unknown as Record<string, unknown>);
  assert.ok(esCifrado(f.nombre), "nombre");
  assert.ok(esCifrado(f.telefono), "telefono");
  assert.ok(esCifrado(f.email), "email");
  assert.ok(esCifrado((f.domicilio as Record<string, unknown>).direccion), "direccion");
  assert.ok(esCifrado(f.documentoCifrado), "documentoCifrado");
  assert.equal("documento" in f, false);
  assert.equal((f.domicilio as Record<string, unknown>).cp, "41003");
});

test("cifrado: sin clave NO se escribe en claro (campo a null)", () => {
  delete process.env.PII_ENCRYPTION_KEY;
  const f = cifrarFigura({ papel: "tomador", nombre: "ANA", documento: "00000001R" });
  assert.equal(f.nombre, null);
  assert.equal(f.documentoCifrado, null);
});

test("lectura: descifra nombre y deja el documento cifrado", () => {
  const [d] = descifrarFigurasCima([cifrarFigura({ papel: "tomador", nombre: "ANA", documento: "00000001R" })]);
  assert.equal(d.nombre, "ANA");
  assert.ok(esCifrado(d.documentoCifrado));
});

// ----------------------------------------------------------- VIDA / DECESOS

test("vida: valores del bloque con los nombres de la norma (13.61); null = no consta", () => {
  const r = mapEiacPol(
    pol({
      DatosRiesgos: {
        Riesgo: {
          RiesgoVida: {
            Persona: personaCompleta().PersonaFisica,
            IdAplicacion: "APL-1",
            ClaseSeguro: "AH",
            EdadJubilacion: "67",
            UsoArmas: "false",
            TrabajoAltura: "true",
            Prestamo: { NumeroPrestamo: "PR-9", ImporteNominal: "120000" },
          },
        },
      },
    }),
  );
  const vida = r.datosEspecificos?.vida as Record<string, unknown>;
  assert.equal(r.tipoSeguro, "vida");
  assert.equal(vida.idAplicacion, "APL-1");
  assert.equal(vida.claseSeguro, "AH");
  assert.equal(vida.edadJubilacion, "67");
  assert.equal(vida.usoArmas, false);
  assert.equal(vida.trabajoAltura, true);
  assert.equal(vida.usoMaquinaria, null);
  assert.equal((vida.prestamo as Record<string, unknown>).importeNominal, "120000.00");
  assert.equal((vida.persona as Record<string, unknown>).fechaNacimiento, "1980-05-01");
  assert.ok(!JSON.stringify(vida).includes("SEXO-CENTINELA"), "sexo fuera de vida.persona");
});

test("decesos: persona, idAplicacion, idEmpleado y modalidad (13.53)", () => {
  const r = mapEiacPol(
    pol({ DatosRiesgos: { Riesgo: { RiesgoDecesos: { Persona: personaCompleta().PersonaFisica, Modalidad: "FAMILIAR" } } } }),
  );
  const d = r.datosEspecificos?.decesos as Record<string, unknown>;
  assert.equal(r.tipoSeguro, "decesos");
  assert.equal(d.modalidad, "FAMILIAR");
  assert.equal(d.idAplicacion, null);
  assert.equal((d.persona as Record<string, unknown>).documento, "00000001R");
});

// ----------------------------------------------------------- RAMOS SIN EXTRACTOR

const GENERICOS = [
  "RiesgoAsistenciaViaje", "RiesgoCaucion", "RiesgoConstruccion", "RiesgoCredito",
  "RiesgoDefensaJuridica", "RiesgoIncendios", "RiesgoIndustriales", "RiesgoPerdidasDiversas",
  "RiesgoTransportes", "OtrosDanos", "OtrosMultirriesgos",
];

for (const bloque of GENERICOS) {
  test(`ramo genérico ${bloque}: se acepta como otros con su nombre, sin review`, () => {
    const r = mapEiacPol(pol({ DatosRiesgos: { Riesgo: { [bloque]: { IdAplicacion: "APL-7", Modalidad: "MOD-X" } } } }));
    assert.equal(r.outcome, "ok");
    assert.equal(r.tipoSeguro, "otros");
    assert.equal(r.datosEspecificos?.bloqueRiesgo, bloque);
    const extra = JSON.stringify(r.datosEspecificos?.cimaExtra);
    assert.ok(extra.includes(`${bloque}.IdAplicacion`), "hojas del bloque en cimaExtra");
  });
}

test("ramo genérico: el domicilio del bloque NO cae en cimaExtra (lista de exclusión)", () => {
  const r = mapEiacPol(pol({ DatosRiesgos: { Riesgo: { RiesgoIncendios: { Domicilio: { NombreVia: "CALLE OCULTA 9" } } } } }));
  assert.ok(!JSON.stringify(r.datosEspecificos?.cimaExtra).includes("CALLE OCULTA"));
});

test("RiesgoAsistenciaSanitaria es salud → review_salud (no guardado genérico)", () => {
  const r = mapEiacPol(pol({ DatosRiesgos: { Riesgo: { RiesgoAsistenciaSanitaria: { Modalidad: "X" } } } }));
  assert.equal(r.outcome, "review_salud");
});

test("RiesgoSalud sigue en review_salud", () => {
  const r = mapEiacPol(pol({ DatosRiesgos: { Riesgo: { RiesgoSalud: { Modalidad: "X" } } } }));
  assert.equal(r.outcome, "review_salud");
});

// ----------------------------------------------------------- TERCEROS (SIN)

function sin(ds: Record<string, unknown>): ParsedEiacSin {
  return {
    Objetos: {
      Siniestro: {
        DatosPoliza: { IdPoliza: "POL1", CodigoEntidad: { CodigoDGS: "C0109" } },
        DatosSiniestro: { IdSiniestroEntidad: "S1", FechaOcurrencia: "2026-03-01T00:00:00", ...ds },
      },
    },
  } as ParsedEiacSin;
}

test("terceros SIN: perjudicado con papel, domicilio, email y matrícula", () => {
  const [m] = mapEiacSinAll(
    sin({
      FigurasSiniestro: {
        Figura: { ClaseFigura: "PE", DatosFigura: { ...personaCompleta({ Nombre: "PERJ" }), Vehiculo: { Matricula: "0000AAA" } } },
      },
    }),
  );
  const t = m.terceros![0];
  assert.equal(t.papel, "perjudicado");
  assert.equal(t.claseFigura, "PE");
  assert.equal(t.domicilio?.localidad, "SEVILLA");
  assert.equal(t.email, "ana@example.com");
  assert.equal(t.matricula, "0000AAA");
  assert.ok(!JSON.stringify(m.terceros).includes("SEXO-CENTINELA"), "sexo fuera");
});

test("terceros SIN: contrario con compañía y matrícula; su conductor aparte", () => {
  const ts = extractTercerosSiniestro({
    Contrarios: {
      Contrario: {
        DatosPoliza: { NombreEntidad: "CIA FICTICIA", CodigoEntidad: { CodigoDGS: "m0083" }, IdPoliza: "X-1" },
        Responsabilidad: "causante",
        PersonaContacto: { Persona: { Nombre: "CONTACTO", Apellido1: "UNO" } },
        ImplicadoAutos: { Vehiculo: { Matricula: "1111BBB" }, Conductor: { IdPersona: "00000007F", Nombre: "COND" } },
      },
    },
  });
  const c = ts.find((x) => x.papel === "contrario");
  const cond = ts.find((x) => x.papel === "conductor_contrario");
  assert.equal(c?.compania, "CIA FICTICIA");
  assert.equal(c?.matricula, "1111BBB");
  assert.equal(c?.codigoEntidadDgs, "M0083");
  assert.equal(cond?.documento, "00000007F");
});

test("terceros SIN: testigo (TS)", () => {
  const ts = extractTercerosSiniestro({ FigurasSiniestro: { Figura: { ClaseFigura: "TS", DatosFigura: personaCompleta() } } });
  assert.equal(ts[0].papel, "testigo");
});

// ----------------------------------------------------------- PERSIST SIN (delta)

const T = (nombre: string, documento: string | null = null): FiguraCima => ({
  papel: "perjudicado", claseFigura: "PE", tipoPersona: "fisica", nombre, documento,
  tipoDocumento: null, domicilio: null, telefono: null, email: null,
});

test("terceros persist: se guardan CIFRADOS (nunca el documento en claro)", () => {
  const [g] = fusionarTercerosCima(null, [T("PEPE", "00000008P")], false)!;
  assert.ok(esCifrado(g.nombre));
  assert.ok(!JSON.stringify(g).includes("00000008P"));
});

test("terceros persist: el mismo tercero no se duplica; uno nuevo se añade", () => {
  const previos = fusionarTercerosCima(null, [T("PEPE", "00000008P")], false);
  const v = fusionarTercerosCima(previos, [T("PEPE", "00000008P"), T("LOLA")], false)!;
  assert.equal(v.length, 2);
});

test("terceros persist: en relleno (fichero viejo) gana lo guardado", () => {
  const previos = fusionarTercerosCima(null, [{ ...T("PEPE", "00000008P"), telefono: "611111111" }], false);
  const [v] = descifrarFigurasCima(fusionarTercerosCima(previos, [{ ...T("PEPE", "00000008P"), telefono: "622222222" }], true));
  assert.equal(v.telefono, "611111111");
});

// ----------------------------------------------------------- LISTA DE EXCLUSIÓN

test("exclusión: categorías que siguen fuera ganan dentro de un bloque de persona (una cada una)", () => {
  const base = "Poliza.Tomador.PersonaFisica";
  assert.equal(motivoExclusionCima(`${base}.Sexo`), "excluido siempre (sexo)");
  assert.equal(motivoExclusionCima(`${base}.EstadoCivil`), "excluido siempre (estado civil)");
  assert.equal(motivoExclusionCima(`${base}.Profesion.Descripcion`), "excluido siempre (profesión)");
  assert.equal(motivoExclusionCima(`${base}.Idioma`), "excluido siempre (idioma)");
  assert.equal(motivoExclusionCima(`${base}.DatosContacto.Consentimientos.Consentimiento.Clase`), "excluido siempre (consentimientos)");
});

test("exclusión: en claro (cimaExtra) siguen fuera IBAN, DNI y el bloque de persona", () => {
  assert.equal(motivoExclusionCima("Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.IBAN"), "dato bancario");
  assert.equal(motivoExclusionCima("Siniestro.X.NIF"), "documento de identidad");
  assert.equal(motivoExclusionCima("Poliza.Tomador.PersonaFisica.Domicilio.NombreVia"), "persona");
});

// ----------------------------------------------------------- REVISIÓN 04/10/2026

test("Art. 9: salud en un riesgo que NO es el primero ([Incendios, AsistenciaSanitaria]) → review_salud", () => {
  const r = mapEiacPol(
    pol({ DatosRiesgos: { Riesgo: [{ RiesgoIncendios: { IdAplicacion: "A" } }, { RiesgoAsistenciaSanitaria: { Modalidad: "DENTAL" } }] } }),
  );
  assert.equal(r.outcome, "review_salud");
});

test("Art. 9: [Incendios, RiesgoSalud] → review_salud", () => {
  const r = mapEiacPol(pol({ DatosRiesgos: { Riesgo: [{ RiesgoIncendios: { IdAplicacion: "A" } }, { RiesgoSalud: { Modalidad: "X" } }] } }));
  assert.equal(r.outcome, "review_salud");
});

test("Art. 9: RiesgoAsistenciaSanitaria denegado entero en cimaExtra", () => {
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.RiesgoAsistenciaSanitaria.Modalidad"), "salud (Art. 9)");
});

test("papel SIN según la norma (un brazo por código): TE tercero, PE perjudicado, TS testigo, AD contrario", () => {
  const papel = (c: string) =>
    extractTercerosSiniestro({ FigurasSiniestro: { Figura: { ClaseFigura: c, DatosFigura: personaCompleta() } } })[0].papel;
  assert.equal(papel("TE"), "tercero");
  assert.equal(papel("PE"), "perjudicado");
  assert.equal(papel("TS"), "testigo");
  assert.equal(papel("AD"), "contrario");
});

test("papel POL: AD sigue siendo asegurado_dependiente", () => {
  const figs = extractFigurasPoliza(
    pol({ DatosRiesgos: { Riesgo: { OtrasFiguras: { Figura: { ClaseFigura: "AD", DatosFigura: personaCompleta({ IdPersona: "00000009X" }) } } } } }).Objetos!.Poliza,
  );
  assert.equal(figs.find((f) => f.claseFigura === "AD")?.papel, "asegurado_dependiente");
});

test("fusión campo a campo: un nulo nuevo NO borra el teléfono guardado", () => {
  const previos = fusionarTercerosCima(null, [{ ...T("PEPE", "00000008P"), telefono: "611111111" }], false);
  const [v] = descifrarFigurasCima(fusionarTercerosCima(previos, [T("PEPE", "00000008P")], false));
  assert.equal(v.telefono, "611111111");
});

test("fusión campo a campo: lo nuevo no nulo gana", () => {
  const previos = fusionarTercerosCima(null, [{ ...T("PEPE", "00000008P"), telefono: "611111111" }], false);
  const [v] = descifrarFigurasCima(fusionarTercerosCima(previos, [{ ...T("PEPE", "00000008P"), telefono: "622222222" }], false));
  assert.equal(v.telefono, "622222222");
});

test("fusión campo a campo: dentro de domicilio, un cp nulo no borra el guardado", () => {
  const dom = (cp: string | null, localidad: string | null) => ({ direccion: null, claseVia: null, cp, localidad, provincia: null, pais: null });
  const previos = fusionarTercerosCima(null, [{ ...T("PEPE", "00000008P"), domicilio: dom("41003", null) }], false);
  const [v] = fusionarTercerosCima(previos, [{ ...T("PEPE", "00000008P"), domicilio: dom(null, "SEVILLA") }], false)!;
  assert.equal((v.domicilio as Record<string, unknown>).cp, "41003");
});

test("identidad: guardado sin documento + nuevo con documento y mismo nombre → UNA persona", () => {
  const previos = fusionarTercerosCima(null, [T("PEPE")], false);
  const v = fusionarTercerosCima(previos, [T("pepe", "00000008P")], false)!;
  assert.equal(v.length, 1);
});

test("identidad: dos documentos distintos con el mismo nombre → dos personas", () => {
  const previos = fusionarTercerosCima(null, [T("PEPE", "00000008P")], false);
  const v = fusionarTercerosCima(previos, [T("PEPE", "00000001R")], false)!;
  assert.equal(v.length, 2);
});

test("siempreFuera por nombre EXACTO: `Profesional*` no se lo lleva; `Consentimientos` sí", () => {
  assert.equal(motivoExclusionCima("Poliza.X.ProfesionalHabilitado"), null);
  assert.equal(motivoExclusionCima("Poliza.X.Consentimientos"), "excluido siempre (consentimientos)");
});

test("identidad: dos terceros SIN ningún identificador nunca se funden", () => {
  const vacio = (): FiguraCima => ({ ...T(""), nombre: null });
  const v = fusionarTercerosCima(fusionarTercerosCima(null, [vacio()], false), [vacio()], false)!;
  assert.equal(v.length, 2);
});

test("consentimientos: una variante (`ConsentimientoLOPD`) también queda fuera", () => {
  assert.equal(motivoExclusionCima("Poliza.X.ConsentimientoLOPD"), "excluido siempre (consentimientos)");
});

// ----------------------------------------------------------- 20/10/2026 — IMPLICADOS Y PROFESIONALES (SIN)
// Estructura anclada a las rutas reales vistas en `cima_cobertura_campos` (SIN de
// C0468/C0109/C0072); valores SINTÉTICOS.

function personaJuridica(over: Record<string, unknown> = {}) {
  return {
    PersonaJuridica: {
      TipoIdentificacion: "CI",
      IdPersona: "B00000000",
      RazonSocial: "TALLER FICTICIO SL",
      IdCliente: "IDCLIENTE-CENTINELA",
      Domicilio: { NombreVia: "POLIGONO FALSO 9", CodigoPostal: "41000", Poblacion: "SEVILLA", Provincia: "41" },
      ...over,
    },
  };
}

test("terceros SIN: conductor del asegurado con documento, domicilio y fecha de nacimiento", () => {
  const ts = extractTercerosSiniestro({
    Asegurado: { ImplicadoAutos: { Conductor: personaCompleta().PersonaFisica, Vehiculo: { Matricula: "0000AAA" } } },
  });
  const c = ts.find((x) => x.papel === "conductor_asegurado");
  assert.equal(c?.documento, "00000001R");
  assert.equal(c?.domicilio?.direccion, "CALLE FALSA 1 2B");
  assert.equal(c?.fechaNacimiento, "1980-05-01T00:00:00");
});

test("terceros SIN: persona de contacto del asegurado con documento y domicilio", () => {
  const ts = extractTercerosSiniestro({ Asegurado: { PersonaContacto: { Persona: personaCompleta().PersonaFisica } } });
  const c = ts.find((x) => x.papel === "contacto_asegurado");
  assert.equal(c?.documento, "00000001R");
  assert.equal(c?.domicilio?.cp, "41003");
});

test("terceros SIN: asistente (Asistencias) con clase y documento", () => {
  const ts = extractTercerosSiniestro({
    Asegurado: { Asistencias: { Asistencia: { Descripcion: "X", Asistente: { ClaseFigura: "EA", DatosFigura: personaJuridica() } } } },
  });
  const a = ts.find((x) => x.papel === "asistente");
  assert.equal(a?.claseFigura, "EA");
  assert.equal(a?.documento, "B00000000");
});

test("terceros SIN: figura de acción PE es PERITO (claves_figuraaccion), no perjudicado", () => {
  const ts = extractTercerosSiniestro({
    AccionesSiniestro: {
      Accion: { AccionSiniestro: "EP", FigurasAccion: { FiguraAccion: { ClaseFigura: "PE", DatosFigura: personaCompleta() } } },
    },
  });
  assert.equal(ts[0]?.papel, "perito");
  assert.equal(ts[0]?.documento, "00000001R");
});

test("terceros SIN: receptor del pago con documento; el IBAN no sale nunca", () => {
  const ts = extractTercerosSiniestro({
    PagosSiniestro: {
      PagoSiniestro: {
        ImportePago: "10",
        FormaPago: { ClaseFormaPago: "CC", DatosCuentaCorriente: { IBAN: "ES0000000000000000000000" } },
        ReceptoresPago: { Figura: { ClaseFigura: "TA", DatosFigura: personaJuridica() } },
      },
    },
  });
  const r = ts.find((x) => x.papel === "receptor_pago");
  assert.equal(r?.documento, "B00000000");
  assert.ok(!JSON.stringify(ts).includes("ES0000000000000000000000"), "IBAN fuera");
});

test("terceros SIN: domicilio del bien dañado del contrario (aunque no traiga persona)", () => {
  const ts = extractTercerosSiniestro({
    Contrarios: { Contrario: { ImplicadoDiversos: { Domicilio: { NombreVia: "CALLE CONTRARIA 3", Poblacion: "SEVILLA" } } } },
  });
  assert.equal(ts[0]?.domicilioDanos?.direccion, "CALLE CONTRARIA 3");
});

test("identidad: contrario que solo trae el domicilio del bien dañado, mismo SIN 3 veces → UNA fila", () => {
  const sin = () =>
    extractTercerosSiniestro({
      Contrarios: { Contrario: { ImplicadoDiversos: { Domicilio: { NombreVia: "CALLE CONTRARIA 3", CodigoPostal: "41003" } } } },
    });
  let guardado: unknown = null;
  for (let i = 0; i < 3; i++) guardado = fusionarTercerosCima(guardado, sin(), false);
  assert.equal((guardado as unknown[]).length, 1);
});

test("identidad: dos contrarios con domicilios del bien dañado distintos → dos filas", () => {
  const c = (via: string): FiguraCima[] =>
    extractTercerosSiniestro({ Contrarios: { Contrario: { ImplicadoDiversos: { Domicilio: { NombreVia: via, CodigoPostal: "41003" } } } } });
  const v = fusionarTercerosCima(fusionarTercerosCima(null, c("CALLE CONTRARIA 3"), false), c("CALLE CONTRARIA 5"), false)!;
  assert.equal(v.length, 2);
});

test("terceros SIN: IdCliente nunca sale (identificador interno de la compañía)", () => {
  const ts = extractTercerosSiniestro({
    AccionesSiniestro: { Accion: { FigurasAccion: { FiguraAccion: { ClaseFigura: "TA", DatosFigura: personaJuridica() } } } },
  });
  assert.ok(!JSON.stringify(ts).includes("IDCLIENTE-CENTINELA"));
});

test("figuras POL: la fecha de nacimiento NO se lee en la póliza (decisión 04/10)", () => {
  const fs = extractFigurasPoliza({ Tomador: personaCompleta() });
  assert.equal("fechaNacimiento" in fs[0], false);
});

test("cifrado: fecha de nacimiento y domicilio del bien dañado → v1:, sin texto en claro", () => {
  const g = cifrarFigura({
    papel: "contrario",
    fechaNacimiento: "1980-05-01T00:00:00",
    domicilioDanos: { direccion: "CALLE CONTRARIA 3", cp: "41003" },
  });
  assert.ok(esCifrado(g.fechaNacimiento));
  assert.ok(esCifrado((g.domicilioDanos as Record<string, unknown>).direccion));
});

test("lectura: descifra el domicilio del bien dañado", () => {
  const [d] = descifrarFigurasCima([cifrarFigura({ papel: "contrario", domicilioDanos: { direccion: "CALLE CONTRARIA 3" } })]);
  assert.equal((d.domicilioDanos as Record<string, unknown>).direccion, "CALLE CONTRARIA 3");
});

test("cepo: ningún bloque de domicilio de un tercero SIN persistido lleva la vía en claro", () => {
  const ts = extractTercerosSiniestro({
    FigurasSiniestro: { Figura: { ClaseFigura: "PE", DatosFigura: personaCompleta() } },
    Contrarios: { Contrario: { PersonaContacto: { Persona: personaCompleta().PersonaFisica }, ImplicadoDiversos: { Domicilio: { NombreVia: "CALLE CONTRARIA 3" } } } },
    Asegurado: { ImplicadoAutos: { Conductor: personaCompleta().PersonaFisica } },
  });
  const json = JSON.stringify(fusionarTercerosCima(null, ts, false));
  assert.ok(!json.includes("CALLE FALSA"), "domicilio de la persona en claro");
  assert.ok(!json.includes("CALLE CONTRARIA"), "domicilio del bien dañado en claro");
  assert.ok(!json.includes("1980-05-01"), "fecha de nacimiento en claro");
});

test("cobertura: las rutas de implicados y profesionales cuentan como LEÍDAS (mapper real)", () => {
  const datos = sin({
    Asegurado: {
      ImplicadoAutos: { Conductor: personaCompleta().PersonaFisica },
      Asistencias: { Asistencia: { Asistente: { ClaseFigura: "EA", DatosFigura: personaJuridica() } } },
    },
    AccionesSiniestro: { Accion: { AccionSiniestro: "EP", FigurasAccion: { FiguraAccion: { ClaseFigura: "PE", DatosFigura: personaCompleta() } } } },
  });
  const cov = medirCoberturaCampos(datos, (d) => mapEiacSinAll(d as ParsedEiacSin, { persisteCimaExtra: true }));
  const leida = (r: string) => cov.rutas.find((x) => x.ruta.endsWith(r))?.leido;
  assert.equal(leida("ImplicadoAutos.Conductor.IdPersona"), true);
  assert.equal(leida("ImplicadoAutos.Conductor.Domicilio.NombreVia"), true);
  assert.equal(leida("Asistente.DatosFigura.PersonaJuridica.IdPersona"), true);
  assert.equal(leida("FiguraAccion.DatosFigura.PersonaFisica.FechaNacimiento"), true);
  assert.equal(leida("ImplicadoAutos.Conductor.Sexo"), false, "sexo sigue sin leerse");
});

test("terceros SIN: 70 repeticiones del mismo perito no desplazan al receptor de pago distinto", () => {
  const accion = () => ({ AccionSiniestro: "EP", FigurasAccion: { FiguraAccion: { ClaseFigura: "PE", DatosFigura: personaCompleta() } } });
  const ts = extractTercerosSiniestro({
    AccionesSiniestro: { Accion: Array.from({ length: 70 }, accion) },
    PagosSiniestro: { PagoSiniestro: { ReceptoresPago: { Figura: { ClaseFigura: "TA", DatosFigura: personaJuridica() } } } },
  });
  assert.equal(ts.filter((x) => x.papel === "perito").length, 1, "repeticiones exactas colapsadas");
  assert.ok(ts.some((x) => x.papel === "receptor_pago" && x.documento === "B00000000"), "el receptor sobrevive");
});

test("terceros SIN: dos peritos distintos no se funden al quitar repeticiones", () => {
  const acc = (id: string, nombre: string) => ({
    FigurasAccion: { FiguraAccion: { ClaseFigura: "PE", DatosFigura: { PersonaFisica: { TipoIdentificacion: "NI", IdPersona: id, Nombre: nombre } } } },
  });
  const ts = extractTercerosSiniestro({
    AccionesSiniestro: { Accion: [acc("00000001R", "ANA"), acc("00000002W", "LUIS"), acc("00000001R", "ANA")] },
  });
  assert.equal(ts.filter((x) => x.papel === "perito").length, 2);
});
