# UptimeRobot Monitoring Setup Guide

This guide explains how to set up uptime monitoring for the Brand Promotion website using UptimeRobot (free tier).

## 1. Create a UptimeRobot Account

1. Go to https://uptimerobot.com/
2. Sign up for a free account (50 monitors, 5-minute intervals)
3. Verify your email

## 2. Add HTTP(s) Monitor

1. Click "Add New Monitor"
2. Type: **HTTP(s)**
3. Friendly Name: `Brand Promotion - Main Site`
4. URL: `https://<your-domain>.railway.app/health`
   - OR if using custom domain: `https://brandpromotion.in/health`
5. Monitoring Interval: **5 minutes** (free tier minimum)
6. Response Time: Check the box (tracks average response time)
7. Click "Create Monitor"

## 3. Configure Alerts

1. Go to **My Settings** → **Alert Contacts**
2. Add your email address
3. Return to the monitor → **Edit** → **Alert Contacts**
4. Select your email

For faster alerts, add:
- **SMS**: Get 5 free SMS credits/month (enter your mobile number)
- **Telegram**: Bot automatically created by UptimeRobot
- **Discord**: Create a webhook and paste the URL

## 4. What the Monitor Checks

The `/health` endpoint returns:

```json
{
  "status": "healthy",
  "checks": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "database": { "status": "healthy" },
    "storage": { "status": "healthy" }
  }
}
```

- Returns HTTP 200 when database and storage are accessible
- Returns HTTP 503 when either fails (triggers alert immediately)
- No sensitive data exposed (only health status, no IP addresses or user counts)

## 5. Custom Domain (Recommended)

1. Register domain (e.g., `brandpromotion.in`)
2. In Railway project settings → Domains → Add domain
3. Update DNS to point to Railway-provided CNAME
4. Refresh until certificate is issued

**Note**: HTTPS is provided automatically by Railway, HSTS is enforced.

## 6. Monitor Response Times

From UptimeRobot dashboard:
- Green: < 10 seconds (acceptable)
- Orange: 10-30 seconds (investigate if sustained)
- Red: > 30 seconds or failure (immediate action needed)

## 7. Cost Considerations

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| UptimeRobot | 50 monitors, 5-min interval | 1,440 monitors, 1-min interval |
| Pingdom | 100 checks/month | $10+/month, 1-min checks |
| Freshping | 50 monitors | $12+/month |
| StatusCake | 10 tests | $29+/month |

**Recommendation**: Start with UptimeRobot free tier. Upgrade only if monitors exceed or you need faster alerts.

## 8. Troubleshooting

### Monitor shows "DOWN"
1. Check the exact error message in UptimeRobot
2. Visit `/health` directly in browser
3. Check Railway logs: `railway logs`
4. Verify the app started: `railway logs --tail`

### False Positives (monitor flaky)
- Add a "Downtime Alert" in UptimeRobot settings
- Configure "Ignore first X seconds after downtime" (useful for deployments)

### Monitoring Too Many Endpoints
The `/health` endpoint covers both database and storage. You don't need separate monitors for each.

## 9. Integration with Other Tools (Optional)

### Slack Notifications
1. Create Slack app → Incoming Webhooks
2. Add webhook URL to UptimeRobot alert contacts
3. Test with a manual alert

### GitHub Status Checks
For deployments, add a workflow step that waits for UptimeRobot to confirm healthy:
```yaml
- name: Wait for health check
  run: |
    for i in {1..30}; do
      if curl -sf https://<domain>/health > /dev/null 2>&1; then
        echo "Health check passed"
        exit 0
      fi
      echo "Waiting for health check..."
      sleep 10
    done
    echo "Health check timeout"
    exit 1
```