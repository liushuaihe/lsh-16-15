import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "@/api"
import { useAppStore } from "@/store"
import type { CardRank, RankDimension } from "../../shared/types"
import { RARITY_COLORS, RARITY_BG } from "../../shared/types"
import { TrendingUp, TrendingDown, Minus, Trophy, Flame, ArrowUpRight, Coins } from "lucide-react"

const dimensionConfig: Record<RankDimension, { label: string; icon: React.ElementType; description: string }> = {
  composite: { label: "综合排名", icon: Trophy, description: "成交量40% + 涨幅35% + SSR流通数25%" },
  volume: { label: "成交量", icon: Flame, description: "7日累计成交数量" },
  gain: { label: "涨幅", icon: ArrowUpRight, description: "7日价格涨跌幅（7日前成交价为基准）" },
  ssrSupply: { label: "SSR流通", icon: Coins, description: "SSR卡牌流通数量" },
}

export default function WeeklyRank() {
  const { selectCard } = useAppStore()
  const navigate = useNavigate()
  const [dimension, setDimension] = useState<RankDimension>("composite")
  const [rankData, setRankData] = useState<CardRank[]>([])
  const prevRankDataRef = useRef<CardRank[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getWeeklyRank(dimension)
      setRankData(prev => {
        prevRankDataRef.current = prev
        return data
      })
    } catch {
    } finally {
      setLoading(false)
    }
  }, [dimension])

  useEffect(() => {
    setLoading(true)
    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [dimension, fetchData])

  const getRankChange = (cardId: string, currentRank: number) => {
    const prevItem = prevRankDataRef.current.find(r => r.cardId === cardId)
    if (!prevItem) return 0
    return prevItem.rank - currentRank
  }

  const formatPrice = (price: number) => (price / 100).toFixed(0)

  const formatGain = (gain: number) => {
    const sign = gain >= 0 ? "+" : ""
    return `${sign}${gain.toFixed(2)}%`
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-display text-gold text-lg tracking-wider">WEEKLY HOT RANK</h1>
          <p className="text-xs text-dimmed mt-1">每周热门榜 · 数据实时同步交易记录</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {(Object.keys(dimensionConfig) as RankDimension[]).map((dim) => {
          const config = dimensionConfig[dim]
          const Icon = config.icon
          return (
            <button
              key={dim}
              onClick={() => setDimension(dim)}
              className={`shrink-0 px-4 py-2 rounded-lg text-xs border transition-all flex items-center gap-2 ${
                dimension === dim
                  ? "border-gold bg-gold-dim text-gold"
                  : "border-border bg-card text-muted hover:border-gold/30"
              }`}
            >
              <Icon size={14} />
              {config.label}
            </button>
          )
        })}
      </div>

      <div className="bg-secondary/50 rounded-xl border border-border px-4 py-2">
        <p className="text-xs text-dimmed">
          <span className="text-muted">当前维度：</span>
          {dimensionConfig[dimension].description}
        </p>
      </div>

      <div className="bg-secondary rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border text-xs text-muted">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">卡牌</div>
          <div className="col-span-2 text-center">最新价</div>
          <div className="col-span-2 text-center">7日成交量</div>
          <div className="col-span-1 text-center">涨幅</div>
          <div className="col-span-2 text-center">SSR流通</div>
        </div>

        {loading && rankData.length === 0 ? (
          <div className="py-12 text-center text-dimmed text-xs">加载中...</div>
        ) : (
          <div className="divide-y divide-border/50">
            {rankData.map((item) => {
              const rankChange = getRankChange(item.cardId, item.rank)
              const isTop3 = item.rank <= 3

              return (
                <div
                  key={item.cardId}
                  onClick={() => {
                    selectCard(item.cardId)
                    navigate("/")
                  }}
                  className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-hover/30 transition-colors cursor-pointer items-center"
                >
                  <div className="col-span-1 text-center">
                    {isTop3 ? (
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center mx-auto font-bold text-xs ${
                          item.rank === 1
                            ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-primary"
                            : item.rank === 2
                            ? "bg-gradient-to-br from-gray-300 to-gray-500 text-primary"
                            : "bg-gradient-to-br from-amber-600 to-amber-800 text-white"
                        }`}
                      >
                        {item.rank}
                      </div>
                    ) : (
                      <span className="text-muted font-display">{item.rank}</span>
                    )}
                  </div>

                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-bold shrink-0"
                        style={{
                          backgroundColor: RARITY_BG[item.card.rarity],
                          color: RARITY_COLORS[item.card.rarity],
                        }}
                      >
                        {item.card.rarity}
                      </span>
                      <span className="text-sm text-white truncate">{item.card.name}</span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {rankChange > 0 ? (
                        <TrendingUp size={14} className="text-up" />
                      ) : rankChange < 0 ? (
                        <TrendingDown size={14} className="text-down" />
                      ) : (
                        <Minus size={14} className="text-dimmed" />
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 text-center">
                    <span className="text-gold font-display">{formatPrice(item.lastPrice)} G</span>
                  </div>

                  <div className="col-span-2 text-center">
                    <span className={`font-display ${dimension === "volume" ? "text-gold" : "text-white"}`}>
                      {item.volume7d}
                    </span>
                    {dimension !== "volume" && (
                      <span className="text-dimmed text-xs block">#{item.volumeRank}</span>
                    )}
                  </div>

                  <div className="col-span-1 text-center">
                    <span
                      className={`font-display ${
                        item.gainPercent > 0
                          ? "text-up"
                          : item.gainPercent < 0
                          ? "text-down"
                          : "text-muted"
                      } ${dimension === "gain" ? "font-bold" : ""}`}
                    >
                      {formatGain(item.gainPercent)}
                    </span>
                    {dimension !== "gain" && (
                      <span className="text-dimmed text-xs block">#{item.gainRank}</span>
                    )}
                  </div>

                  <div className="col-span-2 text-center">
                    <span className={`font-display ${dimension === "ssrSupply" ? "text-gold" : "text-white"}`}>
                      {item.ssrSupply}
                    </span>
                    {dimension !== "ssrSupply" && item.card.rarity === "SSR" && (
                      <span className="text-dimmed text-xs block">#{item.ssrSupplyRank}</span>
                    )}
                    {item.card.rarity !== "SSR" && (
                      <span className="text-dimmed text-xs block">-</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="总卡牌数"
          value={rankData.length.toString()}
          icon={<Trophy size={18} className="text-gold" />}
        />
        <StatCard
          label="SSR卡牌"
          value={rankData.filter(r => r.card.rarity === "SSR").length.toString()}
          icon={<Coins size={18} className="text-gold" />}
        />
        <StatCard
          label="7日总成交"
          value={rankData.reduce((sum, r) => sum + r.volume7d, 0).toString()}
          icon={<Flame size={18} className="text-up" />}
        />
        <StatCard
          label="平均涨幅"
          value={`${(
            rankData.reduce((sum, r) => sum + r.gainPercent, 0) / Math.max(rankData.length, 1)
          ).toFixed(2)}%`}
          icon={<ArrowUpRight size={18} className="text-up" />}
        />
      </div>

      <div className="bg-secondary rounded-xl border border-border p-4">
        <h3 className="text-xs text-muted mb-3">排名规则</h3>
        <ul className="text-xs text-dimmed space-y-1">
          <li>1. 综合排名 = 7日成交量 × 40% + 7日涨幅 × 35% + SSR流通数 × 25%</li>
          <li>2. 7日成交量：最近7天内该卡牌的累计成交数量</li>
          <li>3. 7日涨幅：(最新成交价 - 7天前最后一笔成交价) / 7天前最后一笔成交价 × 100%；若无历史成交价则以基准价计算</li>
          <li>4. SSR流通数：当前用户持有的SSR卡牌总数（非SSR卡牌不参与此项）</li>
          <li>5. 数据每3秒自动刷新，与交易记录实时同步；点击卡牌行可跳转到交易大厅进行交易</li>
        </ul>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-secondary rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted">{label}</span>
        {icon}
      </div>
      <p className="font-display text-xl text-white">{value}</p>
    </div>
  )
}
