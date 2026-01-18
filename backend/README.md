# Avesia Backend API (Python/FastAPI)

Backend server for Avesia project management platform using FastAPI and MongoDB.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

Or using a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update `.env` with your MongoDB Atlas connection string:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=avesia
PORT=3001
FRONTEND_URL=http://localhost:5173
```

   **For MongoDB Atlas:**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a free cluster if you don't have one
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Replace `<username>` with your database username
   - The connection string format: `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`

## Running the Server

Development mode:
```bash
uvicorn main:app --reload --port 3001
```

Or using the Python script directly:
```bash
python main.py
```

The server will run on `http://localhost:3001` by default.

## API Documentation

FastAPI automatically generates interactive API documentation:
- Swagger UI: `http://localhost:3001/docs`
- ReDoc: `http://localhost:3001/redoc`

## API Endpoints

### Projects

- `GET /api/projects` - Get all projects for the authenticated user
  - Headers: `X-User-Id: <user-id>`
- `POST /api/projects` - Create a new project
  - Headers: `X-User-Id: <user-id>`
  - Body: `{ "name": "Project Name" }`
- `GET /api/projects/{id}` - Get a specific project
- `PUT /api/projects/{id}` - Update a project
  - Body: `{ "name": "Updated Name" }`
- `DELETE /api/projects/{id}` - Delete a project

### Authentication

The API expects the user ID in the `X-User-Id` header.

## MongoDB Atlas Setup

1. **Create a MongoDB Atlas Account:**
   - Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up for a free account (free tier available)

2. **Create a Cluster:**
   - Click "Build a Database"
   - Choose the FREE tier (M0 Sandbox)
   - Select a cloud provider and region
   - Click "Create"

3. **Create a Database User:**
   - Go to "Database Access" in the left sidebar
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Enter a username and password (save these!)
   - Set privileges to "Read and write to any database"
   - Click "Add User"

4. **Whitelist Your IP Address:**
   - Go to "Network Access" in the left sidebar
   - Click "Add IP Address"
   - For development, click "Allow Access from Anywhere" (adds `0.0.0.0/0`)
   - For production, add only your server's IP address
   - Click "Confirm"

5. **Get Your Connection String:**
   - Go to "Database" → click "Connect" on your cluster
   - Choose "Connect your application"
   - Select "Python" and version "3.6 or later"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Replace `<username>` with your database username

6. **Update your `.env` file:**
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
   DATABASE_NAME=avesia
   ```

**Connection String Format:**
- Atlas: `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`
- Make sure to URL-encode special characters in your password if needed
