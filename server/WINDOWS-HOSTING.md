# MONSFAMS Windows Hosting Setup

## Quick Install (One-Click)

1. **Download & Extract** repository ke RDP
2. **Run as Administrator**: `setup-hosting.bat`
3. Ikuti instruksi di layar
4. Selesai!

---

## File yang Dibutuhkan

| File | Fungsi |
|------|--------|
| `setup-hosting.bat` | Installer otomatis (jalankan sebagai Admin) |
| `start.bat` | Control panel untuk start/stop/restart |
| `setup-ssl.bat` | Setup SSL certificate |
| `nginx.conf` | Konfigurasi Nginx reverse proxy |

---

## Langkah-Langkah Manual

### 1. Install Dependencies

```cmd
:: Install Node.js
# Download dari https://nodejs.org/

:: Install Git
# Download dari https://git-scm.com/

:: Install PM2
npm install -g pm2
```

### 2. Clone & Setup

```cmd
cd C:\
git clone https://github.com/lrdyd/MONSFAMS.git
cd MONSFAMS\server
npm install
```

### 3. Buat .env

```cmd
notepad .env
```

```env
PORT=3000
ADMIN_ID=admin
ADMIN_PASSWORD=YOUR_SECURE_PASSWORD
PREMIUM_PASSWORD=YOUR_PREMIUM_PASSWORD
ALLOWED_ORIGINS=https://your-domain.my.id
```

### 4. Download Nginx

1. Download: https://nginx.org/en/download.html
2. Extract ke `C:\nginx`
3. Copy `nginx.conf` ke `C:\nginx\conf\`

### 5. Setup Domain DNS

Di panel domain .my.id:

| Type | Name | Value |
|------|------|-------|
| A | @ | IP_RDP_KALIAN |
| A | * | IP_RDP_KALIAN |

### 6. Jalankan

```cmd
:: Terminal 1 - Start App
cd C:\MONSFAMS\server
pm2 start server.js --name "MONSFAMS"
pm2 save
pm2 startup

:: Terminal 2 - Start Nginx
cd C:\nginx
nginx.exe
```

### 7. Buka Browser

```
http://your-domain.my.id
http://your-domain.my.id/admin.html
```

---

## Control Panel

Jalankan `start.bat` untuk control panel interaktif:

```
╔══════════════════════════════════════════╗
║  MONSFAMS Control Panel                  ║
╠══════════════════════════════════════════╣
║  [1] Start MONSFAMS                      ║
║  [2] Stop MONSFAMS                       ║
║  [3] Restart MONSFAMS                    ║
║  [4] View Logs                           ║
║  [5] Check Status                        ║
║  [6] Setup SSL Certificate               ║
║  [7] Open in Browser                     ║
║  [8] Open Admin Panel                    ║
║  [0] Exit                               ║
╚══════════════════════════════════════════╝
```

---

## Setup SSL (HTTPS)

1. Pastikan DNS sudah pointing ke server
2. Jalankan `setup-ssl.bat` sebagai Admin
3. Ikuti instruksi Certbot
4. Update `nginx.conf` - uncomment HTTPS server block
5. Restart Nginx: `nginx.exe -s reload`

---

## Troubleshooting

### Port sudah digunakan
```cmd
netstat -ano | findstr ":3000"
taskkill /PID <PID> /F
```

### Nginx error
```cmd
cd C:\nginx
nginx.exe -t
```

### PM2 error
```cmd
cd C:\MONSFAMS\server
pm2 restart MONSFAMS
pm2 logs MONSFAMS
```

### Check if running
```cmd
pm2 list
netstat -ano | findstr "3000"
```

---

## Default Credentials

```
Admin ID:     admin
Admin Pass:    (yang kalian masukkan saat setup)
Premium Pass:  (yang kalian masukkan saat setup)
```

---

## Auto-Start Saat Boot

Installer sudah otomatis menambahkan ke Windows startup.
Untuk setup manual:

```cmd
pm2 startup
pm2 save
```

---

## Struktur Folder

```
C:\
├── MONSFAMS\
│   ├── server\
│   │   ├── .env
│   │   ├── server.js
│   │   ├── package.json
│   │   ├── public\
│   │   ├── uploads\
│   │   ├── setup-hosting.bat
│   │   ├── setup-ssl.bat
│   │   ├── start.bat
│   │   └── nginx.conf
│   └── ...
├── nginx\
│   ├── conf\
│   ├── nginx.exe
│   └── ...
└── Certbot\ (setelah SSL)
```

---

## Port yang Digunakan

| Port | Service |
|------|---------|
| 80 | HTTP (Nginx) |
| 443 | HTTPS (Nginx) |
| 3000 | Node.js App |

Pastikan port ini di-open di Windows Firewall.

---

## Keamanan

- Ganti password default setelah install
- Setup SSL untuk HTTPS
- Jangan simpan credentials di tempat publik
- Update dependencies secara berkala:
  ```cmd
  cd C:\MONSFAMS\server
  npm update
  ```

---

**Butuh bantuan?** Buat issue di https://github.com/lrdyd/MONSFAMS
