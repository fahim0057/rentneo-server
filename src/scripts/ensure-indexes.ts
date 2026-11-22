import { closeDb, getDb } from "../db";

async function main() {
  const db = await getDb();
  const equipment = db.collection("equipment");

  await Promise.all([
    equipment.createIndex({ status: 1, createdAt: -1 }),
    equipment.createIndex({ status: 1, category: 1 }),
    equipment.createIndex({ status: 1, rentalPrice: 1 }),
    equipment.createIndex({ ownerId: 1, createdAt: -1 }),
  ]);

  console.log("Equipment indexes ensured.");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
