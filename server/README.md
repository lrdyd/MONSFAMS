# 🎮 MONSFAMS Download Platform

Platform download untuk file executor dengan admin panel dan storage besar.

## 📁 Struktur Folder

```
server/
├── package.json        # Dependencies
├── server.js           # Express server
├── admin.html          # Admin panel (upload/manage files)
├── public/             # Frontend public
│   ├── index.html
│   ├── free-executor.html
│   └── premium-download.html
├── uploads/            # File storage (gitignored)
│   ├── free/
│   └── premium/
├── .env.example        # Environment template
├── setup.sh            # Linux/Mac setup script
├── setup.bat           # Windows setup script
├── DEPLOY-.ID.md       # Deployment guide untuk .id domain
├── .gitignore
└── README.md
```

## 🚀 Quick Start

### Windows
```bash
setup.bat
```

### Linux/Mac
```bash
chmod +x setup.sh
./setup.sh
```

### Manual
```bash
npm install
npm start
```

Buka browser: `http://localhost:3000`

## 🔐 Akses Default

| Halaman | URL | Password |
|---------|-----|---------|
| Admin Panel | `http://localhost:3000/admin.html` | `MONSFAMS` |
| Free Files | `http://localhost:3000/free-executor.html` | - |
| Premium | `http://localhost:3000/premium-download.html` | - |

## ⚙️ Konfigurasi

### Environment Variables

Buat file `.env` atau edit `.env.example`:

```env
PORT=3000
ADMIN_PASSWORD=YOUR_SECURE_PASSWORD
MAX_FILE_SIZE=524288000
ALLOWED_ORIGINS=https://download.yourdomain.id
```

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `PORT` | 3000 | Port server |
| `ADMIN_PASSWORD` | MONSFAMS | Password admin panel |
| `PREMIUM_PASSWORD` | MONSFAMS | Password akses premium user |
| `MAX_FILE_SIZE` | 0 (Unlimited) | Max file size (0 = tanpa batas) |
| `ALLOWED_ORIGINS` | * | CORS origins |

## 📡 API Endpoints

### Public (No Auth)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/files/:type` | List files (free/premium) |
| GET | `/download/:type/:file` | Download file |
| GET | `/api/health` | Health check |

### Admin (Auth Required)

Header: `x-admin-password: YOUR_PASSWORD`

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/upload/:type` | Upload single file |
| POST | `/api/upload-multiple/:type` | Upload multiple files |
| DELETE | `/api/files/:type/:filename` | Delete single file |
| DELETE | `/api/files/:type` | Delete all files of type |
| GET | `/api/stats` | Storage statistics |
| POST | `/api/verify` | Verify password |

## 🌐 Deploy ke Domain .my.id

Lihat `DEPLOY-MYID.md` untuk panduan deploy ke subdomain `.my.id`:

### Opsi Hosting:

1. **Railway** - Recommended (free tier, custom domain)
2. **Render** - Free tier available
3. **VPS + Nginx** - Full control
4. **Oracle Cloud** - Always free

### DNS Setup (.my.id Domain):

```
Type    Host          Value
A       @            IP_SERVER_VPS
A       download     IP_SERVER_VPS
CNAME   www          @
```

### Contoh URL:

```
🌐 https://download.monsfams.my.id
🔐 https://download.monsfams.my.id/admin.html
```

Lihat `DEPLOY-MYID.md` untuk panduan step-by-step!

## 🔒 Security

- [ ] Ganti password default
- [ ] Enable HTTPS/SSL
- [ ] Setup firewall
- [ ] Regular backup
- [ ] Enable rate limiting

## 📦 Update Files di Server

### Upload via Admin Panel:
1. Buka `admin.html`
2. Login dengan password
3. Pilih tab Free/Premium
4. Upload file

### Upload via API:
```bash
curl -X POST http://localhost:3000/api/upload/free \
  -H "x-admin-password: MONSFAMS" \
  -F "file=@/path/to/file.apk" \
  -F "name=Custom Name"
```

## 🛠️ Troubleshooting

### Server tidak start?
```bash
npm install
npm start
```

### Port already in use?
```bash
PORT=3001 npm start
```

### File too large?
Update `MAX_FILE_SIZE` di `.env`

## 📝 License

MIT License - Bebas digunakan untuk project apapun.
