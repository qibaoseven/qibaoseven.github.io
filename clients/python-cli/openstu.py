#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenStu 命令行（Python 版，Windows / macOS / Linux 通吃）

为什么有它：C++ 版要自己编译，Windows 上还得装 MinGW/curl；这个版本只用标准库，
`py openstu.py <命令>` 直接跑，路径和数据结构与 backend/ 的 Python 服务端一致。

用法：
    py openstu.py config --server https://os-stu.netlify.app --class 51 --password xxx
    py openstu.py status
    py openstu.py scores --top 10
    py openstu.py score 23 +2 --reason 讲题
    ...
"""

import argparse
import getpass
import hashlib
import json
import os
import random
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path

# ---------------- 配置 ----------------

def config_dir() -> Path:
    if os.name == "nt":
        base = os.environ.get("APPDATA") or str(Path.home())
        return Path(base) / "openstu-cli"
    return Path(os.environ.get("XDG_CONFIG_HOME") or (Path.home() / ".config")) / "openstu-cli"


CONFIG_PATH = config_dir() / "config.json"
DEFAULT_SERVER = "https://os-stu.netlify.app"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"server": DEFAULT_SERVER, "class_id": "", "password": ""}


def save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(CONFIG_PATH, 0o600)   # Windows 上无效但无害
    except Exception:
        pass


# ---------------- 接口 ----------------

class Api:
    def __init__(self, cfg: dict):
        self.server = cfg["server"].rstrip("/")
        self.class_id = cfg["class_id"]
        self.password = cfg["password"]

    def _headers(self, auth: bool) -> dict:
        h = {"Accept": "application/json", "Content-Type": "application/json"}
        if auth and self.class_id:
            h["X-Password"] = self.password
            h["X-Password-Hash"] = hashlib.sha256(self.password.encode()).hexdigest()
        return h

    def call(self, path: str, method: str = "GET", body=None, auth: bool = True):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.server + path, data=data, method=method,
                                     headers=self._headers(auth))
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read().decode("utf-8", "replace")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            msg = f"HTTP {e.code}"
            try:
                o = json.loads(raw)
                if o.get("error"):
                    msg += " · " + str(o["error"])
            except Exception:
                pass
            raise SystemExit(msg)
        except urllib.error.URLError as e:
            raise SystemExit(f"连不上 {self.server}：{e.reason}")

    # ---- 班级数据 ----
    def data(self) -> dict:
        return self.call(f"/api/class/{self.class_id}").get("data", {})

    def save(self, data: dict) -> None:
        self.call(f"/api/class/{self.class_id}", "POST", {"data": data})

    def meta(self) -> dict:
        return self.call(f"/api/class/{self.class_id}/homework/meta")

    def classes(self) -> list:
        return self.call("/api/classes", auth=False)

    def roster(self) -> dict:
        return self.call(f"/api/class/{self.class_id}/students")

    def required(self, d: str = "") -> dict:
        return self.call(f"/api/class/{self.class_id}/homework/required?date={d or today()}")


def today() -> str:
    return date.today().isoformat()


def now_text() -> str:
    return datetime.now().strftime("%Y/%m/%d %H:%M:%S")


# ---------------- 数据整形 ----------------

def score_of(scores: dict, sid: str) -> float:
    v = scores.get(sid)
    if isinstance(v, list) and len(v) > 1:
        return float(v[1] or 0)
    if isinstance(v, dict):
        return float(v.get("score") or 0)
    return 0.0


def name_of(scores: dict, sid: str) -> str:
    v = scores.get(sid)
    if isinstance(v, list) and v:
        return str(v[0])
    if isinstance(v, dict):
        return str(v.get("name") or f"学号{sid}")
    return f"学号{sid}"


def set_score(scores: dict, sid: str, value: float) -> None:
    v = scores.get(sid)
    if isinstance(v, list):
        v[1] = value
    elif isinstance(v, dict):
        v["score"] = value
    else:
        scores[sid] = [f"学号{sid}", value]


def gold_of(data: dict, sid: str) -> float:
    return float((data.get("gold") or {}).get(sid, {}).get("amount") or 0)


def set_gold(data: dict, sid: str, value: float) -> None:
    data.setdefault("gold", {}).setdefault(sid, {})["amount"] = value


def add_log(data: dict, action: str, sid: str, name: str, change: float, current: float, reason: str) -> None:
    logs = data.setdefault("logs", [])
    logs.insert(0, {
        "timestamp": now_text(), "action": action, "student_id": sid, "student_name": name,
        "score_change": change, "current_score": current, "reason": reason,
        "page": "python-cli", "user_role": "teacher",
    })
    del logs[2000:]


def need_config(api: Api) -> None:
    if not api.class_id or not api.password:
        raise SystemExit("还没配置：先跑 openstu.py config --class 51 --password xxx")


# ---------------- 命令 ----------------

def cmd_config(args):
    cfg = load_config()
    if args.server:
        cfg["server"] = args.server
    if args.class_id:
        cfg["class_id"] = args.class_id
    if args.password:
        cfg["password"] = args.password
    if args.show:
        shown = dict(cfg)
        shown["password"] = "（已设置）" if cfg["password"] else "（未设置）"
        print(json.dumps(shown, ensure_ascii=False, indent=2))
    else:
        save_config(cfg)
        print("✓ 已保存到", CONFIG_PATH)


def cmd_classes(args):
    for c in Api(load_config()).classes():
        print(f"{c.get('id', ''):>8}  {c.get('name', '')}")


def cmd_status(args):
    api = Api(load_config()); need_config(api)
    req = api.required(args.date)
    names = req.get("subjectNames", {})
    subs = ", ".join(names.get(str(i), f"科目{i}") for i in req.get("required", []))
    print(f"{req.get('date')} · 已交 {req.get('submitted', 0)}/{req.get('total', 0)}")
    print(f"今日应交: {subs or '（全交齐或无作业）'}")


def cmd_list(args):
    api = Api(load_config()); need_config(api)
    r = api.roster()
    students = r.get("students", {})
    for sid in sorted(students, key=lambda x: int(x) if x.isdigit() else 0):
        print(f"{sid:>4}  {students[sid]}")


def cmd_scores(args):
    api = Api(load_config()); need_config(api)
    data = api.data()
    scores = data.get("scores", {})
    rows = [(sid, name_of(scores, sid), score_of(scores, sid), gold_of(data, sid))
            for sid in scores if sid != "0"]
    rows.sort(key=lambda r: r[3] if args.gold else r[2], reverse=True)
    for i, (sid, name, sc, g) in enumerate(rows[:args.top or len(rows)], 1):
        print(f"{i:>3}. {name:<8} {sid:>4}  分数 {sc:>6.1f}  金币 {g:>6.1f}")


def cmd_score(args):
    api = Api(load_config()); need_config(api)
    data = api.data(); scores = data.setdefault("scores", {})
    if args.student not in scores:
        raise SystemExit(f"没有学号 {args.student}")
    name = name_of(scores, args.student)
    old = score_of(scores, args.student)
    new = old + args.delta
    set_score(scores, args.student, new)
    add_log(data, "分数调整", args.student, name, args.delta, new, args.reason or "")
    api.save(data)
    print(f"✓ {name} 分数 {old} → {new}")


def cmd_gold(args):
    api = Api(load_config()); need_config(api)
    data = api.data(); scores = data.setdefault("scores", {})
    if args.student not in scores:
        raise SystemExit(f"没有学号 {args.student}")
    name = name_of(scores, args.student)
    old = gold_of(data, args.student)
    new = max(0.0, old + args.delta)
    set_gold(data, args.student, new)
    add_log(data, "金币调整", args.student, name, args.delta, new, args.reason or "")
    api.save(data)
    print(f"✓ {name} 金币 {old} → {new}")


def cmd_gacha(args):
    api = Api(load_config()); need_config(api)
    if not (datetime.now().weekday() == 4 and datetime.now().hour >= 12):
        raise SystemExit("抽奖只在周五 12:00 之后开放")
    data = api.data(); scores = data.get("scores", {})
    if args.student not in scores:
        raise SystemExit(f"没有学号 {args.student}")
    cost = 1600.0 if args.times >= 10 else 160.0
    gold = gold_of(data, args.student)
    if gold < cost:
        raise SystemExit(f"金币不够：现有 {gold}，需要 {cost}")
    pool = []
    rewards = data.get("rewards", {})
    for rarity, arr in rewards.items():
        if rarity == "hidden_rewards" or not isinstance(arr, list):
            continue
        for r in arr:
            pool.append((max(int(r.get("probability", 1)), 1), rarity, r))
    for r in rewards.get("hidden_rewards", []) or []:
        pool.append((max(int(r.get("probability", 1)), 1), "SP", r))
    total = sum(p[0] for p in pool)
    name = name_of(scores, args.student); score = score_of(scores, args.student)
    lines = []
    for _ in range(10 if args.times >= 10 else 1):
        pick = random.randrange(total) if total else -1
        chosen = None
        for w, rarity, r in pool:
            if pick < 0:
                break
            pick -= w
            if pick < 0:
                chosen = (rarity, r); break
        if not chosen:
            lines.append("谢谢参与"); continue
        rarity, r = chosen
        gain = float(r.get("score", 0) or 0)
        score += gain
        lines.append(f"[{rarity}] {r.get('name', '奖励')}" + (f" +{gain:g} 学分" if gain else ""))
    set_score(scores, args.student, score)
    set_gold(data, args.student, gold - cost)
    add_log(data, "十连抽消耗" if args.times >= 10 else "抽奖消耗", args.student, name,
            -cost, gold - cost, f"{args.times} 次")
    api.save(data)
    for line in lines:
        print("  " + line)
    print(f"金币 {gold} → {gold - cost} · 学分 {score}")


def cmd_journal(args):
    api = Api(load_config()); need_config(api)
    res = api.call(f"/api/class/{api.class_id}/journal/{args.student}")
    text = res.get("journal", "")
    print(text or "（还没有历程记录）")


def cmd_journal_add(args):
    api = Api(load_config()); need_config(api)
    api.call(f"/api/class/{api.class_id}/journal", "POST",
             {"student_id": str(args.student), "content": args.content})
    print("✓ 已追加")


def cmd_logs(args):
    api = Api(load_config()); need_config(api)
    logs = api.data().get("logs", [])
    if not logs:
        print("（暂无日志）"); return
    for l in logs[:args.n]:
        print(f"{l.get('timestamp', ''):<20} {l.get('action', ''):<8} {l.get('student_id', ''):>4} "
              f"{float(l.get('score_change', 0)):+6.1f}  {l.get('reason', '')}")


def cmd_groups(args):
    api = Api(load_config()); need_config(api)
    data = api.data(); groups = data.get("groups", {}); scores = data.get("scores", {})
    if not groups:
        print("（还没有分组）"); return
    for g, members in groups.items():
        vals = [score_of(scores, m) for m in members if m != "0"]
        avg = sum(vals) / len(vals) if vals else 0
        print(f"{g}: " + "、".join(f"{m} {name_of(scores, m)}" for m in members if m != "0") + f"  均分 {avg:.1f}")


def cmd_types(args):
    api = Api(load_config()); need_config(api)
    meta = api.meta()
    types = meta.get("types", {})
    names = meta.get("subjectNames", {})
    if not types:
        print("（没配作业种类：按整科已交计）"); return
    for k, arr in types.items():
        print(f"{names.get(k, '科目' + k)}: " + " ".join(f"{i}={v}" for i, v in enumerate(arr)))


def cmd_init(args):
    api = Api(load_config()); need_config(api)
    subjects = [s.strip() for s in args.subjects.split(",") if s.strip()]
    if not subjects:
        raise SystemExit("--subjects 至少要有一个科目")
    api.call(f"/api/class/{api.class_id}/homework/init", "POST", {
        "student_count": args.students,
        "subject_count": len(subjects),
        "subject_names": {str(i): s for i, s in enumerate(subjects)},
    })
    print(f"✓ 初始化 {args.students} 人 × {len(subjects)} 科")


def cmd_uids(args):
    api = Api(load_config()); need_config(api)
    uuids = api.call(f"/api/class/{api.class_id}/uuids").get("uuids", {})
    for uid, sid in uuids.items():
        print(f"{uid} → {sid}")


def cmd_uid(args):
    api = Api(load_config()); need_config(api)
    body = {"uid": args.uid, "student_id": args.student}
    if args.subject is not None:
        body["subject_id"] = args.subject
    if args.type is not None:
        body["type_id"] = args.type
    api.call(f"/api/class/{api.class_id}/uuids/add", "POST", body)
    print(f"✓ 已绑定 {args.uid} → {args.student}")


def cmd_positions(args):
    api = Api(load_config()); need_config(api)
    pos = api.data().get("positions", {})
    lst = pos.get("list", {})
    if not lst:
        print("（还没有职位）"); return
    for name, item in lst.items():
        members = item.get("members", [])
        print(f"👔 {name}  月薪 {item.get('salary', 0)} · " + ("、".join(members) if members else "（空缺）"))
    print("上次发薪:", pos.get("lastPayDate") or "从未")


def cmd_position_add(args):
    api = Api(load_config()); need_config(api)
    data = api.data()
    pos = data.setdefault("positions", {"list": {}, "defaultSalary": 5, "lastPayDate": None})
    pos.setdefault("list", {})[args.name] = {"salary": args.salary, "members": []}
    api.save(data)
    print(f"✓ 已添加职位「{args.name}」月薪 {args.salary}")


def cmd_position_join(args):
    api = Api(load_config()); need_config(api)
    data = api.data()
    lst = data.setdefault("positions", {}).setdefault("list", {})
    if args.name not in lst:
        raise SystemExit(f"没有这个职位: {args.name}")
    members = lst[args.name].setdefault("members", [])
    if str(args.student) not in members:
        members.append(str(args.student))
    api.save(data)
    print(f"✓ 已把 {args.student} 登记到「{args.name}」")


def cmd_pay(args):
    api = Api(load_config()); need_config(api)
    data = api.data()
    lst = data.get("positions", {}).get("list", {})
    if not lst:
        raise SystemExit("（还没有职位）")
    total = 0.0; people = 0
    for name, item in lst.items():
        for m in item.get("members", []):
            set_gold(data, m, gold_of(data, m) + float(item.get("salary", 0)))
            total += float(item.get("salary", 0)); people += 1
    data.setdefault("positions", {})["lastPayDate"] = today()
    api.save(data)
    print(f"✓ 发放 {people} 人次，共 {total:g} 金币")


def cmd_exam(args):
    api = Api(load_config()); need_config(api)
    data = api.data(); exams = data.get("examScores", {})
    if not exams:
        print("（还没有考试记录）"); return
    scores = data.get("scores", {})
    for sid, arr in exams.items():
        if args.student and sid != str(args.student):
            continue
        print(f"\n学号 {sid} {name_of(scores, sid)}")
        for e in arr:
            full = float(e.get("full", 0) or 0)
            sc = float(e.get("score", 0) or 0)
            print(f"  {e.get('date', ''):<12} {e.get('subject', ''):<6} {e.get('name', ''):<12} "
                  f"{sc:>5g}/{full:g}  ({sc / full * 100:.0f}%)" if full else
                  f"  {e.get('date', '')} {e.get('subject', '')} {e.get('name', '')} {sc:g}")


def cmd_exam_add(args):
    api = Api(load_config()); need_config(api)
    data = api.data()
    if str(args.student) not in data.get("scores", {}):
        raise SystemExit(f"没有学号 {args.student}")
    data.setdefault("examScores", {}).setdefault(str(args.student), []).append({
        "id": str(int(datetime.now().timestamp())), "date": args.date or today(),
        "name": args.name, "subject": args.subject, "score": args.score, "full": args.full,
    })
    api.save(data)
    print(f"✓ 已录入 {args.student} 的 {args.subject} {args.name}：{args.score:g}/{args.full:g}")


def cmd_report(args):
    api = Api(load_config()); need_config(api)
    data = api.data()
    dr = (data.get("dailyReport") or {}).get(today())
    print(f"每日汇报 · {today()}")
    if not dr:
        print("  今日还没有汇报记录")
    else:
        print(f"  状态: {'✅ 已全部汇报' if dr.get('allReported') else '⭕ 未完成'}  最后汇报: {dr.get('lastReportTime') or '-'}")
    scores = [v for k, v in data.get("scores", {}).items() if k != "0"]
    avg = sum(score_of(data.get("scores", {}), k) for k in data.get("scores", {}) if k != "0")
    print(f"  全班 {len(scores)} 人，平均分 {avg / len(scores) if scores else 0:.1f}")


def cmd_backup(args):
    api = Api(load_config()); need_config(api)
    data = api.data()
    path = Path(args.path or "openstu-backup.json")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ 已导出 {path}（{path.stat().st_size} 字节）")


def cmd_account(args):
    api = Api(load_config())
    print(f"服务器: {api.server}\n班级: {api.class_id or '（未设置）'}\n"
          f"密码: {'（已设置）' if api.password else '（未设置）'}")
    try:
        for c in api.classes():
            if c.get("id") == api.class_id:
                print("班级名称:", c.get("name"))
    except SystemExit:
        pass


# ---------------- 入口 ----------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="openstu.py", description="OpenStu 命令行（Python 版）")
    sub = p.add_subparsers(dest="cmd")

    s = sub.add_parser("config", help="配置服务器/班级/密码")
    s.add_argument("--server")
    s.add_argument("--class", dest="class_id")
    s.add_argument("--password")
    s.add_argument("--show", action="store_true")
    s.set_defaults(func=cmd_config)

    for name, fn, h in [
        ("classes", cmd_classes, "列出公开班级"),
        ("status", cmd_status, "今日应交与进度"),
        ("list", cmd_list, "名册"),
        ("scores", cmd_scores, "分数/金币排行"),
        ("logs", cmd_logs, "操作日志"),
        ("groups", cmd_groups, "分组与组均分"),
        ("types", cmd_types, "已配作业种类"),
        ("uids", cmd_uids, "卡号字典"),
        ("positions", cmd_positions, "职位列表"),
        ("pay", cmd_pay, "给所有班干发工资"),
        ("exam", cmd_exam, "考试记录"),
        ("report", cmd_report, "每日汇报状态"),
        ("backup", cmd_backup, "导出整班 JSON"),
        ("account", cmd_account, "显示连接信息"),
    ]:
        s = sub.add_parser(name, help=h)
        s.set_defaults(func=fn)
        if name == "status":
            s.add_argument("--date", default="")
        if name == "scores":
            s.add_argument("--top", type=int, default=0)
            s.add_argument("--gold", action="store_true")
        if name == "logs":
            s.add_argument("--n", type=int, default=30)
        if name == "exam":
            s.add_argument("student", nargs="?", default="")
        if name == "backup":
            s.add_argument("path", nargs="?", default="")

    s = sub.add_parser("score", help="加减分")
    s.add_argument("student"); s.add_argument("delta", type=float)
    s.add_argument("--reason", default="")
    s.set_defaults(func=cmd_score)

    s = sub.add_parser("gold", help="加减金币")
    s.add_argument("student"); s.add_argument("delta", type=float)
    s.add_argument("--reason", default="")
    s.set_defaults(func=cmd_gold)

    s = sub.add_parser("gacha", help="抽奖")
    s.add_argument("student"); s.add_argument("--times", type=int, default=1)
    s.set_defaults(func=cmd_gacha)

    s = sub.add_parser("journal", help="读学生历程")
    s.add_argument("student", type=int); s.set_defaults(func=cmd_journal)

    s = sub.add_parser("journal-add", help="追加学生历程")
    s.add_argument("student", type=int); s.add_argument("content")
    s.set_defaults(func=cmd_journal_add)

    s = sub.add_parser("init", help="作业系统初始化")
    s.add_argument("--students", type=int, required=True)
    s.add_argument("--subjects", required=True)
    s.set_defaults(func=cmd_init)

    s = sub.add_parser("uid", help="绑定卡号")
    s.add_argument("uid"); s.add_argument("student", type=int)
    s.add_argument("--subject", type=int); s.add_argument("--type", type=int)
    s.set_defaults(func=cmd_uid)

    s = sub.add_parser("position-add", help="添加职位")
    s.add_argument("name"); s.add_argument("--salary", type=float, default=5)
    s.set_defaults(func=cmd_position_add)

    s = sub.add_parser("position-join", help="登记任职")
    s.add_argument("name"); s.add_argument("student", type=int)
    s.set_defaults(func=cmd_position_join)

    s = sub.add_parser("exam-add", help="录入考试成绩")
    s.add_argument("student", type=int); s.add_argument("subject"); s.add_argument("name")
    s.add_argument("score", type=float); s.add_argument("--full", type=float, default=100)
    s.add_argument("--date", default="")
    s.set_defaults(func=cmd_exam_add)

    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 0
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
