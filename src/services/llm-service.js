const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');

class LLMService {
  constructor() {
    this.baseUrl = config.llm.baseUrl;
    this.model = config.llm.model;
    this.timeout = config.llm.timeout;
    this.maxRetries = config.llm.maxRetries;
  }

  async checkOllamaConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      const models = response.data.models || [];
      
      console.log(chalk.green('✅ Ollama connection successful'));
      console.log(chalk.blue(`📚 Available models: ${models.map(m => m.name).join(', ')}`));
      
      // Check if our target model is available
      const hasTargetModel = models.some(m => m.name === this.model);
      if (!hasTargetModel) {
        console.log(chalk.yellow(`⚠️  Target model "${this.model}" not found`));
        console.log(chalk.yellow(`💡 Run: ollama pull ${this.model}`));
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(chalk.red('❌ Ollama connection failed:'), error.message);
      console.log(chalk.yellow('💡 Make sure Ollama is running: ollama serve'));
      return false;
    }
  }

  async extractEventInfo(messageText, senderName = 'Unknown') {
    const prompt = this.buildEventExtractionPrompt(messageText, senderName);
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(chalk.blue(`🤖 LLM processing attempt ${attempt}/${this.maxRetries}`));
        
        const response = await axios.post(
          `${this.baseUrl}/api/generate`,
          {
            model: this.model,
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.1, // Low temperature for consistent parsing
              top_p: 0.9,
              max_tokens: 500
            }
          },
          { timeout: this.timeout }
        );

        const result = response.data.response;
        return this.parseEventResponse(result, messageText);
        
      } catch (error) {
        console.log(chalk.red(`❌ LLM attempt ${attempt} failed:`), error.message);
        
        if (attempt === this.maxRetries) {
          console.log(chalk.red('❌ All LLM attempts failed, falling back to simple parsing'));
          return this.fallbackEventExtraction(messageText);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  buildEventExtractionPrompt(messageText, senderName) {
    return `You are an event extraction assistant. Analyze this WhatsApp message and determine if it contains information about a scheduled event (meeting, appointment, dinner, party, etc.).

Message from ${senderName}: "${messageText}"

If this message contains event information, respond with a JSON object in this exact format:
{
  "isEvent": true,
  "title": "Brief event title",
  "date": "YYYY-MM-DD or relative date like 'today', 'tomorrow'",
  "time": "HH:MM AM/PM or time mentioned",
  "location": "location if mentioned",
  "description": "additional details",
  "confidence": 0.8
}

If this is NOT about an event, respond with:
{
  "isEvent": false,
  "confidence": 0.9
}

Rules:
- Only extract clear event information
- Don't assume details not mentioned
- Use "today" for today, "tomorrow" for tomorrow
- Extract actual times mentioned (2pm, 14:00, etc.)
- Be conservative - if unsure, set isEvent to false
- Confidence should be 0-1 (higher = more certain)

Examples:
"Team meeting tomorrow at 2pm" → {"isEvent": true, "title": "Team meeting", "date": "tomorrow", "time": "2:00 PM", "confidence": 0.9}
"How was your day?" → {"isEvent": false, "confidence": 0.95}
"Dinner at Mario's Friday 7pm" → {"isEvent": true, "title": "Dinner at Mario's", "date": "Friday", "time": "7:00 PM", "location": "Mario's", "confidence": 0.85}

Response:`;
  }

  parseEventResponse(llmResponse, originalMessage) {
    try {
      // Try to find JSON in the response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (typeof parsed.isEvent !== 'boolean') {
        throw new Error('Invalid isEvent field');
      }

      if (parsed.isEvent) {
        // Validate event fields
        if (!parsed.title || !parsed.confidence) {
          throw new Error('Missing required event fields');
        }

        console.log(chalk.green('✅ Event detected by LLM:'), parsed.title);
        
        return {
          isEvent: true,
          title: parsed.title,
          date: parsed.date || null,
          time: parsed.time || null,
          location: parsed.location || null,
          description: parsed.description || originalMessage,
          confidence: parsed.confidence,
          originalMessage: originalMessage,
          extractedBy: 'llm'
        };
      } else {
        console.log(chalk.gray('ℹ️  No event detected by LLM'));
        return {
          isEvent: false,
          confidence: parsed.confidence,
          extractedBy: 'llm'
        };
      }
      
    } catch (error) {
      console.log(chalk.yellow('⚠️  LLM response parsing failed:'), error.message);
      console.log(chalk.gray('🔄 Falling back to simple extraction'));
      return this.fallbackEventExtraction(originalMessage);
    }
  }

  fallbackEventExtraction(messageText) {
    const text = messageText.toLowerCase();
    
    // Simple keyword-based detection
    const eventKeywords = ['meeting', 'appointment', 'dinner', 'lunch', 'party', 'event', 'call', 'conference'];
    const timeKeywords = ['at', 'pm', 'am', ':', 'tomorrow', 'today', 'tonight'];
    
    const hasEventKeyword = eventKeywords.some(keyword => text.includes(keyword));
    const hasTimeKeyword = timeKeywords.some(keyword => text.includes(keyword));
    
    if (hasEventKeyword && hasTimeKeyword) {
      // Extract basic info using regex
      const timeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)|(\d{1,2})\s*(am|pm)/i);
      const dateMatch = text.match(/(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      
      return {
        isEvent: true,
        title: this.extractSimpleTitle(messageText),
        date: dateMatch ? dateMatch[1] : null,
        time: timeMatch ? timeMatch[0] : null,
        location: null,
        description: messageText,
        confidence: 0.6,
        originalMessage: messageText,
        extractedBy: 'fallback'
      };
    }
    
    return {
      isEvent: false,
      confidence: 0.8,
      extractedBy: 'fallback'
    };
  }

  extractSimpleTitle(message) {
    // Take first sentence or up to 50 characters
    const firstSentence = message.split('.')[0].split('!')[0].split('?')[0];
    return firstSentence.length > 50 ? 
           firstSentence.substring(0, 47) + '...' : 
           firstSentence.trim();
  }
}

module.exports = LLMService;
