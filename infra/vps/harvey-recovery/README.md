# Harvey: VPS recovery timer

This timer is an hourly fallback for the production `/api/harvey/tick` route. The Next.js `after()` path remains responsible for immediate inbound processing; this timer is only for recovery and reminders. It must not be changed to a short polling interval because the production database is on Neon Free.

The oneshot runs with a private systemd dynamic user and reads `/etc/prospectra-plus/harvey-worker.env` through systemd. Keep that file owned by `root:root` with mode `0600`; never copy it into this repository. The helper uses `PUBLIC_APP_URL` and `CRON_SECRET`, sends the bearer header in memory, and does not log response counts or message data. `HARVEY_WEBHOOK_SECRET` is explicitly removed from the process environment.

## Install and activate

Copy the Python helper to `/usr/local/libexec/prospectra-harvey-recovery.py` and the service/timer units to `/etc/systemd/system/`. Then:

```sh
python3 -m py_compile /usr/local/libexec/prospectra-harvey-recovery.py
systemd-analyze verify /etc/systemd/system/prospectra-harvey-recovery.service /etc/systemd/system/prospectra-harvey-recovery.timer
systemctl daemon-reload
systemctl start prospectra-harvey-recovery.service
```

Check that the oneshot completes successfully before enabling the hourly schedule:

```sh
systemctl show prospectra-harvey-recovery.service -p Result -p ExecMainStatus
systemctl enable --now prospectra-harvey-recovery.timer
systemctl list-timers prospectra-harvey-recovery.timer
```

The timer waits one hour after activation, then schedules the next tick one hour after each completed run. The service makes a single HTTPS request and exits; it does not keep an app process running or create a separate listener.

## Current VPS state

The helper and units are installed. The authorized oneshot returned HTTP 200 with the expected JSON keys, and the hourly timer is enabled and active. The timer is the only newly enabled Harvey VPS unit; the staged app units remain disabled and inactive.

To pause scheduled recovery, run `systemctl disable --now prospectra-harvey-recovery.timer`. Do not enable or start the separate staged Prospectra VPS app units during the hybrid deployment.
