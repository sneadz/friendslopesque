import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ComponentType,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { searchApps, getAppDetails } from '../steam.js';
import { saveProposal } from '../db.js';
import { buildEmbed, buildVoteRow } from '../embed.js';

export const data = new SlashCommandBuilder()
  .setName('propose')
  .setDescription('Propose un jeu Steam pour jouer ensemble')
  .addStringOption((opt) =>
    opt.setName('game').setDescription('Nom du jeu').setRequired(true)
  );

const STEAM_URL_RE = /store\.steampowered\.com\/app\/(\d+)/;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString('game', true);

  // Defer immediately — Steam search + appdetails can exceed 3 s
  await interaction.deferReply();

  // Direct Steam URL — skip search entirely
  const urlMatch = STEAM_URL_RE.exec(query);
  if (urlMatch) {
    await postProposal(interaction, Number(urlMatch[1]));
    return;
  }

  let results;
  try {
    results = await searchApps(query);
  } catch {
    await interaction.editReply({ content: '❌ Erreur lors de la recherche Steam. Réessaie dans un instant.' });
    return;
  }

  if (results.length === 0) {
    await interaction.editReply({ content: `❌ Aucun jeu trouvé pour **${query}**.` });
    return;
  }

  const candidates = results.slice(0, 5);

  if (candidates.length === 1) {
    await postProposal(interaction, candidates[0]!.appid);
    return;
  }

  // Multiple candidates — show a select menu (max 5 entries, within Discord's 25-option limit)
  const select = new StringSelectMenuBuilder()
    .setCustomId('select_game')
    .setPlaceholder('Sélectionne le bon jeu…')
    .addOptions(
      candidates.map((r) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(r.name.slice(0, 100))
          .setValue(String(r.appid))
      )
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const reply = await interaction.editReply({
    content: `Plusieurs résultats pour **${query}** :`,
    components: [row],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.user.id === interaction.user.id,
    time: 30_000,
    max: 1,
  });

  collector.on('collect', async (sel) => {
    await sel.deferUpdate();
    await postProposal(interaction, Number(sel.values[0]));
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ content: '⏱ Temps écoulé, aucun jeu sélectionné.', components: [] });
    }
  });
}

async function postProposal(interaction: ChatInputCommandInteraction, appid: number): Promise<void> {
  let app;
  try {
    app = await getAppDetails(appid);
  } catch {
    await interaction.editReply({
      content: '❌ Impossible de charger les détails depuis Steam.',
      components: [],
    });
    return;
  }

  if (!app) {
    // Storefront returned success: false — age-gate or delisted title
    await interaction.editReply({
      content: '❌ Ce jeu est inaccessible via l\'API Steam (titre âge-gatté ou retiré de la boutique).',
      components: [],
    });
    return;
  }

  const counts = { yes: 0, no: 0 };
  const msg = await interaction.editReply({
    content: '',
    embeds: [buildEmbed(app, counts)],
    components: [buildVoteRow()],
  });

  saveProposal(msg.id, interaction.channelId, appid, interaction.user.id);
}
