# 💼 Coordinador patrimonial (patrimonio-cfo) — estado entre pasadas

> Estado del agente programado `patrimonio-cfo` (mensual, día 2). Cada pasada actualiza este
> archivo: foto patrimonial, recomendaciones vivas e intake pendiente. Skill:
> `.claude/skills/patrimonio-cfo/SKILL.md`. Diseño:
> `docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md`.

**Última pasada:** **24/08/2026 — DOSSIER INICIAL** (fuera de ciclo, a petición expresa de
Alberto; ejecutada desde la sesión del canal conversacional, PR #1648). Informe Telegram
enviado (messageId 3554). ⚠️ El termómetro del radar seguía SIN MEDIR (el `radar-espana`
corre su primera pasada el 01/09): no se abrió ningún escenario disparado por ciclo, y las
valoraciones usadas son el AVM de BBVA del 23/08 (pantallazo), no tasaciones.
**Próxima pasada ordinaria: 02/09/2026** (con el termómetro del 01/09 delante).

## 💬 Canal conversacional por Telegram (24/08/2026)
Alberto puede hablar con el agente patrimonial desde el móvil, sin esperar a la pasada mensual:
- **`/patrimonio`** (o «foto»/«resumen») → foto determinista de BD: neto mínimo, activos con su
  valoración vigente (lo sin valorar se DECLARA, nunca sale como 0), recomendaciones pendientes.
- **`/patrimonio <pregunta>`** o cualquier mensaje que mencione «patrimonio/patrimonial» → la IA
  (pasarela gratis) responde SOLO con las cifras del contexto de BD (`lib/patrimonio-telegram.ts`
  + `lib/patrimonio-chat.ts`, puro y testeado). Si la BD o la IA fallan, lo dice — no inventa.
- **Botones en las recomendaciones** (`ptr_ok`/`ptr_no`/`ptr_det` en el webhook): el informe
  mensual manda cada recomendación con «✅ Acepto / ✖️ Descarto / 📋 Detalle» y el toque registra
  `decision_alberto`/`decidido_at` en `patrimonio_recomendaciones` — cierra el ciclo de
  aprendizaje sin anotar nada a mano. Los botones viajan por `/api/internal/alerta` (prefijo
  `ptr_` permitido en `lib/alerta-botones.ts`; solo anotan decisión, jamás ejecutan).

## Calibración vigente (Alberto, 22/08/2026)
Objetivo **mixto** (rentas hoy + crecimiento largo plazo) · riesgo **dinámico** (puede proponer
apalancamiento/rotación con el peor caso cuantificado; salvaguarda: Socorro = base de
subsistencia familiar, siempre marcada) · **nunca ejecuta ni comunica a terceros**.

## 📸 Foto patrimonial (24/08/2026 — primera foto)

**Neto mínimo conocido: 1.777.111,91€** (es un MÍNIMO: valoraciones AVM no contrastadas con
tasación y dos cuentas sin saldo conocido; el capital de la hipoteca y la cuenta BBVA personal
ya están confirmados).
- 🏠 Inmuebles **1.890.000€** — AVM BBVA 23/08: Socorro 832.000€ · Dúplex 294.000€ · Monte
  Carmelo 764.000€. (Las de Alberto y las `agente:m2zona` del 23/08 quedan al lado en
  `patrimonio_valoraciones`; la vigente por activo es la más fresca.)
- 💧 Liquidez **51.068,02€** — BBVA 19.940,62€ + Kutxabank 10.693,78€ (a 24/08) + **BBVA
  personal ****2620 con 20.433,62€** (saldo a 27/06 — Alberto confirmó el 24/08/2026 que es
  suya y cuenta; `oculta=false` en `cuentas_bancarias`, saldo pendiente de refrescar).
  Declaradas y NO sumadas: N26 y Kutxa-Pilar sin saldo conocido.
- 📈 IBKR **31.666,48€** (23/08) — sin alerta Modelo 720 (umbral de aviso 45.000€).
- 🏦 Hipoteca Monte Carmelo **−195.622,59€ — CONFIRMADO por Alberto (24/08/2026**, pantalla
  «Información del préstamo» de la app del banco; corrige el 195.324€ que dictó primero de memoria).

**Yield neto 12m** (incomes − gastos del piso − ¼ de los compartidos `prop_multi_apartamentos`;
aproximación declarada — no incluye lo que solo está en banca):
| Activo | P&L 12m | Yield s/ vigente | Lectura |
|---|---|---|---|
| Socorro/House | ~66.195€ | **~8,0%** | Muy por encima de letras (2,663%) e indexado (~7% hist.). Mantener — base de subsistencia. |
| Dúplex | ~18.056€ | **~6,1%** | Venta a 320k → 271-286k netos; equivalencia solo con riesgo bolsa. Ventana pendiente del termómetro. |
| Bustos (subarr.) | ~24.437€ | n/a | Negocio sin capital propio. Mantener mientras dure el subarriendo. |

*Foto anterior: no hay (primera pasada). La comparación de evolución empieza el 02/09.*

La foto viva se ve en `/patrimonio` (plataforma); la base está sembrada
(22/08/2026, revisada 23/08/2026): **3 activos en propiedad** — Socorro 50/50 (275 m², RC
`5732032TG3453B0001PK`), Dúplex 100% de Alberto, y Monte Carmelo vivienda habitual (205 m²,
RC `4707007TG3440N0003TR`; **comprado el 29/03/2021 por 270.000€, 50/50 Alberto+Pilar por
mitades indivisas con carácter privativo — de la escritura de compraventa, 23/08/2026**;
hipoteca de cuota conocida y capital sin dato). Los 2 Bustos
(subarrendados, no propiedad) pasaron a `estado='baja'` el 23/08/2026 por orden de Alberto:
fuera del patrimonio, su negocio sigue en SIVRA. Valoraciones `agente:m2zona` (enfoque
vivienda) en `patrimonio_valoraciones` junto a las de Alberto — ver `docs/RADAR-ESPANA.md`.

## 🧭 Recomendaciones vivas (registradas 24/08/2026, pendientes de decisión)

- **#1 Hipoteca: recuperar la bonificación perdida (~0,20 pts ≈ 390€/año) y NO amortizar hoy**
  — amortizar rinde el 1,31% aplicado vs ~2,16% neto de letras 12m (2,663% bruto, última
  subasta ago-2026). Primera palanca: la gestora de CajaSur — **Alberto la contactó por la
  intranet de Kutxabank el 24/08/2026, pendiente de respuesta**.
- **#2 Liquidez ociosa → monetario/letras** — 30.634€ a la vista al 0%; ~266€/año brutos por
  cada 10.000€. Pendiente que Alberto defina el colchón.
- **#3 Dúplex: plan de venta abierto SIN fijar ventana** — el «cuándo» lo decide el termómetro
  del radar (1ª pasada 01/09). Números de equivalencia en `datos` de la recomendación.

## 🏦 Hipoteca de Monte Carmelo — condiciones cargadas (22/08/2026, de la escritura)

Alberto subió la escritura (CAJASUR nº 856289293-5, abr-2021) y la ficha `act_monte_carmelo`
de `patrimonio_activos` quedó completada: capital inicial 230.501,03€ · 30 años (vence
05/04/2051) · tipo FIJO 2,10% nominal **bonificable** (aplicado real ~1,11% hasta abr-2026 y
~1,31% desde entonces — perdió ~0,20 pts de bonificación, revisar qué producto dejó de
cumplir) · cuota 772,86€ · capital pendiente **195.622,59€ (CONFIRMADO por Alberto 24/08/2026**, pantalla de la
app del banco; la estimación por sistema francés —195.324€— se quedó a 298,59€, un 0,15%. La app
referencia el recibo como `917255085-5`, distinto del nº de escritura `856289293-5` que vigila el
agente contable en los `CUOTA PTMO` de la banca) · amortización anticipada con comisión efectiva ≈0€ mientras los tipos
de mercado superen el suyo. **Consigna de Alberto: el CFO evalúa en cada pasada si merece la
pena amortizar** — contra la alternativa neta, y mirando primero las bonificaciones perdidas
(recuperar 0,10-0,50 pts suele rendir más que amortizar). Detalle en la skill, Paso 4.

**Vigilancia continua (23/08/2026):** el agente contable proactivo (cron lunes 09:00) vigila
los recibos `CUOTA PTMO 856289293-5` de la banca — si la cuota cambia entre recibos, o la
ficha `act_monte_carmelo` se desincroniza de lo que el banco cobra, avisa por Telegram
(`apps/plataforma/lib/contable/hipoteca-vigia.ts`, helper puro con tests). Este agente
analiza en mensual lo que aquel detecta en semanal. La consulta a la gestora (María Luz,
CajaSur) por la bonificación perdida **la envió Alberto por la intranet de Kutxabank el
24/08/2026** (el borrador de Gmail quedó sin usar) — pendiente de respuesta. El capital
exacto ya no hace falta pedirlo: confirmado con la app del banco.

## ❓ Intake pendiente (espejo de /patrimonio)

**Preguntado en el dossier inicial (24/08/2026, Telegram):** (1) ~~valor/año de compra reales de
Socorro~~ — **✅ CERRADO 24/08/2026**: Alberto subió la escritura (copia simple, folios 1-2) y el
**contrato privado de compraventa** firmado por las cuatro partes. **Precio: 346.000€** (contrato
02/09/2015: 20.000€ de señal en efectivo + 326.000€ por cheque bancario a la firma) · **escritura
25/09/2015**, nº 2945 del notario Luis Barriga Fernández (Mairena del Aljarafe) · compradores
Alberto+Pilar SOLTEROS (mitades indivisas), vendedores Segovia/Riaño · finca 1134 de Sevilla,
IDUFIR 41029000008417, sin cargas; la casa es el «36 antiguo / 9 moderno / 26 novísimo, hoy 24»,
suelo 115,36 m². Sembrado en `act_house_sevillana` (el 360.000€ orientativo queda corregido).
Los gastos de adquisición de Socorro (ITP/notaría/registro) NO constan en estos documentos —
mismo hueco que en Monte Carmelo, no bloquea nada hoy;
(2) ~~capital pendiente exacto de la hipoteca~~ (✅ cerrado 24/08/2026 — Alberto confirmó
**195.622,59€** con la pantalla del banco, tras corregir el 195.324€ dictado primero); (3) ~~¿enviado el email a la
gestora de CajaSur por la bonificación?~~ (✅ cerrado 24/08/2026 — enviado por la **intranet de
Kutxabank**, pendiente de respuesta); (4) ~~¿la cuenta BBVA oculta con 20.433,62€ (27/06)
sigue viva y se cuenta?~~ (✅ cerrado 24/08/2026 — «es mía, personal»: destapada y sumada, ver foto);
(5) gastos de adquisición de Monte Carmelo (ITP/notaría/registro) — **fuente LOCALIZADA en el
Gmail de Alberto**: la «Liquidación de Costes» definitiva de la compraventa está en el adjunto
`PF ALBERTO SUAREZ.PDF` del email de María Luz (CajaSur) del **16/09/2021**, hilo
«856289293-5 SUAREZ GUTIERREZ, ALBERTO Exp. nº: 210297423» (hubo un faltante de 120,49€ sobre
la provisión). El conector de Gmail no descarga adjuntos: falta abrir ese PDF y pasar las
cifras a `patrimonio_activos` (o que Alberto las dicte).

Primer cuestionario previsto para el dossier inicial: ~~m² y ref. catastral de Socorro y
Monte Carmelo~~ (cerrado 23/08/2026 — Alberto dio las refs y el Catastro dio m²/año);
~~valor/año de compra de Socorro~~ (CERRADO 24/08/2026 — 346.000€ el 25/09/2015, contrato
privado + escritura); ~~valor/año de compra y
titularidad de Monte Carmelo~~ (cerrado 23/08/2026 — escritura de compraventa: 270.000€ el
29/03/2021, 50/50 Alberto+Pilar privativo, finca 7523 Registro Sevilla nº2, superficie
registral 172,50 m²; los gastos de adquisición —ITP/notaría/registro— NO constan y siguen
pendientes); ~~números de licencia VUT de los pisos en propiedad~~ (cerrado 23/08/2026 —
resoluciones del RTA: Socorro **VFT/SE/01179** (titular Pilar, 08/11/2016; capacidad
**ampliada a 6 hab/12 plazas** por modificación de bases del 30/05/2025 — declaración
responsable de Pilar 14/05/2025; ⚠️ errata en el RESUELVO de esa resolución, que repite la
capacidad antigua 2/5: comprobar el RTA y pedir corrección de errores si procede) y Dúplex
**VFT/SE/01932** (titular Alberto, 20/04/2017,
2 hab/4 plazas); Monte Carmelo sin VUT (vivienda habitual, `licencia_vut=false`)); y
~~confirmar el capital pendiente exacto de la hipoteca~~ (cerrado 24/08/2026: 195.622,59€ de la app del banco).

## Escenarios en cartera (contexto para próximas pasadas)

- **Venta del Dúplex** — estudio fiscal completo en `docs/FISCAL-venta-duplex-villasis.md`
  (venta 320k → neto 271-286k) y plan de precio/reforma en
  `docs/DUPLEX-plan-precio-reforma-venta.md`. La rutina mensual «revisión plan dúplex» (día 1)
  sigue viva; cuando este agente esté rodado, se estudiará absorberla para no duplicar.
- **Jugada de referencia de Alberto**: vender cerca del tope → aparcar en fondo → recomprar
  en la bajada (1-2 años). Necesita el termómetro del radar y el corpus de subastas.
