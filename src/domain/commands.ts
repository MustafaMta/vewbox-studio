import type { StudioState } from './types';
import * as A from './actions';
import { withCommandContext } from './ids';

/** THE COMMAND SET — every studio action by name, so the browser and the server run the same function. A command
 *  is `{ name, args, seed, at }`: the seed fixes the ids it creates and `at` fixes its clock, so both sides agree. */

export const COMMANDS = {
  addShow: A.addShow, updateShow: A.updateShow, deleteShow: A.deleteShow,
  addSeason: A.addSeason, updateSeason: A.updateSeason, deleteSeason: A.deleteSeason,
  addProduction: A.addProduction, updateProduction: A.updateProduction, deleteProduction: A.deleteProduction, duplicateProduction: A.duplicateProduction,
  setStage: A.setStage, markStepDone: A.markStepDone, recordExport: A.recordExport, setCut: A.setCut,
  addScene: A.addScene, updateScene: A.updateScene, deleteScene: A.deleteScene, replaceScript: A.replaceScript,
  addShot: A.addShot, replaceSceneShots: A.replaceSceneShots, updateShot: A.updateShot, deleteShot: A.deleteShot, duplicateShot: A.duplicateShot, moveShot: A.moveShot, reorderShot: A.reorderShot, setShotContinuity: A.setShotContinuity,
  selectTake: A.selectTake, noteTake: A.noteTake, rejectTake: A.rejectTake, removeTake: A.removeTake, addTake: A.addTake, setShotFrames: A.setShotFrames, setDialogueAudio: A.setDialogueAudio,
  setSong: A.setSong, updateSong: A.updateSong,
  addCharacter: A.addCharacter, updateCharacter: A.updateCharacter, setPendingReference: A.setPendingReference, setCharacterAppearance: A.setCharacterAppearance, addCharacterRefs: A.addCharacterRefs,
  addVoiceSample: A.addVoiceSample, addVoiceRecording: A.addVoiceRecording, removeVoiceSample: A.removeVoiceSample, setVoiceIdentity: A.setVoiceIdentity, deleteCharacter: A.deleteCharacter, selectVoiceSample: A.selectVoiceSample,
  addLocation: A.addLocation, updateLocation: A.updateLocation, addLocationRefs: A.addLocationRefs, deleteLocation: A.deleteLocation,
  addAsset: A.addAsset, updateAsset: A.updateAsset, deleteAsset: A.deleteAsset,
  acceptProposal: A.acceptProposal,
  updateSettings: A.updateSettings,
} as const;

export type CommandName = keyof typeof COMMANDS;
type Fn<K extends CommandName> = (typeof COMMANDS)[K];
export type CommandArgs<K extends CommandName> = Parameters<Fn<K>> extends [StudioState, ...infer R] ? R : never;
type Raw<K extends CommandName> = ReturnType<Fn<K>>;
/** What a command hands back besides the state: the created show, scene, take… or nothing. */
export type CommandResult<K extends CommandName> = Raw<K> extends StudioState ? undefined : Raw<K> extends { state: StudioState } ? Omit<Raw<K>, 'state'> : never;

export interface Command<K extends CommandName = CommandName> { name: K; args: CommandArgs<K>; seed: string; at: string }

export const isCommandName = (x: unknown): x is CommandName => typeof x === 'string' && Object.prototype.hasOwnProperty.call(COMMANDS, x);

/** Apply one command. Throws StudioError for a refused command. */
export function runCommand<K extends CommandName>(state: StudioState, cmd: Command<K>): { state: StudioState; result: CommandResult<K> } {
  const fn = COMMANDS[cmd.name] as unknown as (s: StudioState, ...args: unknown[]) => StudioState | { state: StudioState };
  return withCommandContext(cmd.seed, cmd.at, () => {
    const out = fn(state, ...(cmd.args as unknown[]));
    if (out && typeof out === 'object' && 'state' in out && 'version' in (out as { state: StudioState }).state) {
      const { state: next, ...rest } = out as { state: StudioState } & Record<string, unknown>;
      return { state: next, result: rest as CommandResult<K> };
    }
    return { state: out as StudioState, result: undefined as CommandResult<K> };
  });
}
