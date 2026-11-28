// 极简 JSON（只解析 + 生成，够 OpenStu 接口用），单头文件，无第三方依赖
#pragma once
#include <string>
#include <vector>
#include <map>
#include <cmath>
#include <cstdio>
#include <stdexcept>

namespace js {

struct Value {
    enum Type { NUL, BOOL, NUM, STR, ARR, OBJ } t = NUL;
    bool b = false;
    double n = 0;
    std::string s;
    std::vector<Value> a;
    std::map<std::string, Value> o;

    bool isObj() const { return t == OBJ; }
    bool isArr() const { return t == ARR; }
    bool isStr() const { return t == STR; }
    bool isNum() const { return t == NUM; }

    // 取子值，不存在返回静态空值
    const Value& operator[](const std::string& k) const {
        static const Value empty;
        auto it = o.find(k);
        return it == o.end() ? empty : it->second;
    }
    const Value& at(size_t i) const {
        static const Value empty;
        return i < a.size() ? a[i] : empty;
    }
    std::string asStr() const { return t == STR ? s : (t == NUM ? fmtNum() : ""); }
    int asInt() const { return t == NUM ? (int)n : (t == STR ? atoi(s.c_str()) : 0); }
    bool asBool() const { return t == BOOL ? b : (t == NUM ? n != 0 : false); }
    long long asLong() const { return t == NUM ? (long long)n : 0; }

    std::string fmtNum() const {
        char buf[64];
        if (std::fabs(n - (double)(long long)n) < 1e-9 && std::fabs(n) < 1e15)
            snprintf(buf, sizeof buf, "%lld", (long long)n);
        else snprintf(buf, sizeof buf, "%.6f", n);
        return buf;
    }

    // 生成
    static Value obj() { Value v; v.t = OBJ; return v; }
    static Value arr() { Value v; v.t = ARR; return v; }
    static Value str(const std::string& x) { Value v; v.t = STR; v.s = x; return v; }
    static Value num(double x) { Value v; v.t = NUM; v.n = x; return v; }
    static Value boolean(bool x) { Value v; v.t = BOOL; v.b = x; return v; }

    Value& set(const std::string& k, const Value& v) { t = OBJ; o[k] = v; return *this; }
    Value& push(const Value& v) { t = ARR; a.push_back(v); return *this; }

    std::string dump() const {
        switch (t) {
            case NUL:  return "null";
            case BOOL: return b ? "true" : "false";
            case NUM:  return fmtNum();
            case STR:  return "\"" + esc(s) + "\"";
            case ARR: {
                std::string r = "[";
                for (size_t i = 0; i < a.size(); ++i) { if (i) r += ","; r += a[i].dump(); }
                return r + "]";
            }
            default: {
                std::string r = "{";
                bool first = true;
                for (auto& kv : o) { if (!first) r += ","; first = false; r += "\"" + esc(kv.first) + "\":" + kv.second.dump(); }
                return r + "}";
            }
        }
    }

    static std::string esc(const std::string& x) {
        std::string r;
        for (char c : x) {
            switch (c) {
                case '"':  r += "\\\""; break;
                case '\\': r += "\\\\"; break;
                case '\n': r += "\\n"; break;
                case '\r': r += "\\r"; break;
                case '\t': r += "\\t"; break;
                default:
                    if ((unsigned char)c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); r += b; }
                    else r += c;
            }
        }
        return r;
    }
};

class Parser {
public:
    explicit Parser(const std::string& src) : s(src) {}
    Value parse() {
        skip();
        Value v = value();
        skip();
        return v;
    }
private:
    const std::string& s;
    size_t i = 0;

    void skip() { while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) ++i; }
    char peek() const { return i < s.size() ? s[i] : '\0'; }

    Value value() {
        skip();
        char c = peek();
        if (c == '{') return object();
        if (c == '[') return array();
        if (c == '"') { Value v; v.t = Value::STR; v.s = string(); return v; }
        if (c == 't') { expect("true"); return Value::boolean(true); }
        if (c == 'f') { expect("false"); return Value::boolean(false); }
        if (c == 'n') { expect("null"); return Value(); }
        return number();
    }

    void expect(const char* w) {
        size_t n = strlen_(w);
        if (s.compare(i, n, w) != 0) throw std::runtime_error("json: bad literal");
        i += n;
    }
    static size_t strlen_(const char* w) { size_t n = 0; while (w[n]) ++n; return n; }

    Value object() {
        Value v = Value::obj();
        ++i; // {
        skip();
        if (peek() == '}') { ++i; return v; }
        while (true) {
            skip();
            std::string k = string();
            skip();
            if (peek() != ':') throw std::runtime_error("json: expect ':'");
            ++i;
            v.o[k] = value();
            skip();
            if (peek() == ',') { ++i; continue; }
            if (peek() == '}') { ++i; break; }
            throw std::runtime_error("json: bad object");
        }
        return v;
    }

    Value array() {
        Value v = Value::arr();
        ++i; // [
        skip();
        if (peek() == ']') { ++i; return v; }
        while (true) {
            v.a.push_back(value());
            skip();
            if (peek() == ',') { ++i; continue; }
            if (peek() == ']') { ++i; break; }
            throw std::runtime_error("json: bad array");
        }
        return v;
    }

    std::string string() {
        if (peek() != '"') throw std::runtime_error("json: expect string");
        ++i;
        std::string r;
        while (i < s.size()) {
            char c = s[i++];
            if (c == '"') return r;
            if (c == '\\') {
                char e = s[i++];
                switch (e) {
                    case 'n': r += '\n'; break;
                    case 'r': r += '\r'; break;
                    case 't': r += '\t'; break;
                    case 'b': r += '\b'; break;
                    case 'f': r += '\f'; break;
                    case '/': r += '/'; break;
                    case '\\': r += '\\'; break;
                    case '"': r += '"'; break;
                    case 'u': {
                        unsigned cp = 0;
                        for (int k = 0; k < 4 && i < s.size(); ++k) {
                            char h = s[i++];
                            cp = cp * 16 + (h >= '0' && h <= '9' ? h - '0' : (h >= 'a' && h <= 'f' ? h - 'a' + 10 : h - 'A' + 10));
                        }
                        // 只处理 BMP，够用（中文字段都在 BMP）
                        if (cp < 0x80) r += (char)cp;
                        else if (cp < 0x800) { r += (char)(0xC0 | (cp >> 6)); r += (char)(0x80 | (cp & 0x3F)); }
                        else { r += (char)(0xE0 | (cp >> 12)); r += (char)(0x80 | ((cp >> 6) & 0x3F)); r += (char)(0x80 | (cp & 0x3F)); }
                        break;
                    }
                    default: r += e;
                }
            } else r += c;
        }
        throw std::runtime_error("json: unterminated string");
    }

    Value number() {
        size_t start = i;
        if (peek() == '-' || peek() == '+') ++i;
        while (i < s.size() && (isdigit(s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '-' || s[i] == '+')) ++i;
        if (start == i) throw std::runtime_error("json: bad number");
        Value v = Value::num(atof(s.substr(start, i - start).c_str()));
        return v;
    }
};

inline Value parse(const std::string& src) { Parser p(src); return p.parse(); }

} // namespace js
