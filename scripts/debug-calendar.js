// Debug script to check Google Calendar configuration and test queries
require('dotenv').config();
const CalendarService = require('../src/services/calendar-service');
const moment = require('moment-timezone');
const chalk = require('chalk');

async function debugCalendar() {
  console.log(chalk.blue.bold('🔍 Debugging Google Calendar Configuration\n'));

  try {
    const calendarService = new CalendarService();
    await calendarService.initialize();

    console.log(chalk.blue('📋 Current Configuration:'));
    console.log(chalk.gray(`  Calendar ID: ${process.env.CALENDAR_ID || 'primary'}`));
    console.log(chalk.gray(`  Timezone: ${process.env.TIMEZONE || 'America/New_York'}`));
    console.log(chalk.gray(`  Credentials: ${process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'}`));

    // Test different time ranges to see what we can find
    const testRanges = [
      {
        name: 'Today',
        start: moment().startOf('day').toISOString(),
        end: moment().endOf('day').toISOString()
      },
      {
        name: 'Tomorrow',
        start: moment().add(1, 'day').startOf('day').toISOString(),
        end: moment().add(1, 'day').endOf('day').toISOString()
      },
      {
        name: 'This Week',
        start: moment().startOf('week').toISOString(),
        end: moment().endOf('week').toISOString()
      },
      {
        name: 'Next 7 Days',
        start: moment().toISOString(),
        end: moment().add(7, 'days').toISOString()
      }
    ];

    for (const range of testRanges) {
      console.log(chalk.yellow(`\n🔍 Testing: ${range.name}`));
      console.log(chalk.gray(`  Range: ${range.start} → ${range.end}`));
      
      try {
        const events = await calendarService.getEvents(range.start, range.end);
        console.log(chalk.green(`  ✅ Found ${events.length} events`));
        
        if (events.length > 0) {
          events.forEach((event, index) => {
            console.log(chalk.white(`    ${index + 1}. ${event.summary || 'No Title'}`));
            console.log(chalk.gray(`       ${event.start?.dateTime || event.start?.date}`));
          });
        }
      } catch (error) {
        console.log(chalk.red(`  ❌ Error: ${error.message}`));
      }
    }

    // Test timezone parsing that GPT-4 uses
    console.log(chalk.blue('\n🕐 Testing GPT-4 Date Parsing:'));
    
    const testDates = ['tomorrow', 'today', 'friday', 'next week'];
    
    for (const dateStr of testDates) {
      try {
        const moment = require('moment-timezone');
        const timezone = process.env.TIMEZONE || 'America/New_York';
        let parsed;
        
        if (dateStr.toLowerCase() === 'today') {
          parsed = moment().tz(timezone);
        } else if (dateStr.toLowerCase() === 'tomorrow') {
          parsed = moment().tz(timezone).add(1, 'day');
        } else if (dateStr.toLowerCase() === 'yesterday') {
          parsed = moment().tz(timezone).subtract(1, 'day');
        } else {
          parsed = moment.tz(dateStr, timezone);
        }
        
        console.log(chalk.gray(`  "${dateStr}" → ${parsed.toISOString()}`));
        console.log(chalk.gray(`    Local: ${parsed.format('YYYY-MM-DD HH:mm:ss z')}`));
        
      } catch (error) {
        console.log(chalk.red(`  ❌ "${dateStr}" → Error: ${error.message}`));
      }
    }

  } catch (error) {
    console.log(chalk.red('❌ Calendar setup failed:'), error.message);
  }
}

// Run if called directly
if (require.main === module) {
  debugCalendar().then(() => {
    console.log(chalk.blue('\n🏁 Calendar debugging complete'));
    process.exit(0);
  }).catch(error => {
    console.log(chalk.red('❌ Debug failed:'), error.message);
    process.exit(1);
  });
}

module.exports = { debugCalendar };
