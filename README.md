# 💬 实时聊天应用

基于 WebSocket 的实时聊天应用，支持多人在线聊天、图片发送、已读回执等功能。

## ✨ 功能特性

- ✅ **用户注册** - 昵称注册，自动检查重复
- ✅ **通讯录** - 实时显示在线用户列表
- ✅ **文字消息** - 发送和接收文字消息
- ✅ **图片消息** - 支持发送图片
- ✅ **已读回执** - 消息被阅读后颜色变化提示
- ✅ **实时通信** - WebSocket 实时双向通信
- ✅ **用户状态** - 实时显示用户上线/离线状态

## 🚀 快速开始

### 本地运行

1. **安装依赖**
```bash
pip install -r requirements.txt
```

2. **启动服务器**
```bash
python server.py
```

3. **访问应用**
打开浏览器访问：http://localhost:8080

### 测试多用户聊天

- 打开多个浏览器窗口（或使用隐私模式）
- 每个窗口注册不同的昵称
- 即可互相发送消息

## 📦 技术栈

**前端：**
- HTML5 + CSS3
- JavaScript (原生)
- WebSocket API

**后端：**
- Python 3.8+
- aiohttp (异步 Web 框架)
- aiohttp-cors (跨域支持)
- WebSocket

## 🌐 部署到云端

### Railway 部署

1. 推送代码到 GitHub
2. 访问 https://railway.app
3. 选择从 GitHub 部署
4. Railway 会自动识别 Python 项目并部署

### Render 部署

1. 推送代码到 GitHub
2. 访问 https://render.com
3. 创建新的 Web Service
4. 配置：
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python server.py`

## 📝 项目结构

```
realtime-chat-app/
├── index.html          # 主页面（登录 + 聊天界面）
├── app.js             # 前端逻辑（WebSocket 客户端）
├── server.py          # 后端服务器（WebSocket 服务器）
├── requirements.txt   # Python 依赖
├── Procfile          # 部署配置
├── .gitignore        # Git 忽略文件
└── README.md         # 项目说明
```

## 🎨 界面预览

- **登录界面** - 简洁的昵称注册
- **聊天界面** - 左侧通讯录 + 右侧聊天窗口
- **消息样式** - 发送消息（蓝色），已读消息（浅蓝色）
- **图片支持** - 点击图片图标发送图片

## 📌 注意事项

- 当前使用内存存储，服务器重启后消息会丢失
- 如需持久化，可以集成数据库（如 SQLite、PostgreSQL）
- 图片使用 Base64 编码传输，建议限制图片大小

## 🔮 未来改进

- [ ] 添加数据库持久化存储
- [ ] 支持群组聊天
- [ ] 添加文件传输功能
- [ ] 支持语音消息
- [ ] 添加消息搜索功能
- [ ] 支持消息撤回

## 📄 License

MIT License

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
