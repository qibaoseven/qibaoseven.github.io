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

  static async request(path: string, method: http.RequestMethod,
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

// ============ 班级数据（分数/金币/日志/分组） ============
export interface ScoreRow {
  sid: string;
  name: string;
  score: number;
  gold: number;
}

export class ClassApi {
  /** 整包班级数据（原样 JSON 字符串，改完再回传） */
  static async load(): Promise<string> {
    const r = await Api.request(`/api/class/${Api.classId}`, http.RequestMethod.GET);
    if (!r.ok()) throw new Error('读取班级数据失败');
    const o = JSON.parse(r.body) as Record<string, Object>;
    const data = o['data'] as Object;
    return JSON.stringify(data);
  }

  static async save(json: string): Promise<void> {
    const payload: Record<string, Object> = { 'data': JSON.parse(json) as Object };
    const r = await Api.request(`/api/class/${Api.classId}`, http.RequestMethod.POST,
      JSON.stringify(payload));
    if (!r.ok()) throw new Error('保存失败 HTTP ' + r.code);
  }

  static async meta(): Promise<string> {
    const r = await Api.request(`/api/class/${Api.classId}/homework/meta`, http.RequestMethod.GET);
    if (!r.ok()) throw new Error('读取作业元信息失败');
    return r.body;
  }

  static rowsOf(json: string): ScoreRow[] {
    const out: ScoreRow[] = [];
    try {
      const d = JSON.parse(json) as Record<string, Object>;
      const scores = d['scores'] as Record<string, Object>;
      const golds = d['gold'] as Record<string, Object>;
      if (scores === undefined) return out;
      const keys = Object.keys(scores);
      for (const sid of keys) {
        if (sid === '0') continue;
        const row = scores[sid];
        let name = '学号' + sid;
        let score = 0;
        if (Array.isArray(row)) {
          const arr = row as Object[];
          if (arr.length > 1) {
            name = arr[0] as string;
            score = arr[1] as number;
          }
        } else {
          const o = row as Record<string, Object>;
          if (o['name'] !== undefined) name = o['name'] as string;
          if (o['score'] !== undefined) score = o['score'] as number;
        }
        let gold = 0;
        if (golds !== undefined && golds[sid] !== undefined) {
          const g = golds[sid] as Record<string, Object>;
          if (g['amount'] !== undefined) gold = g['amount'] as number;
        }
        out.push({ sid: sid, name: name, score: score, gold: gold });
      }
    } catch (e) {
      // 数据不合法时返回空表
    }
    return out;
  }

  /** 加减分 / 加减金币，同时写一条操作日志，然后整包回写 */
  static async adjust(sid: string, scoreDelta: number, goldDelta: number, reason: string): Promise<string> {
    const json = await ClassApi.load();
    const d = JSON.parse(json) as Record<string, Object>;

    const scores = d['scores'] as Record<string, Object>;
    if (scores === undefined || scores[sid] === undefined) return '没有学号 ' + sid;
    const row = scores[sid];
    let name = '学号' + sid;
    let newScore = 0;
    let oldScore = 0;
    if (Array.isArray(row)) {
      const arr = row as Object[];
      name = arr[0] as string;
      oldScore = arr[1] as number;
      newScore = oldScore + scoreDelta;
      arr[1] = newScore;
    } else {
      const o = row as Record<string, Object>;
      if (o['name'] !== undefined) name = o['name'] as string;
      if (o['score'] !== undefined) oldScore = o['score'] as number;
      newScore = oldScore + scoreDelta;
      o['score'] = newScore;
    }

    let golds = d['gold'] as Record<string, Object>;
    if (golds === undefined) {
      golds = {};
      d['gold'] = golds;
    }
    let entry = golds[sid] as Record<string, Object>;
    if (entry === undefined) {
      entry = { 'amount': 0 };
      golds[sid] = entry;
    }
    const oldGold = entry['amount'] !== undefined ? entry['amount'] as number : 0;
    let newGold = oldGold;
    if (goldDelta !== 0) {
      newGold = Math.max(0, oldGold + goldDelta);
      entry['amount'] = newGold;
    }

    ClassApi.pushLog(d, scoreDelta !== 0 ? '分数调整' : '金币调整', sid, name,
      scoreDelta !== 0 ? scoreDelta : goldDelta,
      scoreDelta !== 0 ? newScore : newGold, reason);

    await ClassApi.save(JSON.stringify(d));
    return scoreDelta !== 0
      ? `✓ ${name} 分数 ${oldScore} → ${newScore}`
      : `✓ ${name} 金币 ${oldGold} → ${newGold}`;
  }

  private static pushLog(d: Record<string, Object>, action: string, sid: string, name: string,
                        change: number, current: number, reason: string): void {
    const now = new Date();
    const ts = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/` +
      `${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:` +
      `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    let logs = d['logs'] as Object[];
    if (logs === undefined) logs = [];
    const entry: Record<string, Object> = {
      'timestamp': ts, 'action': action, 'student_id': sid, 'student_name': name,
      'score_change': change, 'current_score': current, 'reason': reason,
      'page': 'harmony', 'user_role': 'teacher'
    };
    logs.unshift(entry);
    d['logs'] = logs.length > 2000 ? logs.slice(0, 2000) : logs;
  }

  /** 抽奖：周五 12:00 后开放，单抽 160 / 十连 1600，rewards 的 probability 当权重 */
  static async gacha(sid: string, times: number): Promise<string> {
    const now = new Date();
    if (now.getDay() !== 5 || now.getHours() < 12) return '抽奖只在周五 12:00 之后开放';
    const cost = times >= 10 ? 1600 : 160;

    const json = await ClassApi.load();
    const d = JSON.parse(json) as Record<string, Object>;
    const scores = d['scores'] as Record<string, Object>;
    if (scores === undefined || scores[sid] === undefined) return '没有学号 ' + sid;

    let golds = d['gold'] as Record<string, Object>;
    if (golds === undefined) {
      golds = {};
      d['gold'] = golds;
    }
    let entry = golds[sid] as Record<string, Object>;
    if (entry === undefined) {
      entry = { 'amount': 0 };
      golds[sid] = entry;
    }
    const have = entry['amount'] !== undefined ? entry['amount'] as number : 0;
    if (have < cost) return `金币不够：现有 ${have}，需要 ${cost}`;

    // 奖励池
    const names: string[] = [];
    const weights: number[] = [];
    const gains: number[] = [];
    const rewards = d['rewards'] as Record<string, Object>;
    if (rewards !== undefined) {
      const rarities = Object.keys(rewards);
      for (const rarity of rarities) {
        if (rarity === 'hidden_rewards') continue;
        const arr = rewards[rarity] as Object[];
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          const o = item as Record<string, Object>;
          names.push((o['name'] !== undefined ? o['name'] as string : '奖励') + `[${rarity}]`);
          weights.push(o['probability'] !== undefined ? o['probability'] as number : 1);
          gains.push(o['score'] !== undefined ? o['score'] as number : 0);
        }
      }
      const hidden = rewards['hidden_rewards'] as Object[];
      if (Array.isArray(hidden)) {
        for (const item of hidden) {
          const o = item as Record<string, Object>;
          names.push((o['name'] !== undefined ? o['name'] as string : '奖励') + '[SP]');
          weights.push(o['probability'] !== undefined ? o['probability'] as number : 1);
          gains.push(o['score'] !== undefined ? o['score'] as number : 0);
        }
      }
    }
    const total = weights.reduce((a, b) => a + b, 0);

    const row = scores[sid];
    let name = '学号' + sid;
    let score = 0;
    let scoreArr: Object[] | null = null;
    if (Array.isArray(row)) {
      scoreArr = row as Object[];
      name = scoreArr[0] as string;
      score = scoreArr[1] as number;
    } else {
      const o = row as Record<string, Object>;
      if (o['name'] !== undefined) name = o['name'] as string;
      if (o['score'] !== undefined) score = o['score'] as number;
    }

    const lines: string[] = [];
    const count = times >= 10 ? 10 : 1;
    for (let i = 0; i < count; i++) {
      let idx = 0;
      let pick = Math.floor(Math.random() * Math.max(total, 1));
      if (total > 0) {
        for (let k = 0; k < weights.length; k++) {
          pick -= weights[k];
          if (pick < 0) {
            idx = k;
            break;
          }
        }
      }
      const gain = total > 0 ? gains[idx] : 0;
      score += gain;
      lines.push(total > 0 ? `${names[idx]}${gain !== 0 ? ' +' + gain + ' 学分' : ''}` : '谢谢参与');
    }

    if (scoreArr !== null) {
      scoreArr[1] = score;
    } else {
      (row as Record<string, Object>)['score'] = score;
    }
    entry['amount'] = have - cost;
    ClassApi.pushLog(d, times >= 10 ? '十连抽消耗' : '抽奖消耗', sid, name, -cost, have - cost, `${times} 次`);
    await ClassApi.save(JSON.stringify(d));
    return lines.join('\n') + `\n金币 ${have} → ${have - cost}·学分 ${score}`;
  }

  static async initHomework(count: number, subjects: string[]): Promise<string> {
    const names: Record<string, Object> = {};
    subjects.forEach((s, i) => { names[i.toString()] = s; });
    const payload: Record<string, Object> = {
      'student_count': count, 'subject_count': subjects.length, 'subject_names': names
    };
    const r = await Api.request(`/api/class/${Api.classId}/homework/init`,
      http.RequestMethod.POST, JSON.stringify(payload));
    if (!r.ok()) throw new Error('初始化失败 HTTP ' + r.code);
    return `✓ 初始化 ${count} 人 × ${subjects.length} 科`;
  }

  static async journal(sid: number): Promise<string> {
    const r = await Api.request(`/api/class/${Api.classId}/journal/${sid}`, http.RequestMethod.GET);
    if (!r.ok()) throw new Error('读取历程失败');
    const o = JSON.parse(r.body) as Record<string, Object>;
    return o['journal'] !== undefined ? o['journal'] as string : '';
  }

  static async journalAdd(sid: number, text: string): Promise<void> {
    const payload: Record<string, Object> = { 'student_id': sid.toString(), 'content': text };
    const r = await Api.request(`/api/class/${Api.classId}/journal`, http.RequestMethod.POST,
      JSON.stringify(payload));
    if (!r.ok()) throw new Error('追加失败 HTTP ' + r.code);
  }

  static logsText(json: string, limit: number): string[] {
    const out: string[] = [];
    try {
      const d = JSON.parse(json) as Record<string, Object>;
      const logs = d['logs'] as Object[];
      if (logs === undefined) return out;
      for (let i = 0; i < Math.min(logs.length, limit); i++) {
        const l = logs[i] as Record<string, Object>;
        const a = l['action'] !== undefined ? l['action'] as string : '';
        const n = l['student_name'] !== undefined ? l['student_name'] as string : '';
        const t = l['timestamp'] !== undefined ? l['timestamp'] as string : '';
        const r = l['reason'] !== undefined ? l['reason'] as string : '';
        const c = l['score_change'] !== undefined ? l['score_change'] as number : 0;
        out.push(`${t} · ${a} · ${n} ${c >= 0 ? '+' : ''}${c} · ${r}`);
      }
    } catch (e) {
      // 忽略坏数据
    }
    return out;
  }

  /** 职位 / 考试 / 汇报的纯文本视图（网页端对应页在移动端先给只读） */
  static extraLines(json: string): string[] {
    const out: string[] = [];
    try {
      const d = JSON.parse(json) as Record<string, Object>;
      const pos = d['positions'] as Record<string, Object>;
      if (pos !== undefined) {
        const list = pos['list'] as Record<string, Object>;
        if (list !== undefined) {
          Object.keys(list).forEach((name) => {
            const item = list[name] as Record<string, Object>;
            const members = item['members'] as Object[];
            const salary = item['salary'] !== undefined ? item['salary'] as number : 0;
            const who = Array.isArray(members) && members.length > 0 ? members.join('、') : '（空缺）';
            out.push(`👔 ${name}  月薪 ${salary} · ${who}`);
          });
        }
        out.push('上次发薪: ' + (pos['lastPayDate'] !== undefined ? pos['lastPayDate'] as string : '从未'));
      }
      const exams = d['examScores'] as Record<string, Object>;
      if (exams !== undefined) {
        Object.keys(exams).forEach((sid) => {
          const arr = exams[sid] as Object[];
          if (!Array.isArray(arr)) return;
          for (const e of arr) {
            const o = e as Record<string, Object>;
            const subject = o['subject'] !== undefined ? o['subject'] as string : '';
            const name = o['name'] !== undefined ? o['name'] as string : '';
            const sc = o['score'] !== undefined ? o['score'] as number : 0;
            const full = o['full'] !== undefined ? o['full'] as number : 0;
            out.push(`📝 ${sid} ${subject} ${name} ${sc}/${full}`);
          }
        });
      }
      const dr = d['dailyReport'] as Record<string, Object>;
      if (dr !== undefined) {
        Object.keys(dr).forEach((day) => {
          const o = dr[day] as Record<string, Object>;
          const done = o['allReported'] !== undefined ? o['allReported'] as boolean : false;
          out.push(`📋 ${day} 汇报: ${done ? '✅ 已全部汇报' : '⭕ 未完成'}`);
        });
      }
      out.push(`💾 整班数据 ${json.length} 字节（备份=原样导出这段 JSON）`);
    } catch (e) {
      out.push('数据解析失败');
    }
    return out;
  }

  /** 自动事件列表文本 */
  static eventLines(json: string): string[] {
    const out: string[] = [];
    try {
      const d = JSON.parse(json) as Record<string, Object>;
      const events = d['autoEvents'] as Object[];
      if (Array.isArray(events)) {
        events.forEach((v, i) => {
          const e = v as Record<string, Object>;
          const freq = e['frequency'] !== undefined ? e['frequency'] as string : 'daily';
          let when = '';
          if (freq === 'weekly') when = '周' + e['dayOfWeek'];
          if (freq === 'monthly') when = e['dayOfMonth'] + ' 日';
          const targets = e['targets'] as Object[];
          const who = Array.isArray(targets) ? targets.join(',') : '';
          const change = e['change'] !== undefined ? e['change'] as number : 0;
          out.push(`[${i}] ${e['name']}  ${freq} ${when}  ${change >= 0 ? '+' : ''}${change}  ${who}`);
        });
      }
    } catch (e) {
      out.push('事件数据解析失败');
    }
    return out;
  }

  /** 执行到期事件：daily/weekly/monthly，按 targets 解析 all/group:/学号，写日志并整包保存 */
  static async runAutoEvents(): Promise<string> {
    const json = await ClassApi.load();
    const d = JSON.parse(json) as Record<string, Object>;
    const events = d['autoEvents'] as Object[];
    if (!Array.isArray(events) || events.length === 0) return '（还没有自动事件）';

    const now = new Date();
    const key = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-` +
      now.getDate().toString().padStart(2, '0');
    let scores = d['scores'] as Record<string, Object>;
    const groups = d['groups'] as Record<string, Object>;
    let applied = 0;

    for (const v of events) {
      const e = v as Record<string, Object>;
      const freq = e['frequency'] !== undefined ? e['frequency'] as string : 'daily';
      let due = false;
      if (freq === 'daily') due = true;
      else if (freq === 'weekly') due = now.getDay() === (e['dayOfWeek'] !== undefined ? e['dayOfWeek'] as number : 1);
      else if (freq === 'monthly') due = now.getDate() === (e['dayOfMonth'] !== undefined ? e['dayOfMonth'] as number : 1);
      if (!due) continue;
      const lastRun = (e['lastRun'] !== undefined ? e['lastRun'] : {}) as Record<string, Object>;
      const ran = lastRun[key] !== undefined && (lastRun[key] as boolean);
      if (ran) continue;

      const ids: string[] = [];
      const targets = e['targets'] as Object[];
      if (Array.isArray(targets)) {
        for (const t of targets) {
          const tg = t as string;
          if (tg === 'all') Object.keys(scores).forEach((sid) => ids.push(sid));
          else if (tg.startsWith('group:')) {
            const mem = groups[tg.substring(6)] as Object[];
            if (Array.isArray(mem)) mem.forEach((m) => ids.push(m as string));
          } else ids.push(tg);
        }
      }
      const change = e['change'] !== undefined ? e['change'] as number : 0;
      const reason = e['reason'] !== undefined ? e['reason'] as string : '自动事件';
      const seen: string[] = [];
      for (const sid of ids) {
        if (sid === '0' || seen.indexOf(sid) >= 0) continue;
        seen.push(sid);
        if (scores[sid] === undefined) continue;
        const row = scores[sid];
        let name = '学号' + sid;
        let newScore = 0;
        if (Array.isArray(row)) {
          const arr = row as Object[];
          name = arr[0] as string;
          newScore = (arr[1] as number) + change;
          arr[1] = newScore;
        } else {
          const o = row as Record<string, Object>;
          if (o['name'] !== undefined) name = o['name'] as string;
          const old = o['score'] !== undefined ? o['score'] as number : 0;
          newScore = old + change;
          o['score'] = newScore;
        }
        let logs = d['logs'] as Object[];
        if (!Array.isArray(logs)) logs = [];
        logs.unshift({
          'timestamp': `${key} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`,
          'action': '自动事件', 'student_id': sid, 'student_name': name,
          'score_change': change, 'current_score': newScore, 'reason': reason,
          'page': 'harmony', 'user_role': 'system'
        });
        d['logs'] = logs.length > 2000 ? logs.slice(0, 2000) : logs;
        applied++;
      }
      lastRun[key] = true;
      e['lastRun'] = lastRun;
    }
    d['scores'] = scores;
    d['autoEvents'] = events;
    await ClassApi.save(JSON.stringify(d));
    return `✓ 执行完成：改动 ${applied} 人次`;
  }
}
