import { OfferListScreen } from '@/components/offer-list-screen';

export default function SlutarSnartScreen() {
  return (
    <OfferListScreen
      mode="endingSoon"
      title="Slutar snart"
      icon="hourglass-outline"
      subtitle="Baserat på dina intressen"
      emptyText="Inga tidsbegränsade erbjudanden just nu."
    />
  );
}
