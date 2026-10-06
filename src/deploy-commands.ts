import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as checkNicknames from './commands/checkNicknames';
import * as timesPanel from './commands/timesPanel';
import * as ticketPanel from './commands/ticketPanel';
import * as ticketCreate from './commands/ticketCreate';

const commands = [
  checkNicknames.data.toJSON(),
  timesPanel.data.toJSON(),
  ticketPanel.data.toJSON(),
  ticketCreate.data.toJSON(),
];

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('DISCORD_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID が未設定です');
  process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
  console.log('Registering slash commands...');
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log('Done.');
})().catch((error) => {
  // デプロイ時に失敗を検知できるよう、終了コードで知らせる
  console.error('Failed to register slash commands:', error);
  process.exit(1);
});
