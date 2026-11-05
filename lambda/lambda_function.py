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
