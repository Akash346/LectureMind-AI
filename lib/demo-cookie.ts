export const demoCookieName = "lm_demo";
const demoPayload = "demo";

function getSecret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "lecturemind-dev-demo-secret"
  );
}

async function hmacSha256(value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createDemoCookieValue() {
  const signature = await hmacSha256(demoPayload);
  return `${demoPayload}.${signature}`;
}

export async function verifyDemoCookieValue(value?: string) {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (payload !== demoPayload || !signature) return false;
  const expected = await hmacSha256(demoPayload);
  return signature === expected;
}
