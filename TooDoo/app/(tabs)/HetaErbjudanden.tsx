import { OfferListScreen } from '@/components/offer-list-screen';

export default function HetaErbjudandenScreen() {
  return (
    <OfferListScreen
      mode="hot"
      title="Heta erbjudanden"
      icon="flame"
      iconColor="#ff3b30"
      subtitle="Baserat på dina intressen"
      emptyText="Inga heta erbjudanden just nu."
    />
  );
}
