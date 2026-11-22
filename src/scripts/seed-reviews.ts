import { getDb } from "../db";

const reviews = [
  { name: "Maya Rahman", rating: 5, comment: "Rented a DSLR kit for a wedding shoot. Clean gear, easy pickup, and the owner was very helpful." },
  { name: "Daniel Okoye", rating: 5, comment: "The excavator arrived on time and the pricing was far cheaper than buying. Booking took minutes." },
  { name: "Sofia Alvarez", rating: 4, comment: "Great selection of event lighting. One item needed a quick replacement, but support sorted it fast." },
  { name: "Arjun Mehta", rating: 5, comment: "As an owner, listing my equipment was simple and payouts were transparent. Already booked twice." },
  { name: "Hannah Weber", rating: 4, comment: "Found a drone and a laptop in the same place. Clear terms and no surprise fees." },
  { name: "Tariq Hossain", rating: 5, comment: "Secure payment and a verified owner gave me confidence renting a tractor for the season." },
];

async function main() {
  const col = (await getDb()).collection("reviews");
  const count = await col.countDocuments();
  if (count > 0) {
    console.log(`Reviews already exist (${count}). Nothing to do.`);
    process.exit(0);
  }
  await col.insertMany(
    reviews.map((r, i) => ({ ...r, createdAt: new Date(Date.now() - i * 86_400_000) }))
  );
  console.log(`Inserted ${reviews.length} reviews.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});