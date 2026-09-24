# Coberturas que vuelca CIMA — inventario y semántica (medido el 02/09/2026)

> 🔌 **Router: skill `cima-ingesta`** — la cadena entera, el diagnóstico de «la ingesta está muda» y qué no se toca.

> Sobre `seguros.poliza_coberturas` de central: **1.425 coberturas en 110 pólizas, 182 códigos distintos**.
> Los códigos son **de cada compañía** (el `00000006` de Mapfre no existe en Occident): no hay catálogo
> común y no se inventa uno. La ficha de póliza en plataforma (`/correduria/poliza/[id]`) los pinta con
> descripción, código y modalidad; el catálogo vivo se saca con la consulta del final, no de este doc.

| Compañía | Ramo | Pólizas | Códigos | Filas |
|---|---|---|---|---|
| Mapfre | auto | 53 | 39 | 598 |
| Occident | hogar | 10 | 71 | 522 |
| Mapfre | hogar | 9 | 28 | 194 |
| Allianz | auto | 26 | 12 | 47 |
| Occident | responsabilidad civil | 7 | 17 | 29 |
| Occident | auto / moto | 2 | 12 | 24 |
| Reale | auto | 1 | 7 | 7 |
| Mapfre | responsabilidad civil | 2 | 3 | 4 |

## Qué significa cada campo (y las tres trampas)

- **`capital_asegurado` es TEXTO del EIAC**, y solo 385 de 1.425 filas son un importe. Las otras:
  **`0` (618 filas)** = la garantía no lleva capital propio (RC obligatoria, asistencia, defensa jurídica,
  riesgos extraordinarios…) — **pintarlo como «0 €» es mentir**, el cliente está cubierto;
  **`INF` (38, Allianz)** = ilimitado; **NULL (384)** = no informado. `interpretarCapital()` de
  `@central/module-seguros` devuelve los cuatro casos y la ficha los distingue.
- **`descripcion_capital`** (47 filas, Allianz): repite la descripción de la garantía; no aporta.
- **`modalidad_valoracion`**: `VP` (713), `VT` (83), `VE` (47), NULL (582, Occident y Reale). Código EIAC de
  la compañía; se muestra tal cual («val. VP») porque la tabla oficial no está en el repo. ⚠️ No traducir
  a ojo: `VT` coincide con las garantías con capital numérico de Mapfre (seguro del conductor, fallecimiento,
  invalidez), pero eso es correlación, no definición.
- **`datos_extra`** (35 filas) es donde está lo que acota de verdad la garantía: `DatosLimitesAsegurados.Limite`
  (clase `PS`/`NI`, mínimo, máximo, «Por siniestro»), `DatosFranquicias.Franquicia` (porcentaje, mínimo,
  máximo) y `DatosImportes` (prima neta y total **de esa cobertura**). `extraerDetalleCobertura()` lo lee y el
  puerto lo manda como `detalle`; la ficha añade las columnas Límite y Prima solo cuando alguna fila lo trae.
- **`franquicia`** (columna plana): 0 filas. Las franquicias reales viven en `datos_extra`.
- **`fecha_inicio` / `fecha_fin`**: la anualidad en curso de la garantía (Mapfre las manda; Occident no).

## Patrones por compañía

- **Mapfre auto** manda un bloque fijo de 12-16 garantías por póliza (RC obligatoria, suplementaria,
  defensa, asistencia, lunas, robo, incendio, riesgos extraordinarios, seguro del conductor) con capital
  `0` salvo el seguro del conductor, y **dos numeraciones** conviven: `0000000N` (pólizas antiguas) y
  `000N0000`/`000N0M0P` jerárquica (las nuevas, con sub-garantías «Indemn. …»).
- **Occident hogar** manda 40-55 garantías por póliza, muy granulares (goteras, cerraduras, ocupación
  ilegal, plagas…), casi todas sin capital: el capital está en el continente/contenido de la póliza, no en
  la garantía. Es la que más límites lleva en `datos_extra`.
- **Allianz auto**: 1-2 garantías con capital `INF`; el paquete «BASICO» es una sola línea.
- **Reale auto**: 7 garantías, sin modalidad ni fechas.

## 🔭 Watchlist curada de campos importantes sin leer (20/09/2026)

Revisión pedida por Alberto tras ver que `cima_cobertura_campos` tenía **777 rutas de POL vistas y
solo 185 leídas**. La mayoría del hueco es ruido esperado por diseño (`cobertura` de `ingesta.ts`
NO alarma a propósito: el EIAC trae cientos de campos y siempre hay cola) — pero dentro de esa cola
había un hallazgo real y sistemático, no ruido: **`Tomador.PersonaFisica.Domicilio` +
`DatosContacto` (dirección de contacto, email y teléfono del propio TOMADOR) llega en el 100 % de
los ficheros POL recientes y nunca se ha leído.** Es justo el dato que hoy solo se puede corregir a
mano desde el portal (`AvisoContacto`/`MisDatos` de `apps/asegura-portal`).

Para que esto **no vuelva a pasar desapercibido**, se montó un vigía dedicado, separado del contador
genérico de `cobertura` (que sigue sin alarmar, a propósito): **`CampoImportanteSinLeer`** en
`@central/module-seguros` (`ingesta.ts`) es una **watchlist CURADA** (no un barrido automático) de
patrones de ruta que alguien decidió que importan. `apps/asegura/lib/ingesta.ts` consulta
`cima_cobertura_campos` por esos patrones (`veces_leido = 0 AND veces_visto >= 3`, umbral de «se ve
en casi todos los ficheros, no una vez suelta») y el resultado viaja por `/api/operador/ingesta` →
`apps/plataforma/lib/correduria/ingesta-cima.ts` → `saludIngesta()`.

🚨 **No entra en `degradada`: no es una avería, es una oportunidad conocida sin decidir.** Por eso se
imprime en `SaludIngesta.avisosImportantes`, un campo SEPARADO que `detalleSalud()` añade **siempre**,
en los tres estados que no son `sin_datos` — incluido `ok`. Sin ese campo aparte se habría perdido
otra vez, exactamente como pasó con el cron mudo antes del 20/09/2026 (ver la cabecera de
`ingesta.ts`): un dato que solo se ve cuando hay OTRA avería que lo arrastre a pantalla es un dato
que se pierde el día en que todo lo demás está en verde.

**Para añadir un patrón nuevo a la watchlist**: edita el `WHERE ruta ~ '...'` en
`apps/asegura/lib/ingesta.ts` (bloque `camposImportantes`). No se automatiza a barrer toda la
cobertura porque la mayoría de rutas sin leer son ruido legítimo (códigos internos EIAC, campos que
no aportan nada al negocio) — es una decisión humana, campo a campo.

🚨 **Corrección de una afirmación que ya estaba desfasada al escribirse:** `apps/asegura-portal/CLAUDE.md`
decía (19/09/2026) que «CIMA no manda el riesgo de hogar». Comprobado el 20/09/2026 contra
`cima_cobertura_campos`: `RiesgoHogar.SituacionRiesgo.{NombreVia,CodigoPostal,Poblacion,Provincia}`
SÍ llega en el EIAC de Occident/Generali, y el mapper empezó a leerlo esa misma mañana (tres pólizas
de Occident con `datos_especificos.direccionOrigen: 'cima'` desde las 09:57 UTC). Lo que seguía sin
leerse ese día era el equivalente para `RiesgoComercios` (ramo «comunidades»).

## Consulta para regenerar el catálogo

```sql
SELECT p.aseguradora, p.tipo::text AS ramo, c.codigo, c.descripcion,
       count(*) AS filas, count(DISTINCT c.poliza_id) AS polizas,
       count(*) FILTER (WHERE c.capital_asegurado ~ '^[0-9]+(\.[0-9]+)?$' AND c.capital_asegurado::numeric <> 0) AS con_capital,
       string_agg(DISTINCT coalesce(c.modalidad_valoracion,'-'), '/') AS modalidades
FROM seguros.poliza_coberturas c JOIN seguros.polizas p ON p.id = c.poliza_id
GROUP BY 1,2,3,4 ORDER BY 1,2,3;
```
