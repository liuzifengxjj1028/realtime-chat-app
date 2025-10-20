# "Fail to Fetch" 问题诊断报告

**问题**: 用户在实际使用时经常遇到 "fail to fetch" 错误
**诊断日期**: 2025-10-19

---

## 🔍 问题分析

### 根本原因

**主要原因**: 前端fetch调用**没有设置超时时间**，而后端API处理时间过长

### 问题链条

```
用户请求AI总结 → 前端fetch调用 → 后端调用Anthropic API
                     ↓ 30秒左右
              浏览器默认超时
                     ↓
            fail to fetch 错误

而后端仍在等待（60秒超时）→ 浪费资源
```

---

## 📊 当前配置分析

### 1. 前端Fetch调用（无超时）

**位置**: `app.js:1976`
```javascript
// ❌ 问题：没有超时设置
const response = await fetch('http://localhost:8080/api/summarize_chat', {
    method: 'POST',
    body: formData
    // ← 缺少 signal/timeout 设置
});
```

**影响**:
- 浏览器使用默认超时（通常30秒左右）
- 超时后抛出 `TypeError: Failed to fetch`
- 用户看到 "请求失败：Failed to fetch"

---

### 2. 后端API超时设置（60秒）

**位置**: `server.py:495`
```python
timeout=aiohttp.ClientTimeout(total=60)  # ← 60秒太长
```

**问题**:
- 后端设置60秒，但前端可能30秒就超时
- 导致前后端超时不一致
- 后端继续等待，浪费资源

---

### 3. 天气API调用（无超时）

**位置**: `app.js:2765`
```javascript
const response = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`);
// ← 同样没有超时设置
```

**后端**: `server.py:1933` - 天气API调用也没有设置超时

---

## 🎯 触发场景

### 场景1: AI总结大量文本
```
用户粘贴长聊天记录（10,000字）
→ Anthropic API处理需要40秒
→ 前端30秒超时
→ fail to fetch ❌
```

### 场景2: 处理PDF文件
```
用户上传5MB PDF
→ PDF提取 + AI总结需要50秒
→ 前端30秒超时
→ fail to fetch ❌
```

### 场景3: 网络慢
```
用户网络较慢
→ 请求本身就需要20秒
→ 加上API处理15秒
→ 总共35秒 > 前端超时
→ fail to fetch ❌
```

### 场景4: 服务器负载高
```
多个用户同时请求
→ 服务器响应变慢
→ 超过前端超时时间
→ fail to fetch ❌
```

---

## 🔧 修复方案

### 方案1: 添加前端超时控制（推荐）

**修改 `app.js:1976`**:
```javascript
// ✅ 添加超时控制（90秒）
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 90000); // 90秒

try {
    const response = await fetch('http://localhost:8080/api/summarize_chat', {
        method: 'POST',
        body: formData,
        signal: controller.signal  // ← 添加信号
    });

    clearTimeout(timeoutId);  // 成功后清除超时

    const result = await response.json();
    yizongLoading.style.display = 'none';

    if (response.ok) {
        yizongResultContent.textContent = result.summary;
    } else {
        yizongResultContent.textContent = '错误：' + (result.error || '未知错误');
    }
} catch (error) {
    clearTimeout(timeoutId);
    yizongLoading.style.display = 'none';

    // 区分超时和其他错误
    if (error.name === 'AbortError') {
        yizongResultContent.textContent = '请求超时：处理时间过长，请尝试减少内容或稍后再试';
    } else {
        yizongResultContent.textContent = '请求失败：' + error.message;
    }
}
```

---

### 方案2: 优化后端超时（推荐）

**修改 `server.py:495`**:
```python
# 从60秒减少到30秒
timeout=aiohttp.ClientTimeout(total=30)  # ← 改为30秒
```

**原因**:
- 前端设置90秒超时
- 后端设置30秒超时
- 后端先超时并返回错误信息
- 前端能收到明确的错误（而不是fail to fetch）

---

### 方案3: 添加进度指示（用户体验）

```javascript
// 显示处理中的提示
yizongResultContent.textContent = '正在处理中，这可能需要1-2分钟...';

// 添加倒计时
let countdown = 90;
const countdownInterval = setInterval(() => {
    countdown--;
    yizongResultContent.textContent = `正在处理中（剩余约 ${countdown} 秒）...`;
}, 1000);

// 请求完成后清除
clearInterval(countdownInterval);
```

---

### 方案4: 分块处理大内容

对于超长文本，分批处理：
```python
async def call_llm_api(prompt, user_content):
    # 如果内容超过50000字符，提示用户分段
    if len(user_content) > 50000:
        return "内容过长，建议分成多个部分分别总结，每部分不超过50,000字符"

    # ... 正常处理
```

---

### 方案5: 添加天气API超时

**修改天气API调用**:
```javascript
// app.js 天气API调用
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒

try {
    const response = await fetch(
        `/api/weather?lat=${latitude}&lon=${longitude}`,
        { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    // ...
} catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
        console.log('天气API超时');
    }
}
```

**后端天气API**:
```python
# server.py 添加超时
async with session.get(weather_url, timeout=aiohttp.ClientTimeout(total=10)) as response:
    # ...
```

---

## 📈 优化建议

### 1. 设置合理的超时梯度

| API类型 | 前端超时 | 后端超时 | 说明 |
|---------|---------|---------|------|
| 天气API | 10秒 | 5秒 | 快速响应 |
| AI总结（文本） | 60秒 | 30秒 | 中等处理 |
| AI总结（PDF） | 90秒 | 45秒 | 较长处理 |

### 2. 添加错误重试机制

```javascript
async function fetchWithRetry(url, options, maxRetries = 2) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            console.log(`重试 ${i + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}
```

### 3. 添加请求缓存

对于天气等数据，添加5分钟缓存：
```javascript
const weatherCache = {
    data: null,
    timestamp: 0,
    ttl: 5 * 60 * 1000  // 5分钟
};

async function updateWeatherDisplay(latitude, longitude) {
    const now = Date.now();
    const cacheKey = `${latitude},${longitude}`;

    // 检查缓存
    if (weatherCache.data && weatherCache.key === cacheKey) {
        if (now - weatherCache.timestamp < weatherCache.ttl) {
            // 使用缓存数据
            displayWeather(weatherCache.data);
            return;
        }
    }

    // 请求新数据
    // ...
}
```

---

## 🎯 立即行动项

### P0 - 立即修复
1. **添加前端超时控制** - AI总结fetch添加90秒超时
2. **优化后端超时** - 从60秒改为30秒
3. **改善错误提示** - 区分超时和其他错误

### P1 - 本周完成
4. **添加进度指示** - 让用户知道正在处理
5. **天气API超时** - 添加10秒超时
6. **添加内容长度限制** - 超长内容提示分段

### P2 - 优化体验
7. **添加重试机制**
8. **添加请求缓存**
9. **优化错误消息**

---

## 🧪 测试验证

修复后需要测试：

1. **正常场景**
   - [ ] 短文本总结（< 1000字）
   - [ ] 中等文本总结（1000-10000字）
   - [ ] PDF文件总结

2. **边界场景**
   - [ ] 超长文本（> 50000字）
   - [ ] 超大PDF（> 5MB）
   - [ ] 网络慢的情况

3. **错误场景**
   - [ ] 服务器宕机
   - [ ] API密钥错误
   - [ ] 超时情况

---

## 📝 总结

### 问题本质
前后端超时配置不一致，前端没有超时控制

### 影响范围
- AI总结功能
- 天气功能
- 任何长时间API调用

### 核心修复
1. 前端添加90秒超时
2. 后端减少到30秒超时
3. 改善用户反馈

### 预期效果
- ✅ 明确的超时控制
- ✅ 清晰的错误提示
- ✅ 更好的用户体验
- ✅ 减少"fail to fetch"错误

---

**修复优先级**: 🔥🔥🔥 最高
**预计工作量**: 1-2小时
**用户影响**: 直接改善核心功能体验
