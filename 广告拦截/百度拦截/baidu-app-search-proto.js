// 百度主 App 搜索广告源头清理（性能 v2）
// Quantumult X script-response-body / binary bodyBytes
//
// 目标：m.baidu.com/s 的 application/x-protobuffer 流式搜索响应。
// 性能策略：
// 1) 只解析 frame / outer field 7 / inner field 1,4，记录 HTML payload 坐标；
// 2) 不拼接整页 HTML，不把每个 div 转为字符串，不跑 class 正则；
// 3) 直接在 HTML 虚拟连续流里搜索真实广告 wrapper：<div class="ec_r_
// 4) 仅对命中附近做 div 层级匹配，并要求内部存在 ec_wise_ad；
// 5) 校验通过后直接原位等长填空格，不复制整份 Response。
// 任一结构异常均 fail-open；wiseSearchHasAd 仍作为最终兜底。

const TAG = "baidu-app-search-proto";
const VERSION = "perf-v2";
const HTML_MIME = "text/html;charset=utf-8";
const WRAPPER_NEEDLE = "<div class=\"ec_r_";
const WISE_NEEDLE = "ec_wise_ad";
const MAX_AD_BLOCKS = 20;
const MAX_MASK_RATIO = 0.35;
const MAX_WRAPPER_BYTES = 512 * 1024;

(() => {
  try {
    const source = $response?.bodyBytes;
    if (!source) {
      console.log(`[${TAG}] ${VERSION} no-bodyBytes fail-open`);
      $done({});
      return;
    }

    const input = toUint8View(source);
    if (!input || !input.length) {
      console.log(`[${TAG}] ${VERSION} empty-body fail-open`);
      $done({});
      return;
    }

    const parsed = collectHtmlSegments(input);
    if (!parsed.ok) {
      console.log(`[${TAG}] ${VERSION} protobuf-parse-failed reason=${parsed.reason} fail-open`);
      $done({});
      return;
    }

    if (!parsed.segments.length || !parsed.htmlLength) {
      console.log(`[${TAG}] ${VERSION} no-html-payload frames=${parsed.frameCount} fail-open`);
      $done({});
      return;
    }

    const wrapperStarts = findPatternPositions(
      input,
      parsed.segments,
      asciiBytes(WRAPPER_NEEDLE),
      MAX_AD_BLOCKS + 1
    );

    if (wrapperStarts.length === 0) {
      console.log(
        `[${TAG}] ${VERSION} no-ad-wrapper frames=${parsed.frameCount} htmlChunks=${parsed.segments.length} htmlBytes=${parsed.htmlLength}`
      );
      $done({});
      return;
    }

    if (wrapperStarts.length > MAX_AD_BLOCKS) {
      console.log(
        `[${TAG}] ${VERSION} safety-stop wrapperCandidates=${wrapperStarts.length} fail-open`
      );
      $done({});
      return;
    }

    const wisePattern = asciiBytes(WISE_NEEDLE);
    const ranges = [];

    for (const start of wrapperStarts) {
      const end = findMatchingDivEnd(input, parsed.segments, start);
      if (end < 0) {
        console.log(`[${TAG}] ${VERSION} wrapper-parse-failed start=${start} fail-open`);
        $done({});
        return;
      }
      if (end - start > MAX_WRAPPER_BYTES) {
        console.log(
          `[${TAG}] ${VERSION} safety-stop wrapperBytes=${end - start} start=${start} fail-open`
        );
        $done({});
        return;
      }

      if (!rangeContainsPattern(input, parsed.segments, start, end, wisePattern)) {
        continue;
      }

      ranges.push({ start, end });
    }

    if (!ranges.length) {
      console.log(
        `[${TAG}] ${VERSION} wrapper-candidates=${wrapperStarts.length} wise=0 fail-open`
      );
      $done({});
      return;
    }

    const normalized = normalizeRanges(ranges);
    let maskedBytes = 0;
    for (const r of normalized) maskedBytes += r.end - r.start;

    if (
      normalized.length > MAX_AD_BLOCKS ||
      maskedBytes <= 0 ||
      maskedBytes / parsed.htmlLength > MAX_MASK_RATIO
    ) {
      console.log(
        `[${TAG}] ${VERSION} safety-stop blocks=${normalized.length} maskedBytes=${maskedBytes} htmlBytes=${parsed.htmlLength} fail-open`
      );
      $done({});
      return;
    }

    for (const range of normalized) {
      maskLogicalRange(input, parsed.segments, range.start, range.end);
    }

    console.log(
      `[${TAG}] ${VERSION} masked blocks=${normalized.length} wrapperCandidates=${wrapperStarts.length} ` +
      `frames=${parsed.frameCount} htmlChunks=${parsed.segments.length} maskedBytes=${maskedBytes} ` +
      `htmlBytes=${parsed.htmlLength} lengthPreserved=1 copies=0 strings=0 regex=0`
    );

    $done({ bodyBytes: input.buffer });
  } catch (e) {
    console.log(`[${TAG}] ${VERSION} exception=${String(e)} fail-open`);
    $done({});
  }
})();

function toUint8View(source) {
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }
  try {
    return new Uint8Array(source);
  } catch (_) {
    return null;
  }
}

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
        segments.push({
          rawStart: inner.payloadStart,
          rawEnd: inner.payloadEnd,
          logicalStart: htmlLength,
          logicalEnd: htmlLength + size
        });
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

function asciiBytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

function buildKmpTable(pattern) {
  const lps = new Uint16Array(pattern.length);
  let len = 0;
  for (let i = 1; i < pattern.length; ) {
    if (pattern[i] === pattern[len]) {
      lps[i++] = ++len;
    } else if (len) {
      len = lps[len - 1];
    } else {
      lps[i++] = 0;
    }
  }
  return lps;
}

function findPatternPositions(buf, segments, pattern, limit) {
  const out = [];
  if (!pattern.length) return out;
  const lps = buildKmpTable(pattern);
  let matched = 0;
  let logical = 0;

  for (const seg of segments) {
    for (let raw = seg.rawStart; raw < seg.rawEnd; raw++, logical++) {
      const b = buf[raw];
      while (matched && b !== pattern[matched]) matched = lps[matched - 1];
      if (b === pattern[matched]) matched++;
      if (matched === pattern.length) {
        out.push(logical - pattern.length + 1);
        if (out.length >= limit) return out;
        matched = lps[matched - 1];
      }
    }
  }
  return out;
}

function rangeContainsPattern(buf, segments, start, end, pattern) {
  if (end <= start || !pattern.length) return false;
  const lps = buildKmpTable(pattern);
  let matched = 0;
  const cursor = makeCursor(segments, start);
  if (!cursor) return false;

  while (cursor.logical < end) {
    const b = cursorByte(buf, cursor);
    if (b < 0) return false;
    while (matched && b !== pattern[matched]) matched = lps[matched - 1];
    if (b === pattern[matched]) matched++;
    if (matched === pattern.length) return true;
    cursorAdvance(cursor, segments);
  }
  return false;
}

function findMatchingDivEnd(buf, segments, logicalStart) {
  const cursor = makeCursor(segments, logicalStart);
  if (!cursor) return -1;

  let depth = 0;
  let tagCount = 0;
  const hardEnd = Math.min(logicalStart + MAX_WRAPPER_BYTES, segments[segments.length - 1].logicalEnd);

  while (cursor.logical < hardEnd) {
    if (cursorByte(buf, cursor) !== 0x3c) {
      cursorAdvance(cursor, segments);
      continue;
    }

    if (virtualStartsWith(buf, segments, cursor, "<!--")) {
      if (!skipUntil(buf, segments, cursor, "-->", hardEnd)) return -1;
      continue;
    }

    const tag = readTagMeta(buf, segments, cursor, hardEnd);
    if (!tag) {
      cursorAdvance(cursor, segments);
      continue;
    }

    tagCount++;
    if (tagCount > 20000) return -1;

    if (tag.name === "script" || tag.name === "style") {
      if (!tag.closing) {
        const closeNeedle = `</${tag.name}`;
        if (!skipUntil(buf, segments, cursor, closeNeedle, hardEnd, true)) return -1;
        const closeTag = readTagMeta(buf, segments, cursor, hardEnd);
        if (!closeTag) return -1;
        moveCursorTo(cursor, segments, closeTag.end);
        continue;
      }
    }

    if (tag.name === "div") {
      if (tag.closing) {
        depth--;
        if (depth === 0) return tag.end;
        if (depth < 0) return -1;
      } else if (!tag.selfClosing) {
        depth++;
      }
    }

    moveCursorTo(cursor, segments, tag.end);
  }

  return -1;
}

function readTagMeta(buf, segments, cursor, limit) {
  const start = cursor.logical;
  const c = cloneCursor(cursor);
  cursorAdvance(c, segments);

  while (c.logical < limit && isSpace(cursorByte(buf, c))) cursorAdvance(c, segments);

  let closing = false;
  if (cursorByte(buf, c) === 0x2f) {
    closing = true;
    cursorAdvance(c, segments);
    while (c.logical < limit && isSpace(cursorByte(buf, c))) cursorAdvance(c, segments);
  }

  let name = "";
  while (c.logical < limit) {
    const b = cursorByte(buf, c);
    if (!isTagNameByte(b)) break;
    if (name.length < 8) name += String.fromCharCode(lowerAscii(b));
    cursorAdvance(c, segments);
  }
  if (!name) return null;

  let quote = 0;
  let lastNonSpace = 0;
  while (c.logical < limit) {
    const b = cursorByte(buf, c);
    if (b < 0) return null;
    if (quote) {
      if (b === quote) quote = 0;
    } else if (b === 0x22 || b === 0x27) {
      quote = b;
    } else if (b === 0x3e) {
      return {
        start,
        end: c.logical + 1,
        name,
        closing,
        selfClosing: lastNonSpace === 0x2f
      };
    } else if (!isSpace(b)) {
      lastNonSpace = b;
    }
    cursorAdvance(c, segments);
  }
  return null;
}

function makeCursor(segments, logical) {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];
    if (logical < seg.logicalStart) hi = mid - 1;
    else if (logical >= seg.logicalEnd) lo = mid + 1;
    else {
      return {
        segIndex: mid,
        raw: seg.rawStart + (logical - seg.logicalStart),
        logical
      };
    }
  }
  if (logical === segments[segments.length - 1].logicalEnd) {
    const i = segments.length - 1;
    return { segIndex: i, raw: segments[i].rawEnd, logical };
  }
  return null;
}

function cloneCursor(c) {
  return { segIndex: c.segIndex, raw: c.raw, logical: c.logical };
}

function cursorByte(buf, c) {
  return c.raw >= 0 && c.raw < buf.length ? buf[c.raw] : -1;
}

function cursorAdvance(c, segments) {
  const seg = segments[c.segIndex];
  c.raw++;
  c.logical++;
  if (c.raw >= seg.rawEnd && c.logical < segments[segments.length - 1].logicalEnd) {
    c.segIndex++;
    const next = segments[c.segIndex];
    c.raw = next.rawStart;
    c.logical = next.logicalStart;
  }
}

function moveCursorTo(c, segments, logical) {
  const next = makeCursor(segments, logical);
  if (!next) {
    c.logical = logical;
    c.raw = -1;
    return false;
  }
  c.segIndex = next.segIndex;
  c.raw = next.raw;
  c.logical = next.logical;
  return true;
}

function virtualStartsWith(buf, segments, cursor, text, ci) {
  const c = cloneCursor(cursor);
  for (let i = 0; i < text.length; i++) {
    let a = cursorByte(buf, c);
    if (a < 0) return false;
    let b = text.charCodeAt(i);
    if (ci) {
      a = lowerAscii(a);
      b = lowerAscii(b);
    }
    if (a !== b) return false;
    cursorAdvance(c, segments);
  }
  return true;
}

function skipUntil(buf, segments, cursor, text, limit, ci) {
  while (cursor.logical < limit) {
    if (virtualStartsWith(buf, segments, cursor, text, ci)) return true;
    cursorAdvance(cursor, segments);
  }
  return false;
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
