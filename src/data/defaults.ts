export interface BidDefaults {
  laborRate: number; // USD per hour
  slackPercent: number; // applied to all cable runs by default
  taxRate: number; // applied to materials only
  overheadPercent: number; // applied to (materials + labor)
  marginPercent: number; // applied to subtotal+overhead to compute price
  measurementUnit: "ft" | "m";
}

export const defaultBidDefaults: BidDefaults = {
  laborRate: 95,
  slackPercent: 15,
  taxRate: 7.0,
  overheadPercent: 12,
  marginPercent: 22,
  measurementUnit: "ft",
};
