// Test script for GPT-4 MCP Bridge with REAL Google Calendar
require('dotenv').config();
process.env.USE_OPENAI = 'true';

const GPT4MCPBridge = require('../src/services/gpt4-mcp-bridge');
const CalendarService = require('../src/services/calendar-service');
const chalk = require('chalk');

async function testGPT4WithRealCalendar() {
  console.log(chalk.blue.bold('🧪 Testing GPT-4 MCP Bridge with REAL Google Calendar\n'));

  try {
    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.log(chalk.red('❌ OPENAI_API_KEY not set. Please add it to your .env file.'));
      console.log(chalk.yellow('💡 Get your API key from: https://platform.openai.com/api-keys'));
      return;
    }

    // Initialize REAL calendar service
    console.log(chalk.blue('🔧 Initializing REAL Google Calendar service...'));
    const realCalendarService = new CalendarService();
    await realCalendarService.initialize();

    const gpt4Bridge = new GPT4MCPBridge(realCalendarService);

    // Test simple queries first
    const testCases = [
      {
        name: "List Tomorrow's Events",
        message: "what do I have tomorrow?",
        expectedBehavior: "Should list real events from your Google Calendar"
      },
      {
        name: "List This Week's Events",
        message: "what do I have this week?",
        expectedBehavior: "Should list all events for this week"
      },
      {
        name: "Search for Specific Event",
        message: "find my appointment with the doctor",
        expectedBehavior: "Should search for doctor-related events"
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
          
          // Check if we got meaningful events data
          if (result.response.includes('event') || result.response.includes('appointment') || result.response.includes('meeting')) {
            console.log(chalk.green('🎯 Response contains event information'));
          } else if (result.response.includes('no events') || result.response.includes('nothing scheduled')) {
            console.log(chalk.blue('📭 No events found (this is valid if your calendar is empty)'));
          }
          
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
        console.log(chalk.gray('⏳ Waiting 3 seconds before next test...\n'));
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Summary
    console.log(chalk.blue.bold(`\n📊 Test Results Summary:`));
    console.log(chalk.white('━'.repeat(40)));
    console.log(chalk.green(`✅ Tests Passed: ${testsPassed}/${testsTotal}`));
    console.log(chalk.red(`❌ Tests Failed: ${testsTotal - testsPassed}/${testsTotal}`));
    
    if (testsPassed === testsTotal) {
      console.log(chalk.green.bold('🎉 All tests passed! GPT-4 is successfully reading your real calendar.'));
    } else {
      console.log(chalk.yellow('⚠️  Some tests failed. Check the debug logs above for details.'));
    }

    console.log(chalk.white('━'.repeat(40)));
    
    // Manual test prompt
    console.log(chalk.blue('\n🎯 Manual Test Options:'));
    console.log(chalk.gray('You can now manually test queries:'));
    console.log(chalk.gray('- "what do I have tomorrow?"'));
    console.log(chalk.gray('- "create test meeting tomorrow at 3pm"'));
    console.log(chalk.gray('- "find beer events"'));

  } catch (error) {
    console.log(chalk.red('❌ Test setup failed:'), error.message);
  }
}

// Run if called directly
if (require.main === module) {
  testGPT4WithRealCalendar().then(() => {
    console.log(chalk.blue('\n🏁 Real calendar testing complete'));
    process.exit(0);
  }).catch(error => {
    console.log(chalk.red('❌ Test runner failed:'), error.message);
    process.exit(1);
  });
}

module.exports = { testGPT4WithRealCalendar };
