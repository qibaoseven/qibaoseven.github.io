#ifndef OPENSTU_SHA256_H
#define OPENSTU_SHA256_H

// ========================================
// 极简 SHA-256（只为在设备上自己算班级密码哈希）
// ========================================
// 不依赖 BearSSL / axTLS / Hash.h，任何 ESP8266 core 版本都能编。
// 用法：char hex[65]; sha256_hex("706", hex);  → 64 位小写十六进制
// ========================================

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>

static inline uint32_t sha256_rotr(uint32_t x, uint8_t n) {
  return (x >> n) | (x << (32 - n));
}

static const uint32_t SHA256_K[64] = {
  0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
  0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
  0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
  0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
  0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
  0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
  0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
  0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u, 0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
};

static void sha256_block(uint32_t st[8], const uint8_t p[64]) {
  uint32_t w[64];
  for (int i = 0; i < 16; ++i) {
    w[i] = ((uint32_t)p[i * 4] << 24) | ((uint32_t)p[i * 4 + 1] << 16) |
           ((uint32_t)p[i * 4 + 2] << 8) | (uint32_t)p[i * 4 + 3];
  }
  for (int i = 16; i < 64; ++i) {
    uint32_t s0 = sha256_rotr(w[i - 15], 7) ^ sha256_rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = sha256_rotr(w[i - 2], 17) ^ sha256_rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }

  uint32_t a = st[0], b = st[1], c = st[2], d = st[3];
  uint32_t e = st[4], f = st[5], g = st[6], h = st[7];

  for (int i = 0; i < 64; ++i) {
    uint32_t s1 = sha256_rotr(e, 6) ^ sha256_rotr(e, 11) ^ sha256_rotr(e, 25);
    uint32_t ch = (e & f) ^ (~e & g);
    uint32_t t1 = h + s1 + ch + SHA256_K[i] + w[i];
    uint32_t s0 = sha256_rotr(a, 2) ^ sha256_rotr(a, 13) ^ sha256_rotr(a, 22);
    uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
    uint32_t t2 = s0 + maj;

    h = g; g = f; f = e; e = d + t1;
    d = c; c = b; b = a; a = t1 + t2;
  }

  st[0] += a; st[1] += b; st[2] += c; st[3] += d;
  st[4] += e; st[5] += f; st[6] += g; st[7] += h;
}

// 输出 64 位小写十六进制，out 至少 65 字节
static void sha256_hex(const char* text, char* out) {
  uint32_t st[8] = {
    0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
    0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u
  };

  const uint8_t* data = (const uint8_t*)text;
  size_t len = strlen(text);
  size_t offset = 0;

  while (offset + 64 <= len) {
    sha256_block(st, data + offset);
    offset += 64;
  }

  uint8_t tail[64];
  memset(tail, 0, sizeof(tail));
  size_t rest = len - offset;
  if (rest) memcpy(tail, data + offset, rest);
  tail[rest] = 0x80;

  if (rest >= 56) {
    sha256_block(st, tail);
    memset(tail, 0, sizeof(tail));
  }

  uint64_t bits = (uint64_t)len * 8u;
  for (int i = 0; i < 8; ++i) {
    tail[63 - i] = (uint8_t)(bits >> (8 * i));
  }
  sha256_block(st, tail);

  for (int i = 0; i < 8; ++i) {
    snprintf(out + i * 8, 9, "%08x", st[i]);
  }
  out[64] = '\0';
}

#endif // OPENSTU_SHA256_H
