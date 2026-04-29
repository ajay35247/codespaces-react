/**
 * Database Seed Script
 *
 * Populates the database with:
 *  - Subscription plans (free, basic, standard, premium)
 *  - Demo users for each role (shipper, driver, truck_owner, broker)
 *
 * Usage:
 *   node src/scripts/seed.js
 *   node src/scripts/seed.js --reset   # Drop existing seed data first
 *
 * Environment:
 *   Reads from .env in the backend directory (same as the main server).
 *   Set MONGODB_URI to point at the target database.
 *
 * WARNING: Never run with --reset against a production database.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// ── Schema imports ────────────────────────────────────────────────────────────
import SubscriptionPlan from '../schemas/SubscriptionPlanSchema.js';
import User from '../schemas/UserSchema.js';

// ── Config ────────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/speedy-trucks';
const RESET_FLAG = process.argv.includes('--reset');

// ── Seed data ─────────────────────────────────────────────────────────────────

/**
 * Subscription plans that mirror the PLAN_FEATURES constants in
 * backend/src/middleware/subscription.js.  Admin can adjust prices from the
 * admin panel at any time; these are the launch defaults.
 */
const PLAN_SEEDS = [
  {
    name: 'Free',
    code: 'free',
    description: 'Get started with basic load browsing. No payment required.',
    active: true,
    trialDays: 0,
    taxPercent: 0,
    platformFeePercent: 0,
    pricing: {
      monthly: 0,
      yearly: 0,
    },
    featureMapping: [
      { key: 'loadsPerDay',        enabled: true,  limit: 3 },
      { key: 'bidsPerDay',         enabled: true,  limit: 5 },
      { key: 'walletWithdrawals',  enabled: false },
      { key: 'aiMatching',         enabled: false },
      { key: 'advancedAnalytics',  enabled: false },
      { key: 'prioritySupport',    enabled: false },
      { key: 'priorityVisibility', enabled: false },
      { key: 'premiumBadge',       enabled: false },
      { key: 'adsEnabled',         enabled: true  },
    ],
  },
  {
    name: 'Basic',
    code: 'basic',
    description: 'For growing transporters who need more daily capacity and wallet access.',
    active: true,
    trialDays: 15,
    taxPercent: 18,
    platformFeePercent: 2,
    pricing: {
      monthly: 99,
      yearly:  999,
    },
    featureMapping: [
      { key: 'loadsPerDay',        enabled: true,  limit: 10 },
      { key: 'bidsPerDay',         enabled: true,  limit: 20 },
      { key: 'walletWithdrawals',  enabled: true  },
      { key: 'aiMatching',         enabled: false },
      { key: 'advancedAnalytics',  enabled: false },
      { key: 'prioritySupport',    enabled: false },
      { key: 'priorityVisibility', enabled: false },
      { key: 'premiumBadge',       enabled: false },
      { key: 'adsEnabled',         enabled: false },
    ],
  },
  {
    name: 'Standard',
    code: 'standard',
    description: 'AI-powered matching and analytics for serious freight operators.',
    active: true,
    trialDays: 7,
    taxPercent: 18,
    platformFeePercent: 2,
    pricing: {
      monthly: 199,
      yearly:  1999,
    },
    featureMapping: [
      { key: 'loadsPerDay',        enabled: true,  limit: 25 },
      { key: 'bidsPerDay',         enabled: true,  limit: 50 },
      { key: 'walletWithdrawals',  enabled: true  },
      { key: 'aiMatching',         enabled: true  },
      { key: 'advancedAnalytics',  enabled: true  },
      { key: 'prioritySupport',    enabled: false },
      { key: 'priorityVisibility', enabled: false },
      { key: 'premiumBadge',       enabled: false },
      { key: 'adsEnabled',         enabled: false },
    ],
  },
  {
    name: 'Premium',
    code: 'premium',
    description: 'Unlimited loads, priority matching, and dedicated support for enterprise fleets.',
    active: true,
    trialDays: 7,
    taxPercent: 18,
    platformFeePercent: 2,
    pricing: {
      monthly: 299,
      yearly:  2999,
    },
    featureMapping: [
      { key: 'loadsPerDay',        enabled: true,  limit: -1 },
      { key: 'bidsPerDay',         enabled: true,  limit: -1 },
      { key: 'walletWithdrawals',  enabled: true  },
      { key: 'aiMatching',         enabled: true  },
      { key: 'advancedAnalytics',  enabled: true  },
      { key: 'prioritySupport',    enabled: true  },
      { key: 'priorityVisibility', enabled: true  },
      { key: 'premiumBadge',       enabled: true  },
      { key: 'adsEnabled',         enabled: false },
    ],
  },
];

/**
 * Demo user accounts for development / QA.
 * Passwords are hashed by the UserSchema pre-save hook.
 *
 * Default password for all demo accounts: Demo@1234!
 * Change immediately if seeding a staging environment.
 */
const DEMO_USERS = [
  {
    name: 'Demo Shipper',
    email: 'shipper@demo.speedy-trucks.local',
    password: 'Demo@1234!',
    role: 'shipper',
    isEmailVerified: true,
    accountStatus: 'active',
    phone: '9800000001',
  },
  {
    name: 'Demo Driver',
    email: 'driver@demo.speedy-trucks.local',
    password: 'Demo@1234!',
    role: 'driver',
    isEmailVerified: true,
    accountStatus: 'active',
    phone: '9800000002',
  },
  {
    name: 'Demo Truck Owner',
    email: 'truckowner@demo.speedy-trucks.local',
    password: 'Demo@1234!',
    role: 'truck_owner',
    isEmailVerified: true,
    accountStatus: 'active',
    phone: '9800000003',
  },
  {
    name: 'Demo Broker',
    email: 'broker@demo.speedy-trucks.local',
    password: 'Demo@1234!',
    role: 'broker',
    isEmailVerified: true,
    accountStatus: 'active',
    phone: '9800000004',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(`[seed] ${msg}\n`);
}

async function connectDb() {
  log(`Connecting to MongoDB: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//<credentials>@')}`);
  await mongoose.connect(MONGODB_URI);
  log('Connected.');
}

async function seedPlans(adminId) {
  let created = 0;
  let skipped = 0;

  for (const planData of PLAN_SEEDS) {
    const existing = await SubscriptionPlan.findOne({ code: planData.code });
    if (existing) {
      skipped++;
      continue;
    }

    const doc = new SubscriptionPlan({
      ...planData,
      // priceHistory requires a changedBy ObjectId — only populate when an
      // admin exists in the DB; otherwise leave it empty on first seed.
      priceHistory: [],
    });

    await doc.save();
    created++;
    log(`  Plan created: ${planData.name} (${planData.code})`);
  }

  log(`Plans: ${created} created, ${skipped} already existed.`);
}

async function seedDemoUsers() {
  // Skip entirely in production to avoid accidental demo accounts.
  if (process.env.NODE_ENV === 'production') {
    log('Skipping demo users in NODE_ENV=production.');
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const userData of DEMO_USERS) {
    const existing = await User.findOne({ email: userData.email });
    if (existing) {
      skipped++;
      continue;
    }

    const user = new User(userData);
    await user.save();
    created++;
    log(`  Demo user created: ${userData.role} — ${userData.email}`);
  }

  log(`Demo users: ${created} created, ${skipped} already existed.`);
  if (created > 0) {
    log('  Default password for all demo accounts: Demo@1234!');
    log('  IMPORTANT: Delete or rotate these before going live.');
  }
}

async function resetSeedData() {
  log('--reset flag detected. Removing existing seed data…');

  const planCodes = PLAN_SEEDS.map((p) => p.code);
  const { deletedCount: plansDeleted } = await SubscriptionPlan.deleteMany({ code: { $in: planCodes } });
  log(`  Deleted ${plansDeleted} subscription plan(s).`);

  const demoEmails = DEMO_USERS.map((u) => u.email);
  const { deletedCount: usersDeleted } = await User.deleteMany({ email: { $in: demoEmails } });
  log(`  Deleted ${usersDeleted} demo user(s).`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await connectDb();

  if (RESET_FLAG) {
    await resetSeedData();
  }

  log('Seeding subscription plans…');
  await seedPlans();

  log('Seeding demo users…');
  await seedDemoUsers();

  log('Seed complete.');
}

main()
  .then(() => {
    mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error('[seed] Fatal error:', err.message);
    mongoose.disconnect();
    process.exit(1);
  });
