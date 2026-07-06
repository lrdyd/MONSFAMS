# MONSFAMS Hosting Guide - Windows RDP + .my.id Domain

## Prerequisites
- Windows Server RDP (2016/2019/2022)
- Domain .my.id yang sudah pointing ke IP RDP
- Node.js terinstall

---

## Step 1: Install Node.js (jika belum)

Download dari https://nodejs.org/
```
Recommended: Node.js 18.x LTS atau 20.x LTS
```

---

## Step 2: Clone/Transfer Project ke RDP

**Option A: Clone dari GitHub**
```cmd
cd C:\
git clone https://github.com/lrdyd/MONSFAMS.git
cd MONSFAMS
cd server
npm install
```

**Option B: Copy Manual**
- Copy folder `MONSFAMS` ke RDP
- Buka CMD di folder `server`
- Jalankan: `npm install`

---

## Step 3: Konfigurasi Environment

Buka CMD di folder `server`, buat file `.env`:

```cmd
cd C:\MONSFAMS\server
notepad .env
```

Isi dengan:
```env
PORT=3000
ADMIN_ID=admin
ADMIN_PASSWORD=YOUR_SECURE_PASSWORD
PREMIUM_PASSWORD=YOUR_PREMIUM_PASSWORD
ALLOWED_ORIGINS=https://domain.my.id
```

---

## Step 4: Setup Nginx sebagai Reverse Proxy

### Download Nginx untuk Windows:
1. Download dari: https://nginx.org/en/download.html
2. Extract ke `C:\nginx`

### Konfigurasi Nginx:

Edit `C:\nginx\conf\nginx.conf`:

```nginx
worker_processes 1;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    # Buffer settings
    client_body_buffer_size 100M;
    client_max_body_size 100M;
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;

    upstream monsfams {
        server 127.0.0.1:3000;
    }

    server {
        listen 80;
        server_name domain.my.id;

        # Redirect HTTP to HTTPS (jika ada SSL)
        # return 301 https://$server_name$request_uri;

        location / {
            proxy_pass http://monsfams;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 86400;
        }

        # Static file caching
        location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
            proxy_pass http://monsfams;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }

        # Upload size limit
        client_max_body_size 500M;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

---

## Step 5: Setup SSL Certificate (Opsional tapi Direkomendasikan)

### Menggunakan Let's Encrypt (Certbot):

1. Download Certbot: https://certbot.eff.org/windows-choose
2. Jalankan sebagai Administrator:

```cmd
cd C:\certbot
certbot certonly --manual --preferred-challenges dns -d domain.my.id
```

3. Ikuti instruksi untuk verify domain

### Update Nginx dengan SSL:

```nginx
server {
    listen 443 ssl http2;
    server_name domain.my.id;

    ssl_certificate C:/certbot/live/domain.my.id/fullchain.pem;
    ssl_certificate_key C:/certbot/live/domain.my.id/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://monsfams;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name domain.my.id;
    return 301 https://$server_name$request_uri;
}
```

---

## Step 6: Setup PM2 untuk Auto-Restart

PM2 adalah process manager yang membuat server auto-start saat Windows booting.

### Install PM2 globally:
```cmd
npm install -g pm2
```

### Start server dengan PM2:
```cmd
cd C:\MONSFAMS\server
pm2 start server.js --name "MONSFAMS"
```

### Setup Auto-start saat Windows booting:
```cmd
pm2 startup
pm2 save
```

### Perintah PM2 berguna:
```cmd
pm2 list                  # Lihat semua process
pm2 logs MONSFAMS         # Lihat logs
pm2 restart MONSFAMS      # Restart server
pm2 stop MONSFAMS         # Stop server
pm2 delete MONSFAMS       # Hapus dari PM2
```

---

## Step 7: Setup Domain .my.id

### Di Panel Domain Provider (.my.id):

1. Login ke panel domain .my.id
2. Pilih domain Anda
3. Buka **DNS Management** atau **Record DNS**
4. Tambahkan record:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_RDP_IP | 300 |
| A | www | YOUR_RDP_IP | 300 |
| CNAME | * | domain.my.id | 300 |

5. Tunggu propagasi (biasanya 5-30 menit)

### Verify DNS:
Buka https://dnschecker.org dan cek domain Anda

---

## Step 8: Windows Firewall Setup

Buka **Windows Firewall** dan allow port:

```cmd
netsh advfirewall firewall add rule name="Nginx HTTP" dir=in action=allow protocol=tcp localport=80
netsh advfirewall firewall add rule name="Nginx HTTPS" dir=in action=allow protocol=tcp localport=443
```

---

## Step 9: Jalankan Semua Service

### Start Nginx:
```cmd
cd C:\nginx
nginx.exe
```

### Verify semua berjalan:
1. Buka browser → `http://domain.my.id` (harus muncul MONSFAMS)
2. Buka browser → `http://domain.my.id/admin.html` (harus muncul login)

---

## Step 10: Setup Auto-Start Semua Service

Buat file batch untuk auto-start:

**C:\start-services.bat:**
```batch
@echo off
echo Starting MONSFAMS Services...

:: Start PM2 processes
cd C:\MONSFAMS\server
call pm2 resurrect

:: Start Nginx
cd C:\nginx
start nginx.exe

echo All services started!
pause
```

### Buat Task Scheduler untuk auto-start:
1. Open **Task Scheduler** → Create Task
2. Name: `MONSFAMS Auto Start`
3. Trigger: `At startup`
4. Action: `Start a program` → browse ke `C:\start-services.bat`

---

## Troubleshooting

### Server tidak bisa diakses:
```cmd
netstat -ano | findstr :3000    # Check port 3000
netstat -ano | findstr :80       # Check port 80
```

### Nginx error:
```cmd
cd C:\nginx
nginx.exe -t    # Test configuration
```

### PM2 logs:
```cmd
pm2 logs MONSFAMS --lines 100
```

### Restart semua service:
```cmd
taskkill /F /IM nginx.exe
pm2 restart MONSFAMS
cd C:\nginx && nginx.exe
```

---

## Quick Commands Reference

```cmd
:: Start Server
cd C:\MONSFAMS\server
pm2 start server.js --name "MONSFAMS"

:: Start Nginx
cd C:\nginx
nginx.exe

:: Check Status
pm2 list
netstat -ano | findstr :3000

:: Restart
pm2 restart MONSFAMS
nginx.exe -s reload

:: Stop
pm2 stop MONSFAMS
nginx.exe -s stop
```

---

## Domain .my.id Setup Specific

Untuk domain .my.id (Indonesia), biasanya menggunakan:
- **Cloudflare** sebagai DNS management
- Atau **panel.domain.my.id** langsung dari provider

### Jika menggunakan Cloudflare:
1. Tambahkan domain di Cloudflare
2. Update nameserver domain .my.id ke Cloudflare
3. Di Cloudflare DNS, tambahkan:
   - A record `@` → RDP IP
   - CNAME `www` → domain.my.id

---

## Struktur Folder Final

```
C:\
├── MONSFAMS\
│   ├── server\
│   │   ├── .env
│   │   ├── server.js
│   │   ├── package.json
│   │   ├── uploads\
│   │   ├── stats\
│   │   ├── metadata\
│   │   └── node_modules\
│   ├── index.html
│   ├── admin.html
│   └── ...
├── nginx\
│   ├── conf\
│   │   └── nginx.conf
│   ├── nginx.exe
│   └── ...
└── start-services.bat
```

---

## Keamanan Tambahan

### Disable directory listing di nginx:
```nginx
location / {
    autoindex off;
}
```

### Setup Cloudflare Firewall Rules:
- Block negara tertentu jika perlu
- Enable "I'm Under Attack" mode jika ada attack

### Update .env secara berkala:
```env
ADMIN_PASSWORD=GANTI_PASSWORD_SECARA berkala
PREMIUM_PASSWORD=GANTI_PASSWORD_SECARA berkala
SESSION_SECRET=random_48_character_string
```

---

**Selamat! MONSFAMS Anda sudah online dengan domain .my.id!**
