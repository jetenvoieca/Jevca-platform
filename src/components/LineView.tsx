import type { LineLook } from "@/lib/pageStyleLayout";

// A Line component (2026-10-23): a rule across its component, in its
// colour and thickness — on the page and in Arrange.
export default function LineView({ look }: { look: LineLook }) {
  return <div style={{ borderTop: `${look.thickness}px solid ${look.colour}` }} />;
}
