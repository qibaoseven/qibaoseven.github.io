// 极简随机数（不引 rand crate，跨平台通用）
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};

pub fn bytes(n: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(n);
    let mut seed = RandomState::new();
    while out.len() < n {
        // 每次拿两个 u64，凑够 8 字节
        for _ in 0..2 {
            let mut h = seed.build_hasher();
            h.write_u64(out.len() as u64);
            let v = h.finish();
            for b in v.to_le_bytes() {
                if out.len() < n {
                    out.push(b);
                }
            }
            seed = RandomState::new();
        }
    }
    out
}
