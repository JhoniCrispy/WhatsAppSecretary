const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const config = require('../config');

class DebugLogger {
  constructor() {
    this.debugDir = './logs/debug';
    this.sessionId = Date.now().toString();
    this.stepCounter = 0;
    
    // Ensure debug directory exists
    if (!fs.existsSync(this.debugDir)) {
      fs.mkdirSync(this.debugDir, { recursive: true });
    }
  }

  log(category, title, data, color = 'blue') {
    if (!config.debug.enabled) return;

    this.stepCounter++;
    const timestamp = new Date().toISOString();
    const step = this.stepCounter.toString().padStart(3, '0');
    
    // Console output with colors
    console.log(chalk[color].bold(`\n🔍 [${step}] ${category.toUpperCase()}: ${title}`));
    console.log(chalk[color]('═'.repeat(60)));
    
    if (typeof data === 'object') {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    } else {
      console.log(chalk.gray(data));
    }
    console.log(chalk[color]('═'.repeat(60)));

    // File output if enabled
    if (config.debug.saveDebugToFile) {
      this.saveToFile(category, title, data, timestamp, step);
    }
  }

  saveToFile(category, title, data, timestamp, step) {
    const filename = `debug-${this.sessionId}.log`;
    const filepath = path.join(this.debugDir, filename);
    
    const logEntry = {
      step: parseInt(step),
      timestamp,
      category,
      title,
      data: typeof data === 'object' ? data : { content: data }
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(filepath, logLine);
  }

  logLLMPrompt(prompt, context = {}) {
    if (!config.debug.logLLMPrompts) return;
    
    this.log('llm-prompt', 'LLM Input Prompt', {
      context,
      prompt: prompt,
      promptLength: prompt.length,
      wordCount: prompt.split(' ').length
    }, 'cyan');
  }

  logLLMResponse(response, processingTime = null) {
    if (!config.debug.logLLMResponses) return;
    
    this.log('llm-response', 'LLM Raw Response', {
      response,
      responseLength: response.length,
      processingTimeMs: processingTime,
      containsJSON: response.includes('{') && response.includes('}')
    }, 'magenta');
  }

  logToolCalls(toolCalls, reasoning = null) {
    if (!config.debug.logToolCalls) return;
    
    this.log('tool-calls', 'Extracted Tool Calls', {
      reasoning,
      toolCallCount: toolCalls.length,
      toolCalls: toolCalls.map(tc => ({
        name: tc.name,
        arguments: tc.arguments,
        argumentCount: Object.keys(tc.arguments || {}).length
      }))
    }, 'yellow');
  }

  logToolExecution(toolName, args, result, error = null) {
    if (!config.debug.logToolCalls) return;
    
    this.log('tool-execution', `Tool: ${toolName}`, {
      toolName,
      arguments: args,
      success: !error,
      error: error?.message,
      result: result,
      resultType: typeof result
    }, error ? 'red' : 'green');
  }

  logCalendarAPI(method, args, response, error = null) {
    if (!config.debug.logCalendarAPI) return;
    
    this.log('calendar-api', `Google Calendar: ${method}`, {
      method,
      arguments: args,
      success: !error,
      error: error?.message,
      response: response,
      responseType: typeof response
    }, error ? 'red' : 'blue');
  }

  logJSONParsing(input, output, error = null) {
    this.log('json-parsing', 'JSON Parse Attempt', {
      input: input.substring(0, 500) + (input.length > 500 ? '...' : ''),
      inputLength: input.length,
      success: !error,
      error: error?.message,
      output,
      foundJSON: input.match(/\{[\s\S]*\}/) !== null
    }, error ? 'red' : 'green');
  }

  logMessageFlow(stage, message, data = {}) {
    this.log('message-flow', `${stage}: ${message}`, {
      stage,
      message,
      ...data
    }, 'blue');
  }

  logError(component, error, context = {}) {
    this.log('error', `${component} Error`, {
      component,
      error: error.message,
      stack: error.stack,
      context
    }, 'red');
  }

  // Generate debug summary
  generateSummary() {
    const summaryPath = path.join(this.debugDir, `summary-${this.sessionId}.txt`);
    const summary = `
Debug Session Summary
=====================
Session ID: ${this.sessionId}
Total Steps: ${this.stepCounter}
Started: ${new Date().toISOString()}

Debug Configuration:
- LLM Prompts: ${config.debug.logLLMPrompts}
- LLM Responses: ${config.debug.logLLMResponses}
- Tool Calls: ${config.debug.logToolCalls}
- Calendar API: ${config.debug.logCalendarAPI}
- Save to File: ${config.debug.saveDebugToFile}

Log Files:
- Debug Log: debug-${this.sessionId}.log
- Summary: summary-${this.sessionId}.txt
    `;

    fs.writeFileSync(summaryPath, summary);
    console.log(chalk.blue(`\n📋 Debug summary saved: ${summaryPath}`));
  }
}

// Singleton instance
const debugLogger = new DebugLogger();

module.exports = debugLogger;
