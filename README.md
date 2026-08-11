# Dashboard de Tráfego — Lilian Mesquita (conta "Rubra")

Dash estática (GitHub Pages) do funil de **seguidores / visitas ao perfil** da Lilian Mesquita.
Mesma base do Dr. Vinícius / Elisa Lobo / Clínica PRC (Graph API direto + GitHub Pages + cron nativo).

- **Fonte 1 — Meta Graph API** (direto, nível anúncio, por dia): mídia + **visitas ao perfil** (campo `results`, indicador `total_profile_visits` / `profile_visit_view`). Conta `act_1490434912872704` (Rubra). Traz também `instagram_profile_follow_v2` (follows atribuídos pela API) só como referência.
- **Fonte 2 — planilha da Lilian** (gviz CSV): coluna **N · "Seguid."** das abas mensais (📈 Abr…) = novos seguidores lançados à mão pelo gestor (número-verdade). Planilha `1ESPchuMZHmXrDIyl5N8Kzy9i20Et0-9EkDVXe_DhSNs`. Coluna M = investimento já com imposto.
- **Comparação por campanha:** 🎯 E1-DIST (padrão da agência) × 📁 Antiga (Ganho de seguidores 02/04, pré-nomenclatura).
- **Seguidores = número manual da planilha** — NÃO o total da conta do Instagram (que inclui orgânico).
- **Benchmarks próprios da conta** (diferentes do padrão da agência): custo/seguidor ≤ R$2 · CTR ≥ 1,5% · CPC ≤ R$0,50 (alerta > R$0,80) · CPM ≤ R$22 (alerta > R$30).
- Imposto ×1,1385 sobre todo gasto. CTR sempre de link.

## Rodar local
```
# precisa do META_ACCESS_TOKEN (env ou .env local — .env é gitignored)
./build.ps1 -Mode all       # gera data.js
python -m http.server 8799  # abre http://localhost:8799
```

## Deploy
- `build.ps1` roda no GitHub Actions (`.github/workflows/build.yml`), lê a Meta via secret `META_ACCESS_TOKEN` + a planilha via gviz, e publica no Pages.
- Rebuild automático de hora em hora via cron nativo do Actions.

Somente leitura. Publica só agregados (sem PII).
