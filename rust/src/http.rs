// ========================================
// 极简 HTTP/1.1 服务端（std only）
//   · 每连接一个线程，处理完就关（够一个班用）
//   · 自动补 CORS 头，兼容前端的 /.netlify/functions/api 前缀
// ========================================
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};

pub struct Request {
    pub method: String,
    pub path: String,
    pub query: String,
    pub headers: BTreeMap<String, String>, // key 全小写
    pub body: String,
}

impl Request {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(&name.to_ascii_lowercase()).map(|s| s.as_str())
    }

    pub fn param(&self, name: &str) -> Option<String> {
        if self.query.is_empty() {
            return None;
        }
        for pair in self.query.split('&') {
            let (k, v) = match pair.find('=') {
                Some(i) => (&pair[..i], &pair[i + 1..]),
                None => (pair, ""),
            };
            if url_decode(k) == name {
                return Some(url_decode(v));
            }
        }
        None
    }
}

pub struct Response {
    pub status: u16,
    pub content_type: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Response {
    pub fn new(status: u16) -> Response {
        Response {
            status,
            content_type: "application/json; charset=utf-8".to_string(),
            headers: Vec::new(),
            body: Vec::new(),
        }
    }

    pub fn json(value: &Value, status: u16) -> Response {
        let mut r = Response::new(status);
        r.body = serde_json::to_vec(value).unwrap_or_else(|_| b"{}".to_vec());
        r
    }

    pub fn error(msg: &str, status: u16, code: Option<&str>) -> Response {
        let mut v = json!({ "error": msg });
        if let Some(c) = code {
            v["code"] = json!(c);
        }
        Response::json(&v, status)
    }

    pub fn text(body: impl Into<Vec<u8>>, status: u16, content_type: &str) -> Response {
        let mut r = Response::new(status);
        r.content_type = content_type.to_string();
        r.body = body.into();
        r
    }

    pub fn with_header(mut self, key: &str, value: &str) -> Response {
        self.headers.push((key.to_string(), value.to_string()));
        self
    }

    pub fn empty(status: u16) -> Response {
        let mut r = Response::new(status);
        r.body.clear();
        r
    }
}

pub fn url_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(v) => {
                        out.push(v);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

pub fn url_encode_utf8(input: &str) -> String {
    let mut out = String::new();
    for b in input.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
            out.push(c);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        500 => "Internal Server Error",
        _ => "OK",
    }
}

fn read_request(stream: &mut TcpStream) -> Option<Request> {
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok()?;
    let mut reader = BufReader::new(stream.try_clone().ok()?);

    let mut line = String::new();
    if reader.read_line(&mut line).ok()? == 0 {
        return None;
    }
    let mut parts = line.trim_end().split(' ');
    let method = parts.next()?.to_string();
    let target = parts.next()?.to_string();

    let mut headers: BTreeMap<String, String> = BTreeMap::new();
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).ok()? == 0 {
            break;
        }
        let t = h.trim_end();
        if t.is_empty() {
            break;
        }
        if let Some(idx) = t.find(':') {
            headers.insert(t[..idx].trim().to_ascii_lowercase(), t[idx + 1..].trim().to_string());
        }
    }

    let (path, query) = match target.find('?') {
        Some(i) => (target[..i].to_string(), target[i + 1..].to_string()),
        None => (target.clone(), String::new()),
    };

    let mut body = String::new();
    if let Some(len) = headers.get("content-length").and_then(|v| v.trim().parse::<usize>().ok()) {
        let mut buf = vec![0u8; len];
        if len > 0 {
            reader.read_exact(&mut buf).ok()?;
        }
        body = String::from_utf8_lossy(&buf).to_string();
    }

    Some(Request {
        method,
        path,
        query,
        headers,
        body,
    })
}

fn write_response(stream: &mut TcpStream, req_method: &str, resp: &Response) {
    let mut head = String::new();
    head.push_str(&format!("HTTP/1.1 {} {}\r\n", resp.status, reason(resp.status)));
    head.push_str(&format!("Content-Type: {}\r\n", resp.content_type));
    if resp.status != 204 {
        head.push_str(&format!("Content-Length: {}\r\n", resp.body.len()));
    }
    head.push_str("Access-Control-Allow-Origin: *\r\n");
    head.push_str("Access-Control-Allow-Headers: Content-Type, X-Password, X-Password-Hash\r\n");
    head.push_str("Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE\r\n");
    for (k, v) in &resp.headers {
        head.push_str(&format!("{}: {}\r\n", k, v));
    }
    head.push_str("Connection: close\r\n\r\n");

    let _ = stream.write_all(head.as_bytes());
    if req_method != "HEAD" && resp.status != 204 {
        let _ = stream.write_all(&resp.body);
    }
    let _ = stream.flush();
}

pub struct HttpServer {
    pub host: String,
    pub port: u16,
}

impl HttpServer {
    pub fn start<F>(&self, handler: F) -> Result<(), String>
    where
        F: Fn(&Request) -> Response + Send + Sync + 'static,
    {
        let addr = format!("{}:{}", self.host, self.port);
        let listener = TcpListener::bind(&addr)
            .map_err(|_| format!("端口 {} 绑定失败（可能已被占用）", self.port))?;

        println!("OpenStu (Rust) 启动于 http://{}:{}/", self.host, self.port);
        println!("  API 基址: /.netlify/functions/api/ 或 /api/");
        let _ = std::io::stdout().flush();

        let handler = Arc::new(handler);
        for incoming in listener.incoming() {
            match incoming {
                Ok(stream) => {
                    let h = Arc::clone(&handler);
                    thread::spawn(move || {
                        let mut stream = stream;
                        if let Some(req) = read_request(&mut stream) {
                            let method = req.method.clone();
                            let resp = h(&req);
                            write_response(&mut stream, &method, &resp);
                        }
                        let _ = stream.shutdown(std::net::Shutdown::Both);
                    });
                }
                Err(_) => continue,
            }
        }
        Ok(())
    }
}
