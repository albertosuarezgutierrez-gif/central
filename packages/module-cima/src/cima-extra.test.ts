import { test } from "node:test";
import assert from "node:assert/strict";

import {
  camposCimaExtra,
  conCimaExtra,
  esProxyDeRastreo,
  recogerCimaExtra,
  sinCimaExtra,
  CIMA_EXTRA_DENEGADOS,
  CIMA_EXTRA_MAX,
  motivoExclusionCima,
  valorCimaExtra,
  type CimaExtraEntrada,
} from "./cima-extra.ts";
import { mapEiacPolAll } from "./eiac-pol-mapper.ts";
import { mapEiacRecAll } from "./eiac-rec-mapper.ts";
import { mapEiacSinAll } from "./eiac-sin-mapper.ts";
import { mapEiacCefAll } from "./eiac-cef-mapper.ts";
import { medirCoberturaCampos } from "./field-coverage.ts";

const IBAN = "ES9121000418450200051332";

function rutas(e: unknown): string[] {
  return ((e ?? []) as CimaExtraEntrada[]).map((x) => x.ruta);
}
function valores(e: unknown): string {
  return JSON.stringify(e ?? []);
}

// ---------------------------------------------------------------- denylist

test("denylist (revisión LOO-806): documentos, matrícula, contrario, bancario, perceptor, lesiones, implicados, fallecido", () => {
  const casos: Array<[string, string]> = [
    ["Siniestro.X.DNI", "documento de identidad"],
    ["Siniestro.X.DNIConductor", "documento de identidad"],
    ["Siniestro.X.NifCif", "documento de identidad"],
    ["Recibo.X.NIFPagador", "documento de identidad"],
    ["Siniestro.X.CIF", "documento de identidad"],
    ["Siniestro.X.Matricula", "identificador del vehículo"],
    ["Siniestro.X.MatriculaRemolque", "identificador del vehículo"],
    ["Siniestro.X.VehiculoContrario.Marca", "persona (vehículo del contrario)"],
    ["Siniestro.X.VehiculoContrario.Cualquiera.Hoja", "persona (vehículo del contrario)"],
    ["Siniestro.X.Pagos.NumeroCuenta", "dato bancario"],
    ["Siniestro.X.Pagos.CuentaPago", "dato bancario"],
    ["Siniestro.X.Pagos.Perceptor.Codigo", "persona"],
    ["Siniestro.X.PerceptorPago", "persona"],
    ["Siniestro.X.Lesiones.Tipo", "salud (Art. 9)"],
    ["Siniestro.X.DescripcionLesion", "salud (Art. 9)"],
    ["Siniestro.X.Implicados.Implicado.Codigo", "persona"],
    ["Siniestro.X.Implicado.Rol", "persona"],
    ["Siniestro.X.Fallecido.Fecha", "persona"],
    ["Siniestro.X.FechaFallecimiento", "dato personal (fallecimiento)"],
  ];
  for (const [ruta, motivo] of casos) assert.equal(motivoExclusionCima(ruta), motivo, ruta);
  // Sin falsos positivos obvios.
  assert.equal(motivoExclusionCima("Liquidacion.Cuentas.Cuenta.ImporteTotal"), null);
  assert.equal(motivoExclusionCima("Poliza.X.CifraNegocio"), null);
});

test("denylist: motivos por segmento, prefijo, «contiene» y subárbol de persona", () => {
  assert.equal(motivoExclusionCima("Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.IBAN"), "dato bancario");
  // Bloque de persona: el subárbol entero, sea cual sea la hoja.
  assert.equal(motivoExclusionCima("ProcesosEIAC.Objetos.Poliza.Tomador.PersonaFisica.Domicilio.NombreVia"), "persona");
  assert.equal(motivoExclusionCima("Poliza.Tomador.Cualquiera"), "persona");
  assert.equal(motivoExclusionCima("Recibo.DatosRecibo.Domicilio.NombreVia"), "dirección");
  assert.equal(motivoExclusionCima("Poliza.X.DatosContacto.Telefonos.Telefono"), "contacto");
  assert.equal(motivoExclusionCima("Poliza.X.TelefonoMovil"), "contacto");
  assert.equal(motivoExclusionCima("Poliza.X.Consentimientos.Consentimiento.Clase"), "excluido siempre (consentimientos)");
  assert.equal(motivoExclusionCima("Poliza.X.FechaNacimiento"), "dato personal");
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Bastidor"), "identificador del vehículo");
  assert.equal(motivoExclusionCima("Cabecera.DatosLote.IdLote"), "cabecera técnica");
  assert.equal(motivoExclusionCima("Siniestro.DatosSiniestro.Contrarios.Contrario.ImplicadoAutos.Vehiculo.Clase"), "persona");
  assert.equal(motivoExclusionCima("Siniestro.X.ReceptoresPago.Figura.DatosFigura.PersonaJuridica.RazonSocial"), "persona");
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Apellido1"), "persona");
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Fumador"), "persona");
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.RiesgoVida.Cuestionario.Fumador"), "salud (Art. 9)");
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.RiesgoSalud.Cualquiera"), "salud (Art. 9)");
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Matricula"), "identificador del vehículo");
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Tara"), null);
  // Índices no cambian el veredicto.
  assert.equal(motivoExclusionCima("Poliza.DatosRiesgos.Riesgo.1.RiesgoAutos.Vehiculo.0.Sexo"), "excluido siempre (sexo)");
  // OtrosDatos: el valor no se rescata (lo filtra esOtroDatoPersonal).
  assert.equal(motivoExclusionCima("Poliza.OtrosDatos.Dato.Valor"), "otro dato (lo filtra esOtroDatoPersonal)");
  assert.equal(motivoExclusionCima("Poliza.OtrosDatos.Dato.IdSubdato"), null);
  // La constante es la única fuente y nombra lo pedido.
  for (const k of ["IBAN", "BIC", "DatosCuentaCorriente", "TitularCuenta", "Domicilio", "NIF", "IdPersona", "PersonaFisica", "PersonaJuridica", "Persona", "Tomador", "RiesgoSalud"]) {
    assert.ok(k in CIMA_EXTRA_DENEGADOS.segmentos, k);
  }
  for (const k of ["Sexo", "EstadoCivil", "Profesion", "Idioma", "Consentimiento"]) {
    assert.ok(k in CIMA_EXTRA_DENEGADOS.siempreFuera, k);
  }
});

test("valor: vacío, fechas de relleno, DNI e IBAN fuera; texto libre tapado", () => {
  assert.equal(valorCimaExtra("  "), null);
  assert.equal(valorCimaExtra("1900-01-01"), null);
  assert.equal(valorCimaExtra("9999-12-31T00:00:00"), null);
  assert.equal(valorCimaExtra("12345678Z"), null);
  assert.equal(valorCimaExtra(IBAN), null);
  assert.equal(valorCimaExtra(" 1200 "), "1200");
  assert.equal(valorCimaExtra(42), "42");
  assert.equal(valorCimaExtra("Cuenta antigua ES12 3456 7890 1234 5678"), "Cuenta antigua [cuenta]");
  assert.equal(valorCimaExtra({}), null);
});

// ---------------------------------------------------------------- POL

function polizaBase(extra: Record<string, unknown> = {}) {
  return {
    DatosPoliza: { IdPoliza: "P-1", CodigoEntidad: { CodigoDGS: "C0468" } },
    SituacionPoliza: "EV",
    Fechas: { FechaEfectoInicial: "2026-01-01", FechaVencimiento: "2027-01-01" },
    Tomador: {
      PersonaFisica: {
        IdPersona: "12345678Z",
        Nombre: "ANA",
        Domicilio: { NombreVia: "CALLE FALSA 1", CodigoPostal: "41003" },
        Sexo: "M",
        DatosContacto: { Consentimientos: { Consentimiento: { Clase: "PUB", Situacion: "S" } } },
      },
    },
    GestionCobro: { DatosFormaPago: { DatosCuentaCorriente: { IBAN, BIC: "CAIXESBBXXX" } } },
    DatosRiesgos: {
      Riesgo: {
        RiesgoAutos: {
          Vehiculo: { Matricula: "1234ABC", Marca: "SEAT", Tara: "1200", Bastidor: "VSSZZZ6JZ9R000001" },
          Conductores: { Conductor: { PersonaFisica: { Nombre: "LUIS", Apellido1: "PEREZ" }, TipoPermiso: "B" } },
        },
      },
    },
    CampoInventado: "valor-x",
    ...extra,
  };
}

test("POL: hoja no mapeada → datos_especificos.cimaExtra; denegadas y consumidas, no", () => {
  const [m] = mapEiacPolAll({ Objetos: { Poliza: polizaBase() } } as never);
  const extra = m.datosEspecificos?.cimaExtra;
  const r = rutas(extra);
  assert.ok(r.includes("Poliza.CampoInventado"), r.join("\n"));
  assert.ok(r.includes("Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Tara"), r.join("\n"));
  // Nunca lo sensible.
  const txt = valores(extra);
  for (const prohibido of [IBAN, "CAIXESBBXXX", "CALLE FALSA", "41003", "12345678Z", "LUIS", "PEREZ", "VSSZZZ"]) {
    assert.ok(!txt.includes(prohibido), `se coló ${prohibido}`);
  }
  assert.ok(!r.some((x) => /IBAN|Domicilio|Sexo|Bastidor|Nombre|Apellido/.test(x)), r.join("\n"));
  // Lo consumido por los extractores no se duplica.
  assert.ok(!r.includes("Poliza.DatosPoliza.IdPoliza"));
  assert.ok(!r.includes("Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Matricula"));
  assert.ok(!r.includes("Poliza.Fechas.FechaEfectoInicial"));
  assert.equal(new Set(r).size, r.length, "sin duplicados");
});

test("POL: segundo riesgo con el mismo campo — índices exactos, no se da por leído", () => {
  const p = polizaBase({
    DatosRiesgos: {
      Riesgo: [
        { RiesgoAutos: { Vehiculo: { Matricula: "1111AAA", Tara: "1000" } } },
        { RiesgoAutos: { Vehiculo: { Matricula: "2222BBB", Tara: "2000" } } },
      ],
    },
  });
  const [m] = mapEiacPolAll({ Objetos: { Poliza: p } } as never);
  const tara = ((m.datosEspecificos?.cimaExtra ?? []) as CimaExtraEntrada[]).filter((e) => e.ruta.endsWith(".Tara"));
  assert.deepEqual(tara.map((e) => e.valor).sort(), ["1000", "2000"]);
});

test("POL: tope de entradas por objeto", () => {
  const muchos: Record<string, string> = {};
  for (let i = 0; i < CIMA_EXTRA_MAX + 50; i += 1) muchos[`Campo${i}`] = `v${i}`;
  const [m] = mapEiacPolAll({ Objetos: { Poliza: polizaBase({ BloqueRaro: muchos }) } } as never);
  const extra = m.datosEspecificos?.cimaExtra as CimaExtraEntrada[];
  assert.equal(extra.length, CIMA_EXTRA_MAX);
  assert.equal(m.datosEspecificos?.cimaExtraTruncado, true);
});

test("POL: cobertura — lo guardado cuenta como leído; lo denegado sale «excluido a propósito»", () => {
  const datos = { ProcesosEIAC: { Objetos: { Poliza: polizaBase() } } };
  const cob = medirCoberturaCampos(datos, (d) => mapEiacPolAll(d as never));
  const ruta = (r: string) => cob.rutas.find((x) => x.ruta === r);
  assert.equal(ruta("Objetos.Poliza.CampoInventado")?.leido, true);
  assert.equal(ruta("Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Tara")?.leido, true);
  const consent = ruta("Objetos.Poliza.Tomador.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Clase");
  assert.equal(consent?.leido, false);
  // 04/10/2026 — dentro de un bloque de persona, el motivo es la categoría que
  // sigue fuera SIEMPRE (no «persona»: la persona ya se guarda, en `figuras`).
  assert.equal(consent?.excluido, "excluido siempre (consentimientos)");
  assert.ok(cob.hojasExcluidas >= 2);
  const sexo = ruta("Objetos.Poliza.Tomador.PersonaFisica.Sexo");
  assert.equal(sexo?.leido, false);
  assert.equal(sexo?.excluido, "excluido siempre (sexo)");
  // El domicilio del tomador SÍ se lee ahora (va a `figuras`, cifrado).
  assert.equal(ruta("Objetos.Poliza.Tomador.PersonaFisica.Domicilio.NombreVia")?.leido, true);
  // Toda hoja no leída tiene motivo: nada se pierde «sin querer».
  const perdidas = cob.rutas.filter((r) => r.hoja && !r.leido && !r.excluido).map((r) => r.ruta);
  assert.deepEqual(perdidas, []);
});

// ---------------------------------------------------------------- REC

test("REC: hoja no mapeada → datos_extra.cimaExtra; IBAN/Domicilio nunca", () => {
  const [m] = mapEiacRecAll({
    Objetos: {
      Recibo: {
        DatosPoliza: { IdPoliza: "P-1", CodigoEntidad: { CodigoDGS: "C0468" } },
        DatosRecibo: {
          IdRecibo: "R-1",
          SituacionRecibo: "CO",
          CampoInventado: "valor-r",
          GestionCobro: {
            DatosFormaPago: { DatosCuentaCorriente: { IBAN, Titular: { Domicilio: { NombreVia: "CALLE FALSA 1" } } } },
          },
        },
      },
    },
  } as never);
  const extra = m.datosExtra?.cimaExtra;
  const r = rutas(extra);
  assert.ok(r.includes("Recibo.DatosRecibo.CampoInventado"), r.join("\n"));
  assert.ok(!valores(extra).includes(IBAN));
  assert.ok(!valores(extra).includes("CALLE FALSA"));
  assert.ok(!r.includes("Recibo.DatosRecibo.IdRecibo"));
});

// ---------------------------------------------------------------- SIN

test("SIN: cimaExtra en el mapper; cuenta como leído SOLO si `siniestros.cima_extra` existe", () => {
  const datos = {
    Objetos: {
      Siniestro: {
        DatosPoliza: { IdPoliza: "P-1" },
        DatosSiniestro: {
          IdSiniestroEntidad: "S-1",
          FechaOcurrencia: "2026-05-01",
          CampoInventado: "valor-s",
          Contrarios: { Contrario: { PersonaFisica: { Nombre: "PEPE" }, Domicilio: { NombreVia: "CALLE FALSA" } } },
          PagosSiniestro: { PagoSiniestro: { FormaPago: { DatosCuentaCorriente: { IBAN } } } },
        },
      },
    },
  };
  const [m] = mapEiacSinAll(datos as never);
  const r = rutas(m.cimaExtra);
  assert.ok(r.includes("Siniestro.DatosSiniestro.CampoInventado"), r.join("\n"));
  const txt = valores(m.cimaExtra);
  for (const p of [IBAN, "PEPE", "CALLE FALSA"]) assert.ok(!txt.includes(p), p);
  assert.ok(!r.includes("Siniestro.DatosSiniestro.IdSiniestroEntidad"));
  // Columna aún sin crear (defecto): se calcula pero se tiraría → NO cuenta como leído.
  const sinCol = medirCoberturaCampos(datos, (d) => mapEiacSinAll(d as never));
  assert.equal(sinCol.rutas.find((x) => x.ruta === "Objetos.Siniestro.DatosSiniestro.CampoInventado")?.leido, false);
  const [m2] = mapEiacSinAll(datos as never, { persisteCimaExtra: true });
  assert.deepEqual(m2.cimaExtra, m.cimaExtra, "mismo resto con o sin columna");
  const cob = medirCoberturaCampos(datos, (d) => mapEiacSinAll(d as never, { persisteCimaExtra: true }));
  assert.equal(cob.rutas.find((x) => x.ruta === "Objetos.Siniestro.DatosSiniestro.CampoInventado")?.leido, true);
  // Lo denegado sigue sin leer, con su motivo («excluido a propósito», no perdido).
  const iban = cob.rutas.find((x) => x.ruta.endsWith("DatosCuentaCorriente.IBAN"));
  assert.equal(iban?.leido, false);
  assert.ok(iban?.excluido, "el IBAN sale con motivo de exclusión");
});

// ---------------------------------------------------------------- CEF

test("CEF: cada nivel guarda su resto (cuenta, liquidación, movimiento) sin duplicar", () => {
  const datos = {
    Objetos: {
      CuentaEfectivo: {
        CodigoEntidad: { CodigoDGS: "C0468" },
        CampoCuenta: "valor-c",
        Liquidaciones: {
          Liquidacion: {
            DatosLiquidacion: {
              IdLiquidacionEntidad: "L-1",
              CampoLiq: "valor-l",
              FormaPago: { ClaseFormaPago: "TR", DatosCuentaCorriente: { IBAN, BIC: "CAIXESBBXXX" } },
              MovimientosLiquidacion: {
                MovimientoLiquidacion: [
                  { NumeroOrden: "1", CampoMov: "valor-m1", MovimientoRecibo: { DatosRecibo: { IdRecibo: "R-1", CampoRec: "valor-r" } } },
                  { NumeroOrden: "2", CampoMov: "valor-m2" },
                ],
              },
            },
          },
        },
      },
    },
  };
  const [c] = mapEiacCefAll(datos as never);
  assert.deepEqual(rutas(c.datosExtra?.cimaExtra), ["CuentaEfectivo.CampoCuenta"]);
  const liq = c.liquidaciones[0];
  assert.deepEqual(rutas(liq.datosExtra?.cimaExtra), ["CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.CampoLiq"]);
  const base = "CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion";
  const m1 = liq.movimientos[0].datosExtra?.cimaExtra as CimaExtraEntrada[];
  assert.ok(rutas(m1).includes(`${base}.CampoMov`));
  assert.ok(rutas(m1).includes(`${base}.MovimientoRecibo.DatosRecibo.CampoRec`));
  assert.ok(!rutas(m1).includes(`${base}.MovimientoRecibo.DatosRecibo.IdRecibo`));
  assert.deepEqual(
    (liq.movimientos[1].datosExtra?.cimaExtra as CimaExtraEntrada[]).map((e) => e.valor),
    ["valor-m2"],
  );
  assert.ok(!JSON.stringify(c).includes(IBAN));
  assert.ok(!JSON.stringify(c).includes("CAIXESBBXXX"));
  const cob = medirCoberturaCampos(datos, (d) => mapEiacCefAll(d as never));
  for (const r of ["Objetos.CuentaEfectivo.CampoCuenta", `Objetos.${base.replace("CuentaEfectivo.", "CuentaEfectivo.")}.CampoMov`]) {
    assert.equal(cob.rutas.find((x) => x.ruta === r)?.leido, true, r);
  }
});

// ---------------------------------------------------------------- revisión adversarial (03/10/2026)

function sinClavesExtra(x: unknown): unknown {
  return JSON.parse(
    JSON.stringify(x, (k, v) => {
      if (k === "cimaExtra" || k === "cimaExtraTruncado") return undefined;
      // Un jsonb que el colector creó solo para el resto equivale al null específico.
      if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0 &&
          Object.keys(v).every((c) => c === "cimaExtra" || c === "cimaExtraTruncado")) return null;
      return v;
    }),
  );
}

test("REC: el Tomador (nombre, apellidos, profesión, razón social) NUNCA va al resto", () => {
  const [m] = mapEiacRecAll({
    Objetos: {
      Recibo: {
        DatosPoliza: { IdPoliza: "P-1" },
        Tomador: {
          PersonaFisica: { Nombre: "TOMASA", Apellido1: "GARCIA", Apellido2: "LOPEZ", Profesion: { Descripcion: "FONTANERA" } },
          PersonaJuridica: { RazonSocial: "ACME SL" },
        },
        DatosRecibo: { IdRecibo: "R-1", SituacionRecibo: "CO", CampoInventado: "ok" },
      },
    },
  } as never);
  const txt = valores(m.datosExtra?.cimaExtra);
  for (const p of ["TOMASA", "GARCIA", "LOPEZ", "FONTANERA", "ACME"]) assert.ok(!txt.includes(p), p);
  assert.ok(rutas(m.datosExtra?.cimaExtra).includes("Recibo.DatosRecibo.CampoInventado"));
});

test("CEF: el Tomador del recibo embebido NUNCA va al resto", () => {
  const [c] = mapEiacCefAll({
    Objetos: {
      CuentaEfectivo: {
        Liquidaciones: {
          Liquidacion: {
            DatosLiquidacion: {
              MovimientosLiquidacion: {
                MovimientoLiquidacion: {
                  MovimientoRecibo: {
                    Tomador: { PersonaFisica: { Nombre: "TOMASA", Apellido1: "GARCIA" }, PersonaJuridica: { RazonSocial: "ACME SL" } },
                    DatosRecibo: { IdRecibo: "R-1" },
                  },
                },
              },
            },
          },
        },
      },
    },
  } as never);
  const txt = JSON.stringify(c);
  for (const p of ["TOMASA", "GARCIA", "ACME"]) assert.ok(!txt.includes(p), p);
});

test("POL: RiesgoVida/Decesos/Salud → la Persona (profesión, salud Art. 9) jamás", () => {
  for (const bloque of ["RiesgoVida", "RiesgoDecesos", "RiesgoSalud"]) {
    const [m] = mapEiacPolAll({
      Objetos: {
        Poliza: polizaBase({
          DatosRiesgos: {
            Riesgo: {
              [bloque]: {
                Persona: { Profesion: { Descripcion: "MINERO" }, Fumador: "S", Peso: "88" },
                DatosSalud: { Enfermedad: "DIABETES" },
              },
            },
          },
        }),
      },
    } as never);
    const txt = valores(m.datosEspecificos?.cimaExtra);
    for (const p of ["MINERO", "\"S\"", "88", "DIABETES"]) assert.ok(!txt.includes(p), `${bloque}: ${p}`);
  }
});

test("POL: conductor con la forma real Conductor.DatosConductor y bloques de persona no listados", () => {
  const [m] = mapEiacPolAll({
    Objetos: {
      Poliza: polizaBase({
        DatosRiesgos: {
          Riesgo: {
            RiesgoAutos: {
              Vehiculo: { Matricula: "1234ABC" },
              Conductores: { Conductor: { DatosConductor: { Nombre: "LUIS", Apellido1: "PEREZ", Profesion: "TAXISTA" } } },
              ConductorHabitual: { Alias: "LUISITO" },
            },
          },
        },
        Pagador: { Alias: "PAGADORA" },
        AcreedorHipotecario: { Entidad: "BANCO X" },
        AseguradoSalud: { Alias: "ASEG" },
      }),
    },
  } as never);
  const txt = valores(m.datosEspecificos?.cimaExtra);
  for (const p of ["LUIS", "PEREZ", "TAXISTA", "PAGADORA", "BANCO X", "ASEG"]) assert.ok(!txt.includes(p), p);
});

test("POL: segundo elemento de una lista que el extractor lee solo en [0] → su Nombre no se cuela", () => {
  const [m] = mapEiacPolAll({
    Objetos: {
      Poliza: polizaBase({
        DatosRiesgos: {
          Riesgo: { RiesgoEmbarcaciones: { Embarcacion: [{ Nombre: "BARCO UNO" }, { Nombre: "BARCO DOS", Eslora: "8" }] } },
        },
      }),
    },
  } as never);
  const txt = valores(m.datosEspecificos?.cimaExtra);
  assert.ok(!txt.includes("BARCO DOS"));
  assert.ok(rutas(m.datosEspecificos?.cimaExtra).some((r) => r.endsWith("Embarcacion.Eslora")));
});

test("contacto por CONTIENE y por VALOR (email, teléfono bajo un campo inocuo)", () => {
  assert.equal(motivoExclusionCima("Poliza.X.CorreoElectronico"), "contacto");
  assert.equal(motivoExclusionCima("Poliza.X.NumeroTelefono"), "contacto");
  assert.equal(motivoExclusionCima("Poliza.X.TlfMovilContacto"), "contacto");
  assert.equal(valorCimaExtra("600111222"), null);
  assert.equal(valorCimaExtra("+34 600 11 12 22"), null);
  assert.equal(valorCimaExtra("954123456"), null);
  assert.equal(valorCimaExtra("alguien@example.com"), null);
  const [m] = mapEiacPolAll({
    Objetos: { Poliza: polizaBase({ Inocuo: "600111222", Otro: "a@b.es", CorreoElectronico: "x", NumeroTelefono: "y" }) },
  } as never);
  const r = rutas(m.datosEspecificos?.cimaExtra);
  for (const k of ["Inocuo", "Otro", "CorreoElectronico", "NumeroTelefono"]) assert.ok(!r.includes(`Poliza.${k}`), k);
});

test("Nombre*/Apellido*/RazonSocial: denegados en GLOBAL salvo la lista permitida", () => {
  assert.equal(motivoExclusionCima("Poliza.Cualquier.Nombre"), "nombre");
  assert.equal(motivoExclusionCima("Poliza.Cualquier.NombreCompleto"), "nombre");
  assert.equal(motivoExclusionCima("Poliza.Cualquier.RazonSocial"), "nombre");
  assert.equal(motivoExclusionCima("Poliza.DatosPolizaReemplazada.DatosMediador.NombreMediador"), null);
});

test("rastreo que falla → SIN clave cimaExtra (null ≠ vacío: no borra el bueno anterior)", () => {
  const r = conCimaExtra({ a: "1" }, "X", (item) => {
    if (esProxyDeRastreo(item)) throw new Error("boom");
    return { datosExtra: null };
  });
  assert.equal(r.cimaExtra.entradas, null);
  assert.deepEqual(camposCimaExtra(r.cimaExtra), {});
});

test("colector que falla → SIN clave, el fichero no se tumba", () => {
  const malo = new Proxy({}, { ownKeys() { throw new Error("boom"); } });
  const res = recogerCimaExtra(malo, "X", new Set());
  assert.equal(res.entradas, null);
  assert.deepEqual(camposCimaExtra(res), {});
});

test("la salida específica es IDÉNTICA con y sin colector (POL, REC, SIN, CEF)", () => {
  const pol = { Objetos: { Poliza: polizaBase() } };
  assert.deepEqual(sinClavesExtra(mapEiacPolAll(pol as never)), sinClavesExtra(sinCimaExtra(() => mapEiacPolAll(pol as never))));
  const rec = { Objetos: { Recibo: { DatosRecibo: { IdRecibo: "R", CampoX: "1" } } } };
  assert.deepEqual(sinClavesExtra(mapEiacRecAll(rec as never)), sinClavesExtra(sinCimaExtra(() => mapEiacRecAll(rec as never))));
  const sin = { Objetos: { Siniestro: { DatosSiniestro: { IdSiniestroEntidad: "S", CampoX: "1" } } } };
  assert.deepEqual(sinClavesExtra(mapEiacSinAll(sin as never)), sinClavesExtra(sinCimaExtra(() => mapEiacSinAll(sin as never))));
  const cef = { Objetos: { CuentaEfectivo: { CampoX: "1", Liquidaciones: { Liquidacion: { DatosLiquidacion: { CampoY: "2" } } } } } };
  assert.deepEqual(sinClavesExtra(mapEiacCefAll(cef as never)), sinClavesExtra(sinCimaExtra(() => mapEiacCefAll(cef as never))));
  // Y sin colector no aparece la clave.
  assert.ok(!JSON.stringify(sinCimaExtra(() => mapEiacPolAll(pol as never))).includes("cimaExtra"));
});

// ---------------------------------------------------------------- re-revisión (03/10/2026)

test("valor: DNI/NIE/IBAN/teléfono con separadores también fuera", () => {
  for (const v of ["12.345.678-Z", "Y-1234567-X", "12345678 Z", "X/1234567/L", "ES91.2100.0418.4502.0005.1332", "600-111-222", "600.11.12.22"]) {
    assert.equal(valorCimaExtra(v), null, v);
  }
  assert.equal(valorCimaExtra("2026-01-01"), "2026-01-01");
  assert.equal(valorCimaExtra("1.234,56"), "1.234,56");
});

test("denylist: personas no listadas y direcciones por «contiene» / prefijo", () => {
  for (const r of [
    "Siniestro.X.Perito.Denominacion",
    "Siniestro.X.PeritoAsignado.Cualquiera",
    "Siniestro.X.Abogado.Firma",
    "Siniestro.X.Taller.Calle",
    "Siniestro.X.Usuario.Codigo",
    "Poliza.X.TitularVehiculo.Codigo",
    "Siniestro.X.Interviniente.Codigo",
    "Siniestro.X.Representante.Codigo",
    "Siniestro.X.Reclamante.Codigo",
    "Poliza.X.Arrendatario.Codigo",
    "Poliza.X.Inquilino.Codigo",
    "Siniestro.X.Victima.Codigo",
    "Siniestro.X.Herido.Codigo",
    "Siniestro.X.Tramitador.Codigo",
    "Poliza.DatosRiesgos.Riesgo.RiesgoHogar.Ubicacion.Calle",
    "Poliza.X.Calle",
    "Poliza.X.Via",
    "Poliza.X.ClaseVia",
    "Poliza.X.TipoVia",
    "Poliza.X.CodigoPostal",
    "Poliza.X.CP",
    "Poliza.X.Poblacion",
    "Poliza.X.Localidad",
    "Poliza.X.Municipio",
    "Poliza.X.Provincia",
    "Poliza.X.ReferenciaCatastral",
    "Poliza.X.DomicilioCobro",
    "Poliza.X.DireccionEnvio",
    "Poliza.X.FirmaDigital",
    "Poliza.X.Denominacion",
    "Poliza.X.RazonDeSer",
  ]) {
    assert.notEqual(motivoExclusionCima(r), null, r);
  }
  // Falsos positivos de «via»: no se niegan.
  assert.equal(motivoExclusionCima("Poliza.X.Vial"), null);
  assert.equal(motivoExclusionCima("Poliza.X.ReenviarAviso"), null);
});

test("POL: RiesgoHogar.Ubicacion y un Perito no salen al resto", () => {
  const [m] = mapEiacPolAll({
    Objetos: {
      Poliza: polizaBase({
        DatosRiesgos: {
          Riesgo: {
            RiesgoHogar: {
              Ubicacion: { Calle: "CALLE SECRETA", CodigoPostal: "41010", Localidad: "TRIANA", ReferenciaCatastral: "9872023VH5797S0001WX" },
            },
          },
        },
        Perito: { Denominacion: "PERITOS SA", Firma: "JUAN" },
      }),
    },
  } as never);
  const txt = valores(m.datosEspecificos?.cimaExtra);
  for (const p of ["CALLE SECRETA", "41010", "TRIANA", "9872023", "PERITOS", "JUAN"]) assert.ok(!txt.includes(p), p);
});
