# Setting Up .env File for MongoDB Atlas

Your `.env` file is currently empty. Follow these steps:

## 1. Get Your MongoDB Atlas Connection String

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign in to your account
3. Click on your cluster (or create one if you haven't)
4. Click "Connect"
5. Choose "Connect your application"
6. Select "Python" and version "3.6 or later"
7. Copy the connection string

It will look like:
```
mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

## 2. Edit the .env File

Open `/Users/marc/avesia/backend/.env` in a text editor and add:

```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=avesia
PORT=3001
FRONTEND_URL=http://localhost:5173
```

**Important:** 
- Replace `<username>` with your Atlas database username
- Replace `<password>` with your Atlas database password
- Replace `cluster0.xxxxx.mongodb.net` with your actual cluster URL

## 3. Make Sure Your Atlas Settings Are Correct

- **Database Access**: Your user must have "Read and write to any database" privileges
- **Network Access**: Your IP address must be whitelisted (or use `0.0.0.0/0` for development)

## 4. Test the Connection

After adding the connection string:

```bash
cd /Users/marc/avesia/backend
python3 main.py
```

You should see: "MongoDB connected successfully"

