import { CreateTokenForm } from "@/components/trading/create-token-form";

export default function CreateTokenPage() {
  return (
    <div className="mx-auto w-full max-w-[1080px] py-2 sm:py-6">
      <div className="overflow-hidden rounded-[24px] border border-[#29292d] bg-[#111113] shadow-2xl shadow-black/20">
        <div className="border-b border-[#29292d] px-5 py-5 sm:px-8 sm:py-7">
          <h1 className="text-3xl font-medium tracking-tight text-zinc-100 sm:text-4xl">Create a token</h1>
          <p className="mt-2 text-sm text-zinc-400 sm:text-base">
            Launch a token on the ANSEM bonding curve, denominated in CHANSE or ANSEM.
          </p>
        </div>
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <CreateTokenForm />
        </div>
      </div>
    </div>
  );
}
