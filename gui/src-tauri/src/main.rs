#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
struct WorkspaceInfo {
    found: bool,
    base_dir: Option<String>,
    script_path: Option<String>,
    config_dir: Option<String>,
    tavern_dir: Option<String>,
    reason: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GuiCommandRequest {
    workspace_dir: String,
    command: String,
    #[serde(default = "default_payload")]
    payload: Value,
}

#[derive(Debug, Clone, Serialize)]
struct GuiCommandResult {
    ok: bool,
    exit_code: i32,
    stdout: Value,
    stderr: String,
}

fn default_payload() -> Value {
    json!({})
}

fn redact_secret(text: &str) -> String {
    let mut output = text.to_string();
    for marker in ["REPO_TOKEN=", "Authorization: Bearer "] {
        if let Some(index) = output.to_lowercase().find(&marker.to_lowercase()) {
            let end = output[index..]
                .find('\n')
                .map(|offset| index + offset)
                .unwrap_or(output.len());
            output.replace_range(index..end, &format!("{}***", marker));
        }
    }
    output
}

fn is_workspace_candidate(path: &Path) -> bool {
    path.join("pc-st.ps1").is_file()
        && (path.join(".config").is_dir() || path.join("SillyTavern").exists())
}

fn workspace_info(path: PathBuf, reason: &str) -> WorkspaceInfo {
    WorkspaceInfo {
        found: true,
        script_path: Some(path.join("pc-st.ps1").to_string_lossy().to_string()),
        config_dir: Some(path.join(".config").to_string_lossy().to_string()),
        tavern_dir: Some(path.join("SillyTavern").to_string_lossy().to_string()),
        base_dir: Some(path.to_string_lossy().to_string()),
        reason: reason.to_string(),
    }
}

fn candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(current_dir) = env::current_dir() {
        roots.push(current_dir.clone());
        roots.push(current_dir.join("jiuguan"));
        for ancestor in current_dir.ancestors() {
            roots.push(ancestor.to_path_buf());
            roots.push(ancestor.join("jiuguan"));
        }
    }
    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            roots.push(exe_dir.to_path_buf());
            roots.push(exe_dir.join("jiuguan"));
            for ancestor in exe_dir.ancestors() {
                roots.push(ancestor.to_path_buf());
                roots.push(ancestor.join("jiuguan"));
            }
        }
    }
    roots
}

#[tauri::command]
fn detect_workspace() -> WorkspaceInfo {
    for root in candidate_roots() {
        if is_workspace_candidate(&root) {
            return workspace_info(root, "auto-detected");
        }
    }

    WorkspaceInfo {
        found: false,
        base_dir: None,
        script_path: None,
        config_dir: None,
        tavern_dir: None,
        reason: "未找到包含 pc-st.ps1 且带 .config 或 SillyTavern 标记的助手目录。".to_string(),
    }
}

fn powershell_executable() -> &'static str {
    let mut probe = Command::new("pwsh");
    probe.arg("-NoProfile").arg("-Command").arg("$PSVersionTable.PSVersion.Major");
    hide_console(&mut probe);
    if probe.output().is_ok() {
        "pwsh"
    } else {
        "powershell"
    }
}

#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console(_command: &mut Command) {}

#[tauri::command]
async fn run_gui_command(request: GuiCommandRequest) -> Result<GuiCommandResult, String> {
    tokio::task::spawn_blocking(move || run_gui_command_sync(request))
        .await
        .map_err(|error| error.to_string())?
}

fn run_gui_command_sync(request: GuiCommandRequest) -> Result<GuiCommandResult, String> {
    let workspace = PathBuf::from(&request.workspace_dir);
    let script = workspace.join("pc-st.ps1");
    if !script.is_file() {
        return Err(format!("未找到 PowerShell 脚本：{}", script.to_string_lossy()));
    }

    let payload = serde_json::to_string(&request.payload).map_err(|error| error.to_string())?;
    let mut command = Command::new(powershell_executable());
    command
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&script)
        .arg("-GuiCommand")
        .arg(&request.command)
        .arg("-GuiPayloadJson")
        .arg(payload)
        .current_dir(&workspace);
    hide_console(&mut command);

    let output = command.output().map_err(|error| error.to_string())?;
    let exit_code = output.status.code().unwrap_or(-1);
    let stdout_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr_text = redact_secret(&String::from_utf8_lossy(&output.stderr));
    let stdout = if stdout_text.is_empty() {
        json!({ "ok": false, "code": "EMPTY_STDOUT", "message": "PowerShell 命令没有返回 JSON。" })
    } else {
        serde_json::from_str(&stdout_text).unwrap_or_else(|_| {
            json!({
                "ok": false,
                "code": "INVALID_JSON",
                "message": "PowerShell 返回内容不是合法 JSON。",
                "raw": redact_secret(&stdout_text)
            })
        })
    };

    Ok(GuiCommandResult {
        ok: output.status.success() && stdout.get("ok").and_then(Value::as_bool).unwrap_or(false),
        exit_code,
        stdout,
        stderr: stderr_text,
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![detect_workspace, run_gui_command])
        .run(tauri::generate_context!())
        .expect("error while running gugu assistant gui");
}
