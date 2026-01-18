"""
Tests for root and health check endpoints
"""
import pytest
from fastapi import status


def test_root_endpoint(client):
    """Test root endpoint returns API information"""
    response = client.get("/")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert "message" in data
    assert "version" in data
    assert "node_service_url" in data
    assert "active_nodes" in data
    assert "mongodb_connected" in data
    assert data["message"] == "Avesia Backend API"
    assert data["version"] == "1.0.0"


def test_health_endpoint(client):
    """Test health endpoint checks Node.js service status"""
    response = client.get("/health")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert "status" in data
    assert "node_service_status" in data
    assert "results_count" in data
    assert "mongodb_connected" in data
    assert data["status"] == "ok"
    assert "results_count" in data


def test_api_health_endpoint(client):
    """Test API health endpoint checks MongoDB status"""
    response = client.get("/api/health")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert "status" in data
    assert "message" in data
    assert "mongodb_status" in data
    assert "node_service_url" in data
    assert data["status"] == "OK"
    assert data["message"] == "Server is running"

