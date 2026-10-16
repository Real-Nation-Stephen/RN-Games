/** Scale the full presenter (including QR) against a stable design height.
 * Only the live presenter uses this; phones and standalone games are untouched.
 */
export function startPresenterSize(stage: HTMLElement) {
  let percent = 100;
  const layout = () => {
    const width = window.innerWidth, height = window.innerHeight;
    const fit = Math.min(width / 1600, height / 900);
    const scale = Math.max(0.1, fit * percent / 100);
    stage.style.width = `${width / scale}px`;
    stage.style.height = `${height / scale}px`;
    stage.style.transform = `scale(${scale})`;
  };
  stage.classList.add('live-scaled-stage');
  window.addEventListener('resize', layout);
  layout();
  return (value: unknown) => {
    percent = Math.max(75, Math.min(150, Number(value) || 100));
    layout();
  };
}
