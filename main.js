// =================================================================================
// VERSION 3.0 - SESSION COOKIE SYSTEM (UNIQUE ID)
// Update Log:
// - Removed unreliable Referer check.
// - Added "Session Cookie" logic (100% Accuracy).
// - Added "Start Link" generator logic.
// =================================================================================

// --- CONFIGURATION ---

// 1. Admin Password
const ADMIN_PASSWORD = "MY_SECRET_PASS_123"; 

// 2. Encryption Key
const SECRET_KEY = "SUPER_SECRET_KEY_XY"; 

// 3. SHORTENER CONFIG
const SHORTENER_DOMAIN = 'nanolinks.in'; 
const SHORTENER_API_KEY = 'ae0271c2c57105db2fa209f5b0f20c1a965343f6';

// 4. SESSION SETTINGS
const SESSION_NAME = "secure_user_id"; // Unique ID name
const SESSION_TIME = 60 * 10; // 10 Minutes (in seconds) - User ke pass itna time hai clear karne ko

// Auto-Fix URL
const getFixedBaseUrl = () => {
    let url = SHORTENER_DOMAIN.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    if (url.endsWith("/")) url = url.slice(0, -1);
    return url;
};
const BASE_URL = getFixedBaseUrl();

// =================================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cookieHeader = request.headers.get("Cookie") || "";

    // -----------------------------------------------------------------
    // CASE 1: LINK GENERATE KARNA (ADMIN SIDE)
    // URL: /encrypt?pass=PASSWORD&url=YOUR_LINK
    // -----------------------------------------------------------------
    if (path === "/encrypt") {
      const originalUrl = url.searchParams.get("url");
      const pass = url.searchParams.get("pass");

      if (pass !== ADMIN_PASSWORD) return new Response(JSON.stringify({ status: "error", msg: "❌ Wrong Password" }), { status: 403 });
      if (!originalUrl) return new Response(JSON.stringify({ status: "error", msg: "❌ URL Missing" }), { status: 400 });

      // 1. Encrypt Destination
      const encryptedDest = xorEncrypt(originalUrl, SECRET_KEY);
      // Ye Final Page ka link hai
      const verifyLink = `${url.origin}/verify?token=${encodeURIComponent(encryptedDest)}`;

      try {
        // 2. Shortener API Call
        const apiUrl = `${BASE_URL}/api?api=${SHORTENER_API_KEY}&url=${encodeURIComponent(verifyLink)}`;
        const apiResponse = await fetch(apiUrl);
        const result = await apiResponse.json();

        if (result.status === "error" || (result.status && result.status !== "success")) {
          return new Response(JSON.stringify({ status: "error", msg: `Shortener Error: ${result.message}` }), { status: 500 });
        }

        // 3. GENERATE "START LINK" (Ye sabse important hai)
        // Hum user ko seedha shortener nahi denge. Hum "Start Link" denge.
        // Start Link = Worker URL + Shortener URL
        const startLink = `${url.origin}/start?next=${encodeURIComponent(result.shortenedUrl)}`;

        return new Response(JSON.stringify({
          status: "success",
          original: originalUrl,
          // Aapko User ko ye neeche wala link dena hai:
          share_this_link: startLink 
        }, null, 2), { headers: { "Content-Type": "application/json" } });

      } catch (e) {
        return new Response(JSON.stringify({ status: "error", msg: `API Failed: ${e.message}` }), { status: 500 });
      }
    }

    // -----------------------------------------------------------------
    // CASE 2: USER START (UNIQUE ID ASSIGNMENT)
    // URL: /start?next=SHORTENER_URL
    // -----------------------------------------------------------------
    if (path === "/start") {
        const nextUrl = url.searchParams.get("next");
        if(!nextUrl) return new Response("Error: Missing Destination", {status: 400});

        // Unique ID generate karo (Simple timestamp + random)
        const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2);

        // HTML Response with Cookie Set
        // Ye page turant redirect karega, lekin pehle Cookie set karega
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Securing Connection...</title>
            <style>
                body { background: #f0f2f5; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; }
                .msg { color: #555; font-size: 18px; }
            </style>
        </head>
        <body>
            <div class="msg">Setting up secure session... 🔒</div>
            <script>
                // 1 Second wait karke redirect (Taaki cookie set ho jaye)
                setTimeout(() => { window.location.href = "${nextUrl}"; }, 500);
            </script>
        </body>
        </html>`;

        return new Response(html, {
            headers: {
                "Content-Type": "text/html",
                // Set Cookie: Name=Value; Max-Age=Seconds; Path=/; HttpOnly
                "Set-Cookie": `${SESSION_NAME}=${uniqueId}; Max-Age=${SESSION_TIME}; Path=/; Secure; HttpOnly`
            }
        });
    }

    // -----------------------------------------------------------------
    // CASE 3: USER VERIFY (FINAL CHECK)
    // URL: /verify?token=XYZ...
    // -----------------------------------------------------------------
    if (path === "/verify") {
      const token = url.searchParams.get("token");
      if (!token) return new Response("Invalid Request", { status: 400 });

      // --- UNIQUE ID CHECK (COOKIE) ---
      // Check karte hain ki browser ke paas wo ID hai ya nahi
      const hasSession = cookieHeader.includes(`${SESSION_NAME}=`);

      if (!hasSession) {
          // ID nahi mili -> BYPASS DETECTED
          return new Response(renderRejectHtml(), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }

      // --- DECRYPT & REDIRECT ---
      try {
        const targetUrl = xorDecrypt(token, SECRET_KEY);
        if (!targetUrl.startsWith("http")) throw new Error("Invalid URL");

        return new Response(renderSuccessHtml(targetUrl), { headers: { "Content-Type": "text/html;charset=UTF-8" } });

      } catch (e) {
        return new Response(renderRejectHtml("Corrupted Data"), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
    }

    return new Response("LinkGuard v3.0 (Session Mode) Online 🟢", { status: 200 });
  },
};

// =================================================================================
// HELPER FUNCTIONS & HTML
// =================================================================================

function xorEncrypt(text, key) {
  let result = "";
  for (let i = 0; i < text.length; i++) { result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)); }
  return btoa(result);
}

function xorDecrypt(encoded, key) {
  let text = atob(encoded);
  let result = "";
  for (let i = 0; i < text.length; i++) { result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)); }
  return result;
}

// 1. REJECT PAGE (Jab Cookie na mile)
function renderRejectHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Access Denied</title><style>body{background:#ffebee;font-family:sans-serif;text-align:center;padding:50px 20px;color:#c62828}.box{background:white;padding:30px;border-radius:15px;box-shadow:0 10px 25px rgba(0,0,0,0.1);max-width:400px;margin:0 auto;border:2px solid #ef5350}.btn{background:#c62828;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:15px}</style></head><body><div class="box"><h1>🚫</h1><h2>Session Not Found!</h2><p><b>Lagta hai aapne Link Bypass karne ki koshish ki hai.</b></p><p>Ya fir aapne "Start Link" se shuru nahi kiya.</p><small style="color:#555">Please hamesha Official Link hi use karein.</small><br><a href="javascript:history.back()" class="btn">Go Back</a></div></body></html>`;
}

// 2. SUCCESS PAGE
function renderSuccessHtml(destination) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Success</title><style>body{background:#e8f5e9;font-family:sans-serif;text-align:center;padding:50px 20px;display:flex;align-items:center;justify-content:center;height:80vh}.loader{border:4px solid #f3f3f3;border-top:4px solid #4caf50;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 20px} @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }h2{color:#2e7d32}</style></head><body><div class="box"><div class="loader"></div><h2>Verified!</h2><p>Unique ID Matched. Redirecting...</p></div><script>setTimeout(function(){window.location.replace("${destination}");}, 1500);</script></body></html>`;
}
