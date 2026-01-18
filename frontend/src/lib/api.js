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

  // Upload a video file to a project
  async uploadVideo(projectId, file) {
    const { supabase } = await import("./supabase.js");
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      throw new Error("Unauthorized: User ID required");
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `${API_BASE_URL}/projects/${projectId}/videos`,
      {
        method: "POST",
        headers: {
          "X-User-Id": session.user.id,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to upload video");
    }

    return await response.json();
  },

  // Get video file URL
  getVideoUrl(projectId, videoId) {
    return `${API_BASE_URL}/projects/${projectId}/videos/${videoId}/file`;
  },

  // Get video file as blob URL (with authentication)
  async getVideoBlobUrl(projectId, videoId) {
    const { supabase } = await import("./supabase.js");
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      throw new Error("Unauthorized: User ID required");
    }

    const response = await fetch(
      `${API_BASE_URL}/projects/${projectId}/videos/${videoId}/file`,
      {
        method: "GET",
        headers: {
          "X-User-Id": session.user.id,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
};

// Overshoot SDK API
export const overshootAPI = {
  // Get nodes configuration
  async getNodes() {
    const response = await fetch(`${API_BASE_URL}/nodes`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch nodes: ${response.statusText}`);
    }

    return await response.json();
  },

  // Send result to backend
  async sendResult(result, timestamp, prompt, nodeId = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      const response = await fetch(`${API_BASE_URL}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: typeof result === "string" ? result : JSON.stringify(result),
          timestamp,
          prompt,
          node_id: nodeId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn("⚠️ Backend request timed out (SDK still working)");
      } else {
        console.error("❌ Error sending result to backend:", error);
      }
      throw error;
    }
  },

  // Get recent results
  async getResults(limit = 10) {
    const response = await fetch(`${API_BASE_URL}/results?limit=${limit}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch results: ${response.statusText}`);
    }

    return await response.json();
  },

  // Get Overshoot SDK configuration
  async getConfig() {
    const response = await fetch(`${API_BASE_URL}/overshoot/config`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Overshoot config: ${response.statusText}`
      );
    }

    return await response.json();
  },
};
