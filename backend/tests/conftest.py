"""
Pytest configuration and fixtures for testing Avesia Backend API
"""
import pytest
import os
import sys
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from pymongo import MongoClient
from pymongo.database import Database
import mongomock

# Add parent directory to path to import main
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set test environment variables before importing main
os.environ["MONGODB_URI"] = "mongodb://localhost:27017/test_avesia"
os.environ["DATABASE_NAME"] = "test_avesia"
os.environ["NODE_SERVICE_URL"] = "http://localhost:9999"  # Mock Node.js service
os.environ["FRONTEND_URL"] = "http://localhost:5173"
os.environ["PORT"] = "3001"

# Import main after setting env vars
# main.py will attempt to connect to MongoDB, but may fail (which is OK for tests)
# We'll mock db in fixtures to provide a working database
from main import app


@pytest.fixture
def mock_db():
    """Create a mock MongoDB database using mongomock"""
    mock_client = mongomock.MongoClient()
    return mock_client["test_avesia"]


@pytest.fixture
def mock_node_service():
    """Mock Node.js service responses"""
    with patch('main.send_nodes_to_nodejs', new_callable=AsyncMock) as mock:
        mock.return_value = True
        yield mock


@pytest.fixture
def client(mock_db, mock_node_service):
    """Create a test client with mocked dependencies"""
    # Patch the database connection in main module
    with patch('main.db', mock_db):
        # Patch Node.js service calls
        with patch('main.send_nodes_to_nodejs', new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            
            with patch('httpx.AsyncClient') as mock_client_class:
                # Mock HTTP client for Node.js service calls
                # Create a proper mock response object that mimics httpx.Response
                mock_response = MagicMock(spec=['status_code', 'raise_for_status', 'json', 'text'])
                mock_response.status_code = 200
                # raise_for_status is a regular method, not async - just returns None
                mock_response.raise_for_status = MagicMock(return_value=None)
                # json() is a regular method, not async - returns dict directly
                mock_response.json = MagicMock(return_value={"success": True})
                mock_response.text = ""
                
                # Create async client mock that properly handles context manager
                # Use AsyncMock for the client itself so it works as an async context manager
                mock_client = AsyncMock()
                # When used as context manager, it should return itself
                mock_client.__aenter__.return_value = mock_client
                mock_client.__aexit__.return_value = None
                # These methods are async and return the response
                mock_client.get = AsyncMock(return_value=mock_response)
                mock_client.post = AsyncMock(return_value=mock_response)
                
                mock_client_class.return_value = mock_client
                
                # Create test client
                test_client = TestClient(app)
                yield test_client


@pytest.fixture
def sample_user_id():
    """Sample user ID for testing"""
    return "test_user_123"


@pytest.fixture
def sample_project_data():
    """Sample project data for testing"""
    return {
        "name": "Test Project"
    }


@pytest.fixture
def sample_nodes_data():
    """Sample nodes data for testing"""
    return {
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


@pytest.fixture
def sample_result_data():
    """Sample result data for testing"""
    return {
        "result": '{"has_person": true, "object_count": 3}',
        "timestamp": "2024-01-01T12:00:00Z",
        "prompt": "Is there a person in the frame?",
        "node_id": "has_person"
    }


@pytest.fixture(autouse=True)
def cleanup_nodes_store():
    """Clean up nodes_store before and after each test"""
    from main import nodes_store, results_store
    nodes_store.clear()
    results_store.clear()
    yield
    nodes_store.clear()
    results_store.clear()

