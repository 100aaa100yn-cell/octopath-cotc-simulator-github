# Octopath CotC Strategy Simulator v1.2

オクトパストラベラー 大陸の覇者の編成・行動順・ダメージ・戦闘全体を検討するためのブラウザベース戦略シミュレーターです。

## Version 1.3

### ロスター拡充

- 収録キャラクター数：88人
- 大陸の覇者、OCTOPATH TRAVELER、OCTOPATH TRAVELER II、コラボ旅人を含む初期カタログ
- シリーズによる絞り込み
- データ品質による絞り込み
- 検証済み／暫定／検証用／未入力をカード上に表示
- CSVによるキャラクター一括追加・更新
- UTF-8 BOM付きCSV雛形
- ID重複時のアップサート
- CSVの引用符・カンマ入りセル対応
- 一括取込テスト

> 追加ロスターの能力値と基本攻撃はシミュレーター用の暫定値です。正確なゲーム内数値へ置き換えるまで、画面上で「暫定」と表示されます。

## Version 1.1

### 全キャラクター選択

- roleに関係なく全キャラクターをリーダーとして選択可能
- 名前・ID・武器・属性・役割による検索
- 武器・属性・役割フィルター
- キャラクターカードから最大8人を選択
- 手動選択したメンバーを編成へ固定
- 未選択の枠だけを編成AIが自動補完
- 手動固定／自動補完／リーダーを編成カードに表示
- 選択内容をオートセーブ・共有URL・設定JSONへ保存
- データベースへ追加したキャラクターも自動的に選択候補へ反映

現在同梱されているキャラクターデータは検証用の8人です。データベースにキャラクターを追加またはインポートすると、人数制限なく選択候補に表示されます。

## Version 1.0

- 編成最適化
- ターン最適化
- ダメージ計算
- フルバトルシミュレーション
- 敵HP・シールド・ブレイク管理
- データベース編集・検証
- 設定のローカル保存
- 変更時のオートセーブ
- 共有URL生成
- 設定ファイルのインポート／エクスポート
- 戦闘リプレイログ出力
- ターン別ダメージグラフ
- 最大ターンダメージ・DPT・行動数分析
- GitHub ActionsによるJSON検証
- ブラウザテストページ

## 起動方法

### Live Server

1. VS Codeでフォルダーを開く
2. `index.html`をLive Serverで起動

### Python

```bash
python -m http.server 8000
```

ブラウザーで `http://localhost:8000` を開きます。

## GitHub Pages

1. GitHubへリポジトリをpush
2. Settings → Pages
3. Deploy from a branchを選択
4. `main` / `/root`を選択

## ディレクトリ

```text
data/               ゲームデータと計算ルール
src/database/       読込・検証・保存
src/engine/         編成・ターン・ダメージ・戦闘・分析
src/ui/             画面制御
tests/              ブラウザテスト
docs/               ロードマップ
.github/workflows/  自動検証
```

## テスト

Live Serverで以下を開きます。

```text
tests/optimizer.test.html
tests/turn-optimizer.test.html
tests/database-validator.test.html
tests/damage-engine.test.html
tests/battle-engine.test.html
tests/state-manager.test.html
tests/battle-analytics.test.html
```

## 注意

現在のキャラクター、敵、技、内部数値には検証用ダミーデータが含まれます。
実ゲームの厳密な計算式との一致は保証していません。


## CSV一括取込

キャラクター選択画面の「CSV雛形」からテンプレートを取得できます。

必須列：

```text
id,name,weapon,element,role
```

推奨列：

```text
series,rarity,level,patk,eatk,speed,maxSp,baseScore,icon,dataStatus,dataNote
```

`id`が既存キャラクターと一致した場合は更新され、一致しない場合は追加されます。

## GitHub運用

このリポジトリには次のGitHub向け設定が含まれています。

- Pull RequestごとのJSON・JavaScript検証
- `main`ブランチからGitHub Pagesへ自動公開
- `v*`タグ作成時のRelease ZIP自動生成
- Issueテンプレート
- Pull Requestテンプレート
- DependabotによるGitHub Actions更新確認

セットアップ手順は [`docs/GITHUB_SETUP.md`](docs/GITHUB_SETUP.md) を参照してください。


## v1.3 装備システム

キャラクターごとに武器、防具、アクセサリー2枠を設定できます。装備データは `data/equipment/equipment.json` で管理し、補正値はダメージ計算へ反映されます。初期装備の数値は検証用の暫定値です。

## v1.4 データカタログ

- キャラクターとアビリティの登録状況を画面上で集計
- 名前、ID、タグ、技名を横断検索
- 技分類と技登録有無で絞り込み
- キャラクターCSVとアビリティCSVを個別に一括取込
- `verified` / `provisional` / `simulator` / `incomplete` で品質管理

実ゲームデータは、出典と確認日を記録しながら段階的に `verified` へ移行します。

## v1.5 全旅人カタログとベースランク

- 登録キャラクター数: **273**
- キャラクターカードにベースランクを表示
- ★5・★4・★3で絞り込み可能
- 新規登録分は名前・ジョブ・ランクを優先し、未確認の数値や技は `incomplete` としています。
