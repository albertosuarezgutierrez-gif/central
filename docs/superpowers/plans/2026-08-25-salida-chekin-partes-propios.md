# Salida de Chekin — partes de viajeros propios · plan por fases

> **Qué es esto:** un plan de PROYECTO (fases, fechas, decisiones y bloqueantes), no un plan
> TDD ejecutable tarea a tarea. El plan TDD del código se escribe cuando cierren los cuatro
> bloqueantes de §2 — hoy hay decisiones abiertas que cambiarían el alcance.
> Diseño técnico completo: `docs/superpowers/specs/2026-08-20-ses-hospedajes-conectividad-design.md`.

**Objetivo:** que los partes de viajeros de los cuatro pisos los emita nuestro sistema y dar de
baja Chekin **antes del 07/03/2027**, sin un solo día con dos emisores ni un solo parte sin enviar.

**Fecha límite y por qué:** la factura de Smoobu + Chekin (1.018,05€, nº 547429, 7 unidades) se
cargó el **07/03/2026**; la renovación cae sobre esa misma fecha en 2027. Todo el calendario está
contado hacia atrás desde ahí, con tres semanas de colchón.

---

## 1. Estado real, verificado el 25/08/2026

### Lo que SÍ está hecho — el transporte

| Pieza | Dónde | Estado |
|---|---|---|
| ZIP + Base64 (formato que exige SES) | `packages/module-ses/src/zip.ts` (95 líneas) | ✅ y **aceptado por producción** |
| Envoltura SOAP | `packages/module-ses/src/soap.ts` (79) | ✅ |
| Envío con TLS FNMT y Basic | `packages/module-ses/src/enviar.ts` (65) | ✅ |
| Parseo de respuesta, `datos` vs `transporte` | `packages/module-ses/src/respuesta.ts` (150) | ✅ |
| Credenciales cifradas AES-256-GCM por piso | `apps/plataforma/lib/ses/cifrado.ts` + `establecimientos.ts` | ✅ con test |
| Tabla `ses_establecimientos` + REVOKE | `prisma/sql/2026-08-20_ses_establecimientos.sql` | ✅ aplicada |
| Pantalla de alta + «probar conexión» | `/sivra/partes/establecimientos` | ✅ |
| Latido diario 07:15 | `/api/cron/ses-latido` vía `lib/cron-dispatch.ts` | ✅ |

Probado contra el servicio **real** de producción el 20/08/2026: TLS válido, credenciales del
servicio web de Busto Reform aceptadas, `codigoArrendador` con servicio web habilitado, formato
ZIP+Base64 aceptado (ningún `10111`), operación `C` → `codigo 0 / Ok`.

### Lo que NO está hecho — el producto entero

Sabemos **enviar** un parte. No sabemos todavía **construirlo** ni **recoger los datos**.

- **En `packages/module-ses` faltan cinco ficheros del diseño:** `tipos.ts` (enums oficiales),
  `municipios.ts` (INE), `validar.ts` (las reglas de validación de SES, helper puro), `xml.ts`
  (construir el parte) y `xsd.ts` (validarlo contra el esquema del Ministerio).
- **En BD faltan tres de las cuatro tablas:** `ses_checkins`, `ses_viajeros`, `ses_envios`.
- **Falta todo lo que ve una persona:** formulario público `/checkin/<token>`, OCR del documento,
  idiomas ES/EN/IT, firma del art. 4.2, pantalla interna `/sivra/partes`, y los tres crons
  (`ses-preparar`, `ses-enviar`, `ses-vigia`).
- **Falta el registro documental de tres años** y su purga (art. 5.1 y 5.3 del RD 933/2021).
- **`packages/module-ses` no tiene ni un test** (0 ficheros `.test.ts`). El diseño §5 lista los
  que hacen falta; el ZIP y el parseo de respuestas son justo donde un fallo silencioso cuesta caro.

### Y un dato operativo que hay que decir en voz alta

**`ses_establecimientos` está VACÍA: cero filas.** No hay ni un piso dado de alta y
`SES_CRYPTO_KEY` sigue pendiente en Vercel. Por diseño, cero establecimientos deja el latido en
**rojo** — está rojo con razón, no es un fallo. Nada nuestro envía nada hoy, y eso es correcto:
el emisor real es Chekin.

**Resumen honesto:** está hecho el 20% difícil de descubrir (el protocolo, con sus trampas) y
falta el 80% de trabajo (el producto). Con seis meses por delante sobra tiempo; sin ellos no
habría llegado.

---

## 2. Los cuatro bloqueantes — van ANTES del código

Ninguno es programación y los cuatro pueden cambiar el alcance. Septiembre es para esto.

### 2.1 🚨 ¿Hay hoy DOS emisores? (riesgo actual, anterior a este proyecto)

En Smoobu está activado «enviar datos de invitados automáticamente» hacia SES.HOSPEDAJES
(visible en la configuración de Busto Reform) **y** Chekin envía. Los dos escenarios son malos:
o llegan partes duplicados, o cada uno supone que envía el otro y los de Smoobu se rechazan en
silencio — y un rechazo que nadie lee **es** no comunicar, que es infracción grave (601 a 30.000€,
art. 39.1 LO 4/2015), mientras que comunicar tarde es leve (100 a 600€).

**Acción (Alberto, portal SES):** mirar el histórico de comunicaciones recibidas de cada piso.
Cuántas por estancia y de quién. Hasta saberlo, «Busto Reform está bien» es una suposición.
Si hay duplicados, apagar el envío automático de Smoobu es urgente y no espera a este proyecto.

### 2.2 Auditar qué hace Chekin exactamente

No se puede mirar desde el contenedor de desarrollo (`guest.chekin.com` está bloqueado por el
proxy de salida), así que **lo tiene que mirar Alberto en la cuenta real**. Cada casilla sin
marcar es una función que hoy tienes y que perderías el día del corte:

- [ ] Campos exactos que pide su formulario.
- [ ] Si hace OCR del documento y con qué calidad.
- [ ] Si recoge firma y desde qué edad.
- [ ] Idiomas del formulario.
- [ ] Qué manda a SES y qué se guarda él.
- [ ] Si hace algo más: tasa turística, contrato de hospedaje, códigos de acceso, upsells.
- [ ] Cuándo avisa al huésped y con qué recordatorios.
- [ ] Qué pasa cuando el huésped no rellena.

### 2.3 Consulta a la asesoría: ¿vale la firma digital?

El art. 4.2 exige firma de todo mayor de 14 años «conforme al sistema y modelo que se establezca»,
y el RD **no menciona** la firma electrónica ni para bien ni para mal. El diseño sigue adelante
con firma digital porque es la única opción operativa en un piso sin recepción, pero **está
marcado como supuesto sin verificar**. Borrador ya escrito:
`docs/borradores/2026-08-20-consulta-asesoria-ses-rd933.md`.
🚨 **No se envía sin que Alberto lo autorice expresamente** (regla permanente del monorepo).

### 2.4 Cuánto cuesta Chekin de verdad

La factura es **una sola línea**: «Smoobu GmbH — Professional Yearly Plan + Chekin.com Integration
(7 unidades, 1 año)», 1.018,05€ (base 841,36€ + IVA 176,69€). **No sabemos qué parte es Chekin.**
Sin ese número no se puede decir cuánto ahorra este proyecto.

Y de paso, una pregunta que vale dinero hoy: **pagamos 7 unidades y tenemos 4 pisos.** A ~145€ por
unidad y año, tres unidades de más son ~436€/año. Comprobar en la cuenta de Smoobu qué son esas
7 unidades antes de renovar nada. (Ver el plan hermano, `2026-08-25-booking-directo-y-smoobu.md`.)

---

## 3. Piso piloto recomendado: **Busto Reform**

| Piso | Aforo | Reservas futuras | Credenciales SES | Veredicto |
|---|---|---|---|---|
| **Busto Reform** | **2** | 7 | ✅ **probadas contra producción** | **piloto** |
| Duplex Center | 4 | 4 | sin probar | 2º |
| Luxury Busto | 5 | 14 | sin probar | 3º |
| House Sevillana | **12** | 13 | sin probar | **el último** |

El dúplex tiene menos reservas futuras (4 frente a 7), pero Busto Reform gana por dos razones que
pesan más: **es el único piso cuyas credenciales del servicio web ya están validadas contra el
servicio real** (el 20/08 respondió `codigo 0 / Ok`), y con aforo 2 un parte lleva **como mucho
dos viajeros**. House Sevillana va el último por lo contrario: 12 personas es el parte más largo,
más caro de rellenar para el huésped y con más superficie de error — el peor sitio posible para
estrenar, y además es el piso que más factura.

---

## 4. Calendario, contado hacia atrás desde el 07/03/2027

| Mes | Qué pasa | Chekin | Huésped |
|---|---|---|---|
| **Sep 2026** | Los cuatro bloqueantes de §2. Alta de los 4 establecimientos en `ses_establecimientos` + `SES_CRYPTO_KEY` en Vercel + «probar conexión» en los cuatro. **Cero código.** | envía | no se entera |
| **Oct 2026** | Núcleo del parte: `tipos.ts`, `validar.ts`, `xml.ts`, `xsd.ts`, `municipios.ts` + las tres tablas + los tests de §5 del diseño. | envía | no se entera |
| **Nov 2026** | Formulario `/checkin/<token>`, OCR, ES/EN/IT, firma, los tres crons, pantalla `/sivra/partes`, registro a 3 años y purga. Todo con **`SES_DRY_RUN=1`**. | envía | no se entera |
| **Dic 2026** | **Fase sombra y paridad en Busto Reform**: construimos nuestro parte con datos de estancias que Chekin ya recogió y lo comparamos campo a campo contra lo que Chekin envió. | envía | no se entera |
| **Ene 2027** | **Corte de Busto Reform**: se apaga Chekin en ESE piso, se quita el dry-run solo ahí, con una reserva concreta y vigilada. Temporada baja = el mejor momento para estrenar. | apagado en Busto | recibe nuestro enlace |
| **Feb 2027** | Corte de Duplex, Luxury y House, uno por semana, en ese orden. | se va apagando | ídem |
| **1ª sem. mar 2027** | Baja de Chekin, con el último piso ya migrado y estable. | ❌ baja | — |

### Reglas que no se saltan

1. **Nunca dos emisores sobre el mismo piso.** Nada nuestro envía de verdad hasta que Chekin esté
   apagado en ese piso. Dos partes reales son dos partes reales; el control de «lote duplicado» de
   SES no protege (compara XML idénticos, y el nuestro no será byte a byte el de Chekin).
2. **La sombra es de construcción, no de envío.** En pricing se podían sombrear las dos propuestas
   porque solo una se aplicaba. Aquí no.
3. **Un piso pasa a corte cuando acumula estancias con paridad COMPLETA**, no cuando «parece que
   va». Si en diciembre la paridad no está, se renueva Chekin un año y no pasa nada: la fecha
   manda sobre el alcance, nunca al revés.
4. **No mandamos nuestro enlace mientras Chekin manda el suyo.** Es pedirle a la misma persona que
   rellene dos formularios legales.

### La prueba que falta en el diseño y hay que hacer

`hospedajes.pre-ses.mir.es` (el entorno de pruebas del Ministerio) devuelve **502 a todo**: no hay
sandbox, así que el primer envío de verdad va contra producción. Antes de exponer a un huésped
real, **bloquear una noche de Busto Reform a nombre de Alberto y hacer el ciclo entero con su
propio DNI**: enlace, formulario, OCR, firma, envío, y comprobar en el portal SES que la
comunicación aparece. Es el único ensayo con red que vamos a tener, y cuesta una noche de un piso
de 70€ en temporada baja.

---

## 5. Qué se gana y qué se pierde

**Se gana:** la cuota de Chekin (importe por confirmar, §2.4), los datos del huésped en casa
—que son la lista de reserva directa y, a la larga, una señal de pricing—, y un módulo
(`packages/module-ses`) que el día que se venda a otros propietarios ya está construido.

**Se pierde:** un sistema que hoy funciona y que no despierta a nadie. Chekin es un proveedor con
soporte; nosotros seremos el soporte. El listón no es «que funcione», es **igualar algo que ya
funciona** — por eso la lista de §2.2 se completa antes de tocar código, y por eso el corte es
piso a piso y no de golpe.
