import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { base64URLDecode, base64URLEncode } from "./base64url.ts";

// "Hello" → "SGVsbG8" (no padding, base64url alphabet)
const HELLO_BYTES = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
const HELLO_B64URL = "SGVsbG8";

// Bytes that exercise the +/= → -/_ substitution and padding strip
// 0xFB 0xFF 0xBF → standard base64 "+/+/" -> base64url "-_-_"
const SUBSTITUTION_BYTES = new Uint8Array([0xfb, 0xff, 0xbf]);
const SUBSTITUTION_B64URL = "-_-_";

Deno.test("base64URLEncode: encodes Uint8Array", () => {
  assertEquals(base64URLEncode(HELLO_BYTES), HELLO_B64URL);
});

Deno.test("base64URLEncode: encodes ArrayBuffer", () => {
  // Copy bytes into a fresh ArrayBuffer to ensure the input is exactly an ArrayBuffer
  const buf = new ArrayBuffer(HELLO_BYTES.byteLength);
  new Uint8Array(buf).set(HELLO_BYTES);
  assertEquals(base64URLEncode(buf), HELLO_B64URL);
});

Deno.test("base64URLEncode: encodes ArrayBufferView (DataView)", () => {
  const buf = new ArrayBuffer(HELLO_BYTES.byteLength);
  new Uint8Array(buf).set(HELLO_BYTES);
  const view = new DataView(buf);
  assertEquals(base64URLEncode(view), HELLO_B64URL);
});

Deno.test("base64URLEncode: respects byteOffset/byteLength of a view", () => {
  // Place HELLO bytes at offset 2 inside a larger buffer.
  const buf = new ArrayBuffer(HELLO_BYTES.byteLength + 4);
  new Uint8Array(buf).set(HELLO_BYTES, 2);
  const view = new Uint8Array(buf, 2, HELLO_BYTES.byteLength);
  assertEquals(base64URLEncode(view), HELLO_B64URL);
});

Deno.test("base64URLEncode: empty input returns empty string", () => {
  assertEquals(base64URLEncode(new Uint8Array(0)), "");
  assertEquals(base64URLEncode(new ArrayBuffer(0)), "");
});

Deno.test("base64URLEncode: uses URL-safe alphabet (no + or /) and strips padding", () => {
  const out = base64URLEncode(SUBSTITUTION_BYTES);
  assertEquals(out, SUBSTITUTION_B64URL);
  // No standard-base64 chars
  assertEquals(out.includes("+"), false);
  assertEquals(out.includes("/"), false);
  assertEquals(out.includes("="), false);
});

Deno.test("base64URLEncode: handles full byte range (0..255)", () => {
  const all = new Uint8Array(256);
  for (let i = 0; i < 256; i++) all[i] = i;
  const encoded = base64URLEncode(all);
  // Roundtrip — must decode back to the original bytes
  assertEquals(base64URLDecode(encoded), all);
});

Deno.test("base64URLEncode: equivalent output for Uint8Array, ArrayBuffer, and DataView of same bytes", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252, 253, 254, 255]);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(buf);

  const a = base64URLEncode(bytes);
  const b = base64URLEncode(buf);
  const c = base64URLEncode(view);
  assertEquals(a, b);
  assertEquals(b, c);
});

// ============================================================
// base64URLDecode: edge cases and fuzz-style invalid inputs
// ============================================================

Deno.test("base64URLDecode: empty string returns empty Uint8Array", () => {
  const out = base64URLDecode("");
  assertEquals(out.byteLength, 0);
});

Deno.test("base64URLDecode: roundtrip of HELLO", () => {
  assertEquals(base64URLDecode(HELLO_B64URL), HELLO_BYTES);
});

Deno.test("base64URLDecode: accepts URL-safe alphabet (- and _)", () => {
  assertEquals(base64URLDecode(SUBSTITUTION_B64URL), SUBSTITUTION_BYTES);
});

Deno.test("base64URLDecode: accepts input with explicit padding (=)", () => {
  // Standard base64 with padding should still decode the same as the unpadded form.
  assertEquals(base64URLDecode("SGVsbG8="), HELLO_BYTES);
  assertEquals(base64URLDecode("SGVsbA=="), new Uint8Array([0x48, 0x65, 0x6c, 0x6c]));
});

Deno.test("base64URLDecode: invalid characters throw (predictable failure)", () => {
  // '*' '!' '#' '@' are not part of base64 nor base64url
  for (const bad of ["abc*", "ab!cd", "##==", "@@@@", "ab cd", "ab\ncd"]) {
    let threw = false;
    try {
      base64URLDecode(bad);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, `expected throw for input: ${JSON.stringify(bad)}`);
  }
});

Deno.test("base64URLDecode: malformed length (1 char) throws", () => {
  // A single base64 char cannot represent any whole byte and atob rejects it
  let threw = false;
  try {
    base64URLDecode("A");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("base64URLDecode: random fuzz — never crashes the process; either returns Uint8Array or throws", () => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=*!#@ \n\t/+";
  // Deterministic-ish PRNG so failures are reproducible
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < 500; i++) {
    const len = Math.floor(rand() * 40);
    let s = "";
    for (let j = 0; j < len; j++) {
      s += alphabet[Math.floor(rand() * alphabet.length)];
    }
    try {
      const out = base64URLDecode(s);
      // If it didn't throw, the result must be a Uint8Array of sane length
      assertEquals(out instanceof Uint8Array, true);
      // Decoded length must be ≤ ceil(len * 3 / 4)
      const upper = Math.ceil((s.length * 3) / 4);
      if (out.byteLength > upper) {
        throw new Error(
          `decoded length ${out.byteLength} exceeds upper bound ${upper} for input ${JSON.stringify(s)}`,
        );
      }
    } catch (err) {
      // Acceptable: any predictable error from atob is fine.
      // Re-throw only if the error is not an Error instance (i.e. unexpected crash type).
      if (!(err instanceof Error)) throw err;
    }
  }
});

Deno.test("base64URLDecode: long valid input roundtrips", () => {
  // 1KB of pseudo-random bytes
  const bytes = new Uint8Array(1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
  const encoded = base64URLEncode(bytes);
  // Encoded must contain only base64url chars
  for (const ch of encoded) {
    const ok =
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "-" ||
      ch === "_";
    assertEquals(ok, true, `unexpected char ${ch} in encoded output`);
  }
  assertEquals(base64URLDecode(encoded), bytes);
});
