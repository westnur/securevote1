export const NOTICE =
  "Educational project for the course Introduction to Finance. Not a real product, service or investment offer. Do not use with real funds.";

export function EducationalBanner() {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-200" role="note">
      {NOTICE} Local Hardhat network only · synthetic data.
    </div>
  );
}
