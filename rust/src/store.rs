// 存储层：<data>/<bucket>/<key>.json
// 文件内容是 JSON 编码的字符串（和 Python 的 json.dump 一致），
// 值本身可以是任意文本（密文、纯文本历程）。
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub struct Store {
    dir: PathBuf,
}

fn bad_key(key: &str) -> bool {
    key.is_empty() || key.contains('/') || key.contains('\\') || key.contains("..")
}

impl Store {
    pub fn new(root: &Path, bucket: &str) -> Store {
        Store {
            dir: root.join(bucket),
        }
    }

    fn path_of(&self, key: &str) -> PathBuf {
        self.dir.join(format!("{}.json", key))
    }

    pub fn get(&self, key: &str) -> Option<String> {
        if bad_key(key) {
            return None;
        }
        // 与 Python 的 LocalStore 一致：文件里存的就是字符串本身（不做 JSON 转义）
        let text = fs::read_to_string(self.path_of(key)).ok()?;
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    }

    pub fn set(&self, key: &str, value: &str) -> bool {
        if bad_key(key) {
            return false;
        }
        if let Err(_e) = fs::create_dir_all(&self.dir) {
            return false;
        }
        fs::write(self.path_of(key), value.as_bytes()).is_ok()
    }

    pub fn delete(&self, key: &str) -> bool {
        if bad_key(key) {
            return false;
        }
        match fs::remove_file(self.path_of(key)) {
            Ok(_) => true,
            Err(e) if e.kind() == io::ErrorKind::NotFound => true,
            Err(_) => false,
        }
    }
}
