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

### DB のセッション

セッションは、DB とやりとりするための窓口。読むときも書くときも、DB とのやりとりは必ずセッションを通す。

```python
with SessionLocal() as session:      # 窓口を開く
    session.add(Book(title="..."))    # 「この本を登録したい」と伝える
    session.commit()                  # 確定する。ここで初めて DB に書かれる
                                      # with を抜けると、窓口が閉じる
```

- `SessionLocal` は窓口を作る機械で、`SessionLocal()` と呼ぶたびに新しい窓口が 1 つできる
- ツールでは、`with SessionLocal() as session:` を**関数の中**に書く。ツールが呼ばれるたびに窓口を開き、終わったら閉じる
- `with` を関数の外（モジュールの最上位）に書くと、`mcp_server.py` を読み込んだときに 1 回だけ実行され、すぐ閉じてしまう。関数の引数に `session` を書くと、AI から「`session` という文字列を渡す必要があるツール」に見えてしまう。実際に `inputSchema` に `{"session": {"type": "string"}}` が現れ、引数なしで呼ぶとエラーになった

### docstring の位置

docstring になるのは、関数の本体の**最初に書いた文字列**だけ。

```python
@server.tool()
def list_tsundoku() -> list[TsundokuResponse]:
    with SessionLocal() as session:
        """積読の本を…"""   # ← with の中に入ると、ただの「何もしない文字列」になる
        return ...
```

この書き方では、AI に見える説明文が空になった。結果を確かめるテストは通ってしまうので、全部のツールに説明文があることを確かめるテストを足した。

### 説明文の書き方

説明文は、自然な日本語で、**定義をはっきり**書く。AI は、このアプリでの言葉の意味（たとえば「積読」）を知らない。

- 何が入り、何が入らないか（読書中の本は？ 手放した本は？）
- 並び順
- 結果の項目の意味。項目に触れるときは、結果に出てくる名前（`first_purchased_on` など）を使う。DB の列名は AI に見えないので使わない

説明文の誤りは、そのまま AI の誤った答えになる。最初の版では `first_purchase_amount` を「最初に購入した冊数」と書いていた。このままだと、AI が「1980 冊買った」と答えかねなかった。

### 戻り値の形（outputSchema）

`list[TsundokuResponse]` を返すツールの `outputSchema` は、次の形になった。

```json
{
  "$defs": {
    "BookSummaryResponse": { "description": "一覧や明細に添える本の情報。…", ... },
    "TsundokuResponse": {
      "properties": { "book": { "$ref": "#/$defs/BookSummaryResponse" }, ... }
    }
  },
  "properties": {
    "result": { "type": "array", "items": { "$ref": "#/$defs/TsundokuResponse" } }
  }
}
```

- `$defs` に Pydantic のモデルごとの形をまとめ、`$ref` で参照する。同じ形を何度も書かないための JSON Schema のしくみ
- リストを返すツールでも、`{"result": ...}` に包まれ、その中が配列になる
- **Pydantic のモデルの docstring も、AI に届く。** `BookSummaryResponse` の「本の詳細画面へのリンクと表示に使う」は、画面を作る開発者向けの説明で、AI には関係がない。一方、項目に付けた `#` のコメントは届かない
- `content` には、同じ結果が JSON の文字列として入る。API の応答と同じ形になるのは、同じサービスの関数と同じモデルを使っているため
- MCP Inspector の一覧では、説明文の 1 行目しか見えなかった。SDK のクライアントで確かめると、全文が `description` に入っていた（改行は `\n`）

ツールの結果は、同じ中身を 2 つの形で返す。

| 欄 | 形 | 誰のためか |
|---|---|---|
| `content` | 文字列（テキスト） | AI が読む |
| `structuredContent` | JSON のオブジェクト | プログラムが使う。形は `outputSchema` で約束されている |

- `structuredContent` は、必ず JSON のオブジェクト（`{...}`）でなければならない。そのため、文字列やリストを返すツールは、SDK が `{"result": ...}` に包む
- Pydantic のモデルを返すツールは、JSON にした時点でオブジェクトなので包まれない。`search_books` の `BookSearchResult` は `{"total": ..., "books": [...]}` のまま返り、`outputSchema` でも `properties` のすぐ下に `total` と `books` が並んだ。最初は `{"result": {...}}` になると予想していたが、包むのは決まりを満たさない値をオブジェクトに変えるためだけだった
- テストは `structured_content` を辞書どうしで比べる。`content` の文字列で比べると、空白や項目の順番の違いで不一致になる

### 引数の説明と制約

引数ごとの説明と制約は、型ヒントに `Annotated` と `Field` で付ける。ツール全体の説明は docstring に書く。

```python
limit: Annotated[int, Field(ge=1, le=100, description="返す本の最大件数")] = 20
```

`inputSchema` は JSON Schema という共通の書き方なので、Pydantic の名前が置き換わる。

| Python（Pydantic） | `inputSchema`（JSON Schema） |
|---|---|
| `ge=1`・`le=100` | `"minimum": 1`・`"maximum": 100` |
| 既定値 `= 20` | `"default": 20` |
| `description="..."` | `"description": "..."` |
| `str \| None` | `"anyOf": [{"type": "string"}, {"type": "null"}]` |
| `Literal["unread", "reading", "finished"]` | `"enum": [...]` |

- Python には `str?` という書き方はない。`None` もありうることは `str | None` で書く。`str?` と書くと、`?` の所で読み取りが止まり、エディタには「かっこが閉じていない」と表示された
- 制約は 3 か所で効く。AI は `inputSchema` を読んで範囲内の値を選ぶ。Inspector も `maximum` を読んで、101 を入力させなかった。それでも範囲外の値が届いたら、SDK が関数を実行する前にエラーを返す。クライアントが制約を守るとは限らないので、サーバーの確認は省けない
- `enum` で選べる値は伝わるが、どれが何を意味するかは伝わらない。`statuses` に「finished=読了」と説明を付けたので、「読了した本を探して」と頼むと、Claude は `statuses: ["finished"]` で呼んだ

### AI に見えるもの

AI が知ることができるのは、サーバーが送ったメッセージの中身と、自分が渡した引数だけ。

| 時点 | メッセージ | 中身 |
|---|---|---|
| 呼ぶ前 | `tools/list` の応答 | ツールの名前、説明文、`inputSchema`、`outputSchema`（モデルの docstring と `Field` の説明を含む） |
| 呼んだあと | `tools/call` の応答 | `content`（ホストによっては `structuredContent` も） |

- Python のコード、`#` のコメント、サービスの関数の docstring、結果に入れなかった DB の中身は届かない
- 説明文には、AI が見える値で条件を書く。`limit` で切ったあとの結果しか届かないので、「結果が limit より多い場合」は AI には判断できない。「`total` が `books` の件数より多い場合」と書いた。`limit` と件数が同じでも、ちょうどその数だけ当てはまったのかもしれないので、残りがあるかは `total` でしかわからない
- 確かめ方は 2 つ。Inspector で、サーバーが何を送ったかを見る。Claude Code で実際に頼んで、AI がどう受け取り、どう使ったかを見る
- `inputSchema` はファイルには書かれていない。サーバーが動いている間に SDK が型ヒントから作り、`tools/list` の応答に載せる

### テストの書き方

- SDK のクライアントは非同期で動くので、テストも `async def` で書き、`@pytest.mark.anyio` を付ける。anyio は SDK と一緒に入る
- `Client(mcp_server.server)` で、サーバーを子プロセスで起動せずに、同じプロセスの中でつなぐ。`initialize` → `tools/list` → `tools/call` のやりとりは本物と同じ
- フィクスチャは、テスト関数の引数に名前を書くだけで、pytest が準備して渡す
- `client.call_tool(名前, 引数)`・`result.structured_content`・`result.is_error` などの名前は、MCP の通信の項目（`tools/call`・`structuredContent`・`isError`）をスネークケースにしたもの
- `call_tool` の 2 つめは、ツールに渡す引数（辞書）。引数のないツールには `{}` を渡す
- テストでは、`mcp_server.SessionLocal` を一時 DB 向けのものに差し替える。`from app.database import SessionLocal` は、`SessionLocal` という名前を `mcp_server` のモジュールにコピーするので、`mcp_server` の中の名前だけを付け替えればよい。`monkeypatch.setattr` は、差し替える名前が見つからないとエラーにするので、書き方を間違えても黙って本物の DB を使うことはない
- ひな形の `...` は、書きかけの印ではなく `Ellipsis` という本物の値。埋め忘れると、DB に書き込む時点で `type 'ellipsis' is not supported` になる
- ループの中の `assert` は、ループが 0 回だと何も確かめずに通る。`if` で対象を探す書き方も同じ。ループの前に、対象があることを `assert` で確かめる
- MCP のテストで確かめるのは、ツールがサービスに正しくつながり、結果が正しい形で届くか。積読の決まり（どの本が入るか、並び順）は API のテストが同じサービスを通して確かめているので、MCP のテストでは繰り返さない
- `call_tool` は `call_tool(ツールの名前, 引数の辞書)` の形で呼ぶ。`call_tool("limit", 101)` と書くと、「`limit` というツールを引数 `101` で呼ぶ」意味になる
- エラーのテストは、`is_error` だけでなく、エラーの理由まで確かめる。`is_error` だけだと、ツールの名前を間違えたときの「そんなツールはない」というエラーでも通ってしまう。`limit` に 101 を渡すテストでは、`result.content[0].text` に `less than or equal to 100` が含まれることも確かめた
- テストのデータは、確かめることに関係するものだけ入れる。検索は購入記録を見ないので、検索のテストに `Purchase` は入れない。入れると、読む人が「購入記録が検索に関係するのか」と迷う

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

### ステップ 3：積読の一覧のツール

- 積読を取り出す処理は、API のルーターに直接書かれていた。これを [backend/app/services/tsundoku.py](../backend/app/services/tsundoku.py) の `list_tsundoku(session)` に切り出し、API のルーターと MCP のツールの両方から呼ぶようにした
  - ルーターの関数に `@server.tool()` を付けない理由：引数の `session`（FastAPI が渡す DB のセッション）が AI に見えてしまう。ルーターの docstring は開発者向けで、AI 向けの説明文とは書く内容が違う。Web API と MCP が互いに縛り合う
  - 切り出したあとも、積読の API のテストはそのまま通った。API の動きは変わっていない
- `list_tsundoku` のツールを作った。引数はなく、戻り値は API と同じ `list[TsundokuResponse]`
- [backend/tests/test_mcp_server.py](../backend/tests/test_mcp_server.py) にテストを書いた。本がないときの空のリスト、積読の本が 1 冊あるときの結果、全部のツールに説明文があること

### ステップ 4-1：本の検索のツール

- 画面の検索は、ブラウザの中で全件から絞り込んでいる。MCP では AI が全件を受け取らずに済むよう、サーバーで絞り込む処理を [backend/app/services/books.py](../backend/app/services/books.py) の `search_books` に新しく作った。一致のルール（全角と半角・大文字と小文字を区別しない、空白で区切った語をすべて含む）は画面と同じにした
- 結果は軽い形（id・書名・著者・読書状態・手放した日）にした。詳しい情報は、id を使って本の詳細のツール（4-2）で取る
- 件数に上限（`limit`、既定値 20、1〜100）を設け、当てはまった本の数 `total` を一緒に返す。AI は `total` と `books` の件数を比べて、残りがあることに気づける
- `search_books` のツールを作った。引数は `keyword`・`statuses`・`limit`。説明文には、`total` が `books` の件数より多いときは、残りがあることを伝え、キーワードで絞るか尋ねるように書いた
- テストは、キーワードがサービスまで届くことと、`limit` に 101 を渡すとエラーになることを確かめた。検索のルールそのものは [backend/tests/test_search_books.py](../backend/tests/test_search_books.py) で確かめている
- Claude Code で「本を 2 冊だけ見せて」と頼むと、`limit: 2` で呼び、残りがあることと、キーワードで絞るかを伝えてきた。説明文のとおりに動いた
