#!/usr/bin/env bash
# Milestone 1 geri bildirimini yazılımcı notları DB'sine ekler.
# VPS'te çalıştır: bash scripts/add-dev-note-milestone1.sh
# API_BASE: panelin backend URL'i (nginx proxy üzerinden)

set -euo pipefail
API_BASE="${1:-http://localhost:8186}"

post_note() {
  local subject="$1"
  local body="$2"
  local priority="$3"
  curl -sf -X POST "${API_BASE}/api/developer-notes" \
    -H "Content-Type: application/json" \
    -d "{\"subject\":$(echo -n "$subject" | jq -Rs .),\"body\":$(echo -n "$body" | jq -Rs .),\"priority\":\"$priority\",\"status\":\"open\",\"created_by\":\"musteri-milestone1\"}" \
    | jq -r '.subject // "hata"'
}

echo "[dev-note] Milestone 1 geri bildirimleri ekleniyor..."

post_note \
  "[M1] Keepa Temporal Data Entegrasyonu" \
  "Keepa temporal verisi (seller history, price volatility, buy box hareketi) skora etki etmiyor. Risk motoru canlı Keepa verisiyle doğrulanmadan onaylanamaz. Gerekli: price-war ve operational-risk scorer'larına Keepa snapshot'ı entegre edilmeli. buy_box_change_count ve price_30d_min/price_90d_avg aktif skora dahil edilmeli." \
  "high"

post_note \
  "[M1] Reasoning Depth — Sentezlenmiş Ticari Yorum" \
  "Mevcut reasoning alanları template/if-else seviyesinde. Beklenen: 5 boyutun (kategori riski, SKU karmaşası, marka güveni, operasyon riski, fiyat baskısı) sentezlenmiş ticari yorumunu üreten karar motoru. Groq entegrasyonu aktif edilirse bu katman LLM ile güçlendirilebilir." \
  "high"

post_note \
  "[M1] Brand Verification — Tahmin Kaldırıldı" \
  "Ürün başlığından marka tahmini (inferredBrandName) UI'dan kaldırıldı. Artık yalnızca doğrulanmış seller_name gösterilmektedir. Satıcı verisi eksik ürünler 'Satıcı verisi yok' olarak etiketleniyor. Enrichment altyapısı satıcı doğrulaması için kullanılabilir." \
  "medium"

post_note \
  "[M1] Noise Reduction — Actionable Filtering" \
  "isActionableProduct eşiği 50 → 100 yorum olarak yükseltildi. Satıcı verisi eksik ürünler karar kuyruğuna düşmüyor. Veri Eksik grubu ayrı görünümde tutuluyor. Müşteri geri bildirimi: eksik analizli ürünler operatör ekranını kirletiyor." \
  "medium"

post_note \
  "[M1] Decision Layer Evolution — Volatility & Historical" \
  "Sistem şu an anlık fiyat/satıcı verisine dayanıyor. Volatility (Keepa fiyat geçmişi), historical behavior (buy box trend) ve brand discipline (çapraz scan analizi) katmanları planlanıyor. Keepa entegrasyonu aktif olunca price-war ve operational-risk skorları otomatik güçlenecek." \
  "low"

echo "[dev-note] Tamamlandı."
