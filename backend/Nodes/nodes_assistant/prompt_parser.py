"""
Prompt Parser - Uses Gemini to parse natural language prompts into node configurations
Takes user input and returns structured JSON for listener, conditions, and events
"""

import os
import json
from typing import Dict, Any
from google import genai
from dotenv import load_dotenv
import sys

# Add parent directory to path to import node_options
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from node_options import ConditionOptions, ListenerOptions, EventOptions

load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)
else:
    client = None
    print("⚠️  Warning: GEMINI_API_KEY not found in environment variables")


SYSTEM_PROMPT = f"""You are a smart assistant that converts natural language automation requests into structured node configurations.

USER INPUT: A natural language description of what they want to monitor and what actions to take.

YOUR TASK: Parse the input and return a JSON structure with listener(s), condition(s), and event(s).

AVAILABLE OPTIONS:
Listener Types:
{json.dumps(ListenerOptions.OPTIONS, indent=2)}

Condition Types:
{json.dumps(ConditionOptions.OPTIONS, indent=2)}

Event Types:
{json.dumps(EventOptions.OPTIONS, indent=2)}

OUTPUT FORMAT (return ONLY valid JSON, no markdown):
{{
  "listeners": [
    {{
      "name": "descriptive_name",
      "type": "one of the listener types from the list above"
    }}
  ],
  "conditions": [
    {{
      "name": "descriptive_name",
      "type": "one of the condition types from the list above",
      "value": "<optional string value>"
    }}
  ],
  "events": [
    {{
      "action": "descriptive_action_name",
      "type": "one of the event types from the list above",
      "recipient": "<optional email/phone>",
      "message": "<optional message text>",
      "duration": "<optional duration like 30s, 5m>",
      "priority": "<optional: low/medium/high>"
    }}
  ]
}}

PARSING RULES:
1. **Listeners**: Identify WHAT to monitor/detect
   - "detect motion" → motion listener
   - "watch for cars" → object listener
   - "monitor temperature" → custom listener with sensor type
   - "recognize faces" → face listener

2. **Conditions**: Identify WHEN or UNDER WHAT CIRCUMSTANCES
   - "at night" → lighting condition (day/night/low-light)
   - "when temperature exceeds 75" → custom condition with threshold
   - "during business hours" → time condition
   - "in the parking lot" → zone condition
   - "if it rains" → weather condition

3. **Events**: Identify WHAT ACTIONS to take
   - "send email" → Email event
   - "send text" → Text event
   - "notify security team" → Email event with recipient
   - "record video" → custom event with action details

4. **Multiple Items**: If the user describes multiple scenarios, create multiple listeners/conditions/events

5. **Smart Matching**: Match user descriptions to the closest available option from the lists above

EXAMPLES:

Input: "Alert me via email when motion is detected at night"
Output:
{{
  "listeners": [
    {{"name": "motion_detector", "type": "motion"}}
  ],
  "conditions": [
    {{"name": "nighttime", "type": "lighting: day/night/low-light", "value": "night"}}
  ],
  "events": [
    {{"action": "send_alert", "type": "Email", "message": "Motion detected at night"}}
  ]
}}

Input: "Send me a text when someone's face is recognized at the front door during business hours"
Output:
{{
  "listeners": [
    {{"name": "face_recognition", "type": "face (known / unknown)"}}
  ],
  "conditions": [
    {{"name": "business_hours", "type": "time"}},
    {{"name": "front_door_zone", "type": "zone"}}
  ],
  "events": [
    {{"action": "send_notification", "type": "Text", "message": "Face recognized at front door"}}
  ]
}}

Input: "If temperature goes above 75 degrees, send a high priority alert and turn on cooling for 15 minutes"
Output:
{{
  "listeners": [
    {{"name": "temperature_monitor", "type": "custom_prompt (natural language)"}}
  ],
  "conditions": [
    {{"name": "high_temperature", "type": "custom", "threshold": 75.0}}
  ],
  "events": [
    {{"action": "send_alert", "type": "Email", "priority": "high", "message": "Temperature exceeded 75°"}},
    {{"action": "activate_cooling", "type": "custom", "duration": "15m"}}
  ]
}}

Now parse the user's input and return ONLY the JSON output."""


def parse_prompt_with_gemini(user_prompt: str) -> Dict[str, Any]:
    """
    Parse a natural language prompt into structured node configuration.
    
    Args:
        user_prompt: Natural language description of automation request
        
    Returns:
        Dictionary with listeners, conditions, and events structure
    """
    if not client:
        raise ValueError("GEMINI_API_KEY not configured. Please set it in your .env file.")
    
    try:
        # Send to Gemini
        response = client.models.generate_content(
            model='models/gemini-2.5-flash',
            contents=f"{SYSTEM_PROMPT}\n\nUSER INPUT:\n{user_prompt}"
        )
        
        # Parse response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parse JSON
        result = json.loads(response_text)
        
        # Validate structure
        if "listeners" not in result:
            result["listeners"] = []
        if "conditions" not in result:
            result["conditions"] = []
        if "events" not in result:
            result["events"] = []
        
        print(f"✅ Parsed prompt successfully")
        print(f"   Listeners: {len(result['listeners'])}")
        print(f"   Conditions: {len(result['conditions'])}")
        print(f"   Events: {len(result['events'])}")
        
        return result
        
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse Gemini response as JSON: {e}")
        print(f"Response was: {response_text[:500]}...")
        raise
    except Exception as e:
        print(f"❌ Error processing with Gemini: {e}")
        raise


def parse_prompt(user_prompt: str) -> Dict[str, Any]:
    """
    Main function to parse user prompt.
    Alias for parse_prompt_with_gemini for cleaner imports.
    """
    return parse_prompt_with_gemini(user_prompt)


if __name__ == "__main__":
    # Example usage
    print("="*70)
    print("PROMPT PARSER - Natural Language to Node Configuration")
    print("="*70)
    
    # Test examples
    test_prompts = [
        "Alert me via email when motion is detected at night",
        "Send me a text if a package is delivered to my front door",
        "Notify security team if someone is detected in the parking lot after hours",
        "If it's raining and someone approaches the door, send me an alert"
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        print(f"\n{'='*70}")
        print(f"TEST {i}: {prompt}")
        print('='*70)
        
        try:
            result = parse_prompt(prompt)
            print("\n📋 PARSED RESULT:")
            print(json.dumps(result, indent=2))
            
            # Save to file
            output_file = f"parsed_prompt_{i}.json"
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"\n💾 Saved to: {output_file}")
            
        except Exception as e:
            print(f"\n⚠️  Error: {e}")
        
        print()
