// API client for backend communication

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// Get auth token from Supabase session
const getAuthHeaders = async () => {
  try {
    const { supabase } = await import("./supabase.js");
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      return {
        Authorization: `Bearer ${session.access_token}`,
        "X-User-Id": session.user.id,
        "Content-Type": "application/json",
      };
    }

    // Fallback: try to get user ID from session
    if (session?.user?.id) {
      return {
        "X-User-Id": session.user.id,
        "Content-Type": "application/json",
      };
    }

    return {
      "Content-Type": "application/json",
    };
  } catch (error) {
    console.error("Error getting auth headers:", error);
    return {
      "Content-Type": "application/json",
    };
  }
};

// Projects API
export const projectsAPI = {
  // Get all projects for the current user
  async getAll() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/projects`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();
    // Backend already returns id field, no transformation needed
    return data;
  },

  // Create a new project
  async create(name) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/projects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create project");
    }

    const project = await response.json();
    // Backend already returns id field
    return project;
  },

  // Get a single project
  async getById(id) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch project: ${response.statusText}`);
    }

    const project = await response.json();
    // Backend already returns id field
    return project;
  },

  // Update a project
  async update(id, name) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update project: ${response.statusText}`);
    }

    const project = await response.json();
    // Backend already returns id field
    return project;
  },

  // Delete a project
  async delete(id) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.statusText}`);
    }

    return true;
  },
};
