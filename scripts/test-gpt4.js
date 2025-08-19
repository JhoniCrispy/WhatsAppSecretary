// Test script for GPT-4 MCP Bridge
// Force GPT-4 mode for testing
process.env.USE_OPENAI = 'true';

const GPT4MCPBridge = require('../src/services/gpt4-mcp-bridge');
const CalendarService = require('../src/services/calendar-service');
const chalk = require('chalk');

// Mock calendar service for testing
class MockCalendarService {
  constructor() {
    this.timezone = 'America/New_York';
    this.events = [
      {
        id: 'event_1',
        summary: 'Team Meeting',
        start: { dateTime: '2024-08-17T14:00:00-07:00' },
        end: { dateTime: '2024-08-17T15:00:00-07:00' },
        location: 'Conference Room A'
      },
      {
        id: 'event_2', 
        summary: 'Lunch with John',
        start: { dateTime: '2024-08-17T12:00:00-07:00' },
        end: { dateTime: '2024-08-17T13:00:00-07:00' },
        location: 'Restaurant'
      }
    ];
  }

  async getEvents(startTime, endTime) {
    console.log(chalk.gray(`📋 Mock: Getting events from ${startTime} to ${endTime}`));
    return this.events.filter(event => {
      const eventTime = new Date(event.start.dateTime);
      const start = new Date(startTime);
      const end = new Date(endTime);
      return eventTime >= start && eventTime <= end;
    });
  }

  async createEvent(eventInfo) {
    console.log(chalk.gray(`➕ Mock: Creating event "${eventInfo.title}"`));
    const newEvent = {
      id: `event_${Date.now()}`,
      summary: eventInfo.title,
      start: { dateTime: new Date().toISOString() },
      end: { dateTime: new Date(Date.now() + 3600000).toISOString() }
    };
    this.events.push(newEvent);
    return {
      success: true,
      eventId: newEvent.id,
      htmlLink: `https://calendar.google.com/event?eid=${newEvent.id}`
    };
  }

  async deleteEvent(eventId) {
    console.log(chalk.gray(`🗑️  Mock: Deleting event ${eventId}`));
    const index = this.events.findIndex(e => e.id === eventId);
    if (index > -1) {
      this.events.splice(index, 1);
      return { success: true };
    }
    return { success: false, error: 'Event not found' };
  }

  async updateEvent(eventId, updates) {
    console.log(chalk.gray(`✏️  Mock: Updating event ${eventId}`));
    const event = this.events.find(e => e.id === eventId);
    if (event) {
      Object.assign(event, updates);
      return { success: true };
    }
    return { success: false, error: 'Event not found' };
  }
}

async function testGPT4Bridge() {
  console.log(chalk.blue.bold('🧪 Testing GPT-4 MCP Bridge\n'));

  try {
    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.log(chalk.red('❌ OPENAI_API_KEY not set. Please add it to your .env file.'));
      console.log(chalk.yellow('💡 Get your API key from: https://platform.openai.com/api-keys'));
      return;
    }

    const mockCalendarService = new MockCalendarService();
    const gpt4Bridge = new GPT4MCPBridge(mockCalendarService);

    // Test cases for autonomous tool chaining
    const testCases = [
      {
        name: "Simple Event Creation",
        message: "create meeting with Sarah tomorrow at 2pm",
        expectedBehavior: "Should create a single event"
      },
      {
        name: "Complex Schedule Query",
        message: "what do I have tomorrow?",
        expectedBehavior: "Should list tomorrow's events"
      },
      {
        name: "Autonomous Schedule Clearing",
        message: "clear my tomorrow's schedule",
        expectedBehavior: "Should autonomously: 1) List events, 2) Delete each event found"
      },
      {
        name: "Intelligent Rescheduling", 
        message: "move team meeting to 3pm",
        expectedBehavior: "Should autonomously: 1) Search for team meeting, 2) Delete it, 3) Create new one at 3pm"
      },
      {
        name: "Complex Multi-Step Operation",
        message: "cancel lunch with John and schedule a call with Mike at the same time",
        expectedBehavior: "Should autonomously: 1) Find lunch event, 2) Delete it, 3) Create call with Mike"
      }
    ];

    let testsPassed = 0;
    let testsTotal = testCases.length;

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      
      console.log(chalk.yellow(`\n📝 Test ${i + 1}/${testsTotal}: ${testCase.name}`));
      console.log(chalk.yellow(`Message: "${testCase.message}"`));
      console.log(chalk.gray(`Expected: ${testCase.expectedBehavior}`));
      console.log(chalk.yellow('═'.repeat(60)));

      try {
        const startTime = Date.now();
        const result = await gpt4Bridge.processMessage(testCase.message, 'TestUser');
        const endTime = Date.now();

        if (result.success) {
          console.log(chalk.green(`✅ SUCCESS (${endTime - startTime}ms)`));
          console.log(chalk.green(`📋 Response: ${result.response}`));
          console.log(chalk.blue(`🔄 Iterations: ${result.iterations}`));
          console.log(chalk.blue(`💬 Conversation length: ${result.conversationLength} messages`));
          testsPassed++;
        } else {
          console.log(chalk.red(`❌ FAILED: ${result.error}`));
          console.log(chalk.red(`🔄 Iterations attempted: ${result.iterations}`));
        }

      } catch (error) {
        console.log(chalk.red(`❌ ERROR: ${error.message}`));
      }

      console.log(chalk.yellow('═'.repeat(60)));
      
      // Wait between tests to avoid rate limiting
      if (i < testCases.length - 1) {
        console.log(chalk.gray('⏳ Waiting 2 seconds before next test...\n'));
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Summary
    console.log(chalk.blue.bold(`\n📊 Test Results Summary:`));
    console.log(chalk.white('━'.repeat(40)));
    console.log(chalk.green(`✅ Tests Passed: ${testsPassed}/${testsTotal}`));
    console.log(chalk.red(`❌ Tests Failed: ${testsTotal - testsPassed}/${testsTotal}`));
    
    if (testsPassed === testsTotal) {
      console.log(chalk.green.bold('🎉 All tests passed! GPT-4 MCP Bridge is working correctly.'));
    } else {
      console.log(chalk.yellow('⚠️  Some tests failed. Check the API key and network connection.'));
    }

    console.log(chalk.white('━'.repeat(40)));

  } catch (error) {
    console.log(chalk.red('❌ Test setup failed:'), error.message);
  }
}

// Run if called directly
if (require.main === module) {
  testGPT4Bridge().then(() => {
    console.log(chalk.blue('\n🏁 GPT-4 testing complete'));
    process.exit(0);
  }).catch(error => {
    console.log(chalk.red('❌ Test runner failed:'), error.message);
    process.exit(1);
  });
}

module.exports = { testGPT4Bridge };
