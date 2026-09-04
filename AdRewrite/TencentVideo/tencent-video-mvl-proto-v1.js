/*
 * Tencent Video home feed ad filter - v1
 * Based on 2026-09-04 腾讯.har
 * Target: i.video.qq.com tRPC MVLPageService/getMVLPage response
 * Strategy:
 *   1. Preserve the 16-byte tRPC frame header.
 *   2. Recursively rewrite protobuf length-delimited messages only.
 *   3. Remove whole ad modules identified by stable module markers.
 *   4. Fallback-remove standalone Any<AdFeedInfo/AdFocusPoster> payloads.
 *   5. Update tRPC total frame length at header bytes 4..7.
 */

const VERSION = "tencent-video-mvl-proto-v1-2026.09.04";
const MAX_DEPTH = 24;
const TRPC_HEADER_SIZE = 16;
const EMPTY_BYTES = new Uint8Array(0);

const TYPE_AD_FEED = "type.googleapis.com/com.tencent.qqlive.protocol.pb.AdFeedInfo";
const TYPE_AD_FOCUS = "type.googleapis.com/com.tencent.qqlive.protocol.pb.AdFocusPoster";
const INSERT_MIX_BLOCK = "_ad_insert_mix_block";

console.log(VERSION);

const status = $response.status || $response.statusCode;
if (status && Number(status) !== 200) {
  console.log(`TencentVideo: status=${status}, pass through`);
  $done({});
} else {
  try {
    const input = new Uint8Array($response.bodyBytes || []);
    if (input.length <= TRPC_HEADER_SIZE) {
      console.log(`TencentVideo: body too small=${input.length}, pass through`);
      $done({});
    } else if (!isTrpcFrame(input)) {
      console.log(`TencentVideo: not recognized tRPC frame, pass through bytes=${input.length}`);
      $done({});
    } else {
      const payload = input.subarray(TRPC_HEADER_SIZE);

      // The script is attached to i.video.qq.com root, which carries several RPCs.
      // Only rewrite responses that contain MVL/home ad signatures.
      if (!containsAscii(payload, "getMVLPage") &&
          !containsAscii(payload, "ad_block_") &&
          !containsAscii(payload, TYPE_AD_FEED) &&
          !containsAscii(payload, "mod_adfeed")) {
        console.log(`TencentVideo: non-MVL/ad response, pass through bytes=${input.length}`);
        $done({});
      } else {
        const stats = {
          hardAdModules: 0,
          nativeAdBlocks: 0,
          adFeedAny: 0,
          adFocusAny: 0,
          parseFailures: 0
        };

        const result = rewriteMessage(payload, 0, false, stats);
        if (!result.valid || !result.modified) {
          console.log(`TencentVideo: no ad block changed; valid=${result.valid} bytes=${input.length}`);
          $done({});
        } else {
          const output = new Uint8Array(TRPC_HEADER_SIZE + result.bytes.length);
          output.set(input.subarray(0, TRPC_HEADER_SIZE), 0);
          output.set(result.bytes, TRPC_HEADER_SIZE);
          writeUint32BE(output, 4, output.length);

          console.log(
            `TencentVideo: removed hardModules=${stats.hardAdModules}` +
            ` nativeBlocks=${stats.nativeAdBlocks}` +
            ` adFeedAny=${stats.adFeedAny}` +
            ` adFocusAny=${stats.adFocusAny}` +
            ` bytes=${input.length}->${output.length}`
          );

          $done({
            bodyBytes: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)
          });
        }
      }
    }
  } catch (error) {
    console.log(`TencentVideo: rewrite error: ${error && error.stack ? error.stack : error}`);
    $done({});
  }
}

function isTrpcFrame(bytes) {
  if (bytes.length < TRPC_HEADER_SIZE) return false;
  const declared = readUint32BE(bytes, 4);
  return declared === bytes.length;
}

function rewriteMessage(bytes, depth, allowRemoveSelf, stats) {
  if (depth > MAX_DEPTH) {
    return { valid: true, modified: false, removeSelf: false, bytes };
  }

  const fields = parseMessage(bytes);
  if (!fields) {
    return { valid: false, modified: false, removeSelf: false, bytes };
  }

  if (allowRemoveSelf) {
    const direct = classifyDirectMessage(bytes, fields);
    if (direct.hardAdModule) {
      stats.hardAdModules++;
      return { valid: true, modified: true, removeSelf: true, bytes: EMPTY_BYTES };
    }
    if (direct.nativeAdBlock) {
      stats.nativeAdBlocks++;
      return { valid: true, modified: true, removeSelf: true, bytes: EMPTY_BYTES };
    }
    if (direct.anyType === TYPE_AD_FEED) {
      stats.adFeedAny++;
      return { valid: true, modified: true, removeSelf: true, bytes: EMPTY_BYTES };
    }
    if (direct.anyType === TYPE_AD_FOCUS) {
      stats.adFocusAny++;
      return { valid: true, modified: true, removeSelf: true, bytes: EMPTY_BYTES };
    }
  }

  let modified = false;
  const chunks = [];

  for (const field of fields) {
    if (field.wireType !== 2 || field.payloadEnd <= field.payloadStart) {
      chunks.push(bytes.subarray(field.start, field.end));
      continue;
    }

    const childPayload = bytes.subarray(field.payloadStart, field.payloadEnd);
    const childFields = parseMessage(childPayload);
    if (!childFields) {
      chunks.push(bytes.subarray(field.start, field.end));
      continue;
    }

    const child = rewriteMessage(childPayload, depth + 1, true, stats);
    if (child.removeSelf) {
      modified = true;
      continue;
    }

    if (child.modified) {
      modified = true;
      chunks.push(bytes.subarray(field.start, field.tagEnd));
      chunks.push(encodeVarint(child.bytes.length));
      chunks.push(child.bytes);
    } else {
      chunks.push(bytes.subarray(field.start, field.end));
    }
  }

  if (!modified) {
    return { valid: true, modified: false, removeSelf: false, bytes };
  }
  return {
    valid: true,
    modified: true,
    removeSelf: false,
    bytes: concatBytes(chunks)
  };
}

function classifyDirectMessage(bytes, fields) {
  let adBlockName = false;
  let insertMix = false;
  let anyType = null;
  let nativeAdBlock = false;

  for (const field of fields) {
    if (field.wireType !== 2) continue;
    const payload = bytes.subarray(field.payloadStart, field.payloadEnd);

    if (field.no === 1) {
      if (isAdBlockName(payload)) adBlockName = true;
      if (asciiEquals(payload, TYPE_AD_FEED)) anyType = TYPE_AD_FEED;
      else if (asciiEquals(payload, TYPE_AD_FOCUS)) anyType = TYPE_AD_FOCUS;
    }
    if (field.no === 2 && asciiEquals(payload, INSERT_MIX_BLOCK)) {
      insertMix = true;
    }

    // Tencent's native ad block in this HAR uses a direct key/value child:
    // field 1 = "mod_id", field 2 = "mod_adfeed".
    if (!nativeAdBlock && isModAdFeedKV(payload)) {
      nativeAdBlock = true;
    }
  }

  return {
    hardAdModule: adBlockName && insertMix,
    nativeAdBlock,
    anyType
  };
}

function isModAdFeedKV(bytes) {
  const fields = parseMessage(bytes);
  if (!fields || fields.length < 2 || fields.length > 4) return false;
  let key = false;
  let value = false;
  for (const field of fields) {
    if (field.wireType !== 2) continue;
    const p = bytes.subarray(field.payloadStart, field.payloadEnd);
    if (field.no === 1 && asciiEquals(p, "mod_id")) key = true;
    if (field.no === 2 && asciiEquals(p, "mod_adfeed")) value = true;
  }
  return key && value;
}

function isAdBlockName(bytes) {
  const prefix = "ad_block_";
  if (bytes.length <= prefix.length || !asciiStartsWith(bytes, prefix)) return false;
  for (let i = prefix.length; i < bytes.length; i++) {
    const c = bytes[i];
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function parseMessage(bytes) {
  const fields = [];
  let pos = 0;
  try {
    while (pos < bytes.length) {
      const start = pos;
      const tag = readVarint(bytes, pos);
      if (!tag) return null;
      pos = tag.next;
      const no = Math.floor(tag.value / 8);
      const wireType = tag.value % 8;
      if (no <= 0 || ![0, 1, 2, 5].includes(wireType)) return null;
      const tagEnd = pos;
      let payloadStart;
      let payloadEnd;

      if (wireType === 0) {
        payloadStart = pos;
        const value = readVarint(bytes, pos);
        if (!value) return null;
        pos = value.next;
        payloadEnd = pos;
      } else if (wireType === 1) {
        payloadStart = pos;
        pos += 8;
        payloadEnd = pos;
      } else if (wireType === 5) {
        payloadStart = pos;
        pos += 4;
        payloadEnd = pos;
      } else {
        const len = readVarint(bytes, pos);
        if (!len || !Number.isSafeInteger(len.value) || len.value < 0) return null;
        pos = len.next;
        payloadStart = pos;
        pos += len.value;
        payloadEnd = pos;
      }

      if (pos > bytes.length) return null;
      fields.push({ no, wireType, start, tagEnd, payloadStart, payloadEnd, end: pos });
    }
    return fields;
  } catch (_) {
    return null;
  }
}

function readVarint(bytes, pos) {
  let value = 0;
  let factor = 1;
  for (let i = 0; i < 10 && pos < bytes.length; i++) {
    const b = bytes[pos++];
    value += (b & 0x7f) * factor;
    if ((b & 0x80) === 0) return { value, next: pos };
    factor *= 128;
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(factor)) return null;
  }
  return null;
}

function encodeVarint(value) {
  const out = [];
  let n = value;
  while (n >= 128) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Uint8Array.from(out);
}

function concatBytes(chunks) {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function containsAscii(bytes, text) {
  const needle = asciiBytes(text);
  if (needle.length === 0 || needle.length > bytes.length) return false;
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function asciiEquals(bytes, text) {
  if (bytes.length !== text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function asciiStartsWith(bytes, text) {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function asciiBytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

function readUint32BE(bytes, offset) {
  return bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3];
}

function writeUint32BE(bytes, offset, value) {
  bytes[offset] = Math.floor(value / 0x1000000) & 0xff;
  bytes[offset + 1] = Math.floor(value / 0x10000) & 0xff;
  bytes[offset + 2] = Math.floor(value / 0x100) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
