# MongoDB Atlas Setup Guide

## Quick Setup Steps

1. **Create Account & Cluster:**
   - Go to https://www.mongodb.com/cloud/atlas
   - Sign up for free account
   - Create a FREE M0 cluster (takes 3-5 minutes)

2. **Create Database User:**
   - Go to "Database Access" → "Add New Database User"
   - Authentication: Password
   - Username: (choose one, e.g., `avesia_user`)
   - Password: (generate or create one - SAVE THIS!)
   - Database User Privileges: "Read and write to any database"
   - Click "Add User"

3. **Network Access:**
   - Go to "Network Access" → "Add IP Address"
   - For development: Click "Allow Access from Anywhere" (adds `0.0.0.0/0`)
   - For production: Add only your server IP
   - Click "Confirm"

4. **Get Connection String:**
   - Go to "Database" → Click "Connect" on your cluster
   - Choose "Connect your application"
   - Driver: "Python" → Version: "3.6 or later"
   - Copy the connection string
   - It will look like:
     ```
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```

5. **Update `.env` file:**
   ```bash
   cd backend
   # Create .env file if it doesn't exist
   ```
   
   Add to `.env`:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   DATABASE_NAME=avesia
   PORT=3001
   FRONTEND_URL=http://localhost:5173
   ```
   
   **Important:** Replace `<username>` and `<password>` with your actual credentials!

6. **Test Connection:**
   ```bash
   python3 main.py
   ```
   
   You should see: "MongoDB connected successfully"

## Troubleshooting

**Connection Error:**
- Check that your IP is whitelisted in Network Access
- Verify username/password in connection string
- Make sure the cluster is fully deployed (not still building)

**Authentication Failed:**
- Verify username and password are correct
- Check for special characters in password (may need URL encoding)
- Ensure database user has proper privileges

**Timeout Errors:**
- Verify network access settings
- Check firewall settings
- Try pinging the cluster from your machine
