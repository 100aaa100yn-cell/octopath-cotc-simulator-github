# GitHub Setup

## 1. リポジトリ作成

GitHubで新しいリポジトリを作成します。

推奨名：

```text
octopath-cotc-strategy-simulator
```

README、.gitignore、LicenseはGitHub側で追加せず、このプロジェクトの内容をそのまま使用します。

## 2. 初回アップロード

このフォルダーで次を実行します。

```bash
git init
git add .
git commit -m "Initial GitHub release v1.2.0"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/octopath-cotc-strategy-simulator.git
git push -u origin main
```

## 3. GitHub Pages

GitHubリポジトリで以下を開きます。

```text
Settings → Pages → Source → GitHub Actions
```

`main`へpushすると自動公開されます。

## 4. developブランチ

```bash
git checkout -b develop
git push -u origin develop
```

## 5. 最初のリリース

```bash
git checkout main
git tag v1.2.0
git push origin v1.2.0
```

GitHub ActionsがRelease用ZIPを自動生成します。

## 6. 推奨ラベル

- bug
- enhancement
- data
- documentation
- good first issue
- help wanted
