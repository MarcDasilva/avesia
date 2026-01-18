# MongoDB Atlas Connection Troubleshooting

## Common Issues and Solutions

### 1. Connection Timeout Error

**Symptoms:** `ServerSelectionTimeoutError` or connection timeout

**Solutions:**

#### Check Network Access (IP Whitelist)
1. Go to MongoDB Atlas → **Network Access**
2. Click **"Add IP Address"**
3. For development: Click **"Allow Access from Anywhere"** (adds `0.0.0.0/0`)
4. For production: Add your specific IP address
5. Click **"Confirm"**
6. Wait 1-2 minutes for changes to propagate

#### Verify Connection String Format
Your connection string should use `mongodb+srv://` format:
```
✅ CORRECT: mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
❌ WRONG: mongodb://username:password@cluster0.xxxxx.mongodb.net:27017
```

**Important:** 
- Use `mongodb+srv://` (not `mongodb://`) for Atlas
- Don't include port `:27017` in Atlas connection strings
- Make sure URL encoding is correct for special characters in password

#### Check Username and Password
1. Go to Atlas → **Database Access**
2. Verify your database user exists
3. Make sure password is correct (no typos)
4. If password has special characters, they may need URL encoding:
   - `@` → `%40`
   - `#` → `%23`
   - `$` → `%24`
   - `%` → `%25`
   - `&` → `%26`

#### Verify Cluster Status
1. Go to Atlas → **Database**
2. Make sure your cluster status is **"Active"** (not "Creating" or "Paused")
3. Wait if cluster is still being created

### 2. Authentication Failed

**Symptoms:** `Authentication failed` error

**Solutions:**
- Verify username and password in connection string
- Check database user has "Read and write to any database" privileges
- Ensure no extra spaces in connection string

### 3. DNS/Network Issues

**Solutions:**
- Check your internet connection
- Try using a different network (if behind corporate firewall)
- Verify you can reach Atlas: `ping cluster0.xxxxx.mongodb.net` (if not using SRV)
- Check if your firewall blocks MongoDB ports

### 4. Connection String Format

**Correct format:**
```
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
```

**Your `.env` should look like:**
```
MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=avesia
```

### 5. Test Connection

You can test your connection string using MongoDB Compass or the MongoDB shell (mongosh).

## Quick Checklist

- [ ] IP address whitelisted in Atlas Network Access
- [ ] Connection string uses `mongodb+srv://` format
- [ ] Username and password are correct
- [ ] No port number in connection string (`:27017`)
- [ ] Cluster is fully deployed and active
- [ ] Database user has correct privileges
- [ ] Password special characters are URL encoded if needed

