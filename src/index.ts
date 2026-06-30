import { ButtonInteraction, ChatInputCommandInteraction, Events } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { client } from './clients/discord';
import * as checkNicknames from './commands/checkNicknames';
import * as timesPanel from './commands/timesPanel';
import * as ticketPanel from './commands/ticketPanel';
import * as ticketCreate from './commands/ticketCreate';
import * as times from './events/times';
import * as ticket from './events/ticket';
import * as guildMemberAdd from './events/guildMemberAdd';
import * as approveMember from './events/approveMember';

const commands = new Map([
  [checkNicknames.data.name, checkNicknames],
  [timesPanel.data.name, timesPanel],
  [ticketPanel.data.name, ticketPanel],
  [ticketCreate.data.name, ticketCreate],
]);

client.on(guildMemberAdd.name, guildMemberAdd.execute);

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('approve_member:')) {
      await approveMember.execute(interaction as ButtonInteraction).catch(console.error);
      return;
    }
    if (interaction.customId === times.TIMES_BUTTON_ID) {
      await times.handleButton(interaction).catch(console.error);
      return;
    }
    if (interaction.customId === ticket.TICKET_BUTTON_ID) {
      await ticket.handleButton(interaction).catch(console.error);
      return;
    }
    if (interaction.customId === ticket.TICKET_CLOSE_ID) {
      await ticket.handleClose(interaction).catch(console.error);
      return;
    }
    if (interaction.customId === ticket.TICKET_REOPEN_ID) {
      await ticket.handleReopen(interaction).catch(console.error);
      return;
    }
    return;
  }
  if (interaction.isModalSubmit()) {
    if (interaction.customId === times.TIMES_MODAL_ID) {
      await times.handleModal(interaction).catch(console.error);
      return;
    }
    if (interaction.customId === ticket.TICKET_MODAL_ID) {
      await ticket.handleModal(interaction).catch(console.error);
      return;
    }
    if (interaction.customId.startsWith(ticket.TICKET_STAFF_MODAL_PREFIX)) {
      await ticket.handleStaffCreateModal(interaction).catch(console.error);
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;
  await command.execute(interaction as ChatInputCommandInteraction).catch(console.error);
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);

  // 閉鎖から1週間経過したチケットを定期的に削除する（起動時 + 1時間ごと）
  ticket.sweepClosedTickets().catch(console.error);
  setInterval(() => {
    ticket.sweepClosedTickets().catch(console.error);
  }, 60 * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);
