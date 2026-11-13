export function slugify(input: string) {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "item";
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
) {
  const root = slugify(base);
  if (!(await exists(root))) return root;
  for (let i = 2; i < 50; i += 1) {
    const next = `${root}-${i}`;
    if (!(await exists(next))) return next;
  }
  return `${root}-${Date.now().toString().slice(-6)}`;
}
