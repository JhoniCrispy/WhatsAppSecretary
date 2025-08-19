require('dotenv').config();

const config = {
  // WhatsApp Configuration
  whatsapp: {
    targetGroupName: process.env.TARGET_GROUP_NAME || "Family Events",
    autoReply: process.env.AUTO_REPLY === 'true' || false,
    replyMessage: process.env.REPLY_MESSAGE || "📅 Event added to calendar!"
  },

  // Google Calendar Configuration
  calendar: {
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
    calendarId: process.env.CALENDAR_ID || 'primary',
    timezone: process.env.TIMEZONE || 'America/New_York',
    defaultEventDuration: parseInt(process.env.DEFAULT_EVENT_DURATION) || 60 // minutes
  },

  // Local LLM Configuration (Ollama)
  llm: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
    timeout: parseInt(process.env.LLM_TIMEOUT) || 30000, // 30 seconds
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES) || 3
  },

  // Processing Configuration
  processing: {
    maxConcurrentCalendarOps: parseInt(process.env.MAX_CONCURRENT_CALENDAR_OPS) || 3,
    duplicateEventWindowMinutes: parseInt(process.env.DUPLICATE_EVENT_WINDOW_MINUTES) || 5,
    messageProcessingDelayMs: parseInt(process.env.MESSAGE_PROCESSING_DELAY_MS) || 1000
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true' || false,
    logFilePath: process.env.LOG_FILE_PATH || './logs/app.log'
  },

  // Debug Configuration
  debug: {
    enabled: process.env.DEBUG_MODE === 'true' || true,
    logLLMPrompts: process.env.DEBUG_LLM_PROMPTS === 'true' || true,
    logLLMResponses: process.env.DEBUG_LLM_RESPONSES === 'true' || true,
    logToolCalls: process.env.DEBUG_TOOL_CALLS === 'true' || true,
    logCalendarAPI: process.env.DEBUG_CALENDAR_API === 'true' || true,
    saveDebugToFile: process.env.SAVE_DEBUG_TO_FILE === 'true' || true
  }
};

module.exports = config;
