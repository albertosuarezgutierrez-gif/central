# Estudio: nóminas completas como módulo activable (rrhh / aparte) — 05/11/2026

Solo lectura. Red: no llega a sede AEAT / Seg. Social / BOE (getaddrinfo falla en agenciatributaria, uniondemutuas, cuatrecasas); todo lo externo viene de buscadores y fuentes secundarias. Etiquetas: [Seguro] = varias fuentes coinciden o es de código; [Probable] = una fuente fiable o coherencia indirecta; [Suposición] = mío, a verificar con gestor.

---------------------------------------------------------------------------
## 1. Inventario del repo

### 1.1 `packages/module-nominas` (394 líneas, TS puro)
- `src/calcular.ts:17-124` `calcularNomina(contrato, incidencias, tablas, periodo)`. Hecho: salario base × jornada (l.28), complementos fijos, horas extra, pluses, descuentos por días (ausencia/IT/vacaciones, l.45-58), base de cotización con clamp min/max del grupo (l.66-67), deducciones CC/desempleo/FP (l.70-86), IRPF, neto, cuota patronal (CC, desempleo, FOGASA, FP, AT/EP) y coste total.
- `src/tablas-2026.ts:5-38` bases por grupo + tipos + SMI. `src/at-ep.ts:6-50` tabla CNAE→tipo AT/EP (~35 códigos, 4 dígitos con caída a 3). `src/tipos.ts` contratos/incidencias/desglose. `src/index.ts` exporta.
- Tests: `src/calcular.test.ts` (7 casos `it`, 83 líneas). No hay test de at-ep ni de tablas. Sin `test/` propio; el paquete se prueba con vitest local.

**Defectos de exactitud detectados (críticos para "cálculo automático")**
1. **Tablas 2026 obsoletas = valores 2025.** `tablas-2026.ts:7-17` usa base máxima 4.909,50, mínimo grupo 1 = 1.847,40, grupos 4-7 = 1.184,10, diarias 39,47; `smi: 1184.10` (l.35). Según fuentes 2026: base máxima 5.101,20 €/mes (170,04 €/día) [Seguro: RDL 3/2026 + Orden PJC/297/2026]; mínimo grupo 1 = 1.989,30; grupos 4-7 ≈ 1.424,40 (la Orden pone mínimo común; 10 céntimos de duda entre fuentes) [Probable]; grupos 8-11 mínimo 47,48 €/día [Probable]. SMI 2026 = 1.221 €/mes en 14 pagas (17.094 €/año, 40,70 €/día), RD 126/2026, con efectos 1-ene-2026 [Seguro]. Es decir, el motor hoy calcula mal cotización y no detecta salarios bajo SMI.
2. **Falta el MEI** (Mecanismo de Equidad Intergeneracional): 2026 = 0,9 % sobre la base de contingencias comunes (reparto empresa 0,75 / trabajador 0,15) [Probable: la reparto 5:1 viene de la norma; el 0,9 total lo confirman 2 fuentes]. No existe en `TiposCotizacion`.
3. **Falta cotización de solidaridad** (tramos sobre el exceso de la base máxima, desde 2025) [Seguro que existe; tipos exactos por verificar].
4. **IRPF = % plano** del contrato (`irpfRetencionPct`, l.80): no hay algoritmo AEAT, ni modelo 145 (situación familiar, hijos, discapacidad, pensiones compensatorias, hipoteca anterior a 2013), ni regularización, ni retención sobre pagas extra, ni mínimo SMI.
5. **Horas extra** = salario/160 (l.37) sin convenio, sin recargo, y sin distinguir base de AT/EP (las horas extra estructurales/ordinarias cotizan distinto a las de fuerza mayor). No lee fichajes.
6. **Pagas extra**: no hay prorrata ni mensualidades extra; la nómina es siempre 12 mensuales planas. Base de cotización "clamp" sobre devengo mensual sin prorrata de extras (es la causa más frecuente de error en SS).
7. **IT / baja**: se trata como descuento por días (`baja_it`), no como prestación (pago delegado, 60 %/75 %, día 4-20, 21+, complemento convenio, base reguladora). No hay AT/EP IT, maternidad/paternidad, ERTE.
8. **Contratos**: sin recargo por temporal <30 días, bonificaciones, fijo discontinuo, formación, prácticas, relevo; `parcial` no se combina con `indefinido/temporal` (es un único enum), y desempleo parcial usa tipo indefinido o temporal por enum, no por duración real.
9. **Sin embargos** (LEC art. 607: escalas sobre SMI, inembargable), anticipos, dietas exentas, especie, ni cotización por conceptos excluidos/exentos.
10. Redondeo con `Math.round(n*100)/100` en euros float (no céntimos enteros): riesgo de ±1 céntimo frente a la TGSS. `module-contabilidad` ya trabaja en céntimos (`Centimos`).

### 1.2 `apps/rrhh` (nóminas)
| Pieza | Dónde | Estado |
|---|---|---|
| Generar borradores del mes | `lib/nominas.ts:66-114` `generarBorradores`; `api/admin/nominas/generar/route.ts` (21 l.) | Hecho (solo contratos activos + empleado activo; sin incidencias automáticas) |
| Cron mensual | `api/cron/nominas/route.ts:1-30` (día 25, 08h; recorre TODAS las empresas, sin interruptor por empresa) | Hecho, no activable por empresa |
| Incidencias del mes (CRUD + recálculo) | `lib/nominas.ts:132-172`; `api/admin/nominas/[nominaId]/incidencias/route.ts` y `[incId]/route.ts` | Hecho (manual) |
| Confirmar + PDF + publicar | `api/admin/nominas/[nominaId]/confirmar/route.ts:1-51`; `lib/nomina-pdf.tsx` (83 l.) → Storage `nominas/<empresa>/<periodo>/<id>.pdf` + fila `rrhh.documentos` carpeta `nominas` (visible al empleado) | Hecho (PDF sencillo; sin firma `no_requiere`) |
| Panel admin | `app/admin/nominas/page.tsx`, `[periodo]/page.tsx`, `NominasPanel.tsx` | Hecho |
| Distribuir PDFs de gestoría por empleado | `lib/distribuir-nominas.ts` (162 l., pdfjs + IA `identificarEmpleado` + pdf-lib) + `DistribuirPdfPanel.tsx` + `api/admin/nominas/distribuir-pdf/route.ts` (41 l.) | Hecho. Es el flujo "la gestoría calcula, rrhh solo reparte" — hoy el uso real |
| Convenio | `empresas.convenio_codigo/nombre/datos` (0011/0012); agente IA `lib/convenio-agente` (`api/admin/cuenta/convenio/analizar`) — datos ORIENTATIVOS: días de permisos, jornada, vacaciones | Parcial: sin tablas salariales ni pluses por categoría |
| Contrato laboral por empleado | tabla `rrhh.contratos_laborales` (0016), `lib/contratos.ts`, `app/admin/empleados/[id]/contrato/ContratoForm.tsx`; `categoria_convenio` existe pero no alimenta salario | Parcial (sin fecha fin, sin alta/baja TGSS, sin CCC, sin ocupación CNO, sin coeficiente parcialidad, sin modelo 145) |
| Empleado | `empleados.dni`, `nss` (0014), domicilio, fecha nacimiento... | Parcial (faltan IBAN, tipo doc, nacionalidad/código país, situación familiar) |
| Empresa | `empresas.cnae_codigo`, `at_ep_tipo` (0015) | Parcial (faltan CCC/NAF/CIF/domicilio fiscal, IBAN, representante, autorización RED) |
| Fichajes | tabla `rrhh.fichajes` (0024 y ss.), `api/e/fichaje`, `api/admin/fichajes/*` (+ exportar), `packages/module-horario` (`jornada.ts:173 horasExtra`, `costePersonal`) | Hecho para fichar; **no hay puente fichajes → incidencias `horas_extra`** |
| Migraciones | 0015 (CNAE/AT-EP), 0016 `contratos_laborales`, 0017 `nominas` (estado borrador/confirmada/enviada, `datos_calculo` JSONB) + `incidencias_mes` | Hechas. Nota: CLAUDE.md de rrhh avisa de que las migraciones "NO aplicadas a la BD real desde el código" son una práctica; verificar con MCP Supabase que 0016/0017 existen en prod antes de planificar |
| Tests | `lib/nominas.test.ts` (solo `parsePeriodo`/`periodoActual`); `distribuir-nominas.test.ts`; guardián multi-tenant `test/regression-lote2-rrhh-empresa.test.ts:110,145` incluye `nominas.ts` | Cobertura de cálculo solo en el paquete |
| Roadmap | `docs/ROADMAP-rrhh.md`: "Coste laboral real en plataforma" (l.~62), "Pago real de la nómina", "Portal de la gestoría + export A3/Sage", "Finiquito automático", "Anticipos", "Integración SEPE/Sistema RED 🔮 grande", "Modelo 145 al onboarding", "Registro de jornada / informe ITSS" | Todas son ideas, ninguna hecha salvo fichaje/PRL |
| Contabilidad | no hay llamada alguna de rrhh a `module-contabilidad` | No existe |
| Activación por empresa | no hay tabla de módulos en rrhh (solo flags sueltos: `permite_fichar_sin_ubicacion`, `fichaje_taller_id`) | No existe |

### 1.3 Piezas reutilizables ya en el monorepo
- `packages/module-contabilidad/src/partida/hechos.ts:68-77` `HechoNomina {bruto, ssEmpresa, irpf, ssTrabajador, liquido}` en **céntimos**; `:100` reglas 640/642/4751/476/465; `:216-232` asiento = D640 bruto, D642 ssEmpresa, H4751 irpf, H476 (ssE+ssT), H465 líquido; valida `bruto−irpf−ssTrabajador=liquido`. `plantillas/reglas.ts:9-75` ya admite regla `nomina` por empresa/sector. **Lo que NO hay**: asiento del pago (D465/H572), del pago de SS (D476/H572), del ingreso 111 (D4751/H572), ni IRPF/SS por separado cuando el mes incluye atrasos.
- `packages/module-pagos/src/sepa-xml.ts:5-117` `generarSepaXml` (pain.001) + `validarIban`. Reutilizable tal cual para la remesa de nóminas (concepto "NOMINA" `SALA`/`CategoryPurpose`). [Seguro que existe; no auditado el esquema pain.001.001.03 vs .09]
- `packages/module-rrhh` firma/carpetas, `core-firma` (OTP/eIDAS), `core-storage`, `core-push`, `core-telegram`, `core-ai`. `module-horario/jornada.ts` (horas, turnos, extras).
- `legal-templates` para carta de baja/finiquito. `module-seguros` para pólizas (no hay hoy cruce con nóminas; grep: solo `PersonasPoliza.tsx` en plataforma menciona "nómina").

---------------------------------------------------------------------------
## 2. Flujo completo de nómina en España 2026

Cada paso: qué es, plazo/forma, qué se puede generar y qué exige autorización.

**2.1 Alta de empresa y trabajador en TGSS**
- Empresa: inscripción + CCC (código de cuenta de cotización) y asignación de mutua para AT/EP [Seguro].
- Alta/baja/variación del trabajador (AFI) vía Sistema RED online o fichero (RED directo / SILTRA). El alta debe comunicarse antes o a la vez del primer día de trabajo (hasta 60 días antes) [Probable: blogs comerciales; norma general LGSS art. 139]. Requiere certificado digital y autorización RED (formulario FR101 / online) para el que opera [Seguro: https://asesorexcelente.com/solicitar-autorizacion-sistema-red/ ; https://ayudatpymes.com/gestron/autorizar-a-un-autorizado-red]. La empresa puede autorizar a su gestoría/graduado social [Seguro: https://payfit.com/es/contenido-practico/autorizacion-seguridad-social/].
- Ficheros: AFI/CRA (comunicación afiliación) en XML/Texto de la TGSS; CRA es independiente del antiguo FAN [Probable: https://www.sage.com/es-es/blog/preguntas-frecuentes-sobre-el-sistema-de-liquidacion-directa-ii/]. Las especificaciones oficiales están en seg-social.es (manual SILTRA v3.5 mayo 2025: https://www.seg-social.es/descarga/es/198729 — no accesible desde aquí).

**2.2 Contratos — Contrat@ (SEPE)**
- Comunicación del contrato en los 10 días hábiles siguientes al inicio [Probable; no confirmado en página oficial: búsqueda sin resultado Contrat@]. Vía Contrat@ web o XML con certificado [Probable]. Nominasol/Cegid dice generar ficheros Contrat@ y Certific@2 [Probable: https://hackceleration.com/es/labs/mejor/software-nominas].

**2.3 Cálculo de la nómina**
- Conceptos: salario base, complementos (convenio: antigüedad, nocturnidad, transporte...), pagas extra (2 de 15 días o 30 según convenio) abonadas en fecha o prorrateadas, horas extra, IT, vacaciones, dietas.
- Bases de cotización: contingencias comunes (CC) = remuneración total mensual + prorrata pagas extra, limitada por mínimo del grupo y máximo único 5.101,20 € [Seguro]. Base de AT/EP y desempleo/FOGASA/FP = CC + horas extra del mes. Horas extra: tipo adicional (sobre horas fuerza mayor y resto) [Probable].
- Tipos 2026 trabajador/empresa: CC 4,70/23,60; desempleo indefinido 1,55/5,50, temporal 1,60/6,70; FOGASA —/0,20; FP 0,10/0,60 [Seguro: coinciden con el código]; MEI 0,9 total (0,75 empresa / 0,15 trabajador) [Probable]; AT/EP por CNAE (tarifa DA 4ª Ley 42/2006) [Seguro]; cotización de solidaridad sobre exceso de la base máxima [Seguro].
- Grupos de cotización 1-11 (1-7 mensual, 8-11 diaria) [Seguro].
- IRPF (retención): algoritmo AEAT 2026 "ALGORITMO_2026.pdf" (https://www3.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/ALGORITMO_2026.pdf — no accesible; confirmado que existe). Escala sin cambios estatales [Probable: https://www.billin.net/blog/nuevas-tablas-irpf/]. Entradas: importe anual previsible, reducciones por rendimientos del trabajo, mínimo personal/familiar (modelo 145: hijos, ascendientes, discapacidad), tipo medio, límite cuota-mínimo "retención no obligatoria" (tabla por situación familiar) y **deducción de hasta 590,89 € para rentas ≤ SMI (17.094 €)** decreciente hasta ~20.048 € [Probable: https://www.idealista.com/news/node/885453]. Regularización cuando cambian circunstancias (obligatoria en ene y jul según el programa) [Probable]. Sin modelo 145 se aplica tipo máximo [Probable: https://www.bolsamania.com/declaracion-impuestos-renta/modelo-145-irpf/].
- Embargos de salario: escala del art. 607 LEC sobre múltiplos de SMI (inembargable hasta 1 SMI) [Seguro por LEC; porcentajes no verificados en esta sesión].
- IT (baja): prestación 60 % BR días 4-20, 75 % desde 21; el empresario paga días 4-15, INSS/mutua desde 16, con pago delegado en nómina y compensación en RLC; AT/EP desde día siguiente 75 % [Probable; conocimiento general de la LGSS]. Complemento según convenio.

**2.4 Liquidación de cotizaciones**
- Sistema de Liquidación Directa (SLD): la empresa/autorizado envía el **fichero de bases** (XML) vía SILTRA/RED; la TGSS calcula cuotas y devuelve **RLC** (recibo de liquidación) y **RNT** (relación nominal) [Seguro: https://www.sage.com/es-es/blog/asi-es-siltra-la-nueva-aplicacion-para-enlazar-con-el-sistema-de-comunicacion-directa/ y búsqueda]. SILTRA es una aplicación de escritorio de la TGSS: valida el XML contra XSD y transmite; **no calcula** [Seguro]. Solicitud de borrador → cálculos → confirmación [Seguro]. Plazo: ingreso en el mes siguiente (último día natural del mes siguiente) [Probable]. Esquemas XSD en la carpeta de SILTRA (Fichero de Bases, Solicitud de Borrador, Cálculos, Confirmación, Trabajadores y Tramos) [Seguro].
- Cargo en cuenta o pago por NRC; el pago exige IBAN autorizado (comunicación de datos bancarios) [Probable].
- El FAN es el procedimiento antiguo (cotización con datos completos) [Probable].

**2.5 Pago**: transferencia SEPA (pain.001) mensual; cuando proceda, pago delegado IT. Ya existe `module-pagos` [Seguro].

**2.6 Hacienda**
- Modelo 111: retenciones de trabajo/actividades; trimestral (días 1-20 del mes siguiente; 1-30 enero en el 4T) o mensual para grandes empresas/devolución mensual [Seguro, normativa general].
- Modelo 190: resumen anual; diseño de registro oficial AEAT con registro tipo 1 (declarante) y tipo 2 (perceptor); versión vigente publicada en sede (hay 2024 v5 y cambios para ejercicio 2025 en BOE-A-2025-25389/25390) [Seguro: https://www3.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/archivos_24/DISENOS_LOGICOS_190-2024.pdf]. Plazo habitual 1-31 enero [Probable].
- Certificado de retenciones al trabajador (para su renta) [Seguro].
- Presentación: telemática con certificado del declarante o apoderado/colaborador social. Se puede subir fichero con formato BOE ("importación de fichero") en sede [Seguro].

**2.7 Finiquito y certificado de empresa**
- Finiquito: salario pendiente, vacaciones no disfrutadas, prorrata pagas, indemnización si la hay; no es obligatorio el "recibí" pero es la forma de prueba [Seguro].
- Certificado de empresa: obligatorio electrónico vía Certific@2 de SEPE; incluye causa de baja y bases de los últimos 180 días [Seguro: https://sepe.es/HomeSepe/gl/prestaciones-desempleo/FAQS/remision-electronica-datos-trabajadores-certifica2.html]. Plazo: 10 días hábiles [Suposición/Probable; no confirmado oficial]. Requiere certificado digital o clave SEPE [Seguro].

**2.8 Registro de jornada y convenios**
- Registro horario obligatorio desde RDL 8/2019; el real decreto que imponga sistema digital está en tramitación (urgencia 30-sep-2025, dictamen desfavorable Consejo de Estado marzo 2026, sin publicar a octubre 2026) [Probable: https://www.coverflex.com/es/blog/control-horario y https://www.ecija.com/actualidad-insights/nuevo-proyecto-de-real-decreto-sobre-registro-de-jornada-novedades-en-el-control-horario/]. Conservación 4 años [Seguro por art. 34.9 ET].
- Convenios: REGCON (Registro de Convenios Colectivos); tablas salariales publicadas en BOE/BOP/DOGC por año, formatos heterogéneos (PDF). Sin API estructurada [Seguro: conocimiento general]. SMI 2026 como suelo [Seguro].
- Fecha de efecto: SMI 2026 con efecto 1 de enero (atrasos) y bases 2026 prorrogadas con RDL 3/2026 hasta LPGE [Seguro].

---------------------------------------------------------------------------
## 3. Qué se puede automatizar de verdad

| Entregable | ¿Generable por nosotros? | Quién lo transmite | Notas / riesgo |
|---|---|---|---|
| Cálculo de nómina (devengos, cotización, IRPF) | Sí, con motor propio bien testeado | — | Riesgo alto de error: tablas anuales, IRPF algoritmo (≈60 reglas), convenios. Resultado debe revisarlo persona |
| PDF de nómina (recibo) | Sí (existe). Debe seguir modelo oficial de recibo de salarios (Orden ESS/2098/2014) [Probable] | — | Mejor con campos obligatorios: CCC, categoría, grupo, antigüedad, conceptos, bases |
| Remesa SEPA pain.001 (pago nóminas y pago SS/hacienda) | Sí (existe `generarSepaXml`) | Empresa sube al banco (o PSD2) | Sin certificado propio; solo IBANs válidos |
| Fichero de bases XML (SLD) / AFI-CRA | Sí, es XML con XSD publicados | **Empresa o graduado social con autorización RED** vía SILTRA/RED online | XSD hay que bajarlos de seg-social.es (no accesibles aquí); el formato cambia por versión SILTRA. Un error en base ≠ error pequeño: recargos y reclamación TGSS |
| RLC/RNT | **No se generan: los devuelve la TGSS** | TGSS | Solo podemos leerlos (parsear XML) para conciliar |
| Modelo 111 (fichero de importación) | Sí, formato "diseño de registro" AEAT | Presentador con certificado (empresa, apoderado o colaborador social) | Se puede presentar vía sede subiendo fichero; pago por NRC/domiciliación |
| Modelo 190 + certificados de retenciones | Sí (registro tipo 1 + tipo 2, versión 2025 vigente) | Presentador con certificado | Diseño cambia cada año; el validador de AEAT rechaza si hay clave de percepción/subclave mal |
| Contrat@ (comunicación de contrato) | Sí (XML) pero depende de XSD SEPE | Autorizado SEPE con certificado | 10 días hábiles |
| Certific@2 (certificado de empresa) | Sí (XML/formulario) | Empresa con certificado o clave SEPE | Sin enviarlo el trabajador no cobra paro: responsabilidad de la empresa |
| Alta/baja/variación TGSS (AFI) | Fichero sí, **envío no** | Autorizado RED | La automatización "total" exige que el autorizado RED sea una persona con certificado vinculada a la empresa. No existe API TGSS abierta para terceros sin certificado de empresa |
| Cotización IT/AT | No automático completo | Mutua/INSS vía Delt@ (para AT) | Parte de accidente: Delt@ con certificado |

**Qué exige certificado / autorización (no automatizable por nosotros):** envío a TGSS (alta/baja/liquidación), presentación AEAT (111/190), SEPE (Contrat@, Certific@2), parte de accidente (Delt@). Todo requiere que *el titular del certificado* (empresa, o gestor/graduado social con apoderamiento/RED) lo firme y suba. Nuestra función realista es *preparar* ficheros listos y verificados + un registro de "enviado por X el Y, justificante Z". [Seguro por la arquitectura de los servicios; sin API pública de transmisión sin certificado.]

**Responsabilidad legal:**
- El empresario es siempre responsable de la nómina, de la cotización y de las retenciones (LGSS, LISOS); delegar en un software o gestoría no traslada la sanción. [Seguro]
- Un cálculo erróneo de cotización genera reclamación de deuda con recargo e intereses, y un error de retención deriva en regularización o sanción tributaria. [Seguro]
- Un graduado social colegiado o asesor laboral puede firmar/presentar como autorizado; el *producto software* no. Nuestro papel = preparar, no firmar.
- Recomendación: modo "copiloto" (cálculo + ficheros + aviso de diferencias con la nómina de la gestoría) antes de "motor oficial" y obligar a un revisor humano (rol "gestor laboral") antes de confirmar. Aviso legal y registro de quién aprobó (ya existe `confirmada_at`; añadir `confirmada_por`).

---------------------------------------------------------------------------
## 4. Competencia

| Producto | Mínimo | Completo |
|---|---|---|
| **a3innuva / A3nom** (Wolters Kluwer) | Cálculo nómina + convenios + SILTRA + 111/190 | Estándar de gestorías: Contrat@, Certific@2, Delt@, RED, convenios actualizados por equipo humano, portal del empleado, integración contable A3 |
| **Sage Despachos / Nóminas** | Nómina+ficheros SS+modelos | Sistema para despachos, módulo laboral muy completo, RED directo |
| **Nominasol (Cegid)** | SILTRA, Contrat@, Certific@2, 111, 190 [Probable: hackceleration] | Para gestorías con ecosistema Cegid |
| **Factorial** | Nómina "calculada" + conexión RED + 111/190 + ficheros CRA [Probable: factorial.es blog] desde ~5,5 €/persona/mes | Portal empleado, fichaje, vacaciones; la nómina compleja la hace su equipo de nóminas (externalizado) en planes altos |
| **Holded nóminas** | Autocompletado 111/190, fichero CRA para SILTRA, remesa SEPA [Probable: infoautonomos/holded.com/es/nominas] ~5 €/empleado | Contabilidad integrada; el envío a RED lo hace SILTRA fuera de la plataforma |
| **Sesame / Personio** | Fichaje, vacaciones, ausencias; nómina vía integración con gestoría | Personio: nómina por partner (DATEV etc.) — no calcula España nativo [Suposición] |

**Patrón:** el mínimo del mercado es "calcula + exporta ficheros para SILTRA/AEAT + SEPA"; lo completo añade conexión directa RED/AEAT con certificado, convenios mantenidos por humanos, Contrat@/Certific@2 y portal de gestoría. Nadie serio vende "nómina sin revisión humana".

---------------------------------------------------------------------------
## 5. Propuesta de encaje

### 5.1 ¿Dentro de rrhh o módulo aparte?
**Recomendación: motor y formatos en `packages/*` (varios paquetes), la UI de nóminas sigue en `apps/rrhh`, activada por empresa.** No crear app nueva todavía: rrhh ya tiene empleados, contratos, fichajes, documentos, firma, portal del empleado y es multi-tenant; las nóminas son una "capacidad" de rrhh. Una app aparte duplicaría empleados y contratos. Si más adelante hay un cliente "gestoría" (multi-empresa), se añade una vista en `plataforma` o un rol `gestor` en rrhh, no una app.

Para respetar la regla "lógica en packages, apps solo enchufan":
- `@central/module-nominas` — motor de cálculo puro (céntimos enteros, tablas versionadas por año/periodo, perfiles de incidencia). Se actualiza y se **parte**:
  - `nominas/calculo` (devengos, cotización, MEI, solidaridad, IT, parcial, extras).
  - `nominas/irpf` (algoritmo AEAT por año, modelo 145 como tipo `SituacionFamiliar`).
  - `nominas/tablas/2026.ts` (bases, tipos, SMI, AT/EP) con test de contraste contra cifras oficiales y fecha de vigencia; falla si el año del periodo no tiene tabla (nunca usar tabla de otro año en silencio).
  - `nominas/convenio` (tipo `TablaSalarial`, `PlusConvenio`; agnóstico: cada convenio = datos, no código).
- `@central/module-nominas-ficheros` (nuevo) — serializadores puros, sin red: `fichero-bases` (SLD XML), `afi`/`cra`, `modelo111`, `modelo190` (registros 1/2, posiciones fijas), `certificado-retenciones`, `contrata`, `certifica2`. Cada uno con XSD/diseño de registro vendorizado en `fixtures/` y validador.
- `@central/module-pagos` (existente) — remesa de nóminas y pago de SS/Hacienda (ampliar a `SALA`/`TAXS`).
- `@central/module-contabilidad` (existente) — añadir conversores `nominaAHecho(desglose)` y `asientoPagoNomina`, `asientoLiquidacionSS`, `asientoIngreso111`.
- Puerto en la app: `apps/rrhh/lib/nominas/*` solo lee BD, llama paquetes y escribe.
- **Activación por empresa:** nueva tabla `rrhh.empresa_modulos(empresa_id, modulo, activo, activado_at, activado_por, config jsonb)` con `modulo ∈ {nominas, ficheros_ss, ficheros_aeat, contabilidad_nominas, pagos_nominas}`; helper `moduloActivo(empresaId, 'nominas')` en `lib/modulos.ts` usado por rutas, cron y menú (patrón ya existente en ia-rest `useModulo`/`modulos_activos`). **Defecto: apagado**. El cron recorre solo empresas con `nominas` activo (hoy recorre todas — cambio de comportamiento a documentar y a proteger con guardián). Alta de módulo desde el operador (`/api/operador/empresas/modulos`, mismo secreto `RRHH_OPERADOR_SECRET`) y desde plataforma god-panel.
- **Agnóstico de sector:** nada de hostelería/limpieza en el motor; AT/EP por CNAE (dato), convenio como datos, plantillas de asiento por sector ya existen en contabilidad (`plantillas/reglas.ts`).
- **Dos modos por empresa** (`config.modo`): `"reparto"` (hoy: la gestoría calcula, rrhh reparte PDFs, `distribuir-nominas.ts`) y `"calculo"` (rrhh calcula y la gestoría solo revisa/transmite). Permite adopción gradual.

### 5.2 Fases con criterio de "hecho" y guardianes

**N0 — Cimientos y exactitud (1-2 semanas).**
- Actualizar `tablas-2026` a valores 2026 (bases, MEI, solidaridad, SMI), pasar a céntimos, tablas versionadas por año; ampliar tests con casos de gestoría reales (≥15 nóminas de referencia anonimizadas, incl. mínimo/máximo, parcial, temporal, horas extra, IT).
- Tabla `empresa_modulos` + helper + interruptor en cron y menú. Migración 0031/0032 aditiva, idempotente.
- Hecho cuando: guardián `regression-nominas-tablas` (valores 2026 contra constantes citadas con fuente; falla si SMI/base máxima/mínimos/MEI cambian sin actualizar), guardián `regression-nominas-modulo` (toda ruta `/api/admin/nominas/*` y el cron llaman a `moduloActivo`; rojo si se quita), y 15 casos de referencia verdes. Verlos fallar rompiendo cada tabla.

**N1 — Nómina completa mensual (3-4 semanas).**
- IRPF con algoritmo AEAT 2026 y modelo 145 (tabla `situacion_familiar` firmada con `core-firma`, histórico por vigencia); pagas extra (prorrata o mensualidades), IT con pago delegado, parcial real, bases AT/EP vs CC, embargos, atrasos; convenio como tablas salariales (categoría→salario/pluses) con importación asistida por el agente de convenios (propone, humano valida).
- Hecho cuando: ≥30 casos contrastados con una gestoría o con el simulador AEAT (retención) con tolerancia 0 céntimos en cotización y ±0,01 € en IRPF; PDF de recibo con modelo oficial; panel muestra diferencia vs nómina de la gestoría.
- Guardianes: `regression-irpf-aeat` (casos oficiales por tramo, mínimo SMI, 145 ausente → tipo máximo), `regression-nominas-sin-float` (prohíbe `*100` sobre euros float y obliga céntimos), test de propiedad: neto = devengos − deducciones y suma por conceptos = total.

**N2 — Fichajes → horas extra e incidencias (1-2 semanas).**
- Función pura `incidenciasDesdeFichajes(fichajes, contrato, convenio)` en `module-horario`/`module-nominas`; propone horas extra (diurnas, nocturnas, festivas, compensadas por descanso), ausencias y retrasos; el responsable aprueba (nada entra solo en la nómina).
- Hecho cuando: el panel de nómina precarga extras del mes con enlace a los fichajes de origen; tope anual 80 h (art. 35 ET) avisado; guardián `regression-fichajes-nomina` (solo fichajes aprobados, mismo `empresa_id`, mes cerrado).

**N3 — Contabilidad y pagos (2 semanas).**
- Al confirmar la nómina del mes: `nominaAHecho` → `HechoNomina` (bruto, SS empresa, IRPF, SS trabajador, líquido, con `dimensiones` por empleado/centro de coste); asientos de pago (D465/H572), liquidación SS (D476/H572) y 111 (D4751/H572); remesa SEPA con `module-pagos`.
- Hecho cuando: guardián `regression-nomina-asiento` (suma de asientos del mes = devengos+SS; 640+642 = coste empresa del desglose; 465 cierra a 0 tras pago; descuadre → error), idempotente por `ref`=`nomina:<id>`, no duplica al reconfirmar. Activación separada (`contabilidad_nominas`).
- Riesgo: la nómina vive en euros float y la contabilidad en céntimos: el conversor debe redondear una sola vez y repartir el céntimo.

**N4 — Ficheros oficiales preparados (4-6 semanas, sin envío).**
- `fichero-bases` SLD, AFI/CRA, 111, 190, certificado de retenciones, Contrat@ y Certific@2 como descargas; validación contra XSD/diseños oficiales vendorizados; bandeja "pendiente de enviar / enviado (justificante)" con quién y cuándo. Registro del autorizado RED/AEAT por empresa (solo metadatos, nunca certificados).
- Hecho cuando: cada fichero pasa el validador oficial (SILTRA para bases, "validación de fichero" de la sede para 111/190) en una prueba manual documentada con una empresa piloto; guardianes por formato (golden files en `fixtures/` con XSD; cambio de formato = test rojo), y `regression-ficheros-sin-secretos` (nunca se guarda ni loguea un certificado/clave).
- **No se automatiza el envío.** Dependencia externa: descargar XSD/diseños (seg-social.es, sede AEAT) — hay que permitir esos hosts o subir los PDFs/XSD al repo.

**N5 — Finiquitos, altas/bajas y portal de gestoría (3-4 semanas).**
- Finiquito automático (vacaciones devengadas, prorrata, indemnización calculada) con carta firmada (`core-firma`) y borrador de Certific@2; flujo de alta/baja con checklist (AFI, Contrat@, 145, contrato firmado); rol `gestor` multi-empresa con aprobación y exportación A3/Sage/CSV.
- Hecho cuando: una baja produce finiquito + carta + fichero Certific@2 + asiento, revisados por gestor; guardián de roles (gestor ve solo empresas asignadas).
- Opcional N6: conectores directos con certificado de gestoría (solo si hay un graduado social socio y bajo su firma).

### 5.3 Integraciones
- **Contabilidad:** ver N3. Mapeo: 640 sueldos (bruto), 642 SS empresa (cuota patronal total), 4751 IRPF practicado, 476 SS acreedora (empresa+trabajador), 465 remuneraciones pendientes de pago (líquido). Falta distinguir cuenta 641 (indemnizaciones, finiquitos) y 649 (otros gastos sociales); se añaden reglas.
- **Fichajes:** ver N2. Los fichajes ya registran `empleado_id`/`empresa_id`; la regla de oro es "sugiere, no entra sola".
- **Seguros (correduría):** (a) *accidentes de convenio* y *seguro colectivo de vida* son obligación del convenio: el campo `convenio_datos` puede llevar `seguro_obligatorio: {tipo, capital}` y rrhh crea tarea/alerta si la empresa no tiene la póliza; la póliza vive en `module-seguros` (cartera), no en rrhh; (b) la cuota de seguro de vida/accidentes pagada por la empresa es retribución en especie → entra en la nómina (valor en especie, ingreso a cuenta) — hay que tratarlo en el motor; (c) cross-sell: lista de empleados + capital asegurable sale de `contratos_laborales` hacia un presupuesto en `/correduria` (solo con OK de Alberto, regla de comunicaciones salientes). No hay hoy ningún cruce; es oportunidad comercial para Grupo ASegura.
- **Plataforma:** coste laboral real al P&L consolidado (ya en ROADMAP l.~62) sale gratis de N3.
- **Pagos:** remesa SEPA reutiliza `generarSepaXml`; verificación de IBAN con `validarIban`.

### 5.4 Riesgos
1. **Exactitud legal** (el mayor): tablas anuales, IRPF, convenios, IT. Mitigación: casos de referencia + modo copiloto + revisión humana + aviso legal + tablas fechadas que fallan si el año no coincide.
2. **Hoy el motor ya calcula con tablas de 2025** y el cron lo ejecuta para todas las empresas. Si alguna empresa usa las nóminas calculadas, hay que avisar ya. N0 lo corrige y activa el interruptor.
3. **Datos sensibles** (DNI, NSS, IBAN, salarios, situación familiar, discapacidad = categoría especial RGPD art. 9): cifrado en reposo/columna, acceso mínimo, registro de lecturas, no enviar a la IA (hoy `identificarEmpleado` manda texto de nóminas a la IA: revisar contrato con el proveedor y minimizar). Rol `rrhh_app` con BYPASSRLS: el aislamiento por empresa es solo de código → guardianes multi-tenant obligatorios (ya hay `regression-lote2-rrhh-empresa`).
4. **Dependencia de formatos** que cambian cada año (190, SILTRA) y de hosts bloqueados desde esta sesión.
5. **Responsabilidad / seguro:** poner en términos que el software prepara y el cliente/gestor firma; valorar RC profesional (Grupo ASegura puede colocar su propia póliza).
6. **Alcance**: las verticales con gestoría externa (ialimp, sivra) quizá prefieran seguir en modo `reparto`; no forzar migración.
7. **Coste de mantenimiento anual** (tablas, algoritmo IRPF, convenios): reservar sesión de enero + `auditoria-diaria` con comprobación de vigencia; los agentes pueden proponer, no aplicar.
8. Migraciones de rrhh "no aplicadas desde el código": comprobar con MCP Supabase el estado real de 0016/0017 antes de N0.

### 5.5 Lo que NO se puede automatizar (resumen)
- Envío a TGSS (alta/baja/liquidación), AEAT (111/190), SEPE (Contrat@/Certific@2) y Delt@ **sin certificado digital y autorización del titular o de su graduado social**.
- Generar RLC/RNT (los devuelve la TGSS) y los importes definitivos de cuota (los fija la TGSS tras el borrador).
- Interpretación de convenios colectivos sin revisión humana (PDFs heterogéneos; el agente propone).
- Responsabilidad legal: no se delega; software prepara, persona autorizada firma.

---------------------------------------------------------------------------
## Fuentes (todas secundarias; las primarias no accesibles desde el contenedor)
- Bases 2026 / Orden PJC/297/2026: https://www.grupo2000.es/category/bases-y-tipos-de-cotizacion-2026/ · https://www.laboral-social.com/node/30379 · https://www.iberley.es/noticias/boletin-noticias-red-5-2026-aclaraciones-orden-cotizacion-2026-36292 · https://www.garrigues.com/es_ES/noticia/publica-orden-cotizacion-espana-2026
- SMI 2026 (RD 126/2026): https://www.cuestioneslaborales.es/cuantia-smi-2026-diario-mensual-y-anual/ · https://taxdown.es/blog/smi-salario-minimo-interprofesional
- IRPF/SMI deducción: https://www.idealista.com/news/node/885453 · https://guiafiscal.es/calculadoras/retencion-irpf-nomina/ · algoritmo AEAT (no accesible): https://www3.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/ALGORITMO_2026.pdf
- SILTRA / SLD: https://www.sage.com/es-es/blog/asi-es-siltra-la-nueva-aplicacion-para-enlazar-con-el-sistema-de-comunicacion-directa/ · https://www.sage.com/es-es/blog/preguntas-frecuentes-sobre-el-sistema-de-liquidacion-directa-ii/ · https://www.seg-social.es/descarga/es/198729
- RED: https://asesorexcelente.com/solicitar-autorizacion-sistema-red/ · https://payfit.com/es/contenido-practico/autorizacion-seguridad-social/
- Modelo 190: https://www3.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_100_199/archivos_24/DISENOS_LOGICOS_190-2024.pdf
- Certific@2: https://sepe.es/HomeSepe/gl/prestaciones-desempleo/FAQS/remision-electronica-datos-trabajadores-certifica2.html
- Registro horario: https://www.coverflex.com/es/blog/control-horario · https://www.ecija.com/actualidad-insights/nuevo-proyecto-de-real-decreto-sobre-registro-de-jornada-novedades-en-el-control-horario/
- Competencia: https://hackceleration.com/es/labs/mejor/software-nominas · https://www.infoautonomos.com/blog/mejores-programas-nominas/ · https://www.holded.com/es/nominas · https://factorial.es/blog/mejores-programas-nominas/
