# Telegram group tag-all bot

This bot provides `/tagall` in groups and supergroups. Only a group owner or
administrator can run the command. The bot stores observed members per chat in
`data.json` and mentions those users in batches.

## Telegram limitation

The Telegram Bot API does not let bots retrieve a complete group-member list or
channel subscriber list. Making the bot an administrator does not reveal
members who were already in the group before the bot observed them. As it sees
messages and join events, it records users so later `/tagall` commands can
mention them.

To let the bot observe group activity, add it as an administrator. Alternatively,
disable privacy mode for the bot with BotFather (`/setprivacy`), then remove and
re-add it to the group so the setting takes effect. An administrator can use
`/tagall` to tag the members the bot has observed. Telegram channels are not
supported because bots cannot list channel subscribers.

## Run locally

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Copy `.env.example` to `.env` and set `BOT_TOKEN`.
3. Install dependencies with `npm install`.
4. Start with `npm start`. Node loads `.env` locally if present; on hosting,
   environment variables supplied by the platform are used.
5. Add the bot to your group and allow it to observe member activity as
   described above.
6. A group administrator can run `/tagall`.

Keep `.env` private. The bot uses long polling and must be running to observe
new activity. Its member data is stored locally in `data.json`.

## Deploy from your computer to Railway (no GitHub)

1. Install the Railway CLI with `npm install --global @railway/cli`.
2. Open PowerShell in this project folder and sign in:

   ```powershell
   cd "C:\Users\USER\Downloads\tagall telegram bot"
   railway login
   ```

3. Create and deploy the project directly from this folder:

   ```powershell
   railway up
   ```

   Follow the prompts to create a Railway project and service. This uploads the
   local source; it does not use GitHub. Railway detects `package.json`, installs
   dependencies, and runs `npm start`.
4. In the Railway dashboard, open the service's **Variables** tab and add
   `BOT_TOKEN` with the token from BotFather. Do not put the token in source
   files. Railway redeploys the service when the variable is applied.
5. Add a Railway volume to the service and set its mount path to `/data`.
   In **Variables**, also set `DATA_FILE` to `/data/data.json`. The bot stores
   observed members there so they persist across deployments and restarts.
6. Check the service's deployment logs. Once it says the bot is running, add it
   to the group, grant admin rights, and have an admin use `/tagall`.

The service is a long-running bot using Telegram long polling; it does not need
a public web domain. Keep one running deployment per bot token. Railway's
filesystem is temporary without a volume, so the volume and `DATA_FILE` setting
are important for retaining the member list.

## Deploy to Render without GitHub

Render does not upload a local source folder directly. To avoid GitHub, build a
Docker image on your computer, push it to a container registry such as Docker
Hub, then create a Render **Background Worker** from that image. This still
requires Docker Desktop and a registry account.

1. Install and start Docker Desktop. Create a Docker Hub repository. A private
   repository keeps the image private; Render will need Docker Hub credentials
   when you configure the image.
2. In PowerShell, go to this folder and sign in to Docker Hub:

   ```powershell
   cd "C:\Users\USER\Downloads\tagall telegram bot"
   docker login
   ```

3. Replace `YOUR_DOCKERHUB_NAME` and `tagall-telegram-bot` below with your
   Docker Hub username and repository name, then build and push:

   ```powershell
   docker build -t YOUR_DOCKERHUB_NAME/tagall-telegram-bot:latest .
   docker push YOUR_DOCKERHUB_NAME/tagall-telegram-bot:latest
   ```

4. In Render, choose **New > Background Worker > Existing Image**. Enter
   `docker.io/YOUR_DOCKERHUB_NAME/tagall-telegram-bot:latest`. If the image is
   private, provide Docker Hub credentials (prefer a Docker Hub access token).
5. In the worker's **Environment** settings, add `BOT_TOKEN` with your
   BotFather token.
6. To preserve observed users across restarts and image updates, attach a
   persistent disk mounted at `/var/data`, then set `DATA_FILE` to
   `/var/data/data.json`. Render persistent disks require a paid service plan.
   Without a disk, observed-user data is lost on restart or redeploy.
7. Create the worker and check its logs for `Tag-all bot is running.` Add it to
   your group and use `/tagall` as a group administrator.

This bot uses Telegram long polling, so choose a **Background Worker**, not a
Web Service. Keep only one running instance for this bot token. After changing
the code, rebuild and push the image with the same tag, then manually deploy the
latest image in Render. Render's image-based deployment instructions:
[Deploying an image](https://render.com/docs/deploying-an-image).
