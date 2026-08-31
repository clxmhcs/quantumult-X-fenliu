// 百度主 App 搜索广告源头清理
// Quantumult X script-response-body / binary bodyBytes
//
// 目标：m.baidu.com/s 的 application/x-protobuffer 流式搜索响应。
// 只解析定位所需的长度前缀、outer field 7、inner field 1/4；
// 不重建 Protobuf，不改变任何 frame / field / payload 长度。
// 将服务端已下发的 ec_r_* -> ec_wise_ad 广告 DOM 原位等长替换为空格，
// 使 SP-engine 首次渲染前即拿不到广告卡 HTML。

const TAG = "baidu-app-search-proto";
const HTML_MIME = "text/html;charset=utf-8";
const MAX_AD_BLOCKS = 20;
const MAX_MASK_RATIO = 0.35;

(() => {
  try {
    const source = $response?.bodyBytes;
    if (!source) {
      console.log(`[${TAG}] no-bodyBytes fail-open`);
      $done({});
      return;
    }

    const input = new Uint8Array(source);
    if (!input.length) {
      console.log(`[${TAG}] empty-body fail-open`);
      $done({});
      return;
    }

    const parsed = collectHtmlSegments(input);
    if (!parsed.ok) {
      console.log(`[${TAG}] protobuf-parse-failed reason=${parsed.reason} fail-open`);
      $done({});
      return;
    }

    if (!parsed.segments.length || !parsed.htmlLength) {
      console.log(`[${TAG}] no-html-payload frames=${parsed.frameCount} fail-open`);
      $done({});
      return;
    }

    const html = new Uint8Array(parsed.htmlLength);
    let logical = 0;
    for (const seg of parsed.segments) {
      html.set(input.subarray(seg.rawStart, seg.rawEnd), logical);
      seg.logicalStart = logical;
      logical += seg.rawEnd - seg.rawStart;
      seg.logicalEnd = logical;
    }

    const scan = findAdRanges(html);
    if (!scan.ok) {
      console.log(`[${TAG}] html-scan-failed reason=${scan.reason} fail-open`);
      $done({});
      return;
    }

    if (!scan.ranges.length) {
      console.log(
        `[${TAG}] no-ad-block frames=${parsed.frameCount} htmlChunks=${parsed.segments.length} htmlBytes=${parsed.htmlLength}`
      );
      $done({});
      return;
    }

    const ranges = normalizeRanges(scan.ranges);
    let maskedBytes = 0;
    for (const r of ranges) maskedBytes += r.end - r.start;

    if (
      ranges.length > MAX_AD_BLOCKS ||
      maskedBytes <= 0 ||
      maskedBytes / parsed.htmlLength > MAX_MASK_RATIO
    ) {
      console.log(
        `[${TAG}] safety-stop blocks=${ranges.length} maskedBytes=${maskedBytes} htmlBytes=${parsed.htmlLength} fail-open`
      );
      $done({});
      return;
    }

    const output = input.slice();
    for (const range of ranges) {
      maskLogicalRange(output, parsed.segments, range.start, range.end);
    }

    console.log(
      `[${TAG}] masked blocks=${ranges.length} wrappers=${scan.wrapperCount} wise=${scan.wiseCount} ` +
      `frames=${parsed.frameCount} htmlChunks=${parsed.segments.length} maskedBytes=${maskedBytes} ` +
      `htmlBytes=${parsed.htmlLength} lengthPreserved=${output.length === input.length ? 1 : 0}`
    );

    $done({
      bodyBytes: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)
    });
  } catch (e) {
    console.log(`[${TAG}] exception=${String(e)} fail-open`);
    $done({});
  }
})();

function collectHtmlSegments(buf) {
  const segments = [];
  let frameCount = 0;
  let htmlLength = 0;
  let pos = 0;

  while (pos < buf.length) {
    const frameLenVar = readVarint(buf, pos, buf.length);
    if (!frameLenVar) return fail("frame-length-varint");

    const frameStart = frameLenVar.next;
    const frameEnd = frameStart + frameLenVar.value;
    if (frameEnd < frameStart || frameEnd > buf.length) return fail("frame-length-overflow");

    const outer = findLengthDelimitedField(buf, frameStart, frameEnd, 7);
    if (outer.error) return fail(`outer-${outer.error}`);

    if (outer.start >= 0) {
      const inner = inspectInnerPayload(buf, outer.start, outer.end);
      if (inner.error) return fail(`inner-${inner.error}`);
      if (inner.isHtml && inner.payloadStart >= 0) {
        const size = inner.payloadEnd - inner.payloadStart;
        segments.push({ rawStart: inner.payloadStart, rawEnd: inner.payloadEnd });
        htmlLength += size;
      }
    }

    frameCount++;
    pos = frameEnd;
  }

  if (pos !== buf.length) return fail("trailing-bytes");
  return { ok: true, segments, frameCount, htmlLength };

  function fail(reason) {
    return { ok: false, reason, segments: [], frameCount, htmlLength: 0 };
  }
}

function inspectInnerPayload(buf, start, end) {
  let pos = start;
  let mimeStart = -1;
  let mimeEnd = -1;
  let payloadStart = -1;
  let payloadEnd = -1;

  while (pos < end) {
    const key = readVarint(buf, pos, end);
    if (!key) return { error: "field-key" };
    const fieldNo = Math.floor(key.value / 8);
    const wire = key.value & 7;
    pos = key.next;

    if (wire === 0) {
      const v = readVarint(buf, pos, end);
      if (!v) return { error: "varint" };
      pos = v.next;
    } else if (wire === 1) {
      if (pos + 8 > end) return { error: "fixed64" };
      pos += 8;
    } else if (wire === 2) {
      const len = readVarint(buf, pos, end);
      if (!len) return { error: "length" };
      const dataStart = len.next;
      const dataEnd = dataStart + len.value;
      if (dataEnd < dataStart || dataEnd > end) return { error: "length-overflow" };

      if (fieldNo === 1) {
        mimeStart = dataStart;
        mimeEnd = dataEnd;
      } else if (fieldNo === 4) {
        payloadStart = dataStart;
        payloadEnd = dataEnd;
      }
      pos = dataEnd;
    } else if (wire === 5) {
      if (pos + 4 > end) return { error: "fixed32" };
      pos += 4;
    } else {
      return { error: `unsupported-wire-${wire}` };
    }
  }

  return {
    error: null,
    isHtml: mimeStart >= 0 && asciiEquals(buf, mimeStart, mimeEnd, HTML_MIME),
    payloadStart,
    payloadEnd
  };
}

function findLengthDelimitedField(buf, start, end, targetField) {
  let pos = start;

  while (pos < end) {
    const key = readVarint(buf, pos, end);
    if (!key) return { error: "field-key", start: -1, end: -1 };
    const fieldNo = Math.floor(key.value / 8);
    const wire = key.value & 7;
    pos = key.next;

    if (wire === 0) {
      const v = readVarint(buf, pos, end);
      if (!v) return { error: "varint", start: -1, end: -1 };
      pos = v.next;
    } else if (wire === 1) {
      if (pos + 8 > end) return { error: "fixed64", start: -1, end: -1 };
      pos += 8;
    } else if (wire === 2) {
      const len = readVarint(buf, pos, end);
      if (!len) return { error: "length", start: -1, end: -1 };
      const dataStart = len.next;
      const dataEnd = dataStart + len.value;
      if (dataEnd < dataStart || dataEnd > end) {
        return { error: "length-overflow", start: -1, end: -1 };
      }
      if (fieldNo === targetField) return { error: null, start: dataStart, end: dataEnd };
      pos = dataEnd;
    } else if (wire === 5) {
      if (pos + 4 > end) return { error: "fixed32", start: -1, end: -1 };
      pos += 4;
    } else {
      return { error: `unsupported-wire-${wire}`, start: -1, end: -1 };
    }
  }

  return { error: null, start: -1, end: -1 };
}

function readVarint(buf, pos, limit) {
  let value = 0;
  let shift = 0;

  while (pos < limit && shift <= 49) {
    const b = buf[pos++];
    value += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) {
      if (!Number.isSafeInteger(value)) return null;
      return { value, next: pos };
    }
    shift += 7;
  }
  return null;
}

function findAdRanges(html) {
  const stack = [];
  const wiseRanges = [];
  const wrapperRanges = [];
  let wiseCount = 0;
  let wrapperCount = 0;
  let pos = 0;

  while (pos < html.length) {
    const lt = indexOfByte(html, 0x3c, pos, html.length);
    if (lt < 0) break;

    if (startsWithAscii(html, lt, "<!--", false)) {
      const commentEnd = indexOfAscii(html, "-->", lt + 4, html.length, false);
      if (commentEnd < 0) return { ok: false, reason: "unterminated-comment" };
      pos = commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(html, lt + 1, html.length);
    if (tagEnd < 0) return { ok: false, reason: "unterminated-tag" };

    const tag = parseTagName(html, lt + 1, tagEnd);
    if (!tag) {
      pos = tagEnd + 1;
      continue;
    }

    if (!tag.closing && (tag.name === "script" || tag.name === "style")) {
      const closeNeedle = `</${tag.name}`;
      const closeStart = indexOfAscii(html, closeNeedle, tagEnd + 1, html.length, true);
      if (closeStart < 0) return { ok: false, reason: `unterminated-${tag.name}` };
      const closeEnd = findTagEnd(html, closeStart + 2, html.length);
      if (closeEnd < 0) return { ok: false, reason: `unterminated-${tag.name}-close` };
      pos = closeEnd + 1;
      continue;
    }

    if (tag.name === "div") {
      if (!tag.closing) {
        const tagText = asciiSlice(html, lt, tagEnd + 1);
        const classes = extractClassTokens(tagText);
        const isWise = classes.includes("ec_wise_ad");
        const isEcR = classes.some(c => c.startsWith("ec_r_"));
        stack.push({ start: lt, isWise, isEcR, hasWise: isWise });
        if (isWise) wiseCount++;
      } else {
        if (!stack.length) {
          pos = tagEnd + 1;
          continue;
        }
        const node = stack.pop();
        const end = tagEnd + 1;
        if (node.isWise) wiseRanges.push({ start: node.start, end });
        if (node.isEcR && node.hasWise) {
          wrapperRanges.push({ start: node.start, end });
          wrapperCount++;
        }
        if (node.hasWise && stack.length) stack[stack.length - 1].hasWise = true;
      }
    }

    pos = tagEnd + 1;
  }

  if (!wiseCount) return { ok: true, ranges: [], wiseCount: 0, wrapperCount: 0 };

  const ranges = wrapperRanges.slice();
  for (const wise of wiseRanges) {
    let covered = false;
    for (const wrapper of wrapperRanges) {
      if (wrapper.start <= wise.start && wrapper.end >= wise.end) {
        covered = true;
        break;
      }
    }
    if (!covered) ranges.push(wise);
  }

  return { ok: true, ranges, wiseCount, wrapperCount };
}

function parseTagName(buf, start, end) {
  let p = start;
  while (p < end && isSpace(buf[p])) p++;
  let closing = false;
  if (buf[p] === 0x2f) {
    closing = true;
    p++;
    while (p < end && isSpace(buf[p])) p++;
  }
  const nameStart = p;
  while (p < end && isTagNameByte(buf[p])) p++;
  if (p === nameStart) return null;
  return { closing, name: asciiSlice(buf, nameStart, p).toLowerCase() };
}

function findTagEnd(buf, pos, limit) {
  let quote = 0;
  for (let i = pos; i < limit; i++) {
    const b = buf[i];
    if (quote) {
      if (b === quote) quote = 0;
    } else if (b === 0x22 || b === 0x27) {
      quote = b;
    } else if (b === 0x3e) {
      return i;
    }
  }
  return -1;
}

function extractClassTokens(tagText) {
  const m = tagText.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i);
  if (!m) return [];
  return m[2].trim().split(/\s+/).filter(Boolean);
}

function normalizeRanges(ranges) {
  const sorted = ranges
    .filter(r => r && r.start >= 0 && r.end > r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (!last || r.start > last.end) out.push({ start: r.start, end: r.end });
    else if (r.end > last.end) last.end = r.end;
  }
  return out;
}

function maskLogicalRange(output, segments, start, end) {
  for (const seg of segments) {
    if (seg.logicalEnd <= start) continue;
    if (seg.logicalStart >= end) break;
    const a = Math.max(start, seg.logicalStart);
    const b = Math.min(end, seg.logicalEnd);
    if (b <= a) continue;
    const rawA = seg.rawStart + (a - seg.logicalStart);
    const rawB = seg.rawStart + (b - seg.logicalStart);
    output.fill(0x20, rawA, rawB);
  }
}

function asciiEquals(buf, start, end, text) {
  if (end - start !== text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (buf[start + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function asciiSlice(buf, start, end) {
  let out = "";
  const CHUNK = 4096;
  for (let p = start; p < end; p += CHUNK) {
    const q = Math.min(end, p + CHUNK);
    let part = "";
    for (let i = p; i < q; i++) part += String.fromCharCode(buf[i]);
    out += part;
  }
  return out;
}

function startsWithAscii(buf, pos, text, ci) {
  if (pos + text.length > buf.length) return false;
  for (let i = 0; i < text.length; i++) {
    let a = buf[pos + i];
    let b = text.charCodeAt(i);
    if (ci) {
      a = lowerAscii(a);
      b = lowerAscii(b);
    }
    if (a !== b) return false;
  }
  return true;
}

function indexOfAscii(buf, text, start, end, ci) {
  const limit = end - text.length;
  for (let i = start; i <= limit; i++) {
    if (startsWithAsciiAt(buf, i, text, ci)) return i;
  }
  return -1;
}

function startsWithAsciiAt(buf, pos, text, ci) {
  if (pos + text.length > buf.length) return false;
  for (let i = 0; i < text.length; i++) {
    let a = buf[pos + i];
    let b = text.charCodeAt(i);
    if (ci) {
      a = lowerAscii(a);
      b = lowerAscii(b);
    }
    if (a !== b) return false;
  }
  return true;
}

function indexOfByte(buf, byte, start, end) {
  for (let i = start; i < end; i++) if (buf[i] === byte) return i;
  return -1;
}

function lowerAscii(b) {
  return b >= 0x41 && b <= 0x5a ? b + 0x20 : b;
}

function isSpace(b) {
  return b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x0c;
}

function isTagNameByte(b) {
  return (
    (b >= 0x41 && b <= 0x5a) ||
    (b >= 0x61 && b <= 0x7a) ||
    (b >= 0x30 && b <= 0x39) ||
    b === 0x2d || b === 0x3a
  );
}
