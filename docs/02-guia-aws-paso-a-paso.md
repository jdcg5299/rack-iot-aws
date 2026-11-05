# 02 — Guía paso a paso: creación de recursos en AWS

> Haz cada paso tú mismo en la consola. Al final de cada uno hay una **verificación**: no avances si falla.
> Reemplaza `<REGION>` por la región de tu lab (normalmente `us-east-1`) y `<ACCOUNT_ID>` por tu ID de cuenta de 12 dígitos
> (arriba a la derecha en la consola → clic en tu usuario).

---
## Paso 0 — Entrar al Learner Lab
1. Academy → tu curso → **Learner Lab** → **Start Lab**. Espera el círculo verde.
2. Clic en **AWS** (abre la consola). Arriba a la derecha fija la región: **N. Virginia (us-east-1)**.
   - *Por qué:* los recursos son regionales. Si creas el Thing en una región y la regla en otra, "no se ven".
3. Toma nota: la sesión dura unas 4 h. Al expirar, los recursos suelen persistir pero **la consola se cierra**; reinicia el lab.

**Verificación:** ves la consola con la región correcta.

---
## Paso 1 — Crear el "objeto" (Thing) en AWS IoT Core
*Un Thing es la representación del dispositivo en AWS; el certificado es su "cédula" para autenticarse.*

1. Consola → **IoT Core** → **Manage → All devices → Things → Create things**.
2. **Create single thing** → nombre: `rack01-sensor` → **Unnamed shadow** (por defecto) → Next.
3. **Device certificate:** *Auto-generate a new certificate (recommended)* → Next.
4. **Attach policy:** aún no existe; pulsa **Create policy** (se abre otra pestaña) → ve al Paso 2 y vuelve.

### Paso 2 — Crear la Policy de IoT
*La policy define qué puede hacer el certificado. Principio de mínimo privilegio: solo sus propios topics.*

1. Nombre: `rack01-policy`. Modo **JSON** y pega:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "iot:Connect",
      "Resource": "arn:aws:iot:<REGION>:<ACCOUNT_ID>:client/rack01-sensor" },
    { "Effect": "Allow", "Action": "iot:Publish",
      "Resource": [
        "arn:aws:iot:<REGION>:<ACCOUNT_ID>:topic/rack/rack01/telemetry",
        "arn:aws:iot:<REGION>:<ACCOUNT_ID>:topic/rack/rack01/status" ] },
    { "Effect": "Allow", "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:<REGION>:<ACCOUNT_ID>:topicfilter/rack/rack01/cmd" },
    { "Effect": "Allow", "Action": "iot:Receive",
      "Resource": "arn:aws:iot:<REGION>:<ACCOUNT_ID>:topic/rack/rack01/cmd" }
  ]
}
```
2. **Create**. Vuelve a la pestaña del Thing, refresca la lista, selecciona `rack01-policy` → **Create thing**.
3. **Descarga** (solo se muestran una vez):
   - Device certificate (`...-certificate.pem.crt`)
   - Private key (`...-private.pem.key`)
   - **Amazon Root CA 1** (`AmazonRootCA1.pem`)
4. Guárdalos en `certs/` (carpeta **ignorada por Git**).

### Paso 3 — Obtener el endpoint
IoT Core → **Settings** → **Device data endpoint** (`xxxxxxxx-ats.iot.<REGION>.amazonaws.com`). Cópialo; lo usarán el dispositivo y la Lambda.

**Verificación (Pasos 1–3):** en **MQTT test client → Subscribe** escribe `rack/#` → *Subscribe*. En *Publish* usa topic
`rack/rack01/telemetry` y el mensaje:
```json
{ "deviceId": "rack01", "ts": 1767225600000, "temperature": 24.6, "humidity": 41.2 }
```
Debe aparecer en la suscripción. (Esto valida el broker, aún no el certificado.)

---
## Paso 4 — Crear la tabla DynamoDB
*Clave de partición `deviceId` + clave de ordenamiento `ts` = todas las lecturas de un rack, ordenadas por tiempo, consultables por rango.*

1. **DynamoDB → Tables → Create table**.
2. Table name: `RackTelemetry`. Partition key: `deviceId` (**String**). Sort key: `ts` (**Number**).
3. Table settings: **Customize** → Capacity mode **On-demand** (sin planear capacidad, ideal para práctica). **Create table**.
4. (Opcional) más adelante: *TTL* sobre un atributo `expireAt` para borrar datos antiguos.

**Verificación:** la tabla aparece con estado *Active*.

---
## Paso 5 — Regla de IoT que guarda en DynamoDB
*La regla escucha un topic, filtra con SQL y ejecuta una acción. Necesita un rol IAM que le dé permiso de escribir en DynamoDB: en Academy usamos `LabRole`.*

1. IoT Core → **Message routing → Rules → Create rule**. Nombre: `rack_telemetry_to_dynamo` (solo letras, números y `_`).
2. SQL (versión `2016-03-23`):
```sql
SELECT * FROM 'rack/+/telemetry'
```
   - `+` = comodín de un nivel: sirve para `rack01`, `rack02`, …
3. **Add action → DynamoDBv2** (guarda cada campo del JSON como columna) → Table: `RackTelemetry` → IAM role: **LabRole** → Next → **Create**.

**Verificación:** repite el *Publish* de prueba en el MQTT test client (cambia `ts` a otro número) →
DynamoDB → `RackTelemetry` → **Explore table items**: debe aparecer la fila.

> Si no aparece: IoT Core → Rules → tu regla → revisa la acción; revisa que `deviceId` y `ts` existan en el JSON con esos nombres exactos y tipos (ts numérico, no texto).

---
## Paso 6 — Conectar un dispositivo real (simulado)
Sigue `docs/03-dispositivo-wokwi-y-simulador.md`. **Criterio de éxito:** filas nuevas cada pocos segundos en DynamoDB.

---
## Paso 7 — Lambda `rack-api` (lectura, CSV y comando del actuador)
*El navegador no puede consultar DynamoDB ni publicar en IoT sin credenciales; la Lambda lo hace por él usando `LabRole`.*

1. **Lambda → Create function** → *Author from scratch* → `rack-api` → Runtime **Python 3.12**.
2. *Change default execution role* → **Use an existing role** → **LabRole**. **Create function**.
3. **Configuration → Environment variables:**
   - `TABLE_NAME` = `RackTelemetry`
   - `IOT_ENDPOINT` = tu endpoint del Paso 3 (solo el host, sin `https://`)
4. **Configuration → General configuration → Timeout:** 15 s.
5. Pega este código en `lambda_function.py` y **Deploy**:

```python
import os, json, csv, io, time
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

TABLE = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
IOT = boto3.client("iot-data", endpoint_url="https://" + os.environ["IOT_ENDPOINT"])

def _clean(o):
    if isinstance(o, Decimal):
        return float(o) if o % 1 else int(o)
    raise TypeError

def _resp(code, body, ctype="application/json", extra=None):
    h = {"Content-Type": ctype, "Access-Control-Allow-Origin": "*"}
    h.update(extra or {})
    return {"statusCode": code, "headers": h,
            "body": body if isinstance(body, str) else json.dumps(body, default=_clean)}

def _items(device, limit=None):
    kw = dict(KeyConditionExpression=Key("deviceId").eq(device), ScanIndexForward=False)
    if limit:
        kw["Limit"] = limit
    items, r = [], TABLE.query(**kw)
    items += r["Items"]
    while not limit and "LastEvaluatedKey" in r:
        r = TABLE.query(ExclusiveStartKey=r["LastEvaluatedKey"], **kw)
        items += r["Items"]
    return items

def lambda_handler(event, context):
    route = event.get("routeKey", "")
    qs = event.get("queryStringParameters") or {}
    device = qs.get("deviceId", "rack01")

    if route == "GET /telemetry":
        limit = min(int(qs.get("limit", 60)), 500)
        return _resp(200, {"items": list(reversed(_items(device, limit)))})

    if route == "GET /csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["deviceId", "ts", "fecha_iso", "temperature", "humidity"])
        for i in reversed(_items(device)):
            ts = int(i["ts"])
            iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts / 1000))
            w.writerow([i["deviceId"], ts, iso, i.get("temperature"), i.get("humidity")])
        return _resp(200, buf.getvalue(), "text/csv",
                     {"Content-Disposition": f'attachment; filename="{device}.csv"'})

    if route == "POST /command":
        body = json.loads(event.get("body") or "{}")
        state = "ON" if body.get("state") == "ON" else "OFF"
        IOT.publish(topic=f"rack/{device}/cmd", qos=1,
                    payload=json.dumps({"actuator": "fan", "state": state}))
        return _resp(200, {"ok": True, "state": state})

    return _resp(404, {"error": "ruta no encontrada"})
```

**Verificación:** pestaña **Test** con este evento y debe devolver 200 con `items`:
```json
{ "routeKey": "GET /telemetry", "queryStringParameters": { "deviceId": "rack01", "limit": "5" } }
```

---
## Paso 8 — API Gateway (HTTP API)
1. **API Gateway → Create API → HTTP API → Build**.
2. **Integrations → Add integration → Lambda** → `rack-api`. Nombre: `rack-api-http`.
3. **Routes** (las tres apuntan a la misma integración):
   - `GET /telemetry`
   - `GET /csv`
   - `POST /command`
4. **Stages:** deja `$default` con *auto-deploy*.
5. **CORS** (menú izquierdo → CORS → Configure):
   - Access-Control-Allow-Origin: `*` (para práctica; en producción, la URL de tu sitio)
   - Allow-Methods: `GET, POST, OPTIONS`
   - Allow-Headers: `content-type`
6. Copia el **Invoke URL** (`https://xxxx.execute-api.<REGION>.amazonaws.com`).

**Verificación:** en el navegador abre `<Invoke URL>/telemetry?deviceId=rack01&limit=5` → JSON con lecturas.
Y `<Invoke URL>/csv?deviceId=rack01` descarga un archivo.

---
## Paso 9 — Bucket S3 como sitio web estático
Ver `docs/04-dashboard-y-despliegue.md`.

---
## Problemas frecuentes en AWS Academy
| Síntoma | Causa probable | Solución |
|---|---|---|
| La regla no escribe en DynamoDB | Rol incorrecto o nombres de claves distintos | Usar `LabRole`; verificar `deviceId`/`ts` |
| `AccessDenied` al publicar desde Lambda | Endpoint equivocado o región distinta | Revisar `IOT_ENDPOINT` y región |
| Dispositivo no conecta | Policy con ARN/clientId distinto | `clientId` del dispositivo = `rack01-sensor` |
| Navegador: error CORS | CORS sin configurar | Paso 8.5 |
| Todo "desapareció" | Cuenta/lab reiniciado | Revisar región; recrear lo faltante |
