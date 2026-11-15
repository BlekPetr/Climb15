// Generates a VAPID key pair (P-256) in the standard base64url encoding.
// Usage: node scripts/gen-vapid.mjs
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = b64url(await crypto.subtle.exportKey('raw', kp.publicKey));
const { d: privateKey } = await crypto.subtle.exportKey('jwk', kp.privateKey);
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('\nStore both as Worker secrets (from the worker/ directory):');
console.log('  npx wrangler secret put VAPID_PUBLIC_KEY');
console.log('  npx wrangler secret put VAPID_PRIVATE_KEY');
