/** VAPID (RFC 8292) JWT signing with WebCrypto — no dependencies. */

export function b64urlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Import the private key from the standard VAPID key pair encoding:
 * public = base64url uncompressed point (65 bytes), private = base64url d (32 bytes).
 */
export async function importVapidKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = b64urlDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      d: privateKey,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

export async function vapidJwt(key: CryptoKey, audience: string, subject: string, nowSec: number): Promise<string> {
  const header = b64urlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64urlEncode(JSON.stringify({ aud: audience, exp: nowSec + 12 * 3600, sub: subject }));
  const input = `${header}.${claims}`;
  // WebCrypto returns the raw r||s signature, which is exactly JWS ES256.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${b64urlEncode(sig)}`;
}

/** Build the request for a payload-less push (no message encryption needed). */
export async function pushRequest(
  endpoint: string,
  key: CryptoKey,
  publicKey: string,
  subject: string,
  nowSec: number,
): Promise<Request> {
  const jwt = await vapidJwt(key, new URL(endpoint).origin, subject, nowSec);
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      TTL: '3600',
      Urgency: 'normal',
      'Content-Length': '0',
    },
  });
}
