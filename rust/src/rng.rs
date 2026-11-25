// 随机字节：不依赖 std 的进程随机种子（那条路径会导入 bcryptprimitives.dll），
// 也不引 getrandom crate。各平台走系统提供的稳定 API：
//   · Windows：BCryptGenRandom（bcrypt.dll，Vista 起就有）
//   · Linux/macOS：/dev/urandom
//   · 兜底：时间戳 + 栈地址 + 计数器，SHA-256 打散
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(target_os = "windows")]
mod sys {
    use std::ffi::c_void;

    #[link(name = "bcrypt")]
    extern "system" {
        fn BCryptGenRandom(
            h_algorithm: *mut c_void,
            buffer: *mut u8,
            length: u32,
            flags: u32,
        ) -> i32;
    }

    pub fn fill(buf: &mut [u8]) -> bool {
        const BCRYPT_USE_SYSTEM_PREFERRED_RNG: u32 = 0x0000_0002;
        unsafe {
            BCryptGenRandom(
                std::ptr::null_mut(),
                buf.as_mut_ptr(),
                buf.len() as u32,
                BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            ) == 0
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod sys {
    use std::io::Read;

    pub fn fill(buf: &mut [u8]) -> bool {
        match std::fs::File::open("/dev/urandom") {
            Ok(mut f) => f.read_exact(buf).is_ok(),
            Err(_) => false,
        }
    }
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn fallback(buf: &mut [u8]) {
    let mut offset = 0;
    while offset < buf.len() {
        let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let local = 0u8;
        let addr = &local as *const u8 as usize;

        let mut h = Sha256::new();
        h.update(nanos.to_le_bytes());
        h.update(counter.to_le_bytes());
        h.update((addr as u64).to_le_bytes());
        let digest = h.finalize();
        let take = std::cmp::min(32, buf.len() - offset);
        buf[offset..offset + take].copy_from_slice(&digest[..take]);
        offset += take;
    }
}

pub fn bytes(n: usize) -> Vec<u8> {
    let mut out = vec![0u8; n];
    if n == 0 {
        return out;
    }
    if !sys::fill(&mut out) {
        fallback(&mut out);
    }
    out
}
