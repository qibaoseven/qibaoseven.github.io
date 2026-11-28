/**
 * OpenStu 鸿蒙端接口层（ArkTS）
 * 只用系统 @kit.NetworkKit 的 http 模块 + 纯 TS 实现的 SHA-256，无第三方依赖。
 */

import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';

export interface ClassInfo {
  id: string;
  name: string;
}

export interface RosterResp {
  class_id: string;
  count: number;
  students: Record<string, string>;
}

export interface RequiredResp {
  class_id: string;
  date: string;
  required: number[];
  subjectNames: Record<string, string>;
  studentCount: number;
  submitted: number;
  total: number;
}

export interface HomeworkResp {
  data: number[][][];
  dateFrom: string;
  dateTo: string;
  totalDays: number;
}

export interface SubmitResp {
  student_id: number;
  target_date: string;
  subject_id: number;
  changed: boolean;
}

/** 一次请求的结果 */
export class ApiResult {
  code: number = 0;
  body: string = '';
  ok(): boolean {
    return this.code >= 200 && this.code < 300;
  }
}

export class Student {
  id: number;
  name: string;
  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }
}

// ============ SHA-256（接口鉴权头 X-Password-Hash 用） ============
class Sha256 {
  private static K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  private static rotr(x: number, n: number): number {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  static hex(input: string): string {
    // UTF-8
    const bytes: number[] = [];
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }

    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);

    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
    bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    for (let off = 0; off < bytes.length; off += 64) {
      const w: number[] = new Array<number>(64).fill(0);
      for (let i = 0; i < 16; i++) {
        const j = off + i * 4;
        w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const s0 = (Sha256.rotr(w[i - 15], 7) ^ Sha256.rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
        const s1 = (Sha256.rotr(w[i - 2], 17) ^ Sha256.rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = (Sha256.rotr(e, 6) ^ Sha256.rotr(e, 11) ^ Sha256.rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ ((~e) & g)) >>> 0;
        const t1 = (h + S1 + ch + Sha256.K[i] + w[i]) >>> 0;
        const S0 = (Sha256.rotr(a, 2) ^ Sha256.rotr(a, 13) ^ Sha256.rotr(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    let out = '';
    for (const v of [h0, h1, h2, h3, h4, h5, h6, h7]) {
      out += v.toString(16).padStart(8, '0');
    }
    return out;
  }
}

// ============ 接口客户端 ============
export class Api {
  static server: string = 'https://os-stu.netlify.app';
  static classId: string = '';
  static password: string = '';

  static configured(): boolean {
    return Api.classId.length > 0 && Api.password.length > 0;
  }

  static today(): string {
    const d = new Date();
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  private static async request(path: string, method: http.RequestMethod,
                                body: string = '', auth: boolean = true): Promise<ApiResult> {
    const result = new ApiResult();
    const client = http.createHttp();
    const header: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (auth && Api.classId.length > 0) {
      header['X-Password'] = Api.password;
      header['X-Password-Hash'] = Sha256.hex(Api.password);
    }
    try {
      let trimmed = Api.server.trim();
      while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, trimmed.length - 1);
      const resp = await client.request(trimmed + path, {
        method: method,
        header: header,
        connectTimeout: 10000,
        readTimeout: 20000,
        expectDataType: http.HttpDataType.STRING,
        extraData: body.length > 0 ? body : undefined
      });
      result.code = resp.responseCode as number;
      result.body = resp.result as string;
    } catch (e) {
      const err = e as BusinessError;
      result.code = -1;
      result.body = err.message !== undefined ? err.message : '网络错误';
    } finally {
      client.destroy();
    }
    return result;
  }

  private static errorOf(r: ApiResult): string {
    let prefix = `HTTP ${r.code}`;
    try {
      const o: Record<string, Object> = JSON.parse(r.body) as Record<string, Object>;
      const error = o['error'];
      const code = o['code'];
      if (error !== undefined) prefix += ` · ${error}`;
      if (code !== undefined) prefix += ` (${code})`;
    } catch (e) {
      // 不是 JSON 就只报状态码
    }
    return prefix;
  }

  static async classes(): Promise<ClassInfo[]> {
    const r = await Api.request('/api/classes', http.RequestMethod.GET, '', false);
    if (!r.ok()) throw new Error(Api.errorOf(r));
    const arr: ClassInfo[] = JSON.parse(r.body) as ClassInfo[];
    return arr;
  }

  static async roster(): Promise<RosterResp> {
    const r = await Api.request(`/api/class/${Api.classId}/students`, http.RequestMethod.GET);
    if (!r.ok()) throw new Error(Api.errorOf(r));
    return JSON.parse(r.body) as RosterResp;
  }

  static async required(date: string = ''): Promise<RequiredResp> {
    const d = date.length > 0 ? date : Api.today();
    const r = await Api.request(`/api/class/${Api.classId}/homework/required?date=${d}`, http.RequestMethod.GET);
    if (!r.ok()) throw new Error(Api.errorOf(r));
    return JSON.parse(r.body) as RequiredResp;
  }

  static async allHomework(): Promise<HomeworkResp> {
    const r = await Api.request(`/api/class/${Api.classId}/homework`, http.RequestMethod.GET);
    if (!r.ok()) throw new Error(Api.errorOf(r));
    return JSON.parse(r.body) as HomeworkResp;
  }

  static async submit(studentId: number, subjectId: number, date: string,
                      typeId: number = -1): Promise<SubmitResp> {
    const payload: Record<string, Object> = {
      'student_id': studentId,
      'target_date': date,
      'subject_id': subjectId
    };
    if (typeId >= 0) payload['type_id'] = typeId;
    const r = await Api.request(`/api/class/${Api.classId}/homework/update`,
      http.RequestMethod.POST, JSON.stringify(payload));
    if (!r.ok()) throw new Error(Api.errorOf(r));
    return JSON.parse(r.body) as SubmitResp;
  }
}
