# Mapfre (C0058) lleva 75 días sin emitir por CIMA — medición y borrador de consulta

> **Qué es esto:** los hechos medidos contra la BD, y un **borrador** de mensaje para Codeoscopic.
> **NO se ha enviado a nadie** ni se enviará sin que Alberto lo autorice para ese envío concreto
> (regla de comunicaciones salientes de `CLAUDE.md`).
>
> **Medido el 06/09/2026** contra `seguros.cima_ficheros` y `seguros.polizas` del proyecto
> Supabase `wswbehlcuxqxyinousql`. Cualquiera puede repetir las dos consultas de abajo.

---

## 1. El hecho

`[Medido]` Ritmo de emisión por entidad, contando ficheros EIAC descargados:

| entidad | ficheros | primero | último | días callada |
|---|---|---|---|---|
| C0468 Occident | 75 | 23/06/2026 | **05/09/2026** | 1 |
| C0109 Allianz | 39 | 05/06/2026 | 03/09/2026 | 3 |
| C0613 Reale | 3 | 02/08/2026 | 25/08/2026 | 12 |
| **C0058 Mapfre** | **14** | **20/06/2026** | **23/06/2026** | **75** |

```sql
select codigo_entidad, count(*) as ficheros,
       min(descargado_at)::date as primero, max(descargado_at)::date as ultimo,
       (current_date - max(descargado_at)::date) as dias_callada
from seguros.cima_ficheros
group by codigo_entidad
order by dias_callada desc;
```

**CIMA no está caído.** Las otras tres entidades siguen llegando, una de ellas ayer. Es C0058 y
solo C0058.

## 2. Por qué importa: es el 58 % de la cartera viva

`[Medido]` Pólizas vivas por entidad, aplicando la regla única `esCarteraViva()`
(`import_ref IS NULL OR eiac_xml_hash IS NOT NULL`):

| entidad | vivas | de ellas con `eiac_xml_hash` |
|---|---|---|
| **C0058 Mapfre** | **64** | 64 |
| C0109 Allianz | 26 | 26 |
| C0468 Occident | 19 | 19 |
| C0613 Reale | 1 | 1 |
| **total** | **110** | 110 |

```sql
select p.codigo_entidad_dgs, c.nombre_comun,
       count(*) filter (where p.import_ref is null or p.eiac_xml_hash is not null) as vivas
from seguros.polizas p
left join seguros.companias_dgs c on c.codigo_dgs = p.codigo_entidad_dgs
group by p.codigo_entidad_dgs, c.nombre_comun
order by vivas desc;
```

Las **64 tienen `eiac_xml_hash`**: entraron en aquellos 14 ficheros de junio y no se han vuelto a
tocar. O sea, **el 58 % de la cartera viva se cargó en una ventana de cuatro días y lleva 75 días
congelada**. Toda renovación, baja, cambio de prima o siniestro de esas pólizas posterior al
23/06 es invisible para el CRM — y, por tanto, para el libro de comisiones.

## 3. La forma de la curva cambia la pregunta

`[Probable]` No es «una tubería que funcionaba y se cortó». Las otras tres entidades emiten de
forma **continua** durante meses; C0058 emitió **14 ficheros en cuatro días y nunca volvió**. Eso
encaja mucho mejor con **un volcado inicial que salió bien y un flujo recurrente que no llegó a
arrancar** que con una avería sobrevenida.

Importa porque son dos preguntas distintas: una avería se busca en logs de las últimas semanas;
un alta a medias se busca en la configuración de la suscripción, y se resuelve antes.

## 4. Lo que NO se ha comprobado

`[Suposición]` Desde esta sesión no hay forma de ver el lado de Codeoscopic: si la suscripción de
C0058 figura activa, si emitieron y nosotros no lo recogimos, o si nunca se programó el envío
recurrente. **La ausencia de ficheros prueba que no han llegado, no dónde se paran.** Por eso el
borrador pregunta en vez de afirmar.

## 5. El software ya avisa — lo que falta es la llamada

`[Medido]` `silencioPorEntidad()` de `@central/module-seguros`
(`packages/module-seguros/src/silencio-entidad.ts`, 05/09/2026) compara **cada compañía con su
propio ritmo**, no con un umbral fijo, y sale por Telegram desde el cron `correduria-ingesta`
(`apps/plataforma/lib/correduria/ingesta-cima.ts`). No hay nada que programar.

---

## Borrador para Codeoscopic — ⚠️ NO ENVIADO

> Revisar antes de mandar. No lleva ningún dato personal ni número de póliza: solo el código de
> entidad y agregados, que es lo que necesitan para mirarlo.

**Asunto:** C0058 (Mapfre) — sin ficheros EIAC desde el 23/06, ¿suscripción activa?

> Hola:
>
> Os escribo por la integración CIMA de Grupo ASegura (correduría CS-F/0170).
>
> Desde el 23 de junio no recibimos ningún fichero EIAC de la entidad **C0058 (Mapfre)**. Antes de
> esa fecha sí: entre el 20 y el 23 de junio llegaron 14 ficheros, y desde entonces nada.
>
> El resto de entidades sigue llegando con normalidad por el mismo canal y con la misma
> configuración —Occident (C0468) el 5 de septiembre, Allianz (C0109) el 3, Reale (C0613) el 25 de
> agosto—, así que el problema parece acotado a C0058 y no a la conexión.
>
> Por la forma de la curva (un bloque de ficheros en cuatro días y luego silencio) nos preguntamos
> si lo que llegó fue la carga inicial y el envío recurrente de esa entidad no llegó a quedar
> programado. ¿Podéis comprobar si la suscripción de C0058 está activa y emitiendo?
>
> Si por vuestro lado consta que se han emitido ficheros después del 23/06, decídnoslo y lo
> miramos en nuestra ingesta.
>
> Gracias,

**Si Codeoscopic confirma que ellos sí emiten**, el siguiente paso es nuestro: revisar el
adaptador Java de CIMA, que sigue corriendo en la cuenta de Fly de Manuel
(`asegura-app-cima-adapter`) — ver `docs/TRASPASO-CORREDURIA.md`.
