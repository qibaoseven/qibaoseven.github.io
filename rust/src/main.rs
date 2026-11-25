// ========================================
// OpenStu v0.46 (Rust) · 单文件可执行入口
// ========================================
// 双击运行：读同目录 config.txt → 起 HTTP 服务 → 自动打开浏览器
// 前端已通过 include_bytes! 编进二进制（rust/tools/gen_assets.py 生成）
// ========================================
mod api;
mod app;
mod assets;
mod assets_support;
mod core;
mod crypto;
mod http;
mod rng;
mod routes_basic;
mod routes_homework;
mod routes_journal;
mod store;
mod template;

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use http::Response;

struct Config {
    host: String,
    port: u16,
    open_browser: bool,
    data_dir: String,
    browser_url: String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            host: "127.0.0.1".to_string(),
            port: 8080,
            open_browser: true,
            data_dir: "data".to_string(),
            browser_url: String::new(),
        }
    }
}

fn write_default_config(path: &Path) {
    let text = "\
# OpenStu (Rust) 配置
# host: 监听地址，127.0.0.1 = 只允许本机访问；0.0.0.0 = 局域网可访问
# port: 端口，被占用就换一个
# open_browser: 启动后是否自动打开浏览器（1/0）
# data_dir: 数据目录，相对路径以 exe 所在目录为基准
# browser_url: 自动打开的地址，留空 = http://<host>:<port>/
host=127.0.0.1
port=8080
open_browser=1
data_dir=data
browser_url=
";
    let _ = fs::write(path, text);
}

fn load_config(dir: &Path) -> Config {
    let mut cfg = Config::default();
    let path = dir.join("config.txt");
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => {
            write_default_config(&path);
            println!("[cfg] 未找到 config.txt，已生成默认配置: {}", path.display());
            return cfg;
        }
    };
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (k, v) = match line.find('=') {
            Some(i) => (line[..i].trim(), line[i + 1..].trim()),
            None => continue,
        };
        match k {
            "host" if !v.is_empty() => cfg.host = v.to_string(),
            "port" => {
                if let Ok(p) = v.parse::<u16>() {
                    if p > 0 {
                        cfg.port = p;
                    }
                }
            }
            "open_browser" => cfg.open_browser = !(v == "0" || v.eq_ignore_ascii_case("false")),
            "data_dir" if !v.is_empty() => cfg.data_dir = v.to_string(),
            "browser_url" => cfg.browser_url = v.to_string(),
            _ => {}
        }
    }
    cfg
}

fn open_browser(url: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd").args(["/C", "start", "", url]).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("xdg-open").arg(url).spawn();
    }
}

fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn serve_static(path: &str) -> Response {
    let path = if path.is_empty() || path == "/" {
        "/index.html"
    } else {
        path
    };
    for asset in assets::ASSETS {
        if asset.path == path {
            return Response::text(
                asset.bytes.to_vec(),
                200,
                asset.mime,
            );
        }
    }
    Response::text(
        format!("404 Not Found: {}", path).into_bytes(),
        404,
        "text/plain; charset=utf-8",
    )
}

fn main() {
    println!("OpenStu v0.46 (Rust)");
    let dir = exe_dir();
    println!("  程序目录: {}", dir.display());

    let cfg = load_config(&dir);

    let data_root = {
        let p = PathBuf::from(&cfg.data_dir);
        if p.is_absolute() {
            p
        } else {
            dir.join(p)
        }
    };
    let _ = fs::create_dir_all(&data_root);

    let state = app::AppState::new(&data_root);

    let url = if !cfg.browser_url.is_empty() {
        cfg.browser_url.clone()
    } else {
        let host = if cfg.host == "0.0.0.0" { "127.0.0.1" } else { cfg.host.as_str() };
        format!("http://{}:{}/", host, cfg.port)
    };

    if cfg.open_browser {
        let u = url.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(600));
            println!("[web] 打开浏览器: {}", u);
            let _ = std::io::stdout().flush();
            open_browser(&u);
        });
    } else {
        println!("[web] 请手动访问: {}", url);
    }

    let server = http::HttpServer {
        host: cfg.host.clone(),
        port: cfg.port,
    };

    let result = server.start(move |req| {
        if req.path.starts_with("/api") || req.path.starts_with("/.netlify/functions/api") {
            return api::handle_api(req, &state);
        }
        serve_static(&req.path)
    });

    if let Err(e) = result {
        println!("[err] {}", e);
    }
}
