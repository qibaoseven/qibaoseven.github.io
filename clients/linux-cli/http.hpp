// libcurl 薄封装：GET / POST JSON，带超时与错误信息
#pragma once
#include <string>
#include <vector>
#include <utility>
#include <curl/curl.h>
#include <stdexcept>

namespace http {

struct Response {
    long code = 0;
    std::string body;
    bool ok() const { return code >= 200 && code < 300; }
};

inline size_t onWrite(char* ptr, size_t size, size_t nmemb, void* userdata) {
    static_cast<std::string*>(userdata)->append(ptr, size * nmemb);
    return size * nmemb;
}

inline void globalInit() {
    static bool done = false;
    if (!done) { curl_global_init(CURL_GLOBAL_DEFAULT); done = true; }
}

inline Response request(const std::string& method, const std::string& url,
                        const std::vector<std::pair<std::string, std::string>>& headers,
                        const std::string& body = "") {
    globalInit();
    CURL* h = curl_easy_init();
    if (!h) throw std::runtime_error("curl_easy_init failed");

    Response r;
    struct curl_slist* hs = nullptr;
    for (auto& kv : headers) hs = curl_slist_append(hs, (kv.first + ": " + kv.second).c_str());

    curl_easy_setopt(h, CURLOPT_URL, url.c_str());
    curl_easy_setopt(h, CURLOPT_HTTPHEADER, hs);
    curl_easy_setopt(h, CURLOPT_WRITEFUNCTION, onWrite);
    curl_easy_setopt(h, CURLOPT_WRITEDATA, &r.body);
    curl_easy_setopt(h, CURLOPT_TIMEOUT, 15L);
    curl_easy_setopt(h, CURLOPT_CONNECTTIMEOUT, 8L);
    curl_easy_setopt(h, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(h, CURLOPT_USERAGENT, "openstu-cli/0.46");
    curl_easy_setopt(h, CURLOPT_SSL_VERIFYPEER, 1L);

    if (method == "POST") {
        curl_easy_setopt(h, CURLOPT_POST, 1L);
        curl_easy_setopt(h, CURLOPT_POSTFIELDS, body.c_str());
        curl_easy_setopt(h, CURLOPT_POSTFIELDSIZE, (long)body.size());
    }

    CURLcode rc = curl_easy_perform(h);
    if (rc != CURLE_OK) {
        std::string err = curl_easy_strerror(rc);
        curl_slist_free_all(hs);
        curl_easy_cleanup(h);
        throw std::runtime_error("http: " + err);
    }
    curl_easy_getinfo(h, CURLINFO_RESPONSE_CODE, &r.code);
    curl_slist_free_all(hs);
    curl_easy_cleanup(h);
    return r;
}

} // namespace http
