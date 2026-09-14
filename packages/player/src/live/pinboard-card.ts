type PinHost = { code: string; hostKey: string };

export function fillPinboardCard(card: HTMLElement, submission: Record<string, unknown>, host?: PinHost) {
  card.replaceChildren();
  const imagePath = String(submission.imagePath || "");
  if (imagePath) {
    const img = document.createElement("img");
    img.alt = "";
    const src = new URL(imagePath, "https://live.local");
    if (host?.code) src.searchParams.set("code", host.code);
    if (host?.hostKey) src.searchParams.set("hostKey", host.hostKey);
    img.src = imagePath.startsWith("http") || imagePath.startsWith("/")
      ? `${imagePath}${imagePath.includes("?") ? "&" : "?"}code=${encodeURIComponent(host?.code || "")}&hostKey=${encodeURIComponent(host?.hostKey || "")}`
      : src.pathname + src.search;
    card.appendChild(img);
  }
  const p = document.createElement("p");
  p.textContent = String(submission.text || "");
  card.appendChild(p);
  const small = document.createElement("small");
  small.textContent = `#${String(submission.participantNumber ?? "")} · ${String(submission.status || "")}`;
  card.appendChild(small);
}
