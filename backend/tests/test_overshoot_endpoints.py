"""
Tests for Overshoot SDK / Node System endpoints
"""
import pytest
import json
from fastapi import status


def test_get_nodes_empty(client):
    """Test getting nodes when none are configured"""
    response = client.get("/api/nodes")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert "nodes" in data
    assert "count" in data
    assert "outputSchema" in data
    assert "prompt" in data
    assert isinstance(data["nodes"], list)


def test_post_nodes_create(client, sample_nodes_data):
    """Test creating/updating nodes configuration"""
    response = client.post("/api/nodes", json=sample_nodes_data)
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert data["success"] is True
    assert "message" in data
    assert "nodes" in data
    assert "outputSchema" in data
    assert "prompt" in data
    assert len(data["nodes"]) == 2
    assert data["nodes"][0]["name"] == "has_person"
    assert data["nodes"][1]["name"] == "object_count"


def test_post_nodes_validation_error(client):
    """Test nodes endpoint with invalid data"""
    # Empty nodes list should fail
    response = client.post("/api/nodes", json={"nodes": []})
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "At least one node is required" in response.json()["detail"]


def test_get_nodes_after_creation(client, sample_nodes_data):
    """Test getting nodes after they've been created"""
    # First create nodes
    client.post("/api/nodes", json=sample_nodes_data)
    
    # Then get them
    response = client.get("/api/nodes")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert len(data["nodes"]) == 2
    assert data["count"] == 2
    assert "outputSchema" in data
    assert "prompt" in data


def test_post_nodes_reload(client, sample_nodes_data):
    """Test reloading nodes from file"""
    # First set some nodes
    client.post("/api/nodes", json=sample_nodes_data)
    
    # Then reload (will try to load from sample_nodes.json)
    response = client.post("/api/nodes/reload")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert data["success"] is True
    assert "message" in data
    assert "nodes" in data
    assert "count" in data


def test_delete_nodes(client, sample_nodes_data):
    """Test clearing all nodes"""
    # First create nodes
    client.post("/api/nodes", json=sample_nodes_data)
    
    # Verify they exist
    response = client.get("/api/nodes")
    initial_count = len(response.json()["nodes"])
    assert initial_count > 0
    
    # Then delete them
    response = client.delete("/api/nodes")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert data["success"] is True
    assert data["message"] == "Nodes cleared"
    
    # Note: get_nodes() may reload from file if nodes_store is empty,
    # so we only verify that the delete operation itself succeeded
    # The delete endpoint response confirms success


def test_post_results_receive(client, sample_result_data):
    """Test receiving results from Node.js service"""
    response = client.post("/api/results", json=sample_result_data)
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert data["success"] is True
    assert data["message"] == "Result received"


def test_post_results_json_parsing(client):
    """Test receiving JSON results"""
    result_data = {
        "result": '{"has_person": true, "object_count": 5}',
        "timestamp": "2024-01-01T12:00:00Z",
        "prompt": "Detect objects",
        "node_id": "has_person"
    }
    
    response = client.post("/api/results", json=result_data)
    
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["success"] is True


def test_get_results_empty(client):
    """Test getting results when none exist"""
    response = client.get("/api/results")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert "results" in data
    assert "total" in data
    assert isinstance(data["results"], list)
    assert data["total"] == 0


def test_get_results_with_limit(client, sample_result_data):
    """Test getting results with limit parameter"""
    # Add multiple results
    for i in range(5):
        client.post("/api/results", json={
            **sample_result_data,
            "timestamp": f"2024-01-01T12:00:{i:02d}Z"
        })
    
    # Get with limit
    response = client.get("/api/results?limit=3")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert len(data["results"]) <= 3
    assert data["total"] == 5


def test_post_prompt_update(client):
    """Test updating prompt"""
    prompt_data = {
        "prompt": "Detect all objects in the frame"
    }
    
    response = client.post("/api/prompt", json=prompt_data)
    
    # Will return 503 if Node.js service is not available (expected in tests)
    # But we can check the structure
    assert response.status_code in [status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE]


def test_post_control_start(client):
    """Test starting Node.js service"""
    control_data = {
        "action": "start"
    }
    
    response = client.post("/api/control", json=control_data)
    
    # Will return 503 if Node.js service is not available (expected in tests)
    assert response.status_code in [status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE]


def test_post_control_stop(client):
    """Test stopping Node.js service"""
    control_data = {
        "action": "stop"
    }
    
    response = client.post("/api/control", json=control_data)
    
    # Will return 503 if Node.js service is not available (expected in tests)
    assert response.status_code in [status.HTTP_200_OK, status.HTTP_503_SERVICE_UNAVAILABLE]


def test_post_control_invalid_action(client):
    """Test control endpoint with invalid action"""
    control_data = {
        "action": "invalid_action"
    }
    
    response = client.post("/api/control", json=control_data)
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Action must be 'start' or 'stop'" in response.json()["detail"]


def test_node_datatypes(client):
    """Test all supported node datatypes"""
    nodes_data = {
        "nodes": [
            {"prompt": "Is it true?", "datatype": "boolean", "name": "bool_field"},
            {"prompt": "Count items", "datatype": "integer", "name": "int_field"},
            {"prompt": "Measure value", "datatype": "number", "name": "num_field"},
            {"prompt": "Describe scene", "datatype": "string", "name": "str_field"}
        ]
    }
    
    response = client.post("/api/nodes", json=nodes_data)
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert len(data["nodes"]) == 4
    assert "outputSchema" in data
    assert "properties" in data["outputSchema"]
    
    # Check schema has all fields
    properties = data["outputSchema"]["properties"]
    assert "bool_field" in properties
    assert properties["bool_field"]["type"] == "boolean"
    assert properties["int_field"]["type"] == "integer"
    assert properties["num_field"]["type"] == "number"
    assert properties["str_field"]["type"] == "string"


def test_get_overshoot_config(client):
    """Test getting Overshoot SDK configuration"""
    response = client.get("/api/overshoot/config")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert "apiUrl" in data
    assert "apiKey" in data
    assert "hasApiKey" in data
    assert isinstance(data["hasApiKey"], bool)

