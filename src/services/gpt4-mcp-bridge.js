const OpenAI = require('openai');
const chalk = require('chalk');
const config = require('../config');
const debug = require('../utils/debug');

class GPT4MCPBridge {
  constructor(calendarService) {
    this.calendarService = calendarService;
    this.openai = null;
    this.toolDefinitions = null;
    
    this.initializeOpenAI();
    this.setupToolDefinitions();
  }

  initializeOpenAI() {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key not provided. Set OPENAI_API_KEY environment variable.');
    }

    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    console.log(chalk.green('✅ GPT-4 MCP Bridge initialized'));
  }

  setupToolDefinitions() {
    this.toolDefinitions = [
      {
        type: "function",
        function: {
          name: "list_calendar_events",
          description: "List calendar events within a specific time range. Use this to see what events exist before modifying them.",
          parameters: {
            type: "object",
            properties: {
              start_date: {
                type: "string",
                description: "Start date in YYYY-MM-DD format. Calculate the actual date from user's request. Example: if user says 'tomorrow' and today is 2025-08-19, use '2025-08-20'"
              },
              end_date: {
                type: "string", 
                description: "End date in YYYY-MM-DD format. Calculate the actual date from user's request. For single day queries, use the same date as start_date"
              },
              search_query: {
                type: "string",
                description: "Optional search term to filter events by title or content"
              }
            },
            required: ["start_date", "end_date"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_calendar_event",
          description: "Create a new calendar event. Use this to add new appointments, meetings, or reminders.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Event title or summary"
              },
              start_time: {
                type: "string",
                description: "Start date and time in ISO 8601 format like '2025-08-20T14:00:00+03:00'. Calculate from user's natural language. Include timezone for Israel: +03:00"
              },
              end_time: {
                type: "string",
                description: "End date and time in ISO 8601 format like '2025-08-20T15:00:00+03:00'. If not specified, default to 1 hour after start_time"
              },
              location: {
                type: "string",
                description: "Event location (optional)"
              },
              description: {
                type: "string",
                description: "Event description or notes (optional)"
              }
            },
            required: ["title", "start_time"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_calendar_event",
          description: "Delete an existing calendar event. Always search for events first to get the correct event ID.",
          parameters: {
            type: "object",
            properties: {
              event_id: {
                type: "string",
                description: "The exact event ID from Google Calendar (obtained from list_calendar_events)"
              },
              event_title: {
                type: "string", 
                description: "Event title for confirmation and logging purposes"
              }
            },
            required: ["event_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_calendar_event",
          description: "Update an existing calendar event. Always search for events first to get the correct event ID.",
          parameters: {
            type: "object",
            properties: {
              event_id: {
                type: "string",
                description: "The exact event ID from Google Calendar (obtained from list_calendar_events)"
              },
              updates: {
                type: "object",
                properties: {
                  title: { type: "string", description: "New event title" },
                  start_time: { type: "string", description: "New start time in natural language" },
                  end_time: { type: "string", description: "New end time in natural language" },
                  location: { type: "string", description: "New location" },
                  description: { type: "string", description: "New description" }
                },
                description: "Object containing the fields to update"
              }
            },
            required: ["event_id", "updates"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_calendar_events",
          description: "Search for calendar events by title, keywords, or content. Use this to find specific events before modifying them.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query - event title, keywords, or content to search for"
              },
              date_range: {
                type: "string",
                description: "Optional date range like 'this week', 'next month', 'today', 'tomorrow'"
              },
              max_results: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            required: ["query"]
          }
        }
      }
    ];

    debug.log('gpt4-setup', 'Tool Definitions Created', {
      toolCount: this.toolDefinitions.length,
      toolNames: this.toolDefinitions.map(t => t.function.name)
    });
  }

  async processMessage(messageText, senderName = 'User') {
    debug.logMessageFlow('GPT4-START', 'Starting GPT-4 MCP conversation', {
      messageText,
      senderName,
      maxIterations: config.openai.maxIterations
    });

    // Get current Israel date/time for GPT-4 context
    const israelToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const israelTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', hour12: false });

    const messages = [
      {
        role: "system",
        content: `You are an intelligent calendar assistant with access to Google Calendar tools.

CRITICAL TOOL USAGE RULES:
1. You MUST use the provided function tools to access calendar data
2. NEVER make assumptions about what events exist - always search/list first
3. For "move" or "reschedule": search/list → delete → create new event
4. For "delete" or "cancel": search/list → delete specific event
5. For "clear schedule": list events → delete each individual event
6. Always use exact event IDs from search/list results for delete/update operations
7. Be autonomous - execute complete workflows without asking for confirmation

FUNCTION CALLING REQUIREMENTS:
- Use ONLY the provided function tools - never guess or assume data
- Follow the exact parameter schemas defined for each function
- For dates: Calculate actual YYYY-MM-DD dates based on Israel timezone
- For times: Use ISO 8601 format with Israel timezone +03:00 (example: "2025-08-20T14:00:00+03:00")
- IMPORTANT: Today is ${israelToday}, current time is ${israelTime} (Israel timezone)
- Always provide required parameters for each function call

AVAILABLE TOOLS: list_calendar_events, create_calendar_event, delete_calendar_event, update_calendar_event, search_calendar_events

Execute the user's request by calling the appropriate tools in the correct sequence.`
      },
      {
        role: "user",
        content: messageText
      }
    ];

    let iteration = 0;
    const maxIterations = config.openai.maxIterations;

    while (iteration < maxIterations) {
      iteration++;

      debug.logMessageFlow('GPT4-ITERATION', `Starting iteration ${iteration}/${maxIterations}`, {
        conversationLength: messages.length,
        lastMessageRole: messages[messages.length - 1]?.role
      });

      try {
        // Send conversation to GPT-4 with tools
        const response = await this.openai.chat.completions.create({
          model: config.openai.model,
          messages: messages,
          tools: this.toolDefinitions,
          tool_choice: "auto",
          max_completion_tokens: config.openai.maxTokens,
          // temperature: config.openai.temperature
        });

        const assistantMessage = response.choices[0].message;
        messages.push(assistantMessage);

        debug.log('gpt4-response', `GPT-4 Response (Iteration ${iteration})`, {
          hasToolCalls: !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0),
          toolCallCount: assistantMessage.tool_calls?.length || 0,
          toolNames: assistantMessage.tool_calls?.map(tc => tc.function.name) || [],
          hasContent: !!assistantMessage.content,
          contentPreview: assistantMessage.content?.substring(0, 100)
        });

        // If GPT-4 made tool calls, execute them
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          debug.logMessageFlow('GPT4-TOOLS', `Executing ${assistantMessage.tool_calls.length} tool calls`);

          for (const toolCall of assistantMessage.tool_calls) {
            try {
              const result = await this.executeToolCall(toolCall);
              
              // Add tool result to conversation
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
              });

              debug.logToolExecution(
                toolCall.function.name, 
                JSON.parse(toolCall.function.arguments), 
                result
              );

            } catch (error) {
              // Add error result to conversation
              const errorResult = {
                success: false,
                error: error.message
              };

              messages.push({
                role: "tool", 
                tool_call_id: toolCall.id,
                content: JSON.stringify(errorResult)
              });

              debug.logToolExecution(
                toolCall.function.name,
                JSON.parse(toolCall.function.arguments),
                null,
                error
              );
            }
          }

          // Continue loop - GPT-4 can analyze results and call more tools
          continue;

        } else {
          // No tool calls - GPT-4 has finished and provided final response
          debug.logMessageFlow('GPT4-COMPLETE', `Conversation completed after ${iteration} iterations`);
          
          return {
            success: true,
            response: assistantMessage.content || "Task completed successfully.",
            iterations: iteration,
            conversationLength: messages.length
          };
        }

      } catch (error) {
        debug.logError('GPT4-API', error, { iteration, messageCount: messages.length });
        
        return {
          success: false,
          error: `GPT-4 API error: ${error.message}`,
          iterations: iteration
        };
      }
    }

    // Reached max iterations
    debug.logError('GPT4-MAX-ITERATIONS', new Error(`Reached maximum iterations: ${maxIterations}`));
    
    return {
      success: false,
      error: `Reached maximum iterations (${maxIterations}). The task may be too complex or the AI got stuck in a loop.`,
      iterations: maxIterations
    };
  }

  async executeToolCall(toolCall) {
    const { name, arguments: argsString } = toolCall.function;
    const args = JSON.parse(argsString);

    debug.logMessageFlow('TOOL-EXECUTE', `Executing ${name}`, { args });

    switch (name) {
      case 'list_calendar_events':
        return await this.handleListEvents(args);

      case 'create_calendar_event':
        return await this.handleCreateEvent(args);

      case 'delete_calendar_event':
        return await this.handleDeleteEvent(args);

      case 'update_calendar_event':
        return await this.handleUpdateEvent(args);

      case 'search_calendar_events':
        return await this.handleSearchEvents(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async handleListEvents(args) {
    const { start_date, end_date, search_query } = args;
    
    try {
      // Convert YYYY-MM-DD to full day range in Israel timezone
      const startTime = `${start_date}T00:00:00+03:00`;
      const endTime = `${end_date}T23:59:59+03:00`;
      
      debug.log('calendar-query', 'Google Calendar API Request', {
        originalArgs: args,
        parsedStartTime: startTime,
        parsedEndTime: endTime,
        timezone: 'Asia/Jerusalem' // Use correct timezone
      });
      
      const events = await this.calendarService.getEvents(startTime, endTime);
      
      debug.log('calendar-response', 'Google Calendar API Raw Response', {
        rawEventCount: events ? events.length : 0,
        rawEvents: events ? events.map(e => ({
          id: e.id,
          summary: e.summary,
          start: e.start,
          end: e.end,
          created: e.created,
          updated: e.updated
        })) : [],
        queryTimeRange: {
          from: startTime,
          to: endTime
        }
      });
      
      // Filter by search query if provided
      let filteredEvents = events;
      if (search_query) {
        filteredEvents = events.filter(event => 
          event.summary?.toLowerCase().includes(search_query.toLowerCase()) ||
          event.description?.toLowerCase().includes(search_query.toLowerCase())
        );
        
        debug.log('calendar-filter', 'Search Query Applied', {
          searchQuery: search_query,
          beforeFilter: events.length,
          afterFilter: filteredEvents.length
        });
      }
      
      const eventList = filteredEvents.map(event => ({
        id: event.id,
        title: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
        description: event.description
      }));

      debug.log('calendar-final', 'Final Event List Returned', {
        finalCount: eventList.length,
        finalEvents: eventList
      });

      return {
        success: true,
        count: eventList.length,
        events: eventList
      };
    } catch (error) {
      debug.logError('calendar-error', error, { args });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleCreateEvent(args) {
    const { title, start_time, end_time, location, description } = args;
    
    try {
      // GPT-4 should now provide ISO format, use directly
      const eventInfo = {
        title,
        startDateTime: start_time,
        endDateTime: end_time || this.addOneHour(start_time),
        location,
        description: description || `Created from WhatsApp: ${title}`,
        originalMessage: `Create: ${title} at ${start_time}`,
        extractedBy: 'gpt4-mcp'
      };
      
      const result = await this.calendarService.createEvent(eventInfo);
      
      return {
        success: result.success,
        eventId: result.eventId,
        message: result.success ? `Created: ${title}` : `Failed: ${result.error}`,
        htmlLink: result.htmlLink
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleDeleteEvent(args) {
    const { event_id, event_title } = args;
    
    try {
      const result = await this.calendarService.deleteEvent(event_id);
      
      return {
        success: result.success,
        message: result.success ? `Deleted: ${event_title || event_id}` : `Failed: ${result.error}`,
        eventId: event_id
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleUpdateEvent(args) {
    const { event_id, updates } = args;
    
    try {
      // Convert updates to Google Calendar format
      const calendarUpdates = {};
      
      if (updates.title) calendarUpdates.summary = updates.title;
      if (updates.location) calendarUpdates.location = updates.location;
      if (updates.description) calendarUpdates.description = updates.description;
      
      if (updates.start_time) {
        calendarUpdates.start = {
          dateTime: this.parseDateTime(updates.start_time),
          timeZone: this.calendarService.timezone
        };
      }
      
      if (updates.end_time) {
        calendarUpdates.end = {
          dateTime: this.parseDateTime(updates.end_time),
          timeZone: this.calendarService.timezone
        };
      }
      
      const result = await this.calendarService.updateEvent(event_id, calendarUpdates);
      
      return {
        success: result.success,
        message: result.success ? `Updated event` : `Failed: ${result.error}`,
        eventId: event_id,
        updates: updates
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleSearchEvents(args) {
    const { query, date_range = "this month", max_results = 10 } = args;
    
    try {
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
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
        description: event.description
      }));

      return {
        success: true,
        query: query,
        count: searchResults.length,
        events: searchResults
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper methods (reuse from calendar-server.js)
  parseDateTime(dateStr, endOfDay = false) {
    const moment = require('moment-timezone');
    const timezone = 'Asia/Jerusalem'; // Use config timezone
    let parsed;
    
    debug.log('date-parsing', 'Parsing Date String', {
      input: dateStr,
      timezone: timezone,
      endOfDay: endOfDay
    });
    
    if (dateStr.toLowerCase() === 'today') {
      parsed = moment().tz(timezone);
      if (endOfDay) {
        parsed.endOf('day');
      } else {
        parsed.startOf('day');
      }
    } else if (dateStr.toLowerCase() === 'tomorrow') {
      parsed = moment().tz(timezone).add(1, 'day');
      if (endOfDay) {
        parsed.endOf('day');
      } else {
        parsed.startOf('day');
      }
    } else if (dateStr.toLowerCase() === 'yesterday') {
      parsed = moment().tz(timezone).subtract(1, 'day');
      if (endOfDay) {
        parsed.endOf('day');
      } else {
        parsed.startOf('day');
      }
    } else {
      // Handle more complex date/time combinations
      const lowerStr = dateStr.toLowerCase();
      
      // Check for "tomorrow + time" patterns
      if (lowerStr.includes('tomorrow')) {
        parsed = moment().tz(timezone).add(1, 'day');
        
        // Extract time if present
        const timeMatch = lowerStr.match(/(\d{1,2})\s?(am|pm)/);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const period = timeMatch[2];
          const hour24 = period === 'pm' && hour !== 12 ? hour + 12 : (period === 'am' && hour === 12 ? 0 : hour);
          parsed.hour(hour24).minute(0).second(0);
        } else {
          // Default to start of day for date-only
          if (endOfDay) {
            parsed.endOf('day');
          } else {
            parsed.startOf('day');
          }
        }
      } else if (lowerStr.includes('today')) {
        parsed = moment().tz(timezone);
        
        // Extract time if present
        const timeMatch = lowerStr.match(/(\d{1,2})\s?(am|pm)/);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const period = timeMatch[2];
          const hour24 = period === 'pm' && hour !== 12 ? hour + 12 : (period === 'am' && hour === 12 ? 0 : hour);
          parsed.hour(hour24).minute(0).second(0);
        }
      } else {
        // Try to parse as-is
        parsed = moment.tz(dateStr, timezone);
        if (!parsed.isValid()) {
          // Last resort - use current time
          console.log(chalk.yellow(`⚠️ Could not parse "${dateStr}", using current time`));
          parsed = moment().tz(timezone);
        }
      }
    }
    
    const result = parsed.toISOString();
    
    debug.log('date-parsed', 'Date Parsing Result', {
      input: dateStr,
      output: result,
      localTime: parsed.format('YYYY-MM-DD HH:mm:ss z'),
      isValid: parsed.isValid()
    });
    
    return result;
  }

  extractDate(dateTimeStr) {
    const moment = require('moment-timezone');
    // Better date parsing for natural language
    const parsed = this.parseDateTime(dateTimeStr);
    return moment(parsed).format('YYYY-MM-DD');
  }

  extractTime(dateTimeStr) {
    const moment = require('moment-timezone');
    // Better time parsing for natural language
    const parsed = this.parseDateTime(dateTimeStr);
    return moment(parsed).format('HH:mm A');
  }

  parseDateRange(rangeStr) {
    const moment = require('moment-timezone');
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
        return {
          startTime: now.toISOString(),
          endTime: now.clone().add(7, 'days').toISOString()
        };
    }
  }

  // Helper function to add one hour to ISO datetime
  addOneHour(isoDateTime) {
    const date = new Date(isoDateTime);
    date.setHours(date.getHours() + 1);
    return date.toISOString().replace('Z', '+03:00');
  }


}

module.exports = GPT4MCPBridge;
