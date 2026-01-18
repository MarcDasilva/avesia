# Avesia Backend API Tests

Comprehensive test suite for all API endpoints in the Avesia Backend.

## Test Structure

```
tests/
├── __init__.py              # Test package initialization
├── conftest.py              # Pytest fixtures and configuration
├── test_health_endpoints.py # Root and health check endpoints
├── test_overshoot_endpoints.py # Overshoot SDK/Node system endpoints
├── test_project_endpoints.py  # Project management endpoints
└── README.md                # This file
```

## Test Coverage

### Health Endpoints
- `GET /` - Root endpoint
- `GET /health` - Health check (Node.js service)
- `GET /api/health` - Health check (MongoDB)

### Overshoot SDK / Node System Endpoints
- `GET /api/nodes` - Get nodes configuration
- `POST /api/nodes` - Create/update nodes
- `POST /api/nodes/reload` - Reload nodes from file
- `DELETE /api/nodes` - Clear nodes
- `POST /api/results` - Receive results
- `GET /api/results` - Get recent results
- `POST /api/prompt` - Update prompt
- `POST /api/control` - Control Node.js service

### Project Management Endpoints
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

## Setup

1. Install test dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Run tests:
```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_project_endpoints.py

# Run specific test
pytest tests/test_project_endpoints.py::test_create_project_success

# Run with coverage report
pytest --cov=main --cov-report=html
```

## Test Fixtures

### `client`
FastAPI TestClient with mocked dependencies:
- Mocked MongoDB database (mongomock)
- Mocked Node.js service calls

### `sample_user_id`
Sample user ID for testing: `"test_user_123"`

### `sample_project_data`
Sample project data:
```json
{
  "name": "Test Project"
}
```

### `sample_nodes_data`
Sample nodes configuration:
```json
{
  "nodes": [
    {
      "prompt": "Is there a person in the frame?",
      "datatype": "boolean",
      "name": "has_person"
    },
    {
      "prompt": "Count the number of objects",
      "datatype": "integer",
      "name": "object_count"
    }
  ]
}
```

### `sample_result_data`
Sample result data from Node.js service

### `mock_db`
Mock MongoDB database using mongomock

## Running Tests

### All Tests
```bash
pytest
```

### Specific Category
```bash
# Health endpoints only
pytest tests/test_health_endpoints.py

# Overshoot endpoints only
pytest tests/test_overshoot_endpoints.py

# Project endpoints only
pytest tests/test_project_endpoints.py
```

### With Output
```bash
# Verbose output
pytest -v

# Show print statements
pytest -s

# Stop on first failure
pytest -x
```

### Coverage
```bash
# Install coverage tool
pip install pytest-cov

# Run with coverage
pytest --cov=main --cov-report=term-missing

# Generate HTML coverage report
pytest --cov=main --cov-report=html
```

## Test Notes

1. **MongoDB**: Tests use `mongomock` to mock MongoDB without requiring a real database connection
2. **Node.js Service**: Tests mock HTTP calls to the Node.js service (expected to be unavailable in test environment)
3. **Isolation**: Each test is isolated and cleans up state automatically
4. **Authentication**: Project endpoints require `X-User-Id` header; tests include this automatically via fixtures

## Expected Behavior

- Tests should pass even without MongoDB or Node.js service running
- All tests use mocked dependencies
- Tests verify both success and error cases
- Tests verify proper authentication/authorization
- Tests verify data validation

## Troubleshooting

### Import Errors
If you get import errors, make sure you're running tests from the `backend/` directory:
```bash
cd backend
pytest
```

### Missing Dependencies
Install all dependencies:
```bash
pip install -r requirements.txt
```

### MongoDB Connection Errors
Tests use `mongomock`, so a real MongoDB connection is not required. If you see connection errors, check that `conftest.py` is properly setting up the mock.

