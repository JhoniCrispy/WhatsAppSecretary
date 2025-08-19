const chalk = require('chalk');
const moment = require('moment-timezone');

class CalendarMCPServer {
  constructor(calendarService) {
    this.calendarService = calendarService;
    this.server = null;
    this.Server = null;
    this.StdioServerTransport = null;
  }

  async initialize() {
    try {
      console.log(chalk.blue('🔧 Initializing simplified MCP-style server...'));
      
      // Create a simplified server object that mimics MCP functionality
      this.server = {
        name: "whatsapp-secretary-calendar",
        version: "1.0.0",
        description: "Calendar management tools for WhatsApp Secretary",
        tools: [],
        request: async (request) => {
          return await this.handleRequest(request);
        }
      };
      
      this.setupTools();
      console.log(chalk.green('✅ Simplified MCP server initialized'));
      return true;
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to initialize server:'), error.message);
      return false;
    }
  }

  setupTools() {
    console.log(chalk.blue('🔧 Setting up MCP Calendar tools...'));

    // Define available tools
    this.server.tools = [
        {
          name: "list_calendar_events",
          description: "List calendar events within a specific time range",
          inputSchema: {
            type: "object",
            properties: {
              start_date: {
                type: "string",
                description: "Start date in YYYY-MM-DD format or relative (today, tomorrow, monday)"
              },
              end_date: {
                type: "string", 
                description: "End date in YYYY-MM-DD format or relative (today, tomorrow, friday)"
              },
              search_query: {
                type: "string",
                description: "Optional search term to filter events by title"
              }
            },
            required: ["start_date", "end_date"]
          }
        },
        {
          name: "create_calendar_event",
          description: "Create a new calendar event",
          inputSchema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Event title/summary"
              },
              start_time: {
                type: "string",
                description: "Start date and time (ISO format or natural language)"
              },
              end_time: {
                type: "string",
                description: "End date and time (ISO format or natural language)"
              },
              location: {
                type: "string",
                description: "Event location (optional)"
              },
              description: {
                type: "string",
                description: "Event description (optional)"
              }
            },
            required: ["title", "start_time"]
          }
        },
        {
          name: "update_calendar_event",
          description: "Update an existing calendar event",
          inputSchema: {
            type: "object",
            properties: {
              event_identifier: {
                type: "string",
                description: "Event ID or search term to identify the event"
              },
              updates: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  start_time: { type: "string" },
                  end_time: { type: "string" },
                  location: { type: "string" },
                  description: { type: "string" }
                },
                description: "Fields to update"
              }
            },
            required: ["event_identifier", "updates"]
          }
        },
        {
          name: "delete_calendar_event",
          description: "Delete a calendar event",
          inputSchema: {
            type: "object",
            properties: {
              event_identifier: {
                type: "string",
                description: "Event ID or search term to identify the event to delete"
              },
              confirmation: {
                type: "boolean",
                description: "Confirmation that the event should be deleted",
                default: true
              }
            },
            required: ["event_identifier"]
          }
        },
        {
          name: "search_calendar_events",
          description: "Search for calendar events by title, date, or content",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query (event title, keywords, etc.)"
              },
              date_range: {
                type: "string",
                description: "Optional date range like 'this week', 'next month', 'today'"
              },
              max_results: {
                type: "number",
                description: "Maximum number of results to return",
                default: 10
              }
            },
            required: ["query"]
          }
                 }
       ];
  }

  async handleRequest(request) {
    if (request.method === 'tools/list') {
      return { tools: this.server.tools };
    }
    
    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      
      console.log(chalk.blue(`🛠️  MCP Tool called: ${name}`));
      console.log(chalk.gray(`📋 Arguments:`, JSON.stringify(args, null, 2)));

      try {
        switch (name) {
          case "list_calendar_events":
            return await this.handleListEvents(args);
          
          case "create_calendar_event":
            return await this.handleCreateEvent(args);
          
          case "update_calendar_event":
            return await this.handleUpdateEvent(args);
          
          case "delete_calendar_event":
            return await this.handleDeleteEvent(args);
          
          case "search_calendar_events":
            return await this.handleSearchEvents(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.log(chalk.red(`❌ MCP Tool error:`, error.message));
        return {
          content: [{
            type: "text",
            text: `Error: ${error.message}`
          }],
          isError: true
                 };
       }
    }
    
    throw new Error(`Unknown method: ${request.method}`);
  }

  async handleListEvents(args) {
    const { start_date, end_date, search_query } = args;
    
    // Parse dates
    const startTime = this.parseDateTime(start_date);
    const endTime = this.parseDateTime(end_date, true); // end of day
    
    console.log(chalk.blue(`📅 Listing events from ${startTime} to ${endTime}`));
    
    const events = await this.calendarService.getEvents(startTime, endTime);
    
    // Filter by search query if provided
    let filteredEvents = events;
    if (search_query) {
      filteredEvents = events.filter(event => 
        event.summary?.toLowerCase().includes(search_query.toLowerCase()) ||
        event.description?.toLowerCase().includes(search_query.toLowerCase())
      );
    }
    
    const eventList = filteredEvents.map(event => ({
      id: event.id,
      title: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
      description: event.description
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          count: eventList.length,
          events: eventList
        }, null, 2)
      }]
    };
  }

  async handleCreateEvent(args) {
    const { title, start_time, end_time, location, description } = args;
    
    console.log(chalk.green(`📅 Creating event: ${title}`));
    
    // Convert to event info format
    const eventInfo = {
      title,
      date: this.extractDate(start_time),
      time: this.extractTime(start_time),
      location,
      description: description || `Created via WhatsApp: ${title}`,
      originalMessage: `Create event: ${title} at ${start_time}`,
      extractedBy: 'mcp'
    };
    
    const result = await this.calendarService.createEvent(eventInfo);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: result.success,
          eventId: result.eventId,
          message: result.success ? `Event created: ${title}` : `Failed: ${result.error}`,
          htmlLink: result.htmlLink
        }, null, 2)
      }]
    };
  }

  async handleUpdateEvent(args) {
    const { event_identifier, updates } = args;
    
    console.log(chalk.yellow(`✏️  Updating event: ${event_identifier}`));
    
    // First, find the event
    const event = await this.findEventByIdentifier(event_identifier);
    
    if (!event) {
      throw new Error(`Event not found: ${event_identifier}`);
    }
    
    // Prepare updates
    const eventUpdates = {};
    if (updates.title) eventUpdates.summary = updates.title;
    if (updates.location) eventUpdates.location = updates.location;
    if (updates.description) eventUpdates.description = updates.description;
    
    if (updates.start_time) {
      eventUpdates.start = {
        dateTime: this.parseDateTime(updates.start_time),
        timeZone: this.calendarService.timezone
      };
    }
    
    if (updates.end_time) {
      eventUpdates.end = {
        dateTime: this.parseDateTime(updates.end_time),
        timeZone: this.calendarService.timezone
      };
    }
    
    const result = await this.calendarService.updateEvent(event.id, eventUpdates);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: result.success,
          message: result.success ? `Event updated: ${event.summary}` : `Failed: ${result.error}`,
          originalEvent: event.summary,
          updates: updates
        }, null, 2)
      }]
    };
  }

  async handleDeleteEvent(args) {
    const { event_identifier, confirmation = true } = args;
    
    if (!confirmation) {
      throw new Error("Event deletion requires confirmation");
    }
    
    console.log(chalk.red(`🗑️  Deleting event: ${event_identifier}`));
    
    // Find the event
    const event = await this.findEventByIdentifier(event_identifier);
    
    if (!event) {
      throw new Error(`Event not found: ${event_identifier}`);
    }
    
    const result = await this.calendarService.deleteEvent(event.id);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: result.success,
          message: result.success ? `Event deleted: ${event.summary}` : `Failed: ${result.error}`,
          deletedEvent: event.summary
        }, null, 2)
      }]
    };
  }

  async handleSearchEvents(args) {
    const { query, date_range = "this month", max_results = 10 } = args;
    
    console.log(chalk.blue(`🔍 Searching events: "${query}" in ${date_range}`));
    
    const { startTime, endTime } = this.parseDateRange(date_range);
    const events = await this.calendarService.getEvents(startTime, endTime);
    
    // Search in title and description
    const filteredEvents = events
      .filter(event => 
        event.summary?.toLowerCase().includes(query.toLowerCase()) ||
        event.description?.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, max_results);
    
    const searchResults = filteredEvents.map(event => ({
      id: event.id,
      title: event.summary,
      start: event.start?.dateTime || event.start?.date,
      location: event.location,
      description: event.description
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          query: query,
          count: searchResults.length,
          events: searchResults
        }, null, 2)
      }]
    };
  }

  // Helper methods
  parseDateTime(dateStr, endOfDay = false) {
    const timezone = this.calendarService.timezone;
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
    
    if (endOfDay) {
      parsed.endOf('day');
    }
    
    return parsed.toISOString();
  }

  extractDate(dateTimeStr) {
    return moment(dateTimeStr).format('YYYY-MM-DD');
  }

  extractTime(dateTimeStr) {
    return moment(dateTimeStr).format('HH:mm A');
  }

  parseDateRange(rangeStr) {
    const now = moment().tz(this.calendarService.timezone);
    
    switch (rangeStr.toLowerCase()) {
      case 'today':
        return {
          startTime: now.clone().startOf('day').toISOString(),
          endTime: now.clone().endOf('day').toISOString()
        };
      case 'tomorrow':
        return {
          startTime: now.clone().add(1, 'day').startOf('day').toISOString(),
          endTime: now.clone().add(1, 'day').endOf('day').toISOString()
        };
      case 'this week':
        return {
          startTime: now.clone().startOf('week').toISOString(),
          endTime: now.clone().endOf('week').toISOString()
        };
      case 'next week':
        return {
          startTime: now.clone().add(1, 'week').startOf('week').toISOString(),
          endTime: now.clone().add(1, 'week').endOf('week').toISOString()
        };
      case 'this month':
        return {
          startTime: now.clone().startOf('month').toISOString(),
          endTime: now.clone().endOf('month').toISOString()
        };
      default:
        // Default to next 7 days
        return {
          startTime: now.toISOString(),
          endTime: now.clone().add(7, 'days').toISOString()
        };
    }
  }

  async findEventByIdentifier(identifier) {
    // Try to find event by ID first
    try {
      const event = await this.calendarService.calendar.events.get({
        calendarId: this.calendarService.calendarId,
        eventId: identifier
      });
      return event.data;
    } catch (error) {
      // Not an ID, search by title
    }
    
    // Search by title in recent events
    const { startTime, endTime } = this.parseDateRange('this month');
    const events = await this.calendarService.getEvents(startTime, endTime);
    
    return events.find(event => 
      event.summary?.toLowerCase().includes(identifier.toLowerCase())
    );
  }

  async connect() {
    if (!this.server) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize MCP Server');
      }
    }
    console.log(chalk.green('🔗 MCP Calendar Server ready'));
    return this.server;
  }
}

module.exports = CalendarMCPServer;
