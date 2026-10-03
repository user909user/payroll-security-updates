# Payroll

Multi-outlet payroll & attendance app (Next.js + Supabase + Prisma).

## Web (browser)

```bash
npm install
cp .env.example .env   # then fill Supabase keys
npx prisma generate
npx prisma db push
npm run seed
npm run dev
```

Open http://localhost:3000

## Windows desktop app

See **[WINDOWS.md](./WINDOWS.md)**.

Electron (separate from Tauri), on a Windows PC. Deploy the web app first, then set `PAYROLL_BACKEND_URL` to its public HTTPS URL before packaging:

```bat
npm install
npm run electron:dev     :: local-development desktop window (starts Next if needed)
npm run electron:build   :: NSIS installer + portable exe
```
