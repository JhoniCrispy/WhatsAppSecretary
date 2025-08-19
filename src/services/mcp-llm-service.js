const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');
const debug = require('../utils/debug');

class MCPLLMService {
  constructor() {
    this.baseUrl = config.llm.baseUrl;
    this.model = config.llm.model;
    this.timeout = config.llm.timeout;
    this.maxRetries = config.llm.maxRetries;
    this.mcpServer = null;
  }

  setMCPServer(mcpServer) {
    this.mcpServer = mcpServer;
    console.log(chalk.green('🔗 MCP Server connected to LLM Service'));
  }

  async processEventMessage(messageText, senderName) {
    debug.logMessageFlow('START', 'Processing WhatsApp message', {
      messageText,
      senderName,
      messageLength: messageText.length
    });

    if (!this.mcpServer) {
      debug.logError('MCP-LLM', new Error('MCP Server not connected'));
      throw new Error('MCP Server not connected');
    }

    // Get available tools from MCP server
    debug.logMessageFlow('TOOLS', 'Fetching available tools from MCP server');
    const toolsResponse = await this.mcpServer.server.request({
      method: 'tools/list'
    });
    
    const tools = toolsResponse.tools;
    debug.log('tools-available', 'MCP Tools Discovery', {
      toolCount: tools.length,
      toolNames: tools.map(t => t.name),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        requiredParams: t.inputSchema?.required || []
      }))
    }, 'blue');

    // Create enhanced prompt with tool context
    debug.logMessageFlow('PROMPT', 'Building LLM prompt with tool context');
    const prompt = this.buildMCPPrompt(messageText, senderName, tools);
    debug.logLLMPrompt(prompt, { messageText, senderName, toolCount: tools.length });
    
    // Get LLM response with tool calling capability
    debug.logMessageFlow('LLM', 'Sending prompt to LLM for processing');
    const startTime = Date.now();
    const response = await this.generateResponseWithTools(prompt, tools);
    const processingTime = Date.now() - startTime;
    
    debug.logLLMResponse(response.text, processingTime);
    debug.logToolCalls(response.toolCalls || [], response.reasoning);
    
    // Execute any tool calls
    if (response.toolCalls && response.toolCalls.length > 0) {
      debug.logMessageFlow('EXECUTE', `Executing ${response.toolCalls.length} tool calls`);
      
      const toolResults = [];
      for (let i = 0; i < response.toolCalls.length; i++) {
        const toolCall = response.toolCalls[i];
        debug.logMessageFlow('TOOL', `Executing tool ${i + 1}/${response.toolCalls.length}: ${toolCall.name}`);
        
        try {
          const result = await this.executeTool(toolCall);
          toolResults.push(result);
          debug.logToolExecution(toolCall.name, toolCall.arguments, result);
        } catch (error) {
          debug.logToolExecution(toolCall.name, toolCall.arguments, null, error);
          toolResults.push({ error: error.message });
        }
      }
      
      return {
        processed: true,
        intent: response.intent,
        toolCalls: response.toolCalls,
        toolResults: toolResults,
        message: this.formatResponse(response.intent, toolResults),
        rawResponse: response.text
      };
    } else {
      return {
        processed: false,
        intent: response.intent || 'unknown',
        message: response.text,
        reason: 'No tool calls generated'
      };
    }
  }

  buildMCPPrompt(messageText, senderName, tools) {
    const toolDescriptions = tools.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join('\n');

    return `You are a calendar assistant. You MUST use ONLY the tools provided. The first word in the user message determines the action:

COMMAND MAPPING (MANDATORY):
- "add" / "create" / "schedule" → use "create_calendar_event" 
- "move" / "reschedule" / "change" → use "search_calendar_events" THEN "delete_calendar_event" THEN "create_calendar_event"
- "delete" / "cancel" / "remove" → use "search_calendar_events" THEN "delete_calendar_event"
- "show" / "list" / "what" / "when" → use "list_calendar_events" or "search_calendar_events"

AVAILABLE TOOLS (DO NOT USE ANY OTHER TOOLS):
${toolDescriptions}

CRITICAL RULES:
1. You MUST use only the tools listed above
2. For "move" commands: ALWAYS search first, then delete, then create
3. For "delete" commands: ALWAYS search first, then delete
4. Use EXACT tool names as listed
5. If uncertain about an event, search first

Message from ${senderName}: "${messageText}"

You MUST respond with JSON in this EXACT format:
{
  "intent": "create_event|edit_event|delete_event|query_events|other",
  "reasoning": "explanation of what you understood",
  "tool_calls": [
    {
      "name": "tool_name",
      "arguments": {
        "param1": "value1",
        "param2": "value2"
      }
    }
  ]
}

EXAMPLES (FOLLOW EXACTLY):

User: "add meeting with John tomorrow at 2pm"
Response: {
  "intent": "create_event",
  "reasoning": "Command 'add' detected, creating new event",
  "tool_calls": [
    {
      "name": "create_calendar_event",
      "arguments": {
        "title": "meeting with John",
        "start_time": "tomorrow 2:00 PM",
        "end_time": "tomorrow 3:00 PM"
      }
    }
  ]
}

User: "move team meeting to 3pm"
Response: {
  "intent": "edit_event", 
  "reasoning": "Command 'move' detected, must search-delete-create sequence",
  "tool_calls": [
    {
      "name": "search_calendar_events",
      "arguments": {
        "query": "team meeting",
        "date_range": "this week"
      }
    },
    {
      "name": "delete_calendar_event",
      "arguments": {
        "event_identifier": "team meeting",
        "confirmation": true
      }
    },
    {
      "name": "create_calendar_event",
      "arguments": {
        "title": "team meeting",
        "start_time": "3:00 PM",
        "end_time": "4:00 PM"
      }
    }
  ]
}

User: "show what I have Friday"
Response: {
  "intent": "query_events",
  "reasoning": "Command 'show' detected, listing events",
  "tool_calls": [
    {
      "name": "list_calendar_events",
      "arguments": {
        "start_date": "friday",
        "end_date": "friday"
      }
    }
  ]
}

User: "delete dinner tonight"
Response: {
  "intent": "delete_event",
  "reasoning": "Command 'delete' detected, must search then delete",
  "tool_calls": [
    {
      "name": "search_calendar_events",
      "arguments": {
        "query": "dinner",
        "date_range": "today"
      }
    },
    {
      "name": "delete_calendar_event",
      "arguments": {
        "event_identifier": "dinner",
        "confirmation": true
      }
    }
  ]
}

Now analyze this message and respond with appropriate tool calls:

Message: "${messageText}"

Response:`;
  }

  async generateResponseWithTools(prompt, tools) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(chalk.blue(`🤖 LLM processing with tools (attempt ${attempt}/${this.maxRetries})`));
        
        const response = await axios.post(
          `${this.baseUrl}/api/generate`,
          {
            model: this.model,
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.2, // Lower for more consistent tool calling
              top_p: 0.9,
              max_tokens: 1000
            }
          },
          { timeout: this.timeout }
        );

        const text = response.data.response;
        return this.parseToolResponse(text);
        
      } catch (error) {
        console.log(chalk.red(`❌ LLM attempt ${attempt} failed:`), error.message);
        
        if (attempt === this.maxRetries) {
          throw new Error(`All LLM attempts failed: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  parseToolResponse(llmResponse) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        debug.logJSONParsing(llmResponse, null, new Error('No JSON found in response'));
        return {
          intent: 'other',
          toolCalls: [],
          text: llmResponse
        };
      }

      const jsonString = jsonMatch[0];
      const parsed = JSON.parse(jsonString);
      
      debug.logJSONParsing(jsonString, parsed);
      
      const result = {
        intent: parsed.intent || 'unknown',
        reasoning: parsed.reasoning || '',
        toolCalls: parsed.tool_calls || [],
        text: llmResponse
      };

      // Validate tool calls structure and existence
      if (result.toolCalls.length > 0) {
        const validToolNames = ['list_calendar_events', 'create_calendar_event', 'update_calendar_event', 'delete_calendar_event', 'search_calendar_events'];
        
        for (let i = 0; i < result.toolCalls.length; i++) {
          const toolCall = result.toolCalls[i];
          
          // Check structure
          if (!toolCall.name || !toolCall.arguments) {
            debug.logError('JSON-Validation', new Error(`Invalid tool call structure at index ${i}`), { toolCall });
            continue;
          }
          
          // Check if tool exists
          if (!validToolNames.includes(toolCall.name)) {
            debug.logError('Tool-Validation', new Error(`Unknown tool "${toolCall.name}" at index ${i}. Valid tools: ${validToolNames.join(', ')}`), { toolCall });
            // Remove invalid tool call
            result.toolCalls.splice(i, 1);
            i--; // Adjust index after removal
          }
        }
      }
      
      return result;
      
    } catch (error) {
      debug.logJSONParsing(llmResponse, null, error);
      console.log(chalk.yellow('⚠️  Failed to parse tool response, treating as text'));
      return {
        intent: 'other',
        toolCalls: [],
        text: llmResponse
      };
    }
  }

  async executeTool(toolCall) {
    console.log(chalk.blue(`🔧 Executing tool: ${toolCall.name}`));
    
    try {
      const result = await this.mcpServer.server.request({
        method: 'tools/call',
        params: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      });

      console.log(chalk.green(`✅ Tool ${toolCall.name} completed`));
      return result;
      
    } catch (error) {
      console.log(chalk.red(`❌ Tool ${toolCall.name} failed:`, error.message));
      throw error;
    }
  }

  formatResponse(intent, toolResults) {
    if (!toolResults || toolResults.length === 0) {
      return "I couldn't process your request.";
    }

    // Parse results and create user-friendly messages
    const messages = [];
    
    for (const result of toolResults) {
      if (result.error) {
        messages.push(`❌ Error: ${result.error}`);
        continue;
      }

      if (result.content && result.content[0]) {
        try {
          const data = JSON.parse(result.content[0].text);
          
          if (data.success) {
            switch (intent) {
              case 'create_event':
                messages.push(`✅ Event created: ${data.message}`);
                break;
              case 'edit_event':
                messages.push(`✅ Event updated: ${data.message}`);
                break;
              case 'delete_event':
                messages.push(`✅ Event deleted: ${data.message}`);
                break;
              case 'query_events':
                if (data.events && data.events.length > 0) {
                  const eventList = data.events.map(e => 
                    `• ${e.title} - ${new Date(e.start).toLocaleString()}`
                  ).join('\n');
                  messages.push(`📅 Found ${data.count} event(s):\n${eventList}`);
                } else {
                  messages.push(`📅 No events found`);
                }
                break;
              default:
                messages.push(`✅ ${data.message}`);
            }
          } else {
            messages.push(`❌ ${data.message}`);
          }
        } catch (error) {
          messages.push(`✅ Operation completed`);
        }
      }
    }
    
    return messages.join('\n') || "Operation completed.";
  }

  // Fallback method for simple event extraction (compatibility)
  async extractEventInfo(messageText, senderName) {
    const result = await this.processEventMessage(messageText, senderName);
    
    if (result.processed && result.intent === 'create_event') {
      return {
        isEvent: true,
        title: this.extractTitle(messageText),
        confidence: 0.8,
        extractedBy: 'mcp-llm'
      };
    }
    
    return {
      isEvent: false,
      confidence: 0.8,
      extractedBy: 'mcp-llm'
    };
  }

  extractTitle(message) {
    const firstSentence = message.split('.')[0].split('!')[0].split('?')[0];
    return firstSentence.length > 50 ? 
           firstSentence.substring(0, 47) + '...' : 
           firstSentence.trim();
  }
}

module.exports = MCPLLMService;
