# ⚔️ KubeSword

**Web-based Kubernetes cluster monitoring & management** — a Lens / Headlamp / Kubeterm-style tool that runs in **any browser** and compiles into **desktop apps for Windows (.exe), macOS (.dmg) and Linux (.deb)**.

![stack](https://img.shields.io/badge/UI-React%20%2B%20Vite-38bdf8) ![api](https://img.shields.io/badge/API-Node%20%2B%20Express-68a063) ![desktop](https://img.shields.io/badge/Desktop-Electron-9feaf9) ![license](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

| Area | What's included |
|---|---|
| 📊 **Overview** | Cluster health, pods-by-phase chart, pods-by-namespace, node CPU/MEM meters, recent events |
| 🖥️ **Nodes** | Readiness, roles, capacity, kubelet versions + live `metrics-server` usage |
| 📦 **Pods** | Status, ready, restarts, IP, node — with **live logs**, **in-browser terminal (exec)**, YAML view/edit/apply, events |
| 🚀 **Workloads** | Deployments (restart/scale), StatefulSets (scale), DaemonSets, ReplicaSets, Jobs, CronJobs |
| 🌐 **Network** | Services, Ingresses, NetworkPolicies, Endpoints + **port-forward manager** (TCP proxy into pods) |
| ⚙️ **Config** | ConfigMaps, Secrets |
| 💾 **Storage** | PersistentVolumeClaims, PersistentVolumes, StorageClasses |
| 🔐 **RBAC** | Roles, RoleBindings, ClusterRoles, ClusterRoleBindings, ServiceAccounts |
| 📜 **Events** | Cluster events with warnings-only filter |
| 🗂️ **Namespaces** | Browse + create |
| 🔌 **Multi-cluster** | Auto-loads `~/.kube/config` contexts, `KUBECONFIG`, in-cluster config; add more kubeconfigs from the UI |
| 🧪 **Demo mode** | Realistic built-in demo cluster so the UI is explorable with zero setup |
| 📝 **Apply YAML** | kubectl-apply style multi-doc YAML from the Settings page or any resource drawer |

## 📋 Requirements

- **Node.js 18+** (LTS recommended) and npm 8+. `npm start` checks this and tells you plainly if your Node is too old.
- A Kubernetes cluster is optional — without one you still get the full UI against the built-in demo cluster.

## 🚀 Run it

### Option A — Web (any browser): just two commands, no build

```bash
npm install
npm start          # runs the project straight from source (no build), opens your browser
# → UI: http://localhost:5173  |  API: http://localhost:3001
# (set PORT=... / CLIENT_PORT=... to change ports, NO_BROWSER=1 to skip auto-open)
```

That's it — `npm start` runs the API server from source plus the UI in dev mode with hot reload. No build step, no `dist`, no Electron needed. Opening either address loads the app (the API address redirects to the UI automatically).

Need the optimized production build instead (single server bundle + compiled UI)?

```bash
npm run web        # builds once and serves everything on http://localhost:3001
```

Docker:

```bash
docker compose up --build   # http://localhost:3000 (mounts ~/.kube read-only)
```

### Option B — Desktop app (Windows / macOS / Linux)

```bash
npm install
npm run dist       # builds for the current OS
npm run dist:win   # KubeSword-*-win-x64.exe (NSIS installer + portable)
npm run dist:mac   # KubeSword-*-mac-arm64.dmg — optimized for Apple Silicon (M1/M2/M3/M4)
npm run dist:mac:intel  # Intel Macs (.dmg)
npm run dist:mac:all    # both Apple Silicon + Intel
npm run dist:linux # KubeSword-*-linux-x64.deb (+ AppImage)
```

Installers land in `release/`. CI (`.github/workflows/build.yml`) builds all OS targets on every push and attaches them to GitHub Releases on tags like `v1.0.0`.

Notes:
- The backend ships as a **single bundled file** (no `node_modules` in the package), so the installers stay lean, launch fast, and work fully offline.
- The frontend ships as a **single JS bundle** (plus the on-demand YAML editor) with **zero external requests** — no CDNs, no webfonts — so the app renders even on offline/air-gapped machines.
- **Windows portable**: a single `KubeSword-*-portable.exe` — no install, no admin rights. It keeps its profile and uploaded kubeconfigs in a `KubeSwordData` folder next to the exe (USB-stick friendly; delete the folder to fully reset the app).
- Run the desktop shell from source with `npm run desktop` (builds first via `npm run build` if needed).
- Desktop dev mode (Electron + hot reload): `npm run dev:electron`.

### Distributing the macOS app (Apple Silicon)

Out of the box `npm run dist:mac` produces an **ad-hoc signed, hardened-runtime** `.dmg` with the required Apple Silicon entitlements (`build/entitlements.mac.plist` — JIT + executable memory for Electron's V8 engine, without which the app is killed at launch on M1/M2/M3/M4). It runs fine on your own Mac via right-click → Open.

To distribute without Gatekeeper warnings, sign with a **Developer ID** certificate and notarize:

```bash
# 1. Install your "Developer ID Application" certificate in Keychain,
#    then build (electron-builder picks it up automatically):
npm run dist:mac

# 2. Notarize the DMG:
xcrun notarytool submit release/KubeSword-*-mac-arm64.dmg \
  --apple-id you@example.com --team-id TEAMID --password app-specific-password --wait
xcrun stapler staple release/KubeSword-*-mac-arm64.dmg
```

Or let electron-builder notarize automatically by setting `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` in the environment (add a `notarize` block under `build.mac` if you want it wired in — see the electron-builder docs).

## 🩺 Verify & troubleshoot

```bash
npm run smoke    # boots the real server on a temp port and checks every API + WS endpoint
```

- **Blank / stuck on "Loading"**: hard-refresh (<kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>). The loading screen reports startup failures instead of hanging silently — check the console (<kbd>F12</kbd>) for details. If you use the production build (`npm run web`), rebuild once with `npm run build` first.
- **"Node.js is too old"**: install the current LTS from https://nodejs.org, then re-run `npm install`.
- **"port is already in use"**: another program owns that port — stop it, or run with a different one (`PORT=3101 CLIENT_PORT=5210 npm start`). If it's a leftover KubeSword, `npm start` reuses it automatically.
- **`npm install` failing on the Electron download** (restricted networks): the browser version doesn't need Electron at all — set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` and re-run install. You only need the Electron binary for `npm run desktop` / `npm run dist*`.

## 🔌 Connecting clusters

1. **Automatic** — if `~/.kube/config` exists (or `KUBECONFIG` is set), every context appears in the cluster switcher.
2. **Upload** — click the cluster dropdown → *Add cluster* → paste a kubeconfig (validated before saving).
3. **In-cluster** — when deployed inside Kubernetes with a ServiceAccount, KubeSword picks up the pod's credentials.

No cluster? The built-in **`demo`** cluster lets you explore every screen.

## 🏗️ Architecture

```
kubesword/
├── client/                 # React + Vite + Tailwind + xterm + Monaco + Recharts
│   └── src/
│       ├── pages/          # Dashboard, Pods, Workloads, Network, Storage, …
│       ├── components/     # Layout, ResourceDrawer, LogsViewer, TerminalView, …
│       ├── context/        # ClusterContext (current cluster + namespace)
│       └── lib/            # api client (with timeouts), utils, monaco setup
├── server/                 # Node + Express + @kubernetes/client-node + ws
│   └── src/
│       ├── index.js        # HTTP + static UI serving + WS attach
│       ├── k8s-manager.js  # multi-cluster loader (kubeconfig/in-cluster/uploads)
│       ├── routes.js       # REST: one kind-registry drives list/get/delete/yaml/…
│       ├── websocket.js    # live logs + exec terminal (JSON protocol, demo shells)
│       ├── portforward.js  # TCP proxy sessions into pods
│       └── mock-data.js    # realistic demo cluster
├── scripts/
│   ├── start.js            # `npm start`: preflights + supervised server/UI
│   └── smoke.js            # `npm run smoke`: end-to-end API + WS verification
├── electron/               # desktop shell (spawns server, opens window, tray)
└── .github/workflows/      # CI: web check + win/mac/linux artifacts + releases
```

The server serves the built UI, so **one codebase = browser app + desktop app**.

## 🔒 Notes

- Uploaded kubeconfigs are stored under `~/.kubesword/kubeconfigs` with `0600` permissions.
- Secret data is shown base64-encoded exactly as the Kubernetes API returns it; YAML view strips `managedFields`/`status`.
- The demo cluster is read-only; mutating actions are rejected there.

## 📄 License

MIT — see [LICENSE](LICENSE).
