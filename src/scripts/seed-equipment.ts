import { getDb } from "../db";

const TERMS =
  "Valid ID required at pickup. A refundable deposit may apply. Return the equipment in the same condition and on time.";

type Seed = {
  name: string;
  category: string;
  location: string;
  rentalPrice: number;
  rentalType: "daily" | "weekly" | "monthly";
  availableQuantity: number;
  condition: "new" | "like-new" | "good" | "fair";
  brand: string;
  model: string;
  description: string;
};

const items: Seed[] = [
  { name: "Mini Excavator 3T", category: "Construction Equipment", location: "Dhaka", rentalPrice: 180, rentalType: "daily", availableQuantity: 3, condition: "good", brand: "TerraWorks", model: "TX-30", description: "Compact 3-tonne excavator for trenching, foundations and small site work." },
  { name: "Concrete Mixer 350L", category: "Construction Equipment", location: "Chattogram", rentalPrice: 40, rentalType: "daily", availableQuantity: 5, condition: "good", brand: "MixPro", model: "M350", description: "Portable 350 litre drum mixer suited to residential building jobs." },
  { name: "Scaffolding Set", category: "Construction Equipment", location: "Dhaka", rentalPrice: 90, rentalType: "weekly", availableQuantity: 10, condition: "fair", brand: "SafeRise", model: "SR-200", description: "Steel scaffolding set with platforms and guard rails for exterior work." },
  { name: "DSLR Camera Kit", category: "Photography Equipment", location: "Dhaka", rentalPrice: 35, rentalType: "daily", availableQuantity: 4, condition: "like-new", brand: "LensCraft", model: "LC-5D", description: "Full-frame DSLR with two lenses, batteries and a padded travel bag." },
  { name: "Cinema Lens Set", category: "Photography Equipment", location: "Sylhet", rentalPrice: 60, rentalType: "daily", availableQuantity: 2, condition: "like-new", brand: "LensCraft", model: "CL-3", description: "Three prime cinema lenses with matched color for video production." },
  { name: "Studio Lighting Kit", category: "Photography Equipment", location: "Dhaka", rentalPrice: 120, rentalType: "weekly", availableQuantity: 3, condition: "good", brand: "LumaStudio", model: "LS-600", description: "Three softbox strobes with stands, triggers and diffusers." },
  { name: "Pickup Truck", category: "Vehicles & Transportation", location: "Khulna", rentalPrice: 70, rentalType: "daily", availableQuantity: 2, condition: "good", brand: "HaulMate", model: "HM-4x4", description: "Reliable pickup truck for moving materials and equipment between sites." },
  { name: "Cargo Van", category: "Vehicles & Transportation", location: "Dhaka", rentalPrice: 450, rentalType: "weekly", availableQuantity: 0, condition: "good", brand: "HaulMate", model: "CV-12", description: "Spacious cargo van for deliveries, currently fully booked." },
  { name: "Compact Tractor", category: "Agriculture Equipment", location: "Rajshahi", rentalPrice: 900, rentalType: "monthly", availableQuantity: 2, condition: "good", brand: "FieldKing", model: "FK-45", description: "45 horsepower compact tractor with plough attachment for seasonal use." },
  { name: "Irrigation Water Pump", category: "Agriculture Equipment", location: "Bogura", rentalPrice: 25, rentalType: "daily", availableQuantity: 6, condition: "good", brand: "AquaFlow", model: "AF-3", description: "High-flow diesel water pump for field irrigation and drainage." },
  { name: "Laptop Workstation", category: "Electronics", location: "Dhaka", rentalPrice: 300, rentalType: "monthly", availableQuantity: 5, condition: "like-new", brand: "CoreBook", model: "CB-16 Pro", description: "High-performance 16 inch laptop for editing, design and development work." },
  { name: "4K Projector", category: "Electronics", location: "Chattogram", rentalPrice: 30, rentalType: "daily", availableQuantity: 3, condition: "like-new", brand: "ViewMax", model: "VM-4K", description: "Bright 4K projector with HDMI inputs, ideal for presentations and events." },
  { name: "PA Speaker System", category: "Event Equipment", location: "Dhaka", rentalPrice: 55, rentalType: "daily", availableQuantity: 4, condition: "good", brand: "SoundBox", model: "SB-15", description: "Powered 15 inch speakers with stands and a mixer for events up to 200 guests." },
  { name: "Event Tent 10x10 m", category: "Event Equipment", location: "Gazipur", rentalPrice: 110, rentalType: "weekly", availableQuantity: 6, condition: "good", brand: "ShadeCo", model: "ST-100", description: "Waterproof frame tent for weddings, markets and outdoor gatherings." },
  { name: "Diesel Generator 5kVA", category: "Event Equipment", location: "Dhaka", rentalPrice: 65, rentalType: "daily", availableQuantity: 3, condition: "good", brand: "VoltEdge", model: "VE-5K", description: "Quiet 5kVA diesel generator for events and construction sites." },
];

async function main() {
  const db = await getDb();
  const col = db.collection("equipment");

  if (process.argv.includes("--clear")) {
    const r = await col.deleteMany({ seeded: true });
    console.log(`Removed ${r.deletedCount} demo items.`);
    process.exit(0);
  }

  if ((await col.countDocuments({ seeded: true })) > 0) {
    console.log("Demo equipment already exists. Run with --clear to remove it first.");
    process.exit(0);
  }

  const owner = await db.collection("user").findOne({ role: "owner" });
  if (!owner) {
    console.log('No user with role "owner" found. Set one in Atlas or the admin Users page first.');
    process.exit(1);
  }

  const now = Date.now();
  await col.insertMany(
    items.map((item, i) => ({
      ...item,
      image: `https://placehold.co/800x600/1e293b/f97316?text=${item.name.replace(/ /g, "+")}`,
      terms: TERMS,
      status: "approved",
      ownerId: String(owner._id),
      ownerName: owner.name,
      ownerEmail: owner.email,
      seeded: true,
      createdAt: new Date(now - i * 3_600_000),
      updatedAt: new Date(now),
    }))
  );
  console.log(`Inserted ${items.length} demo items for owner ${owner.email}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});