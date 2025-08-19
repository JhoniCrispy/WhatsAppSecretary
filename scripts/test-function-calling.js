// Test script to verify GPT-4 function calling behavior
require('dotenv').config();
process.env.USE_OPENAI = 'true';

const OpenAI = require('openai');
const chalk = require('chalk');

async function testFunctionCalling() {
  console.log(chalk.blue.bold('🧪 Testing GPT-4 Function Calling Behavior\n'));

  if (!process.env.OPENAI_API_KEY) {
    console.log(chalk.red('❌ OPENAI_API_KEY not set.'));
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Simple tool definition to test
  const tools = [
    {
      type: "function",
      function: {
        name: "parse_date_time",
        description: "Parse a date/time string and return structured information",
        parameters: {
          type: "object",
          properties: {
            input_string: {
              type: "string",
              description: "The date/time string to parse"
            }
          },
          required: ["input_string"]
        }
      }
    },
    {
      type: "function", 
      function: {
        name: "create_event",
        description: "Create a calendar event",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Event title"
            },
            start_time: {
              type: "string",
              description: "Start time in natural language like 'tomorrow 2pm'"
            }
          },
          required: ["title", "start_time"]
        }
      }
    }
  ];

  const testCases = [
    "parse the date 'tomorrow 7pm'",
    "create meeting with John tomorrow at 3pm",
    "what time is 'next friday 10am'?"
  ];

  for (const testMessage of testCases) {
    console.log(chalk.yellow(`\n🔍 Testing: "${testMessage}"`));
    console.log(chalk.yellow('═'.repeat(50)));

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant. You MUST use the provided functions for any date/time parsing or event creation. Never provide answers without using the appropriate function."
          },
          {
            role: "user",
            content: testMessage
          }
        ],
        tools: tools,
        tool_choice: "auto"
      });

      const message = response.choices[0].message;
      
      console.log(chalk.blue('📤 GPT-4 Response:'));
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(chalk.green('✅ Function calls detected:'));
        message.tool_calls.forEach((call, index) => {
          console.log(chalk.white(`  ${index + 1}. ${call.function.name}`));
          console.log(chalk.gray(`     Args: ${call.function.arguments}`));
          
          // Parse and validate arguments
          try {
            const args = JSON.parse(call.function.arguments);
            console.log(chalk.green(`     ✓ Valid JSON arguments`));
            console.log(chalk.gray(`     Parsed: ${JSON.stringify(args, null, 2)}`));
          } catch (e) {
            console.log(chalk.red(`     ✗ Invalid JSON: ${e.message}`));
          }
        });
      } else {
        console.log(chalk.red('❌ No function calls - GPT-4 provided direct response:'));
        console.log(chalk.gray(`   "${message.content}"`));
      }

    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
    }

    console.log(chalk.yellow('═'.repeat(50)));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(chalk.blue('\n📊 Summary:'));
  console.log(chalk.gray('If GPT-4 is calling functions correctly, you should see ✅ Function calls detected for each test.'));
  console.log(chalk.gray('If you see ❌ No function calls, GPT-4 is not following the tool schemas properly.'));
}

// Run if called directly
if (require.main === module) {
  testFunctionCalling().then(() => {
    console.log(chalk.blue('\n🏁 Function calling test complete'));
    process.exit(0);
  }).catch(error => {
    console.log(chalk.red('❌ Test failed:'), error.message);
    process.exit(1);
  });
}

module.exports = { testFunctionCalling };
