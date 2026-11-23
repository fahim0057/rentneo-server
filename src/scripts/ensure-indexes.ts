import { closeDb, getDb } from "../db";

async function main() {
  const db = await getDb();
  const equipment = db.collection("equipment");
  const favorites = db.collection("favorites");
  const bookings = db.collection("bookings");
  const payments = db.collection("payments");
  const reviews = db.collection("reviews");

  await Promise.all([
    equipment.createIndex({ status: 1, createdAt: -1 }),
    equipment.createIndex({ status: 1, category: 1 }),
    equipment.createIndex({ status: 1, rentalPrice: 1 }),
    equipment.createIndex({ ownerId: 1, createdAt: -1 }),
    favorites.createIndex({ userId: 1, equipmentId: 1 }, { unique: true }),
    favorites.createIndex({ userId: 1, createdAt: -1 }),
    bookings.createIndex({ customerId: 1, createdAt: -1 }),
    bookings.createIndex({ ownerId: 1, createdAt: -1 }),
    bookings.createIndex({ equipmentId: 1, startDate: 1, endDate: 1 }),
    bookings.createIndex({ paymentStatus: 1 }),
    bookings.createIndex({ bookingStatus: 1, createdAt: -1 }),
    payments.createIndex({ stripeSessionId: 1 }, { unique: true }),
    payments.createIndex({ ownerId: 1, createdAt: -1 }),
    payments.createIndex({ status: 1, createdAt: -1 }),
    reviews.createIndex({ equipmentId: 1, createdAt: -1 }),
    reviews.createIndex({ userId: 1, createdAt: -1 }),
    reviews.createIndex(
      { bookingId: 1 },
      { unique: true, partialFilterExpression: { bookingId: { $type: "string" } } }
    ),
  ]);

  console.log("Equipment, favorites, booking, payment and review indexes ensured.");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
