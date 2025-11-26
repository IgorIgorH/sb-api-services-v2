# Quick Start Guide - Local Development

## 🚀 One-Time Setup (Already Done!)

✅ Dependencies installed
✅ `.env` file configured with API keys
✅ MongoDB running locally
✅ Server tested and validated

## 🏃 Daily Development Workflow

### Start Development
```bash
# 1. Ensure MongoDB is running
pgrep -f mongod || mongod

# 2. Start the server
npm start

# 3. Verify everything works
node test-apis.js
```

### Access Your Environment
- **API Server:** http://localhost:3000
- **WebSocket:** ws://localhost:3000/realtime
- **Health Check:** http://localhost:3000/policy

### Stop Development
```bash
# Stop the server: Ctrl+C

# Stop MongoDB (optional)
mongod --shutdown
```

## 🧪 Testing Your Assistants

### Test Email Assistant (test_mail)
```bash
curl -X POST http://localhost:3000/assistant/user-input \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "assistantId": "test_mail",
    "message": "send test email to igorh@aidgenomics.com"
  }'
```

### Test JIRA Assistant (Test_05)
```bash
curl -X POST http://localhost:3000/assistant/user-input \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "assistantId": "Test_05",
    "message": "list my recent tickets"
  }'
```

## 🔑 API Keys Reference

All keys are configured in `.env`:

| Service | Status | Purpose |
|---------|--------|---------|
| OpenAI | ✅ Valid | AI models for all assistants |
| SendGrid | ✅ Valid | Email sending (test_mail assistant) |
| JIRA | ✅ Valid | Ticket management (Test_05 assistant) |
| SB API | ✅ Valid | Access to app.singularitybridge.net |
| Twilio | ⚠️ Placeholder | SMS/Voice (not needed for current tests) |

## 🛠️ Common Commands

```bash
# Install dependencies
npm install

# Start server (production mode)
npm start

# Start server (development mode with auto-reload)
npm run dev  # Requires nodemon: npm install -g nodemon

# Run tests
npm test

# Run linter
npm run lint

# Build TypeScript
npm run build

# Create MongoDB vector search index
npm run create-search-index

# Test all API configurations
node test-apis.js
```

## 🔍 Debugging

### Check Server Logs
Server logs appear in the console where you ran `npm start`

### Check MongoDB Connection
```bash
# Is MongoDB running?
pgrep -f mongod

# Connect to MongoDB shell
mongosh dev
```

### Verify API Keys
```bash
# Run the automated test suite
node test-apis.js
```

### Check Environment Variables
```bash
# View current environment
cat .env | grep -v "^#" | grep -v "^$"
```

## 📚 Documentation

- **Main README:** README.md
- **Claude Guide:** CLAUDE.md
- **Test Results:** TEST-RESULTS.md
- **API Docs:** docs/
- **Contributing:** CONTRIBUTING.md

## 🎯 Production Environment

Your local environment mirrors:
- **Production:** https://app.singularitybridge.net
- **API:** https://api.singularitybridge.net
- **Company ID:** 690b1940455d30f7a1c1002b

## ⚡ Pro Tips

1. **Auto-reload:** Install nodemon globally for auto-restart on file changes
   ```bash
   npm install -g nodemon
   npm run dev
   ```

2. **MongoDB GUI:** Use MongoDB Compass to visualize your local database
   - Connection: `mongodb://localhost:27017`
   - Database: `dev`

3. **API Testing:** Use Postman or Thunder Client (VS Code) to test endpoints

4. **Environment Switching:** Keep separate `.env.production` and `.env.development` files

5. **Log Levels:** Adjust `LOG_LEVEL` in `.env`:
   - `debug`: Maximum detail
   - `info`: Standard logging (current)
   - `warn`: Warnings only
   - `error`: Errors only

## 🐛 Known Issues & Fixes

### Issue: "ts-node: command not found"
**Fix:** Dependencies need to be installed
```bash
npm install
```

### Issue: "MongoDB connection failed"
**Fix:** Start MongoDB
```bash
mongod
```

### Issue: "OpenAI API key invalid"
**Fix:** Check your `.env` file
```bash
# Verify the key in .env matches your OpenAI dashboard
cat .env | grep OPENAI_API_KEY
```

### Issue: "Twilio errors on startup"
**Fix:** Already fixed with placeholder credentials in `.env`

## 📞 Need Help?

1. **API Tests Failing?** → Run `node test-apis.js` for detailed diagnostics
2. **Server Won't Start?** → Check MongoDB is running: `pgrep -f mongod`
3. **Assistant Not Responding?** → Verify API keys in `.env`
4. **Production Issues?** → Compare local `.env` with production settings

---

**Last Updated:** November 25, 2025
**Environment:** Local Development
**Status:** ✅ All Systems Operational

Happy coding! 🚀
