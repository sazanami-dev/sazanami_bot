import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as checkNicknames from './commands/checkNicknames';

const commands = [checkNicknames.data.toJSON()];

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

(async () => {
  console.log('Registering slash commands...');
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID!,
      process.env.DISCORD_GUILD_ID!
    ),
    { body: commands }
  );
  console.log('Done.');
})();
