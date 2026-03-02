# Raspberry Pi Setup Guide

This guide covers running the full LegoFinder stack (backend + frontend) on a Raspberry Pi, with auto-start on boot and Nginx as a reverse proxy.

## Tested on
- Raspberry Pi 4 (2 GB+)
- Raspberry Pi OS Lite (64-bit, Bookworm)

---

## 1. Initial Pi configuration

Flash Raspberry Pi OS to your SD card using [Raspberry Pi Imager](https://www.raspberrypi.com/software/). In the imager settings, enable SSH and set your username/password before flashing.

SSH into the Pi (replace `<username>` with the username you set in the imager):

```bash
ssh <username>@<pi-ip-address>
```

Update the system:

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 2. Install Node.js

Install Node.js 20 via NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x.x
```

---

## 3. Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

## 4. Deploy the app

### Clone the repo

```bash
cd ~
git clone https://github.com/enniob/brickfinder.git legoFinder
cd legoFinder
```

### Set up the server

```bash
cd server
npm install
npm run build
```

Create the environment file:

```bash
cp .env.example .env
nano .env
```

Fill in your keys:

```
REBRICKABLE_API_KEY=your_rebrickable_key_here
PORT=3000
```

### Build the frontend

```bash
cd ../app
npm install
```

Create the app environment file pointing to the Pi's IP (or domain if you have one):

```bash
nano .env
```

```
VITE_API_URL=http://<pi-ip-address>
```

> If you set up a domain or use `localhost` via Nginx, set this to `http://<pi-ip-address>` or `http://yourdomain.com`.

Build the static files:

```bash
npm run build
```

The output goes to `app/dist/`.

---

## 5. Configure Nginx

Create a new Nginx site config:

```bash
sudo nano /etc/nginx/sites-available/legofinder
```

Paste the following (replace `<pi-ip-address>` with your Pi's actual IP or hostname):

```nginx
server {
    listen 80;
    server_name <pi-ip-address>;

    # Serve the React frontend — replace <username> with your Pi username
    root /home/<username>/legoFinder/app/dist;
    index index.html;

    # SPA fallback — all unknown routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to the Node.js server
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Allow large image uploads
        client_max_body_size 20M;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/legofinder /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Fix Nginx permissions

Nginx runs as `www-data` and needs execute permission on your home directory to traverse it:

```bash
chmod o+x /home/<username>
```

> Without this, Nginx will log `Permission denied` and serve a blank page even though the files exist.

---

## 6. Auto-start with systemd

Create a systemd service for the backend:

```bash
sudo nano /etc/systemd/system/legofinder.service
```

Replace `<username>` with your Pi username (e.g. `ennio`):

```ini
[Unit]
Description=LegoFinder API Server
After=network.target

[Service]
Type=simple
User=<username>
WorkingDirectory=/home/<username>/legoFinder/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable legofinder
sudo systemctl start legofinder
```

Check it's running:

```bash
sudo systemctl status legofinder
```

---

## 7. Verify

Open a browser on your phone or computer (on the same network) and go to:

```
http://<pi-ip-address>
```

You should see the LegoFinder home screen.

To check the API is responding:

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

---

## Useful commands

| Command | Description |
|---------|-------------|
| `sudo systemctl status legofinder` | Check server status |
| `sudo systemctl restart legofinder` | Restart after a code change |
| `sudo journalctl -u legofinder -f` | Tail server logs |
| `sudo systemctl reload nginx` | Reload Nginx config |
| `sudo nginx -t` | Test Nginx config for syntax errors |

---

## Updating the app

```bash
cd ~/legoFinder
git pull

# Rebuild server
cd server && npm install && npm run build
sudo systemctl restart legofinder

# Rebuild frontend
cd ../app && npm install && npm run build
```

Nginx serves the frontend as static files from `app/dist/`, so no reload is needed after a frontend rebuild.
