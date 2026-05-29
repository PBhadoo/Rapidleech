# Let's Encrypt IP-Address SSL Certificate on Apache (EC2) — Runbook

A repeatable procedure for issuing a **bare-IP** TLS certificate from Let's Encrypt
and serving it from Apache, even when a domain vhost is already running on the box.

> Replace `PUBLIC_IP` with your server's **public** IP (e.g. `3.1.2.3`) everywhere below.
> On EC2 this is the Elastic/public IPv4 — **not** the private `172.x` address shown in the hostname.

---

## Key facts to remember

- IP certs are generally available from Let's Encrypt since Jan 2026.
- They are **short-lived: ~160 hours (just over 6 days)**. Renewal MUST be automated.
- Profile must be `shortlived`. DNS challenge does NOT work — only `http-01` / `tls-alpn-01`.
- You need **Certbot >= 5.4** (the `--ip-address` flag + webroot support). Ubuntu's apt
  certbot is too old and will reject bare IPs with "will not issue certificates for a
  bare IP address" — that error means *old certbot*, not a real policy block.
- The Apache/nginx **authenticator plugins do NOT support IP certs**
  ("Apache authenticator not supported for IP address certificates").
  Use `--webroot` or `--standalone` instead.

---

## Step 0 — Prerequisites (check before starting)

```bash
# Port 80 must be reachable from the public internet for the http-01 challenge.
# In the EC2 Security Group: allow inbound TCP 80 from 0.0.0.0/0 (at least during issuance).

# Confirm the server actually answers on port 80:
curl -I http://PUBLIC_IP/

# See what is already listening on 80 (Apache will be):
sudo ss -ltnp | grep ':80'
```

If a forced HTTP→HTTPS redirect exists in Apache, make sure it does NOT swallow
`/.well-known/acme-challenge/`. Add an exception in the `:80` vhost if needed:

```apache
RewriteEngine On
RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
```

---

## Step 1 — Install / verify Certbot >= 5.4

```bash
certbot --version          # if this is < 5.4, replace it (below)
which certbot
```

If too old, purge the apt version and install the snap build:

```bash
sudo apt-get remove --purge certbot python3-certbot-apache python3-certbot-nginx -y
sudo apt-get autoremove -y

sudo snap install core && sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
hash -r                    # clear shell's cached path to the old certbot

certbot --version          # MUST now show 5.4+ (we used 5.6.0)
which certbot              # should be /usr/bin/certbot -> snap
```

---

## Step 2 — Issue the certificate (webroot method)

Apache keeps port 80; certbot drops the challenge file into the document root.
Run it as a **single line** (multi-line pastes can get mangled by interactive prompts):

```bash
sudo certbot certonly --preferred-profile shortlived --webroot --webroot-path /var/www/html --ip-address PUBLIC_IP
```

- Use your real Apache DocumentRoot if not `/var/www/html`
  (`grep -ri documentroot /etc/apache2/sites-enabled/`).
- A correct certbot goes straight to `Requesting a certificate for PUBLIC_IP`.
  If it instead asks you to "enter the domain name(s)", the old binary is still on PATH.

Test against staging first if you want to avoid burning rate limits — add `--staging`
(gives an untrusted cert just to confirm the flow), then re-run without it.

Cert lands in:
```
/etc/letsencrypt/live/PUBLIC_IP/fullchain.pem
/etc/letsencrypt/live/PUBLIC_IP/privkey.pem
```

**Alternative if port 80 is free / no web server:** use `--standalone` instead of
`--webroot --webroot-path ...`. Or stop Apache briefly:
`sudo systemctl stop apache2` → run with `--standalone` → `sudo systemctl start apache2`.

---

## Step 3 — Apache vhost for the IP (the part that bites you)

`certonly` does NOT install the cert. You add a vhost manually. Two non-obvious traps:

1. A bare-IP HTTPS connection sends **no SNI**, so Apache serves its **default `*:443`
   vhost** — which is whatever loads first alphabetically from `sites-enabled`. If your
   domain vhost (`000-default-le-ssl.conf`) loads first, it wins and the browser shows
   *"its security certificate is from <your-domain>"*.
2. Binding the vhost to the literal public IP (`<VirtualHost PUBLIC_IP:443>`) **fails on
   EC2** — the NIC only holds the private IP, the public IP is NAT'd, so the vhost matches
   nothing and Apache silently falls back to the domain cert.

**Fix:** use a `*:443` wildcard vhost, and name the file so it sorts FIRST.

Create `/etc/apache2/sites-available/000-aaa-ip-ssl.conf`:

```apache
<VirtualHost *:443>
    ServerName PUBLIC_IP
    SSLEngine on
    SSLCertificateFile      /etc/letsencrypt/live/PUBLIC_IP/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/PUBLIC_IP/privkey.pem
    DocumentRoot /var/www/html
</VirtualHost>
```

Enable and reload:

```bash
sudo a2ensite 000-aaa-ip-ssl.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

The `000-aaa-` prefix sorts ahead of `000-default-le-ssl.conf`, making the IP vhost the
default `*:443` server (served when there's no SNI). The domain still matches by SNI.

---

## Step 4 — Verify ordering and certs

```bash
# The *:443 "default server" line MUST point to 000-aaa-ip-ssl.conf:
sudo apache2ctl -S

# Bare IP (no SNI) -> should be the IP cert:
echo | openssl s_client -connect PUBLIC_IP:443 2>/dev/null | openssl x509 -noout -subject
#   expect: subject=CN = PUBLIC_IP

# Domain via SNI -> should still be the domain cert:
echo | openssl s_client -connect PUBLIC_IP:443 -servername YOUR_DOMAIN 2>/dev/null | openssl x509 -noout -subject
#   expect: subject=CN = YOUR_DOMAIN
```

If `apache2ctl -S` shows the IP vhost as default but openssl still shows the domain,
re-check the filename actually sorts first and that `a2ensite` created the symlink
(`ls -la /etc/apache2/sites-enabled/ | grep ip-ssl`).

---

## Step 5 — Automate renewal (CRITICAL — cert dies in ~6 days)

Certbot renews the files in the background but does NOT reload Apache, so Apache keeps
serving the old cert until something reloads it. Without this hook, the domain cert
reappears on the bare IP in ~6 days and the browser warning returns.

```bash
echo '#!/bin/sh
systemctl reload apache2' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-apache.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-apache.sh

# Confirm the whole renewal path works:
sudo certbot renew --dry-run

# Confirm the timer is active:
sudo systemctl status snap.certbot.renew.timer
```

The default timer runs twice daily, which covers a 6-day cert comfortably.

---

## Quick troubleshooting reference

| Symptom | Cause | Fix |
|---|---|---|
| `will not issue certificates for a bare IP address` | Certbot too old | Install certbot 5.4+ via snap, `hash -r` |
| `unrecognized arguments: --ip-address` | Old certbot on PATH | `which certbot`, re-link snap build |
| `Apache authenticator not supported for IP address certificates` | Used `--apache`/`--nginx` | Use `--webroot` or `--standalone` |
| `Could not bind TCP port 80` | Apache already on 80 | Use `--webroot`, or stop Apache for `--standalone` |
| Browser shows domain cert on the IP | No-SNI default vhost is the domain | Name IP vhost `000-aaa-...` so it sorts first |
| Literal-IP vhost serves nothing on EC2 | Public IP is NAT'd, not on NIC | Use `<VirtualHost *:443>`, not `<VirtualHost PUBLIC_IP:443>` |
| Cert reverts to domain after ~6 days | No reload hook on renewal | Add deploy hook to reload Apache |

---

## TL;DR one-shot (after certbot 5.4+ is installed)

```bash
sudo certbot certonly --preferred-profile shortlived --webroot --webroot-path /var/www/html --ip-address PUBLIC_IP

sudo tee /etc/apache2/sites-available/000-aaa-ip-ssl.conf >/dev/null <<EOF
<VirtualHost *:443>
    ServerName PUBLIC_IP
    SSLEngine on
    SSLCertificateFile      /etc/letsencrypt/live/PUBLIC_IP/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/PUBLIC_IP/privkey.pem
    DocumentRoot /var/www/html
</VirtualHost>
EOF

sudo a2ensite 000-aaa-ip-ssl.conf
sudo apache2ctl configtest && sudo systemctl reload apache2

echo '#!/bin/sh
systemctl reload apache2' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-apache.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-apache.sh
sudo certbot renew --dry-run
```