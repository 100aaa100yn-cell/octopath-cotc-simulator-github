# Contributing

このプロジェクトへの改善提案・データ修正・不具合報告を歓迎します。

## 開発環境

静的Webアプリのため、次のいずれかで起動できます。

```bash
python -m http.server 8000
```

または VS Code の Live Server を利用してください。

ブラウザで以下を開きます。

```text
http://localhost:8000
```

## ブランチ

- `main`: 安定版
- `develop`: 次期リリース向け統合
- `feature/*`: 機能追加
- `fix/*`: 不具合修正
- `data/*`: キャラクター・アビリティ・敵データ更新

## Pull Request

Pull Requestには次を含めてください。

- 変更内容
- 変更理由
- 動作確認手順
- UI変更時のスクリーンショット
- データ変更時の出典と検証状態

## データ品質

キャラクターやアビリティには `dataStatus` を設定します。

- `verified`: 検証済み
- `provisional`: 暫定
- `simulator`: シミュレーター検証用
- `incomplete`: 未入力

実ゲーム由来の数値を追加する場合は、出典と確認日をPull Requestに記載してください。
