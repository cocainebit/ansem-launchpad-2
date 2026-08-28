import { CreateTokenWizard } from "@/components/trading/create-token-wizard";

export default function CreateTokenPage() {
  return (
    // Fills the viewport below the header and centers the wizard, so the intro
    // never scrolls. Taller later steps grow past the min-height and scroll then.
    <div className="mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[1440px] items-center justify-center px-4 py-4">
      <CreateTokenWizard />
    </div>
  );
}
