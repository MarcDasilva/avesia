# Node Processing Module Documentation

## Overview

The `node_processing.py` module is responsible for converting listener node configurations into structured prompt strings. It takes the JSON output from the UserNodes system and transforms each listener into a simple, human-readable prompt format that combines the listener's goal with its associated conditions.

## Purpose

This module serves as a bridge between the node-based configuration system and the downstream processing pipeline. It simplifies complex listener-condition relationships into single-line prompts that are easier to process, log, and understand.

## Main Function

### `process_listeners(listeners_json: Dict[str, Any]) -> Dict[str, Any]`

Processes all listeners in the input JSON and generates prompt strings for each one.

#### Parameters

- **`listeners_json`** (`Dict[str, Any]`): The JSON output from `user_nodes.export_all()` containing:
  - `listeners`: Array of listener objects with their conditions and events
  - `total_listeners`: Count of total listeners

#### Returns

A dictionary with the following structure:

```json
{
  "nodes": [
    {
      "listener_id": "unique-listener-id",
      "prompt": "Goal: listener_name (type), Constraints: condition1; condition2"
    }
  ]
}
```

#### Processing Logic

1. **Extract Goal**: Combines listener name and type from `listener_data`
   - Format: `listener_name (listener_type)`
   - Example: `security_camera_alert (video_stream)`

2. **Extract Constraints**: Iterates through all conditions and builds constraint strings
   - Includes: `name`, `threshold`, and `type` from each condition
   - Multiple constraint components are joined with commas
   - Multiple conditions are joined with semicolons

3. **Build Prompt**: Combines goal and constraints into a single string
   - With constraints: `"Goal: {goal}, Constraints: {constraints}"`
   - Without constraints: `"Goal: {goal}, Constraints: none"`

## Input Format

The function expects JSON in the following format:

```json
{
  "listeners": [
    {
      "listener_id": "uuid-string",
      "listener_data": {
        "name": "listener_name",
        "type": "listener_type"
      },
      "conditions": [
        {
          "condition_id": "uuid-string",
          "condition_data": {
            "name": "condition_name",
            "threshold": 0.8,
            "type": "condition_type"
          }
        }
      ],
      "events": [...]
    }
  ],
  "total_listeners": 1
}
```

### Input Components

- **`listener_id`**: Unique identifier for the listener
- **`listener_data`**: Contains the listener's configuration
  - `name`: Descriptive name of what the listener does
  - `type`: Category or type of listener (e.g., camera, sensor, stream)
- **`conditions`**: Array of condition objects that constrain when the listener triggers
  - `name`: Condition identifier
  - `threshold`: Numeric threshold value (optional)
  - `type`: Type of condition (optional)
- **`events`**: Array of event objects (not used in prompt generation)

## Output Format

The function returns a simplified structure containing only the listener IDs and their generated prompts:

```json
{
  "nodes": [
    {
      "listener_id": "listener_1",
      "prompt": "Goal: security_camera_alert (video_stream), Constraints: nighttime, threshold: 0.7, type: time; motion_detected, threshold: 0.85, type: motion"
    }
  ]
}
```

### Output Components

- **`nodes`**: Array of processed listener objects
- **`listener_id`**: Original listener ID preserved from input
- **`prompt`**: Generated prompt string in "Goal/Constraints" format

## Usage Examples

### Basic Usage

```python
from node_processing import process_listeners

# Input data from user_nodes.export_all()
input_data = {
    "listeners": [
        {
            "listener_id": "abc-123",
            "listener_data": {
                "name": "motion_sensor",
                "type": "camera"
            },
            "conditions": [
                {
                    "condition_data": {
                        "name": "night_only",
                        "threshold": 0.8
                    }
                }
            ]
        }
    ],
    "total_listeners": 1
}

# Process the listeners
result = process_listeners(input_data)

# Output:
# {
#   "nodes": [
#     {
#       "listener_id": "abc-123",
#       "prompt": "Goal: motion_sensor (camera), Constraints: night_only, threshold: 0.8"
#     }
#   ]
# }
```

### Integration with UserNodes

```python
from user_nodes import UserNodes
from node_processing import process_listeners

# Create and configure nodes
user_nodes = UserNodes()
condition = user_nodes.create_condition(data={"name": "high_temp", "threshold": 75.0})
listener = user_nodes.create_listener(data={"name": "temp_monitor", "type": "sensor"})
user_nodes.link_condition_to_listener(condition.node_id, listener.node_id)

# Export to JSON
user_nodes.export_all("nodes_export.json")

# Load and process
with open("nodes_export.json", 'r') as f:
    export_data = json.load(f)

processed = process_listeners(export_data)
print(processed)
```

### Multiple Conditions Example

```python
input_data = {
    "listeners": [
        {
            "listener_id": "xyz-789",
            "listener_data": {
                "name": "security_alert",
                "type": "video_stream"
            },
            "conditions": [
                {
                    "condition_data": {
                        "name": "nighttime",
                        "threshold": 0.7,
                        "type": "time"
                    }
                },
                {
                    "condition_data": {
                        "name": "motion_detected",
                        "threshold": 0.85,
                        "type": "motion"
                    }
                }
            ]
        }
    ]
}

result = process_listeners(input_data)
# Output prompt: "Goal: security_alert (video_stream), Constraints: nighttime, threshold: 0.7, type: time; motion_detected, threshold: 0.85, type: motion"
```

## Prompt Format Specification

### Goal Section

- **Format**: `Goal: {listener_name} ({listener_type})`
- **Rules**:
  - If `type` is present, it's included in parentheses
  - If `type` is absent, only the name is used
  - If `name` is missing, defaults to "detection"

### Constraints Section

- **Format**: `Constraints: {constraint1}; {constraint2}; ...`
- **Rules**:
  - Individual constraint components are joined with commas: `name, threshold: X, type: Y`
  - Multiple conditions are separated by semicolons
  - If no conditions exist: `Constraints: none`
  - Optional fields (`threshold`, `type`) are only included if present

### Complete Prompt Format

```
Goal: {listener_name} ({listener_type}), Constraints: {constraint1_name}, threshold: {value}, type: {type}; {constraint2_name}, threshold: {value}
```

## Technical Details

### Dependencies

- `json`: For JSON handling
- `typing`: For type hints (`Dict`, `List`, `Any`)

### Performance Considerations

- **Time Complexity**: O(n × m) where n is the number of listeners and m is the average number of conditions per listener
- **Space Complexity**: O(n) for the output array
- **No External API Calls**: Pure string concatenation, no network latency

### Error Handling

The function is designed to be fault-tolerant:
- Missing fields default to empty strings or "detection"
- Optional fields (`threshold`, `type`) are gracefully skipped if not present
- Empty conditions result in "Constraints: none"

## Testing

Run the built-in test:

```bash
python node_processing.py
```

This executes the `__main__` block with sample data and prints the output.

## Integration Points

### Upstream

- **Input Source**: `user_nodes.export_all()` from `user_nodes.py`
- **Data Flow**: UserNodes → JSON export → process_listeners

### Downstream

- **Output Consumers**: Can be used by vision AI systems, logging modules, or notification systems
- **Format**: Simple JSON structure with listener IDs and human-readable prompts

## Future Enhancements

Potential improvements to consider:

1. **Custom Prompt Templates**: Allow users to define custom prompt formats
2. **Validation**: Add JSON schema validation for input data
3. **Async Support**: Add async version for processing large batches
4. **Localization**: Support multiple languages for prompt generation
5. **Prompt Optimization**: Add AI-based prompt enhancement (optional)

## Version History

- **v1.0**: Initial release with basic goal/constraint prompt generation
- Removed Gemini AI dependency for simplicity and speed
- Pure string concatenation approach for deterministic output
