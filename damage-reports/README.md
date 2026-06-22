# Damage Reports Management System

A minimal, functional end-to-end MVP for managing damage reports with a REST API backend and modern web frontend.

## Features

✅ **Reports List** – View all damage reports with quick status overview  
✅ **Create Report** – Add new reports with damage details  
✅ **Report Details** – View complete report information  
✅ **Status Management** – Change report status (NEW → IN_REVIEW)  
✅ **In-Memory Storage** – Simple, fast data persistence for MVP

## Project Structure

```
damage-reports/
├── server.js          # Express.js REST API backend
├── package.json       # Node.js dependencies
└── public/
    ├── index.html     # Frontend HTML
    ├── app.js         # Frontend JavaScript
    └── style.css      # Frontend styling
```

## DamageReport Entity

```javascript
{
  id: string (UUID),           // Unique identifier
  reporterName: string,        // Name of person reporting
  address: string,             // Location of damage
  damageType: string,          // Type: Water, Fire, Wind, etc.
  description: string,         // Detailed damage description
  status: string              // NEW or IN_REVIEW
}
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/reports` | Get all reports |
| POST | `/api/reports` | Create new report |
| GET | `/api/reports/:id` | Get report details |
| PATCH | `/api/reports/:id/status` | Update report status |

### Request Examples

**Create Report:**
```bash
POST /api/reports
Content-Type: application/json

{
  "reporterName": "John Doe",
  "address": "123 Main St",
  "damageType": "Water Damage",
  "description": "Roof leak from heavy rain"
}
```

**Update Status:**
```bash
PATCH /api/reports/{id}/status
Content-Type: application/json

{
  "status": "IN_REVIEW"
}
```

## Quick Start

### Prerequisites
- Node.js 14+ and npm installed

### Installation & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open in browser:**
   ```
   http://localhost:3000
   ```

### Usage

1. **View Reports** – See all damage reports on the Reports List tab
2. **Create Report** – Fill the form and submit to add a new report
3. **View Details** – Click any report card to see full details
4. **Change Status** – Update report status in the details modal

## Features Included

- ✅ Responsive web UI with tab navigation
- ✅ Form validation
- ✅ Real-time status updates
- ✅ Modal details view
- ✅ Pre-populated sample data for testing
- ✅ Error handling and user feedback
- ✅ CORS enabled for API access

## What's NOT Included (As Per Requirements)

- ❌ Authentication/Authorization
- ❌ User roles
- ❌ File uploads
- ❌ Advanced styling
- ❌ Database (in-memory only for MVP)
- ❌ Persistent storage

## Sample Data

The system starts with 2 sample reports:
1. **John Doe** - Water damage from roof leak
2. **Jane Smith** - Fire damage from kitchen fire

## Architecture

```
┌─────────────────┐
│   Browser UI    │
│  (HTML/CSS/JS)  │
└────────┬────────┘
         │ HTTP/REST
         ▼
┌─────────────────┐
│  Express.js API │
│   (server.js)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  In-Memory      │
│  Report Array   │
└─────────────────┘
```

## Testing the System

### Via Browser UI:
1. Open http://localhost:3000
2. View sample reports in Reports List
3. Create a new report using the form
4. Click any report to see details
5. Change status and save

### Via curl (Command Line):

```bash
# Get all reports
curl http://localhost:3000/api/reports

# Create a report
curl -X POST http://localhost:3000/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "reporterName": "Test User",
    "address": "789 Test Ave",
    "damageType": "Structural Damage",
    "description": "Test damage report"
  }'

# Get report details (replace {id} with actual ID)
curl http://localhost:3000/api/reports/{id}

# Update status
curl -X PATCH http://localhost:3000/api/reports/{id}/status \
  -H "Content-Type: application/json" \
  -d '{"status": "IN_REVIEW"}'
```

## Development Notes

- **Port**: 3000 (configurable in server.js)
- **Frontend Port**: Same as backend (served as static files)
- **Data Persistence**: In-memory only - resets on server restart
- **CORS**: Enabled to allow frontend access to API

## Next Steps for Production

1. Add a real database (PostgreSQL, MongoDB, etc.)
2. Implement authentication & authorization
3. Add input validation & sanitization
4. Implement logging & monitoring
5. Add unit & integration tests
6. Deploy to cloud platform
7. Add advanced features (file uploads, reports, exports, etc.)
