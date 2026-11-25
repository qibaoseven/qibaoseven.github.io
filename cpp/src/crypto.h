// ========================================
// OpenStu v0.46 (C++)
// 自带密码学：SHA-256 / HMAC-SHA256 / AES-256-GCM / Base64
// 不依赖 OpenSSL，Windows 直接静态链接即可，保证单 exe 可分发。
// 与 Python 版本的兼容点：
//   key   = HMAC-SHA256(key=password, msg="")
//   密文  = base64( iv(12) || authTag(16) || ciphertext )
// ========================================
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <string>
#include <vector>

// ---------- SHA-256（移植自固件的 sha256.h）----------
namespace osc {

class Sha256 {
public:
  Sha256() { reset(); }

  void reset() {
    h_[0] = 0x6a09e667u; h_[1] = 0xbb67ae85u; h_[2] = 0x3c6ef372u; h_[3] = 0xa54ff53au;
    h_[4] = 0x510e527fu; h_[5] = 0x9b05688cu; h_[6] = 0x1f83d9abu; h_[7] = 0x5be0cd19u;
    len_ = 0; bufLen_ = 0;
  }

  void update(const void* data, size_t size) {
    const uint8_t* p = (const uint8_t*)data;
    len_ += (uint64_t)size;
    while (size) {
      if (bufLen_ == 0 && size >= 64) {
        block(p);
        p += 64; size -= 64;
      } else {
        size_t take = 64 - bufLen_;
        if (take > size) take = size;
        memcpy(buf_ + bufLen_, p, take);
        bufLen_ += take; p += take; size -= take;
        if (bufLen_ == 64) { block(buf_); bufLen_ = 0; }
      }
    }
  }

  void finish(uint8_t out[32]) {
    uint64_t bits = len_ * 8;
    uint8_t pad = 0x80;
    update(&pad, 1);
    uint8_t zero = 0;
    while (bufLen_ != 56) update(&zero, 1);
    uint8_t lenBytes[8];
    for (int i = 0; i < 8; ++i) lenBytes[i] = (uint8_t)(bits >> (56 - 8 * i));
    // 直接塞进缓冲，避免 update 修改 len_
    uint64_t savedLen = len_;
    update(lenBytes, 8);
    len_ = savedLen;
    for (int i = 0; i < 8; ++i) {
      out[i * 4 + 0] = (uint8_t)(h_[i] >> 24);
      out[i * 4 + 1] = (uint8_t)(h_[i] >> 16);
      out[i * 4 + 2] = (uint8_t)(h_[i] >> 8);
      out[i * 4 + 3] = (uint8_t)(h_[i]);
    }
    bufLen_ = 0;
  }

private:
  static uint32_t ror(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }

  void block(const uint8_t* p) {
    static const uint32_t K[64] = {
      0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
      0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
      0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
      0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
      0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
      0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
      0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
      0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
    };
    uint32_t w[64];
    for (int i = 0; i < 16; ++i) {
      w[i] = ((uint32_t)p[i * 4] << 24) | ((uint32_t)p[i * 4 + 1] << 16)
           | ((uint32_t)p[i * 4 + 2] << 8) | (uint32_t)p[i * 4 + 3];
    }
    for (int i = 16; i < 64; ++i) {
      uint32_t s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >> 3);
      uint32_t s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = h_[0], b = h_[1], c = h_[2], d = h_[3];
    uint32_t e = h_[4], f = h_[5], g = h_[6], h = h_[7];
    for (int i = 0; i < 64; ++i) {
      uint32_t S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      uint32_t ch = (e & f) ^ (~e & g);
      uint32_t t1 = h + S1 + ch + K[i] + w[i];
      uint32_t S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
      uint32_t t2 = S0 + maj;
      h = g; g = f; f = e; e = d + t1;
      d = c; c = b; b = a; a = t1 + t2;
    }
    h_[0] += a; h_[1] += b; h_[2] += c; h_[3] += d;
    h_[4] += e; h_[5] += f; h_[6] += g; h_[7] += h;
  }

  uint32_t h_[8];
  uint64_t len_;
  uint8_t  buf_[64];
  size_t   bufLen_;
};

inline std::string sha256Hex(const std::string& s) {
  Sha256 ctx;
  ctx.update(s.data(), s.size());
  uint8_t d[32];
  ctx.finish(d);
  std::string out;
  out.resize(64);
  for (int i = 0; i < 32; ++i) snprintf(&out[i * 2], 3, "%02x", d[i]);
  return out;
}

inline void hmacSha256(const std::string& key, const std::string& msg, uint8_t out[32]) {
  uint8_t k[64] = {0};
  if (key.size() > 64) {
    Sha256 c; c.update(key.data(), key.size());
    uint8_t kd[32]; c.finish(kd);
    memcpy(k, kd, 32);
  } else {
    memcpy(k, key.data(), key.size());
  }
  uint8_t ipad[64], opad[64];
  for (int i = 0; i < 64; ++i) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }

  uint8_t inner[32];
  { Sha256 c; c.update(ipad, 64); c.update(msg.data(), msg.size()); c.finish(inner); }
  Sha256 c2; c2.update(opad, 64); c2.update(inner, 32); c2.finish(out);
}

// derive_key：与 Python 的 hmac.new(password, digestmod=sha256).digest() 一致
inline std::vector<uint8_t> deriveKey(const std::string& password) {
  uint8_t out[32];
  hmacSha256(password, std::string(), out);
  return std::vector<uint8_t>(out, out + 32);
}

// ---------- Base64 ----------
inline std::string base64Encode(const uint8_t* data, size_t len) {
  static const char* tbl = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve((len + 2) / 3 * 4);
  for (size_t i = 0; i < len; i += 3) {
    uint32_t v = (uint32_t)data[i] << 16;
    bool b1 = i + 1 < len, b2 = i + 2 < len;
    if (b1) v |= (uint32_t)data[i + 1] << 8;
    if (b2) v |= (uint32_t)data[i + 2];
    out.push_back(tbl[(v >> 18) & 63]);
    out.push_back(tbl[(v >> 12) & 63]);
    out.push_back(b1 ? tbl[(v >> 6) & 63] : '=');
    out.push_back(b2 ? tbl[v & 63] : '=');
  }
  return out;
}
inline std::string base64Encode(const std::vector<uint8_t>& v) {
  return base64Encode(v.data(), v.size());
}

inline bool base64Decode(const std::string& in, std::vector<uint8_t>& out) {
  auto val = [](char c) -> int {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
  };
  out.clear();
  uint32_t buf = 0;
  int bits = 0;
  for (char c : in) {
    if (c == '=' || c == '\n' || c == '\r' || c == ' ') continue;
    int v = val(c);
    if (v < 0) return false;
    buf = (buf << 6) | (uint32_t)v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push_back((uint8_t)((buf >> bits) & 0xFF));
    }
  }
  return true;
}

// ---------- AES-256（加密方向，块）----------
class Aes256 {
public:
  void setKey(const uint8_t* key) {
    initSbox();
    // 扩展密钥：Nk=8, Nr=14 → 60 words
    for (int i = 0; i < 8; ++i) {
      rk_[i] = ((uint32_t)key[4 * i] << 24) | ((uint32_t)key[4 * i + 1] << 16)
             | ((uint32_t)key[4 * i + 2] << 8) | (uint32_t)key[4 * i + 3];
    }
    uint8_t rcon = 1;
    for (int i = 8; i < 60; ++i) {
      uint32_t t = rk_[i - 1];
      if (i % 8 == 0) {
        t = ((uint32_t)sbox_[ (t >> 16) & 0xFF ] << 24)
          | ((uint32_t)sbox_[ (t >> 8) & 0xFF ] << 16)
          | ((uint32_t)sbox_[ t & 0xFF ] << 8)
          | (uint32_t)sbox_[ (t >> 24) & 0xFF ];
        t ^= ((uint32_t)rcon) << 24;
        rcon = xtime(rcon);
      } else if (i % 8 == 4) {
        t = ((uint32_t)sbox_[(t >> 24) & 0xFF] << 24)
          | ((uint32_t)sbox_[(t >> 16) & 0xFF] << 16)
          | ((uint32_t)sbox_[(t >> 8) & 0xFF] << 8)
          | (uint32_t)sbox_[t & 0xFF];
      }
      rk_[i] = rk_[i - 8] ^ t;
    }
  }

  void encryptBlock(const uint8_t in[16], uint8_t out[16]) const {
    uint8_t s[16];
    memcpy(s, in, 16);
    addRoundKey(s, 0);
    for (int r = 1; r < 14; ++r) {
      subBytes(s); shiftRows(s); mixColumns(s); addRoundKey(s, r);
    }
    subBytes(s); shiftRows(s); addRoundKey(s, 14);
    memcpy(out, s, 16);
  }

private:
  static uint8_t xtime(uint8_t x) { return (uint8_t)((x << 1) ^ ((x & 0x80) ? 0x1B : 0)); }
  static uint8_t gmul(uint8_t a, uint8_t b) {
    uint8_t p = 0;
    for (int i = 0; i < 8; ++i) {
      if (b & 1) p ^= a;
      uint8_t hi = a & 0x80;
      a <<= 1;
      if (hi) a ^= 0x1B;
      b >>= 1;
    }
    return p;
  }
  static uint8_t ginv(uint8_t a) {
    if (a == 0) return 0;
    uint8_t r = 1;
    for (int i = 0; i < 254; ++i) r = gmul(r, a);   // a^254 = a^-1
    return r;
  }
  static void initSbox() {
    static bool done = false;
    if (done) return;
    // 构造期是单线程（启动时），不用加锁
    for (int i = 0; i < 256; ++i) {
      uint8_t x = ginv((uint8_t)i);
      uint8_t y = x ^ (uint8_t)((x << 1) | (x >> 7)) ^ (uint8_t)((x << 2) | (x >> 6))
                ^ (uint8_t)((x << 3) | (x >> 5)) ^ (uint8_t)((x << 4) | (x >> 4)) ^ 0x63;
      sbox_[i] = y;
    }
    done = true;
  }
  static void subBytes(uint8_t s[16]) { for (int i = 0; i < 16; ++i) s[i] = sbox_[s[i]]; }
  static void shiftRows(uint8_t s[16]) {
    uint8_t t;
    t = s[1]; s[1] = s[5]; s[5] = s[9];  s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t;  t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
  }
  static void mixColumns(uint8_t s[16]) {
    for (int c = 0; c < 4; ++c) {
      uint8_t* p = s + c * 4;
      uint8_t a0 = p[0], a1 = p[1], a2 = p[2], a3 = p[3];
      p[0] = (uint8_t)(gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3);
      p[1] = (uint8_t)(a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3);
      p[2] = (uint8_t)(a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3));
      p[3] = (uint8_t)(gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2));
    }
  }
  void addRoundKey(uint8_t s[16], int round) const {
    for (int c = 0; c < 4; ++c) {
      uint32_t k = rk_[round * 4 + c];
      s[c * 4 + 0] ^= (uint8_t)(k >> 24);
      s[c * 4 + 1] ^= (uint8_t)(k >> 16);
      s[c * 4 + 2] ^= (uint8_t)(k >> 8);
      s[c * 4 + 3] ^= (uint8_t)(k);
    }
  }

  uint32_t rk_[60];
  static uint8_t sbox_[256];
};

inline uint8_t Aes256::sbox_[256];

// ---------- AES-256-GCM ----------
class AesGcm {
public:
  void setKey(const std::vector<uint8_t>& key) {
    aes_.setKey(key.data());
    memset(h_, 0, 16);
    uint8_t z[16] = {0}, hout[16];
    aes_.encryptBlock(z, hout);
    memcpy(h_, hout, 16);
  }

  // 返回 base64(iv|tag|ct)，与 Python/JS 布局一致
  std::string encrypt(const std::vector<uint8_t>& key, const std::vector<uint8_t>& iv,
                      const std::vector<uint8_t>& plain) {
    setKey(key);
    std::vector<uint8_t> ct(plain.size());
    ctr(iv.data(), plain.data(), plain.size(), ct.data());

    uint8_t j0[16];
    memcpy(j0, iv.data(), 12);
    j0[12] = 0; j0[13] = 0; j0[14] = 0; j0[15] = 1;

    uint8_t tag[16];
    computeTag(j0, ct, tag);

    std::vector<uint8_t> out;
    out.insert(out.end(), iv.begin(), iv.end());
    out.insert(out.end(), tag, tag + 16);
    out.insert(out.end(), ct.begin(), ct.end());
    return base64Encode(out);
  }

  // 输入 base64，返回明文；tag 不匹配返回 false
  bool decrypt(const std::vector<uint8_t>& key, const std::string& b64,
               std::vector<uint8_t>& plain) {
    std::vector<uint8_t> buf;
    if (!base64Decode(b64, buf) || buf.size() < 28) return false;
    setKey(key);
    const uint8_t* iv = buf.data();
    const uint8_t* tag = buf.data() + 12;
    size_t ctLen = buf.size() - 28;
    std::vector<uint8_t> ct(buf.begin() + 28, buf.end());

    uint8_t j0[16];
    memcpy(j0, iv, 12);
    j0[12] = 0; j0[13] = 0; j0[14] = 0; j0[15] = 1;

    uint8_t calc[16];
    computeTag(j0, ct, calc);
    uint8_t diff = 0;
    for (int i = 0; i < 16; ++i) diff |= (uint8_t)(calc[i] ^ tag[i]);
    if (diff != 0) return false;

    plain.assign(ctLen, 0);
    ctr(iv, ct.data(), ctLen, plain.data());
    return true;
  }

private:
  static void xorBlock(uint8_t* a, const uint8_t* b) { for (int i = 0; i < 16; ++i) a[i] ^= b[i]; }

  void ctr(const uint8_t* iv, const uint8_t* in, size_t len, uint8_t* out) {
    uint8_t j0[16], ks[16];
    memcpy(j0, iv, 12);
    uint32_t ctrVal = 2;   // GCM 首块用 inc32(J0) = 2
    for (size_t off = 0; off < len; off += 16) {
      j0[12] = (uint8_t)(ctrVal >> 24);
      j0[13] = (uint8_t)(ctrVal >> 16);
      j0[14] = (uint8_t)(ctrVal >> 8);
      j0[15] = (uint8_t)ctrVal;
      ++ctrVal;
      aes_.encryptBlock(j0, ks);
      size_t n = len - off < 16 ? len - off : 16;
      for (size_t i = 0; i < n; ++i) out[off + i] = (uint8_t)(in[off + i] ^ ks[i]);
    }
  }

  // GF(2^128) 乘法，多项式 x^128 + x^7 + x^2 + x + 1
  static void gfMul(uint8_t* x, const uint8_t* y) {
    uint8_t z[16] = {0};
    uint8_t v[16];
    memcpy(v, y, 16);
    for (int i = 0; i < 128; ++i) {
      if ((x[i / 8] >> (7 - (i % 8))) & 1) xorBlock(z, v);
      bool lsb = (v[15] & 1) != 0;
      for (int j = 15; j > 0; --j) v[j] = (uint8_t)((v[j] >> 1) | (v[j - 1] << 7));
      v[0] >>= 1;
      if (lsb) v[0] ^= 0xE1;
    }
    memcpy(x, z, 16);
  }

  void ghash(const uint8_t* data, size_t len, uint8_t* y) const {
    uint8_t blk[16];
    for (size_t off = 0; off < len; off += 16) {
      // 末尾不足 16 字节的块补零（GCM 规定）
      size_t n = len - off < 16 ? len - off : 16;
      memset(blk, 0, 16);
      memcpy(blk, data + off, n);
      xorBlock(y, blk);
      gfMul(y, h_);
    }
  }

  void computeTag(const uint8_t j0[16], const std::vector<uint8_t>& ct, uint8_t* tag) const {
    uint8_t y[16] = {0};
    ghash(ct.data(), ct.size(), y);
    // len 块：bits(ct) || bits(AAD=0)，各 64 位大端
    uint8_t lenBlk[16] = {0};
    uint64_t bits = (uint64_t)ct.size() * 8;
    for (int i = 0; i < 8; ++i) lenBlk[8 + i] = (uint8_t)(bits >> (56 - 8 * i));
    xorBlock(y, lenBlk);
    gfMul(y, h_);

    uint8_t ek[16];
    aes_.encryptBlock(j0, ek);
    for (int i = 0; i < 16; ++i) tag[i] = (uint8_t)(ek[i] ^ y[i]);
  }

  Aes256 aes_;
  uint8_t h_[16];
};

}  // namespace osc
