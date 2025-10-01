# Coba — Cloudflare Workers serverless tunnel

Ringkas, cepat, dan siap dipakai untuk menyiarkan daftar VLESS/Trojan/Shadowsocks dengan filter, subscription, dan auto-update ke KV.

## Fitur
- Split protocol: vless, trojan, ss
- Reverse proxy (opsional)
- Subscription API dengan filter: cc, vpn, port, domain, limit
- UI minimalis + pagination
- Auto-update KV: Cloudflare Cron atau GitHub Actions

## Endpoint
- `/` — halaman utama
- `/sub/:page` — daftar dengan pagination
- `/api/v1/sub?format=clash&cc=ID,SG&vpn=vless,trojan,ss&limit=50`
- `/rp/...` — reverse proxy (opsional)
- `/_cron` — handler cron (Cloudflare Triggers)

## Deploy cepat
1. Buat service Workers: `coba`.
2. Buat KV namespace, salin `id` ke wrangler.toml.
3. Isi ENV minimal:
   - DEFAULT_CC: `ID,SG`
   - DEFAULT_LIMIT: `50`
4. Deploy dan cek `/` serta `/sub/1`.

## Sumber data
- Jika `PROXY_BANK_URL` diisi, worker menarik data dari URL (txt/JSON).
- Jika kosong, worker membaca dari KV key `proxyList`.
- Jika KV juga kosong, worker menggunakan fallback demo.

## Auto-update opsi A: Cloudflare Cron
- Tambahkan jadwal pada `wrangler.toml`.
- Aktifkan Cron di dashboard Workers.
- Worker akan memanggil `/_cron` yang menyegarkan KV dari `PROXY_BANK_URL`.

## Auto-update opsi B: GitHub Actions
- Aktifkan `.github/workflows/kv-sync.yml`.
- Tambahkan:
  - Repo secret: `CF_API_TOKEN` (KV Write).
  - Repo variables: `CF_ACCOUNT_ID`, `CF_NAMESPACE_ID`, opsional `PROXY_BANK_URL`.
- Workflow harian akan menarik sumber dan menulis ke KV.

## ENV variables
- PROXY_BANK_URL: URL sumber daftar proxy (kosong = non-aktif).
- REVERSE_PROXY_TARGET: target reverse proxy (kosong = non-aktif).
- DEFAULT_CC: default filter negara (misal: `ID,SG`).
- DEFAULT_LIMIT: batas default pagination (misal: `50`).

## Catatan teknis
- Pastikan UUID VLESS valid.
- Gunakan SNI sesuai host untuk koneksi TLS.
- Format Clash disederhanakan; sesuaikan jika butuh opsi lanjutan.

## Lisensi
MIT
