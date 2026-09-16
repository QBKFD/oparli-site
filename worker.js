// worker.js — Cloudflare Worker for oparli.com.
//
// Serves the static site (via the ASSETS binding) and adds ONE server-side route:
//   GET /r/<token>  ->  if <token> matches REFERENCE_LINK_TOKEN, mint a short-lived
//                       Supabase signed URL for the private reference PDF and 302 to it.
//                       Any wrong/missing token, or any other method, returns 404.
//
// The Supabase service-role key is read only here, server-side, from env. It is never
// sent to the client and never committed to git. The route is marked noindex/nofollow
// and is not linked from any page or sitemap.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/r" || url.pathname.startsWith("/r/")) {
      return handleReference(request, url, env);
    }
    // Everything else: serve the static site exactly as before.
    return env.ASSETS.fetch(request);
  },
};

const SECURITY_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function handleReference(request, url, env) {
  // Only allow reads.
  if (request.method !== "GET" && request.method !== "HEAD") return notFound();

  const expected = env.REFERENCE_LINK_TOKEN;
  const base = (env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_BUCKET || "private-docs";
  const docPath = env.REFERENCE_DOC_PATH || "reference-letter.pdf";

  // If anything is unconfigured, reveal nothing.
  if (!expected || !base || !serviceKey) return notFound();

  // The token is whatever follows "/r/". Compare in constant time.
  const token = decodeURIComponent(url.pathname.slice(3));
  if (!token || !timingSafeEqual(token, expected)) return notFound();

  // Ask Supabase Storage for a signed URL valid for 5 minutes.
  const endpoint = `${base}/storage/v1/object/sign/${bucket}/${encodePath(docPath)}`;
  let signed;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!resp.ok) return notFound(); // bad key, missing object, etc.
    const data = await resp.json();
    signed = data.signedURL || data.signedUrl;
  } catch (_e) {
    return notFound();
  }
  if (!signed) return notFound();

  // signedURL is relative to /storage/v1, e.g. "/object/sign/private-docs/...?token=JWT"
  const location = `${base}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  return new Response(null, {
    status: 302,
    headers: { ...SECURITY_HEADERS, "Location": location },
  });
}

function encodePath(p) {
  return String(p).split("/").map(encodeURIComponent).join("/");
}

// Constant-time string comparison to avoid leaking the token via response timing.
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) {
    // Compare something equal-length to keep timing flat, then fail.
    let r = 1;
    for (let i = 0; i < ba.length; i++) r |= ba[i] ^ ba[i];
    return false;
  }
  let r = 0;
  for (let i = 0; i < ba.length; i++) r |= ba[i] ^ bb[i];
  return r === 0;
}
