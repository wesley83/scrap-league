export const CUP_SCENES = [
  {
    title: "THE GATES ARE OPEN.",
    caption:
      "A forgotten yard. A handful of good parts. Finish three races and give this club a reason to stay open.",
  },
  {
    title: "TAKE IT TO THE DOCKS.",
    caption:
      "The crew found a new line between the containers. Brake early, leave room, and bring those parts home.",
  },
  {
    title: "KEEP THE FURNACE LIT.",
    caption:
      "Mud, steel and a little stubbornness. Three more finishes will pay for the final circuit’s floodlights.",
  },
  {
    title: "ONE LAST NIGHT SHIFT.",
    caption:
      "The grandstand is nearly ready. Twelve circuits led here. Find your line and finish what the crew started.",
  },
];
export const FINAL_SCENE = {
  title: "THE YARD IS YOURS.",
  caption:
    "The floodlights are up. The grandstand is open. All twelve events are complete. You built the car that brought the club back. Now build its next great circuit.",
};
export function sceneProgress(elapsed, reducedMotion) {
  return reducedMotion ? 1 : Math.max(0, Math.min(1, elapsed / 4.5));
}
