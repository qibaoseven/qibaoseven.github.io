package io.qibaoseven.openstu

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import javax.net.ssl.HttpsURLConnection

/** 一次接口调用的结果：成功给 JSON，失败给可读的错误串 */
sealed class Result<out T> {
    data class Ok<T>(val value: T) : Result<T>()
    data class Err(val message: String, val code: Int = 0) : Result<Nothing>()
}

data class ClassInfo(val id: String, val name: String)

data class RequiredToday(
    val date: String,
    val subjects: List<Int>,
    val subjectNames: Map<Int, String>,
    val studentCount: Int,
    val submitted: Int,
    val total: Int,
)

data class Student(val id: Int, val name: String)

/**
 * OpenStu 接口客户端。只用 HttpURLConnection + org.json，不引第三方库，
 * 免得离线构建时还要拉 okhttp/retrofit。
 */
object Api {

    var server: String = "https://os-stu.netlify.app"
    var classId: String = ""
    var password: String = ""

    fun sha256Hex(s: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        return md.digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    private fun open(path: String, method: String, body: String?, auth: Boolean = true): Result<Pair<Int, String>> {
        return try {
            val url = URL(server.trimEnd('/') + path)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 8000
            conn.readTimeout = 15000
            conn.setRequestProperty("Accept", "application/json")
            if (auth && classId.isNotEmpty()) {
                conn.setRequestProperty("X-Password", password)
                conn.setRequestProperty("X-Password-Hash", sha256Hex(password))
            }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use(BufferedReader::readText) ?: ""
            conn.disconnect()
            Result.Ok(code to text)
        } catch (e: Exception) {
            Result.Err(e.message ?: "网络错误")
        }
    }

    private fun errorText(code: Int, body: String): String {
        val prefix = "HTTP $code"
        return try {
            val o = JSONObject(body)
            val err = o.optString("error")
            val c = o.optString("code")
            buildString {
                append(prefix)
                if (err.isNotEmpty()) append(" · ").append(err)
                if (c.isNotEmpty()) append(" (").append(c).append(")")
            }
        } catch (_: Exception) { prefix }
    }

    // ---------- 具体接口 ----------

    fun classes(): Result<List<ClassInfo>> {
        val r = open("/api/classes", "GET", null, auth = false)   // 公开接口，不带鉴权头
        return when (r) {
            is Result.Err -> r
            is Result.Ok -> {
                val (code, body) = r.value
                if (code !in 200..299) return Result.Err(errorText(code, body), code)
                try {
                    val arr = JSONArray(body)
                    Result.Ok((0 until arr.length()).map {
                        val o = arr.getJSONObject(it)
                        ClassInfo(o.optString("id"), o.optString("name"))
                    })
                } catch (e: Exception) { Result.Err("返回格式异常: ${e.message}") }
            }
        }
    }

    fun roster(): Result<List<Student>> = when (val r = open("/api/class/$classId/students", "GET", null)) {
        is Result.Err -> r
        is Result.Ok -> {
            val (code, body) = r.value
            if (code !in 200..299) Result.Err(errorText(code, body), code)
            else try {
                val o = JSONObject(body).getJSONObject("students")
                val list = mutableListOf<Student>()
                val keys = o.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    val id = k.toIntOrNull() ?: continue
                    list.add(Student(id, o.optString(k)))
                }
                Result.Ok(list.sortedBy { it.id })
            } catch (e: Exception) { Result.Err("名册解析失败: ${e.message}") }
        }
    }

    fun required(date: String? = null): Result<RequiredToday> {
        val d = date ?: java.time.LocalDate.now().toString()
        return when (val r = open("/api/class/$classId/homework/required?date=$d", "GET", null)) {
            is Result.Err -> r
            is Result.Ok -> {
                val (code, body) = r.value
                if (code !in 200..299) return Result.Err(errorText(code, body), code)
                try {
                    val o = JSONObject(body)
                    val req = o.optJSONArray("required") ?: JSONArray()
                    val namesObj = o.optJSONObject("subjectNames") ?: JSONObject()
                    val subjects = (0 until req.length()).map { req.getInt(it) }
                    val names = mutableMapOf<Int, String>()
                    val keys = namesObj.keys()
                    while (keys.hasNext()) {
                        val k = keys.next()
                        names[k.toIntOrNull() ?: continue] = namesObj.optString(k)
                    }
                    Result.Ok(
                        RequiredToday(
                            date = o.optString("date", d),
                            subjects = subjects,
                            subjectNames = names,
                            studentCount = o.optInt("studentCount"),
                            submitted = o.optInt("submitted"),
                            total = o.optInt("total"),
                        )
                    )
                } catch (e: Exception) { Result.Err("应交数据解析失败: ${e.message}") }
            }
        }
    }

    /** 今日每名学生每科的已交状态：Map<学号, Map<科目索引, 是否已交>> */
    fun todayMatrix(date: String): Result<Map<Int, Map<Int, Boolean>>> =
        when (val r = open("/api/class/$classId/homework", "GET", null)) {
            is Result.Err -> r
            is Result.Ok -> {
                val (code, body) = r.value
                if (code !in 200..299) Result.Err(errorText(code, body), code)
                else try {
                    val root = JSONObject(body)
                    val data = root.getJSONArray("data")
                    val from = root.optString("dateFrom")
                    val dayIdx = if (from.isEmpty()) -1 else
                        java.time.temporal.ChronoUnit.DAYS.between(
                            java.time.LocalDate.parse(from), java.time.LocalDate.parse(date)).toInt()
                    val out = mutableMapOf<Int, Map<Int, Boolean>>()
                    if (dayIdx >= 0 && dayIdx < data.length()) {
                        val day = data.getJSONArray(dayIdx)
                        for (sid in 0 until day.length()) {
                            val row = day.getJSONArray(sid)
                            val marks = mutableMapOf<Int, Boolean>()
                            for (s in 0 until row.length()) marks[s] = row.getInt(s) != 0
                            if (sid > 0) out[sid] = marks
                        }
                    }
                    Result.Ok(out)
                } catch (e: Exception) { Result.Err("作业数据解析失败: ${e.message}") }
            }
        }

    /** 绑卡：POST /uuids/add，可顺带登记学号/学科/种类 */
    fun addUid(uid: String, studentId: Int, subjectId: Int? = null,
               typeId: Int? = null, date: String? = null): Result<JSONObject> {
        val body = JSONObject().apply {
            put("uid", uid)
            put("student_id", studentId)
            if (subjectId != null) put("subject_id", subjectId)
            if (typeId != null) put("type_id", typeId)
            if (date != null) put("target_date", date)
        }
        return when (val r = open("/api/class/$classId/uuids/add", "POST", body.toString())) {
            is Result.Err -> r
            is Result.Ok -> {
                val (code, text) = r.value
                if (code !in 200..299) Result.Err(errorText(code, text), code) else Result.Ok(JSONObject(text))
            }
        }
    }

    fun submit(studentId: Int, subjectId: Int, date: String, typeId: Int? = null): Result<JSONObject> {
        val body = JSONObject().apply {
            put("student_id", studentId)
            put("target_date", date)
            put("subject_id", subjectId)
            if (typeId != null) put("type_id", typeId)
        }
        return when (val r = open("/api/class/$classId/homework/update", "POST", body.toString())) {
            is Result.Err -> r
            is Result.Ok -> {
                val (code, text) = r.value
                if (code !in 200..299) Result.Err(errorText(code, text), code)
                else Result.Ok(JSONObject(text))
            }
        }
    }
}
