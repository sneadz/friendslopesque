import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Embed,
} from 'discord.js';
import type { SteamAppDetails } from './steam.js';
import type { VoteCounts, VoterMap } from './db.js';

export const VOTE_YES_ID = 'vote_yes';
export const VOTE_NO_ID = 'vote_no';

function formatVoters(ids: string[]): string {
  return ids.length ? ids.map((id) => `<@${id}>`).join(' ') : '–';
}

export function buildEmbed(
  app: SteamAppDetails,
  counts: VoteCounts,
  closed = false,
  voters: VoterMap = { yes: [], no: [] },
): EmbedBuilder {
  const trailerUrl = app.movies?.[0]?.mp4?.max ?? app.movies?.[0]?.webm?.max ?? null;
  const storeUrl = `https://store.steampowered.com/app/${app.steam_appid}`;

  const links = [`[Page Steam](${storeUrl})`];
  if (trailerUrl) links.push(`[Trailer](${trailerUrl})`);

  const price = app.price_overview
    ? app.price_overview.discount_percent > 0
      ? `~~${app.price_overview.initial_formatted}~~ **${app.price_overview.final_formatted}** (-${app.price_overview.discount_percent}%)`
      : `**${app.price_overview.final_formatted}**`
    : '**Gratuit**';

  const embed = new EmbedBuilder()
    .setTitle(app.name)
    .setDescription(app.short_description || 'Aucune description disponible.')
    .setImage(app.header_image)
    .setColor(closed ? 0x5865f2 : 0x1b2838)
    .addFields(
      { name: `🎮 Grave chaud ! (${counts.yes})`, value: formatVoters(voters.yes), inline: true },
      { name: `💤 C'est non. (${counts.no})`,    value: formatVoters(voters.no),  inline: true },
      { name: 'Prix', value: price, inline: true },
      { name: 'Liens', value: links.join(' · ') },
    );

  if (closed) {
    const verdict =
      counts.yes > counts.no ? '🎮 Le groupe joue !'            :
      counts.yes < counts.no ? '💤 Pas assez motivé.'            :
                               '🤝 Égalité — à vous de trancher !';
    embed.setFooter({ text: `Vote clos · ${verdict}` });
  }

  return embed;
}

// Clone l'embed existant du message et met à jour uniquement les champs de vote.
// Évite tout appel à l'API Steam sur chaque clic de bouton.
export function updateVoteFields(
  existing: Embed,
  counts: VoteCounts,
  voters: VoterMap,
): EmbedBuilder {
  return EmbedBuilder.from(existing).setFields(
    { name: `🎮 Grave chaud ! (${counts.yes})`, value: formatVoters(voters.yes), inline: true },
    { name: `💤 C'est non. (${counts.no})`,     value: formatVoters(voters.no),  inline: true },
    ...existing.fields.slice(2), // conserve "Liens" et tout champ suivant
  );
}

export function buildVoteRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(VOTE_YES_ID)
      .setLabel('Grave chaud !')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(VOTE_NO_ID)
      .setLabel("C'est non.")
      .setEmoji('💤')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}
