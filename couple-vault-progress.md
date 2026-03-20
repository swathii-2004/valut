# 💑 Couple Vault — Full Project Progress Notes

> Last Updated: March 19, 2026 — Phase 5 COMPLETE ✅
> Environment: Windows 11, PowerShell, Node.js v22
> Project Path: `C:\Users\91812\Desktop\couple-vault-api`

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Environment & Credentials](#environment--credentials)
3. [Phase 5 — Cloudflare Tunnel Setup](#phase-5--cloudflare-tunnel-setup)
   - [Domain Purchase](#step-1-domain-purchase)
   - [Cloudflare Account Setup](#step-2-cloudflare-account-setup)
   - [Cloudflared Installation](#step-3-cloudflared-installation)
   - [Tunnel Creation](#step-4-tunnel-creation)
   - [DNS Configuration](#step-5-dns-configuration)
   - [SSL/TLS Hardening](#step-6-ssltls-hardening)
   - [Security Settings](#step-7-security-settings)
4. [File Reference](#file-reference)
5. [Commands Reference](#commands-reference)
6. [Completion Checklist](#completion-checklist)
7. [Handoff Prompt](#handoff-prompt-for-next-session)

---

## 🗂 Project Overview

**Couple Vault** is a private, secure API backend built for a couple to store and access shared private media and data. The app is built with Node.js/Express and uses PostgreSQL for data storage and encrypted file storage on disk.

The goal of Phase 5 was to expose the local development server to the internet securely using a **Cloudflare Tunnel** — without opening any firewall ports or exposing a home IP address.

---

## 🔐 Environment & Credentials

### Local Machine
| Property | Value |
|----------|-------|
| OS | Windows 11 |
| Shell | PowerShell |
| Node.js | v22 |
| Project Path | `C:\Users\91812\Desktop\couple-vault-api` |
| Server Port | `3000` |
| Server Entry Point | `src/server.js` |

### .env Configuration (from project)
| Key | Value |
|-----|-------|
| PORT | 3000 |
| NODE_ENV | development |
| DB_HOST | localhost |
| DB_PORT | 5432 |
| DB_NAME | couple_vault |
| DB_USER | vault_app |
| DB_PASSWORD | Vault@2026!SecurePass |
| JWT_SECRET | f3a9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1 |
| ENCRYPTION_KEY_V1 | 9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e |
| ACTIVE_KEY_VERSION | 1 |
| STORAGE_PATH | C:\Users\91812\desktop\couple-vault-api\vault |

### Cloudflare Account
| Property | Value |
|----------|-------|
| Email | oldb70545@gmail.com |
| Plan | Free |
| Zone ID | aee35c38a968fa371b8b88d4745c1c97 |
| Account ID | 4f2210f2589b66d48224b24db6643609 |

### Domain
| Property | Value |
|----------|-------|
| Domain | couplvault.online |
| Registrar | Hostinger |
| Cost | ₹125.60 |
| Expiry | 2027-02-20 |
| Nameserver 1 | hugh.ns.cloudflare.com |
| Nameserver 2 | sara.ns.cloudflare.com |

### Cloudflare Tunnel
| Property | Value |
|----------|-------|
| Tunnel Name | couple-vault |
| Tunnel ID | 37a151ef-4999-4100-add1-1ecd7028af75 |
| Credentials File | `C:\Users\91812\.cloudflared\37a151ef-4999-4100-add1-1ecd7028af75.json` |
| Cert File | `C:\Users\91812\.cloudflared\cert.pem` |
| Config File | `C:\Users\91812\.cloudflared\config.yml` |
| cloudflared Version | 2025.8.1 |
| cloudflared Install Path | `C:\Program Files (x86)\cloudflared\cloudflared.exe` |

---

## 🚀 Phase 5 — Cloudflare Tunnel Setup

### Step 1: Domain Purchase

- Purchased `couplvault.online` on **Hostinger** for ₹125.60
- Domain is active and valid until **2027-02-20**
- Note: Domain is `couplvault.online` (not `couplE` — no 'e')

---

### Step 2: Cloudflare Account Setup

1. Created a Cloudflare account at [dash.cloudflare.com](https://dash.cloudflare.com) using `oldb70545@gmail.com`
2. Added `couplvault.online` to Cloudflare under the **Free plan**
3. Cloudflare assigned nameservers:
   - `hugh.ns.cloudflare.com`
   - `sara.ns.cloudflare.com`
4. Logged into Hostinger → Domain → DNS / Nameservers → replaced existing nameservers with the two Cloudflare ones above
5. Clicked **"I updated my nameservers"** on Cloudflare
6. DNS propagation takes up to 24 hours — domain status showed **"Pending"** during setup but tunnel still worked

> ⚠️ Note: During setup, Cloudflare DNS had old auto-generated records:
> - `A` record: `couplvault.online` → `84.32.84.32`
> - `CNAME` record: `www` → `couplvault.online`
>
> Both were **deleted** before adding the tunnel CNAME route.

---

### Step 3: Cloudflared Installation

**Method used:** winget (Windows Package Manager)

```powershell
# First attempt failed due to Microsoft Store source error
winget install --id Cloudflare.cloudflared
# Error: Failed when searching source: msstore (0x8a15005e)

# Fixed by specifying winget source explicitly
winget install --id Cloudflare.cloudflared --source winget
# ✅ Successfully installed cloudflared v2025.8.1
```

> ⚠️ Important: After installation, PowerShell does NOT recognize `cloudflared` directly.
> You must always use the **full path**:
> ```powershell
> & "C:\Program Files (x86)\cloudflared\cloudflared.exe"
> ```

---

### Step 4: Tunnel Creation

**Login to Cloudflare:**
```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel login
```
- A browser window opened automatically
- Logged in with `oldb70545@gmail.com`
- Selected `couplvault.online` to authorize
- Certificate saved to: `C:\Users\91812\.cloudflared\cert.pem`

**Create the tunnel:**
```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel create couple-vault
```
Output:
```
Tunnel credentials written to C:\Users\91812\.cloudflared\37a151ef-4999-4100-add1-1ecd7028af75.json
Created tunnel couple-vault with id 37a151ef-4999-4100-add1-1ecd7028af75
```

**Create config file:**
```powershell
New-Item -Path "C:\Users\91812\.cloudflared\config.yml" -ItemType File -Force
notepad "C:\Users\91812\.cloudflared\config.yml"
```

**Contents of `config.yml`:**
```yaml
tunnel: 37a151ef-4999-4100-add1-1ecd7028af75
credentials-file: C:\Users\91812\.cloudflared\37a151ef-4999-4100-add1-1ecd7028af75.json

ingress:
  - hostname: couplvault.online
    service: http://localhost:3000
  - service: http_status:404
```

---

### Step 5: DNS Configuration

**Add CNAME route for the tunnel:**
```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel route dns couple-vault couplvault.online
```

First attempt failed:
```
Failed to add route: code: 1003 — An A, AAAA, or CNAME record with that host already exists.
```

**Fix:** Went to Cloudflare Dashboard → DNS Records → deleted the existing `A` record and `CNAME` record → ran command again.

Second attempt succeeded:
```
Added CNAME couplvault.online which will route to this tunnel tunnelID=37a151ef-4999-4100-add1-1ecd7028af75
```

---

### Step 6: Running the Tunnel

**Step 6a — Start the API server** (in VS Code terminal or PowerShell):
```powershell
cd C:\Users\91812\Desktop\couple-vault-api
node src/server.js
```
- Server started successfully on **port 3000**
- Minor `dotenv` circular dependency warning — non-critical, safe to ignore

**Step 6b — Run the tunnel** (in a separate PowerShell window):
```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run couple-vault
```
- Tunnel connected to Cloudflare edge nodes at `198.41.200.23` and `198.41.192.77` on port `7844`
- Status: **RUNNING** ✅

**Step 6c — Test the live URL:**
- Opened `https://couplvault.online` in browser
- Result: `Cannot GET /` — this is **expected and correct**
- Confirms: Domain resolves ✅, HTTPS works ✅, Tunnel routes correctly ✅, Server responds ✅
- The 404 is normal — Express API has no handler for root `/`; real routes are at `/api/auth/login`, `/api/files`, etc.

---

### Step 7: SSL/TLS Hardening

All settings configured in **Cloudflare Dashboard → couplvault.online → SSL/TLS**

#### SSL/TLS Encryption Mode
- **Path:** SSL/TLS → Overview → Configure
- **Changed from:** Full
- **Changed to:** Full (Strict) ✅
- Full (Strict) enforces certificate validation on the origin server

#### Always Use HTTPS
- **Path:** SSL/TLS → Edge Certificates → Always Use HTTPS
- **Status:** ON ✅
- Redirects all HTTP requests to HTTPS automatically

#### HTTP Strict Transport Security (HSTS)
- **Path:** SSL/TLS → Edge Certificates → Enable HSTS
- **Status:** ON ✅
- **Max-Age:** 12 months (31,536,000 seconds)
- **Include Subdomains:** Off
- **Preload:** Off
- Tells browsers to always use HTTPS for this domain for 1 year

#### Minimum TLS Version
- **Path:** SSL/TLS → Edge Certificates → Minimum TLS Version
- **Changed from:** TLS 1.0 (default)
- **Changed to:** TLS 1.2 ✅
- Blocks outdated and insecure TLS connections

#### TLS 1.3
- **Status:** ON ✅ (was already enabled)

#### Opportunistic Encryption
- **Status:** ON ✅ (was already enabled)

---

### Step 8: Security Settings

All configured in **Cloudflare Dashboard → Security → Settings**

#### Bot Fight Mode
- **Status:** ON ✅ (was already enabled by default)
- JS Detections: On
- Detects and challenges automated bot traffic

#### WAF Managed Rules
- **Status:** Not available on Free plan (requires Pro plan upgrade)
- Free plan still has basic DDoS protection, HTTP DDoS attack protection (always active), and Bot Fight Mode

#### Other Active Protections (Free Plan)
| Protection | Status |
|-----------|--------|
| HTTP DDoS attack protection | Always active ✅ |
| Network-layer DDoS protection | Always active ✅ |
| SSL/TLS DDoS protection | Always active ✅ |
| Bot Fight Mode | ON ✅ |
| Block AI Bots | ON ✅ |
| Browser Integrity Check | ON ✅ |

---

### 🔍 Code Audit — `src/utils/crypto.js`

> Audited on: **March 19, 2026** after Phase 5 completion

**⚠️ Issue Found:** `src/utils/crypto.js` contains a **stale/incorrect copy** of the files route code (same content as `src/routes/files.js` old version). It does **not** contain actual AES-GCM encryption/decryption logic.

**Impact:** The server currently works because `src/routes/files.js` imports `{ encrypt, decrypt }` from `../utils/crypto` — if `crypto.js` doesn't export those functions, uploads/downloads will fail at runtime.

**Action Required (Phase 6):** Replace `src/utils/crypto.js` with the correct AES-256-GCM encryption utility that exports `encrypt(buffer, keyVersion)` and `decrypt(ciphertext, iv, authTag, keyVersion)`.

**`src/routes/files.js` status:** ✅ Correct and up-to-date
- Uses `req.user.sub` (correct JWT claim)
- `parseInt(keyVersion, 10)` fixes applied
- Magic byte validation ✅
- MIME whitelist ✅
- Memory-only upload (never touches disk unencrypted) ✅
- Access logging ✅
- No-cache headers on file view ✅

---

## 📁 File Reference

| File | Path | Purpose |
|------|------|---------|
| config.yml | `C:\Users\91812\.cloudflared\config.yml` | Tunnel config — maps domain to localhost:3000 |
| cert.pem | `C:\Users\91812\.cloudflared\cert.pem` | Cloudflare login certificate |
| Tunnel credentials | `C:\Users\91812\.cloudflared\37a151ef-4999-4100-add1-1ecd7028af75.json` | Tunnel auth credentials — keep secret! |
| server.js | `C:\Users\91812\Desktop\couple-vault-api\src\server.js` | Main API server entry point |
| .env | `C:\Users\91812\Desktop\couple-vault-api\.env` | Environment variables |

---

## 🔧 Commands Reference

```powershell
# ─── SHORTCUT: Always use full path for cloudflared ───
$cf = "& 'C:\Program Files (x86)\cloudflared\cloudflared.exe'"

# ─── Login ───
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel login

# ─── Create tunnel ───
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel create couple-vault

# ─── Add DNS route ───
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel route dns couple-vault couplvault.online

# ─── List tunnels ───
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel list

# ─── Run tunnel ───
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run couple-vault

# ─── Start API server ───
cd C:\Users\91812\Desktop\couple-vault-api
node src/server.js

# ─── Install cloudflared (if needed again) ───
winget install --id Cloudflare.cloudflared --source winget
```

---

## ✅ Completion Checklist

### Phase 5 — Cloudflare Tunnel

- [x] Domain `couplvault.online` purchased on Hostinger
- [x] Cloudflare account created (`oldb70545@gmail.com`)
- [x] Domain added to Cloudflare (Free plan)
- [x] Cloudflare nameservers set in Hostinger
- [x] `cloudflared` installed (v2025.8.1) via winget
- [x] Logged into Cloudflare via `cloudflared tunnel login`
- [x] Tunnel `couple-vault` created (ID: `37a151ef-...`)
- [x] `config.yml` created pointing to `localhost:3000`
- [x] Old conflicting DNS records deleted
- [x] CNAME route added: `couplvault.online` → tunnel
- [x] API server started (`node src/server.js`)
- [x] Tunnel running and connecting to Cloudflare edge
- [x] `https://couplvault.online` live and reachable ✅
- [x] SSL/TLS set to Full (Strict)
- [x] Always Use HTTPS enabled
- [x] HSTS enabled (12 months)
- [x] Minimum TLS version set to 1.2
- [x] Bot Fight Mode confirmed ON
- [x] Basic DDoS protections active (Free plan)

### Pending / Future
- [ ] **PRIORITY:** Fix `src/utils/crypto.js` — replace with correct AES-256-GCM encrypt/decrypt utility
- [ ] Make tunnel auto-start on Windows boot (via Windows Service or Task Scheduler)
- [ ] Upgrade to Cloudflare Pro for WAF Managed Rules (optional)
- [ ] Wait for DNS full propagation (domain shows "Active" on Cloudflare)
- [ ] Add `www.couplvault.online` subdomain route if needed
- [ ] Set up rate limiting rules for auth endpoints

---

## 🤖 Handoff Prompt (for next Claude session)

```
Couple Vault — Continuing from Phase 5 (COMPLETE)

Project: C:\Users\91812\Desktop\couple-vault-api
Server: node src/server.js on port 3000
Live URL: https://couplvault.online ✅ (working)

Cloudflare:
- Account: oldb70545@gmail.com (Free plan)
- Domain: couplvault.online
- Tunnel name: couple-vault
- Tunnel ID: 37a151ef-4999-4100-add1-1ecd7028af75
- Config: C:\Users\91812\.cloudflared\config.yml
- cloudflared: C:\Program Files (x86)\cloudflared\cloudflared.exe

Phase 5 is 100% complete. All SSL/TLS hardening done.

⚠️ KNOWN ISSUE: src/utils/crypto.js has wrong content (stale copy of files route).
The actual AES-256-GCM encrypt/decrypt functions are missing — fix this in Phase 6.

To run the app:
1. cd C:\Users\91812\Desktop\couple-vault-api && node src/server.js
2. & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run couple-vault
3. Visit https://couplvault.online

What is Phase 6? (Suggest: fix crypto.js first, then end-to-end file upload test)

Rules: One command at a time, wait for "n" before next step.
```

---

*Document generated after completing Phase 5 of Couple Vault project.*

---

## 📱 Phase 6 — React Native Mobile App (Expo)

> Completed: March 19, 2026 — Phase 6 COMPLETE ✅
> Device tested: Realme P1 5G (Android) via Expo Go

### Project Location
- Backend API: C:\Users\91812\Desktop\valut\couple-vault-api
- Mobile App:  C:\Users\91812\Desktop\valut\couple-vault-app
- Live API:    https://couplvault.online
- GitHub:      https://github.com/subbu-2005/couple_valut

### App Structure
`
couple-vault-app/
  app/_layout.js       ← Root navigator + auth guard
  app/login.js         ← Login screen (POST /api/auth/login)
  app/home.js          ← File list (GET /api/files)
  app/upload.js        ← Upload (POST /api/files/upload)
  app/view.js          ← Viewer image/video/audio/PDF
  context/AuthContext.js ← SecureStore token management
  api/client.js        ← Axios + Bearer + auto-refresh on 401
`

### Security Implementation
- Tokens stored ONLY in expo-secure-store (never AsyncStorage)
- Auto-refresh on 401 with request queue (no race conditions)
- Logout deletes both tokens from secure store
- Bearer token auto-attached to every request via Axios interceptor

### Bugs Fixed During Phase 6
1. ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
   Cause: Cloudflare sets X-Forwarded-For, Express did not trust proxy
   Fix: Added app.set('trust proxy', 1) to server.js

2. Login always failed silently
   Cause: API returns access_token (snake_case), app read accessToken (camelCase)
   Fix: Updated AuthContext.js and api/client.js to use snake_case keys

3. ngrok tunnel unreliable
   Fix: Use npx expo start --lan (same WiFi network)

### How to Run Next Session
`
Terminal 1: cd C:\Users\91812\Desktop\valut\couple-vault-api && node src/server.js
Terminal 2: & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run couple-vault
Terminal 3: cd C:\Users\91812\Desktop\valut\couple-vault-app && npx expo start --lan
`
Phone must be on same WiFi as PC.

### Test Credentials
- partner1@vault.com / SecurePass2026!
- partner2@vault.com / SecurePass2026!

### Phase 6 Completion Checklist
- [x] Expo project initialized
- [x] All dependencies at correct SDK 54 versions
- [x] AuthContext.js with SecureStore
- [x] api/client.js with auto-refresh interceptor
- [x] Login screen — WORKING on Realme P1 ✅
- [x] Home screen built (pending full test)
- [x] Upload screen built (pending full test)
- [x] View screen built (pending full test)
- [x] trust proxy bug fixed
- [x] Token key mismatch fixed

*Phase 6 completed March 19, 2026.*
