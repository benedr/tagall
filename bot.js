"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Bot } = require("grammy");

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN is required. Copy .env.example to .env and set your bot token.");
}

const dataPath = process.env.DATA_FILE || path.join(__dirname, "data.json");
const usersByChat = loadUsers();
const lastTagAllAt = new Map();
const TAG_ALL_COOLDOWN_MS = 60_000;
const MESSAGE_LIMIT = 3_800;

function loadUsers() {
  if (!fs.existsSync(dataPath)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("data.json must contain a JSON object.");
  }
  return parsed;
}

function saveUsers() {
  fs.writeFileSync(dataPath, JSON.stringify(usersByChat, null, 2));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function isGroup(chat) {
  return chat?.type === "group" || chat?.type === "supergroup";
}

function rememberUser(chatId, user) {
  if (!user || user.is_bot || user.id === undefined) {
    return;
  }

  const key = String(chatId);
  const chatUsers = usersByChat[key] || (usersByChat[key] = {});
  const id = String(user.id);
  const nextUser = {
    id,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    username: user.username || "",
  };

  if (JSON.stringify(chatUsers[id]) !== JSON.stringify(nextUser)) {
    chatUsers[id] = nextUser;
    saveUsers();
  }
}

function forgetUser(chatId, userId) {
  const chatUsers = usersByChat[String(chatId)];
  if (chatUsers && delete chatUsers[String(userId)]) {
    if (Object.keys(chatUsers).length === 0) {
      delete usersByChat[String(chatId)];
    }
    saveUsers();
  }
}

function getMention(user) {
  const name = user.username
    ? `@${user.username}`
    : [user.first_name, user.last_name].filter(Boolean).join(" ") || "member";
  return `<a href="tg://user?id=${encodeURIComponent(user.id)}">${escapeHtml(name)}</a>`;
}

function splitMentions(users, messageLimit = MESSAGE_LIMIT) {
  const messages = [];
  let currentMessage = "";

  for (const user of users) {
    const mention = getMention(user);
    const candidate = currentMessage ? `${currentMessage} ${mention}` : mention;
    if (candidate.length > messageLimit && currentMessage) {
      messages.push(currentMessage);
      currentMessage = mention;
    } else {
      currentMessage = candidate;
    }
  }

  if (currentMessage) {
    messages.push(currentMessage);
  }
  return messages;
}

function trackObservedUsers(ctx) {
  if (!isGroup(ctx.chat)) {
    return;
  }

  if (ctx.from) {
    rememberUser(ctx.chat.id, ctx.from);
  }

  for (const user of ctx.message?.new_chat_members || []) {
    rememberUser(ctx.chat.id, user);
  }
}

const bot = new Bot(token);

bot.use(async (ctx, next) => {
  trackObservedUsers(ctx);

  const memberUpdate = ctx.chatMember;
  if (memberUpdate && isGroup(ctx.chat)) {
    const { user } = memberUpdate.new_chat_member;
    const status = memberUpdate.new_chat_member.status;
    if (status === "left" || status === "kicked") {
      forgetUser(ctx.chat.id, user.id);
    } else {
      rememberUser(ctx.chat.id, user);
    }
  }

  await next();
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Add me to a group and make me an administrator so I can observe member activity. " +
      "Then a group admin can use /tagall. I can only tag members I have observed since joining.",
  );
});

bot.command("tagall", async (ctx) => {
  if (!isGroup(ctx.chat)) {
    await ctx.reply("/tagall only works in a group or supergroup.");
    return;
  }

  const caller = ctx.from;
  if (!caller) {
    await ctx.reply("I could not identify the command sender.");
    return;
  }

  const callerStatus = await ctx.api.getChatMember(ctx.chat.id, caller.id);
  if (callerStatus.status !== "administrator" && callerStatus.status !== "creator") {
    await ctx.reply("Only group administrators can use /tagall.");
    return;
  }

  const now = Date.now();
  const lastUsedAt = lastTagAllAt.get(String(ctx.chat.id)) || 0;
  if (now - lastUsedAt < TAG_ALL_COOLDOWN_MS) {
    await ctx.reply("Please wait a minute before using /tagall again.");
    return;
  }

  const users = Object.values(usersByChat[String(ctx.chat.id)] || {});
  if (users.length === 0) {
    await ctx.reply("I have not observed any group members yet.");
    return;
  }

  lastTagAllAt.set(String(ctx.chat.id), now);
  await ctx.reply(`Tagging ${users.length} members I have observed in this group.`);

  const messages = splitMentions(users);
  for (let index = 0; index < messages.length; index += 1) {
    await ctx.api.sendMessage(ctx.chat.id, messages[index], {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    if (index < messages.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
  }
});

bot.catch((error) => {
  const message = error.error?.message || error.message || "Unknown error";
  console.error(`Telegram bot error: ${message}`);
});

bot.start({
  allowed_updates: ["message", "chat_member", "my_chat_member"],
});

console.log("Tag-all bot is running.");
