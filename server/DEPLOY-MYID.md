# 🎮 Deploy MONSFAMS ke Domain .my.id

Panduan deploy ke subdomain gratis `.my.id`

## 📋 Apa itu .my.id?

`.my.id` adalah subdomain gratis dari **Freenom** atau subdomain dari registrar seperti:
- **Freenom World** (freenom.com) - `.tk`, `.ml`, `.ga`, `.cf`, `.gq`
- **Myanmar .id** - subdomain gratis
- **Indonesia .id** - subdomain dari PANDI

## 🆓 Setup Domain .my.id Gratis

### 1. Freenom (freenom.com)

1. Buka [freenom.com](https://www.freenom.com)
2. Daftar/Register
3. Pilih domain: `monsfams.tk`, `monsfams.ml`, dll
4. Ganti nameserver ke hosting provider

### 2. Setup di Railway (Recommended)

Railway support custom domain termasuk `.my.id`:

```bash
# 1. Daftar railway.app
# 2. Deploy dari GitHub
# 3. Settings → Networking → Custom Domains
# 4. Add Domain: download.monsfams.my.id
# 5. Railway akan kasih record DNS:
```

Di Freenom DNS:
```
Type    Name              Value
TXT     download          (verification code Railway)
CNAME   download          (Railway Provided)
```

### 3. Setup di Render

1. Deploy ke render.com
2. Settings → Custom Domains
3. Add: `download.monsfams.my.id`
4. Setup DNS sesuai instruksi Render

---

## 🚀 Deploy dengan Cloudflare (Gratis)

Cloudflare Workers + Pages bisa host Node.js app + domain .my.id

### Langkah 1: Daftar Cloudflare

1. Buka [cloudflare.com](https://cloudflare.com)
2. Tambah domain `.my.id` kamu
3. Update nameserver di Freenom ke Cloudflare

### Langkah 2: Deploy ke Cloudflare Workers

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Deploy
wrangler deploy
```

### Langkah 3: Setup .my.id Domain

Di Cloudflare Dashboard → DNS:
```
Type    Name        Value
A       download   192.0.2.1  (IP worker)
CNAME   *          your-worker.workers.dev
```

---

## 🌐 Deploy ke VPS + Domain .my.id

### Langkah 1: Sewa VPS

Rekomendasi:
- **Oracle Cloud** - Always Free (2 instance)
- **Google Cloud** - Free Tier
- **AWS** - Free Tier 12 bulan
- **Vultr** - $5/bulan

### Langkah 2: Setup VPS

```bash
# Login SSH
ssh root@IP_VPS

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install PM2
npm install -g pm2

# Buat user
adduser monsfams
usermod -aG sudo monsfams

# Login sebagai user
su - monsfams

# Clone repo
git clone https://github.com/USERNAME/REPO.git
cd REPO/server

# Install
npm install

# Start dengan PM2
pm2 start server.js --name monsfams
pm2 save
pm2 startup
```

### Langkah 3: Setup Nginx + SSL

```bash
# Install Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Buat config
sudo nano /etc/nginx/sites-available/monsfams
```

Isi dengan:
```nginx
server {
    listen 80;
    server_name download.monsfams.my.id;

    client_max_body_size 500M;
    proxy_buffering off;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/monsfams /etc/nginx/sites-enabled/

# Test & restart
sudo nginx -t
sudo systemctl restart nginx

# SSL Certificate
sudo certbot --nginx -d download.monsfams.my.id
```

### Langkah 4: Setup DNS .my.id

Di Freenom atau registrar .my.id kamu:

```
Type    Name         Value
A       @           IP_VPS_KAMU
A       download     IP_VPS_KAMU
CNAME   www         @
```

### Langkah 5: Test

Buka browser: `https://download.monsfams.my.id`

---

## 📱 Deploy ke Railway (Step by Step)

### 1. Persiapan

```bash
# 1. Buat folder server
cd webdc
mkdir -p server
mv server/* server/

# 2. Buat GitHub repo
# 3. Push ke GitHub
git init
git add .
git commit -m "MONSFAMS Server"
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

### 2. Deploy ke Railway

```
1. Buka https://railway.app
2. Login dengan GitHub
3. New Project → Deploy from GitHub repo
4. Pilih repo monsfams
5. Railway auto-detect Node.js
6. Add Variables:
   - ADMIN_PASSWORD = MONSFAMS
   - MAX_FILE_SIZE = 524288000
```

### 3. Setup Domain .my.id

```
1. Railway Dashboard → Project → Settings
2. Networking → Custom Domains
3. Add Custom Domain
4. Masukkan: download.monsfams.my.id
5. Copy verification code
```

Di Freenom DNS:
```
Type    Name         Value
TXT     _acme-challenge.download    (paste verification code)
```

6. Tunggu verifikasi
7. Railway akan kasih CNAME/AAAA record
8. Tambahkan ke DNS

### 4. Selesai!

```
🌐 URL: https://download.monsfams.my.id
🔐 Admin: https://download.monsfams.my.id/admin.html
```

---

## 🔧 Troubleshooting .my.id

### Domain tidak resolve?

```bash
# Check DNS propagation
nslookup download.monsfams.my.id

# Flush DNS cache
# Windows:
ipconfig /flushdns

# Mac:
sudo dscacheutil -flushcache

# Linux:
sudo systemd-resolve --flush-caches
```

### SSL Certificate Error?

```bash
# Tunggu propagasi DNS (bisa sampe 48 jam)
# Atau gunakan Cloudflare DNS
```

### Nameserver tidak update?

Di Freenom:
```
1. Login ke freenom.com
2. Services → My Domains
3. Manage Domain → Management Tools → Nameservers
4. Pilih "Use custom nameservers"
5. Masukkan ns1-cloudflare.com, ns2-cloudflare.com
```

---

## 📊 Update Frontend URL

Edit `server/public/free-executor.html`:

```javascript
// Ganti dengan URL kamu
const SERVER_URL = localStorage.getItem('serverUrl') || 
  'https://download.monsfams.my.id';
```

Atau di admin panel, isi server URL saat pertama kali connect.

---

## 💰 Estimasi Biaya

| Opsi | Biaya | Catatan |
|------|-------|---------|
| Railway | Gratis | 500MB bandwidth/bulan |
| Render | Gratis | 100GB bandwidth/bulan |
| Oracle Cloud | Gratis | Always free tier |
| VPS $5 | $5/bulan | Unlimited bandwidth |

---

## ✅ Checklist Deployment

- [ ] GitHub repo sudah dibuat
- [ ] Server sudah di-push
- [ ] Railway/Render connected
- [ ] Domain .my.id sudah didaftarkan
- [ ] DNS sudah di-pointing
- [ ] SSL certificate aktif
- [ ] Admin panel bisa diakses
- [ ] File bisa diupload
- [ ] File bisa didownload
- [ ] Password admin sudah diganti

---

## 🆘 Butuh Bantuan?

### Freenom Issues:
- Freenom sering slow/timeout → Gunakan VPN
- Domain expired → Perpanjang manual
- Cannot login → Reset password

### Railway Issues:
- Build failed → Check logs
- Deploy stuck → Redeploy
- Domain pending → Tunggu 1-24 jam

### DNS Issues:
- Propagation → 24-48 jam
- Wrong record → Hapus & re-add
- Not resolving → Flush DNS cache
