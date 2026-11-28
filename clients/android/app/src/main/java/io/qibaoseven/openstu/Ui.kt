package io.qibaoseven.openstu

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 保存配置：服务器地址、班级 ID、密码。
 * 放在 SharedPreferences，明文——和网页版一样只在本机，所以不额外加密。
 */
class Store(ctx: Context) {
    private val sp = ctx.getSharedPreferences("openstu", Context.MODE_PRIVATE)

    var server: String
        get() = sp.getString("server", "https://os-stu.netlify.app") ?: "https://os-stu.netlify.app"
        set(v) = sp.edit().putString("server", v).apply()

    var classId: String
        get() = sp.getString("class_id", "") ?: ""
        set(v) = sp.edit().putString("class_id", v).apply()

    var password: String
        get() = sp.getString("password", "") ?: ""
        set(v) = sp.edit().putString("password", v).apply()

    val configured: Boolean get() = classId.isNotEmpty() && password.isNotEmpty()

    fun applyToApi() {
        Api.server = server
        Api.classId = classId
        Api.password = password
    }
}

/** 界面状态 */
data class UiState(
    val loading: Boolean = false,
    val required: RequiredToday? = null,
    val roster: List<Student> = emptyList(),
    val marks: Map<Int, Map<Int, Boolean>> = emptyMap(),
    val message: String? = null,
)

class MainViewModel : ViewModel() {
    var state by mutableStateOf(UiState())
        private set

    fun refresh(store: Store) {
        store.applyToApi()
        state = state.copy(loading = true, message = null)
        viewModelScope.launch {
            val req = withContext(Dispatchers.IO) { Api.required() }
            val roster = withContext(Dispatchers.IO) { Api.roster() }
            val matrix = withContext(Dispatchers.IO) { Api.todayMatrix(reqOrToday(req)) }
            state = when (req) {
                is Result.Err -> state.copy(loading = false, message = req.message)
                is Result.Ok -> state.copy(
                    loading = false,
                    required = req.value,
                    roster = (roster as? Result.Ok)?.value ?: state.roster,
                    marks = (matrix as? Result.Ok)?.value ?: emptyMap(),
                    message = (roster as? Result.Err)?.message,
                )
            }
        }
    }

    fun submit(store: Store, student: Student, subjectId: Int) {
        val date = state.required?.date ?: return
        store.applyToApi()
        viewModelScope.launch {
            val r = withContext(Dispatchers.IO) { Api.submit(student.id, subjectId, date) }
            when (r) {
                is Result.Ok -> {
                    val changed = r.value.optBoolean("changed")
                    state = state.copy(message = "已登记：${student.name} ${subjectName(subjectId)}" +
                        if (changed) "" else "（原本已交，未重复计分）")
                    refresh(store)
                }
                is Result.Err -> state = state.copy(message = "登记失败: ${r.message}")
            }
        }
    }

    private fun reqOrToday(r: Result<RequiredToday>): String =
        (r as? Result.Ok)?.value?.date ?: java.time.LocalDate.now().toString()

    fun subjectName(id: Int): String =
        state.required?.subjectNames?.get(id) ?: "科目$id"
}

// ============================ 界面 ============================

@Composable
fun ConfigScreen(store: Store, onDone: () -> Unit) {
    var server by remember { mutableStateOf(store.server) }
    var classId by remember { mutableStateOf(store.classId) }
    var password by remember { mutableStateOf(store.password) }
    var classes by remember { mutableStateOf<List<ClassInfo>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Text("连接班级", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text("填服务器、班级 ID 和密码；点“拉取班级列表”可以按名字核对 ID。",
            style = MaterialTheme.typography.bodySmall)

        Spacer(Modifier.height(16.dp))
        OutlinedTextField(server, { server = it }, label = { Text("服务器") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(classId, { classId = it }, label = { Text("班级 ID") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(password, { password = it }, label = { Text("密码") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth())

        Spacer(Modifier.height(14.dp))
        Row {
            Button(onClick = {
                Api.server = server
                scope.launch {
                    when (val r = withContext(Dispatchers.IO) { Api.classes() }) {
                        is Result.Ok -> { classes = r.value; error = null }
                        is Result.Err -> error = r.message
                    }
                }
            }) { Text("拉取班级列表") }
            Spacer(Modifier.width(10.dp))
            Button(onClick = {
                store.server = server.trim()
                store.classId = classId.trim()
                store.password = password
                store.applyToApi()
                onDone()
            }) { Text("保存并进入") }
        }

        if (classes.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Text("服务器上的班级", fontWeight = FontWeight.Medium)
            classes.forEach { c ->
                TextButton(onClick = { classId = c.id }) {
                    Text("${c.name}  ·  ${c.id}")
                }
            }
        }
        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
fun MainScreen(store: Store, vm: MainViewModel, onConfig: () -> Unit, onDevice: () -> Unit = {}, onMore: () -> Unit = {}) {
    val state = vm.state
    LaunchedEffect(Unit) { vm.refresh(store) }

    var target by remember { mutableStateOf<Student?>(null) }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(store.classId, fontWeight = FontWeight.Bold)
                Text(state.required?.let { "${it.date} · 应交 ${it.subjects.size} 科" } ?: "未加载",
                    style = MaterialTheme.typography.bodySmall)
            }
            TextButton(onClick = onMore) { Text("更多") }
            TextButton(onClick = onDevice) { Text("设备") }
            TextButton(onClick = onConfig) { Text("设置") }
            Button(onClick = { vm.refresh(store) }, enabled = !state.loading) { Text("刷新") }
        }

        val req = state.required
        if (req != null) {
            Spacer(Modifier.height(10.dp))
            LinearProgressIndicator(
                progress = if (req.total > 0) req.submitted.toFloat() / req.total else 0f,
                modifier = Modifier.fillMaxWidth()
            )
            Text("已交 ${req.submitted}/${req.total}", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            Row {
                req.subjects.forEach { s ->
                    SuggestionChip(onClick = {}, label = { Text(vm.subjectName(s)) },
                        modifier = Modifier.padding(end = 6.dp))
                }
            }
        }

        state.message?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
        }

        Spacer(Modifier.height(8.dp))
        Divider()
        Spacer(Modifier.height(4.dp))

        LazyColumn(Modifier.fillMaxSize()) {
            items(state.roster) { st ->
                val marks = state.marks[st.id] ?: emptyMap()
                val doneCount = req?.subjects?.count { marks[it] == true } ?: 0
                ListItem(
                    headlineContent = { Text("${st.id}  ${st.name}") },
                    supportingContent = {
                        Text(
                            req?.subjects?.joinToString("  ") { s ->
                                val name = vm.subjectName(s)
                                if (marks[s] == true) "$name ✓" else name
                            } ?: "",
                            style = MaterialTheme.typography.bodySmall
                        )
                    },
                    trailingContent = {
                        Text("$doneCount/${req?.subjects?.size ?: 0}",
                            color = if (doneCount == (req?.subjects?.size ?: 0)) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                    modifier = Modifier.clickable { target = st }
                )
                Divider()
            }
        }
    }

    val t = target
    if (t != null) {
        AlertDialog(
            onDismissRequest = { target = null },
            title = { Text("${t.id} ${t.name} · 登记") },
            text = {
                Column {
                    Text("选择要标记为已交的科目：")
                    Spacer(Modifier.height(8.dp))
                    req?.subjects?.forEach { s ->
                        val already = state.marks[t.id]?.get(s) == true
                        OutlinedButton(
                            onClick = { target = null; vm.submit(store, t, s) },
                            enabled = !already,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)
                        ) { Text(vm.subjectName(s) + if (already) "（已交）" else "") }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { target = null }) { Text("取消") } }
        )
    }
}
