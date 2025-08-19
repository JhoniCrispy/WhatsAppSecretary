// Debug test script to test LLM without WhatsApp
const MCPLLMService = require('../src/services/mcp-llm-service');
const CalendarService = require('../src/services/calendar-service');
const CalendarMCPServer = require('../src/mcp/calendar-server');
const debug = require('../src/utils/debug');
const chalk = require('chalk');

async function testLLMProcessing() {
  console.log(chalk.blue.bold('🧪 Debug Test: LLM Processing'));
  
  try {
    // Initialize services
    const calendarService = new CalendarService();
    const mcpServer = new CalendarMCPServer(calendarService);
    const llmService = new MCPLLMService();
    
    // Setup
    await calendarService.initialize();
    await mcpServer.connect();
    llmService.setMCPServer(mcpServer);
    
    // Test messages
    const testMessages = [
      "Meeting with John tomorrow at 2pm",
      "What do I have on Friday?",
      "Cancel dinner tonight",
      "Move the team meeting to 3pm",
      "Hello how are you?" // Should not trigger tools
    ];
    
    for (const message of testMessages) {
      console.log(chalk.yellow(`\n📝 Testing: "${message}"`));
      console.log(chalk.yellow('═'.repeat(50)));
      
      try {
        const result = await llmService.processEventMessage(message, 'TestUser');
        console.log(chalk.green('✅ Result:'), result.processed ? 'Success' : 'No action');
      } catch (error) {
        console.log(chalk.red('❌ Error:'), error.message);
      }
      
      console.log(chalk.yellow('═'.repeat(50)));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Test failed:'), error.message);
  }
}

// Command line usage
if (require.main === module) {
  testLLMProcessing().then(() => {
    console.log(chalk.blue('\n🏁 Debug test complete'));
    process.exit(0);
  });
}

module.exports = { testLLMProcessing };
