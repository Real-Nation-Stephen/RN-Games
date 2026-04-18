/**
 * Scratcher format tests — design-space layout + asset paths under /play/scratchers-test/<id>/
 * @typedef {'16x9' | '1x1' | '9x16' | '4x3'} ScratcherFormatId
 */

const B = (import.meta.env.BASE_URL || "/play/").replace(/\/?$/, "/");

/**
 * @typedef {{
 *   designW: number;
 *   designH: number;
 *   active: { left: number; top: number; width: number; height: number };
 *   buttonBottom: number;
 *   button: { width: number; height: number };
 *   orientationGate: 'landscape' | 'portrait' | 'square';
 *   winLose: boolean;
 *   brushMul: number;
 *   gate: { title: string; body: string };
 *   assets: (outcome?: 'win' | 'lose') => { top: string; bottom: string; button: string };
 * }} ScratcherFormat
 */

/** @type {Record<string, ScratcherFormat>} */
export const FORMATS = {
  "16x9": {
    designW: 1920,
    designH: 1080,
    active: { left: 310, top: 180, width: 1300, height: 700 },
    buttonBottom: 178,
    button: { width: 300, height: 60 },
    orientationGate: "landscape",
    winLose: false,
    brushMul: 1,
    gate: {
      title: "Rotate your device",
      body: "This build is for a wide landscape layout (about 5∶4 width-to-height or wider). Use a landscape screen or wider window.",
    },
    assets() {
      return {
        top: `${B}scratchers-test/16x9/Scratcher_Top%20CTA_Re-turn.png`,
        bottom: `${B}scratchers-test/16x9/Scratcher_Bottom%20Image%20Reveal_Return.png`,
        button: `${B}scratchers-test/16x9/Scratcher_Button_1_Re-turn.png`,
      };
    },
  },

  "1x1": {
    designW: 1920,
    designH: 1920,
    active: { left: 310, top: 310, width: 1300, height: 1300 },
    buttonBottom: 375,
    button: { width: 300, height: 60 },
    orientationGate: "square",
    winLose: true,
    brushMul: 1,
    gate: {
      title: "Adjust your window",
      body: "This scratch card is designed for a 1∶1 (square) stage. Resize to a roughly square view for the intended layout.",
    },
    assets(outcome) {
      const win = outcome !== "lose";
      return {
        top: `${B}scratchers-test/1x1/Scratcher_1x1_Top_Return.png`,
        bottom: win
          ? `${B}scratchers-test/1x1/Scratcher_1x1_Bottom%20Win_Return.png`
          : `${B}scratchers-test/1x1/Scratcher_1x1_Bottom%20Lose_Return.png`,
        button: `${B}scratchers-test/1x1/Scratcher_1x1_Button_Return.png`,
      };
    },
  },

  "9x16": {
    designW: 1080,
    designH: 1920,
    active: { left: 0, top: 0, width: 1080, height: 1920 },
    buttonBottom: 450,
    button: { width: 600, height: 120 },
    orientationGate: "portrait",
    winLose: false,
    /** +30% wipe vs previous 1.15 */
    brushMul: 1.495,
    gate: {
      title: "Use portrait",
      body: "This 9∶16 scratch card is built for portrait. Rotate your phone upright or use a taller window.",
    },
    assets() {
      return {
        top: `${B}scratchers-test/9x16/Scratcher_9x16_Top_Return.png`,
        bottom: `${B}scratchers-test/9x16/Scratcher_9x16_Bottom%20Win_Return.png`,
        button: `${B}scratchers-test/9x16/Scratcher_9x16_Button_Return.png`,
      };
    },
  },

  "4x3": {
    designW: 1920,
    designH: 1440,
    active: { left: 310, top: 233, width: 1300, height: 975 },
    /** 25% less padding than prior 200px */
    buttonBottom: 150,
    /** +50% vs default 300×60 */
    button: { width: 450, height: 90 },
    orientationGate: "landscape",
    winLose: true,
    brushMul: 1,
    gate: {
      title: "Rotate your device",
      body: "This build is for a wide landscape layout (4∶3 stage). Use a landscape screen or wider window.",
    },
    assets(outcome) {
      const win = outcome !== "lose";
      return {
        top: `${B}scratchers-test/4x3/Scratcher_4x3_Top_Return.png`,
        bottom: win
          ? `${B}scratchers-test/4x3/Scratcher_4x3_Bottom%20Win_Return.png`
          : `${B}scratchers-test/4x3/Scratcher_4x3_Bottom%20Lose_Return.png`,
        button: `${B}scratchers-test/4x3/Scratcher_4x3_Button_Return.png`,
      };
    },
  },
};

/** @param {string} id */
export function getFormatOrThrow(id) {
  const f = FORMATS[id];
  if (!f) throw new Error(`Unknown scratcher format: ${id}`);
  return f;
}
