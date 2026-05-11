export const demoCookieName = "lm_demo";
const demoPayload = "demo";
const nextAuthCookieNames = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.pkce.code_verifier",
  "__Secure-next-auth.pkce.code_verifier",
  "next-auth.state",
  "__Secure-next-auth.state",
  "next-auth.nonce",
  "__Secure-next-auth.nonce"
];

type CookieResponse = {
  cookies: {
    delete: (name: string) => void;
  };
};

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

export function deleteDemoCookie(response: CookieResponse) {
  response.cookies.delete(demoCookieName);
}

export function deleteNextAuthCookies(response: CookieResponse) {
  for (const cookieName of nextAuthCookieNames) {
    response.cookies.delete(cookieName);
  }
}

export function deleteDemoAndAuthCookies(response: CookieResponse) {
  deleteDemoCookie(response);
  deleteNextAuthCookies(response);
}
