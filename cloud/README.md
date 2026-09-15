# Cloud sync service deployment

Deploy this repository to Render as a **Web Service** using `render.yaml`.

Set these Render environment variables:

- `MONGODB_URI`: MongoDB Atlas connection string. Only Render receives this value.
- `JWT_SECRET`: a long random secret. Render can generate it from `render.yaml`.
- `ADMIN_API_KEY`: a long random secret used only by you to enroll a device.
- `MONGODB_DATABASE`: optional; defaults to `stockroom_sync`.

After deployment, verify `https://YOUR-RENDER-URL/health` returns `{"ok":true}`.

For each installed client device, create a unique business ID and device ID, then issue its JWT from a secure terminal (replace all example values):

```powershell
$headers = @{ 'x-admin-key' = 'YOUR_ADMIN_API_KEY'; 'Content-Type' = 'application/json' }
$body = @{ businessId = 'client-001'; deviceId = 'client-001-pc-01'; expiresInDays = 365 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-RENDER-URL/v1/admin/devices' -Headers $headers -Body $body
```

Copy the returned `deviceToken` into the installed app's `%APPDATA%\Stockroom Business\sync-config.json`, together with the Render URL, business ID, and device ID. Do not put `MONGODB_URI`, `JWT_SECRET`, or `ADMIN_API_KEY` into the installed application.
