# 🤖 WhatsApp Secretary

A completely **free** desktop application that automatically detects events from your WhatsApp group messages and adds them to your Google Calendar using a local AI model.

## ✨ Features

- 🆓 **100% Free** - Uses local LLM (Ollama) and open-source tools
- 📱 **WhatsApp Integration** - Monitors specific group chats in real-time
- 🤖 **Smart Event Detection** - Uses local AI to understand natural language
- 📅 **Google Calendar Sync** - Automatically creates calendar events
- 🔄 **Concurrent Processing** - Handles multiple messages efficiently
- 🚫 **Duplicate Prevention** - Smart detection to avoid duplicate events
- 📊 **Statistics & Monitoring** - Track performance and success rates
- 🔒 **Privacy First** - Everything runs locally on your machine

## 🛠️ Prerequisites

1. **Node.js 16+** - [Download here](https://nodejs.org/)
2. **Ollama** - [Install from ollama.ai](https://ollama.ai/)
3. **Google Cloud Account** - For Calendar API access
4. **WhatsApp Account** - With access to the group you want to monitor

## 📦 Installation

1. **Clone or download this project:**
   ```bash
   git clone <repository-url>
   cd whatsapp-secretary
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run setup wizard:**
   ```bash
   npm run setup
   ```

## 🔧 Configuration

### 1. Setup Ollama (Local LLM)

1. **Install Ollama:**
   ```bash
   # Download from https://ollama.ai/
   # Or use package manager:
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

2. **Start Ollama:**
   ```bash
   ollama serve
   ```

3. **Download the AI model:**
   ```bash
   ollama pull llama3.1:8b
   ```

### 2. Setup Google Calendar API

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**

2. **Create a new project or select existing one**

3. **Enable Google Calendar API:**
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

4. **Create Service Account:**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Fill in the details and create

5. **Download JSON Key:**
   - Click on your service account
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key" > "JSON"
   - Download and save as `credentials.json` in project root

6. **Share Calendar with Service Account:**
   - Open Google Calendar
   - Go to calendar settings
   - Share with the service account email (from credentials.json)
   - Give "Make changes to events" permission

### 3. Configure Environment

1. **Copy environment file:**
   ```bash
   cp env.example .env
   ```

2. **Edit `.env` file:**
   ```env
   TARGET_GROUP_NAME=Your WhatsApp Group Name
   TIMEZONE=America/New_York
   # ... other settings
   ```

## 🚀 Usage

1. **Start Ollama (if not running):**
   ```bash
   ollama serve
   ```

2. **Start the application:**
   ```bash
   npm start
   ```

3. **Scan QR Code:**
   - A QR code will appear in the terminal
   - Scan it with WhatsApp on your phone
   - The app will authenticate and start monitoring

4. **Send test messages:**
   - Send a message like "Team meeting tomorrow at 2pm" to your group
   - Watch as the AI detects the event and creates a calendar entry!

## 📝 Supported Message Formats

The AI can understand various natural language formats:

```
✅ "Team meeting tomorrow at 2pm"
✅ "Dinner with family tonight 7:30"
✅ "Doctor appointment Friday 10:30 AM"
✅ "Conference call next Monday 9am"
✅ "Birthday party Saturday at 6pm at John's house"
✅ "Lunch meeting 12/25 at noon"
```

## ⚙️ Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_GROUP_NAME` | "Family Events" | WhatsApp group to monitor |
| `AUTO_REPLY` | true | Send confirmation message |
| `TIMEZONE` | "America/New_York" | Your timezone |
| `OLLAMA_MODEL` | "llama3.1:8b" | AI model to use |
| `DEFAULT_EVENT_DURATION` | 60 | Default event length (minutes) |
| `MAX_CONCURRENT_CALENDAR_OPS` | 3 | Max parallel calendar operations |

### Available AI Models

| Model | Size | Speed | Accuracy | Memory |
|-------|------|-------|----------|---------|
| `llama3.1:8b` | 4.7GB | Medium | High | 8GB RAM |
| `phi3:mini` | 2.3GB | Fast | Good | 4GB RAM |
| `mistral:7b` | 4.1GB | Medium | High | 6GB RAM |

Change model in `.env`:
```bash
ollama pull phi3:mini
# Then update .env
OLLAMA_MODEL=phi3:mini
```

## 🔍 Monitoring & Statistics

The app provides real-time statistics:

```
📊 WhatsApp Secretary Statistics:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Messages Processed: 45
🔍 Events Detected: 12
✅ Events Created: 11
⚠️  Duplicates Skipped: 1
❌ Errors Encountered: 0
📈 Success Rate: 91.7%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 🛡️ Troubleshooting

### Common Issues

1. **"Ollama connection failed"**
   ```bash
   # Make sure Ollama is running
   ollama serve
   
   # Check if model is available
   ollama list
   ```

2. **"Google Calendar initialization failed"**
   - Check if `credentials.json` exists and is valid
   - Verify calendar is shared with service account
   - Ensure Google Calendar API is enabled

3. **"No events detected"**
   - The AI might need clearer language
   - Try: "Meeting tomorrow at 2pm" instead of "Meeting tmrw 2"
   - Check if your message contains time and event keywords

4. **"Authentication failed"**
   - Delete `.wwebjs_auth` folder
   - Restart app and scan QR code again

### Performance Tips

1. **Faster AI Processing:**
   ```bash
   # Use smaller model for speed
   ollama pull phi3:mini
   ```

2. **Reduce Memory Usage:**
   ```env
   # In .env file
   MAX_CONCURRENT_CALENDAR_OPS=1
   ```

3. **Debug Mode:**
   ```env
   # In .env file
   LOG_LEVEL=debug
   ```

## 🔧 Advanced Usage

### Custom Event Patterns

You can modify the AI prompt in `src/services/llm-service.js` to detect specific patterns for your group.

### Multiple Groups

To monitor multiple groups, run multiple instances with different configurations:

```bash
# Terminal 1
TARGET_GROUP_NAME="Work Team" npm start

# Terminal 2  
TARGET_GROUP_NAME="Family Events" npm start
```

### Custom Calendar

To use a specific calendar instead of primary:

1. Get calendar ID from Google Calendar settings
2. Update `.env`:
   ```env
   CALENDAR_ID=your-calendar-id@group.calendar.google.com
   ```

## 📊 Project Structure

```
whatsapp-secretary/
├── src/
│   ├── services/
│   │   ├── llm-service.js      # Ollama AI integration
│   │   └── calendar-service.js # Google Calendar API
│   ├── config.js               # Configuration management
│   └── whatsapp-secretary.js   # Main application
├── scripts/
│   └── setup.js                # Setup wizard
├── package.json
├── env.example
└── README.md
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai/) - For providing free local AI models
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API
- [Google Calendar API](https://developers.google.com/calendar) - Calendar integration

## ⚠️ Disclaimer

This tool is for personal use. Make sure to:
- Respect WhatsApp's Terms of Service
- Get consent from group members before monitoring
- Handle personal data responsibly
- Use appropriate privacy settings

---

**Made with ❤️ and completely free AI tools**
