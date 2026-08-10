# EC2 access (for Cursor agents)

SSH into the production host from this machine using the local config alias — do **not** paste private keys into chat.

## Connect

```powershell
ssh aicalendar-prod
```

Or a one-off command:

```powershell
ssh aicalendar-prod "your command here"
```

## Local SSH config

File: `C:\Users\Fnu Aymen\.ssh\config`

```
Host aicalendar-prod
    HostName 3.143.5.60
    User ec2-user
    IdentityFile "C:\Users\Fnu Aymen\.ssh\aicalendar.pem"
    IdentitiesOnly yes
```

## Key files (on this PC only)

| File | Purpose |
|------|---------|
| `C:\Users\Fnu Aymen\.ssh\aicalendar.pem` | Primary private key (matches GitHub Actions / current `authorized_keys`) |
| `C:\Users\Fnu Aymen\.ssh\aicalendar` | Newer ed25519 key (optional; public half may need to be added on the instance) |
| `C:\Users\Fnu Aymen\.ssh\aicalendar.pub` | Public key for the ed25519 key |

## On the server

- User: `ec2-user`
- App directory: `/home/ec2-user/aicalendar`
- Compose: `docker compose` from that directory
- App `.env` is on the host (app secrets / DB), **not** the SSH private key

## Deploy note

GitHub Actions deploys via `EC2_INSTANCE_IP`, `EC2_USERNAME`, and `EC2_SECRET_KEY` (same PEM as `aicalendar.pem`).
