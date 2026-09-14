/** Node copy of packages/player/src/live/pinboard-card.ts for isolated DOM regressions. */
export function fillPinboardCard(card, submission, host) {
  card.replaceChildren();
  const imagePath = String(submission.imagePath || "");
  if (imagePath) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = `${imagePath}${imagePath.includes("?") ? "&" : "?"}code=${encodeURIComponent(host?.code || "")}&hostKey=${encodeURIComponent(host?.hostKey || "")}`;
    card.appendChild(img);
  }
  const p = document.createElement("p");
  p.textContent = String(submission.text || "");
  card.appendChild(p);
  const small = document.createElement("small");
  small.textContent = `#${String(submission.participantNumber ?? "")} · ${String(submission.status || "")}`;
  card.appendChild(small);
}
