import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { 
    Folder, Play, Stop, ArrowClockwise, 
    TerminalWindow, HardDrives, HardDrive, 
    GitBranch, Hexagon, Wrench, GlobeHemisphereWest,
    Infinity as InfinityIcon, User, Minus, Square, X
} from "@phosphor-icons/react";

const appWindow = getCurrentWindow();

type WorkspaceInfo = {
    found: boolean;
    base_dir?: string | null;
    script_path?: string | null;
    config_dir?: string | null;
    tavern_dir?: string | null;
    reason: string;
};

type GuiEnvelope = {
    ok: boolean;
    code: string;
    message: string;
    data?: any;
    logs?: string[];
};

type GuiCommandResult = {
    ok: boolean;
    exit_code: number;
    stdout: GuiEnvelope;
    stderr: string;
};

const COMMANDS = {
    dashboard: "dashboard",
    start: "start-tavern",
    stop: "stop-tavern",
    open: "open-tavern-dir",
    tavernLogs: "tavern-logs",
} as const;

const START_POLL_INTERVAL_MS = 1000;
const START_TIMEOUT_MS = 300000;

type FetchDashboardOptions = {
    readLogsWhenStopped?: boolean;
};

function formatBytes(bytes?: number) {
    if (!bytes) return "—";
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function statusText(value: boolean, yes = "正常", no = "缺失") {
    return value ? yes : no;
}

function stripAnsi(str: string): string {
    // 过滤标准的 ANSI 转义序列（控制颜色、加粗等终端样式）
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function StatusTag({ label, ok }: { label: string, ok: boolean }) {
    return (
        <span className="tag">
            <span className={`tag-dot ${ok ? 'ok' : 'fail'}`}></span>
            {label} {ok ? "正常" : "缺失"}
        </span>
    );
}

function LogLine({ line }: { line: string }) {
    const cleanLine = stripAnsi(line);
    const lower = cleanLine.toLowerCase();
    
    let className = "";
    if (lower.includes("error") || lower.includes("fail") || lower.includes("exception") || lower.includes("err!")) {
        className = "log-error";
    } else if (lower.includes("success") || lower.includes("ready") || lower.includes("listening on") || lower.includes("running at")) {
        className = "log-success";
    } else if (lower.includes("warn")) {
        className = "log-warn";
    } else if (cleanLine.includes("[SYSTEM]") || cleanLine.includes("正在启动")) {
        className = "log-system";
    }

    return <p className={className}>{cleanLine}</p>;
}

async function guiCommand(dir: string, command: string): Promise<GuiCommandResult> {
    const result = await invoke<GuiCommandResult>("run_gui_command", {
        request: { workspace_dir: dir, command, payload: {} },
    });
    if (!result.ok) {
        const message = result.stdout?.message || result.stderr || `GUI 命令执行失败：${command}`;
        throw new Error(message);
    }
    return result;
}

function App() {
    const [manualPath, setManualPath] = useState("");
    const [activeDir, setActiveDir] = useState("");
    const [status, setStatus] = useState<any>(null);
    const [config, setConfig] = useState<any>(null);
    const [backups, setBackups] = useState<any[]>([]);
    const [tavernLogs, setTavernLogs] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState("");
    const seqRef = useRef(0);
    const dirRef = useRef("");

    // Oshi Card State
    const [oshiMode, setOshiMode] = useState<'solo' | 'couple'>('couple');
    // Mocks for now - will be replaced by actual file selection in the future
    const defaultUserAvatar = "https://picsum.photos/seed/user123/150/150";
    const defaultOshiAvatar = "https://picsum.photos/seed/oshi456/150/150";

    // 保持 dirRef 同步
    useEffect(() => { dirRef.current = activeDir; }, [activeDir]);

    const appendLog = useCallback((_line: string) => {
        // 活动日志已废弃，保留签名避免编译报错
    }, []);

    // 初始加载
    useEffect(() => {
        const saved = localStorage.getItem("gugu_workspace_dir");
        if (saved) { 
            setActiveDir(saved); 
            setManualPath(saved);
            return; 
        }
        invoke<WorkspaceInfo>("detect_workspace").then((info) => {
            if (info.found && info.base_dir) {
                setActiveDir(info.base_dir);
                setManualPath(info.base_dir);
                localStorage.setItem("gugu_workspace_dir", info.base_dir);
            }
        }).catch(() => {});
    }, []);

    // 刷新仪表盘
    async function fetchDashboard(dir: string, options: FetchDashboardOptions = {}): Promise<boolean> {
        const seq = ++seqRef.current;
        try {
            const dash = await guiCommand(dir, COMMANDS.dashboard);
            if (seq !== seqRef.current) return false;
            const data = dash.stdout.data;
            setStatus(data.status);
            setConfig(data.config);
            setBackups(data.backups || []);
            const running = !!data.status?.tavern?.running;
            if (running || options.readLogsWhenStopped) {
                try {
                    const log = await guiCommand(dir, COMMANDS.tavernLogs);
                    if (seq !== seqRef.current) return false;
                    const ld = log.stdout.data;
                    const nextLogs = [...(ld.stderr || []), ...(ld.stdout || [])];
                    if (nextLogs.length > 0 || !options.readLogsWhenStopped) {
                        setTavernLogs(nextLogs);
                    }
                } catch {}
            } else {
                setTavernLogs([]);
            }
            return running;
        } catch {
            return false;
        }
    }

    // activeDir 变化时刷新一次
    useEffect(() => {
        if (activeDir) {
            setBusy(true);
            fetchDashboard(activeDir).finally(() => setBusy(false));
        }
    }, [activeDir]);

    // 轮询（仅 starting 期间）
    useEffect(() => {
        if (!starting || !activeDir) return;
        let cancelled = false;
        const startedAt = Date.now();
        const poll = async () => {
            while (!cancelled && starting) {
                const running = await fetchDashboard(dirRef.current, { readLogsWhenStopped: true });
                if (running && !cancelled) {
                    setStarting(false);
                    break;
                }
                if (!cancelled && Date.now() - startedAt >= START_TIMEOUT_MS) {
                    setStarting(false);
                    setError("启动命令已发送，但超时未检测到通信端口。");
                    break;
                }
                await new Promise(r => setTimeout(r, START_POLL_INTERVAL_MS));
            }
        };
        void poll();
        return () => { cancelled = true; };
    }, [starting, activeDir]);

    const health = useMemo(() => {
        const deps = status?.dependencies;
        if (!deps) return { ready: 0, total: 4 };
        return { ready: [deps.git, deps.node, deps.npm, deps.robocopy].filter(Boolean).length, total: 4 };
    }, [status]);

    function applyManualPath() {
        const trimmed = manualPath.trim();
        if (!trimmed) return;
        setActiveDir(trimmed);
        localStorage.setItem("gugu_workspace_dir", trimmed);
    }

    async function startTavern() {
        if (!activeDir) return;
        setBusy(true);
        setStarting(true);
        setError("");
        setTavernLogs(["正在启动酒馆服务..."]);
        try {
            await guiCommand(activeDir, COMMANDS.start);
            await fetchDashboard(activeDir, { readLogsWhenStopped: true });
        } catch (err) {
            setStarting(false);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    async function stopTavern() {
        if (!activeDir) return;
        setBusy(true);
        setError("");
        try {
            await guiCommand(activeDir, COMMANDS.stop);
            await new Promise(r => setTimeout(r, 1000));
            await fetchDashboard(activeDir);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        setBusy(false);
    }

    async function openTavernDir() {
        if (!activeDir) return;
        setBusy(true);
        try {
            await guiCommand(activeDir, COMMANDS.open);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        setBusy(false);
    }

    return (
        <div className="app-layout">
            <header data-tauri-drag-region className="titlebar">
                <div className="titlebar-drag-area" data-tauri-drag-region></div>
                <div className="titlebar-btns">
                    <button className="titlebar-btn" onClick={() => appWindow.minimize()} title="最小化">
                        <Minus size={12} weight="bold" />
                    </button>
                    <button className="titlebar-btn" onClick={() => appWindow.toggleMaximize()} title="最大化">
                        <Square size={12} weight="bold" />
                    </button>
                    <button className="titlebar-btn titlebar-close" onClick={() => appWindow.close()} title="关闭">
                        <X size={12} weight="bold" />
                    </button>
                </div>
            </header>

            <aside className="sidebar">
                <div className="sidebar-identity">
                    <div className={`avatar-group ${oshiMode}`}>
                        {oshiMode === 'couple' && (
                            <img src={defaultUserAvatar} alt="用户" className="avatar avatar-user" title="点击更换头像" />
                        )}
                        <img src={defaultOshiAvatar} alt="自推" className="avatar avatar-oshi" title={oshiMode === 'solo' ? "点击更换形象" : "点击更换自推照片"} />
                    </div>
                    <div className="identity-toggles">
                        <button className={`toggle-btn ${oshiMode === 'solo' ? 'active' : ''}`} onClick={() => setOshiMode('solo')} title="单推模式"><User size={12} weight="fill"/></button>
                        <button className={`toggle-btn ${oshiMode === 'couple' ? 'active' : ''}`} onClick={() => setOshiMode('couple')} title="羁绊模式"><InfinityIcon size={12} weight="bold"/></button>
                    </div>
                </div>

                <div className="nav-list">
                    <div className="nav-item active"><Hexagon size={18} weight="duotone" /> <span>仪表盘</span></div>
                    <div className="nav-item"><Wrench size={18} /> <span>高级配置</span></div>
                    <div className="nav-item"><HardDrives size={18} /> <span>本地快照</span></div>
                    <div className="nav-item"><GlobeHemisphereWest size={18} /> <span>网络代理</span></div>
                    <div className="nav-item"><GitBranch size={18} /> <span>Git 同步</span></div>
                </div>

                <div className="sidebar-status">
                    <div className="status-indicator">
                        <div className={`status-dot ${starting ? "starting" : status?.tavern?.running ? "running" : "stopped"}`}></div>
                    </div>
                    <div className="status-info">
                        <span className="status-text">{starting ? "正在启动..." : status?.tavern?.running ? "酒馆已运行" : "服务已停止"}</span>
                        <span className="status-sub">{status?.tavern?.running ? `端口 ${status?.tavern?.port || "8000"}` : "本地模式"}</span>
                    </div>
                </div>
            </aside>

            <main className="main-content">
                <div className="toolbar">
                    <div className="path-selector">
                        <Folder size={16} className="path-icon" />
                        <input
                            className="path-input"
                            value={manualPath}
                            onChange={(e) => setManualPath(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") applyManualPath(); }}
                            placeholder="输入酒馆绝对路径 (如 D:\jiuguan) 并回车"
                        />
                    </div>
                    <div className="toolbar-actions">
                        <button className="btn" onClick={openTavernDir} disabled={!activeDir || busy}>
                            打开目录
                        </button>
                        {status?.tavern?.running ? (
                            <button className="btn btn-danger" onClick={stopTavern} disabled={!activeDir || busy || starting}>
                                <Stop size={16} weight="fill" /> 停止服务
                            </button>
                        ) : (
                            <button className="btn btn-primary" onClick={startTavern} disabled={!activeDir || busy || starting}>
                                <Play size={16} weight="fill" /> 启动酒馆
                            </button>
                        )}
                    </div>
                </div>

                <div className="workspace">
                    {error && <div className="error-strip">{error}</div>}

                    <div className="properties-grid">

                        <div className="property-card">
                            <div className="prop-header">
                                <span className="prop-label">环境依赖</span>
                            </div>
                            <span className="prop-value">{status?.tavern?.installed ? "完整部署" : "存在缺失"}</span>
                            <div className="prop-sub">
                                <StatusTag label="Node" ok={!!status?.dependencies?.node} />
                                <StatusTag label="Git" ok={!!status?.dependencies?.git} />
                            </div>
                        </div>

                        <div className="property-card">
                            <div className="prop-header">
                                <span className="prop-label">数据保护</span>
                            </div>
                            <div className="prop-value-group">
                                <span className="prop-value">{status?.backups?.count || 0}</span>
                                <span className="prop-unit">份快照</span>
                            </div>
                            <div className="prop-sub">
                                <span>容量上限 {status?.backups?.limit || 10} 槽位</span>
                            </div>
                        </div>

                        <div className="property-card">
                            <div className="prop-header">
                                <span className="prop-label">远端同步</span>
                            </div>
                            <span className="prop-value">{config?.gitSync?.configured ? "已配置" : "仅本地模式"}</span>
                            <div className="prop-sub">
                                <span>{config?.proxy?.configured ? `代理端口 :${config.proxy.port}` : "当前为直接连接"}</span>
                            </div>
                        </div>

                        <div className="property-card">
                            <div className="prop-header">
                                <span className="prop-label">模块健康度</span>
                            </div>
                            <div className="prop-value-group">
                                <span className="prop-value">{health.ready}/{health.total}</span>
                                <span className="prop-unit">核心模块在线</span>
                            </div>
                            <div className="prop-sub">
                                <span>Robocopy {statusText(!!status?.dependencies?.robocopy, "正常", "缺失")}</span>
                            </div>
                        </div>
                    </div>

                    <div className="split-panels">
                        <div className="panel">
                            <div className="panel-header">
                                <span className="panel-title"><HardDrive size={16} /> 本地快照仓库</span>
                                <div className="panel-actions">
                                    <button className="icon-btn" onClick={() => { setBusy(true); fetchDashboard(activeDir).finally(() => setBusy(false)); }} disabled={!activeDir || busy} title="刷新仓库">
                                        <ArrowClockwise size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="backup-content">
                                {backups.length === 0 && (
                                    <div className="empty-state">
                                        <HardDrives size={24} weight="duotone" className="empty-icon" />
                                        <span>尚未建立任何本地快照。</span>
                                    </div>
                                )}
                                {backups.map((b) => (
                                    <div className="backup-row" key={b.path}>
                                        <span className="backup-name">{b.name}</span>
                                        <span className="backup-size">{formatBytes(b.sizeBytes)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="panel">
                            <div className="panel-header">
                                <span className="panel-title"><TerminalWindow size={16} /> 终端日志</span>
                                <div className="panel-actions">
                                    <button className="icon-btn" onClick={() => { setBusy(true); fetchDashboard(activeDir).finally(() => setBusy(false)); }} disabled={!activeDir || busy} title="刷新日志">
                                        <ArrowClockwise size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="console-content">
                                {tavernLogs.length === 0 && (
                                    <div className="console-empty">
                                        <TerminalWindow size={24} weight="duotone" className="empty-icon" />
                                        <span>{starting ? "正在启动..." : status?.tavern?.running ? "酒馆已运行，正在监听日志..." : "等待运行..."}</span>
                                    </div>
                                )}
                                {tavernLogs.map((line, i) => <LogLine key={i} line={line} />)}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
