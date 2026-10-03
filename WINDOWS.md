# Windows Desktop App

Two packaging options:

- **Electron** (`src-electron`) — recommended Windows installer
- **Tauri** (`src-tauri`) — previous wrapper (needs Rust)

Both wrappers open the hosted Payroll web application. They do **not** bundle the Next.js server, a database connection, or secret environment variables.

---

## Electron (recommended)

On the Windows build PC you only need **[Node.js 20 LTS](https://nodejs.org/)**.

Deploy the web application first (for example, on Vercel) and set its server-side environment variables there. On the Windows build PC, set only the public URL for the build session:

```powershell
$env:PAYROLL_BACKEND_URL = "https://payroll.example.com"
```

Or in Command Prompt:

```bat
set PAYROLL_BACKEND_URL=https://payroll.example.com
```

### Dev

```bat
npm install
npm run electron:dev
```

`PAYROLL_BACKEND_URL` is intentionally public and is the only environment-derived value in the installer. Never place `DATABASE_URL`, `DIRECT_URL`, or `SUPABASE_SERVICE_ROLE_KEY` in a desktop build environment.

Opens a desktop window. If Next is not already running, it starts `npm run dev` for local development only.

### Build installer

```bat
npm run electron:build
```

Output:

- `dist-electron\Payroll-Setup.exe` — installer for the client
- `dist-electron\Payroll-Portable.exe` — no-install exe

Upload `Payroll-Setup.exe` as a GitHub Release asset named **Payroll-Setup.exe** for the website Download button.

The released desktop app needs an internet connection to reach the hosted backend.

---

## Tauri

1. Install **[Node.js 20 LTS](https://nodejs.org/)**  
2. Install **[Rust](https://rustup.rs/)** (`rustup` default toolchain)  
3. Install **[Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)**  
   - Workload: **Desktop development with C++**  
4. WebView2 is included on Windows 10/11 (install [Evergreen runtime](https://developer.microsoft.com/microsoft-edge/webview2/) if missing)

```bat
npm run tauri:dev
npm run tauri:build
```

---

## Website download button

The landing page **Download the app** button uses this Google Drive file:

https://drive.google.com/file/d/1rE6WSFwZCDvp8NiZVVhFrAb2fVLtbcnZ/view?usp=drivesdk

The file must be shared as **Anyone with the link**. To use a different file later, set `NEXT_PUBLIC_APP_DOWNLOAD_URL` on Vercel.

---

## Notes

- Build the Windows installer **on Windows**.
- The desktop package contains only the public backend URL. Its API, database, and Supabase service-role key remain on the hosted server.
- Rotate any database or service-role credentials that were present in previous desktop builds before release.
