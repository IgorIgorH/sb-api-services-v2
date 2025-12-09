import mongoose, { Document, Schema } from 'mongoose';

// Nylas grant information stored per-user
export interface INylasGrant {
  grantId: string;
  email: string;
  provider: string; // google, microsoft, imap
  status: 'active' | 'expired' | 'revoked';
  scopes?: string[]; // email, calendar, contacts
  createdAt: Date;
  expiresAt?: Date;
}

export interface IUser extends Document {
  name: string;
  googleId?: string;
  email: string;
  companyId: mongoose.Types.ObjectId;
  role: 'Admin' | 'CompanyUser';
  identifiers: { key: string; value: string }[];
  nylasGrant?: INylasGrant; // Per-user Nylas grant for email/calendar/contacts access
  createdAt: Date;
  updatedAt: Date;
}

// Schema for Nylas grant subdocument
const NylasGrantSchema = new Schema(
  {
    grantId: { type: String, required: true },
    email: { type: String, required: true },
    provider: { type: String, default: 'unknown' },
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked'],
      default: 'active',
    },
    scopes: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  },
  { _id: false },
);

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    googleId: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    role: {
      type: String,
      enum: ['Admin', 'CompanyUser'],
      default: 'CompanyUser',
    },
    identifiers: [{ key: String, value: String }],
    nylasGrant: NylasGrantSchema,
  },
  { timestamps: true },
);

// Add a compound index to ensure uniqueness of identifiers per user
UserSchema.index(
  { _id: 1, 'identifiers.key': 1, 'identifiers.value': 1 },
  { unique: true },
);

export const User = mongoose.model<IUser>('User', UserSchema);
