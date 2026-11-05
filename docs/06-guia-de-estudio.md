# 06 — Guía de estudio: entender el proyecto

Esta guía explica **qué se construyó, cómo funciona y por qué** se tomó cada decisión. Sirve para estudiar antes de la
sustentación y para responder preguntas técnicas con tus propias palabras.

---

## 1. Qué se construyó

Un sistema de monitoreo ambiental para un **rack de servidores**. Un dispositivo simulado (ESP32 + DHT22) mide
temperatura y humedad y publica las lecturas por MQTT a AWS IoT Core. Una regla de IoT guarda cada lectura en DynamoDB.
Un dashboard web alojado en S3 consulta una API (API Gateway + Lambda), muestra los datos, permite encender/apagar un
ventilador y descargar el histórico en CSV.

**Resultado observable:**
- Filas nuevas en DynamoDB cada 5 segundos.
- Dashboard con temperatura, humedad, gráfica y alerta.
- Botón que envía un comando al dispositivo simulado.
- Archivo CSV con las lecturas.

---

## 2. Flujo completo de un dato

```
1. El simulador arma un JSON con deviceId, ts, temperature y humidity.
2. Se conecta a AWS IoT Core por MQTT sobre TLS (puerto 8883) usando un certificado X.509.
3. Publica en el topic rack/rack01/telemetry.
4. La regla rack_telemetry_to_dynamo escucha rack/+/telemetry y ejecuta una acción DynamoDBv2.
5. DynamoDB inserta una fila en RackTelemetry (PK deviceId, SK ts).
6. El dashboard hace fetch a GET /telemetry cada 5 segundos.
7. API Gateway invoca la Lambda rack-api.
8. La Lambda consulta DynamoDB y devuelve las últimas lecturas en JSON.
9. El dashboard dibuja tarjetas y gráfica con Chart.js.
```

**Flujo del actuador (dirección contraria):**

```
Dashboard → POST /command → Lambda → publica en rack/rack01/cmd → simulador recibe
→ cambia el estado del ventilador → publica rack/rack01/status
```

---

## 3. Contrato de datos (lo que no se debe cambiar sin actualizar la documentación)

| Elemento | Valor |
|---|---|
| Región | `us-east-1` |
| Thing / Client ID | `rack01-sensor` |
| Topic telemetría | `rack/rack01/telemetry` |
| Topic comando | `rack/rack01/cmd` |
| Topic estado | `rack/rack01/status` |
| Tabla | `RackTelemetry` |
| PK | `deviceId` (String) |
| SK | `ts` (Number, epoch en milisegundos) |
| Umbral temperatura | `> 27 °C` |
| Rango humedad | `20–80 %` |

Payload de telemetría:

```json
{ "deviceId": "rack01", "ts": 1767225600000, "temperature": 24.6, "humidity": 41.2 }
```

Payload de comando:

```json
{ "actuator": "fan", "state": "ON" }
```

La fuente de verdad está en [`constitution.md`](../constitution.md).

---

## 4. Componentes, uno por uno

### 4.1 Dispositivo / simulador (`device/simulador.py`)

**Qué hace:** simula al ESP32. Se conecta a IoT Core, publica telemetría cada 5 s y escucha comandos.

**Conceptos clave:**
- **MQTT:** protocolo ligero de publicación/suscripción. El dispositivo publica en un *topic* y se suscribe a otro.
- **TLS:** cifra la conexión. El puerto 8883 es MQTT sobre TLS.
- **Certificado X.509:** es la "cédula" del dispositivo. IoT Core lo valida antes de aceptar la conexión.
- **Client ID:** debe coincidir con el recurso permitido en la policy (`client/rack01-sensor`).
- **QoS 1:** el mensaje se entrega al menos una vez.
- **Keepalive 30 s:** el cliente avisa cada 30 s que sigue vivo.

**Lógica del ventilador:** la temperatura tiende a `25.5 °C` con el ventilador apagado y a `21 °C` con el ventilador
encendido. Además hay picos aleatorios de calor para que se dispare la alerta. Así la demo es reproducible.

**Variables importantes:**
- `IOT_ENDPOINT`: endpoint de IoT Core, se lee de una variable de entorno para no escribirlo en el código.
- `CERTS`: carpeta local con `AmazonRootCA1.pem`, `device.pem.crt` y `private.pem.key`.

### 4.2 AWS IoT Core

**Qué es:** el broker MQTT administrado por AWS. Recibe conexiones de dispositivos, autentica certificados y enruta
mensajes.

**Thing (`rack01-sensor`):** representación lógica del dispositivo. No guarda datos; agrupa certificado y policy.

**Certificado:** se genera una sola vez y se descarga. La clave privada **nunca** sale de tu computador ni se sube a Git.

**Policy (`rack01-policy`):** define qué puede hacer ese certificado. Aplica mínimo privilegio:
- `iot:Connect` solo con el Client ID `rack01-sensor`.
- `iot:Publish` solo a `rack/rack01/telemetry` y `rack/rack01/status`.
- `iot:Subscribe`/`iot:Receive` solo a `rack/rack01/cmd`.

Si la policy tiene los marcadores `<REGION>` o `<ACCOUNT_ID>` sin reemplazar, el dispositivo se conecta y se
desconecta con `Unspecified error`.

**Endpoint:** dirección del broker (`xxxx-ats.iot.us-east-1.amazonaws.com`). Se obtiene en IoT Core → Settings.

### 4.3 Regla de IoT (`rack_telemetry_to_dynamo`)

**Qué hace:** escucha un topic, filtra con SQL y ejecuta una acción sin escribir código.

```sql
SELECT * FROM 'rack/+/telemetry'
```

- `+` es comodín de **un** nivel. Sirve para `rack/rack01/telemetry`, `rack/rack02/telemetry`, etc.
- `#` sería comodín de varios niveles (no se usa aquí).

**Acción DynamoDBv2:** inserta el JSON como un ítem. Por eso `deviceId` y `ts` deben existir con esos nombres exactos y
`ts` debe ser numérico; si `ts` llega como texto, la clave de ordenamiento falla.

**Rol:** la regla necesita permiso para escribir en DynamoDB. En Academy se usa `LabRole` porque no se pueden crear
roles propios. El error `AttachRolePolicy` es una limitación del lab, pero la regla queda funcional.

### 4.4 DynamoDB (`RackTelemetry`)

**Qué es:** base de datos NoSQL administrada, orientada a clave-valor y documentos.

**Por qué estas claves:**
- PK `deviceId`: agrupa todas las lecturas de un rack.
- SK `ts`: ordena por tiempo y permite consultar rangos (`entre tal fecha y tal fecha`).

Juntas forman una **clave compuesta**. La consulta típica es: "dame las últimas N lecturas del rack01", que es
exactamente lo que hace la Lambda con `Key("deviceId").eq(device)` y `ScanIndexForward=False`.

**On-demand:** no hay que aprovisionar capacidad; AWS escala solo. Ideal para prácticas y bajo costo.

**Decimal:** DynamoDB devuelve números como `Decimal` en Python. Por eso la Lambda los convierte antes de serializar JSON.

### 4.5 Lambda `rack-api`

**Qué es:** función serverless en Python 3.12. Se ejecuta solo cuando API Gateway la invoca.

**Variables de entorno:**
- `TABLE_NAME=RackTelemetry`
- `IOT_ENDPOINT=xxxx-ats.iot.us-east-1.amazonaws.com`

**Rutas que implementa:**
- `GET /telemetry?deviceId=rack01&limit=60`: devuelve las últimas lecturas en orden cronológico.
- `GET /csv?deviceId=rack01`: genera un CSV con fecha legible y lo descarga.
- `POST /command`: publica `{"actuator":"fan","state":"ON|OFF"}` en `rack/rack01/cmd`.

**Por qué la Lambda y no el navegador directo:** el navegador no puede consultar DynamoDB ni publicar en IoT sin
credenciales AWS. La Lambda usa `LabRole` y hace de intermediaria segura.

**Timeout 15 s:** suficiente para consultar la tabla y publicar el comando.

### 4.6 API Gateway (HTTP API)

**Qué es:** la puerta HTTPS pública que expone la Lambda.

**Rutas:** las tres (`GET /telemetry`, `GET /csv`, `POST /command`) apuntan a la misma integración Lambda.

**CORS:** el dashboard está en otro dominio (S3), así que el navegador exige permisos CORS. Se configura:
- Origen: `*` (solo práctica).
- Métodos: `GET, POST, OPTIONS`.
- Header: `content-type`.

Sin CORS, el navegador bloquea el `fetch` aunque la API responda 200.

### 4.7 Dashboard (`dashboard/`)

**Qué es:** sitio estático (HTML + CSS + JS) sin build. Se sube tal cual a S3.

**Archivos:**
- `index.html`: estructura y carga de Chart.js por CDN.
- `style.css`: diseño oscuro tipo centro de datos, tarjetas y estados de color.
- `config.js`: configuración (`API_URL`, `DEVICE_ID`, `POLL_MS`, `LIMIT`, umbrales).
- `app.js`: lógica de consulta, gráfica, alertas y comando.

**Funcionamiento:**
- `load()` hace `fetch` a `/telemetry` cada 5 s (`POLL_MS`).
- `render()` toma la última lectura, actualiza tarjetas, colores y gráfica.
- Si la temperatura supera `TEMP_MAX` (27 °C) o la humedad sale de rango, muestra la alerta.
- Si pasan más de 30 s sin lecturas, marca "dispositivo desconectado".
- El botón del ventilador hace `POST /command` y cambia su estado visual.
- El enlace de CSV apunta a `/csv?deviceId=rack01`.

**Por qué polling y no WebSockets:** MQTT sobre WebSockets desde el navegador requiere Cognito Identity Pools y roles
IAM propios, que Academy no permite crear. El polling cada 5 s da una experiencia "casi en tiempo real" sin ese problema.

### 4.8 S3 (sitio estático)

**Qué hace:** sirve `index.html`, `style.css`, `app.js` y `config.js` por HTTP.

**Configuración:**
- Static website hosting con `index.html` como documento de índice.
- Block Public Access desactivado.
- Bucket policy que permite `s3:GetObject` a `*` solo sobre ese bucket.

**Por qué HTTP y no HTTPS:** el endpoint de website de S3 es HTTP. El dashboard llama a la API por HTTPS, y eso está
permitido (un sitio HTTP puede consumir una API HTTPS).

---

## 5. Recorrido rápido del código

### `device/simulador.py`
1. Lee `IOT_ENDPOINT` del entorno.
2. Configura TLS con los tres archivos de `certs/`.
3. Define `on_connect`, `on_disconnect` y `on_message`.
4. Se conecta, se suscribe a `rack/rack01/cmd` y arranca `loop_start()`.
5. En un bucle infinito calcula temperatura/humedad y publica cada 5 s.
6. Cuando llega un comando, actualiza `fan_on` y publica el estado en `rack/rack01/status`.

### `lambda/lambda_function.py`
1. Crea el recurso DynamoDB y el cliente `iot-data` al iniciar (fuera del handler, para reutilizarlos).
2. `_items()` consulta por `deviceId` y ordena descendente.
3. `lambda_handler()` decide según `routeKey`.
4. `GET /telemetry` limita a 500 y devuelve en orden ascendente.
5. `GET /csv` recorre todo el histórico y genera el archivo.
6. `POST /command` publica el comando y responde `{"ok": true, "state": ...}`.

### `dashboard/app.js`
1. Lee `window.CONFIG` y pinta los umbrales.
2. Crea la gráfica con tres series: temperatura, humedad y línea de umbral.
3. `load()` consulta la API; `render()` actualiza la interfaz.
4. `sendFan()` envía el comando y refleja el estado.
5. `tickAge()` calcula cuánto tiempo pasó desde la última lectura.

---

## 6. Decisiones de diseño y su justificación

| Decisión | Por qué |
|---|---|
| IoT Core en vez de un broker propio | Autenticación por certificado, escalabilidad y reglas sin servidor |
| Regla IoT hacia DynamoDB | Evita una Lambda intermedia para guardar; menos código y menos costo |
| DynamoDB con PK/SK | Consultas por dispositivo y rango de tiempo sin scans |
| Lambda + API Gateway | El navegador no puede usar credenciales AWS; la Lambda sí |
| Polling cada 5 s | Simple, sin Cognito ni WebSockets; suficiente para la práctica |
| S3 static website | Hosting barato y sin servidor para HTML/JS/CSS |
| `LabRole` | Única opción viable en AWS Academy |
| Certificados fuera de Git | La clave privada es un secreto; si se filtra, hay que rotarla |

---

## 7. Problemas encontrados y qué enseñan

| Problema | Causa | Lección |
|---|---|---|
| `Unspecified error` al conectar | Policy con placeholders sin reemplazar | Los ARN deben tener región y cuenta reales |
| `AttachRolePolicy` en la regla | Academy no permite modificar `LabRole` | Documentar la limitación y verificar con logs |
| Publicar en `rack/#` no funciona | `#` es comodín de suscripción, no un topic publicable | Publicar siempre en un topic exacto |
| Temperatura pegada en 35 °C | Modelo aleatorio sin objetivo | Un modelo con objetivo y reacción al ventilador es demostrable |
| `Policy has invalid resource` en S3 | Nombre del bucket mal escrito | Copiar el ARN real del bucket |
| CORS bloquea el `fetch` | Origen distinto entre S3 y API | Configurar CORS en API Gateway |

---

## 8. Preguntas típicas de sustentación (con respuesta corta)

**¿Por qué MQTT y no HTTP?**
MQTT es ligero, mantiene conexión persistente y está pensado para dispositivos con pocos recursos. HTTP requeriría
una petición por cada lectura y más overhead.

**¿Qué pasa si se cae el dispositivo?**
El dashboard deja de recibir lecturas y muestra "dispositivo desconectado" cuando pasan más de 30 s. Los datos
históricos siguen en DynamoDB.

**¿Por qué el certificado y no usuario/contraseña?**
X.509 es el mecanismo estándar de IoT Core: identifica el dispositivo criptográficamente y permite asociarle una policy.
Además, Academy no permite crear usuarios IAM.

**¿Qué pasa si dos dispositivos publican al mismo topic?**
La regla usa `rack/+/telemetry`; ambos se guardarían con su propio `deviceId`. La PK separa sus historiales. El
dashboard consulta un `deviceId` a la vez.

**¿Cómo se evita que un dispositivo lea datos de otro?**
La policy limita `Connect` a su Client ID y `Subscribe` solo a su topic de comandos. No puede suscribirse a topics ajenos.

**¿Por qué DynamoDB y no una base relacional?**
Los datos son series de tiempo simples, con acceso por dispositivo y tiempo. DynamoDB escala sin administrar servidores
y encaja con el modelo de clave-valor.

**¿Cómo se calcula el CSV?**
La Lambda consulta todo el historial del dispositivo, ordena ascendente, convierte `ts` a fecha ISO y escribe las filas
con `csv.writer`. El navegador lo descarga por `Content-Disposition: attachment`.

**¿Qué harías para producción?**
Autenticación en la API (Cognito/JWT), CORS restringido, HTTPS para el sitio (CloudFront), cifrado y TTL en DynamoDB,
alertas con SNS, y ESP32 físico con reconexión y OTA.

**¿Qué es `LabRole`?**
El rol precreado del Learner Lab. Se usa porque el lab no permite `iam:CreateRole`. Lo asumen Lambda y la regla de IoT.

**¿Qué pasa si cambia la región?**
Hay que recrear los recursos en la nueva región y actualizar endpoint, policy, Lambda y `config.js`. Los recursos son
regionales.

---

## 9. Glosario

- **MQTT:** protocolo de mensajería publish/subscribe.
- **Topic:** canal lógico donde se publican mensajes (`rack/rack01/telemetry`).
- **TLS:** capa de cifrado de la conexión.
- **X.509:** estándar de certificados digitales.
- **Thing:** representación de un dispositivo en IoT Core.
- **Policy:** documento JSON con permisos.
- **Regla:** automatización de IoT Core que enruta mensajes a otro servicio.
- **DynamoDB:** base de datos NoSQL de AWS.
- **PK/SK:** partition key y sort key.
- **Lambda:** función serverless.
- **API Gateway:** servicio que expone endpoints HTTP.
- **CORS:** mecanismo del navegador para permitir peticiones entre dominios.
- **S3:** almacenamiento de objetos; puede servir sitios estáticos.
- **Polling:** consultar periódicamente en vez de recibir notificaciones.
- **Epoch ms:** milisegundos desde el 1 de enero de 1970.

---

## 10. Cómo practicar antes de sustentar

1. Ejecuta el simulador y observa la salida `TX` cada 5 s.
2. Abre DynamoDB → `RackTelemetry` → Explore table items y mira cómo crecen las filas.
3. Abre el dashboard y verifica que la última lectura cambia.
4. Envía `ON` y `OFF` desde el dashboard; revisa el log del simulador (`COMANDO` y `status`).
5. Descarga el CSV y ábrelo en Excel.
6. Fuerza temperatura alta (deja el ventilador apagado) y muestra la alerta.
7. Detén el simulador y comprueba que el dashboard marca "sin lecturas recientes".
8. Vuelve a iniciar el simulador y confirma que se recupera.
