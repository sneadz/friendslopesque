import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import * as proposeCmd from './commands/propose.js';
import * as closeCmd from './commands/close.js';

const token     = process.env['DISCORD_TOKEN'];
const clientId  = process.env['DISCORD_CLIENT_ID'];
const guildId   = process.env['DISCORD_GUILD_ID'];

if (!token || !clientId || !guildId) {
  throw new Error('Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID in .env');
}

const rest = new REST().setToken(token);
const body = [proposeCmd.data.toJSON(), closeCmd.data.toJSON()];

const registered = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
console.log(`Registered ${(registered as unknown[]).length} slash commands on guild ${guildId}.`);
