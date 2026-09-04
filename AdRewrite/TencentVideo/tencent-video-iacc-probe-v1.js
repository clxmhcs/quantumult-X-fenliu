/*
 * Tencent Video iacc diagnostic probe - v1
 * Based on 2026-09-04 腾讯1.har clean-install baseline.
 *
 * Purpose:
 *   Observe iacc.qq.com opaque binary responses without modifying them.
 *   This is an experimental diagnostic probe for the second Tencent/GDT ad path.
 *
 * Important:
 *   - PASS THROUGH ONLY. No response bytes are changed.
 *   - Do not merge this logic into the stable MVL ad filter until a causal
 *     JceGodId -> ad creative relationship is confirmed by a controlled HAR.
 */

const VERSION = "tencent-video-iacc-probe-v1-2026.09.04";
console.log(VERSION);

try {
  const headers = $request.headers || {};
  const godId = getHeaderCI(headers, "JceGodId") || "-";
  const status = $response.status || $response.statusCode || "-";
  const bytes = new Uint8Array($response.bodyBytes || []);
  const entropy = bytes.length ? shannonEntropy(bytes).toFixed(3) : "0.000";
  const head = bytes.length ? toHex(bytes, Math.min(bytes.length, 16)) : "-";
  const printable = bytes.length ? printableRatio(bytes).toFixed(3) : "0.000";

  console.log(
    `TencentVideo-IACC: JceGodId=${godId}` +
    ` status=${status}` +
    ` bytes=${bytes.length}` +
    ` entropy=${entropy}` +
    ` printable=${printable}` +
    ` head=${head}`
  );
} catch (error) {
  console.log(`TencentVideo-IACC: probe error: ${error && error.stack ? error.stack : error}`);
}

// Probe only: never modify the response.
$done({});

function getHeaderCI(headers, target) {
  const wanted = String(target).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === wanted) return headers[key];
  }
  return null;
}

function shannonEntropy(bytes) {
  if (!bytes.length) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++;
  let h = 0;
  for (let i = 0; i < 256; i++) {
    if (!counts[i]) continue;
    const p = counts[i] / bytes.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function printableRatio(bytes) {
  if (!bytes.length) return 0;
  let printable = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d) printable++;
  }
  return printable / bytes.length;
}

function toHex(bytes, count) {
  let out = "";
  for (let i = 0; i < count; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}
