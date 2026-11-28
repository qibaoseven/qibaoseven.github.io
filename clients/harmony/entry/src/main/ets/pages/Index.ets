/**
 * OpenStu 鸿蒙端主界面（ArkTS / ArkUI 声明式）
 * 两个页面：连接班级（配置）、登记（今日进度 + 学生列表）
 */
import { promptAction } from '@kit.ArkUI';
import { common } from '@kit.AbilityKit';
import { Api, ClassInfo, Student } from '../model/Api';
import { Store } from '../model/Store';

@Entry
@Component
struct Index {
  @State page: number = 0;                       // 0 = 配置页，1 = 登记页
  @State server: string = 'https://os-stu.netlify.app';
  @State classId: string = '';
  @State password: string = '';

  @State classes: ClassInfo[] = [];
  @State loading: boolean = false;
  @State message: string = '';

  @State students: Student[] = [];
  @State subjects: number[] = [];                 // 今日应交科目索引
  @State subjectNames: string[] = [];             // 与 subjects 一一对应的显示名
  @State submitted: number = 0;
  @State total: number = 0;
  @State date: string = '';
  @State marks: Record<string, boolean[]> = {};   // 学号 → 各科目是否已交（按 subjects 顺序）
  @State target: number = -1;                     // 当前要登记的学生下标，-1 表示未选

  private ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;

  async aboutToAppear(): Promise<void> {
    await Store.load(this.ctx);
    this.server = Api.server;
    this.classId = Api.classId;
    this.password = Api.password;
    this.page = Api.configured() ? 1 : 0;
    if (this.page === 1) {
      await this.refresh();
    }
  }

  // ---------- 数据 ----------

  async fetchClasses(): Promise<void> {
    this.loading = true;
    try {
      Api.server = this.server;
      this.classes = await Api.classes();
      if (this.classes.length === 0) {
        this.message = '没拿到班级，检查服务器地址或网络';
      }
    } catch (e) {
      this.message = (e as Error).message;
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    this.loading = true;
    try {
      Api.server = this.server;
      Api.classId = this.classId;
      Api.password = this.password;

      const req = await Api.required();
      this.date = req.date;
      this.submitted = req.submitted;
      this.total = req.total;
      this.subjects = req.required;

      const names: string[] = [];
      for (const s of req.required) {
        const key = s.toString();
        names.push(req.subjectNames[key] !== undefined ? req.subjectNames[key] : `科目${s}`);
      }
      this.subjectNames = names;

      const roster = await Api.roster();
      const list: Student[] = [];
      for (const key of Object.keys(roster.students)) {
        const id = parseInt(key, 10);
        if (!isNaN(id)) list.push(new Student(id, roster.students[key]));
      }
      list.sort((a, b) => a.id - b.id);
      this.students = list;

      // 位数组 → 今日每人的完成情况
      const hw = await Api.allHomework();
      const dayIndex = this.dayOffset(hw.dateFrom, this.date);
      const grid: Record<string, boolean[]> = {};
      if (dayIndex >= 0 && dayIndex < hw.data.length) {
        const day = hw.data[dayIndex];
        for (let sid = 1; sid < day.length; sid++) {
          const row = day[sid];
          const marks: boolean[] = [];
          for (const s of this.subjects) {
            marks.push(s < row.length && row[s] !== 0);
          }
          grid[sid.toString()] = marks;
        }
      }
      this.marks = grid;
      this.message = '';
    } catch (e) {
      this.message = (e as Error).message;
    } finally {
      this.loading = false;
    }
  }

  dayOffset(from: string, to: string): number {
    if (from.length === 0 || to.length === 0) return -1;
    const a = new Date(from + 'T00:00:00');
    const b = new Date(to + 'T00:00:00');
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  async submit(student: Student, subject: number): Promise<void> {
    this.loading = true;
    try {
      const r = await Api.submit(student.id, subject, this.date);
      const name = this.subjectName(subject);
      this.message = r.changed
        ? `已登记：${student.name} · ${name}`
        : `${student.name} · ${name} 原本已交，未重复计分`;
      promptAction.showToast({ message: this.message, duration: 2000 });
      this.target = -1;
      await this.refresh();
    } catch (e) {
      this.message = `登记失败: ${(e as Error).message}`;
      promptAction.showToast({ message: this.message, duration: 2500 });
    } finally {
      this.loading = false;
    }
  }

  subjectName(index: number): string {
    const pos = this.subjects.indexOf(index);
    return pos >= 0 && pos < this.subjectNames.length ? this.subjectNames[pos] : `科目${index}`;
  }

  doneCount(student: Student): number {
    const marks = this.marks[student.id.toString()];
    if (marks === undefined) return 0;
    let n = 0;
    for (const m of marks) if (m) n++;
    return n;
  }

  @Builder
  configPage() {
    Column({ space: 12 }) {
      Text('连接班级')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
      Text('填服务器、班级 ID 和密码；点“拉取班级列表”可以按名字核对 ID。')
        .fontSize(13)
        .fontColor('#888888')

      TextInput({ text: this.server, placeholder: 'https://os-stu.netlify.app' })
        .onChange((v: string) => { this.server = v; })
        .width('100%')
      TextInput({ text: this.classId, placeholder: 'class_xxxxxxxx' })
        .onChange((v: string) => { this.classId = v; })
        .width('100%')
      TextInput({ text: this.password, placeholder: '班级密码' })
        .type(InputType.Password)
        .onChange((v: string) => { this.password = v; })
        .width('100%')

      Row({ space: 12 }) {
        Button('拉取班级列表')
          .enabled(!this.loading)
          .onClick(() => { this.fetchClasses(); })
        Button('保存并进入')
          .enabled(this.classId.length > 0 && this.password.length > 0)
          .onClick(async () => {
            await Store.save(this.ctx, this.server, this.classId, this.password);
            this.page = 1;
            await this.refresh();
          })
      }

      if (this.classes.length > 0) {
        Text('服务器上的班级（点一下填进班级 ID）').fontSize(13).fontWeight(FontWeight.Medium)
        List({ space: 6 }) {
          ForEach(this.classes, (c: ClassInfo) => {
            ListItem() {
              Column({ space: 2 }) {
                Text(c.name).fontSize(15)
                Text(c.id).fontSize(11).fontColor('#999999')
              }
              .alignItems(HorizontalAlign.Start)
              .width('100%')
            }
            .onClick(() => { this.classId = c.id; })
          }, (c: ClassInfo) => c.id)
        }
        .height(220)
      }

      if (this.message.length > 0) {
        Text(this.message).fontSize(13).fontColor('#d33')
      }
      Blank()
    }
    .padding(20)
    .width('100%')
    .height('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  teacherPage() {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        Column({ space: 2 }) {
          Text(Api.classId).fontSize(16).fontWeight(FontWeight.Bold)
          Text(this.date.length > 0
            ? `${this.date} · 应交 ${this.subjects.length} 科`
            : '未加载')
            .fontSize(12)
            .fontColor('#888888')
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)

        Button('设置')
          .fontSize(13)
          .backgroundColor('#f2f2f2')
          .fontColor('#333333')
          .onClick(() => { this.page = 0; })
        Button('刷新')
          .fontSize(13)
          .enabled(!this.loading)
          .onClick(() => { this.refresh(); })
      }

      if (this.total > 0) {
        Progress({ value: this.submitted, total: this.total, type: ProgressType.Linear })
          .width('100%')
        Text(`已交 ${this.submitted}/${this.total}`).fontSize(12).fontColor('#666666')
      }

      if (this.subjectNames.length > 0) {
        Flex({ wrap: FlexWrap.Wrap }) {
          ForEach(this.subjects, (s: number) => {
            Text(this.subjectName(s))
              .fontSize(12)
              .padding({ left: 10, right: 10, top: 4, bottom: 4 })
              .margin(3)
              .backgroundColor('#e8f0fe')
              .borderRadius(12)
          }, (s: number) => s.toString())
        }
        .width('100%')
      }

      if (this.message.length > 0) {
        Text(this.message).fontSize(12).fontColor('#0a58ca')
      }

      List({ space: 2 }) {
        ForEach(this.students, (st: Student) => {
          ListItem() {
            Row({ space: 10 }) {
              Text(st.id.toString()).fontSize(14).width(36).fontColor('#666666')
              Text(st.name).fontSize(15).layoutWeight(1)
              Text(`${this.doneCount(st)}/${this.subjects.length}`)
                .fontSize(12)
                .fontColor(this.doneCount(st) === this.subjects.length ? '#1a7f37' : '#999999')
            }
            .width('100%')
            .padding({ top: 12, bottom: 12 })
          }
          .onClick(() => { this.target = this.students.indexOf(st); })
        }, (st: Student) => st.id.toString() + st.name)
      }
      .layoutWeight(1)
    }
    .padding(16)
    .width('100%')
    .height('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  subjectSheet() {
    Column({ space: 8 }) {
      Text(`${this.students[this.target].id} ${this.students[this.target].name} · 登记`)
        .fontSize(17)
        .fontWeight(FontWeight.Bold)
        .margin({ bottom: 6 })
      ForEach(this.subjects, (s: number) => {
        Button(this.subjectName(s) + (this.marks[this.students[this.target].id.toString()] !== undefined
          && this.marks[this.students[this.target].id.toString()][this.subjects.indexOf(s)]
          ? '（已交）' : ''))
          .width('100%')
          .enabled(this.marks[this.students[this.target].id.toString()] === undefined
            || !this.marks[this.students[this.target].id.toString()][this.subjects.indexOf(s)])
          .onClick(() => { this.submit(this.students[this.target], s); })
      }, (s: number) => s.toString())
      Button('取消')
        .width('100%')
        .backgroundColor('#f2f2f2')
        .fontColor('#333333')
        .onClick(() => { this.target = -1; })
    }
    .padding(20)
    .width('92%')
    .backgroundColor(Color.White)
    .borderRadius(16)
    .shadow({ radius: 20, color: '#33000000', offsetY: 6 })
  }

  build() {
    Stack() {
      Column() {
        if (this.page === 0) {
          this.configPage()
        } else {
          this.teacherPage()
        }
      }
      .width('100%')
      .height('100%')

      if (this.page === 1 && this.target >= 0) {
        Column() {
          this.subjectSheet()
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#66000000')
        .onClick(() => { this.target = -1; })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#fafafa')
  }
}
