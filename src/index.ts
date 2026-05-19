import { ButtonInteraction, ChatInputCommandInteraction, Events } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { client } from './clients/discord';
import * as checkNicknames from './commands/checkNicknames';
import * as guildMemberAdd from './events/guildMemberAdd';
import * as approveMember from './events/approveMember';

const commands = new Map([
  [checkNicknames.data.name, checkNicknames],
]);

client.on(guildMemberAdd.name, guildMemberAdd.execute);

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('approve_member:')) {
    await approveMember.execute(interaction as ButtonInteraction).catch(console.error);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;
  await command.execute(interaction as ChatInputCommandInteraction).catch(console.error);
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
