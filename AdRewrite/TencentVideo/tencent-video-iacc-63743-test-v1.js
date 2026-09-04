/*
 * Tencent Video IACC JceGodId=63743 isolation test - v1
 * Based on 2026-09-04 腾讯2.har + 1606.log.
 *
 * EXPERIMENT ONLY.
 *
 * Purpose:
 *   Test whether IACC service 63743 is causally related to the remaining
 *   Tencent/GDT ad object pool that survives the stable MVL filtering.
 *
 * Behavior:
 *   - JceGodId != 63743: pass through unchanged.
 *   - JceGodId == 63743: replace the HTTP response with 204 No Content.
 *   - Log status / byte size / entropy / printable ratio / first 16 bytes
 *     before blocking, so the result can be aligned with Quantumult X logs.
 *
 * IMPORTANT:
 *   Disable tencent-video-iacc-probe-v1.snippet while running this test,
 *   because this script already includes the same diagnostic logging.
 *   Disable the old pgdt cache test. Keep only the stable MVL rewrite enabled.
 */

const VERSION = "tencent-video-iacc-63743-test-v1-2026.09.04";
const TARGET_GOD_ID = "63743";
console.log(VERSION);

try {
  const headers = $request.headers || {};
  const godId = String(getHeaderCI(headers, "JceGodId") || "-");
  const status = $response.status || $response.statusCode || "-";
  const bytes = new Uint8Array($response.bodyBytes || []);
  const entropy = bytes.length ? shannonEntropy(bytes).toFixed(3) : "0.000";
  const printable = bytes.length ? printableRatio(bytes).toFixed(3) : "0.000";
  const head = bytes.length ? toHex(bytes, Math.min(bytes.length, 16)) : "-";

  console.log(
    `TencentVideo-IACC63743: JceGodId=${godId}` +
    ` status=${status}` +
    ` bytes=${bytes.length}` +
    ` entropy=${entropy}` +
    ` printable=${printable}` +
    ` head=${head}`
  );

  if (godId === TARGET_GOD_ID) {
    console.log(
      `TencentVideo-IACC63743: BLOCK target=${TARGET_GOD_ID}` +
      ` originalStatus=${status}` +
      ` originalBytes=${bytes.length}`
    );

    $done({
      status: "HTTP/1.1 204 No Content",
      headers: {
        "Content-Length": "0",
        "Cache-Control": "no-store"
      },
      body: ""
    });
  } else {
    $done({});
  }
} catch (error) {
  console.log(`TencentVideo-IACC63743: test error: ${error && error.stack ? error.stack : error}`);
  $done({});
}

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
  for (let i = 0; i < count; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
