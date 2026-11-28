package io.qibaoseven.openstu

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/**
 * 把网页端的「控制台 / 分数 / 金币 / 抽奖 / 排名 / 学生历程 / 日志 / 分组 / 初始化」
 * 在 Android 上做成同一套页面。
 *
 * 数据流和网页一致：GET 班级数据 → 本地改 → POST 整包覆盖。
 */
class MoreViewModel : ViewModel() {
    var data by mutableStateOf<JSONObject?>(null)
    var meta by mutableStateOf<JSONObject?>(null)
    var message by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)

    fun load(store: Store) {
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            val d = withContext(Dispatchers.IO) { Api.classData() }
            val m = withContext(Dispatchers.IO) { Api.meta() }
            data = (d as? Result.Ok)?.value ?: data
            meta = (m as? Result.Ok)?.value
            if (d is Result.Err) message = d.message
            busy = false
        }
    }

    // ---------- 分数 / 金币 ----------
    fun adjustScore(store: Store, sid: String, delta: Double, reason: String) {
        val d = data ?: return
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            val r = withContext(Dispatchers.IO) { mutateScoreGold(d, sid, delta, null, reason) }
            message = r
            busy = false
            load(store)
        }
    }

    fun adjustGold(store: Store, sid: String, delta: Double, reason: String) {
        val d = data ?: return
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            val r = withContext(Dispatchers.IO) { mutateScoreGold(d, sid, null, delta, reason) }
            message = r
            busy = false
            load(store)
        }
    }


    fun groupEdit(store: Store, name: String, sid: String, op: String) {
        val d = data ?: return
        if (name.isBlank()) { message = "先填分组名"; return }
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            message = withContext(Dispatchers.IO) { mutateGroup(d, name.trim(), sid.trim(), op) }
            busy = false
            load(store)
        }
    }

    private fun mutateGroup(base: JSONObject, group: String, sid: String, op: String): String {
        return try {
            val data = JSONObject(base.toString())
            val groups = data.optJSONObject("groups") ?: JSONObject().also { data.put("groups", it) }
            when (op) {
                "create" -> {
                    if (groups.has(group)) return "分组已存在：$group"
                    groups.put(group, JSONArray())
                }
                "delete" -> {
                    if (!groups.has(group)) return "没有这个分组：$group"
                    groups.remove(group)
                }
                else -> {
                    if (!groups.has(group)) return "没有这个分组：$group"
                    val mem = groups.optJSONArray(group) ?: JSONArray().also { groups.put(group, it) }
                    val ids = (0 until mem.length()).map { mem.optString(it) }
                    val list = JSONArray()
                    if (op == "add") {
                        ids.forEach { list.put(it) }
                        if (!ids.contains(sid)) list.put(sid)
                    } else ids.filter { it != sid }.forEach { list.put(it) }
                    groups.put(group, list)
                }
            }
            val r = Api.saveClassData(data)
            if (r is Result.Err) "保存失败：${r.message}" else "✓ 分组「$group」已更新"
        } catch (e: Exception) { "操作失败：${e.message}" }
    }

    fun reportWrite(store: Store, op: String) {
        val d = data ?: return
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            message = withContext(Dispatchers.IO) { mutateReport(d, op, 0.0, "") }
            busy = false
            load(store)
        }
    }

    fun reportBatch(store: Store, delta: Double, reason: String) {
        val d = data ?: return
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            message = withContext(Dispatchers.IO) { mutateReport(d, "batch", delta, reason) }
            busy = false
            load(store)
        }
    }

    private fun mutateReport(base: JSONObject, op: String, delta: Double, reason: String): String {
        return try {
            val data = JSONObject(base.toString())
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            val dr = data.optJSONObject("dailyReport") ?: JSONObject().also { data.put("dailyReport", it) }
            if (op == "reset") {
                dr.remove(today)
            } else {
                if (op == "batch") {
                    val scores = data.optJSONObject("scores") ?: return "班级没有 scores 字段"
                    val logs = data.optJSONArray("logs") ?: JSONArray().also { data.put("logs", it) }
                    var n = 0
                    val keys = scores.keys()
                    while (keys.hasNext()) {
                        val sid = keys.next()
                        if (sid == "0") continue
                        val row = scores.opt(sid)
                        val name = if (row is JSONArray) row.optString(0, "学号$sid") else (row as JSONObject).optString("name", "学号$sid")
                        val old = if (row is JSONArray) row.optDouble(1, 0.0) else (row as JSONObject).optDouble("score")
                        val ns = old + delta
                        if (row is JSONArray) row.put(1, ns) else (row as JSONObject).put("score", ns)
                        logs.put(JSONObject().apply {
                            put("timestamp", SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.getDefault()).format(Date()))
                            put("action", "每日汇报批量加分")
                            put("student_id", sid); put("student_name", name)
                            put("score_change", delta); put("current_score", ns)
                            put("reason", reason.ifBlank { "每日汇报" })
                            put("page", "android"); put("user_role", "teacher")
                        })
                        n++
                    }
                    while (logs.length() > 2000) logs.remove(logs.length() - 1)
                }
                dr.put(today, JSONObject().apply {
                    put("allReported", true)
                    put("lastReportTime", SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date()))
                })
            }
            val r = Api.saveClassData(data)
            if (r is Result.Err) "保存失败：${r.message}"
            else if (op == "reset") "✓ 已重置今日汇报"
            else if (op == "batch") "✓ 已批量 ${if (delta > 0) "+" else ""}$delta"
            else "✓ 已标记全班已汇报"
        } catch (e: Exception) { "操作失败：${e.message}" }
    }

    private fun mutateScoreGold(base: JSONObject, sid: String, scoreDelta: Double?, goldDelta: Double?, reason: String): String {
        return try {
            val data = JSONObject(base.toString())          // 深拷贝，避免改坏内存里的旧值
            val scores = data.optJSONObject("scores") ?: return "班级没有 scores 字段"
            val row = scores.opt(sid) ?: return "没有这个学号"
            val oldScore = if (row is JSONArray) row.optDouble(1, 0.0) else (row as JSONObject).optDouble("score")
            val name = if (row is JSONArray) row.optString(0, "学号$sid") else (row as JSONObject).optString("name", "学号$sid")
            var newScore = oldScore
            if (scoreDelta != null) {
                newScore = oldScore + scoreDelta
                if (row is JSONArray) row.put(1, newScore) else (row as JSONObject).put("score", newScore)
            }
            val goldObj = data.optJSONObject("gold") ?: JSONObject().also { data.put("gold", it) }
            val entry = goldObj.optJSONObject(sid) ?: JSONObject().put("amount", 0.0).also { goldObj.put(sid, it) }
            val oldGold = entry.optDouble("amount", 0.0)
            var newGold = oldGold
            if (goldDelta != null) {
                newGold = (oldGold + goldDelta).coerceAtLeast(0.0)
                entry.put("amount", newGold)
            }
            val logs = data.optJSONArray("logs") ?: JSONArray().also { data.put("logs", it) }
            logs.put(JSONObject().apply {
                put("timestamp", SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.getDefault()).format(Date()))
                put("action", if (scoreDelta != null) "分数调整" else "金币调整")
                put("student_id", sid)
                put("student_name", name)
                put("score_change", scoreDelta ?: goldDelta ?: 0.0)
                put("current_score", if (scoreDelta != null) newScore else newGold)
                put("reason", reason)
                put("page", "android")
                put("user_role", "teacher")
            })
            // 日志过多会撑大班级数据：只留最近 2000 条
            while (logs.length() > 2000) {
                val keep = JSONArray()
                for (i in 0 until 2000) keep.put(logs.get(i))
                data.put("logs", keep)
                break
            }
            when (val r = Api.saveClassData(data)) {
                is Result.Ok -> "✓ $name " + (if (scoreDelta != null) "分数 $oldScore → $newScore" else "金币 $oldGold → $newGold")
                is Result.Err -> "保存失败: ${r.message}"
            }
        } catch (e: Exception) {
            "保存失败: ${e.message}"
        }
    }

    // ---------- 抽奖 ----------
    fun gacha(store: Store, sid: String, times: Int) {
        val d = data ?: return
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            val r = withContext(Dispatchers.IO) { doGacha(d, sid, times) }
            message = r
            busy = false
            load(store)
        }
    }

    private fun doGacha(base: JSONObject, sid: String, times: Int): String {
        val cal = java.util.Calendar.getInstance()
        if (cal.get(java.util.Calendar.DAY_OF_WEEK) != java.util.Calendar.FRIDAY || cal.get(java.util.Calendar.HOUR_OF_DAY) < 12) {
            return "抽奖只在周五 12:00 之后开放"
        }
        val cost = if (times >= 10) 1600.0 else 160.0
        return try {
            val data = JSONObject(base.toString())
            val scores = data.optJSONObject("scores") ?: return "没有 scores 字段"
            val row = scores.opt(sid) ?: return "没有这个学号"
            val name = if (row is JSONArray) row.optString(0) else (row as JSONObject).optString("name")
            val goldObj = data.optJSONObject("gold") ?: JSONObject().also { data.put("gold", it) }
            val entry = goldObj.optJSONObject(sid) ?: JSONObject().put("amount", 0.0).also { goldObj.put(sid, it) }
            val gold = entry.optDouble("amount", 0.0)
            if (gold < cost) return "金币不够：现有 $gold，需要 $cost"

            // 奖励池：rewards 按稀有度分组，probability 当权重；hidden_rewards 记 SP
            val pool = mutableListOf<Pair<Int, JSONObject>>()
            val rewards = data.optJSONObject("rewards")
            if (rewards != null) {
                val keys = rewards.keys()
                while (keys.hasNext()) {
                    val rarity = keys.next()
                    if (rarity == "hidden_rewards") continue
                    val arr = rewards.optJSONArray(rarity) ?: continue
                    for (i in 0 until arr.length()) {
                        val r = arr.optJSONObject(i) ?: continue
                        val w = r.optInt("probability", 1).coerceAtLeast(1)
                        pool.add(w to JSONObject(r.toString()).put("rarity", rarity))
                    }
                }
                val hidden = rewards.optJSONArray("hidden_rewards") ?: JSONArray()
                for (i in 0 until hidden.length()) {
                    val r = hidden.optJSONObject(i) ?: continue
                    pool.add(r.optInt("probability", 1).coerceAtLeast(1) to JSONObject(r.toString()).put("rarity", "SP"))
                }
            }
            val total = pool.sumOf { it.first }
            var score = if (row is JSONArray) row.optDouble(1) else (row as JSONObject).optDouble("score")
            val sb = StringBuilder("抽 $times 次 · 消耗 ${cost.toInt()} 金币\n")
            repeat(if (times >= 10) 10 else 1) {
                val reward = if (pool.isEmpty() || total <= 0) {
                    JSONObject().put("name", "谢谢参与").put("rarity", "N").put("description", "下次好运！")
                } else {
                    var pick = Random.nextInt(total)
                    var chosen = pool.first().second
                    for (p in pool) { pick -= p.first; if (pick < 0) { chosen = p.second; break } }
                    chosen
                }
                val gain = reward.optDouble("score", 0.0)
                if (gain != 0.0) {
                    score += gain
                    if (row is JSONArray) row.put(1, score) else (row as JSONObject).put("score", score)
                }
                sb.append("  [${reward.optString("rarity")}] ${reward.optString("name")}")
                if (gain != 0.0) sb.append(" +$gain 学分")
                sb.append("\n")
            }
            entry.put("amount", gold - cost)
            val logs = data.optJSONArray("logs") ?: JSONArray().also { data.put("logs", it) }
            logs.put(JSONObject().apply {
                put("timestamp", SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.getDefault()).format(Date()))
                put("action", if (times >= 10) "十连抽消耗" else "抽奖消耗")
                put("student_id", sid); put("student_name", name)
                put("score_change", -cost); put("current_score", gold - cost)
                put("reason", "$times 次"); put("page", "android"); put("user_role", "teacher")
            })
            return when (val r = Api.saveClassData(data)) {
                is Result.Ok -> sb.toString() + "金币: $gold → ${gold - cost}，学分: $score"
                is Result.Err -> "保存失败: ${r.message}"
            }
        } catch (e: Exception) {
            "抽奖失败: ${e.message}"
        }
    }

    // ---------- 职位发工资 ----------
    fun paySalaries(store: Store) {
        val d = data ?: return
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            val msg = withContext(Dispatchers.IO) {
                try {
                    val data = JSONObject(d.toString())
                    val pos = data.optJSONObject("positions") ?: return@withContext "还没有职位"
                    val list = pos.optJSONObject("list") ?: return@withContext "还没有职位"
                    var total = 0.0; var people = 0
                    val goldObj = data.optJSONObject("gold") ?: JSONObject().also { data.put("gold", it) }
                    val keys = list.keys()
                    while (keys.hasNext()) {
                        val name = keys.next()
                        val item = list.optJSONObject(name) ?: continue
                        val salary = item.optDouble("salary", 0.0)
                        val members = item.optJSONArray("members") ?: continue
                        for (i in 0 until members.length()) {
                            val sid = members.optString(i)
                            val e = goldObj.optJSONObject(sid) ?: JSONObject().put("amount", 0.0).also { goldObj.put(sid, it) }
                            e.put("amount", e.optDouble("amount", 0.0) + salary)
                            total += salary; people++
                        }
                    }
                    pos.put("lastPayDate", SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()))
                    data.put("positions", pos)
                    when (val r = Api.saveClassData(data)) {
                        is Result.Ok -> "✓ 发放 $people 人次，共 $total 金币"
                        is Result.Err -> "保存失败: ${r.message}"
                    }
                } catch (e: Exception) { "发工资失败: ${e.message}" }
            }
            message = msg
            busy = false
            load(store)
        }
    }

    // ---------- 自动事件 ----------
    fun runAutoEvents(store: Store) {
        val d = data ?: return
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            val msg = withContext(Dispatchers.IO) {
                try {
                    val data = JSONObject(d.toString())
                    val arr = data.optJSONArray("autoEvents") ?: return@withContext "（还没有自动事件）"
                    val cal = java.util.Calendar.getInstance()
                    val df = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                    val today = df.format(Date())
                    val scores = data.optJSONObject("scores") ?: JSONObject()
                    var applied = 0
                    for (i in 0 until arr.length()) {
                        val ev = arr.optJSONObject(i) ?: continue
                        val freq = ev.optString("frequency", "daily")
                        val due = when (freq) {
                            "weekly" -> cal.get(java.util.Calendar.DAY_OF_WEEK) - 1 == ev.optInt("dayOfWeek", 1)
                            "monthly" -> cal.get(java.util.Calendar.DAY_OF_MONTH) == ev.optInt("dayOfMonth", 1)
                            else -> true
                        }
                        if (!due) continue
                        val lastRun = ev.optJSONObject("lastRun") ?: JSONObject()
                        if (lastRun.optBoolean(today, false)) continue
                        val targets = ev.optJSONArray("targets") ?: JSONArray()
                        val ids = mutableListOf<String>()
                        for (j in 0 until targets.length()) {
                            when (val t = targets.optString(j)) {
                                "all" -> ids += scores.keys().asSequence().toList()
                                else -> if (t.startsWith("group:")) {
                                    val g = data.optJSONObject("groups")?.optJSONArray(t.removePrefix("group:"))
                                    if (g != null) for (k in 0 until g.length()) ids += g.optString(k)
                                } else ids += t
                            }
                        }
                        for (sid in ids.distinct()) {
                            if (sid == "0") continue
                            val row = scores.opt(sid) ?: continue
                            val old = if (row is JSONArray) row.optDouble(1, 0.0) else (row as JSONObject).optDouble("score", 0.0)
                            val new = old + ev.optDouble("change", 0.0)
                            if (row is JSONArray) row.put(1, new) else (row as JSONObject).put("score", new)
                            val name = if (row is JSONArray) row.optString(0) else (row as JSONObject).optString("name")
                            val logs = data.optJSONArray("logs") ?: JSONArray().also { data.put("logs", it) }
                            logs.put(JSONObject().apply {
                                put("timestamp", SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.getDefault()).format(Date()))
                                put("action", "自动事件"); put("student_id", sid); put("student_name", name)
                                put("score_change", ev.optDouble("change", 0.0)); put("current_score", new)
                                put("reason", ev.optString("reason", "自动事件")); put("page", "android")
                            })
                            applied++
                        }
                        lastRun.put(today, true)
                        ev.put("lastRun", lastRun)
                    }
                    data.put("scores", scores)
                    data.put("autoEvents", arr)
                    when (val r = Api.saveClassData(data)) {
                        is Result.Ok -> "✓ 执行完成：改动 $applied 人次"
                        is Result.Err -> "保存失败: ${r.message}"
                    }
                } catch (e: Exception) { "执行失败: ${e.message}" }
            }
            message = msg
            busy = false
            load(store)
        }
    }

    fun addAutoEvent(store: Store, name: String, freqSpec: String, targets: String, change: Double, reason: String) {
        val d = data ?: return
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            val msg = withContext(Dispatchers.IO) {
                try {
                    val data = JSONObject(d.toString())
                    val arr = data.optJSONArray("autoEvents") ?: JSONArray().also { data.put("autoEvents", it) }
                    val parts = freqSpec.split(":")
                    val ev = JSONObject()
                        .put("name", name)
                        .put("frequency", parts[0].ifEmpty { "daily" })
                        .put("change", change)
                        .put("reason", reason.ifEmpty { "自动事件" })
                        .put("lastRun", JSONObject())
                    if (parts[0] == "weekly") ev.put("dayOfWeek", parts.getOrNull(1)?.toIntOrNull() ?: 1)
                    if (parts[0] == "monthly") ev.put("dayOfMonth", parts.getOrNull(1)?.toIntOrNull() ?: 1)
                    val t = JSONArray()
                    targets.split(',').map { it.trim() }.filter { it.isNotEmpty() }.forEach { t.put(it) }
                    ev.put("targets", t)
                    arr.put(ev)
                    data.put("autoEvents", arr)
                    when (val r = Api.saveClassData(data)) {
                        is Result.Ok -> "✓ 已添加「$name」"
                        is Result.Err -> "保存失败: ${r.message}"
                    }
                } catch (e: Exception) { "添加失败: ${e.message}" }
            }
            message = msg
            busy = false
            load(store)
        }
    }

    // ---------- 初始化 ----------
    fun initHomework(store: Store, students: Int, subjects: List<String>) {
        store.applyToApi()
        viewModelScope.launch {
            busy = true
            val r = withContext(Dispatchers.IO) { Api.initHomework(students, subjects) }
            message = when (r) {
                is Result.Ok -> "✓ 初始化成功：$students 人 × ${subjects.size} 科"
                is Result.Err -> "初始化失败: ${r.message}"
            }
            busy = false
            load(store)
        }
    }
}

// ==================== 界面 ====================

@Composable
fun MoreScreen(store: Store, vm: MoreViewModel, roster: List<Student>, onBack: () -> Unit) {
    var section by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { if (vm.data == null) vm.load(store) }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("更多功能", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack) { Text("返回") }
        }
        Text("对应网页端的控制台/分数/金币/抽奖/历程/日志/初始化", style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(10.dp))

        if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        vm.message?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))
        }

        val entries = listOf(
            "scores" to "📊 分数榜 / 加减分",
            "gold" to "💰 金币 / 🎰 抽奖",
            "journal" to "📖 学生历程",
            "logs" to "📋 操作日志",
            "groups" to "👥 分组",
            "init" to "📚 作业初始化 / 种类",
            "positions" to "👔 职位 / 工资",
            "exam" to "📝 考试分数",
            "report" to "📋 每日汇报",
            "backup" to "💾 数据备份",
            "account" to "🔑 账号 / 连接",
            "autoEvents" to "⚡ 自动事件",
        )

        if (section == null) {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                entries.forEach { (key, label) ->
                    ListItem(
                        headlineContent = { Text(label) },
                        modifier = Modifier.clickable { section = key }
                    )
                    HorizontalDivider()
                }
            }
        } else {
            when (section) {
                "scores" -> ScoreBoard(store, vm, roster, true)
                "gold" -> GoldAndGacha(store, vm, roster)
                "journal" -> JournalPanel(store, roster)
                "logs" -> LogsPanel(vm)
                "groups" -> GroupsPanel(store, vm)
                "init" -> InitPanel(store, vm)
                "positions" -> PositionsPanel(store, vm)
                "exam" -> ExamPanel(vm)
                "report" -> ReportPanel(store, vm)
                "backup" -> BackupPanel(vm)
                "account" -> AccountPanel(store)
                "autoEvents" -> AutoEventsPanel(store, vm)
            }
            TextButton(onClick = { section = null }) { Text("← 回到更多功能") }
        }
    }
}

private fun scoresOf(data: JSONObject?): List<Triple<String, String, Double>> {
    val out = mutableListOf<Triple<String, String, Double>>()
    val scores = data?.optJSONObject("scores") ?: return out
    val keys = scores.keys()
    while (keys.hasNext()) {
        val sid = keys.next()
        if (sid == "0") continue
        val row = scores.opt(sid)
        val name = if (row is JSONArray) row.optString(0, "学号$sid") else (row as? JSONObject)?.optString("name", "学号$sid") ?: "学号$sid"
        val score = if (row is JSONArray) row.optDouble(1, 0.0) else (row as? JSONObject)?.optDouble("score", 0.0) ?: 0.0
        out.add(Triple(sid, name, score))
    }
    return out
}

private fun goldOf(data: JSONObject?, sid: String): Double =
    data?.optJSONObject("gold")?.optJSONObject(sid)?.optDouble("amount", 0.0) ?: 0.0

@Composable
private fun ScoreBoard(store: Store, vm: MoreViewModel, roster: List<Student>, scoreMode: Boolean) {
    var delta by remember { mutableStateOf("+2") }
    var reason by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Student?>(null) }

    val rows = scoresOf(vm.data).sortedByDescending { it.third }

    Column(Modifier.verticalScroll(rememberScrollState())) {
        Text("分数榜（点击某人修改）", fontWeight = FontWeight.Medium)
        rows.forEachIndexed { i, (sid, name, score) ->
            ListItem(
                headlineContent = { Text("${i + 1}. $name") },
                supportingContent = { Text("学号 $sid · 金币 ${goldOf(vm.data, sid)}", style = MaterialTheme.typography.bodySmall) },
                trailingContent = { Text("%.1f".format(score), fontWeight = FontWeight.Bold) },
                modifier = Modifier.clickable { selected = Student(sid.toIntOrNull() ?: 0, name) }
            )
            HorizontalDivider()
        }

        Spacer(Modifier.height(12.dp))
        Text("调整", fontWeight = FontWeight.Medium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(delta, { delta = it }, label = { Text("变化") }, singleLine = true, modifier = Modifier.width(110.dp))
            OutlinedTextField(reason, { reason = it }, label = { Text("原因（写入日志）") }, singleLine = true, modifier = Modifier.weight(1f))
        }
        selected?.let { st ->
            Spacer(Modifier.height(8.dp))
            Text("选中: ${st.id} ${st.name}")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    val d = delta.toDoubleOrNull() ?: return@Button
                    vm.adjustScore(store, st.id.toString(), d, reason)
                    selected = null
                }) { Text("提交分数调整") }
                OutlinedButton(onClick = {
                    val d = delta.toDoubleOrNull() ?: return@OutlinedButton
                    vm.adjustGold(store, st.id.toString(), d, reason)
                    selected = null
                }) { Text("改成金币调整") }
                TextButton(onClick = { selected = null }) { Text("取消") }
            }
        }
    }
}

@Composable
private fun GoldAndGacha(store: Store, vm: MoreViewModel, roster: List<Student>) {
    var sid by remember { mutableStateOf(roster.firstOrNull()?.id?.toString() ?: "") }
    Column(Modifier.verticalScroll(rememberScrollState())) {
        Text("金币榜", fontWeight = FontWeight.Medium)
        val rows = scoresOf(vm.data).sortedByDescending { goldOf(vm.data, it.first) }
        rows.take(20).forEachIndexed { i, (id, name, _) ->
            ListItem(
                headlineContent = { Text("${i + 1}. $name") },
                supportingContent = { Text("学号 $id", style = MaterialTheme.typography.bodySmall) },
                trailingContent = { Text("%.1f".format(goldOf(vm.data, id)), fontWeight = FontWeight.Bold) }
            )
            HorizontalDivider()
        }

        Spacer(Modifier.height(12.dp))
        Text("抽奖（周五 12:00 后开放 · 单抽 160 / 十连 1600）", fontWeight = FontWeight.Medium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(sid, { sid = it }, label = { Text("学号") }, singleLine = true, modifier = Modifier.width(120.dp))
            Button(onClick = { vm.gacha(store, sid, 1) }) { Text("单抽") }
            OutlinedButton(onClick = { vm.gacha(store, sid, 10) }) { Text("十连") }
        }
        Text("奖励池来自班级数据的 rewards（按 probability 加权），抽到的学分直接加到该学生。",
            style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun JournalPanel(store: Store, roster: List<Student>) {
    var selected by remember { mutableStateOf(roster.firstOrNull()) }
    var text by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun reload(id: Int) {
        store.applyToApi()
        busy = true
        val r = withContext(Dispatchers.IO) { Api.journal(id) }
        content = (r as? Result.Ok)?.value ?: "读取失败: ${(r as? Result.Err)?.message}"
        busy = false
    }

    Column(Modifier.verticalScroll(rememberScrollState())) {
        Text("选一个学生", fontWeight = FontWeight.Medium)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            roster.forEach { st ->
                FilterChip(selected = selected?.id == st.id, onClick = { selected = st }, label = { Text("${st.id} ${st.name}") })
            }
        }
        LaunchedEffect(selected?.id) { selected?.let { reload(it.id) } }

        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        Card(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
            Text(content.ifEmpty { "（还没有历程记录）" }, Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
        }
        OutlinedTextField(text, { text = it }, label = { Text("追加一段（纯文本，只能追加不能改）") }, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = text.isNotBlank(), onClick = {
                val t = text; text = ""
                scope.launch {
                    store.applyToApi()
                    val r = withContext(Dispatchers.IO) { Api.journalAdd(selected?.id ?: 0, t, null) }
                    if (r is Result.Ok) selected?.let { reload(it.id) }
                }
            }) { Text("追加") }
        }
    }
}

@Composable
private fun LogsPanel(vm: MoreViewModel) {
    val logs = vm.data?.optJSONArray("logs")
    Column(Modifier.verticalScroll(rememberScrollState())) {
        if (logs == null || logs.length() == 0) {
            Text("（暂无日志）")
        } else {
            for (i in 0 until minOf(logs.length(), 60)) {
                val l = logs.optJSONObject(i) ?: continue
                ListItem(
                    headlineContent = { Text("${l.optString("action")} · ${l.optString("student_name")}") },
                    supportingContent = {
                        Text("${l.optString("timestamp")} · ${l.optString("reason")}", style = MaterialTheme.typography.bodySmall)
                    },
                    trailingContent = { Text("%+.1f".format(l.optDouble("score_change"))) }
                )
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun GroupsPanel(store: Store, vm: MoreViewModel) {
    val groups = vm.data?.optJSONObject("groups")
    val scores = vm.data?.optJSONObject("scores")
    var name by remember { mutableStateOf("") }
    var sid by remember { mutableStateOf("") }
    Column(Modifier.verticalScroll(rememberScrollState())) {
        OutlinedTextField(name, { name = it }, label = { Text("分组名，如 第一组") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(sid, { sid = it }, label = { Text("学号") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Button(onClick = { vm.groupEdit(store, name, sid, "create") }) { Text("创建", style = MaterialTheme.typography.labelMedium) }
            Button(onClick = { vm.groupEdit(store, name, sid, "delete") }) { Text("删除", style = MaterialTheme.typography.labelMedium) }
            Button(onClick = { vm.groupEdit(store, name, sid, "add") }) { Text("加人", style = MaterialTheme.typography.labelMedium) }
            Button(onClick = { vm.groupEdit(store, name, sid, "remove") }) { Text("移人", style = MaterialTheme.typography.labelMedium) }
        }
        vm.message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        if (groups == null || groups.length() == 0) { Text("（还没有分组）"); return@Column }
        val keys = groups.keys()
        while (keys.hasNext()) {
            val g = keys.next()
            val members = groups.optJSONArray(g) ?: continue
            var sum = 0.0; var cnt = 0
            val names = mutableListOf<String>()
            for (i in 0 until members.length()) {
                val s = members.optString(i)
                if (s == "0") continue
                val row = scores?.opt(s)
                val nm = if (row is JSONArray) row.optString(0, s) else s
                val sc = if (row is JSONArray) row.optDouble(1, 0.0) else 0.0
                sum += sc; cnt++; names.add("$s $nm")
            }
            ListItem(
                headlineContent = { Text(g) },
                supportingContent = { Text(names.joinToString("、"), style = MaterialTheme.typography.bodySmall) },
                trailingContent = { Text("均分 %.1f".format(if (cnt > 0) sum / cnt else 0.0)) }
            )
            HorizontalDivider()
        }
    }
}

@Composable
private fun InitPanel(store: Store, vm: MoreViewModel) {
    var count by remember { mutableStateOf("51") }
    var subjects by remember { mutableStateOf("语文,数学") }

    Column(Modifier.verticalScroll(rememberScrollState())) {
        Text("⚠ 初始化会重建作业数据（学生数 × 科目），已有作业记录会清空。", color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(count, { count = it }, label = { Text("学生数") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(subjects, { subjects = it }, label = { Text("科目（逗号分隔）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Button(onClick = {
            val n = count.toIntOrNull() ?: return@Button
            val subs = subjects.split(',').map { it.trim() }.filter { it.isNotEmpty() }
            if (n > 0 && subs.isNotEmpty()) vm.initHomework(store, n, subs)
        }) { Text("执行初始化") }

        Spacer(Modifier.height(16.dp))
        Text("已配置的作业种类", fontWeight = FontWeight.Medium)
        val types = vm.meta?.optJSONObject("types")
        if (types == null || types.length() == 0) {
            Text("（没配种类：所有科目按“整科已交”计）", style = MaterialTheme.typography.bodySmall)
        } else {
            val subjNames = vm.meta?.optJSONObject("subjectNames")
            val keys = types.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                val arr = types.optJSONArray(k) ?: continue
                val nm = subjNames?.optString(k) ?: "科目$k"
                ListItem(
                    headlineContent = { Text(nm) },
                    supportingContent = { Text((0 until arr.length()).joinToString(" ") { "$it=${arr.optString(it)}" },
                        style = MaterialTheme.typography.bodySmall) }
                )
                HorizontalDivider()
            }
        }
    }
}


// ---------- 职位 / 考试 / 汇报 / 备份 / 账号 ----------

@Composable
private fun PositionsPanel(store: Store, vm: MoreViewModel) {
    val pos = vm.data?.optJSONObject("positions")
    val list = pos?.optJSONObject("list")
    Column(Modifier.verticalScroll(rememberScrollState())) {
        if (list == null || list.length() == 0) {
            Text("（还没有职位）", style = MaterialTheme.typography.bodySmall)
        } else {
            val scores = vm.data?.optJSONObject("scores")
            val keys = list.keys()
            while (keys.hasNext()) {
                val n = keys.next()
                val item = list.optJSONObject(n) ?: continue
                val members = item.optJSONArray("members") ?: JSONArray()
                val names = (0 until members.length()).map { i ->
                    val sid = members.optString(i)
                    val r = scores?.opt(sid)
                    sid + " " + if (r is JSONArray) r.optString(0) else ""
                }
                ListItem(
                    headlineContent = { Text(n) },
                    supportingContent = { Text("月薪 ${item.optDouble("salary", 0.0).toInt()} · " +
                        (if (names.isEmpty()) "（空缺）" else names.joinToString("、")),
                        style = MaterialTheme.typography.bodySmall) }
                )
                HorizontalDivider()
            }
        }
        Text("上次发薪: " + (pos?.optString("lastPayDate")?.ifEmpty { "从未" } ?: "从未"),
            style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(10.dp))
        Button(onClick = { vm.paySalaries(store) }) { Text("给所有班干发工资") }
        Text("每人每职位叠加发放，工资进金币。", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ExamPanel(vm: MoreViewModel) {
    val exams = vm.data?.optJSONObject("examScores")
    Column(Modifier.verticalScroll(rememberScrollState())) {
        if (exams == null || exams.length() == 0) { Text("（还没有考试记录）"); return@Column }
        val scores = vm.data?.optJSONObject("scores")
        val keys = exams.keys()
        while (keys.hasNext()) {
            val sid = keys.next()
            val arr = exams.optJSONArray(sid) ?: continue
            val r = scores?.opt(sid)
            val name = if (r is JSONArray) r.optString(0) else ""
            Text("学号 $sid $name", fontWeight = FontWeight.Medium)
            for (i in 0 until arr.length()) {
                val e = arr.optJSONObject(i) ?: continue
                val full = e.optDouble("full", 0.0)
                val sc = e.optDouble("score", 0.0)
                ListItem(
                    headlineContent = { Text("${e.optString("subject")} · ${e.optString("name")}") },
                    supportingContent = { Text(e.optString("date"), style = MaterialTheme.typography.bodySmall) },
                    trailingContent = { Text("%.0f/%.0f (%.0f%%)".format(sc, full, if (full > 0) sc / full * 100 else 0.0)) }
                )
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun ReportPanel(store: Store, vm: MoreViewModel) {
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    val dr = vm.data?.optJSONObject("dailyReport")?.optJSONObject(today)
    val scores = scoresOf(vm.data)
    var delta by remember { mutableStateOf("2") }
    var reason by remember { mutableStateOf("") }
    Column(Modifier.verticalScroll(rememberScrollState())) {
        ListItem(
            headlineContent = { Text("今日汇报状态") },
            trailingContent = { Text(if (dr?.optBoolean("allReported") == true) "✅ 已全部汇报" else "⭕ 未完成") }
        )
        HorizontalDivider()
        ListItem(headlineContent = { Text("最后汇报时间") },
            trailingContent = { Text(dr?.optString("lastReportTime")?.ifEmpty { "-" } ?: "-") })
        HorizontalDivider()
        ListItem(headlineContent = { Text("全班人数") }, trailingContent = { Text("${scores.size} 人") })
        HorizontalDivider()
        ListItem(headlineContent = { Text("平均分") },
            trailingContent = { Text("%.1f".format(if (scores.isEmpty()) 0.0 else scores.sumOf { it.third } / scores.size)) })
        HorizontalDivider()
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(delta, { delta = it }, label = { Text("加减值") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(reason, { reason = it }, label = { Text("原因") }, singleLine = true, modifier = Modifier.weight(2f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Button(onClick = { vm.reportWrite(store, "all") }) { Text("全部已汇报", style = MaterialTheme.typography.labelMedium) }
            Button(onClick = {
                val v = delta.toDoubleOrNull()
                if (v == null || v == 0.0) vm.message = "加减值要填非 0 数字" else vm.reportBatch(store, v, reason)
            }) { Text("批量应用到全班", style = MaterialTheme.typography.labelMedium) }
            Button(onClick = { vm.reportWrite(store, "reset") }) { Text("重置", style = MaterialTheme.typography.labelMedium) }
        }
        vm.message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun BackupPanel(vm: MoreViewModel) {
    val clip = androidx.compose.ui.platform.LocalClipboardManager.current
    val json = vm.data?.toString() ?: ""
    Column(Modifier.verticalScroll(rememberScrollState())) {
        Text("整班数据 ${json.length} 字节", fontWeight = FontWeight.Medium)
        Text("导出就是把 GET /api/class/{id} 的 data 原样保存，和网页「导出数据」一致。",
            style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(8.dp))
        Button(enabled = json.isNotEmpty(), onClick = { clip.setText(androidx.compose.ui.text.AnnotatedString(json)) }) {
            Text("复制整班 JSON 到剪贴板")
        }
        Spacer(Modifier.height(8.dp))
        Text(json.take(600) + if (json.length > 600) "…" else "", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun AccountPanel(store: Store) {
    Column(Modifier.verticalScroll(rememberScrollState())) {
        ListItem(headlineContent = { Text("服务器") }, trailingContent = { Text(store.server) })
        HorizontalDivider()
        ListItem(headlineContent = { Text("班级") }, trailingContent = { Text(store.classId) })
        HorizontalDivider()
        ListItem(headlineContent = { Text("密码") },
            trailingContent = { Text(if (store.password.isEmpty()) "未设置" else "已设置") })
        HorizontalDivider()
        Text("要改这些去「配置」页；账号权限（root/admin/user）由网页端角色决定，移动端不单独维护。",
            style = MaterialTheme.typography.bodySmall)
    }
}


@Composable
private fun AutoEventsPanel(store: Store, vm: MoreViewModel) {
    var name by remember { mutableStateOf("每周一加分") }
    var freq by remember { mutableStateOf("weekly:1") }
    var targets by remember { mutableStateOf("all") }
    var change by remember { mutableStateOf("+1") }
    var reason by remember { mutableStateOf("") }

    val events = vm.data?.optJSONArray("autoEvents")
    Column(Modifier.verticalScroll(rememberScrollState())) {
        if (events == null || events.length() == 0) {
            Text("（还没有自动事件）", style = MaterialTheme.typography.bodySmall)
        } else {
            for (i in 0 until events.length()) {
                val e = events.optJSONObject(i) ?: continue
                val when_ = when (e.optString("frequency")) {
                    "weekly" -> "周${e.optInt("dayOfWeek")}"
                    "monthly" -> "${e.optInt("dayOfMonth")} 日"
                    else -> ""
                }
                val t = e.optJSONArray("targets")?.let { a -> (0 until a.length()).joinToString(",") { a.optString(it) } } ?: ""
                ListItem(
                    headlineContent = { Text("[${i}] ${e.optString("name")}") },
                    supportingContent = { Text("${e.optString("frequency")} $when_ · $t · ${e.optString("reason", "自动事件")}",
                        style = MaterialTheme.typography.bodySmall) },
                    trailingContent = { Text(String.format("%+.1f", e.optDouble("change", 0.0)), fontWeight = FontWeight.Bold) }
                )
                HorizontalDivider()
            }
        }
        Spacer(Modifier.height(10.dp))
        Button(onClick = { vm.runAutoEvents(store) }) { Text("▶ 立即执行到期事件") }
        Text("规则和网页一致：daily 每天、weekly 指定星期、monthly 指定日；同一事件同一天只跑一次。",
            style = MaterialTheme.typography.bodySmall)

        Spacer(Modifier.height(12.dp))
        Text("添加事件", fontWeight = FontWeight.Medium)
        OutlinedTextField(name, { name = it }, label = { Text("名称") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(freq, { freq = it }, label = { Text("频率 daily / weekly:1 / monthly:15") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(targets, { targets = it }, label = { Text("目标（all / group:组名 / 学号，逗号分隔）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(change, { change = it }, label = { Text("分值，例如 +1 或 -2") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(reason, { reason = it }, label = { Text("原因（可空）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            vm.addAutoEvent(store, name, freq, targets, change.toDoubleOrNull() ?: 0.0, reason)
        }) { Text("添加") }
    }
}
