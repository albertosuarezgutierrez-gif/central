# Autorizar a un tercero en el portal del cliente — estudio legal y comparativa sectorial

> **03/09/2026.** Escrito a petición de Alberto («haz un estudio legal y el resto programa
> como lo hacen?»). **No es un dictamen: no lo firma un abogado.** Es el análisis y las
> mediciones para que su asesoría lo valide o lo corrija.
>
> Etiquetas de confianza: **[Seguro]** = medido o texto legal directo · **[Probable]** =
> inferencia fuerte · **[Suposición]** = relleno de un hueco.

## 0. La respuesta incómoda, primero

Dos cosas antes que ninguna otra.

**La pantalla-muro que propuso Alberto no se puede montar.** «Le doy acceso, la primera
pantalla es la de autorizar, y si no autoriza se bloquea» choca con el **art. 7.4 RGPD**: no
se puede condicionar la prestación de un servicio a un consentimiento que no es necesario
para prestarlo. Ver *sus propias* pólizas no requiere que José autorice a María; bloquearle
el portal por no hacerlo convierte el consentimiento en no libre, y un consentimiento no
libre es nulo — con lo cual el muro además no sirve ni para lo que se puso. **[Seguro]**

**Y hay algo más urgente que el diseño: ya hay 104 autorizaciones activas que nadie otorgó.**
No es un riesgo de diseño futuro. Está en la base de datos hoy, el portal ya las lee, y la
única razón de que no haya expuesto nada es que todavía no ha entrado ningún cliente.

## 1. Hechos medidos (03/09/2026, Supabase compartida, schema `seguros`)

| Medición | Valor |
|---|---|
| Relaciones entre clientes (`cliente_relaciones`) | **1.706** |
| …creadas el **21/06/2026** (día del volcado del CRM) | **1.704** |
| …creadas después (este proyecto, 02/09/2026) | 2 |
| Con `puede_ver_polizas = true` | **104** |
| …de ellas, creadas el 21/06/2026 | **104 — todas** |
| Autorizaciones cuyo otorgante tiene póliza **viva** | **12** (de 6 otorgantes distintos) |
| Pólizas vivas en cartera | 110 |
| Pólizas vivas de ramo de categoría especial (salud) | **0** |
| Filas en `portal_vinculo` (clientes dados de alta en el portal) | **0** |

Tres consecuencias que no son opinión:

1. **Las 104 se crearon el mismo día que el volcado.** Ningún cliente pulsó nada: vienen del
   CRM de Manuel. No hay base jurídica que las sostenga. **[Seguro]**
2. **La tabla no puede demostrar nada.** Sus columnas son `id, correduria_id, cliente_a_id,
   cliente_b_id, tipo_relacion, puede_ver_polizas, observaciones, created_at`. **No hay
   `otorgado_por`, ni `otorgado_en`, ni `revocado_en`, ni alcance.** Un booleano sin autor ni
   fecha no acredita un consentimiento. **[Seguro]**
3. **El portal ya las sirve, y al nivel más alto.** `apps/asegura-portal/lib/cartera-lectura.ts`
   fija `NIVEL_AUTORIZADA = 'completo'` — prima y recibos incluidos — precisamente porque el
   booleano no trae nivel. **[Seguro]**

El reparto de las 104 delata que no es la decisión de nadie, sino ruido del volcado: 18 de 168
cónyuges, 12 de 110 padres, 12 de 110 hijos, **1 «Amigo/a»**, y 3 de 244 «Ocasional - Tomador».
Entre las 12 que hoy apuntan a una póliza viva hay **una «Ocasional - Tomador»**: un conductor
ocasional autorizado a ver las pólizas del tomador, incluida la prima.

**La ventana.** Con `portal_vinculo` a cero, hoy esto se corrige con un `UPDATE` y cuesta cero.
El día siguiente a la primera invitación, el mismo hecho es un acceso indebido a datos
personales y entra el art. 33 RGPD (notificación en 72 h). **La diferencia entre las dos cosas
es el orden en que se hagan, no el trabajo que cuestan.**

## 2. Quién responde: el corredor es responsable, no encargado

**Art. 204.3 RDL 3/2020** (Ley de Distribución de Seguros): los corredores tienen la condición
de **responsables del tratamiento** de los datos de quienes acuden a ellos, y tratan con base
en alguno de los supuestos del art. 6.1 RGPD. **[Probable]** — el texto literal no se ha podido
verificar contra el BOE porque el proxy de red bloquea `boe.es`; el número de artículo y su
sentido salen de fuentes secundarias (Cuatrecasas, Iberley) concordantes. **Que la asesoría
confirme la cita literal.**

Importa porque decide de quién es el marrón: si Alberto fuera encargado, la carga de acreditar
el consentimiento sería de la compañía. Siendo responsable, **es suya**. Y con ella el
**art. 5.2** (responsabilidad proactiva) y el **art. 7.1** (deber de *poder demostrar* que el
interesado consintió).

## 3. Leer y actuar son dos instrumentos distintos

Aquí está el error de diseño que hay que evitar, y es el que Alberto ya intuyó cuando habló de
ticks separados.

**Ver las pólizas de José** es una **cesión de datos** de José a María. Base: **art. 6.1.a**
(consentimiento de José). Granular, revocable y con registro. Es lo que Alberto describió y es
correcto.

**Actuar en nombre de José** —modificar datos, dar un parte, subir documentación, pedir una
baja— **no es protección de datos: es representación (apoderamiento).** Quien responde frente a
la compañía por lo que declare María sigue siendo José, y **un tick en una pantalla no es un
poder**. El caso concreto que duele: María da un parte con una fecha o unos hechos equivocados,
la compañía discute la cobertura invocando el **art. 16 LCS**, y hay que decir quién lo firmó.
Exigencias mínimas si se abre esta puerta: **[Probable]**

- registrar **qué identidad ejecutó cada acto**, no «el cliente»;
- que José vea en su portal todo lo que María hizo en su nombre;
- texto de aceptación específico para «actuar», distinto del de «ver».

**Recomendación:** Fase 1 solo lectura. «Actuar» se diseña aparte y más tarde.

**Y un tercer bloque que no cubre ningún tick:** los **datos de terceros que entran en un
parte** (el otro conductor, un herido, un testigo). El consentimiento de José no los ampara
—no son suyos—. Base: **art. 6.1.f** (interés legítimo en la tramitación) y, si hay lesiones,
datos de salud bajo **art. 9.2.f**. Eso es responsabilidad de Alberto, no de José, y debe
constar en la información de privacidad del portal. **[Probable]**

## 4. El marco, artículo por artículo

| Artículo | Qué obliga | Qué implica aquí |
|---|---|---|
| **5.2 + 7.1 RGPD** | Poder **demostrar** el consentimiento | El booleano actual no lo demuestra: sin autor ni fecha |
| **25.2 RGPD** | Protección de datos **por defecto** | Toda autorización nace **apagada**. Es la cita más fuerte contra heredar las 104 |
| **7.3 RGPD** | Revocar tan fácil como otorgar | Botón de revocar en la misma pantalla, no un email a la correduría |
| **7.4 RGPD** | No condicionar el servicio | **Mata la pantalla-muro** (§0) |
| **9 RGPD** | Categoría especial (salud) | Hoy 0 pólizas de salud. El día que entre una, consentimiento **explícito y separado** |
| **6.1.b RGPD** | Ejecución del contrato | El **tomador** viendo lo suyo **no necesita consentimiento**. Solo el tercero |
| **16 LCS** | 7 días para comunicar el siniestro | Si el parte lo da un tercero, hay que poder decir quién |
| **204.3 RDL 3/2020** | Corredor = responsable | La carga de acreditar es de Alberto **[Probable]** |

## 5. Qué hacer con las 104

**No borrar la relación.** Las 1.706 filas son conocimiento de negocio de Alberto —quién es
cónyuge de quién, qué empresa es de quién— y ese dato **es suyo**, no de José. Borrarlas
destruiría el CRM.

**Borrar el permiso**, que sí es de José. Es decir: **separar las dos cosas**, que hoy viven en
la misma fila y por eso no se pueden tocar por separado.

1. La relación se queda en `cliente_relaciones`.
2. El permiso se va a `portal_autorizacion`, tabla nueva, con lo que el booleano nunca tuvo:
   `otorgante_cliente_id`, `autorizado_identidad_id`, `alcance` (`ver` / `partes` / `documentos`),
   `otorgado_en`, `otorgado_por`, `aceptado_en`, `caduca_en`, `revocado_en`, `version_texto`, `ip`.
3. Migración: **todas a `false`**, salvo las que Alberto reconstruya a mano preguntando. Son
   **12** las que hoy importan; el resto apunta a pólizas muertas del volcado histórico.
4. El portal deja de leer `cliente_relaciones.puede_ver_polizas` y lee **solo**
   `portal_autorizacion`. Mientras las dos fuentes convivan, la vieja manda por accidente.

Ya existe `portal_consentimiento` (`identidad_id, tipo, otorgado, version_texto, ip,
user_agent, creado_en`), pero **no sirve para esto**: no tiene sobre *quién* se consiente ni
revocación. Vale para «acepto las condiciones»; no para «autorizo a María».

## 6. La idea de Alberto, corregida

Su intuición es la buena — **pedir la autorización en la propia intranet del cliente, con ticks
por alcance, en la pantalla de José** — y resuelve exactamente el problema de acreditación que
tiene hoy. Lo que hay que cambiar es una cosa y añadir cuatro:

- ❌ **Fuera el bloqueo.** No se condiciona la entrada a autorizar a terceros (art. 7.4). Sí se
  puede exigir aceptar las **condiciones de uso del portal**, que es otra cosa.
- ✅ **Doble aceptación.** José concede; María recibe aviso y **tiene que aceptar**. Sin eso,
  María accede a datos ajenos sin saber que hay un registro con su nombre. Es lo que hacen la
  AEAT y los bancos, y es lo que convierte el acceso en imputable.
- ✅ **Caducidad.** Toda autorización con fecha de fin (12 meses) y renovación explícita. Es lo
  que resuelve el caso que de verdad revienta esto: **el divorcio**. Nadie entra al portal a
  revocar el día que se separa.
- ✅ **Registro de accesos visible para el otorgante.** José ve qué miró María y cuándo. Es la
  pieza que hace que la autorización sea real y no un cheque en blanco — y la que casi nadie
  copia del modelo sanitario.
- ✅ **Alcances separados**, tal cual los enumeró Alberto: ver · dar partes · subir
  documentación · modificar. Los dos últimos son apoderamiento (§3) y no entran en Fase 1.

## 7. Cómo lo resuelve el resto

**Banca y AEAT — el modelo maduro, y el que hay que copiar. [Seguro]**
El **Registro de Apoderamientos** de la Agencia Tributaria concede poder **por trámite**, no
global; con **fecha de caducidad**; revocable unilateralmente por el poderdante; y **el
apoderado tiene que aceptar** con su propio certificado o Cl@ve. Los cuatro rasgos son
exactamente los que faltan en el booleano actual. La banca replica el patrón para autorizados
en cuenta. **Si hay que elegir un modelo, es este.**

**Software español de correduría (MPM `eClient`, Semmas «Portal del Asegurado»). [Probable]**
Lo resuelven **por vínculo de póliza, no por autorización**: enseñan «familiares vinculados»
porque esas personas figuran como asegurados en *tu* póliza. Es más estrecho, no necesita
consentimiento (va por art. 6.1.b) y es elegante. **Pero aquí no sirve**: solo **2 de los 104**
pares comparten póliza. La cartera de Alberto tiene la relación en el CRM, no en el contrato.
Esa medición mató la alternativa barata.

**Sanidad — acceso delegado con registro visible. [Probable]**
El historial delegado se acompaña de un **log de accesos que el paciente puede consultar**. Es
la pieza de diseño que más protege y la que menos se copia; en un portal de seguros cuesta una
tabla y una pantalla.

**SaaS / RBAC genérico. [Seguro]**
Invitación con **doble opt-in**, roles granulares, expiración y auditoría. Es el mismo patrón
que la banca con otro vocabulario. Que dos mundos independientes hayan convergido en él es la
mejor señal de que es el correcto.

**Lo que no hace nadie:** el muro de «autoriza o te bloqueo». No aparece en ninguno de los
cuatro. **[Probable]**

## 8. Qué haría yo, en este orden

1. **Esta semana, antes de invitar a un solo cliente:** `puede_ver_polizas = false` en las 104.
   Coste cero, y cierra la ventana del §1.
2. Repasar con Alberto **las 12** que apuntan a póliza viva — son las únicas que pueden ser
   decisiones reales. Empezando por la «Ocasional - Tomador».
3. Crear `portal_autorizacion` (§5.2) y dejar que el portal lea **solo** de ahí.
4. Pantalla de José: conceder, ver concedidas, revocar. Doble aceptación y caducidad a 12 meses.
5. Registro de accesos visible para el otorgante.
6. «Actuar» (partes y documentos en nombre de otro) fuera de Fase 1, y cuando entre, con la
   identidad del ejecutor grabada en cada acto.

## 9. Lo que esto no es

No soy abogado y esto no es asesoramiento jurídico. Las mediciones del §1 son verificables y
están sacadas de la base de datos de producción; el encaje legal de los §§2-6 es análisis para
que lo valide una asesoría. Los dos puntos que conviene que confirmen expresamente: **la cita
del art. 204.3 RDL 3/2020** (no verificada contra el BOE) y **si la doble aceptación basta
para el alcance «ver»**, o si además hace falta verificar la identidad del autorizado.
