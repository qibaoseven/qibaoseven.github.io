// ========================================
// OpenStu v0.46 (Rust) · 加解密
// ========================================
// 与 python/v0.46 的 backend/netlify_compat.py、homework.py 完全一致：
//   key   = HMAC-SHA256(key=password, msg="")     → 32 字节
//   blob  = base64( iv(12) ‖ tag(16) ‖ ciphertext )
//   明文前缀：JSON:（班级数据）、HWSF（作业二进制）、JNSF（历程快照）
// ========================================
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

use crate::rng;

pub fn sha256_hex(input: &str) -> String {
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    hex(&h.finalize())
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// key = HMAC-SHA256(key=password, msg="")
pub fn derive_key(password: &str) -> [u8; 32] {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(password.as_bytes()).expect("hmac key");
    mac.update(b"");
    let out = mac.finalize().into_bytes();
    let mut key = [0u8; 32];
    key.copy_from_slice(&out[..32]);
    key
}

pub fn encrypt_plain(plain: &[u8], password: &str) -> String {
    let key = derive_key(password);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let iv = rng::bytes(12);
    let nonce = Nonce::from_slice(&iv);
    let ct = cipher.encrypt(nonce, plain).expect("aes-gcm encrypt");
    // aes-gcm 的返回是 ciphertext ‖ tag(16)，Python 的格式是 iv ‖ tag ‖ ciphertext
    let (ciphertext, tag) = ct.split_at(ct.len() - 16);
    let mut all = Vec::with_capacity(iv.len() + ct.len());
    all.extend_from_slice(&iv);
    all.extend_from_slice(tag);
    all.extend_from_slice(ciphertext);
    B64.encode(all)
}

pub fn decrypt_plain(b64: &str, password: &str) -> Option<Vec<u8>> {
    let buf = B64.decode(b64.trim()).ok()?;
    if buf.len() < 12 + 16 {
        return None;
    }
    let key = derive_key(password);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(&buf[0..12]);
    // 还原成 aes-gcm 期望的 ciphertext ‖ tag 顺序
    let tag = &buf[12..28];
    let ciphertext = &buf[28..];
    let mut combined = Vec::with_capacity(ciphertext.len() + tag.len());
    combined.extend_from_slice(ciphertext);
    combined.extend_from_slice(tag);
    cipher.decrypt(nonce, combined.as_slice()).ok()
}

/// 班级整班数据：明文 "JSON:" + compact JSON
pub fn encrypt_json(value: &serde_json::Value, password: &str) -> String {
    let text = format!("JSON:{}", serde_json::to_string(value).unwrap_or_default());
    encrypt_plain(text.as_bytes(), password)
}

pub fn decrypt_json(b64: &str, password: &str) -> Option<serde_json::Value> {
    let plain = decrypt_plain(b64, password)?;
    let text = String::from_utf8_lossy(&plain).to_string();
    let body = text.strip_prefix("JSON:")?;
    serde_json::from_str(body).ok()
}

/// 历程快照（JNSF）不需要单独实现，直接复用 encrypt_plain / decrypt_plain
#[allow(dead_code)]
pub const JSON_PREFIX: &str = "JSON:";
#[allow(dead_code)]
pub const JOURNAL_PREFIX: &str = "JNSF";
