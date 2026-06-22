import { query } from "../db.js"
import type { PricePoint, VolumePoint, DepthData, TimeRange, CardRank, Card, RankDimension } from "../../shared/types.js"

function getRangeMs(range: TimeRange): number {
  switch (range) {
    case "1h": return 3600000
    case "6h": return 21600000
    case "1d": return 86400000
    case "7d": return 604800000
  }
}

export function getPriceHistory(cardId: string, range: TimeRange): PricePoint[] {
  const since = Date.now() - getRangeMs(range)
  return query<PricePoint>(
    "SELECT createdAt as timestamp, price FROM trades WHERE cardId = ? AND createdAt >= ? ORDER BY createdAt ASC",
    [cardId, since]
  )
}

export function getVolumeHistory(cardId: string, range: TimeRange): VolumePoint[] {
  const since = Date.now() - getRangeMs(range)
  const trades = query<{ createdAt: number; quantity: number }>(
    "SELECT createdAt, quantity FROM trades WHERE cardId = ? AND createdAt >= ? ORDER BY createdAt ASC",
    [cardId, since]
  )

  const bucketMs = range === "1h" ? 300000 : range === "6h" ? 1800000 : 3600000
  const buckets = new Map<number, number>()

  for (const t of trades) {
    const bucket = Math.floor(t.createdAt / bucketMs) * bucketMs
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + t.quantity)
  }

  return Array.from(buckets.entries())
    .map(([timestamp, volume]) => ({ timestamp, volume }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

export function getDepthData(cardId: string): DepthData {
  const buys = query<{ price: number; quantity: number }>(
    `SELECT price, SUM(remainingQuantity) as quantity FROM orders
     WHERE cardId = ? AND type = 'buy' AND status = 'PENDING'
     GROUP BY price ORDER BY price DESC`,
    [cardId]
  )
  const sells = query<{ price: number; quantity: number }>(
    `SELECT price, SUM(remainingQuantity) as quantity FROM orders
     WHERE cardId = ? AND type = 'sell' AND status = 'PENDING'
     GROUP BY price ORDER BY price ASC`,
    [cardId]
  )
  return { buys, sells }
}

export function getWeeklyRank(dimension: RankDimension = "composite"): CardRank[] {
  const sevenDaysAgo = Date.now() - getRangeMs("7d")

  const cards = query<Card>("SELECT * FROM cards ORDER BY rarity DESC, basePrice DESC")

  const volumeData = query<{ cardId: string; totalVolume: number }>(
    `SELECT cardId, SUM(quantity) as totalVolume 
     FROM trades 
     WHERE createdAt >= ? 
     GROUP BY cardId`,
    [sevenDaysAgo]
  )
  const volumeMap = new Map(volumeData.map(v => [v.cardId, v.totalVolume]))

  const priceData = query<{ cardId: string; price: number; createdAt: number }>(
    `SELECT cardId, price, createdAt 
     FROM trades 
     WHERE createdAt >= ? 
     ORDER BY cardId, createdAt ASC`,
    [sevenDaysAgo]
  )
  const priceMap = new Map<string, { first: number; last: number }>()
  for (const p of priceData) {
    if (!priceMap.has(p.cardId)) {
      priceMap.set(p.cardId, { first: p.price, last: p.price })
    } else {
      const entry = priceMap.get(p.cardId)!
      entry.last = p.price
    }
  }

  const ssrSupplyData = query<{ cardId: string; supply: number }>(
    `SELECT uc.cardId, COUNT(*) as supply 
     FROM user_cards uc
     JOIN cards c ON uc.cardId = c.id
     WHERE c.rarity = 'SSR'
     GROUP BY uc.cardId`
  )
  const ssrSupplyMap = new Map(ssrSupplyData.map(s => [s.cardId, s.supply]))

  const lastPriceData = query<{ cardId: string; price: number }>(
    `SELECT t.cardId, t.price
     FROM trades t
     INNER JOIN (
       SELECT cardId, MAX(createdAt) as maxCreatedAt
       FROM trades
       GROUP BY cardId
     ) latest ON t.cardId = latest.cardId AND t.createdAt = latest.maxCreatedAt`
  )
  const lastPriceMap = new Map(lastPriceData.map(p => [p.cardId, p.price]))

  const cardRanks: Omit<CardRank, "rank" | "volumeRank" | "gainRank" | "ssrSupplyRank" | "compositeRank">[] = []

  for (const card of cards) {
    const volume7d = volumeMap.get(card.id) ?? 0
    const prices = priceMap.get(card.id)
    const gainPercent = prices && prices.first > 0 
      ? ((prices.last - prices.first) / prices.first) * 100 
      : 0
    const ssrSupply = card.rarity === "SSR" ? (ssrSupplyMap.get(card.id) ?? 0) : 0
    const lastPrice = lastPriceMap.get(card.id) ?? card.basePrice

    const volumeScore = volume7d
    const gainScore = Math.max(gainPercent, -100)
    const ssrSupplyScore = ssrSupply
    const compositeScore = (volumeScore * 0.4) + (gainScore * 0.35) + (ssrSupplyScore * 0.25)

    cardRanks.push({
      cardId: card.id,
      card,
      volume7d,
      gainPercent,
      ssrSupply,
      compositeScore,
      lastPrice,
    })
  }

  const volumeSorted = [...cardRanks].sort((a, b) => b.volume7d - a.volume7d)
  const gainSorted = [...cardRanks].sort((a, b) => b.gainPercent - a.gainPercent)
  const ssrSupplySorted = [...cardRanks].sort((a, b) => b.ssrSupply - a.ssrSupply)
  const compositeSorted = [...cardRanks].sort((a, b) => b.compositeScore - a.compositeScore)

  const result: CardRank[] = cardRanks.map(cr => ({
    ...cr,
    volumeRank: volumeSorted.findIndex(v => v.cardId === cr.cardId) + 1,
    gainRank: gainSorted.findIndex(v => v.cardId === cr.cardId) + 1,
    ssrSupplyRank: ssrSupplySorted.findIndex(v => v.cardId === cr.cardId) + 1,
    compositeRank: compositeSorted.findIndex(v => v.cardId === cr.cardId) + 1,
    rank: 1,
  }))

  switch (dimension) {
    case "volume":
      result.sort((a, b) => a.volumeRank - b.volumeRank)
      break
    case "gain":
      result.sort((a, b) => a.gainRank - b.gainRank)
      break
    case "ssrSupply":
      result.sort((a, b) => a.ssrSupplyRank - b.ssrSupplyRank)
      break
    case "composite":
    default:
      result.sort((a, b) => a.compositeRank - b.compositeRank)
      break
  }

  return result.map((r, i) => ({ ...r, rank: i + 1 }))
}
