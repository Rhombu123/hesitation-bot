import type { VoiceState } from "discord.js";
import { syncVoiceState } from "../services/voiceXp.js";

export function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
  syncVoiceState(oldState, newState);
}
