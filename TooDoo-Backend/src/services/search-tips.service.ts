import defaultTips from '../data/search-tips.json';
import prisma from '../prisma/prismaClient';

export type SearchTipsOptions = {
  take?: number;
  city?: string;
  q?: string;
};

function normalizeTake(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return 8;
  return Math.min(20, Math.max(1, Math.floor(value)));
}

function uniqueTips(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const tip = raw.trim();
    if (!tip) continue;
    const key = tip.toLocaleLowerCase('sv-SE');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tip);
  }

  return result;
}

function withCitySuffix(tips: string[], city: string) {
  const cityLabel = city.trim();
  if (!cityLabel) return tips;

  const localized = tips
    .filter((tip) => !tip.toLocaleLowerCase('sv-SE').includes(cityLabel.toLocaleLowerCase('sv-SE')))
    .slice(0, 4)
    .map((tip) => `${tip} ${cityLabel}`);

  return uniqueTips([...tips, ...localized]);
}

function filterByQuery(tips: string[], q: string) {
  const needle = q.trim().toLocaleLowerCase('sv-SE');
  if (!needle) return tips;
  return tips.filter((tip) => tip.toLocaleLowerCase('sv-SE').includes(needle));
}

export async function getSearchTips(options: SearchTipsOptions = {}) {
  const take = normalizeTake(options.take);
  const city = options.city?.trim();
  const q = options.q?.trim();

  const categories = await prisma.category.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  });

  const categoryTips = categories.map((category) => category.name);
  let tips = uniqueTips([...defaultTips, ...categoryTips]);

  if (city) {
    tips = withCitySuffix(tips, city);
  }

  if (q) {
    tips = filterByQuery(tips, q);
  }

  const total = tips.length;
  return {
    tips: tips.slice(0, take),
    total,
    take,
  };
}
