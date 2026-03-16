import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { AITaskPlan, BrowserAction } from "@/types";

export class NovaService {
  private client: BedrockRuntimeClient;
  private modelId = "us.amazon.nova-lite-v1:0";

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }

  async planTask(userCommand: string): Promise<AITaskPlan> {
    const prompt = this.buildPlanningPrompt(userCommand);

    try {
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: [{ text: prompt }],
            },
          ],
          inferenceConfig: {
            max_new_tokens: 4000,
            temperature: 0.3,
            top_p: 0.9,
          },
        }),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(
        new TextDecoder().decode(response.body)
      );

      const responseText = responseBody.output.message.content[0].text;
      console.log("Nova AI response received, parsing...");

      const plan = this.parseTaskPlan(responseText, userCommand);

      // Always return a valid plan
      if (!plan || !plan.intent) {
        console.log("Invalid plan from AI, using fallback");
        return this.getFallbackPlan(userCommand);
      }

      console.log("AI plan successfully created:", plan.intent);
      return plan;

    } catch (error: any) {
      console.error("Error calling Nova:", error.message || error);
      console.log("Using fallback plan due to API error");
      return this.getFallbackPlan(userCommand);
    }
  }

  private buildPlanningPrompt(command: string): string {
    return `You are an AI agent. Create a JSON plan for this task: "${command}"

Return ONLY valid JSON with this exact format (no extra text, no explanations):

{"intent":"short description","steps":["step1","step2"],"actions":[{"type":"navigate","url":"https://site.com/search?q=query"},{"type":"wait","waitFor":3000},{"type":"scroll"},{"type":"extract","selector":".result"}],"estimatedTime":"1-2 min"}

CRITICAL RULES - MUST FOLLOW:
1. Return ONLY the JSON object, nothing else
2. Use double quotes everywhere
3. NO newlines inside strings - keep everything on one line
4. NO trailing commas
5. URLs must be COMPLETE with full domain AND search parameters
6. Use DIRECT SEARCH URLs - do NOT try to fill forms or type in search boxes
7. Keep all strings short and on single line
8. Use simple CSS selectors like .class or [data-test="id"]
9. Close all strings properly

IMPORTANT EXAMPLES:

For JOB searches, use Indeed with direct URL:
{"intent":"Find React jobs","steps":["Load job results","Extract listings"],"actions":[{"type":"navigate","url":"https://www.indeed.com/jobs?q=React+Developer&l=Remote"},{"type":"wait","waitFor":3000},{"type":"scroll"},{"type":"extract","selector":".job"}],"estimatedTime":"1 min"}

For PRODUCT searches, use Amazon with direct URL:
{"intent":"Find iPhone prices","steps":["Load products","Extract prices"],"actions":[{"type":"navigate","url":"https://www.amazon.in/s?k=iPhone+15"},{"type":"wait","waitFor":3000},{"type":"scroll"},{"type":"extract","selector":".s-result-item"}],"estimatedTime":"1 min"}

For FLIGHT searches, use Kayak with direct URL:
{"intent":"Find flights","steps":["Load flight results","Extract options"],"actions":[{"type":"navigate","url":"https://www.kayak.com/flights/NYC-LAX"},{"type":"wait","waitFor":5000},{"type":"scroll"},{"type":"extract","selector":".flight"}],"estimatedTime":"2 min"}

DO NOT use type or click actions - ONLY use navigate with complete search URLs, then wait, scroll, and extract.`;
  }

  private parseTaskPlan(response: string, originalCommand: string): AITaskPlan {
    try {
      // Extract JSON using a more sophisticated method
      const jsonString = this.extractJson(response);

      if (jsonString) {
        // Check for newlines in the original
        const hasNewlines = /[\r\n]/.test(jsonString);
        if (hasNewlines) {
          console.log("⚠ Original JSON contains newlines, cleaning...");
        }

        // Clean up common JSON issues
        const cleanedJson = this.cleanJsonString(jsonString);

        // Verify newlines are gone
        const stillHasNewlines = /[\r\n]/.test(cleanedJson);
        if (stillHasNewlines) {
          console.log("⚠ Warning: Cleaned JSON still has newlines!");
        }

        // Debug: Log cleaned JSON
        console.log("Cleaned JSON (first 300 chars):", cleanedJson.substring(0, 300));

        // Check for unmatched quotes
        const quoteCount = (cleanedJson.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
          console.log(`⚠ Odd number of quotes (${quoteCount}), may have unclosed string`);
        }

        // Try to parse
        let parsed;
        try {
          parsed = JSON.parse(cleanedJson);
        } catch (parseError: any) {
          console.error("JSON parse failed:", parseError.message);
          console.log("Problematic JSON around error position:");

          // Show the area around the error
          const errorPos = parseError.message.match(/position (\d+)/);
          if (errorPos) {
            const pos = parseInt(errorPos[1]);
            const start = Math.max(0, pos - 50);
            const end = Math.min(cleanedJson.length, pos + 50);
            console.log(cleanedJson.substring(start, end));
          }

          // Try one more aggressive cleaning attempt
          console.log("Attempting aggressive JSON repair...");
          const repairedJson = this.aggressiveJsonRepair(cleanedJson);
          try {
            parsed = JSON.parse(repairedJson);
            console.log("✓ Aggressive repair succeeded!");
          } catch (repairError) {
            console.error("✗ Aggressive repair also failed");
            throw parseError; // Throw original error
          }
        }

        // Validate and return
        if (parsed && typeof parsed === 'object') {
          return {
            intent: parsed.intent || originalCommand,
            steps: Array.isArray(parsed.steps) ? parsed.steps : [],
            requiredActions: Array.isArray(parsed.actions) ? parsed.actions : [],
            estimatedTime: parsed.estimatedTime || "Unknown",
          };
        }
      }
    } catch (error: any) {
      console.error("Error parsing AI response:", error.message);
    }

    console.log("Using fallback plan for:", originalCommand);
    return this.getFallbackPlan(originalCommand);
  }

  private extractJson(text: string): string | null {
    // Find the first opening brace
    const startIndex = text.indexOf('{');
    if (startIndex === -1) return null;

    // Track brace depth to find the matching closing brace
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            // Found the matching closing brace
            return text.substring(startIndex, i + 1);
          }
        }
      }
    }

    return null;
  }

  private cleanJsonString(jsonString: string): string {
    // Step 1: Remove ALL newlines and tabs first (everywhere, not just in strings)
    let cleaned = jsonString.replace(/[\r\n\t]/g, ' ');

    // Step 2: Remove trailing commas before closing braces/brackets
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    // Step 3: Remove comments (// and /* */)
    cleaned = cleaned.replace(/\/\/.*/g, '');
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    // Step 4: Collapse multiple spaces into single space
    cleaned = cleaned.replace(/\s+/g, ' ');

    // Step 5: Remove spaces around structural characters (outside strings)
    let final = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escapeNext) {
        final += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        final += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        final += char;
        continue;
      }

      // Keep everything inside strings as-is
      if (inString) {
        final += char;
      } else {
        // Outside strings: remove unnecessary spaces around structural chars
        const nextChar = i < cleaned.length - 1 ? cleaned[i + 1] : '';
        const prevChar = i > 0 ? cleaned[i - 1] : '';

        if (char === ' ') {
          // Keep space only if it's between alphanumeric characters
          if (/[\w"]/.test(prevChar) && /[\w"]/.test(nextChar)) {
            final += char;
          }
          // Skip spaces around structural characters
        } else {
          final += char;
        }
      }
    }

    // Step 6: Ensure commas after arrays/objects
    final = final.replace(/\](\s*)"/g, '],"');
    final = final.replace(/\}(\s*)"/g, '},"');
    final = final.replace(/\](\s*)\{/g, '],{');
    final = final.replace(/\}(\s*)\{/g, '},{');

    // Step 7: Replace single quotes with double quotes (if they're wrapping strings)
    final = final.replace(/'([^']*?)'/g, '"$1"');

    return final.trim();
  }

  private aggressiveJsonRepair(jsonString: string): string {
    console.log("Starting aggressive repair...");

    // Step 1: Fix broken strings with newlines inside them
    let repaired = '';
    let inString = false;
    let currentString = '';

    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      const prevChar = i > 0 ? jsonString[i - 1] : '';

      // Track if we're in a string (not escaped quote)
      if (char === '"' && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          currentString = '';
          repaired += char;
        } else {
          // Check if current string looks like incomplete URL
          if (this.isIncompleteUrl(currentString)) {
            console.log("Found incomplete URL:", currentString);
            // Complete the URL with a placeholder
            repaired += this.completeUrl(currentString);
          }
          inString = false;
          currentString = '';
          repaired += char;
        }
        continue;
      }

      // If we're inside a string, replace newlines with spaces
      if (inString) {
        if (char === '\n' || char === '\r') {
          repaired += ' ';
          currentString += ' ';
        } else if (char === '\t') {
          repaired += ' ';
          currentString += ' ';
        } else {
          repaired += char;
          currentString += char;
        }
      } else {
        // Outside strings, just copy
        repaired += char;
      }
    }

    // If we ended while in a string, try to complete it if it's a URL
    if (inString) {
      console.log("Found unclosed string:", currentString);
      if (this.isIncompleteUrl(currentString)) {
        console.log("Completing incomplete URL");
        repaired += this.completeUrl(currentString);
      }
      repaired += '"';
    }

    // Step 2: Collapse multiple spaces
    repaired = repaired.replace(/\s+/g, ' ');

    // Step 3: Remove any trailing commas
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    // Step 4: Insert missing commas
    // e.g. "]"actions" -> ],"actions"
    repaired = repaired.replace(/\](\s*)"(?=[a-zA-Z])/g, '],$1"');
    // e.g. }"key" -> },"key"
    repaired = repaired.replace(/\}(\s*)"(?=[a-zA-Z])/g, '},$1"');

    // Step 5: Ensure proper closing braces/brackets
    const openBraces = (repaired.match(/\{/g) || []).length;
    let closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    let closeBrackets = (repaired.match(/\]/g) || []).length;

    while (closeBraces < openBraces) {
      repaired += '}';
      closeBraces++;
    }
    while (closeBrackets < openBrackets) {
      repaired += ']';
      closeBrackets++;
    }

    console.log("Repaired JSON (first 300 chars):", repaired.substring(0, 300));

    return repaired.trim();
  }

  private isIncompleteUrl(text: string): boolean {
    // Check if string looks like an incomplete URL
    const trimmed = text.trim();
    return (
      trimmed.endsWith('http:') ||
      trimmed.endsWith('https:') ||
      trimmed.endsWith('http://') ||
      trimmed.endsWith('https://') ||
      trimmed.endsWith('www.') ||
      trimmed.endsWith('www') ||
      (trimmed.startsWith('http') && !trimmed.includes('.'))
    );
  }

  private completeUrl(incomplete: string): string {
    // Complete incomplete URLs with a placeholder
    const trimmed = incomplete.trim();

    if (trimmed.endsWith('http:') || trimmed.endsWith('https:')) {
      return trimmed + '//example.com';
    }

    if (trimmed.endsWith('http://') || trimmed.endsWith('https://')) {
      return trimmed + 'example.com';
    }

    if (trimmed.endsWith('www.') || trimmed.endsWith('www')) {
      return 'https://www.example.com';
    }

    // If it starts with http but has no domain
    if (trimmed.startsWith('http') && !trimmed.includes('.')) {
      return 'https://example.com';
    }

    return trimmed;
  }

  private getFallbackPlan(command: string): AITaskPlan {
    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes("flight")) {
      // Extract origin and destination from command
      let origin = "New York";
      let destination = "Los Angeles";

      // Try to extract from "from X to Y" pattern
      const fromToMatch = lowerCommand.match(/from\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s|$)/i);
      if (fromToMatch) {
        origin = fromToMatch[1].trim();
        destination = fromToMatch[2].trim();
      }

      // Use Google Flights with direct search URL (no form filling needed)
      // Google Flights doesn't support direct search URLs easily, so use Kayak instead
      const originQuery = encodeURIComponent(origin);
      const destQuery = encodeURIComponent(destination);
      const kayakUrl = `https://www.kayak.com/flights/${originQuery}-${destQuery}`;

      return {
        intent: "Find and compare flight options",
        steps: [
          "Navigate to flight search results",
          "Wait for flights to load",
          "Extract flight options with prices",
        ],
        requiredActions: [
          { type: "navigate", url: kayakUrl },
          { type: "wait", waitFor: 5000 },
          { type: "scroll" },
          { type: "extract", selector: ".flight" },
        ],
        estimatedTime: "2-3 minutes",
      };
    }

    if (lowerCommand.includes("job")) {
      // Extract job title and location from command
      let jobTitle = "Developer";
      let location = "Remote";

      // Try to extract job title
      const jobMatch = lowerCommand.match(/find\s+(?:a\s+)?(.+?)\s+job/i);
      if (jobMatch) {
        jobTitle = jobMatch[1].trim();
      }

      // Try to extract location
      const locationMatch = lowerCommand.match(/in\s+([a-z\s]+)(?:\s|$)/i);
      if (locationMatch) {
        location = locationMatch[1].trim();
      }

      // Use Indeed with direct search URL (no form filling needed)
      const searchQuery = encodeURIComponent(jobTitle);
      const locationQuery = encodeURIComponent(location);
      const indeedUrl = `https://www.indeed.com/jobs?q=${searchQuery}&l=${locationQuery}`;

      return {
        intent: "Find and apply to relevant job postings",
        steps: [
          "Navigate to job search results",
          "Wait for page to load",
          "Extract job listings",
        ],
        requiredActions: [
          { type: "navigate", url: indeedUrl },
          { type: "wait", waitFor: 3000 },
          { type: "scroll" },
          { type: "extract", selector: ".job" },
        ],
        estimatedTime: "1-2 minutes",
      };
    }

    if (lowerCommand.includes("iphone") || lowerCommand.includes("phone") || lowerCommand.includes("price") || lowerCommand.includes("product") || lowerCommand.includes("buy")) {
      // Extract product name from command
      let productName = "iPhone 15";

      // Try to extract product name more intelligently
      const findMatch = lowerCommand.match(/find\s+(.+?)(?:\s+(?:on|in|from|price)|\s*$)/i);
      if (findMatch) {
        productName = findMatch[1].trim();
      } else if (lowerCommand.includes("iphone")) {
        const iphoneMatch = lowerCommand.match(/iphone\s*\d*/i);
        if (iphoneMatch) {
          productName = iphoneMatch[0];
        }
      }

      // Use Amazon direct search URL (no form filling needed)
      const searchQuery = encodeURIComponent(productName);
      const amazonUrl = `https://www.amazon.in/s?k=${searchQuery}`;

      return {
        intent: "Find the best price for a product",
        steps: [
          "Navigate to product search results",
          "Wait for page to load",
          "Extract product listings with prices",
        ],
        requiredActions: [
          { type: "navigate", url: amazonUrl },
          { type: "wait", waitFor: 3000 },
          { type: "scroll" },
          { type: "extract", selector: ".s-result-item" },
        ],
        estimatedTime: "1-2 minutes",
      };
    }

    return {
      intent: "Execute user's web automation request",
      steps: [
        "Understand the task requirements",
        "Navigate to relevant websites",
        "Perform required actions",
        "Extract and process data",
        "Return results to user",
      ],
      requiredActions: [
        { type: "navigate", url: "https://www.google.com" },
        { type: "type", selector: 'input[name="q"]', value: command },
        { type: "click", selector: 'input[value="Google Search"]' },
        { type: "extract", selector: "#search" },
      ],
      estimatedTime: "1-2 minutes",
    };
  }
}

export const novaService = new NovaService();
