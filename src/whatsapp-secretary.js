const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const pLimit = require('p-limit');
const chalk = require('chalk');
const config = require('./config');
const LLMService = require('./services/llm-service');
const MCPLLMService = require('./services/mcp-llm-service');
const CalendarService = require('./services/calendar-service');
const CalendarMCPServer = require('./mcp/calendar-server');
const debug = require('./utils/debug');

class WhatsAppSecretary {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
    
    this.calendarService = new CalendarService();
    
    // Initialize MCP components
    this.mcpServer = new CalendarMCPServer(this.calendarService);
    this.llmService = new MCPLLMService();
    
    // Also keep old LLM service as fallback
    this.fallbackLLMService = new LLMService();
    
    // Rate limiting for calendar operations
    this.calendarLimit = pLimit(config.processing.maxConcurrentCalendarOps);
    
    // Track recent events to prevent duplicates
    this.recentEvents = new Map();
    
    // Statistics
    this.stats = {
      messagesProcessed: 0,
      eventsDetected: 0,
      eventsCreated: 0,
      duplicatesSkipped: 0,
      errorsEncountered: 0
    };
    
    this.setupEventHandlers();
  }

  async initialize() {
    console.log(chalk.blue.bold('🚀 Starting WhatsApp Secretary...'));
    
    try {
      // Check Ollama connection using fallback service
      const ollamaReady = await this.fallbackLLMService.checkOllamaConnection();
      if (!ollamaReady) {
        console.log(chalk.red('❌ Ollama not ready. Please check setup instructions.'));
        return false;
      }
      
      // Initialize Google Calendar
      const calendarReady = await this.calendarService.initialize();
      if (!calendarReady) {
        console.log(chalk.red('❌ Google Calendar not ready. Please check credentials.'));
        return false;
      }
      
      // Initialize MCP Server
      console.log(chalk.blue('🔧 Initializing MCP Server...'));
      await this.mcpServer.connect();
      this.llmService.setMCPServer(this.mcpServer);
      console.log(chalk.green('✅ MCP Server initialized successfully'));
      
      // Initialize WhatsApp client
      console.log(chalk.blue('🔧 Initializing WhatsApp client...'));
      await this.client.initialize();
      
      return true;
      
    } catch (error) {
      console.log(chalk.red('❌ Initialization failed:'), error.message);
      return false;
    }
  }

  setupEventHandlers() {
    this.client.on('qr', (qr) => {
      console.log(chalk.yellow('📱 Scan this QR code with WhatsApp:'));
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      console.log(chalk.green.bold('✅ WhatsApp Secretary is ready!'));
      console.log(chalk.blue(`🎯 Monitoring group: "${config.whatsapp.targetGroupName}"`));
      console.log(chalk.blue(`🤖 Using LLM model: ${config.llm.model}`));
      console.log(chalk.gray('📊 Press Ctrl+C to stop and see statistics\n'));
    });

    this.client.on('authenticated', () => {
      console.log(chalk.green('✅ WhatsApp authenticated successfully'));
    });

    this.client.on('auth_failure', (msg) => {
      console.log(chalk.red('❌ Authentication failed:'), msg);
    });

    this.client.on('disconnected', (reason) => {
      console.log(chalk.yellow('⚠️  WhatsApp disconnected:'), reason);
    });

    // Listen for ALL messages (including your own)
    this.client.on('message_create', async (message) => {
      // Debug: Log all incoming messages
      try {
        const chat = await message.getChat();
        console.log(chalk.gray(`🔍 DEBUG: Message created`));
        console.log(chalk.gray(`  - Chat type: ${chat.isGroup ? 'Group' : 'Private'}`));
        console.log(chalk.gray(`  - Chat name: "${chat.name || 'N/A'}"`));
        console.log(chalk.gray(`  - From me: ${message.fromMe}`));
        console.log(chalk.gray(`  - Message: "${message.body.substring(0, 50)}..."`));
        
        // Special highlight for your own messages
        if (message.fromMe) {
          console.log(chalk.green('🎯 THIS IS YOUR MESSAGE! Should be processed.'));
        } else {
          console.log(chalk.yellow('👥 This is from someone else, will be skipped.'));
        }
      } catch (error) {
        console.log(chalk.gray(`🔍 DEBUG: Error getting chat info: ${error.message}`));
      }
      
      await this.handleMessage(message);
    });

    // Keep the original message listener as backup
    this.client.on('message', async (message) => {
      console.log(chalk.gray('📨 Backup: Regular message event triggered'));
    });
  }

  async handleMessage(message) {
    try {
      this.stats.messagesProcessed++;
      const chat = await message.getChat();
      
      console.log(chalk.cyan(`\n📝 New message in ${chat.name}:`));
      console.log(chalk.gray(`From: ${message._data.notifyName || 'Unknown'}`));
      console.log(chalk.gray(`Message: ${message.body.substring(0, 100)}${message.body.length > 100 ? '...' : ''}`));
      
      // Only process messages from the target group
      if (!chat.isGroup || chat.name !== config.whatsapp.targetGroupName) {
        return;
      }

      // ONLY process messages from me (you are the secretary!)
      if (!message.fromMe) {
        console.log(chalk.yellow(`⏭️  Skipping: Not from me (fromMe: ${message.fromMe})`));
        return;
      }


      // Use rate limiting for processing
      this.calendarLimit(async () => {
        await this.processMessage(message);
      });

    } catch (error) {
      this.stats.errorsEncountered++;
      console.log(chalk.red('❌ Error handling message:'), error.message);
    }
  }

  async processMessage(message) {
    try {
      const senderName = message._data.notifyName || 'Unknown';
      
      console.log(chalk.blue('🧠 Processing message with MCP-enhanced LLM...'));
      
      // Use MCP-enhanced processing
      const result = await this.llmService.processEventMessage(message.body, senderName);
      
      if (!result.processed) {
        console.log(chalk.gray(`ℹ️  No action taken: ${result.reason}\n`));
        return;
      }
      
      this.stats.eventsDetected++;
      
      // Send confirmation reply if enabled
      if (config.whatsapp.autoReply && result.message) {
        await message.reply(`📅 ${result.message}`);
      }
      
      console.log(chalk.green.bold(`✅ MCP Action completed!`));
      console.log(chalk.blue(`📋 ${result.message}\n`));
      
      // Update statistics based on intent
      switch (result.intent) {
        case 'create_event':
          this.stats.eventsCreated++;
          break;
        case 'edit_event':
        case 'delete_event':
        case 'query_events':
          // These don't count as "created" but are successful operations
          break;
      }
      
    } catch (error) {
      this.stats.errorsEncountered++;
      console.log(chalk.red('❌ Error processing message:'), error.message);
      
      // Fallback to old LLM service
      console.log(chalk.yellow('🔄 Falling back to simple event detection...'));
      try {
        await this.processMessageFallback(message);
      } catch (fallbackError) {
        console.log(chalk.red('❌ Fallback also failed:'), fallbackError.message);
      }
    }
  }

  async processMessageFallback(message) {
    const senderName = message._data.notifyName || 'Unknown';
    
    const eventInfo = await this.fallbackLLMService.extractEventInfo(message.body, senderName);
    
    if (!eventInfo.isEvent) {
      console.log(chalk.gray('ℹ️  No event detected in fallback\n'));
      return;
    }
    
    const result = await this.calendarService.createEvent(eventInfo);
    
    if (result.success) {
      this.stats.eventsCreated++;
      
      if (config.whatsapp.autoReply) {
        await message.reply(config.whatsapp.replyMessage);
      }
      
      console.log(chalk.green.bold(`✅ Fallback event created: ${eventInfo.title}`));
    } else {
      console.log(chalk.red(`❌ Fallback failed: ${result.error}`));
    }
  }

  isDuplicateEvent(eventKey) {
    return this.recentEvents.has(eventKey);
  }

  rememberEvent(eventKey) {
    this.recentEvents.set(eventKey, Date.now());
    
    // Clean up old events
    setTimeout(() => {
      this.recentEvents.delete(eventKey);
    }, config.processing.duplicateEventWindowMinutes * 60 * 1000);
  }

  printStatistics() {
    console.log(chalk.blue.bold('\n📊 WhatsApp Secretary Statistics:'));
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.blue(`📝 Messages Processed: ${this.stats.messagesProcessed}`));
    console.log(chalk.yellow(`🔍 Events Detected: ${this.stats.eventsDetected}`));
    console.log(chalk.green(`✅ Events Created: ${this.stats.eventsCreated}`));
    console.log(chalk.yellow(`⚠️  Duplicates Skipped: ${this.stats.duplicatesSkipped}`));
    console.log(chalk.red(`❌ Errors Encountered: ${this.stats.errorsEncountered}`));
    
    if (this.stats.eventsDetected > 0) {
      const successRate = ((this.stats.eventsCreated / this.stats.eventsDetected) * 100).toFixed(1);
      console.log(chalk.cyan(`📈 Success Rate: ${successRate}%`));
    }
    
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  }

  async shutdown() {
    console.log(chalk.yellow('\n🛑 Shutting down WhatsApp Secretary...'));
    
    try {
      await this.client.destroy();
      this.printStatistics();
      
      // Generate debug summary
      if (config.debug.enabled) {
        debug.generateSummary();
      }
      
      console.log(chalk.green('✅ Shutdown complete. Goodbye! 👋\n'));
    } catch (error) {
      console.log(chalk.red('❌ Error during shutdown:'), error.message);
    }
    
    process.exit(0);
  }
}

// Create and start the secretary
const secretary = new WhatsAppSecretary();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await secretary.shutdown();
});

process.on('SIGTERM', async () => {
  await secretary.shutdown();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.log(chalk.red('❌ Uncaught Exception:'), error.message);
  secretary.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
  secretary.shutdown();
});

// Start the application
async function main() {
  const success = await secretary.initialize();
  
  if (!success) {
    console.log(chalk.red('❌ Failed to start WhatsApp Secretary'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.log(chalk.red('❌ Startup error:'), error.message);
  process.exit(1);
});
