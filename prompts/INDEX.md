# Prompt index (run top to bottom)

Each row is a ready-to-paste prompt. Paste 00_PROJECT_CONTEXT.md first in every new session, then the prompt.
For UI prompts also attach docs/DESIGN_SPEC.md and the images in docs/design/.

| # | Target file | Agent | Prompt file |
|---|---|---|---|
| 00 | (setup) project scaffold | Setup | prompts/00_setup__project_scaffold.md |
| 01 | docs/ARCHITECTURE.md | 1 Architect | prompts/01_docs_ARCHITECTURE_md.md |
| 02 | docs/HANDOFF.md | 1 Architect | prompts/02_docs_HANDOFF_md.md |
| 03 | supabase/schema.sql | 2 Database | prompts/03_supabase_schema_sql.md |
| 04 | supabase/rls.sql | 2 Database | prompts/04_supabase_rls_sql.md |
| 05 | supabase/seed.sql | 2 Database | prompts/05_supabase_seed_sql.md |
| 06 | supabase/rls-checks.sql | 2 Database | prompts/06_supabase_rls_checks_sql.md |
| 07 | lib/money.ts | 3 Scoring | prompts/07_lib_money_ts.md |
| 08 | lib/buyingPower.ts | 3 Scoring | prompts/08_lib_buyingPower_ts.md |
| 09 | lib/forecast.ts | 3 Scoring | prompts/09_lib_forecast_ts.md |
| 10 | lib/pin.ts | 3 Scoring | prompts/10_lib_pin_ts.md |
| 11 | lib/qr.ts | 3 Scoring | prompts/11_lib_qr_ts.md |
| 12 | lib/validation.ts | 3 Scoring | prompts/12_lib_validation_ts.md |
| 13 | tests/buyingPower.test.ts and tests/forecast.test.ts | 3 Scoring | prompts/13_tests_buyingPower_test_ts_and_tests_forecast_tes.md |
| 14 | tests/qr.test.ts and tests/pin.test.ts | 3 Scoring | prompts/14_tests_qr_test_ts_and_tests_pin_test_ts.md |
| 15 | app/api/v1/buying-power/route.ts | 3 Scoring | prompts/15_app_api_v1_buying_power_route_ts.md |
| 16 | lib/supabase/client.ts and lib/supabase/server.ts | 4 Frontend | prompts/16_lib_supabase_client_ts_and_lib_supabase_server_t.md |
| 17 | lib/products.ts | 4 Frontend | prompts/17_lib_products_ts.md |
| 18 | app/layout.tsx and components/DemoBanner.tsx | 4 Frontend | prompts/18_app_layout_tsx_and_components_DemoBanner_tsx.md |
| 19 | app/page.tsx (splash, design 01) | 4 Frontend | prompts/19_app_page_tsx__splash__design_01.md |
| 20 | app/(auth)/login/page.tsx (design 02) | 4 Frontend | prompts/20_app__auth__login_page_tsx__design_02.md |
| 21 | app/(auth)/signup/page.tsx (design 03) | 4 Frontend | prompts/21_app__auth__signup_page_tsx__design_03.md |
| 22 | lib/actions/sales.ts | 4 Frontend | prompts/22_lib_actions_sales_ts.md |
| 23 | components/BarcodeScanner.tsx | 4 Frontend | prompts/23_components_BarcodeScanner_tsx.md |
| 24 | components/Cart.tsx | 4 Frontend | prompts/24_components_Cart_tsx.md |
| 25 | app/shop/sell/page.tsx (design 04) | 4 Frontend | prompts/25_app_shop_sell_page_tsx__design_04.md |
| 26 | components/SaleQr.tsx (design 07) | 4 Frontend | prompts/26_components_SaleQr_tsx__design_07.md |
| 27 | app/pay/[token]/page.tsx (designs 08, 09) | 4 Frontend | prompts/27_app_pay__token__page_tsx__designs_08__09.md |
| 28 | lib/actions/customers.ts | 4 Frontend | prompts/28_lib_actions_customers_ts.md |
| 29 | app/shop/customers/new/page.tsx and PIN approval (designs 12, 13) | 4 Frontend | prompts/29_app_shop_customers_new_page_tsx_and_PIN_approval.md |
| 30 | app/me/page.tsx, components/LimitMeter.tsx, components/WhyLimit.tsx (design 10) | 4 Frontend | prompts/30_app_me_page_tsx__components_LimitMeter_tsx__comp.md |
| 31 | lib/actions/tabs.ts | 4 Frontend | prompts/31_lib_actions_tabs_ts.md |
| 32 | app/shop/ledger/page.tsx, components/CustomerRow.tsx (designs 11, 14) | 4 Frontend | prompts/32_app_shop_ledger_page_tsx__components_CustomerRow.md |
| 33 | middleware.ts | 5 Security | prompts/33_middleware_ts.md |
| 34 | lib/rateLimit.ts | 5 Security | prompts/34_lib_rateLimit_ts.md |
| 35 | tests/security.test.ts | 5 Security | prompts/35_tests_security_test_ts.md |
| 36 | docs/SECURITY_REVIEW.md | 5 Security | prompts/36_docs_SECURITY_REVIEW_md.md |
| 37 | .env.example | 6 Release | prompts/37_env_example.md |
| 38 | public/manifest.webmanifest and public/icons/ | 6 Release | prompts/38_public_manifest_webmanifest_and_public_icons.md |
| 39 | app/api/health/route.ts | 6 Release | prompts/39_app_api_health_route_ts.md |
| 40 | (deployment) Supabase + Vercel steps | 6 Release | prompts/40_deployment__Supabase___Vercel_steps.md |
| 41 | README.md (project root) | 6 Release | prompts/41_README_md__project_root.md |
| 42 | scripts/smoke-test.md | 6 Release | prompts/42_scripts_smoke_test_md.md |
| 43 | docs/DEMO_SCRIPT.md | 6 Release | prompts/43_docs_DEMO_SCRIPT_md.md |
| 44 | docs/DECK.md | 6 Release | prompts/44_docs_DECK_md.md |
