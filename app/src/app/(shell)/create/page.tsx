import { CreateTokenForm } from "@/components/trading/create-token-form";

export default function CreateTokenPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] py-2 sm:py-6">
      <div className="mb-5 flex items-baseline gap-3">
        <span className="eyebrow">Create</span>
        <span className="eyebrow-sub">fair launch · no presale</span>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-[#1e1e22] bg-[#0e0e10]/80">
        <div className="border-b border-[#1e1e22] px-5 py-5 sm:px-7 sm:py-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
            Launch a coin
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-zinc-500">
            Deploy to the ANSEM bonding curve, denominated in CHANSE or ANSEM.
            Attach a Horn to skim swap fees to the Horn Vault. It graduates to the
            ANSEM AMM once the curve fills.
          </p>
        </div>
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <CreateTokenForm />
        </div>
      </div>
    </div>
  );
}
