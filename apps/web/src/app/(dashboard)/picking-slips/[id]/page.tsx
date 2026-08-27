import { PickingSlipDetail } from "@/components/picking-slips/PickingSlipDetail";

export default function PickingSlipDetailPage({ params }: { params: { id: string } }) {
  return <PickingSlipDetail id={params.id} />;
}
