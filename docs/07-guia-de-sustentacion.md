# 07 — Guía paso a paso para la sustentación

Objetivo: presentar el proyecto en **8–10 minutos**, demostrar que funciona y explicar las decisiones técnicas.
Esta guía asume que ya leíste [`06-guia-de-estudio.md`](06-guia-de-estudio.md).

---

## 1. Antes de empezar (checklist de 10 minutos)

Haz esto **antes** de conectarte a la reunión:

- [ ] Learner Lab iniciado y en verde.
- [ ] Región de la consola: **N. Virginia (us-east-1)**.
- [ ] Tabla `RackTelemetry` en estado *Active*.
- [ ] Regla IoT `rack_telemetry_to_dynamo` habilitada.
- [ ] Lambda `rack-api` con `TABLE_NAME` e `IOT_ENDPOINT` configurados.
- [ ] API Gateway con las 3 rutas y CORS.
- [ ] `dashboard/config.js` con la URL real de la API.
- [ ] Dashboard abierto en la URL de S3.
- [ ] Simulador listo para ejecutar (terminal abierta en la raíz del repo).
- [ ] Certificados en `certs/` (no se muestran ni se comparten).
- [ ] Plan B listo: video corto o capturas de DynamoDB, dashboard y CSV.

Comandos de arranque del simulador:

```powershell
# PowerShell, desde la raíz del repo
$env:IOT_ENDPOINT="xxxx-ats.iot.us-east-1.amazonaws.com"
python device/simulador.py
```

```bash
# Linux/macOS
export IOT_ENDPOINT=xxxx-ats.iot.us-east-1.amazonaws.com
python device/simulador.py
```

Debes ver:

```
Conectado, código: Success
TX {'deviceId': 'rack01', 'ts': ..., 'temperature': ..., 'humidity': ...}
```

Si no aparece `Success`, revisa la policy y el endpoint antes de empezar.

---

## 2. Guion con tiempos (10 minutos)

### 0:00–1:00 — Problema y objetivo
**Qué decir:**
"Un rack de servidores se puede sobrecalentar si falla la climatización. Este proyecto monitorea temperatura y
humedad, alerta si se superan los 27 °C y permite encender un ventilador de forma remota."

**Qué mostrar:** el dashboard o una diapositiva con el caso de uso.

### 1:00–2:30 — Arquitectura
**Qué decir:** explica el diagrama de izquierda a derecha:
1. El dispositivo simulado publica por MQTT/TLS.
2. IoT Core autentica con certificado y recibe la telemetría.
3. Una regla guarda cada lectura en DynamoDB.
4. El dashboard consulta API Gateway → Lambda.
5. La Lambda lee DynamoDB y también publica comandos al dispositivo.

**Qué mostrar:** `docs/img/arquitectura.svg` o el diagrama del README.

**Frase clave:** "No usé MQTT directo desde el navegador porque requeriría Cognito y roles IAM que Academy no permite;
por eso usé API Gateway + Lambda."

### 2:30–3:00 — Contrato de datos
**Qué decir:** muestra el JSON de telemetría y el de comando. Menciona la tabla:
- `rack/rack01/telemetry`
- `rack/rack01/cmd`
- `RackTelemetry`: PK `deviceId`, SK `ts`.

### 3:00–4:00 — Demo: dispositivo → DynamoDB
**Qué hacer:**
1. Muestra la terminal con el simulador corriendo (`TX` cada 5 s).
2. Ve a **DynamoDB → Tables → RackTelemetry → Explore table items**.
3. Refresca y muestra las filas nuevas.

**Qué decir:** "Cada 5 segundos entra una fila nueva; `ts` está en epoch milisegundos y `deviceId` identifica el rack."

### 4:00–5:00 — Demo: MQTT test client (opcional, si el tiempo alcanza)
**Qué hacer:**
1. IoT Core → **MQTT test client**.
2. Subscribe a `rack/#`.
3. Muestra los mensajes llegando.

**Qué decir:** "Esto confirma que el broker está recibiendo la telemetría, independientemente de DynamoDB."

> Si el test client falla por el lab, no te detengas: pasa al dashboard. DynamoDB ya demuestra la recepción.

### 5:00–7:00 — Demo: dashboard, actuador y CSV
**Qué hacer:**
1. Abre la URL de S3.
2. Señala las tarjetas de temperatura y humedad, la gráfica y la hora de la última lectura.
3. Deja el ventilador apagado hasta que la temperatura supere 27 °C y muestra la alerta roja.
4. Pulsa **Encender ventilador**.
5. Vuelve a la terminal: debe aparecer `COMANDO: ... -> ventilador ON` y `status`.
6. Muestra que la temperatura tiende a bajar.
7. Pulsa **Descargar CSV** y abre el archivo.

**Qué decir:** "El botón no habla directo con el dispositivo: el dashboard llama a la Lambda, la Lambda publica en
`rack/rack01/cmd`, el dispositivo reacciona y publica su estado."

### 7:00–8:15 — Retos y aprendizajes
Menciona 3 retos reales:
1. **Policy con placeholders:** el dispositivo se desconectaba con `Unspecified error`; se corrigió con los ARN reales.
2. **LabRole en Academy:** la regla mostró error de `AttachRolePolicy`, pero quedó funcional; se verificó con logs.
3. **CORS:** sin configurarlo, el navegador bloqueaba el `fetch` aunque la API respondiera.

**Qué decir:** "Aprendí que en IoT la seguridad no es solo el certificado: la policy define exactamente qué topics
puede usar cada dispositivo."

### 8:15–9:15 — Siguientes pasos
Menciona mejoras:
- Alertas por SNS o correo.
- Retención con TTL en DynamoDB.
- ESP32 físico con reconexión y OTA.
- Autenticación en la API y CORS restringido.
- CloudFront para HTTPS.

### 9:15–10:00 — Cierre y preguntas
**Frase de cierre:**
"El sistema demuestra el flujo completo: dispositivo → IoT Core → DynamoDB → API → dashboard, con control remoto y
descarga de datos. Todo fue creado manualmente en AWS Academy, documentado y versionado en GitHub."

---

## 3. Orden exacto de la demo (versión rápida de 5 minutos)

Si te queda poco tiempo, haz solo esto:

1. Terminal: simulador publicando (`TX`).
2. DynamoDB: filas nuevas.
3. Dashboard: tarjetas + gráfica.
4. Botón ventilador: comando en la terminal.
5. CSV: descarga y abre.
6. Cierra con la arquitectura en una frase.

---

## 4. Plan B si falla algo

| Falla | Qué hacer |
|---|---|
| No hay internet o el lab expiró | Reproducir el video corto y mostrar capturas |
| El simulador no conecta | Mostrar DynamoDB con datos previos y explicar la arquitectura |
| El dashboard no carga datos | Abrir directamente `<API>/telemetry?deviceId=rack01&limit=5` en el navegador |
| El botón no responde | Mostrar el `POST` en la pestaña Network o el log del simulador con un comando previo |
| DynamoDB no muestra filas nuevas | Refrescar; si sigue, publicar desde MQTT test client en `rack/rack01/telemetry` |

**Regla de oro:** nunca te quedes en silencio arreglando algo. Di qué estás verificando y sigue con el plan B.

---

## 5. Preguntas frecuentes del jurado

**¿Qué pasa si se cae la conexión?**
El dashboard marca "sin lecturas recientes" después de 30 s. El dispositivo puede reconectar; los datos históricos
permanecen en DynamoDB.

**¿Cómo aseguras que un dispositivo no lea datos de otro?**
La policy limita `Connect` a su Client ID y `Subscribe` solo a su topic de comandos.

**¿Por qué no usar el MQTT test client como dashboard?**
Porque no es una interfaz para el operador: no grafica, no alerta, no controla el actuador ni descarga CSV.

**¿Dónde está la lógica de negocio?**
En la Lambda (lectura, CSV y publicación de comandos) y en el dashboard (umbrales y visualización). La regla IoT solo
enruta.

**¿Qué pasa si cambia el formato del JSON?**
La regla DynamoDBv2 espera `deviceId` y `ts` con esos nombres y tipos. Si cambian, hay que actualizar la regla y la
documentación. Por eso el contrato está en `constitution.md`.

**¿Cómo se protegen los certificados?**
Están en `certs/`, que está en `.gitignore`. Nunca se suben al repo ni se muestran en la sustentación. Si se filtran,
se rota el certificado en IoT Core.

**¿Por qué el CSV puede ser grande?**
La Lambda recorre todo el historial del dispositivo. En producción se limitaría por rango de fechas o se generaría en
segundo plano.

---

## 6. Cómo se evalúa (mapea tu demo a los criterios)

| Criterio | Evidencia en la demo |
|---|---|
| **Funcionalidad** | Filas nuevas en DynamoDB mientras corre el simulador |
| **Comunicación** | Simulador conectado, `Success`, mensajes cada 5 s |
| **Diseño del dashboard** | Tarjetas, gráfica, alerta, botón del ventilador y CSV |

Si el jurado pide un criterio, muestra la evidencia correspondiente y explica qué la produce.

---

## 7. Limpieza después de la sustentación

Solo si el profesor lo pide o si vas a dejar de usar el lab:

1. Detén el simulador (`Ctrl+C`).
2. Elimina la regla IoT.
3. Elimina el Thing, su certificado y la policy.
4. Elimina la tabla `RackTelemetry`.
5. Elimina API Gateway, Lambda y el bucket S3 (vaciar antes).

No borres nada antes de terminar la presentación.
