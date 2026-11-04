/** Swedish län → kommuner for the home location picker. */

export type SwedenLan = {
  name: string;
  cities: string[];
};

export const SWEDEN_REGIONS: SwedenLan[] = [
  {
    name: 'Stockholms län',
    cities: [
      'Botkyrka', 'Danderyd', 'Ekerö', 'Haninge', 'Huddinge', 'Järfälla', 'Lidingö',
      'Nacka', 'Norrtälje', 'Nykvarn', 'Nynäshamn', 'Salem', 'Sigtuna', 'Sollentuna',
      'Solna', 'Stockholm', 'Sundbyberg', 'Södertälje', 'Tyresö', 'Täby',
      'Upplands-Bro', 'Upplands Väsby', 'Vallentuna', 'Vaxholm', 'Värmdö', 'Österåker',
    ],
  },
  {
    name: 'Uppsala län',
    cities: [
      'Enköping', 'Heby', 'Håbo', 'Knivsta', 'Tierp', 'Uppsala', 'Älvkarleby', 'Östhammar',
    ],
  },
  {
    name: 'Södermanlands län',
    cities: [
      'Eskilstuna', 'Flen', 'Gnesta', 'Katrineholm', 'Nyköping', 'Oxelösund',
      'Strängnäs', 'Trosa', 'Vingåker',
    ],
  },
  {
    name: 'Östergötlands län',
    cities: [
      'Boxholm', 'Finspång', 'Kinda', 'Linköping', 'Mjölby', 'Motala', 'Norrköping',
      'Söderköping', 'Vadstena', 'Valdemarsvik', 'Ydre', 'Åtvidaberg', 'Ödeshög',
    ],
  },
  {
    name: 'Jönköpings län',
    cities: [
      'Aneby', 'Eksjö', 'Gislaved', 'Gnosjö', 'Habo', 'Jönköping', 'Mullsjö',
      'Nässjö', 'Sävsjö', 'Tranås', 'Vaggeryd', 'Vetlanda', 'Värnamo',
    ],
  },
  {
    name: 'Kronobergs län',
    cities: [
      'Alvesta', 'Lessebo', 'Ljungby', 'Markaryd', 'Tingsryd', 'Uppvidinge',
      'Växjö', 'Älmhult',
    ],
  },
  {
    name: 'Kalmar län',
    cities: [
      'Borgholm', 'Emmaboda', 'Hultsfred', 'Högsby', 'Kalmar', 'Mönsterås',
      'Mörbylånga', 'Nybro', 'Oskarshamn', 'Torsås', 'Västervik', 'Vimmerby',
    ],
  },
  {
    name: 'Gotlands län',
    cities: ['Gotland'],
  },
  {
    name: 'Blekinge län',
    cities: ['Karlshamn', 'Karlskrona', 'Olofström', 'Ronneby', 'Sölvesborg'],
  },
  {
    name: 'Skåne län',
    cities: [
      'Bjuv', 'Bromölla', 'Burlöv', 'Båstad', 'Eslöv', 'Helsingborg', 'Hässleholm',
      'Höganäs', 'Hörby', 'Höör', 'Klippan', 'Kristianstad', 'Kävlinge', 'Landskrona',
      'Lomma', 'Lund', 'Malmö', 'Osby', 'Perstorp', 'Simrishamn', 'Sjöbo', 'Skurup',
      'Staffanstorp', 'Svalöv', 'Svedala', 'Tomelilla', 'Trelleborg', 'Vellinge',
      'Ystad', 'Åstorp', 'Ängelholm', 'Örkelljunga', 'Östra Göinge',
    ],
  },
  {
    name: 'Hallands län',
    cities: ['Falkenberg', 'Halmstad', 'Hylte', 'Kungsbacka', 'Laholm', 'Varberg'],
  },
  {
    name: 'Västra Götalands län',
    cities: [
      'Ale', 'Alingsås', 'Bengtsfors', 'Bollebygd', 'Borås', 'Dals-Ed', 'Essunga',
      'Falköping', 'Färgelanda', 'Grästorp', 'Gullspång', 'Göteborg', 'Götene',
      'Herrljunga', 'Hjo', 'Härryda', 'Karlsborg', 'Kungälv', 'Lerum', 'Lidköping',
      'Lilla Edet', 'Lysekil', 'Mariestad', 'Mark', 'Mellerud', 'Munkedal', 'Mölndal',
      'Orust', 'Partille', 'Skara', 'Skövde', 'Sotenäs', 'Stenungsund', 'Strömstad',
      'Svenljunga', 'Tanum', 'Tibro', 'Tidaholm', 'Tjörn', 'Tranemo', 'Trollhättan',
      'Töreboda', 'Uddevalla', 'Ulricehamn', 'Vara', 'Vårgårda', 'Vänersborg',
      'Åmål', 'Öckerö',
    ],
  },
  {
    name: 'Värmlands län',
    cities: [
      'Arvika', 'Eda', 'Filipstad', 'Forshaga', 'Grums', 'Hagfors', 'Hammarö',
      'Karlstad', 'Kil', 'Kristinehamn', 'Munkfors', 'Storfors', 'Sunne',
      'Säffle', 'Torsby', 'Årjäng',
    ],
  },
  {
    name: 'Örebro län',
    cities: [
      'Askersund', 'Degerfors', 'Hallsberg', 'Hällefors', 'Karlskoga', 'Kumla',
      'Laxå', 'Lekeberg', 'Lindesberg', 'Ljusnarsberg', 'Nora', 'Örebro',
    ],
  },
  {
    name: 'Västmanlands län',
    cities: [
      'Arboga', 'Fagersta', 'Hallstahammar', 'Kungsör', 'Köping', 'Norberg',
      'Sala', 'Skinnskatteberg', 'Surahammar', 'Västerås',
    ],
  },
  {
    name: 'Dalarnas län',
    cities: [
      'Avesta', 'Borlänge', 'Falun', 'Gagnef', 'Hedemora', 'Leksand', 'Ludvika',
      'Malung-Sälen', 'Mora', 'Orsa', 'Rättvik', 'Smedjebacken', 'Säter',
      'Vansbro', 'Älvdalen',
    ],
  },
  {
    name: 'Gävleborgs län',
    cities: [
      'Bollnäs', 'Gävle', 'Hofors', 'Hudiksvall', 'Ljusdal', 'Nordanstig',
      'Ockelbo', 'Ovanåker', 'Sandviken', 'Söderhamn',
    ],
  },
  {
    name: 'Västernorrlands län',
    cities: [
      'Härnösand', 'Kramfors', 'Sollefteå', 'Sundsvall', 'Timrå', 'Ånge', 'Örnsköldsvik',
    ],
  },
  {
    name: 'Jämtlands län',
    cities: [
      'Berg', 'Bräcke', 'Härjedalen', 'Krokom', 'Ragunda', 'Strömsund', 'Åre', 'Östersund',
    ],
  },
  {
    name: 'Västerbottens län',
    cities: [
      'Bjurholm', 'Dorotea', 'Lycksele', 'Malå', 'Nordmaling', 'Norsjö', 'Robertsfors',
      'Skellefteå', 'Sorsele', 'Storuman', 'Umeå', 'Vilhelmina', 'Vindeln',
      'Vännäs', 'Åsele',
    ],
  },
  {
    name: 'Norrbottens län',
    cities: [
      'Arjeplog', 'Arvidsjaur', 'Boden', 'Gällivare', 'Haparanda', 'Jokkmokk', 'Kalix',
      'Kiruna', 'Luleå', 'Pajala', 'Piteå', 'Älvsbyn', 'Överkalix', 'Övertorneå',
    ],
  },
].map((lan) => ({
  ...lan,
  cities: [...lan.cities].sort((a, b) => a.localeCompare(b, 'sv')),
}));

export function findLanByName(name: string): SwedenLan | undefined {
  const key = name.trim().toLocaleLowerCase('sv-SE');
  return SWEDEN_REGIONS.find((lan) => lan.name.toLocaleLowerCase('sv-SE') === key);
}

export function geocodeQueryForCity(lan: string, city: string) {
  return `${city}, ${lan}, Sverige`;
}
