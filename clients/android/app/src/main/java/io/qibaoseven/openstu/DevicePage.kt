package io.qibaoseven.openstu

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 设备管理：
 * - 刷录固件 / 串口查看：Android 端无法提供（Chrome for Android 没有 Web Serial，
 *   OTG 串口要自己实现 USB 驱动 + esptool 协议），所以这里只给"为什么不能"和替代方案，
 *   按钮置灰，绝不假装能刷。
 * - 手动填写 UID：真能用，走 /uuids/add。
 */
class DeviceViewModel : ViewModel() {
    var busy by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set

    fun addUid(store: Store, uid: String, studentId: Int, subjectId: Int?, typeId: Int?, date: String?) {
        store.applyToApi()
        busy = true
        viewModelScope.launch {
            val r = withContext(Dispatchers.IO) { Api.addUid(uid, studentId, subjectId, typeId, date) }
            message = when (r) {
                is Result.Ok -> "已绑定: $uid → 学号 $studentId"
                is Result.Err -> "提交失败: ${r.message}"
            }
            busy = false
        }
    }
}

@Composable
fun DevicePage(
    store: Store,
    vm: DeviceViewModel,
    roster: List<Student>,
    subjects: List<Int>,
    subjectName: (Int) -> String,
    date: String,
    onBack: () -> Unit,
) {
    var uid by remember { mutableStateOf("") }
    var studentIndex by remember { mutableIntStateOf(0) }
    var subjectIndex by remember { mutableIntStateOf(0) }

    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row {
            Text("设备管理", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack) { Text("返回") }
        }

        // ---- 刷录 ----
        ElevatedCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("⚡ 自动刷录固件", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Android 端无法使用：本机没有 Web Serial（Chrome for Android 不提供），" +
                    "OTG 串口还需要专门的 USB 驱动和 esptool 协议实现。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
                Text(
                    "替代方案：① 把板子插到电脑，用网页端「硬件登记 → 自动刷录」；" +
                    "② 手机装 Termux，跑 pkg install python termux-api libusb && pip install nrflash；" +
                    "③ 用下面给的手动命令。",
                    style = MaterialTheme.typography.bodySmall
                )
                Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Text("无法刷录（此端不支持）")
                }
            }
        }

        // ---- 串口 ----
        ElevatedCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("🔌 串口查看 UID", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Android 端无法使用：读串口需要 OTG + USB-Serial 驱动（CP2102/CH340），" +
                    "系统不提供 Web Serial 等价能力。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
                Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Text("无法读取串口（此端不支持）")
                }
            }
        }

        // ---- 手动填写 ----
        ElevatedCard {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("✍ 手动填写 UID", style = MaterialTheme.typography.titleMedium)
                Text("把卡面/读卡器上的 UID 抄进来，直接绑学号（数据格式 1~7 字节，如 12:34:56:78:9A:BC:DE）。",
                    style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    uid, { uid = it },
                    label = { Text("UID") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                if (roster.isEmpty()) {
                    Text("名册还没加载，先回首页点刷新", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error)
                } else {
                    Text("学号", style = MaterialTheme.typography.bodySmall)
                    LazyRowChips(
                        items = roster.map { "${it.id} ${it.name}" },
                        selected = studentIndex,
                        onSelect = { studentIndex = it }
                    )
                }
                Text("学科（可选）", style = MaterialTheme.typography.bodySmall)
                LazyRowChips(
                    items = listOf("不设置") + subjects.map { subjectName(it) },
                    selected = subjectIndex,
                    onSelect = { subjectIndex = it }
                )
                Text("日期: $date", style = MaterialTheme.typography.bodySmall)

                Button(
                    onClick = {
                        val sid = roster[studentIndex].id
                        val sub = if (subjectIndex == 0) null else subjects[subjectIndex - 1]
                        vm.addUid(store, uid.trim(), sid, sub, null, date)
                    },
                    enabled = !vm.busy && uid.isNotBlank() && roster.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (vm.busy) "提交中…" else "提交绑定") }
            }
        }

        vm.message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }

        Text(
            "手动命令（电脑上）：esptool.py --port <端口> write_flash 0x0 openstu-v0.46-hw4-1M64.bin",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun LazyRowChips(items: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEachIndexed { i, label ->
            FilterChip(selected = selected == i, onClick = { onSelect(i) }, label = { Text(label) })
        }
    }
}
