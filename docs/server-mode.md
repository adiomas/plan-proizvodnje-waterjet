# Server Mode — Pokretanje i daljinsko upravljanje

Dokumentacija za pokretanje Next.js servera u različitim načinima rada s opcijama za daljinsko upravljanje i spawn konfiguraciju.

## Načini rada (Server Modes)

### Development Mode

```bash
npm run dev
```

- Pokreće Next.js dev server na `http://localhost:3000`
- Hot Module Replacement (HMR) omogućen
- Detaljno logiranje grešaka u pregledniku i terminalu
- **Nije prikladan za produkciju**

### Production Mode

```bash
npm run build && npm start
```

- Optimizirani build s minimiziranim JS/CSS bundle-ovima
- Server-side rendering (SSR) s cachingom
- Service Worker aktivan za offline podršku (PWA)

---

## Opcije za spawn procesa

### Osnovne varijable okoline

| Varijabla | Opis | Zadana vrijednost |
|-----------|------|-------------------|
| `PORT` | Port na kojem server sluša | `3000` |
| `HOSTNAME` | Adresa na koju se server veže | `localhost` |
| `NODE_ENV` | Način rada (`development` / `production`) | `development` |

### Primjeri pokretanja

**Spawn na prilagođenom portu:**
```bash
PORT=8080 npm start
```

**Spawn dostupan na svim mrežnim sučeljima (daljinski pristup):**
```bash
HOSTNAME=0.0.0.0 PORT=3000 npm start
```

**Spawn u development modu na prilagođenoj adresi:**
```bash
npx next dev --hostname 0.0.0.0 --port 8080
```

### Spawn s Turbopackom (brži development)

```bash
npx next dev --turbopack --hostname 0.0.0.0 --port 3000
```

---

## Daljinsko upravljanje (Remote Control)

### Pristup s udaljenih uređaja

1. **Pokrenite server na svim sučeljima:**
   ```bash
   HOSTNAME=0.0.0.0 npm start
   ```

2. **Pronađite IP adresu servera:**
   ```bash
   hostname -I | awk '{print $1}'
   ```

3. **Pristupite s udaljenog uređaja:**
   ```
   http://<server-ip>:3000
   ```

### Supabase konfiguracija za daljinski pristup

Prilikom daljinskog pristupa osigurajte da su Supabase varijable postavljene:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://pgrgbfsltlcqzootkuaa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<vaš-anon-ključ>
```

Ove varijable moraju biti dostupne i na klijentskoj i na serverskoj strani.

### Autentifikacija pri daljinskom pristupu

- Middleware (`middleware.ts`) automatski upravlja sesijama neovisno o izvoru zahtjeva
- Supabase Auth podržava pristup s bilo koje domene konfigurirane u Supabase dashboard postavkama
- Za pristup s vanjskih domena dodajte ih u **Supabase → Authentication → URL Configuration → Redirect URLs**

---

## Spawn u kontejnerima (Docker)

### Osnovna Docker konfiguracija

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

> **Napomena:** Za standalone output dodajte `output: 'standalone'` u `next.config.ts`.

### Docker Compose s daljinskim pristupom

```yaml
services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - HOSTNAME=0.0.0.0
      - PORT=3000
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    restart: unless-stopped
```

---

## Process Manager — spawn s nadzorom

### PM2

```bash
# Instalacija
npm install -g pm2

# Spawn u produkcijskom načinu
pm2 start npm --name "plan-proizvodnje" -- start

# Spawn s konfiguracijskim parametrima
pm2 start ecosystem.config.js
```

**Primjer `ecosystem.config.js`:**

```js
module.exports = {
  apps: [{
    name: "plan-proizvodnje",
    script: "npm",
    args: "start",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      HOSTNAME: "0.0.0.0"
    },
    instances: "max",        // spawn po jednu instancu za svaki CPU core
    exec_mode: "cluster",    // cluster način za load balancing
    watch: false,
    max_memory_restart: "500M"
  }]
};
```

### PM2 daljinsko upravljanje

```bash
# Status svih procesa
pm2 status

# Restart s udaljenog uređaja putem SSH
ssh korisnik@server "pm2 restart plan-proizvodnje"

# Logovi u stvarnom vremenu
pm2 logs plan-proizvodnje --lines 50
```

---

## Spawn više instanci (horizontalno skaliranje)

### Cluster Mode

Next.js podržava pokretanje više radnih procesa (worker spawn):

```bash
# Spawn 4 radna procesa
pm2 start npm --name "plan-proizvodnje" -i 4 -- start
```

### Iza reverse proxyja (Nginx)

```nginx
upstream plan_proizvodnje {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name plan.example.com;

    location / {
        proxy_pass http://plan_proizvodnje;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## PWA i Service Worker pri daljinskom pristupu

- Service Worker (`public/sw.js`) automatski se registrira neovisno o tome pristupa li se aplikaciji lokalno ili daljinski
- Za HTTPS (obavezan za SW na produkciji) koristite reverse proxy s TLS certifikatom
- `next.config.ts` već konfigurira potrebne zaglavlja za Service Worker:
  ```
  Cache-Control: public, max-age=0, must-revalidate
  Service-Worker-Allowed: /
  ```

---

## Sigurnosne preporuke za daljinski pristup

1. **Nikada ne izlažite dev server** (`npm run dev`) na javnu mrežu
2. **Koristite HTTPS** za sve produkcijske deploymente s daljinskim pristupom
3. **Ograničite pristup** vatrozidom — dozvolite samo potrebne portove
4. **Postavite `HOSTNAME`** na specifičnu IP adresu umjesto `0.0.0.0` ako je moguće
5. **Redovito ažurirajte** ovisnosti (`npm audit`)
