import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const categories = [
  { name: "Home", slug: "home" },
  { name: "Apparel", slug: "apparel" },
  { name: "Kitchen", slug: "kitchen" },
  { name: "Beauty", slug: "beauty" },
];

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: process.env.ADMIN_NAME || "Admin",
        email,
        passwordHash,
        role: "ADMIN",
        cart: { create: {} },
      },
    });
  }

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  console.log("Categories are ready.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
