import 'dotenv/config';
import { Client, GatewayIntentBits, type Interaction } from 'discord.js';
import * as proposeCmd from './commands/propose.js';
import * as closeCmd from './commands/close.js';
import { castVote, getVoteCounts, getVotersByChoice, getProposal } from './db.js';
import { buildVoteRow, updateVoteFields, VOTE_YES_ID, VOTE_NO_ID } from './embed.js';

const token = process.env['DISCORD_TOKEN'];
if (!token) throw new Error('DISCORD_TOKEN is not set in .env');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = new Map([
  [proposeCmd.data.name, proposeCmd],
  [closeCmd.data.name,   closeCmd],
]);

client.once('clientReady', (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  // --- Slash commands ---
  if (interaction.isChatInputCommand()) {
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      console.error(`[${interaction.commandName}]`, err);
      const payload = { content: '❌ Une erreur inattendue est survenue.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
    return;
  }

  // --- Vote buttons ---
  if (interaction.isButton()) {
    const { customId, message, user } = interaction;
    if (customId !== VOTE_YES_ID && customId !== VOTE_NO_ID) return;

    await interaction.deferUpdate();

    console.log(`[vote] button=${customId} message=${message.id} user=${user.id}`);

    const proposal = getProposal(message.id);
    if (!proposal) {
      console.warn(`[vote] no proposal found for message ${message.id}`);
      return;
    }
    if (proposal.closed) return;

    const choice = customId === VOTE_YES_ID ? 'yes' : 'no';
    castVote(message.id, user.id, choice);
    const counts  = getVoteCounts(message.id);
    const voters  = getVotersByChoice(message.id);

    const existing = message.embeds[0];
    if (!existing) return;

    try {
      await message.edit({
        embeds: [updateVoteFields(existing, counts, voters)],
        components: [buildVoteRow()],
      });
    } catch (err) {
      console.error('[vote] failed to edit message:', err);
    }
  }
});

client.login(token);
