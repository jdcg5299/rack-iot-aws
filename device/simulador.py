import json, time, random, ssl, os
import paho.mqtt.client as mqtt

ENDPOINT = os.environ["IOT_ENDPOINT"]
CERTS = "certs"

fan_on = False

def on_connect(c, u, flags, rc, props):
    print("Conectado, código:", rc)
    c.subscribe("rack/rack01/cmd", qos=1)

def on_disconnect(c, u, flags, rc, props):
    print("Desconectado, código:", rc)

def on_message(c, u, msg):
    global fan_on
    try:
        fan_on = json.loads(msg.payload).get("state") == "ON"
    except Exception:
        return
    estado = "ON" if fan_on else "OFF"
    print("COMANDO:", msg.payload.decode(), "-> ventilador", estado)
    c.publish("rack/rack01/status",
              json.dumps({"deviceId": "rack01", "fan": estado}), qos=1)

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="rack01-sensor")
c.tls_set(ca_certs=f"{CERTS}/AmazonRootCA1.pem",
          certfile=f"{CERTS}/device.pem.crt",
          keyfile=f"{CERTS}/private.pem.key",
          tls_version=ssl.PROTOCOL_TLSv1_2)
c.on_connect = on_connect
c.on_disconnect = on_disconnect
c.on_message = on_message
c.connect(ENDPOINT, 8883, keepalive=30)
c.loop_start()

temp = 24.0
while True:
    target = 21.0 if fan_on else 25.5          # con ventilador tiende a enfriarse
    temp += (target - temp) * 0.15 + random.uniform(-0.4, 0.4)
    if not fan_on and random.random() < 0.05:  # picos ocasionales de calor
        temp += random.uniform(2.0, 4.0)
    temp = max(18.0, min(38.0, temp))
    msg = {"deviceId": "rack01", "ts": int(time.time() * 1000),
           "temperature": round(temp, 1),
           "humidity": round(random.uniform(35, 55), 1)}
    c.publish("rack/rack01/telemetry", json.dumps(msg), qos=1)
    print("TX", msg)
    time.sleep(5)