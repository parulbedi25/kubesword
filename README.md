# ⚔️ KubeSword

**Web-based Kubernetes cluster monitoring & management** — a Lens / Headlamp / Kubeterm-style tool that runs in **any browser** and compiles into **desktop apps for Windows (.exe), macOS (.dmg) and Linux (.deb)**.

![stack](https://img.shields.io/badge/UI-React%20%2B%20Vite-38bdf8) ![api](https://img.shields.io/badge/API-Node%20%2B%20Express-68a063) ![desktop](https://img.shields.io/badge/Desktop-Electron-9feaf9) ![license](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

| Area | What's included |
|---|---|
| 📊 **Overview** | Cluster health, pods-by-phase chart, workload bars, node CPU/MEM meters, warnings & latest events |
| 🖥️ **Nodes** | Readiness, roles, versions, capacity + live `metrics-server` usage |
| 📦 **Pods** | Status, ready, restarts, IP, node — with **live logs**, **in-browser terminal (exec)**, YAML view/edit/apply, events |
| 🚀 **Workloads** | Deployments (restart/scale), StatefulSets, DaemonSets, Jobs, CronJobs, HPA |
| 🌐 **Network** | Services, Ingresses, Endpoints, NetworkPolicies + **port-forward manager** (TCP proxy into pods) |
| ⚙️ **Config** | ConfigMaps, Secrets (values masked), ServiceAccounts |
| 💾 **Storage** | PVCs, PVs, StorageClasses |
| 🔐 **RBAC** | Roles, ClusterRoles, ServiceAccounts |
| 📜 **Events** | Streamed cluster events with warning highlighting |
| 🗂️ **Namespaces** | Browse + create |
| 🔌 **Multi-cluster** | Auto-loads `~/.kube/config` contexts, `KUBECONFIG`, in-cluster config; upload extra kubeconfigs from the UI |
| 🧪 **Demo mode** | Realistic built-in demo cluster so the UI is explorable with zero setup |
| 📝 **Apply YAML** | kubectl-apply style multi-doc YAML from the Settings page or any resource drawer |

## 🚀 Run it

### Option A — Web (any browser)

```bash
npm install
npm run web        # builds the UI and serves it on http://localhost:3001
# then open the URL in any browser
```

Development (hot reload UI + API):

```bash
npm run dev        # client :5173 (proxies /api + /ws) + server :3001
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
npm run dist:mac   # KubeSword-*-mac-*.dmg (+ zip)
npm run dist:linux # KubeSword-*-linux-x64.deb (+ AppImage)
```

Installers land in `release/`. CI (`.github/workflows/build.yml`) builds all three OS targets on every push and attaches them to GitHub Releases on tags like `v1.0.0`.

Desktop dev mode (Electron + hot reload):

```bash
npm run dev:electron
```

## 🔌 Connecting clusters

1. **Automatic** — if `~/.kube/config` exists (or `KUBECONFIG` is set), every context appears in the cluster switcher.
2. **Upload** — click the cluster dropdown → *Add cluster* → paste or drop a kubeconfig file.
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
│       └── lib/            # api client, utils
├── server/                 # Node + Express + @kubernetes/client-node + ws
│   └── src/
│       ├── index.js        # HTTP + static UI serving + WS attach
│       ├── k8s-manager.js  # multi-cluster loader (kubeconfig/in-cluster/uploads)
│       ├── routes.js       # REST: list/get/delete/yaml/apply/scale/metrics/…
│       ├── websocket.js    # live logs + exec terminal (with demo shells)
│       ├── portforward.js  # TCP proxy sessions into pods
│       └── mock-data.js    # realistic demo cluster
├── electron/               # desktop shell (spawns server, opens window, tray)
└── .github/workflows/      # CI: web check + win/mac/linux artifacts + releases
```

The server serves the built UI, so **one codebase = browser app + desktop app**.

## 🔒 Notes

- Uploaded kubeconfigs are stored under `~/.kubesword/kubeconfigs` with `0600` permissions.
- Secret values are masked in the UI; YAML view strips `managedFields`/`status`.
- The demo cluster is read-only; mutating actions are disabled there.

## 📄 License

MIT — see [LICENSE](LICENSE).
