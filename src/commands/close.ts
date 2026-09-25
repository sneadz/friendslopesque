import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getProposal, closeProposal, getVoteCounts, getVotersByChoice, getAllOpenProposals } from '../db.js';
import { getAppDetails } from '../steam.js';
import { buildEmbed, buildVoteRow } from '../embed.js';

export const data = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Clôt le vote en cours dans ce salon')
  .addStringOption((opt) =>
    opt
      .setName('message_id')
      .setDescription("ID du message de proposition (optionnel — dernier en cours sinon)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  let messageId = interaction.options.getString('message_id');

  if (!messageId) {
    const open = getAllOpenProposals().filter((p) => p.channel_id === interaction.channelId);
    if (open.length === 0) {
      await interaction.editReply({ content: '❌ Aucune proposition ouverte dans ce salon.' });
      return;
    }
    // Take the last open one in this channel
    messageId = open[open.length - 1]!.message_id;
  }

  const proposal = getProposal(messageId);

  if (!proposal) {
    await interaction.editReply({ content: '❌ Proposition introuvable.' });
    return;
  }
  if (proposal.closed) {
    await interaction.editReply({ content: '⚠️ Ce vote est déjà clos.' });
    return;
  }

  // Only the original proposer or someone with Manage Messages may close
  const { member, user } = interaction;
  const canManage =
    member !== null &&
    'permissions' in member &&
    (member.permissions as { has(flag: bigint): boolean }).has(PermissionFlagsBits.ManageMessages);

  if (proposal.author_id !== user.id && !canManage) {
    await interaction.editReply({
      content: "❌ Seul l'auteur de la proposition ou un modérateur peut clore le vote.",
    });
    return;
  }

  closeProposal(messageId);
  const counts  = getVoteCounts(messageId);
  const voters  = getVotersByChoice(messageId);

  // Best-effort edit of the original message — DB state is authoritative even if this fails
  try {
    const channel = interaction.channel ?? (await interaction.client.channels.fetch(proposal.channel_id));
    if (channel?.isTextBased()) {
      const msg = await channel.messages.fetch(messageId);
      const app = await getAppDetails(proposal.app_id);
      if (app) {
        await msg.edit({
          embeds: [buildEmbed(app, counts, true, voters)],
          components: [buildVoteRow(true)],
        });
      }
    }
  } catch (err) {
    console.error('close: failed to edit original message:', err);
  }

  await interaction.editReply({ content: '✅ Vote clos.' });
}
