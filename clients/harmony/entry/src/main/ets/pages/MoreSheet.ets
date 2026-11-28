/**
 * 鸿蒙端「更多功能」层：分数 / 金币 / 抽奖 / 日志 / 初始化 / 学生历程
 * 覆盖网页端对应页面，数据流与网页一致（GET 整包 → 本地改 → POST 覆盖）。
 */
import { ClassApi, ScoreRow } from '../model/Api';

@Component
export struct MoreSheet {
  onClose: () => void = () => {};
  @State tab: number = 0;
  @State busy: boolean = false;
  @State msg: string = '';
  @State rows: ScoreRow[] = [];
  @State logs: string[] = [];
  @State journalText: string = '';
  @State metaTypes: string[] = [];
  @State metaNames: string[] = [];
  @State extra: string[] = [];
  @State eventLines: string[] = [];
  @State sid: string = '';
  @State delta: string = '+2';
  @State reason: string = '';
  @State initCount: string = '51';
  @State initSubjects: string = '语文,数学';
  @State journalInput: string = '';

  aboutToAppear(): void {
    this.reload();
  }

  async reload(): Promise<void> {
    this.busy = true;
    try {
      const json = await ClassApi.load();
      this.rows = ClassApi.rowsOf(json);
      this.logs = ClassApi.logsText(json, 40);
      const meta = await ClassApi.meta();
      const o = JSON.parse(meta) as Record<string, Object>;
      const types = o['types'] as Record<string, Object>;
      const names = o['subjectNames'] as Record<string, Object>;
      const t: string[] = [];
      const n: string[] = [];
      if (types !== undefined) {
        Object.keys(types).forEach((k) => {
          t.push(`科目${k}：${(types[k] as Object[]).length} 种`);
        });
      }
      if (names !== undefined) {
        Object.keys(names).forEach((k) => { n.push(`${k}=${names[k] as string}`); });
      }
      this.metaTypes = t;
      this.metaNames = n;
      this.extra = ClassApi.extraLines(json);
      this.eventLines = ClassApi.eventLines(json);
    } catch (e) {
      this.msg = '读取失败：' + (e as Error).message;
    }
    this.busy = false;
  }

  async doAdjust(useGold: boolean): Promise<void> {
    const v = parseFloat(this.delta);
    if (isNaN(v)) { this.msg = '变化要填数字'; return; }
    this.busy = true;
    try {
      this.msg = await ClassApi.adjust(this.sid, useGold ? 0 : v, useGold ? v : 0, this.reason);
      await this.reload();
    } catch (e) {
      this.msg = '失败：' + (e as Error).message;
    }
    this.busy = false;
  }

  async doGacha(times: number): Promise<void> {
    this.busy = true;
    try {
      this.msg = await ClassApi.gacha(this.sid, times);
      await this.reload();
    } catch (e) {
      this.msg = '失败：' + (e as Error).message;
    }
    this.busy = false;
  }

  async doRunEvents(): Promise<void> {
    this.busy = true;
    try {
      this.msg = await ClassApi.runAutoEvents();
      await this.reload();
    } catch (e) {
      this.msg = '执行失败：' + (e as Error).message;
    }
    this.busy = false;
  }

  async doInit(): Promise<void> {
    const n = parseInt(this.initCount);
    const subs = this.initSubjects.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    if (isNaN(n) || n <= 0 || subs.length === 0) { this.msg = '学生数/科目不对'; return; }
    this.busy = true;
    try {
      this.msg = await ClassApi.initHomework(n, subs);
      await this.reload();
    } catch (e) {
      this.msg = '失败：' + (e as Error).message;
    }
    this.busy = false;
  }

  async loadJournal(): Promise<void> {
    const id = parseInt(this.sid);
    if (isNaN(id)) { this.msg = '学号要填数字'; return; }
    this.busy = true;
    try {
      this.journalText = await ClassApi.journal(id);
    } catch (e) {
      this.msg = '读取失败：' + (e as Error).message;
    }
    this.busy = false;
  }

  async addJournal(): Promise<void> {
    const id = parseInt(this.sid);
    if (isNaN(id) || this.journalInput.length === 0) { return; }
    this.busy = true;
    try {
      await ClassApi.journalAdd(id, this.journalInput);
      this.journalInput = '';
      this.journalText = await ClassApi.journal(id);
      this.msg = '已追加';
    } catch (e) {
      this.msg = '失败：' + (e as Error).message;
    }
    this.busy = false;
  }

  @Builder
  tabBar() {
    Row({ space: 6 }) {
      ForEach(['分数', '金币', '日志', '初始化', '历程', '其它', '自动'], (label: string, i: number) => {
        Button(label)
          .fontSize(12)
          .backgroundColor(this.tab === i ? '#3478f6' : '#f2f2f2')
          .fontColor(this.tab === i ? Color.White : '#333333')
          .onClick(() => { this.tab = i; })
      })
    }
    .width('100%')
  }

  build() {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        Text('更多功能').fontSize(17).fontWeight(FontWeight.Bold).layoutWeight(1)
        Text(this.busy ? '处理中…' : '关闭').fontSize(13).fontColor('#3478f6')
          .onClick(() => { if (!this.busy) { this.onClose(); } })
      }
      this.tabBar()
      if (this.msg.length > 0) {
        Text(this.msg).fontSize(12).fontColor('#3478f6').width('100%')
      }
      Scroll() {
        Column({ space: 8 }) {
          if (this.tab === 0 || this.tab === 1) {
            ForEach(this.rows, (r: ScoreRow) => {
              Row({ space: 6 }) {
                Text(`${r.name}`).fontSize(14).layoutWeight(1)
                Text(`学号 ${r.sid}`).fontSize(11).fontColor('#999999')
                Text(r.score.toFixed(1)).fontSize(14).fontWeight(FontWeight.Bold)
                  .fontColor('#e04a3a')
                Text(`💰${Math.round(r.gold)}`).fontSize(12).fontColor('#c49b2a')
              }
              .width('100%')
              .padding(8)
              .backgroundColor(Color.White)
              .borderRadius(8)
              .onClick(() => { this.sid = r.sid; })
            }, (r: ScoreRow) => r.sid)

            TextInput({ placeholder: '学号', text: this.sid })
              .onChange((v: string) => { this.sid = v; })
            TextInput({ placeholder: '变化，例如 +2', text: this.delta })
              .onChange((v: string) => { this.delta = v; })
            TextInput({ placeholder: '原因（写入操作日志）', text: this.reason })
              .onChange((v: string) => { this.reason = v; })
            Row({ space: 8 }) {
              Button('提交分数调整').fontSize(13).layoutWeight(1).onClick(() => { this.doAdjust(false); })
              Button('金币调整').fontSize(13).layoutWeight(1).backgroundColor('#c49b2a')
                .onClick(() => { this.doAdjust(true); })
            }
            Text('抽奖：周五 12:00 后 · 单抽 160 / 十连 1600 · 奖励按 rewards 权重抽')
              .fontSize(11).fontColor('#888888').width('100%')
            Row({ space: 8 }) {
              Button('单抽').fontSize(13).layoutWeight(1).onClick(() => { this.doGacha(1); })
              Button('十连').fontSize(13).layoutWeight(1).onClick(() => { this.doGacha(10); })
            }
          }

          if (this.tab === 2) {
            if (this.logs.length === 0) {
              Text('（暂无日志）').fontSize(12).fontColor('#888888')
            }
            ForEach(this.logs, (l: string) => {
              Text(l).fontSize(11).fontColor('#555555').width('100%')
                .padding(6).backgroundColor(Color.White).borderRadius(6)
            }, (l: string, i: number) => `${i}-${l}`)
          }

          if (this.tab === 3) {
            Text('⚠ 初始化会重建作业数据，已有记录清空').fontSize(11).fontColor('#e04a3a')
            TextInput({ placeholder: '学生数', text: this.initCount })
              .onChange((v: string) => { this.initCount = v; })
            TextInput({ placeholder: '科目，逗号分隔', text: this.initSubjects })
              .onChange((v: string) => { this.initSubjects = v; })
            Button('执行初始化').fontSize(13).onClick(() => { this.doInit(); })
            Text('已配置的作业种类').fontSize(13).fontWeight(FontWeight.Bold).width('100%')
            if (this.metaTypes.length === 0) {
              Text('（没配种类：按整科已交计）').fontSize(11).fontColor('#888888')
            }
            ForEach(this.metaTypes, (t: string) => {
              Text(t).fontSize(11).fontColor('#555555')
            }, (t: string, i: number) => `${i}-${t}`)
          }

          if (this.tab === 6) {
            Text('自动事件（规则同网页：daily / weekly / monthly，同一天只跑一次）')
              .fontSize(11).fontColor('#888888').width('100%')
            ForEach(this.eventLines, (l: string) => {
              Text(l).fontSize(11).fontColor('#555555').width('100%').padding(6)
                .backgroundColor(Color.White).borderRadius(6)
            }, (l: string, i: number) => `${i}-${l}`)
            Button('▶ 立即执行到期事件').fontSize(13).onClick(() => { this.doRunEvents(); })
          }

          if (this.tab === 5) {
            Text('职位 / 考试 / 每日汇报 / 备份 / 账号（只读）').fontSize(12).fontWeight(FontWeight.Bold)
            ForEach(this.extra, (l: string) => {
              Text(l).fontSize(11).fontColor('#555555').width('100%').padding(6)
                .backgroundColor(Color.White).borderRadius(6)
            }, (l: string, i: number) => `${i}-${l}`)
            Text('账号权限由网页端角色决定；原生端只按班级密码鉴权。')
              .fontSize(11).fontColor('#888888').width('100%')
          }

          if (this.tab === 4) {
            TextInput({ placeholder: '学号', text: this.sid })
              .onChange((v: string) => { this.sid = v; })
            Button('读取历程').fontSize(13).onClick(() => { this.loadJournal(); })
            Text(this.journalText.length > 0 ? this.journalText : '（还没有历程记录）')
              .fontSize(11).fontColor('#555555').width('100%').padding(8)
              .backgroundColor(Color.White).borderRadius(6)
            TextInput({ placeholder: '追加一段（纯文本，只能追加）', text: this.journalInput })
              .onChange((v: string) => { this.journalInput = v; })
            Button('追加').fontSize(13).onClick(() => { this.addJournal(); })
          }
        }
        .width('100%')
        .padding({ bottom: 20 })
      }
      .layoutWeight(1)
    }
    .padding(16)
    .width('100%')
    .height('100%')
    .backgroundColor('#fafafa')
  }
}
