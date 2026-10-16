function escapeVcard(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

// vCard 3.0 folds at 75 UTF-8 octets, including the continuation space.
function foldLine(line) {
  const lines = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > 75) {
      lines.push(current);
      current = " ";
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  lines.push(current);
  return lines.join("\r\n");
}

export function createCoachContactCard(profile, photo = null) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVcard(profile.surname)};${escapeVcard(profile.firstName)};;;`,
    `FN:${escapeVcard(`${profile.firstName} ${profile.surname}`)}`,
    `TEL;TYPE=CELL:${escapeVcard(profile.phone)}`,
    `EMAIL;TYPE=INTERNET,HOME:${escapeVcard(profile.email)}`,
    `URL:${escapeVcard(profile.linkedin)}`,
  ];
  if (photo?.buffer?.length) {
    const type = photo.mimeType === "image/png" ? "PNG" : "JPEG";
    lines.push(`PHOTO;ENCODING=b;TYPE=${type}:${photo.buffer.toString("base64")}`);
  }
  lines.push("END:VCARD");
  const safeName = `${profile.firstName}-${profile.surname}`
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "coach";
  return Object.freeze({
    filename: `${safeName}.vcf`,
    content: Buffer.from(`${lines.map(foldLine).join("\r\n")}\r\n`, "utf8"),
    contentType: "text/vcard; charset=utf-8",
  });
}
