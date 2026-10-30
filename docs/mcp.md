# MCP サーバー

BookKeeper の MCP サーバーを実装しながら学んだことを、実装の順に残しておく。

## 学んだこと

### MCP の全体像

MCP（Model Context Protocol）は、AI のアプリが外部のツールやデータを使うための決まり。

登場人物は次の 4 者。

| 登場人物 | 例 | 役割 |
|---|---|---|
| ホスト | Claude Code・Claude Desktop・MCP Inspector | AI を使うアプリ。LLM の決定を受けて、MCP クライアントにツールを実行させ、結果を LLM に渡す |
| LLM | Claude | ツールの一覧を見て、どのツールを・どんな引数で呼ぶかを決める |
| MCP クライアント | ホストの中の部品 | MCP サーバーと通信する |
| MCP サーバー | 今回作るもの | ツールを持ち、呼ばれたら実行して結果を返す。ホストが起動する別のプロセスで動く |

- **LLM は、サーバーのコードを見ていない。** 見ているのは、ツールの名前・説明文・引数の形だけ。それをもとに、どのツールをいつ呼ぶかを決める。そのため、説明文の書き方が設計の中心になる
- MCP サーバーが提供できるものは 3 種類ある。今回使うのは tools
  - tools：AI が呼べる関数
  - resources：AI が読めるデータ
  - prompts：決まった依頼の文面
- つなぎ方は 2 種類ある。今回は stdio を使う
  - stdio：ホストがサーバーを子プロセスとして起動し、標準入出力でやりとりする。自分の PC で使うサーバーでは、こちらが一般的
  - HTTP（Streamable HTTP）：サーバーが Web サーバーとして待ち受け、ホストが URL に接続する

### 通信の流れ

HTTP ではなく標準入出力で、**JSON-RPC** の形でやりとりする。JSON-RPC では、呼ぶ名前（`method`）・引数（`params`）・番号（`id`）を送ると、同じ `id` の付いた結果が返ってくる。1 回送ると 1 回返ってくる点は、HTTP のリクエストとレスポンスに似ている。

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "ping", "arguments": {}}}
```

MCP Inspector で `ping` を呼んで、次の流れを確かめた。

1. **initialize**：つないだ直後に一度だけ行う、お互いの自己紹介
   - クライアントが希望するプロトコルの版を伝え、サーバーが自分も話せる版を答える。版は `2025-06-18` のような日付の形
   - サーバーは、自分の情報（`serverInfo`。`MCPServer("BookKeeper")` で付けた名前が入る）と、できること（`capabilities`）を伝える
   - `capabilities` に `tools` があるので、クライアントは `tools/list` を呼ぶ。できることを最初に宣言しておくので、持っていない機能を問い合わせる無駄がない
2. **tools/list**：ツールの一覧を受け取る。ツールごとに次の項目がある
   - `name`：名前
   - `description`：説明文
   - `inputSchema`：引数の形（JSON Schema）。引数がないツールでも省略されず、`{"type": "object", "properties": {}}` になる。引数は、いつもオブジェクト（名前と値の組）で渡す決まりのため
   - `outputSchema`：戻り値の形（JSON Schema）
3. **tools/call**：ツールを呼び、結果を受け取る。結果（`result`）には次の項目がある
   - `content`：AI が**読む**ための結果。部品（コンテンツブロック）のリストで、`type` で種類（`text`・`image`・`audio` など）を区別する。`ping` の `"pong"` は `content[0].text` にあった
   - `structuredContent`：プログラムが**扱う**ための結果。`outputSchema` に合った JSON。`ping` では `{"result": "pong"}`
   - `isError`：エラーかどうか

`structuredContent` は、JSON Schema の決まりでオブジェクトでなければならない。そのため、文字列や整数を返すツールでは、SDK が `{"result": ...}` と包む。

### 関数がツールになるしくみ

Python の SDK では、関数に `@server.tool()` を付けるだけでツールになる。登録のとき、SDK は次のことをする。

1. Python の `inspect` で、関数の定義（関数名・引数の名前と型ヒント・既定値・docstring・戻り値の型ヒント）を読む
2. 引数から Pydantic のモデル（例：`addArguments`）を、その場で作る
3. そのモデルを JSON Schema に変換して `inputSchema` にする。戻り値の型ヒントからは、同じようにして `outputSchema` を作る

```python
@server.tool()
def add(a: int, b: int = 0) -> int:
    """2つの整数を足す"""
    return a + b
```

| 関数のどこから | ツールのどこへ |
|---|---|
| 関数名 `add` | `name` |
| docstring | `description` |
| 引数の型ヒント `a: int`・`b: int = 0` | `inputSchema` の `properties` |
| 既定値の有無 | `inputSchema` の `required`。既定値のない `a` だけが必須になる |
| 戻り値の型ヒント `-> int` | `outputSchema` |

- **説明文になるのは docstring だけ。** `#` のコメントは Python が実行するときに捨てるので、SDK にも AI にも届かない
- 呼び出されたときは、作ったモデルで引数を検証してから関数を実行する。`a` に `"x"` を渡すと、関数は実行されず、`Input should be a valid integer` というエラーが返った
- これは FastAPI と同じ考え方。FastAPI は、型ヒントからリクエストの検証と API の説明書（OpenAPI）を作る。MCP の SDK は、型ヒントから引数の検証とツールの説明書（AI 向け）を作る

### SDK の版の注意

Python の SDK（`mcp` パッケージ）は、2.x で大きく変わった。ネットの記事の多くは 1.x を前提にしているので、参考にするときは版に気をつける。

| 1.x | 2.x |
|---|---|
| `from mcp.server.fastmcp import FastMCP` | `from mcp.server.mcpserver import MCPServer` |
| 結果の `isError`・`structuredContent` | 結果の `is_error`・`structured_content`（Python の属性名がスネークケースになった。JSON の上では今までどおり `isError`） |

### stdio と標準出力

プログラムには、最初から 3 本の通り道がある。`print` は、何も指定しなければ標準出力に書く。

| 通り道 | 番号 | 向き | 主に使うもの |
|---|---|---|---|
| 標準入力（stdin） | 0 | 外 → プログラム | `input()` |
| 標準出力（stdout） | 1 | プログラム → 外 | `print()` |
| 標準エラー出力（stderr） | 2 | プログラム → 外 | エラーメッセージ、`logging`（既定の設定） |

stdio の MCP サーバーでは、標準入力と標準出力が、ホストとの会話（JSON-RPC）専用の通り道になる。標準エラー出力は会話に使わないので、ログを書いてよい。

```
ホスト ──（JSON-RPC の要求）──→ 0：標準入力 ─→ サーバー
ホスト ←─（JSON-RPC の応答）── 1：標準出力 ←─ サーバー
画面やログ ←───────────────── 2：標準エラー出力 ←─ サーバー
```

`print` を 2 か所に入れて、何が起きるかを確かめた。

| `print` の場所 | 起きたこと |
|---|---|
| ツールの中 | 標準エラー出力に出た。通信には影響しない。SDK 2.x は、`server.run()` の間、標準出力に書かれたものを標準エラー出力へ逃がしている |
| `server.run()` の前 | 通信路（標準出力）に混ざった。Python の SDK のクライアントは「JSON として読めない」というエラーを記録して、その行を捨て、通信を続けた |

- 今回はクライアントが寛容だったが、クライアントによってはつながらなくなりうる。しかも原因が見えにくい
- そのため、MCP サーバーでログを出すときは、`print` ではなく `logging`（標準エラー出力に書く）を使う

### ホストの許可

Claude Code では、許可が 2 段階ある。

| 段階 | 何を許可するか | 記録される場所 |
|---|---|---|
| サーバーの許可 | `.mcp.json` のサーバーを起動してよいか。clone したリポジトリの `.mcp.json` で、勝手にコマンドが実行されないようにするため | `.claude/settings.local.json` の `enabledMcpjsonServers`（個人の設定なので git に入れない） |
| ツールの許可 | このツールを、この引数で呼んでよいか | 権限のモードと、許可のルールで決まる |

- Claude Code は、ツールを `mcp__<設定の名前>__<ツールの名前>` という名前で扱う（例：`mcp__bookkeeper__ping`）。この名前は、許可のルールにも使う
- 「つながっているか確かめて」と頼むと、`ping` という名前を出さなくても、Claude は `ping` を選んだ。説明文を読んで判断している

## 実装の記録

### ステップ 1：最小の MCP サーバー

- [backend/app/mcp_server.py](../backend/app/mcp_server.py) に、`"pong"` を返すだけの `ping` ツールを持つサーバーを作った
- MCP Inspector で動きを確かめた。Inspector も、ホストと同じようにサーバーを子プロセスとして起動する

```sh
npx @modelcontextprotocol/inspector@2.11.0 uv --directory backend run python -m app.mcp_server
```

- Inspector は、つないだときに起動したサーバーのプロセスを使い続ける。コードを変えたら、つなぎ直す（Disconnect → Connect）と反映される

### ステップ 2：Claude Code につなぐ

- stdio のサーバーを、backend のコンテナの中で起動する。Claude Code は `docker compose exec` を起動し、docker が標準入出力をコンテナの中のプロセスに中継する

```
Claude Code（ホスト）
   │ 起動：docker compose exec -T backend uv run python -m app.mcp_server
   ↓
docker（ホストの PC で動く）── 標準入出力を、そのまま中継する ──┐
                                                                  ↓
                                    backend のコンテナ：python -m app.mcp_server
```

- コマンドの `backend` は、`docker-compose.yml` のサービスの名前（フォルダの `backend/` ではない）。`exec` は動いているコンテナを使うので、先に BookKeeper を起動しておく必要がある
- `-T` は、疑似端末（TTY）を割り当てない指定。端末を割り当てると、改行の変換などが JSON のやりとりを乱すおそれがある。今回は `-T` がなくても動いたが、確実にするために付ける
- 次のコマンドで登録した。`--scope project` を付けると、設定がリポジトリの [.mcp.json](../.mcp.json) に保存され、clone した人も同じ設定を使える

```sh
claude mcp add --scope project bookkeeper -- docker compose exec -T backend uv run python -m app.mcp_server
```

- Windows の PowerShell では、`--` を `'--'` と引用符で囲む。`claude` は `claude.ps1`（PowerShell のスクリプト）として起動し、PowerShell はスクリプトに `--` を渡さずに取り除く。`--` が消えると、`claude` が `-T` を自分のオプションと取り違えて `error: unknown option '-T'` になる
- 設定の名前（`bookkeeper`）と、サーバーが名乗る名前（`MCPServer("BookKeeper")`）は別のもの。設定の名前はツールの名前（`mcp__bookkeeper__ping`）に使われるので、ほかのサーバーにならって小文字にした
- Python の SDK のクライアントから同じコマンドで起動すると、docker が compose のプラグインを見つけられずに失敗した。SDK は安全のために、子プロセスに渡す環境変数を最小限に絞るため。Claude Code では起きなかったので、Claude Code は環境変数をそのまま渡していると考えられる
