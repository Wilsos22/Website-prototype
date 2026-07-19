// Pure logic for Grudge Ball, the second live team review game.
//
// Deterministic and dependency-free so it runs on the server (the erase/revive
// rules are decided there) and in the browser (previews). Nothing here touches
// Supabase or the DOM. The question loop (grading, banks, vocab, sizing) is shared
// wholesale from bruhGame.ts - this file is only the grudge-specific bits.
//
// The rule that matters: the SERVER decides. The panel is just tapping; every
// erase and revive is validated here and written by the service-role route.

export interface GrudgeDefaults {
  startingLives: number;
  reviveWins: number;
  reviveLives: number;
  shootSeconds: number;
}

export const GRUDGE_DEFAULTS: GrudgeDefaults = {
  startingLives: 10,
  reviveWins: 2,
  reviveLives: 3,
  shootSeconds: 30,
};

/** The minimal team shape the pure rules need. */
export interface GrudgeScorable {
  id: string;
  lives: number;
  out: boolean;
  wins_while_out: number;
  nemesis_team_id: string | null;
}

export interface TeamUpdate {
  id: string;
  lives: number;
  out: boolean;
  nemesis_team_id: string | null;
}

export type EraseReason = "self" | "immune" | "not_found";

/**
 * One tap of the erase panel: the champion knocks a single X off a target.
 *
 * Erase model (Steele's call): the X does NOT move to the champion, it just comes
 * off the target. The champion gains nothing here - their makes are a budget to
 * hurt rivals, not to hoard. That is what keeps the leader from snowballing.
 *
 * Refused if the target is the champion itself, or the target is already at 0
 * (immunity - an out team cannot be kicked while down). Budget (makes vs
 * makes_spent) is enforced by the caller; this is a single, already-authorized tap.
 */
export function applyErase(
  target: GrudgeScorable | undefined,
  championId: string,
): { ok: true; update: TeamUpdate } | { ok: false; reason: EraseReason } {
  if (!target) return { ok: false, reason: "not_found" };
  if (target.id === championId) return { ok: false, reason: "self" };
  if (target.lives <= 0) return { ok: false, reason: "immune" };

  const lives = target.lives - 1;
  const nowOut = lives <= 0;
  return {
    ok: true,
    update: {
      id: target.id,
      lives,
      out: nowOut || target.out,
      // Whoever lands the zeroing blow becomes the nemesis - the team you come
      // back gunning for.
      nemesis_team_id: nowOut ? championId : target.nemesis_team_id,
    },
  };
}

/** An out team is eligible to revive once it has banked enough wins while out. */
export function reviveReady(team: GrudgeScorable, reviveWins: number): boolean {
  return team.out && team.wins_while_out >= reviveWins;
}

/**
 * Back with a grudge. The one place X's transfer rather than evaporate.
 *
 * The reviving team is GUARANTEED its comeback: it returns with `reviveLives` X's,
 * period. The revenge is a bonus - if the source (the nemesis, or a team the
 * teacher taps) still has X's, it loses up to `reviveLives`, and if that drives it
 * to 0 it goes out with the reviver as ITS new nemesis. A source already at 0 is
 * immune, so the comeback still happens but takes nothing.
 */
export function applyRevive(
  reviving: GrudgeScorable,
  source: GrudgeScorable | null,
  reviveLives: number,
): { reviving: TeamUpdate & { wins_while_out: number }; source: TeamUpdate | null } {
  const revivingUpdate = {
    id: reviving.id,
    lives: reviveLives,
    out: false,
    wins_while_out: 0,
    nemesis_team_id: null as string | null, // fresh start; the grudge is settled
  };

  let sourceUpdate: TeamUpdate | null = null;
  if (source && source.id !== reviving.id && source.lives > 0) {
    const take = Math.min(source.lives, reviveLives);
    const lives = source.lives - take;
    const nowOut = lives <= 0;
    sourceUpdate = {
      id: source.id,
      lives,
      out: nowOut || source.out,
      nemesis_team_id: nowOut ? reviving.id : source.nemesis_team_id,
    };
  }

  return { reviving: revivingUpdate, source: sourceUpdate };
}
