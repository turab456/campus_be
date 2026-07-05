# Backend - Violation System Documentation

## Overview

The violation system automatically tracks and enforces user behavior on the Campus Marketplace. It monitors spam and scam behavior, issues warnings, and automatically blocks users who exceed thresholds.

## System Architecture

```
User reports message
        ↓
violationController.reportUnwantedMessage()
        ↓
scoreManager.increaseUserScore(spam, +15)
        ↓
Check thresholds (50→warn, 75→block)
        ↓
Update User model
        ↓
Return status to frontend
        ↓
Blocked middleware prevents future actions
```

## Score System

### Two Independent Scores
- **Spam Score**: Tracking unwanted messaging, harassment (0-100)
- **Scam Score**: Tracking fraud, unconfirmed sales (0-100)

### Automatic Actions
| Score | Action |
|-------|--------|
| 0-49 | Safe - no action |
| 50 | Warning issued |
| 75+ | Account blocked |

Each score is independent:
- A user can have spam=80 (blocked) but scam=10 (safe)
- Or spam=20 (safe) but scam=90 (blocked)
- Either one being 75+ blocks the account

## Core Files

### 1. scoreManager.js
**Purpose**: Central utility for score management

**Key Functions**:
```javascript
increaseUserScore(userId, scoreType, amount, reason)
  // Increases spam or scam score
  // Returns: {blocked: bool, warning: bool, blockReason: string}

reportUnwantedMessage(userId, messageId, reason)
  // Shorthand: increase spam by +15

reportUnconfirmedSale(sellerId, listingId, reason)
  // Shorthand: increase scam by +20

blockUser(userId, reason)
  // Manually block user (admin only)

unblockUser(userId, reason)
  // Manually unblock (admin only)

getUserWarnings(userId)
  // Get full warning history

isUserBlocked(userId)
  // Check if user is blocked

resetUserScores(userId, reason)
  // Zero out all scores (admin only)
```

**Usage Example**:
```javascript
const result = scoreManager.increaseUserScore(
  userId,
  'spam',        // or 'scam'
  15,           // amount
  'Unwanted message'  // reason
);

if (result.blocked) {
  // User is now blocked
}
```

### 2. checkBlocked.js
**Purpose**: Middleware to prevent blocked users from taking actions

**Where It's Applied**:
```javascript
// In violations.js routes
router.post(
  '/report-message',
  protect,          // Auth middleware
  checkBlocked,     // Blocking enforcement
  reportUnwantedMessage  // Controller
);
```

**Response When Blocked**:
```json
{
  "success": false,
  "blocked": true,
  "message": "Your account has been suspended due to policy violations",
  "blockReason": "Spam score exceeded threshold (78/100)",
  "blockedAt": "2026-07-04T12:00:00Z"
}
```

### 3. violationController.js
**Purpose**: Endpoint handlers for all violation operations

**Key Endpoints**:

#### User Endpoints (Protected)
- `POST /report-message` - Report unwanted message
- `POST /mark-sold/:listingId` - Seller marks item as sold
- `POST /confirm-receipt/:listingId` - Buyer confirms receipt
- `GET /warnings/:userId` - Get violation history

#### Admin Endpoints (Protected + Admin)
- `POST /report-unconfirmed-sale` - Admin reports unconfirmed sale
- `POST /block-user` - Admin blocks user
- `POST /unblock-user` - Admin unblocks user
- `POST /reset-scores` - Admin resets scores

#### Public Endpoints
- `GET /check-blocked/:userId` - Check if user is blocked (no auth)

### 4. violations.js
**Purpose**: Route definitions and middleware chain

**Route Structure**:
```javascript
// Public - no auth needed
GET /check-blocked/:userId

// Protected user routes - auth + checkBlocked
POST /report-message
POST /mark-sold/:listingId
POST /confirm-receipt/:listingId
GET /warnings/:userId

// Protected admin routes - auth + admin check
POST /report-unconfirmed-sale
POST /block-user
POST /unblock-user
POST /reset-scores
```

## User Model Changes

Added to User schema:
```javascript
{
  spamScore: { type: Number, default: 0 },
  scamScore: { type: Number, default: 0 },
  blocked: { type: Boolean, default: false },
  blockReason: { type: String },
  blockedAt: { type: Date },
  warnings: [{
    reason: String,
    spamScore: Number,
    scamScore: Number,
    createdAt: { type: Date, default: Date.now }
  }],
  violationCount: { type: Number, default: 0 }
}
```

## Listing Model Changes

Added to Listing schema:
```javascript
{
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  soldAt: { type: Date },
  buyerConfirmedReceipt: { type: Boolean, default: false },
  confirmedAt: { type: Date },
  fraudScore: { type: Number, default: 0 },
  approved: { type: Boolean, default: true },
  rejectReason: { type: String }
}
```

## Integration in app.js

```javascript
// Import
const violationsRouter = require('./src/routes/violations');

// Apply routes
app.use('/api/violations', violationsRouter);
```

## Common Workflows

### 1. User Reports Message

```
POST /api/violations/report-message
{
  messageId: "507f...",
  reason: "Harassment"
}

Response (User warned):
{
  "success": true,
  "data": {
    "messageId": "507f...",
    "senderStatus": {
      "blocked": false,
      "warning": true,
      "currentScore": 50
    }
  }
}

Response (User blocked):
{
  "success": true,
  "data": {
    "messageId": "507f...",
    "senderStatus": {
      "blocked": true,
      "blockReason": "Spam score exceeded threshold (75/100)",
      "blockedAt": "2026-07-04..."
    }
  }
}
```

### 2. Seller Marks as Sold

```
POST /api/violations/mark-sold/listing123
No body needed

Response:
{
  "success": true,
  "message": "Listing marked as sold. Waiting for buyer confirmation.",
  "listing": {
    "isSold": true,
    "soldAt": "2026-07-04..."
  }
}
```

### 3. Buyer Confirms Receipt

```
POST /api/violations/confirm-receipt/listing123
No body needed

Response:
{
  "success": true,
  "message": "Receipt confirmed. Transaction complete."
}
```

## Error Handling

### Validation Errors
```javascript
// Missing required field
{
  "success": false,
  "message": "messageId is required",
  "error": "ValidationError"
}
```

### User Not Found
```javascript
{
  "success": false,
  "message": "User not found",
  "error": "NotFoundError"
}
```

### Blocked User Takes Action
```javascript
{
  "success": false,
  "blocked": true,
  "message": "Your account has been suspended...",
  "blockReason": "Spam score exceeded threshold"
}
```

## Logging

All violations are logged:

```javascript
logger.info(`Spam score increased for user ${userId}: ${oldScore} → ${newScore}`);
logger.warn(`User ${userId} warned for violation: ${reason}`);
logger.error(`User ${userId} automatically blocked: ${blockReason}`);
logger.info(`Admin action: User ${userId} manually blocked by ${adminId}`);
```

Check logs in `backend/logs/` directory.

## Configuration

### Adjust Thresholds

Edit `backend/src/utils/scoreManager.js`:

```javascript
// Line 3-5
const SPAM_WARNING_THRESHOLD = 50;   // Change to 40 for stricter
const SCAM_WARNING_THRESHOLD = 50;   // Change to 30 for faster warns
const BLOCK_THRESHOLD = 75;          // Change to 50 for faster blocks
```

### Adjust Violation Amounts

Edit specific controller methods:

```javascript
// In violationController.js
const scoreIncrease = 15;  // Change for message reports (default: 15)
const scoreIncrease = 20;  // Change for unconfirmed sales (default: 20)
```

## Testing

### Manual Testing

#### 1. Report Message
```bash
curl -X POST http://localhost:5000/api/violations/report-message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messageId": "507f1f77bcf86cd799439011",
    "reason": "Spam"
  }'
```

#### 2. Check If Blocked
```bash
curl http://localhost:5000/api/violations/check-blocked/507f1f77bcf86cd799439011
```

#### 3. View User Warnings (Admin)
```bash
curl http://localhost:5000/api/violations/warnings/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Automated Testing

Test files should cover:
- Score increase logic
- Threshold checks
- Blocking enforcement
- Admin operations
- Error cases

## Production Deployment

### Pre-Deploy Checklist
- [ ] Database indexes created for queries
- [ ] Backup database
- [ ] Run model migrations
- [ ] Verify all endpoints work
- [ ] Load test the violation endpoints
- [ ] Monitor logs during initial rollout
- [ ] Have rollback plan ready

### Monitoring
Track these metrics:
- Violations reported per day
- Users warned per day
- Users blocked per day
- Spam vs scam distribution
- Admin actions
- Appeal success rate

### Performance Optimization
1. Index User.email for faster lookups
2. Cache recently checked users (5 min)
3. Batch admin operations
4. Archive old violations monthly

## Troubleshooting

### Issue: User not being blocked at 75
**Check**: Verify BLOCK_THRESHOLD is set to 75 in scoreManager.js

### Issue: Score not persisting
**Check**: Verify MongoDB connection and User model updated

### Issue: Middleware not blocking user
**Check**: Verify checkBlocked middleware is applied to routes

### Issue: Admin can't access endpoints
**Check**: Verify user has role='admin' and isAdmin middleware is applied

## Security Considerations

1. **Score Tampering**: Scores only increase, can't be decreased by user
2. **Admin Overrides**: All admin actions logged with timestamp
3. **Blocked User Bypass**: Middleware prevents bypass at request level
4. **Data Integrity**: Warnings array provides audit trail
5. **Rate Limiting**: Apply to report endpoints to prevent abuse

## Dependencies

- mongoose: Database ORM
- logger: Logging utility
- auth middleware: User authentication
- isAdmin middleware: Admin authorization

## Related Documentation

- [VIOLATION_SYSTEM.md](../VIOLATION_SYSTEM.md) - Full API reference
- [VIOLATION_INTEGRATION.md](../VIOLATION_INTEGRATION.md) - Frontend integration
- [VIOLATION_QUICK_REFERENCE.md](../VIOLATION_QUICK_REFERENCE.md) - Developer reference

---

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: 2026-07-04
