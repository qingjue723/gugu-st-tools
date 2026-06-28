# 咕咕助手 GUI

Tauri 2 + React 首版骨架。GUI 默认通过 `jiuguan/pc-st.ps1 -GuiCommand ...` 调用旧脚本的非交互 JSON 命令桥，避免一次性重写 CLI 逻辑。

## 开发

```powershell
cd gui
npm install
npm run tauri:dev
```

## 打包

```powershell
# 普通版：小体积，WebView2 使用 embedBootstrapper
npm run tauri:build:normal

# 大陆稳定版：内置 WebView2 offlineInstaller，体积更大但断网可安装
npm run tauri:build:china
```

## 当前命令桥

- `status`
- `start-tavern`
- `open-tavern-dir`
- `list-backups`
- `read-config`
