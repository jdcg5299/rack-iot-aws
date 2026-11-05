# 03 — Dispositivo: Wokwi (ESP32 virtual) y simulador Python

Ambos usan el **mismo contrato** (ver `constitution.md`): clientId `rack01-sensor`, publica en `rack/rack01/telemetry`, escucha `rack/rack01/cmd`.

## Opción A (recomendada primero): simulador Python
*Valida la nube sin depender de Wokwi. Si esto funciona, cualquier fallo posterior es del dispositivo, no de AWS.*

```bash
pip install paho-mqtt
```
`device/simulador.py`:
```python
import json, time, random, ssl, os
import paho.mqtt.client as mqtt

ENDPOINT = os.environ["IOT_ENDPOINT"]          # xxxx-ats.iot.<REGION>.amazonaws.com
CERTS = "certs"
CLIENT_ID = "rack01-sensor"

def on_message(c, u, msg):
    print("COMANDO:", msg.topic, msg.payload.decode())

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID)
c.tls_set(ca_certs=f"{CERTS}/AmazonRootCA1.pem",
          certfile=f"{CERTS}/device.pem.crt",
          keyfile=f"{CERTS}/private.pem.key",
          tls_version=ssl.PROTOCOL_TLSv1_2)
c.on_message = on_message
c.connect(ENDPOINT, 8883, keepalive=30)
c.subscribe("rack/rack01/cmd", qos=1)
c.loop_start()

temp = 23.0
while True:
    temp = max(18, min(35, temp + random.uniform(-0.6, 0.8)))
    msg = {"deviceId": "rack01", "ts": int(time.time() * 1000),
           "temperature": round(temp, 1),
           "humidity": round(random.uniform(35, 55), 1)}
    c.publish("rack/rack01/telemetry", json.dumps(msg), qos=1)
    print("TX", msg)
    time.sleep(5)
```
Renombra tus archivos descargados a `device.pem.crt` y `private.pem.key` (o ajusta las rutas). Ejecuta:
```bash
export IOT_ENDPOINT=xxxx-ats.iot.us-east-1.amazonaws.com
python device/simulador.py
```
**Verificación:** filas nuevas cada 5 s en DynamoDB; en *MQTT test client* suscrito a `rack/rack01/cmd`, publicar `{"actuator":"fan","state":"ON"}` → el simulador imprime `COMANDO`.

## Opción B: ESP32 en Wokwi
Elementos del circuito (https://wokwi.com → New Project → ESP32):
- ESP32 DevKit V1
- DHT22 → VCC 3V3, GND, SDA → GPIO 15
- LED (o relé) como actuador "ventilador" → GPIO 2 (con resistencia 220 Ω si es LED)

Puntos clave del firmware (se escribirá en el siguiente paso, cuando el simulador funcione):
- WiFi: red `Wokwi-GUEST`, sin contraseña.
- Librerías: `PubSubClient`, `DHT sensor library`, `ArduinoJson`, `WiFiClientSecure`.
- Los tres PEM (Root CA, certificado, clave privada) se pegan como cadenas en el código → **no subir a GitHub público con claves reales**; en el repo deja un `secrets.example.h`.
- Hora: sincronizar por NTP (`configTime`) para llenar `ts` en epoch ms.
- Reconexión: bucle que reintenta MQTT y publica cada 5 s con `keepalive` 30 s (criterio "conexión estable").

**Verificación:** igual que la Opción A.
