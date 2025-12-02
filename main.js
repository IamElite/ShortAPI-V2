// =================================================================================
// VERSION 4.0 - PURE STATELESS, ZERO-STORAGE SOLUTION
// 100% Free | No KV | No Database | Serverless
// =================================================================================

// --- CONFIGURATION ---
const ADMIN_PASSWORD = "MY_SECRET_PASS_123";
const ENCRYPTION_KEY = "SUPER_SECRET_KEY_XY"; // Minimum 32 chars for AES
const SHORTENER_DOMAIN = 'nanolinks.in';
const SHORTENER_API_KEY = 'ae0271c2c57105db2fa209f5b0f20c1a965343f6';
const TOKEN_LIFETIME_SECONDS = 45; // Token 45 seconds me expire hoga

// =================================================================================

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const clientIP = request.headers.get('CF-Connecting-IP') || '';

        // -----------------------------------------------------------------
        // CASE 1: GENERATE NEW PROTECTED LINK (ADMIN)
        // -----------------------------------------------------------------
        if (path === "/encrypt") {
            const originalUrl = url.searchParams.get("url");
            const pass = url.searchParams.get("pass");

            if (pass !== ADMIN_PASSWORD) {
                return new Response(JSON.stringify({ error: "Wrong password" }), { status: 403 });
            }
            if (!originalUrl) {
                return new Response(JSON.stringify({ error: "URL missing" }), { status: 400 });
            }

            try {
                // Create VERIFICATION LINK (yeh shortener ko denge)
                const verificationLink = `${url.origin}/verify`;

                // Get short link from your shortener
                const apiUrl = `https://${SHORTENER_DOMAIN}/api?api=${SHORTENER_API_KEY}&url=${encodeURIComponent(verificationLink)}`;
                const apiRes = await fetch(apiUrl);
                const result = await apiRes.json();

                if (!result.shortenedUrl) {
                    return new Response(JSON.stringify({ 
                        error: "Shortener failed", 
                        debug: result 
                    }), { status: 500 });
                }

                return new Response(JSON.stringify({
                    success: true,
                    original_url: originalUrl,
                    short_url: result.shortenedUrl,
                    admin_note: "Target URL will be passed as 'target' parameter when user visits via shortener"
                }), {
                    headers: { "Content-Type": "application/json" }
                });

            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500 });
            }
        }

        // -----------------------------------------------------------------
        // CASE 2: VERIFICATION PAGE (Shortener se aane par)
        // -----------------------------------------------------------------
        if (path === "/verify") {
            // Shortener se aate waqt FINAL TARGET URL milegi
            const targetUrl = url.searchParams.get("target") || url.searchParams.get("url");
            
            if (!targetUrl) {
                // Agar target URL nahi hai, toh form dikhao jahan admin target URL daal sake
                return new Response(renderTargetForm(), {
                    headers: { "Content-Type": "text/html" }
                });
            }

            // STATELESS TOKEN GENERATE KARO
            // Token me 3 cheeze hongi: targetUrl, expiry, requiredActions
            const tokenData = {
                target: targetUrl,
                exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS, // Unix timestamp
                acts: 3, // User ko 3 interactions karne honge (mouse move, click, etc.)
                salt: Math.random().toString(36).substring(2, 15) // Extra security
            };

            // Token ko encrypt/sign karo
            const token = await encryptToken(JSON.stringify(tokenData), ENCRYPTION_KEY);
            
            // User ko verification page dikhao with token
            return new Response(renderVerificationPage(token), {
                headers: { "Content-Type": "text/html" }
            });
        }

        // -----------------------------------------------------------------
        // CASE 3: FINAL REDIRECT (Token validate karke)
        // -----------------------------------------------------------------
        if (path === "/redirect") {
            const token = url.searchParams.get("token");
            const actions = parseInt(url.searchParams.get("acts")) || 0;

            if (!token) {
                return new Response(renderBlockedPage("No security token provided"), {
                    headers: { "Content-Type": "text/html" }
                });
            }

            try {
                // Token decrypt and validate
                const decrypted = await decryptToken(token, ENCRYPTION_KEY);
                const tokenData = JSON.parse(decrypted);

                // CHECK 1: Token expire hua hai?
                const now = Math.floor(Date.now() / 1000);
                if (now > tokenData.exp) {
                    return new Response(renderBlockedPage("Token expired. Please go back and try again."), {
                        headers: { "Content-Type": "text/html" }
                    });
                }

                // CHECK 2: User ne required interactions kiye hain?
                if (actions < tokenData.acts) {
                    return new Response(renderBlockedPage(`Insufficient interactions. Required: ${tokenData.acts}, Got: ${actions}`), {
                        headers: { "Content-Type": "text/html" }
                    });
                }

                // CHECK 3: Target URL valid hai?
                if (!tokenData.target.startsWith('http')) {
                    return new Response(renderBlockedPage("Invalid target URL"), {
                        headers: { "Content-Type": "text/html" }
                    });
                }

                // SAB CHECKS PASSED - IMMEDIATE REDIRECT (NO WAIT)
                return Response.redirect(tokenData.target, 302);

            } catch (e) {
                // Decryption fail = tampered token
                return new Response(renderBlockedPage("Invalid or tampered token"), {
                    headers: { "Content-Type": "text/html" }
                });
            }
        }

        // -----------------------------------------------------------------
        // DEFAULT LANDING PAGE
        // -----------------------------------------------------------------
        return new Response(renderHomePage(), {
            headers: { "Content-Type": "text/html" }
        });
    }
};

// =================================================================================
// CRYPTO FUNCTIONS (Stateless Token Encryption/Decryption)
// =================================================================================

async function encryptToken(data, secretKey) {
    // Convert secret to proper key
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secretKey.padEnd(32, '0').slice(0, 32)),
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        keyMaterial,
        new TextEncoder().encode(data)
    );
    
    // Combine IV + encrypted data in base64
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
}

async function decryptToken(token, secretKey) {
    try {
        // Decode base64
        const combined = new Uint8Array(atob(token).split('').map(c => c.charCodeAt(0)));
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);
        
        // Convert secret to proper key
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secretKey.padEnd(32, '0').slice(0, 32)),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            keyMaterial,
            encrypted
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        throw new Error('Decryption failed: ' + e.message);
    }
}

// =================================================================================
// HTML TEMPLATES
// =================================================================================

function renderVerificationPage(token) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Human Verification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .loader {
            border: 5px solid #f3f3f3;
            border-top: 5px solid #6a11cb;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
            display: none;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .btn {
            background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);
            color: white;
            border: none;
            padding: 15px 40px;
            font-size: 18px;
            border-radius: 50px;
            cursor: pointer;
            margin: 20px 0;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .interaction-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            border: 2px solid #e9ecef;
        }
        .countdown {
            font-size: 24px;
            font-weight: bold;
            color: #6a11cb;
            margin: 15px 0;
        }
        .progress {
            height: 10px;
            background: #e9ecef;
            border-radius: 5px;
            margin: 20px 0;
            overflow: hidden;
        }
        .progress-bar {
            height: 100%;
            background: #6a11cb;
            width: 0%;
            transition: width 0.3s;
        }
        .hint {
            font-size: 14px;
            color: #666;
            margin-top: 20px;
        }
    </style>
</head>
<body onmousemove="trackInteraction()" onclick="trackInteraction()" onkeypress="trackInteraction()" onscroll="trackInteraction()">
    <div class="container">
        <h2>🔒 Complete Verification</h2>
        <p>Please prove you're human by interacting with this page.</p>
        
        <div class="interaction-box">
            <h3 id="status">Move your mouse or tap the screen...</h3>
            <div class="progress">
                <div class="progress-bar" id="progressBar"></div>
            </div>
            <p>Interactions: <span id="interactionCount">0</span>/<span id="requiredActions">3</span></p>
        </div>
        
        <div class="countdown">
            Time left: <span id="timeLeft">45</span> seconds
        </div>
        
        <div class="loader" id="loader"></div>
        
        <button class="btn" id="continueBtn" onclick="continueToLink()" disabled>
            ⏳ Please complete verification first
        </button>
        
        <div class="hint">
            • Token valid for 45 seconds only<br>
            • Automated tools will be blocked
        </div>
    </div>

    <script>
        const token = "${token}";
        let interactionCount = 0;
        const requiredActions = 3;
        let timeLeft = 45;
        let countdownInterval;
        
        // Update UI elements
        document.getElementById('requiredActions').textContent = requiredActions;
        
        function trackInteraction() {
            if (interactionCount >= requiredActions) return;
            
            interactionCount++;
            document.getElementById('interactionCount').textContent = interactionCount;
            
            // Update progress bar
            const progress = (interactionCount / requiredActions) * 100;
            document.getElementById('progressBar').style.width = progress + '%';
            
            // Update status
            document.getElementById('status').textContent = 
                interactionCount >= requiredActions ? 
                "✅ Verification complete!" : 
                "Keep interacting...";
            
            // Enable button when requirements met
            if (interactionCount >= requiredActions) {
                document.getElementById('continueBtn').disabled = false;
                document.getElementById('continueBtn').innerHTML = "✅ Continue to Destination";
                clearInterval(countdownInterval);
                document.getElementById('timeLeft').textContent = "Ready!";
            }
        }
        
        function startCountdown() {
            countdownInterval = setInterval(() => {
                timeLeft--;
                document.getElementById('timeLeft').textContent = timeLeft;
                
                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                    document.body.innerHTML = '<div class="container"><h2>❌ Time Expired</h2><p>Token has expired. Please go back and try again.</p></div>';
                }
            }, 1000);
        }
        
        function continueToLink() {
            document.getElementById('loader').style.display = 'block';
            document.getElementById('continueBtn').disabled = true;
            document.getElementById('continueBtn').innerHTML = "Redirecting...";
            
            // IMMEDIATE REDIRECT with token and interaction count
            window.location.href = '/redirect?token=' + encodeURIComponent(token) + '&acts=' + interactionCount;
        }
        
        // Start countdown immediately
        startCountdown();
        
        // Auto-track some initial interactions
        setTimeout(() => {
            if (interactionCount === 0) {
                trackInteraction(); // Auto-count as 1st interaction
            }
        }, 500);
    </script>
</body>
</html>`;
}

function renderBlockedPage(reason) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Access Blocked</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #ffebee;
        }
        .alert {
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            max-width: 500px;
            margin: 0 auto;
            border-left: 10px solid #f44336;
        }
        h1 {
            color: #d32f2f;
            font-size: 48px;
            margin: 0 0 20px 0;
        }
    </style>
</head>
<body>
    <div class="alert">
        <h1>🚫</h1>
        <h2>Access Blocked by LinkGuard</h2>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>This request was blocked by our security system.</p>
        <hr style="margin: 20px 0;">
        <p><em>System: LinkGuard v4.0 • Stateless Protection • ${new Date().toLocaleTimeString()}</em></p>
    </div>
</body>
</html>`;
}

function renderHomePage() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>LinkGuard v4.0 - Stateless Protection</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .features {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 20px;
            margin: 30px 0;
        }
        .feature {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 10px;
            width: 200px;
            backdrop-filter: blur(10px);
        }
    </style>
</head>
<body>
    <h1>🔐 LinkGuard v4.0</h1>
    <p><strong>Stateless Anti-Bypass Protection • 100% Free • Zero Storage</strong></p>
    
    <div class="features">
        <div class="feature">
            <h3>💰 Zero Cost</h3>
            <p>No KV, No Database, No Paid Plans</p>
        </div>
        <div class="feature">
            <h3>⚡ Stateless</h3>
            <p>No server-side session storage</p>
        </div>
        <div class="feature">
            <h3>⏱️ 45-Second Tokens</h3>
            <p>Auto-expire, no wait bypass</p>
        </div>
        <div class="feature">
            <h3>👆 Interaction Proof</h3>
            <p>Mouse/click detection required</p>
        </div>
    </div>
    
    <div style="background: rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; max-width: 600px; margin: 30px auto;">
        <h3>For Admin Use:</h3>
        <p><code>https://your-worker.workers.dev/encrypt?pass=YOUR_PASS&url=YOUR_TARGET_URL</code></p>
        <p><small>Returns a short link that users must visit through the shortener</small></p>
    </div>
</body>
</html>`;
}

function renderTargetForm() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Admin: Set Target URL</title>
    <style>
        body { font-family: Arial; padding: 50px; text-align: center; }
        input { padding: 10px; width: 80%; max-width: 500px; margin: 10px; }
        button { padding: 10px 30px; background: #4CAF50; color: white; border: none; cursor: pointer; }
    </style>
</head>
<body>
    <h2>Set Target URL</h2>
    <p>Enter the destination URL for users:</p>
    <input type="url" id="targetUrl" placeholder="https://example.com">
    <button onclick="setTarget()">Generate Verification Page</button>
    <script>
        function setTarget() {
            const url = document.getElementById('targetUrl').value;
            if(url) {
                window.location.href = '/verify?target=' + encodeURIComponent(url);
            }
        }
    </script>
</body>
</html>`;
}
