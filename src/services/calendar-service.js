const { google } = require('googleapis');
const fs = require('fs');
const moment = require('moment-timezone');
const chalk = require('chalk');
const config = require('../config');

class CalendarService {
  constructor() {
    this.calendar = google.calendar('v3');
    this.auth = null;
    this.timezone = config.calendar.timezone;
    this.defaultDuration = config.calendar.defaultEventDuration;
  }

  async initialize() {
    try {
      console.log(chalk.blue('🔧 Initializing Google Calendar...'));
      
      if (!fs.existsSync(config.calendar.credentialsPath)) {
        throw new Error(`Credentials file not found: ${config.calendar.credentialsPath}`);
      }

      const credentials = JSON.parse(fs.readFileSync(config.calendar.credentialsPath));
      
      // Check if it's a service account or OAuth credentials
      if (credentials.type === 'service_account') {
        console.log(chalk.blue('🔐 Using service account authentication'));
        this.auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/calendar']
        });
        google.options({ auth: await this.auth.getClient() });
      } else {
        console.log(chalk.blue('🔐 Using OAuth 2.0 authentication'));
        const { client_secret, client_id } = credentials.installed || credentials.web;
        
        // Use the standard redirect URI for desktop apps
        this.auth = new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob');
        
        // Try to load existing token
        const tokenPath = './token.json';
        if (fs.existsSync(tokenPath)) {
          const token = JSON.parse(fs.readFileSync(tokenPath));
          this.auth.setCredentials(token);
          console.log(chalk.green('✅ Using saved authentication token'));
        } else {
          // Need to authenticate
          await this.authenticateUser();
        }
        
        google.options({ auth: this.auth });
      }
      
      // Test the connection
      await this.testConnection();
      
      console.log(chalk.green('✅ Google Calendar initialized successfully'));
      return true;
      
    } catch (error) {
      console.log(chalk.red('❌ Google Calendar initialization failed:'), error.message);
      return false;
    }
  }

  async testConnection() {
    try {
      const response = await this.calendar.calendarList.list();
      const calendars = response.data.items || [];
      
      console.log(chalk.blue(`📅 Found ${calendars.length} calendar(s)`));
      
      // Debug: Log all available calendars
      if (calendars.length > 0) {
        console.log(chalk.gray('Available calendars:'));
        calendars.forEach(cal => {
          console.log(chalk.gray(`  - ID: ${cal.id}, Summary: ${cal.summary}, Primary: ${cal.primary}`));
        });
      } else {
        console.log(chalk.yellow('🔍 No calendars found. This means:'));
        console.log(chalk.yellow('   1. Service account needs calendar access'));
        console.log(chalk.yellow('   2. Calendar must be shared with service account'));
        console.log(chalk.yellow('   3. Google Calendar API must be enabled'));
      }
      
      // Find the target calendar
      const targetCalendar = calendars.find(cal => 
        cal.id === config.calendar.calendarId || cal.primary
      );
      
      if (!targetCalendar) {
        throw new Error(`Calendar "${config.calendar.calendarId}" not found`);
      }
      
      console.log(chalk.green(`🎯 Using calendar: ${targetCalendar.summary}`));
      
    } catch (error) {
      throw new Error(`Calendar connection test failed: ${error.message}`);
    }
  }

  async authenticateUser() {
    return new Promise((resolve, reject) => {
      const authUrl = this.auth.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar'],
      });

      console.log(chalk.yellow('🔐 Authentication required!'));
      console.log(chalk.blue('Please visit this URL to authorize the application:'));
      console.log(chalk.cyan(authUrl));
      console.log(chalk.yellow('\n📋 After clicking "Allow", Google will show you an authorization code.'));
      console.log(chalk.yellow('Copy that code and paste it here:'));

      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('Enter the authorization code: ', async (code) => {
        rl.close();
        
        try {
          const { tokens } = await this.auth.getToken(code);
          this.auth.setCredentials(tokens);
          
          // Save token for future use
          fs.writeFileSync('./token.json', JSON.stringify(tokens));
          console.log(chalk.green('✅ Authentication successful! Token saved.'));
          
          resolve();
        } catch (error) {
          console.log(chalk.red('❌ Authentication failed:'), error.message);
          reject(error);
        }
      });
    });
  }

  async createEvent(eventInfo) {
    try {
      console.log(chalk.blue('📅 Creating calendar event...'));
      
      const eventData = this.buildEventData(eventInfo);
      
      const response = await this.calendar.events.insert({
        calendarId: config.calendar.calendarId,
        resource: eventData,
      });

      const event = response.data;
      console.log(chalk.green('✅ Event created successfully'));
      console.log(chalk.gray(`🔗 Event link: ${event.htmlLink}`));
      
      return {
        success: true,
        eventId: event.id,
        htmlLink: event.htmlLink,
        event: event
      };
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to create event:'), error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  buildEventData(eventInfo) {
    const { startDateTime, endDateTime } = this.parseDateTime(eventInfo);
    
    const eventData = {
      summary: eventInfo.title,
      description: this.buildEventDescription(eventInfo),
      start: {
        dateTime: startDateTime,
        timeZone: this.timezone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: this.timezone,
      },
    };

    // Add location if provided
    if (eventInfo.location) {
      eventData.location = eventInfo.location;
    }

    // Add source information
    eventData.source = {
      title: 'WhatsApp Secretary',
      url: 'https://github.com/your-repo/whatsapp-secretary'
    };

    return eventData;
  }

  parseDateTime(eventInfo) {
    const now = moment().tz(this.timezone);
    let eventMoment;

    // Parse date
    if (eventInfo.date) {
      const dateStr = eventInfo.date.toLowerCase();
      
      if (dateStr === 'today') {
        eventMoment = now.clone();
      } else if (dateStr === 'tomorrow') {
        eventMoment = now.clone().add(1, 'day');
      } else if (dateStr === 'tonight') {
        eventMoment = now.clone().hour(19).minute(0); // Default to 7 PM
      } else {
        // Try to parse various date formats
        const parsedDate = moment.tz(eventInfo.date, [
          'YYYY-MM-DD',
          'MM/DD/YYYY',
          'MM-DD-YYYY',
          'DD/MM/YYYY',
          'MMMM DD',
          'MMM DD',
          'dddd', // Day of week
        ], this.timezone);
        
        if (parsedDate.isValid()) {
          eventMoment = parsedDate;
          // If parsed date is in the past, assume next occurrence
          if (eventMoment.isBefore(now, 'day')) {
            eventMoment.add(1, 'week');
          }
        } else {
          eventMoment = now.clone().add(1, 'hour'); // Default fallback
        }
      }
    } else {
      eventMoment = now.clone().add(1, 'hour'); // Default fallback
    }

    // Parse time
    if (eventInfo.time) {
      const timeStr = eventInfo.time.toLowerCase().replace(/\s+/g, '');
      
      // Parse various time formats
      const timeMatch = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
      
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2] || '0');
        const ampm = timeMatch[3];
        
        // Convert to 24-hour format
        if (ampm === 'pm' && hours !== 12) {
          hours += 12;
        } else if (ampm === 'am' && hours === 12) {
          hours = 0;
        }
        
        eventMoment.hour(hours).minute(minutes).second(0);
      }
    } else {
      // Default time if not specified
      eventMoment.hour(12).minute(0).second(0); // Noon
    }

    const startDateTime = eventMoment.toISOString();
    const endDateTime = eventMoment.clone().add(this.defaultDuration, 'minutes').toISOString();

    return { startDateTime, endDateTime };
  }

  buildEventDescription(eventInfo) {
    let description = `📱 Created from WhatsApp message\n\n`;
    
    description += `Original message: "${eventInfo.originalMessage}"\n`;
    description += `Extracted by: ${eventInfo.extractedBy}\n`;
    description += `Confidence: ${(eventInfo.confidence * 100).toFixed(1)}%\n`;
    
    if (eventInfo.description && eventInfo.description !== eventInfo.originalMessage) {
      description += `\nAdditional details: ${eventInfo.description}`;
    }
    
    return description;
  }

  generateEventKey(eventInfo) {
    // Create a unique key for duplicate detection
    const { startDateTime } = this.parseDateTime(eventInfo);
    const dateKey = moment(startDateTime).format('YYYY-MM-DD-HH-mm');
    const titleKey = eventInfo.title.toLowerCase().replace(/\s+/g, '');
    
    return `${titleKey}-${dateKey}`;
  }

  async getEvents(startTime, endTime) {
    try {
      console.log(chalk.blue('📋 Fetching events from calendar...'));
      
      const response = await this.calendar.events.list({
        calendarId: config.calendar.calendarId,
        timeMin: startTime,
        timeMax: endTime,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      console.log(chalk.green(`✅ Found ${events.length} events`));
      
      return events;
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to fetch events:'), error.message);
      throw error;
    }
  }

  async updateEvent(eventId, updates) {
    try {
      console.log(chalk.blue('📝 Updating calendar event...'));
      
      // First get the existing event
      const existingEvent = await this.calendar.events.get({
        calendarId: config.calendar.calendarId,
        eventId: eventId,
      });

      // Merge updates with existing event
      const updatedEvent = {
        ...existingEvent.data,
        ...updates
      };

      const response = await this.calendar.events.update({
        calendarId: config.calendar.calendarId,
        eventId: eventId,
        resource: updatedEvent,
      });

      console.log(chalk.green('✅ Event updated successfully'));
      
      return {
        success: true,
        event: response.data
      };
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to update event:'), error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteEvent(eventId) {
    try {
      console.log(chalk.blue('🗑️  Deleting calendar event...'));
      
      await this.calendar.events.delete({
        calendarId: config.calendar.calendarId,
        eventId: eventId,
      });

      console.log(chalk.green('✅ Event deleted successfully'));
      
      return {
        success: true
      };
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to delete event:'), error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = CalendarService;
