import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env['DATA_DIR']
  ? path.join(process.env['DATA_DIR'], 'votes.db')
  : path.join(__dirname, '..', 'votes.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS proposals (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    app_id     INTEGER NOT NULL,
    author_id  TEXT NOT NULL,
    closed     INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS votes (
    message_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    choice     TEXT NOT NULL CHECK(choice IN ('yes','no')),
    PRIMARY KEY (message_id, user_id)
  );
`);

export interface Proposal {
  message_id: string;
  channel_id: string;
  app_id: number;
  author_id: string;
  closed: boolean;
}

export type VoteChoice = 'yes' | 'no';

export interface VoteCounts {
  yes: number;
  no: number;
}

const insertProposal = db.prepare<[string, string, number, string]>(
  'INSERT INTO proposals (message_id, channel_id, app_id, author_id) VALUES (?, ?, ?, ?)'
);

const selectProposal = db.prepare<[string]>(
  'SELECT * FROM proposals WHERE message_id = ?'
);

const updateClose = db.prepare<[string]>(
  'UPDATE proposals SET closed = 1 WHERE message_id = ?'
);

const selectVote = db.prepare<[string, string]>(
  'SELECT choice FROM votes WHERE message_id = ? AND user_id = ?'
);

const upsertVote = db.prepare<[string, string, string]>(
  'INSERT OR REPLACE INTO votes (message_id, user_id, choice) VALUES (?, ?, ?)'
);

const deleteVote = db.prepare<[string, string]>(
  'DELETE FROM votes WHERE message_id = ? AND user_id = ?'
);

const countVotes = db.prepare<[string]>(`
  SELECT
    COALESCE(SUM(CASE WHEN choice = 'yes' THEN 1 ELSE 0 END), 0) AS yes,
    COALESCE(SUM(CASE WHEN choice = 'no'  THEN 1 ELSE 0 END), 0) AS no
  FROM votes WHERE message_id = ?
`);

const selectOpen = db.prepare(
  'SELECT * FROM proposals WHERE closed = 0'
);

const selectVoters = db.prepare<[string]>(
  'SELECT user_id, choice FROM votes WHERE message_id = ?'
);

export function saveProposal(messageId: string, channelId: string, appId: number, authorId: string): void {
  insertProposal.run(messageId, channelId, appId, authorId);
}

export function getProposal(messageId: string): Proposal | undefined {
  const row = selectProposal.get(messageId) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return { ...(row as Omit<Proposal, 'closed'>), closed: row['closed'] === 1 };
}

export function closeProposal(messageId: string): void {
  updateClose.run(messageId);
}

export function getAllOpenProposals(): Proposal[] {
  return (selectOpen.all() as Record<string, unknown>[]).map(
    (row) => ({ ...(row as Omit<Proposal, 'closed'>), closed: false })
  );
}

/**
 * Toggle logic:
 *   - Same button again → remove vote (return null)
 *   - Opposite button   → change vote (return new choice)
 *   - No prior vote     → add vote    (return choice)
 */
export function castVote(messageId: string, userId: string, choice: VoteChoice): VoteChoice | null {
  const existing = selectVote.get(messageId, userId) as { choice: string } | undefined;
  if (existing?.choice === choice) {
    deleteVote.run(messageId, userId);
    return null;
  }
  upsertVote.run(messageId, userId, choice);
  return choice;
}

export function getVoteCounts(messageId: string): VoteCounts {
  const row = countVotes.get(messageId) as { yes: number; no: number };
  return { yes: row.yes, no: row.no };
}

export interface VoterMap {
  yes: string[];
  no: string[];
}

export function getVotersByChoice(messageId: string): VoterMap {
  const rows = selectVoters.all(messageId) as { user_id: string; choice: string }[];
  return {
    yes: rows.filter((r) => r.choice === 'yes').map((r) => r.user_id),
    no:  rows.filter((r) => r.choice === 'no').map((r) => r.user_id),
  };
}
