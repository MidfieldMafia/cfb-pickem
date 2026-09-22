import sharp from "sharp";

/**
 * A real JPEG, the way the crop's canvas would send one: a gradient rather
 * than a flat fill so its bytes are a plausible size, and a different `seed`
 * gives different bytes, so a replaced photo gets a new hash.
 */
export async function jpeg(
  { width = 216, height = 216, seed = 0, progressive = false } = {},
): Promise<Uint8Array> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      pixels[at] = (x + seed * 40) % 256;
      pixels[at + 1] = (y * 2 + seed) % 256;
      pixels[at + 2] = (x + y + seed * 7) % 256;
    }
  }
  const out = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 85, progressive })
    .toBuffer();
  return new Uint8Array(out);
}

/** Right size, wrong format. A flat fill, so it is small enough that only the format is wrong. */
export async function png(): Promise<Uint8Array> {
  const flat = sharp({ create: { width: 216, height: 216, channels: 3, background: "#b3261e" } });
  return new Uint8Array(await flat.png().toBuffer());
}

/** The welcome form as the crop UI posts it: a name, an `avatarId`, and maybe a `photo` file. */
export function welcomeForm(fields: { displayName: string; avatarId: string; photo?: Uint8Array }): FormData {
  const data = new FormData();
  data.append("displayName", fields.displayName);
  data.append("avatarId", fields.avatarId);
  if (fields.photo) data.append("photo", new File([fields.photo.slice()], "image.jpg", { type: "image/jpeg" }));
  return data;
}
