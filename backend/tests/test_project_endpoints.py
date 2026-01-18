"""
Tests for Project Management endpoints
"""
import pytest
from fastapi import status
from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime


def test_get_projects_no_auth(client):
    """Test getting projects without authentication"""
    response = client.get("/api/projects")
    
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "User ID required" in response.json()["detail"]


def test_get_projects_empty(client, sample_user_id):
    """Test getting projects when user has none"""
    response = client.get(
        "/api/projects",
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


def test_create_project_success(client, sample_user_id, sample_project_data, mock_db):
    """Test creating a project successfully"""
    response = client.post(
        "/api/projects",
        json=sample_project_data,
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    
    assert "id" in data
    assert data["userId"] == sample_user_id
    assert data["name"] == sample_project_data["name"]
    assert "createdAt" in data
    assert "updatedAt" in data


def test_create_project_no_auth(client, sample_project_data):
    """Test creating project without authentication"""
    response = client.post(
        "/api/projects",
        json=sample_project_data
    )
    
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "User ID required" in response.json()["detail"]


def test_create_project_empty_name(client, sample_user_id):
    """Test creating project with empty name"""
    response = client.post(
        "/api/projects",
        json={"name": ""},
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Project name is required" in response.json()["detail"]


def test_create_project_whitespace_name(client, sample_user_id):
    """Test creating project with whitespace-only name"""
    response = client.post(
        "/api/projects",
        json={"name": "   "},
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Project name is required" in response.json()["detail"]


def test_get_projects_after_creation(client, sample_user_id, sample_project_data, mock_db):
    """Test getting projects after creating one"""
    # Create a project
    create_response = client.post(
        "/api/projects",
        json=sample_project_data,
        headers={"X-User-Id": sample_user_id}
    )
    project_id = create_response.json()["id"]
    
    # Get all projects
    response = client.get(
        "/api/projects",
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_200_OK
    projects = response.json()
    
    assert len(projects) == 1
    assert projects[0]["id"] == project_id
    assert projects[0]["name"] == sample_project_data["name"]


def test_get_project_by_id(client, sample_user_id, sample_project_data, mock_db):
    """Test getting a specific project by ID"""
    # Create a project
    create_response = client.post(
        "/api/projects",
        json=sample_project_data,
        headers={"X-User-Id": sample_user_id}
    )
    project_id = create_response.json()["id"]
    
    # Get the project
    response = client.get(
        f"/api/projects/{project_id}",
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_200_OK
    project = response.json()
    
    assert project["id"] == project_id
    assert project["name"] == sample_project_data["name"]


def test_get_project_not_found(client, sample_user_id):
    """Test getting a non-existent project"""
    fake_id = str(ObjectId())
    
    response = client.get(
        f"/api/projects/{fake_id}",
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "Project not found" in response.json()["detail"]


def test_get_project_wrong_user(client, sample_user_id, sample_project_data, mock_db):
    """Test getting a project belonging to another user"""
    # Create project for user 1
    create_response = client.post(
        "/api/projects",
        json=sample_project_data,
        headers={"X-User-Id": sample_user_id}
    )
    project_id = create_response.json()["id"]
    
    # Try to get it as user 2
    response = client.get(
        f"/api/projects/{project_id}",
        headers={"X-User-Id": "different_user"}
    )
    
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_get_project_invalid_id(client, sample_user_id):
    """Test getting project with invalid ID format"""
    response = client.get(
        "/api/projects/invalid_id",
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Invalid project ID" in response.json()["detail"]


def test_update_project_success(client, sample_user_id, sample_project_data, mock_db):
    """Test updating a project successfully"""
    # Create a project
    create_response = client.post(
        "/api/projects",
        json=sample_project_data,
        headers={"X-User-Id": sample_user_id}
    )
    project_id = create_response.json()["id"]
    
    # Update the project
    update_data = {"name": "Updated Project Name"}
    response = client.put(
        f"/api/projects/{project_id}",
        json=update_data,
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_200_OK
    project = response.json()
    
    assert project["id"] == project_id
    assert project["name"] == update_data["name"]
    assert project["userId"] == sample_user_id


def test_update_project_not_found(client, sample_user_id):
    """Test updating a non-existent project"""
    fake_id = str(ObjectId())
    
    response = client.put(
        f"/api/projects/{fake_id}",
        json={"name": "Updated Name"},
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_update_project_wrong_user(client, sample_user_id, sample_project_data, mock_db):
    """Test updating a project belonging to another user"""
    # Create project for user 1
    create_response = client.post(
        "/api/projects",
        json=sample_project_data,
        headers={"X-User-Id": sample_user_id}
    )
    project_id = create_response.json()["id"]
    
    # Try to update it as user 2
    response = client.put(
        f"/api/projects/{project_id}",
        json={"name": "Hacked Name"},
        headers={"X-User-Id": "different_user"}
    )
    
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_delete_project_success(client, sample_user_id, sample_project_data, mock_db):
    """Test deleting a project successfully"""
    # Create a project
    create_response = client.post(
        "/api/projects",
        json=sample_project_data,
        headers={"X-User-Id": sample_user_id}
    )
    project_id = create_response.json()["id"]
    
    # Delete the project
    response = client.delete(
        f"/api/projects/{project_id}",
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_200_OK
    assert "message" in response.json()
    assert "deleted successfully" in response.json()["message"]
    
    # Verify it's deleted
    get_response = client.get(
        f"/api/projects/{project_id}",
        headers={"X-User-Id": sample_user_id}
    )
    assert get_response.status_code == status.HTTP_404_NOT_FOUND


def test_delete_project_not_found(client, sample_user_id):
    """Test deleting a non-existent project"""
    fake_id = str(ObjectId())
    
    response = client.delete(
        f"/api/projects/{fake_id}",
        headers={"X-User-Id": sample_user_id}
    )
    
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_delete_project_wrong_user(client, sample_user_id, sample_project_data, mock_db):
    """Test deleting a project belonging to another user"""
    # Create project for user 1
    create_response = client.post(
        "/api/projects",
        json=sample_project_data,
        headers={"X-User-Id": sample_user_id}
    )
    project_id = create_response.json()["id"]
    
    # Try to delete it as user 2
    response = client.delete(
        f"/api/projects/{project_id}",
        headers={"X-User-Id": "different_user"}
    )
    
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_multiple_users_projects(client, sample_project_data, mock_db):
    """Test that users can only see their own projects"""
    user1_id = "user1"
    user2_id = "user2"
    
    # Create projects for both users
    client.post(
        "/api/projects",
        json={"name": "User 1 Project"},
        headers={"X-User-Id": user1_id}
    )
    client.post(
        "/api/projects",
        json={"name": "User 2 Project"},
        headers={"X-User-Id": user2_id}
    )
    
    # User 1 should only see their project
    response = client.get(
        "/api/projects",
        headers={"X-User-Id": user1_id}
    )
    projects = response.json()
    assert len(projects) == 1
    assert projects[0]["name"] == "User 1 Project"
    
    # User 2 should only see their project
    response = client.get(
        "/api/projects",
        headers={"X-User-Id": user2_id}
    )
    projects = response.json()
    assert len(projects) == 1
    assert projects[0]["name"] == "User 2 Project"

