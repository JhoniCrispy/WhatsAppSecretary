// Test script for command-based tool selection
const MCPLLMService = require('../src/services/mcp-llm-service');
const CalendarMCPServer = require('../src/mcp/calendar-server');
const chalk = require('chalk');

// Mock calendar service for testing
class MockCalendarService {
  async getEvents() { return []; }
  async createEvent() { return { success: true, eventId: 'test123' }; }
  async updateEvent() { return { success: true }; }
  async deleteEvent() { return { success: true }; }
}

async function testCommands() {
  console.log(chalk.blue.bold('🧪 Testing Command-Based Tool Selection\n'));
  
  const calendarService = new MockCalendarService();
  const mcpServer = new CalendarMCPServer(calendarService);
  const llmService = new MCPLLMService();
  
  await mcpServer.connect();
  llmService.setMCPServer(mcpServer);
  
  const testCases = [
    {
      message: "add meeting with John tomorrow at 2pm",
      expectedTools: ["create_calendar_event"],
      expectedIntent: "create_event"
    },
    {
      message: "move team meeting to 3pm", 
      expectedTools: ["search_calendar_events", "delete_calendar_event", "create_calendar_event"],
      expectedIntent: "edit_event"
    },
    {
      message: "delete dinner tonight",
      expectedTools: ["search_calendar_events", "delete_calendar_event"],
      expectedIntent: "delete_event"
    },
    {
      message: "show what I have Friday",
      expectedTools: ["list_calendar_events"],
      expectedIntent: "query_events"
    },
    {
      message: "hello how are you", // Should not trigger tools
      expectedTools: [],
      expectedIntent: "other"
    }
  ];
  
  for (const testCase of testCases) {
    console.log(chalk.yellow(`📝 Testing: "${testCase.message}"`));
    
    try {
      // Get LLM response without actually calling tools
      const toolsResponse = await mcpServer.server.request({ method: 'tools/list' });
      const prompt = llmService.buildMCPPrompt(testCase.message, 'TestUser', toolsResponse.tools);
      const response = await llmService.generateResponseWithTools(prompt, toolsResponse.tools);
      
      console.log(chalk.blue(`Intent: ${response.intent}`));
      console.log(chalk.blue(`Tool calls: ${response.toolCalls.map(tc => tc.name).join(' → ')}`));
      
      // Validate
      const actualTools = response.toolCalls.map(tc => tc.name);
      const intentMatch = response.intent === testCase.expectedIntent;
      const toolsMatch = JSON.stringify(actualTools) === JSON.stringify(testCase.expectedTools);
      
      if (intentMatch && toolsMatch) {
        console.log(chalk.green('✅ PASS\n'));
      } else {
        console.log(chalk.red('❌ FAIL'));
        console.log(chalk.red(`Expected intent: ${testCase.expectedIntent}, got: ${response.intent}`));
        console.log(chalk.red(`Expected tools: ${testCase.expectedTools.join(' → ')}`));
        console.log(chalk.red(`Got tools: ${actualTools.join(' → ')}\n`));
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ ERROR: ${error.message}\n`));
    }
  }
}

if (require.main === module) {
  testCommands().then(() => {
    console.log(chalk.blue('🏁 Command testing complete'));
    process.exit(0);
  });
}

module.exports = { testCommands };
